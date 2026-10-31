import { getUtcDateKey, parsePuzzleId, previousDateKey } from "@/platform/daily";
import type { GameInfo } from "@/games/types";

// Helpers every game's server code builds on.

export class GameError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Turns a GameError into its JSON response; anything else is rethrown as a 500. */
export function gameErrorResponse(err: unknown): Response {
  if (err instanceof GameError) return Response.json({ error: err.message }, { status: err.status });
  throw err;
}

/**
 * Checks that `puzzleId` is one of `game`'s active puzzles and returns its
 * date. Only today's and yesterday's (UTC) puzzles accept play, so late
 * finishers can complete theirs, and only from a build with the same puzzle version.
 */
export function resolveActivePuzzle(game: GameInfo, puzzleId: unknown): string {
  const parsed = typeof puzzleId === "string" ? parsePuzzleId(puzzleId) : null;
  if (!parsed) throw new GameError("Invalid puzzle id", 400);
  if (parsed.version !== game.puzzleVersion) throw new GameError("Puzzle version mismatch — reload to update", 409);
  const today = getUtcDateKey();
  if (parsed.dateKey !== today && parsed.dateKey !== previousDateKey(today)) {
    throw new GameError("Puzzle is no longer active", 409);
  }
  return parsed.dateKey;
}

/**
 * How long a player has spent on a puzzle, kept in the game's saved record.
 * The client reports its own timer, which can be tampered with; the server
 * also measures play time itself from the gaps between requests, and scoring
 * uses whichever is slower.
 */
export interface PlayTime {
  /** Highest elapsed time the client has reported. */
  clientElapsedSeconds: number;
  /** Time the server saw the player actively playing, from gaps between requests. */
  activeSeconds: number;
  lastSeenAt: number;
  startedAt: number;
}

/**
 * Requests further apart than this mean the player wasn't playing (tab closed,
 * device asleep), so the gap doesn't count toward their server-measured time.
 * Clients send a heartbeat well inside this window while their timer runs.
 */
export const ACTIVE_GAP_CAP_MS = 45_000;

export function newPlayTime(now: number): PlayTime {
  return { clientElapsedSeconds: 0, activeSeconds: 0, lastSeenAt: now, startedAt: now };
}

/** Records a request at `now` that reported `elapsedSeconds` on the client's timer. Call only while unfinished. */
export function recordPlay(time: PlayTime, now: number, elapsedSeconds: unknown): void {
  const gap = now - time.lastSeenAt;
  if (gap <= ACTIVE_GAP_CAP_MS) time.activeSeconds += gap / 1000;
  time.lastSeenAt = now;
  const elapsed = Number(elapsedSeconds);
  if (Number.isFinite(elapsed) && elapsed > time.clientElapsedSeconds) time.clientElapsedSeconds = Math.floor(elapsed);
}

/** The time to score: the client clock can be rewound, the server's can't, so the slower one counts. */
export function scoredSeconds(time: PlayTime): number {
  return Math.round(Math.max(time.clientElapsedSeconds, time.activeSeconds));
}
