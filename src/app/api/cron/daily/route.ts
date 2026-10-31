import { runDailyPosts } from "@/bot/daily";
import { getUtcDateKey } from "@/platform/daily";

// Posting to many servers can take a while.
export const maxDuration = 60;

/** Run by Vercel Cron at 00:00 UTC (see vercel.json): announces the day's puzzles in every subscribed server. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel sends the project's CRON_SECRET as a bearer token; without one set, nobody may trigger it.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runDailyPosts(getUtcDateKey()));
}
