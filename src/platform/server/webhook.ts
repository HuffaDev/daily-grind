// Optional results webhook: lets another service (a Discord bot, a stats
// site, ...) keep its own record of solves without reading our store.

const WEBHOOK_TIMEOUT_MS = 3_000;

export interface SolveReport {
  /** The game's id from the registry, e.g. "crossword". */
  gameId: string;
  userId: string;
  /** The puzzle's UTC date key, "YYYY-MM-DD". */
  dateKey: string;
  solveTimeSeconds: number;
  points: number;
}

/**
 * POSTs a solve to RESULTS_WEBHOOK_URL as JSON, with RESULTS_WEBHOOK_TOKEN as
 * a bearer token when set. Does nothing without a URL, and never throws: the
 * receiver being down must not break the game, it just misses that solve.
 */
export async function reportSolve({ gameId, userId, dateKey, solveTimeSeconds, points }: SolveReport): Promise<void> {
  const url = process.env.RESULTS_WEBHOOK_URL;
  if (!url) return;
  const token = process.env.RESULTS_WEBHOOK_TOKEN;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ game: gameId, user_id: userId, date: dateKey, solve_time_secs: solveTimeSeconds, points }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`Results webhook rejected a solve: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.warn("Failed to send a solve to the results webhook:", err);
  }
}
