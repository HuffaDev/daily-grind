import type { Session } from "@/platform/server/session";
import { getStore, LockTimeoutError } from "@/platform/server/store";
import { botRequest, DiscordApiError, getActivityInstance } from "./discord";
import { playingMessage } from "./messages";

// When the bot launches the Activity, Discord posts nothing in the channel, so
// the bot keeps its own card there saying who's playing. The Activity reports
// in when it opens, when someone joins or leaves, every minute while open, and
// as it closes (see src/platform/presence.ts). Each report asks Discord who's
// actually in the Activity and edits the card to match: players who left move
// to "were playing". Once an hour passes with no one playing, the next player
// gets a fresh card, and the old one is deleted.

/** How long a card is reused after its last activity. */
export const CARD_WINDOW_MS = 60 * 60 * 1000;
/** Reports this soon after another for the same Activity reuse its player list instead of asking Discord again. */
const RECHECK_MS = 5_000;

/** Discord's error codes for a message that has since been deleted, and an Activity that has ended. */
const UNKNOWN_MESSAGE = 10008;
const NOT_FOUND = 404;

export interface Player {
  userId: string;
  name: string;
  /** When they were last known to be in the Activity. */
  lastSeenAt: number;
}

/** A channel's current card, saved between reports. */
export interface PlayingCard {
  /** Null until the card has been posted. */
  messageId: string | null;
  updatedAt: number;
  /** Most recent first, one entry per player. */
  players: Player[];
  /** Who Discord last said is in each of the channel's Activity instances, and when. */
  instances: Record<string, { users: string[]; checkedAt: number }>;
  /** The message as last posted, to skip edits that change nothing. */
  shown?: string;
}

export interface PresenceUpdate {
  instanceId: string;
  /** Who's in the instance, per Discord; null once it has ended. */
  users: string[] | null;
  reporter: { userId: string; name: string };
  /** The reporter is closing the Activity (Discord may still list them for a moment). */
  leaving: boolean;
}

// Saved with the store's per-game records under a bot-only id, keyed by channel.
const STORE_ID = "bot";
const STORE_KEY = "playing-card";

/**
 * A card as saved, brought up to date: cards saved before the bot tracked
 * Activity instances have no `instances`, and their players a `launchedAt`
 * instead of `lastSeenAt`.
 */
export function upgradeCard(saved: PlayingCard | null): PlayingCard | null {
  if (!saved) return null;
  type OldPlayer = Omit<Player, "lastSeenAt"> & { lastSeenAt?: number; launchedAt?: number };
  return {
    ...saved,
    instances: saved.instances ?? {},
    players: (saved.players as OldPlayer[]).map(({ launchedAt, ...p }) => ({
      ...p,
      lastSeenAt: p.lastSeenAt ?? launchedAt ?? saved.updatedAt,
    })),
  };
}

/** Everyone currently in one of the channel's Activity instances. */
export function playingNow(card: PlayingCard): Set<string> {
  return new Set(Object.values(card.instances).flatMap((i) => i.users));
}

/**
 * The channel's card after a presence report, or null when there's nothing to
 * show: someone leaving with no card from the last hour, say.
 */
export function applyPresence(card: PlayingCard | null, update: PresenceUpdate, now: number): PlayingCard | null {
  const { instanceId, reporter, leaving } = update;
  const users = (update.users ?? []).filter((id) => !(leaving && id === reporter.userId));
  if (!card || now - card.updatedAt >= CARD_WINDOW_MS) {
    if (!users.includes(reporter.userId)) return null;
    card = { messageId: null, updatedAt: now, players: [], instances: {} };
  }
  const next: PlayingCard = { ...card, updatedAt: now, instances: { ...card.instances } };
  if (users.length) next.instances[instanceId] = { users, checkedAt: now };
  else delete next.instances[instanceId];

  // Newcomers go on top; anyone already listed keeps their place, with their current name.
  const known = card.players.some((p) => p.userId === reporter.userId);
  const players = card.players.map((p) => (p.userId === reporter.userId ? { ...p, name: reporter.name } : p));
  if (!known && users.includes(reporter.userId)) players.unshift({ ...reporter, lastSeenAt: now });
  const playing = playingNow(next);
  next.players = players.map((p) => (playing.has(p.userId) ? { ...p, lastSeenAt: now } : p));
  return next;
}

/**
 * Handles one report from the Activity: works out who's in it with Discord,
 * then posts or edits the channel's card. Only in servers; the bot can't post
 * in DMs. Best effort — a Discord failure is logged and ignored.
 */
export async function reportPresence(session: Session, channelId: string, instanceId: string, leaving: boolean) {
  const guildId = session.scope.startsWith("guild:") ? session.scope.slice("guild:".length) : null;
  if (!guildId) return;
  const store = getStore();
  try {
    // Locked per channel, so reports landing together don't both post a card.
    await store.withGameLock(STORE_ID, STORE_KEY, channelId, async () => {
      const saved = upgradeCard(await store.getGame<PlayingCard>(STORE_ID, STORE_KEY, channelId));
      const snapshot = saved?.instances[instanceId];
      let users: string[] | null;
      if (!leaving && snapshot && Date.now() - snapshot.checkedAt < RECHECK_MS && snapshot.users.includes(session.userId)) {
        users = snapshot.users;
      } else {
        try {
          const instance = await getActivityInstance(instanceId);
          // Reports name their channel; trust it only if Discord agrees.
          if (instance.location?.channel_id !== channelId || instance.location.guild_id !== guildId) return;
          users = instance.users ?? [];
        } catch (err) {
          if (!(err instanceof DiscordApiError && err.status === NOT_FOUND)) throw err;
          // Ended: only meaningful for an instance the card already tracks.
          if (!snapshot) return;
          users = null;
        }
      }
      const reporter = { userId: session.userId, name: session.name };
      const card = applyPresence(saved, { instanceId, users, reporter, leaving }, Date.now());
      if (!card) return;
      const message = JSON.stringify(playingMessage(card.players, playingNow(card)));
      if (message !== card.shown || !card.messageId) {
        card.messageId = await postOrEdit(channelId, card.messageId, message);
        card.shown = message;
      }
      await store.saveGame(STORE_ID, STORE_KEY, channelId, card);
      // A new card replaces the last one, so the channel only ever shows one.
      if (saved?.messageId && saved.messageId !== card.messageId) await deleteMessage(channelId, saved.messageId);
    });
  } catch (err) {
    if (!(err instanceof DiscordApiError || err instanceof LockTimeoutError)) throw err;
    console.warn(`Couldn't update the playing card in channel ${channelId}:`, err.message);
  }
}

/** Deletes one of the bot's messages; one already gone is fine. */
async function deleteMessage(channelId: string, messageId: string) {
  try {
    await botRequest(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof DiscordApiError && err.code === UNKNOWN_MESSAGE)) throw err;
  }
}

/** Edits the card, or posts it if it isn't there yet (or someone deleted it); returns its message id. */
async function postOrEdit(channelId: string, messageId: string | null, body: string): Promise<string> {
  if (messageId) {
    try {
      await botRequest(`/channels/${channelId}/messages/${messageId}`, { method: "PATCH", body });
      return messageId;
    } catch (err) {
      if (!(err instanceof DiscordApiError && err.code === UNKNOWN_MESSAGE)) throw err;
    }
  }
  return (await botRequest<{ id: string }>(`/channels/${channelId}/messages`, { method: "POST", body })).id;
}
