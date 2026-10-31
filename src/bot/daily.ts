import { getStore } from "@/platform/server/store";
import { DiscordApiError, sendMessage } from "./discord";
import { dailyMessage } from "./messages";

/** Discord's error code when a channel no longer exists. */
const UNKNOWN_CHANNEL = 10003;
/** Long enough to outlast any retry of the same day's cron run. */
const CLAIM_TTL_SECONDS = 2 * 24 * 60 * 60;
/** Channels posted to at once; Discord rate-limits per channel, and globally at 50 requests a second. */
const BATCH_SIZE = 5;

const claimName = (todayKey: string, guildId: string) => `daily-post:${todayKey}:${guildId}`;

/**
 * Posts `todayKey`'s announcement to one server's channel, unless it already
 * has one for that day (or `always`, which posts regardless and counts as the
 * day's post). Throws if Discord refuses the post.
 */
export async function postDaily(
  guildId: string,
  channelId: string,
  todayKey: string,
  { always = false } = {}
): Promise<"posted" | "skipped"> {
  const first = await getStore().claimOnce(claimName(todayKey, guildId), CLAIM_TTL_SECONDS);
  if (!first && !always) return "skipped";
  await sendMessage(channelId, await dailyMessage(`guild:${guildId}`, todayKey));
  return "posted";
}

export interface DailyRunResult {
  posted: number;
  /** Servers that already had today's post. */
  skipped: number;
  failed: number;
  /** Servers whose channel was deleted; their daily posts were turned off. */
  removed: number;
}

/** Sends `todayKey`'s announcement to every server that turned daily posts on. */
export async function runDailyPosts(todayKey: string): Promise<DailyRunResult> {
  const store = getStore();
  const result: DailyRunResult = { posted: 0, skipped: 0, failed: 0, removed: 0 };
  const channels = Object.entries(await store.getDailyChannels());

  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    await Promise.all(
      channels.slice(i, i + BATCH_SIZE).map(async ([guildId, channelId]) => {
        try {
          result[await postDaily(guildId, channelId, todayKey)] += 1;
        } catch (err) {
          if (err instanceof DiscordApiError && err.code === UNKNOWN_CHANNEL) {
            await store.setDailyChannel(guildId, null);
            result.removed += 1;
            return;
          }
          // Missing permissions and the like: keep the setting, so fixing the
          // channel's permissions brings the posts back tomorrow.
          console.warn(`Daily post to guild ${guildId} failed:`, err);
          result.failed += 1;
        }
      })
    );
  }
  return result;
}
