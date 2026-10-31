import { Puzzle } from "./types";
import { key } from "./puzzleUtils";

// Pure scoring rules, shared by the client (instant feedback, solo play) and
// the server (authoritative leaderboard). Keep this file free of browser- or
// Node-only APIs so both sides compute identical results.

/** Extra points per letter on top of the per-letter base — rarer letters make a fill harder. */
export const LETTER_BONUS: Record<string, number> = {
  D: 1, G: 1,
  B: 2, C: 2, M: 2, P: 2,
  F: 3, H: 3, V: 3, W: 3, Y: 3,
  K: 4,
  J: 6, X: 6,
  Q: 8, Z: 8,
};
export const POINTS_PER_LETTER = 10;
export const COMPLETION_BONUS = 100;
export const TIME_BONUS_MAX = 200;
/** The time bonus decays linearly from TIME_BONUS_MAX to zero over this many seconds. */
export const TIME_BONUS_WINDOW_SECONDS = 600;
export const CHECK_PENALTY_PER_CELL = 5;

export interface ScoreRecord {
  /** Slot ids ("1A", "3D", …) the player filled correctly before any reveal. */
  solvedWords: string[];
  /** Total points lost to Check flagging wrong cells. */
  checkPenalty: number;
  revealed: boolean;
  /** Set once the grid is completed without a reveal — earns the completion and time bonuses. */
  solvedTimeSeconds: number | null;
}

export interface ScoreBreakdown {
  words: number;
  completion: number;
  time: number;
  penalty: number;
  total: number;
}

export function emptyScore(): ScoreRecord {
  return { solvedWords: [], checkPenalty: 0, revealed: false, solvedTimeSeconds: null };
}

export function wordPoints(answer: string): number {
  let points = POINTS_PER_LETTER * answer.length;
  for (const letter of answer) points += LETTER_BONUS[letter] ?? 0;
  return points;
}

export function timeBonus(seconds: number): number {
  return Math.round(TIME_BONUS_MAX * Math.max(0, 1 - seconds / TIME_BONUS_WINDOW_SECONDS));
}

function correctSlotIds(puzzle: Puzzle, grid: string[][]): string[] {
  return puzzle.slots
    .filter((slot) => slot.cellCoords.every(([r, c]) => grid[r]?.[c] === puzzle.cells[r][c].solution))
    .map((slot) => slot.id);
}

/**
 * Awards points for words that are now correct in `grid`. Words are banked
 * once earned (fixing a crossing later doesn't take them away). Completing
 * every word locks in the solve time for the completion and time bonuses.
 */
export function scoreAfterGrid(
  puzzle: Puzzle,
  record: ScoreRecord,
  grid: string[][],
  elapsedSeconds: number
): ScoreRecord {
  if (record.revealed || record.solvedTimeSeconds !== null) return record;
  const solved = new Set(record.solvedWords);
  for (const id of correctSlotIds(puzzle, grid)) solved.add(id);
  const complete = solved.size === puzzle.slots.length;
  return {
    ...record,
    solvedWords: [...solved],
    solvedTimeSeconds: complete ? elapsedSeconds : null,
  };
}

/**
 * Checks the filled-in cells in `cells` (keys like "2,3"; every cell if
 * omitted). Returns which are wrong and which are right, and the record with
 * the Check penalty applied for the wrong ones.
 */
export function scoreAfterCheck(
  puzzle: Puzzle,
  record: ScoreRecord,
  grid: string[][],
  cells?: readonly string[]
): { record: ScoreRecord; wrongCells: string[]; correctCells: string[] } {
  const scope = cells ? new Set(cells) : null;
  const wrongCells: string[] = [];
  const correctCells: string[] = [];
  for (const row of puzzle.cells) {
    for (const cell of row) {
      const k = key(cell.row, cell.col);
      if (cell.black || (scope && !scope.has(k))) continue;
      const val = grid[cell.row]?.[cell.col];
      if (!val) continue;
      (val === cell.solution ? correctCells : wrongCells).push(k);
    }
  }
  if (record.revealed || record.solvedTimeSeconds !== null) return { record, wrongCells, correctCells };
  return {
    record: { ...record, checkPenalty: record.checkPenalty + CHECK_PENALTY_PER_CELL * wrongCells.length },
    wrongCells,
    correctCells,
  };
}

/** Revealing keeps words already earned but forfeits the completion and time bonuses. */
export function scoreAfterReveal(record: ScoreRecord): ScoreRecord {
  if (record.solvedTimeSeconds !== null) return record;
  return { ...record, revealed: true };
}

export function scoreBreakdown(puzzle: Puzzle, record: ScoreRecord): ScoreBreakdown {
  const solved = new Set(record.solvedWords);
  const words = puzzle.slots.filter((s) => solved.has(s.id)).reduce((sum, s) => sum + wordPoints(s.answer), 0);
  const finished = record.solvedTimeSeconds !== null;
  const completion = finished ? COMPLETION_BONUS : 0;
  const time = finished ? timeBonus(record.solvedTimeSeconds!) : 0;
  const penalty = record.checkPenalty;
  return { words, completion, time, penalty, total: Math.max(0, words + completion + time - penalty) };
}
