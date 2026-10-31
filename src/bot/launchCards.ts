import { botRequest, DiscordApiError } from "./discord";

// Each time someone opens the Activity, Discord posts a launch card ("Game
// Invitation · N Playing · Join") in the channel. Leaving and coming back
// posts another, so a busy channel fills with them. Discord's API can't edit
// those cards, but they're the app's own messages, so after each launch the
// bot deletes its earlier cards from the last hour: the channel keeps one,
// the newest, which shows who's playing live.

/** Older cards than this are left alone, as a record of earlier sessions. */
export const RECENT_MS = 60 * 60 * 1000;
/** How long to wait for Discord to post the new card before giving up, and how often to look. */
const WAIT_FOR_CARD_MS = 9_000;
const POLL_MS = 1_500;

/** The fields of a channel message this needs. */
export interface ChannelMessage {
  id: string;
  author: { id: string };
  content: string;
  embeds: unknown[];
  /** Set on messages that answer an interaction, such as a launch. */
  interaction_metadata?: unknown;
}

/** Discord ids are snowflakes: their top bits are the creation time. */
function snowflakeTime(id: string): number {
  return Number(BigInt(id) >> BigInt(22)) + 1420070400000;
}

/**
 * Whether a message is one of the app's launch cards: posted by the app in
 * answer to an interaction, with no text or embeds of its own (unlike the
 * bot's /leaderboard replies).
 */
function isLaunchCard(message: ChannelMessage, appId: string): boolean {
  return (
    message.author.id === appId &&
    !!message.interaction_metadata &&
    !message.content &&
    message.embeds.length === 0
  );
}

/**
 * Given a channel's recent messages, the launch cards to delete now that the
 * launch `interactionId` has posted its card: every earlier card from the last
 * hour. Null while its card hasn't appeared, so a launch that posts no card
 * never removes the previous one.
 */
export function cardsToDelete(
  messages: ChannelMessage[],
  appId: string,
  interactionId: string,
  now: number
): string[] | null {
  const cards = messages.filter((m) => isLaunchCard(m, appId));
  const launchedAt = snowflakeTime(interactionId);
  if (!cards.some((m) => snowflakeTime(m.id) >= launchedAt)) return null;
  return cards
    .filter((m) => snowflakeTime(m.id) < launchedAt && now - snowflakeTime(m.id) < RECENT_MS)
    .map((m) => m.id);
}

/**
 * Run after answering a launch: waits for its card, then deletes the
 * channel's other recent launch cards. Best effort — any failure (e.g. the bot
 * lacks Read Message History in that channel) is logged and ignored.
 */
export async function tidyLaunchCards(channelId: string, appId: string, interactionId: string): Promise<void> {
  try {
    for (let waited = 0; waited <= WAIT_FOR_CARD_MS; waited += POLL_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      // Newest first.
      const messages = await botRequest<ChannelMessage[]>(`/channels/${channelId}/messages?limit=50`);
      const stale = cardsToDelete(messages, appId, interactionId, Date.now());
      if (!stale) continue;
      for (const id of stale) await botRequest(`/channels/${channelId}/messages/${id}`, { method: "DELETE" });
      if (stale.length) console.info(`Removed ${stale.length} earlier launch card(s) in channel ${channelId}`);
      return;
    }
    console.info(`No launch card appeared in channel ${channelId}; left earlier ones alone`);
  } catch (err) {
    if (!(err instanceof DiscordApiError)) throw err;
    console.warn(`Couldn't tidy launch cards in channel ${channelId}:`, err.message);
  }
}
