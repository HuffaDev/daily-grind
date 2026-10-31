import { formatTime } from "../format";

// The shared engine for daily grid puzzles (Mini Sudoku, Picture Logic): the
// player fills cells of a square grid until it matches the day's solution.
// Pure rules, used by the client (instant feedback, solo play) and the server
// (authoritative leaderboard); keep this file free of browser- or Node-only APIs.

/** One day's puzzle, built deterministically from the date by the game. */
export interface GridPuzzle {
  size: number;
  /** What each cell should hold; "" for a cell that should stay empty. */
  solution: string[][];
  /** Cells shown filled in from the start (Mini Sudoku's clues), which the player can't change. */
  given: boolean[][];
}

export interface GridScoring {
  /** For completing the grid without Reveal. */
  solvePoints: number;
  timeBonusMax: number;
  /** The time bonus decays linearly from timeBonusMax to zero over this many seconds. */
  timeBonusWindowSeconds: number;
  /** Lost for each wrong cell a Check flags. */
  checkPenaltyPerCell: number;
  /** After a Reveal, kept for each needed cell the player had filled in correctly. */
  revealPointsPerCell: number;
}

/** What a game tells the engine about its cells. */
export interface GridRules {
  /** Values a cell can hold besides "", e.g. digits, or "#" (filled) and "x" (marked empty). */
  values: readonly string[];
  /** Whether an entry agrees with the expected value; Picture Logic's "x" and "" both agree with an empty cell. */
  matches(entry: string, expected: string): boolean;
  scoring: GridScoring;
}

export interface GridScore {
  /** Total points lost to Check flagging wrong cells. */
  checkPenalty: number;
  revealed: boolean;
  /** Points kept from the cells filled in before a Reveal. */
  revealCredit: number;
  /** Set once the grid is completed without a reveal — earns the solve and time bonuses. */
  solvedTimeSeconds: number | null;
}

export interface GridBreakdown {
  solve: number;
  time: number;
  reveal: number;
  penalty: number;
  total: number;
}

/** What grid games' leaderboard rows show besides points and time. */
export interface GridBoardDetail {
  /** Needed cells filled in correctly. */
  done: number;
  /** Cells the solution needs filled: every open Sudoku cell, every black Picture Logic cell. */
  total: number;
  revealed: boolean;
}

export const key = (r: number, c: number) => `${r},${c}`;

export function emptyScore(): GridScore {
  return { checkPenalty: 0, revealed: false, revealCredit: 0, solvedTimeSeconds: null };
}

/** The grid as the player first sees it: givens filled in, everything else empty. */
export function startingGrid(puzzle: GridPuzzle): string[][] {
  return puzzle.solution.map((row, r) => row.map((value, c) => (puzzle.given[r][c] ? value : "")));
}

export function isSolved(rules: GridRules, puzzle: GridPuzzle, grid: string[][]): boolean {
  return puzzle.solution.every((row, r) => row.every((expected, c) => rules.matches(grid[r]?.[c] ?? "", expected)));
}

/** Needed cells (expected non-empty, not given) and how many of them are filled in correctly. */
export function progress(rules: GridRules, puzzle: GridPuzzle, grid: string[][]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  puzzle.solution.forEach((row, r) =>
    row.forEach((expected, c) => {
      if (!expected || puzzle.given[r][c]) return;
      total++;
      if (rules.matches(grid[r]?.[c] ?? "", expected)) done++;
    })
  );
  return { done, total };
}

/** Cells the player has entered something in. */
export function filledCount(puzzle: GridPuzzle, grid: string[][]): number {
  let count = 0;
  grid.forEach((row, r) => row.forEach((value, c) => value && !puzzle.given[r][c] && count++));
  return count;
}

export function timeBonus(scoring: GridScoring, seconds: number): number {
  return Math.round(scoring.timeBonusMax * Math.max(0, 1 - seconds / scoring.timeBonusWindowSeconds));
}

/** Locks in the solve time once the grid matches the solution. */
export function scoreAfterGrid(
  rules: GridRules,
  puzzle: GridPuzzle,
  record: GridScore,
  grid: string[][],
  elapsedSeconds: number
): GridScore {
  if (record.revealed || record.solvedTimeSeconds !== null) return record;
  return isSolved(rules, puzzle, grid) ? { ...record, solvedTimeSeconds: elapsedSeconds } : record;
}

/**
 * Checks the entered cells in `cells` (keys like "2,3"; every cell if
 * omitted). Returns which are wrong and which are right, and the record with
 * the Check penalty applied for the wrong ones.
 */
export function scoreAfterCheck(
  rules: GridRules,
  puzzle: GridPuzzle,
  record: GridScore,
  grid: string[][],
  cells?: readonly string[]
): { record: GridScore; wrongCells: string[]; correctCells: string[] } {
  const scope = cells ? new Set(cells) : null;
  const wrongCells: string[] = [];
  const correctCells: string[] = [];
  puzzle.solution.forEach((row, r) =>
    row.forEach((expected, c) => {
      const k = key(r, c);
      const entry = grid[r]?.[c];
      if (puzzle.given[r][c] || !entry || (scope && !scope.has(k))) return;
      (rules.matches(entry, expected) ? correctCells : wrongCells).push(k);
    })
  );
  if (record.revealed || record.solvedTimeSeconds !== null) return { record, wrongCells, correctCells };
  const penalty = rules.scoring.checkPenaltyPerCell * wrongCells.length;
  return { record: { ...record, checkPenalty: record.checkPenalty + penalty }, wrongCells, correctCells };
}

/** Revealing keeps a little for the cells already right (in `grid`), but forfeits the solve and time bonuses. */
export function scoreAfterReveal(rules: GridRules, puzzle: GridPuzzle, record: GridScore, grid: string[][]): GridScore {
  if (record.revealed || record.solvedTimeSeconds !== null) return record;
  const credit = progress(rules, puzzle, grid).done * rules.scoring.revealPointsPerCell;
  return { ...record, revealed: true, revealCredit: credit };
}

export function scoreBreakdown(rules: GridRules, record: GridScore): GridBreakdown {
  const solved = record.solvedTimeSeconds !== null;
  const solve = solved ? rules.scoring.solvePoints : 0;
  const time = solved ? timeBonus(rules.scoring, record.solvedTimeSeconds!) : 0;
  const reveal = record.revealed ? record.revealCredit : 0;
  const penalty = record.checkPenalty;
  return { solve, time, reveal, penalty, total: Math.max(0, solve + time + reveal - penalty) };
}

/**
 * Combines the local score with the server's. Responses can lag behind
 * input, so nothing the server has counted is lost; the server's solve time
 * wins because it is the one the leaderboard uses.
 */
export function mergeScore(local: GridScore, server: GridScore): GridScore {
  return {
    checkPenalty: Math.max(local.checkPenalty, server.checkPenalty),
    revealed: local.revealed || server.revealed,
    revealCredit: Math.max(local.revealCredit, server.revealCredit),
    solvedTimeSeconds: server.solvedTimeSeconds ?? local.solvedTimeSeconds,
  };
}

/** The game as the server reports it. */
export interface GridGameView {
  grid: string[][];
  elapsedSeconds: number;
  score: GridScore;
  points: number;
}

export interface LocalGridGame {
  grid: string[][];
  score: GridScore;
  elapsedSeconds: number;
}

/**
 * Decides which copy of today's game to keep when the player signs in: this
 * device's or the server's. Either can be ahead — the server after playing on
 * another device, this device after uploads failed (e.g. offline). `upload`
 * says what to send so the server catches up.
 */
export function reconcileWithServer(
  puzzle: GridPuzzle,
  local: LocalGridGame,
  server: GridGameView | null
): LocalGridGame & { upload: "none" | "progress" | "reveal" } {
  const localFilled = filledCount(puzzle, local.grid);
  if (!server) {
    // A local reveal goes up as a reveal, never as its (fully correct) grid, which would score as a solve.
    if (local.score.revealed) return { ...local, upload: "reveal" };
    return { ...local, upload: localFilled > 0 ? "progress" : "none" };
  }
  const elapsedSeconds = Math.max(local.elapsedSeconds, server.elapsedSeconds);
  if (server.score.solvedTimeSeconds !== null || server.score.revealed) {
    return { grid: server.grid, score: server.score, elapsedSeconds, upload: "none" };
  }
  if (local.score.revealed) {
    return { grid: local.grid, score: mergeScore(local.score, server.score), elapsedSeconds, upload: "reveal" };
  }
  if (localFilled > filledCount(puzzle, server.grid)) {
    return { grid: local.grid, score: mergeScore(local.score, server.score), elapsedSeconds, upload: "progress" };
  }
  return { grid: server.grid, score: server.score, elapsedSeconds, upload: "none" };
}

/** A grid game's leaderboard summary, for GameInfo.summarizeToday. */
export function summarizeGridEntry(solvedTimeSeconds: number | null, detail: GridBoardDetail): string {
  if (solvedTimeSeconds !== null) return `✅ ${formatTime(solvedTimeSeconds)}`;
  if (detail.revealed) return `🔎 ${detail.done}/${detail.total}`;
  return `${detail.done}/${detail.total} cells`;
}

/**
 * The result to share. It never draws the grid, since that would give away
 * the day's answer to anyone who hasn't played yet.
 */
export function buildGridShareText(params: {
  name: string;
  emoji: string;
  puzzleNumber: number;
  record: GridScore;
  timeSeconds: number;
  done: number;
  total: number;
  points: number;
  url?: string;
}): string {
  const { name, emoji, puzzleNumber, record, timeSeconds, done, total, points, url } = params;
  const status = record.revealed
    ? `Revealed after ${done}/${total} cells 🔎`
    : `Solved in ${formatTime(timeSeconds)} 🎉`;
  const checks = record.checkPenalty > 0 ? `Checks: −${record.checkPenalty}` : "No checks used ✨";
  const lines = [`${emoji} ${name} #${puzzleNumber}`, `${status} · ${points} pts`, checks];
  if (url) lines.push("", url);
  return lines.join("\n");
}
