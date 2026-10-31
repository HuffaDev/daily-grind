import { getStore, LockTimeoutError } from "@/platform/server/store";
import { botRequest, DiscordApiError, Interaction } from "./discord";
import { playingMessage } from "./messages";

// When the bot launches the Activity, Discord posts nothing in the channel, so
// the bot posts its own card listing who's joined. Later launches edit that
// card instead of posting another, until an hour passes with no one joining;
// the next launch after that starts a fresh card.

/** How long a card keeps taking players after the last launch. */
export const CARD_WINDOW_MS = 60 * 60 * 1000;

/** Discord's error code for editing a message that has since been deleted. */
const UNKNOWN_MESSAGE = 10008;

export interface Player {
  userId: string;
  name: string;
  launchedAt: number;
}

/** A channel's current card, saved between launches. */
export interface PlayingCard {
  /** Null until the card has been posted. */
  messageId: string | null;
  updatedAt: number;
  /** Most recent launch first, one entry per player. */
  players: Player[];
}

// Saved with the store's per-game records under a bot-only id, keyed by channel.
const STORE_ID = "bot";
const STORE_KEY = "playing-card";

/** Who launched, as the server knows them: nickname, then display name, then username. */
export function launcher(interaction: Interaction, now: number): Player | null {
  const user = interaction.member?.user ?? interaction.user;
  if (!user) return null;
  return { userId: user.id, name: interaction.member?.nick || user.global_name || user.username, launchedAt: now };
}

/** The channel's card after `player` launches: the current card with them moved to the top, or a new one. */
export function withLaunch(card: PlayingCard | null, player: Player): PlayingCard {
  if (!card || player.launchedAt - card.updatedAt >= CARD_WINDOW_MS) {
    return { messageId: null, updatedAt: player.launchedAt, players: [player] };
  }
  return {
    messageId: card.messageId,
    updatedAt: player.launchedAt,
    players: [player, ...card.players.filter((p) => p.userId !== player.userId)],
  };
}

/**
 * Run after answering a launch: adds the player to the channel's card, posting
 * a new card if there's none from the last hour. Best effort — a failure (e.g.
 * the bot can't post in that channel) is logged and ignored.
 */
export async function announceLaunch(interaction: Interaction): Promise<void> {
  const channelId = interaction.channel_id;
  const player = launcher(interaction, Date.now());
  if (!interaction.guild_id || !channelId || !player) return;
  const store = getStore();
  try {
    // Locked per channel, so two people launching at once don't both post a card.
    await store.withGameLock(STORE_ID, STORE_KEY, channelId, async () => {
      const card = withLaunch(await store.getGame<PlayingCard>(STORE_ID, STORE_KEY, channelId), player);
      const body = JSON.stringify(playingMessage(card.players));
      if (card.messageId) {
        try {
          await botRequest(`/channels/${channelId}/messages/${card.messageId}`, { method: "PATCH", body });
        } catch (err) {
          // Someone deleted the card; post it again.
          if (!(err instanceof DiscordApiError && err.code === UNKNOWN_MESSAGE)) throw err;
          card.messageId = null;
        }
      }
      if (!card.messageId) {
        card.messageId = (await botRequest<{ id: string }>(`/channels/${channelId}/messages`, { method: "POST", body })).id;
      }
      await store.saveGame(STORE_ID, STORE_KEY, channelId, card);
    });
  } catch (err) {
    if (!(err instanceof DiscordApiError || err instanceof LockTimeoutError)) throw err;
    console.warn(`Couldn't update the playing card in channel ${channelId}:`, err.message);
  }
}
