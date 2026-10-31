// Deterministic daily-puzzle machinery shared by every game: every player who
// loads a game on the same UTC calendar day gets the same seed, and therefore
// the same generated puzzle (mirroring Wordle-style "dles").

/** Seeded PRNG (mulberry32) — same seed always produces the same sequence. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash, used to turn a date key into a PRNG seed. */
function hashStringToSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Today's date key in UTC ("YYYY-MM-DD") — the shared boundary for all players. */
export function getUtcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function seedForDateKey(dateKey: string): number {
  return hashStringToSeed(dateKey);
}

export function millisUntilNextUtcMidnight(date: Date = new Date()): number {
  const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0);
  return next - date.getTime();
}

/** The UTC date key ("YYYY-MM-DD") of the day before `dateKey`. */
export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const PUZZLE_EPOCH_UTC = Date.UTC(2026, 9, 31); // launch day: puzzle #1

export function getDailyPuzzleNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dayMs = Date.UTC(y, m - 1, d) - PUZZLE_EPOCH_UTC;
  return Math.floor(dayMs / 86_400_000) + 1;
}

/**
 * A daily puzzle's id: its date plus the game's puzzle version, e.g.
 * "2026-10-31.v1". Saved games and leaderboards are keyed by it, so bumping a
 * game's version gives players a clean slate instead of a mismatched puzzle.
 */
export function getPuzzleId(dateKey: string, version: number): string {
  return `${dateKey}.v${version}`;
}

export function parsePuzzleId(puzzleId: string): { dateKey: string; version: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.v(\d+)$/.exec(puzzleId);
  if (!match) return null;
  return { dateKey: match[1], version: Number(match[2]) };
}
