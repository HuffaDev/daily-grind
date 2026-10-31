import { previousDateKey } from "./daily";

// A player's own record for one game, kept in this browser. The server keeps
// the shared leaderboards; these are the numbers on the game's win screen.

export interface Stats {
  /** Days with a finished game — solved or revealed. */
  gamesPlayed: number;
  /** Days solved without Reveal. */
  gamesWon: number;
  bestTimeSeconds: number | null;
  currentStreak: number;
  bestStreak: number;
  lastWonDate: string | null;
  /** Puzzle date of the last finished game, so one day is never counted twice. */
  lastPlayedDate: string | null;
}

export const DEFAULT_STATS: Stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  bestTimeSeconds: null,
  currentStreak: 0,
  bestStreak: 0,
  lastWonDate: null,
  lastPlayedDate: null,
};

const storageKey = (gameId: string) => `daily-grind:${gameId}:stats`;

/**
 * Loads a game's stats as of puzzle date `dateKey`. A streak whose last win is older
 * than the day before `dateKey` has already been broken, so it reads as 0
 * instead of lingering until the next win.
 */
export function loadStats(gameId: string, dateKey: string): Stats {
  if (typeof window === "undefined") return DEFAULT_STATS;
  let stats: Stats;
  try {
    const raw = window.localStorage.getItem(storageKey(gameId));
    if (!raw) return DEFAULT_STATS;
    stats = { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATS;
  }
  const alive = stats.lastWonDate === dateKey || stats.lastWonDate === previousDateKey(dateKey);
  return alive ? stats : { ...stats, currentStreak: 0 };
}

function saveStats(gameId: string, stats: Stats): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(gameId), JSON.stringify(stats));
  } catch {
    // Storage can be unavailable (private mode, blocked in some embeds).
  }
}

/** Pure core of recordGame: applies one finished game for puzzle date `dateKey`. */
export function applyGame(stats: Stats, dateKey: string, result: { won: boolean; timeSeconds: number }): Stats {
  if (stats.lastPlayedDate === dateKey) return stats;
  const next = { ...stats, gamesPlayed: stats.gamesPlayed + 1, lastPlayedDate: dateKey };
  if (result.won) {
    next.gamesWon += 1;
    next.bestTimeSeconds =
      next.bestTimeSeconds === null ? result.timeSeconds : Math.min(next.bestTimeSeconds, result.timeSeconds);
    next.currentStreak = next.lastWonDate === previousDateKey(dateKey) ? next.currentStreak + 1 : 1;
    next.lastWonDate = dateKey;
    next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
  } else {
    next.currentStreak = 0;
  }
  return next;
}

/** Records a finished game of `gameId` (solved, or revealed when `won` is false) for puzzle date `dateKey`. */
export function recordGame(gameId: string, dateKey: string, result: { won: boolean; timeSeconds: number }): Stats {
  const stats = applyGame(loadStats(gameId, dateKey), dateKey, result);
  saveStats(gameId, stats);
  return stats;
}
