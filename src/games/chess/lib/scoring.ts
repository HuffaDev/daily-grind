import { isSolved, validLine } from "./solution";
import { ChessPuzzle, PuzzleProgress, TIERS } from "./types";

// Pure scoring rules, shared by the client (instant feedback, solo play) and
// the server (authoritative leaderboard).

/** Each wrong move costs this share of the puzzle's points. */
export const MISTAKE_FRACTION = 1 / 3;
export const COMPLETION_BONUS = 100;
export const TIME_BONUS_MAX = 200;
/** The time bonus decays linearly from TIME_BONUS_MAX to zero over this many seconds. */
export const TIME_BONUS_WINDOW_SECONDS = 600;

/** A player's whole day: one progress per puzzle, plus the time they finished all of them. */
export interface DayRecord {
  puzzles: PuzzleProgress[];
  /** Set once every puzzle is solved without a reveal — earns the completion and time bonuses. */
  solvedTimeSeconds: number | null;
}

export type PuzzleStatus = "playing" | "solved" | "revealed";

export interface ScoreBreakdown {
  /** Points from each puzzle, in order. */
  puzzles: number[];
  completion: number;
  time: number;
  total: number;
}

export function emptyProgress(): PuzzleProgress {
  return { line: [], mistakes: 0, revealed: false };
}

export function emptyDay(count: number): DayRecord {
  return { puzzles: Array.from({ length: count }, emptyProgress), solvedTimeSeconds: null };
}

/** A solve counts even if a reveal raced it from another device; a reveal only matters while unsolved. */
export function puzzleStatus(puzzle: ChessPuzzle, progress: PuzzleProgress): PuzzleStatus {
  if (isSolved(puzzle, progress.line)) return "solved";
  return progress.revealed ? "revealed" : "playing";
}

export function mistakePenalty(tier: number): number {
  return Math.round(TIERS[tier].points * MISTAKE_FRACTION);
}

export function puzzlePoints(puzzle: ChessPuzzle, tier: number, progress: PuzzleProgress): number {
  if (puzzleStatus(puzzle, progress) !== "solved") return 0;
  return Math.max(0, TIERS[tier].points - progress.mistakes * mistakePenalty(tier));
}

export function timeBonus(seconds: number): number {
  return Math.round(TIME_BONUS_MAX * Math.max(0, 1 - seconds / TIME_BONUS_WINDOW_SECONDS));
}

/** Every puzzle is solved or revealed: nothing left to play today. */
export function isDayFinished(puzzles: readonly ChessPuzzle[], day: DayRecord): boolean {
  return puzzles.every((p, i) => puzzleStatus(p, day.puzzles[i]) !== "playing");
}

/** Records the solve time once the last puzzle is solved, if none was revealed. */
export function scoreAfterProgress(puzzles: readonly ChessPuzzle[], day: DayRecord, elapsedSeconds: number): DayRecord {
  if (day.solvedTimeSeconds !== null) return day;
  const allSolved = puzzles.every((p, i) => puzzleStatus(p, day.puzzles[i]) === "solved");
  return allSolved ? { ...day, solvedTimeSeconds: elapsedSeconds } : day;
}

export function scoreBreakdown(puzzles: readonly ChessPuzzle[], day: DayRecord): ScoreBreakdown {
  const points = puzzles.map((p, i) => puzzlePoints(p, i, day.puzzles[i]));
  const finished = day.solvedTimeSeconds !== null;
  const completion = finished ? COMPLETION_BONUS : 0;
  const time = finished ? timeBonus(day.solvedTimeSeconds!) : 0;
  return { puzzles: points, completion, time, total: points.reduce((a, b) => a + b, 0) + completion + time };
}

/**
 * Combines two copies of one puzzle's progress (this device's and the
 * server's, or the server's and an upload). Progress only moves forward: the
 * longer correct line, the most mistakes, and any reveal. Once a puzzle is
 * revealed unsolved in `base`, its line is frozen, so the shown solution can't
 * be replayed for points.
 */
export function mergeProgress(puzzle: ChessPuzzle, base: PuzzleProgress, incoming: PuzzleProgress): PuzzleProgress {
  const baseLine = validLine(puzzle, base.line);
  const incomingLine = validLine(puzzle, incoming.line);
  const frozen = base.revealed && !isSolved(puzzle, baseLine);
  return {
    line: !frozen && incomingLine.length > baseLine.length ? incomingLine : baseLine,
    mistakes: Math.max(base.mistakes, incoming.mistakes),
    revealed: base.revealed || incoming.revealed,
  };
}

export function sameProgress(a: PuzzleProgress, b: PuzzleProgress): boolean {
  return a.line.join() === b.line.join() && a.mistakes === b.mistakes && a.revealed === b.revealed;
}

/**
 * Combines this device's day with the server's. Responses can lag behind
 * moves, so local progress not yet acknowledged is kept; the server's solve
 * time wins because it is the one the leaderboard uses.
 */
export function mergeDay(puzzles: readonly ChessPuzzle[], local: DayRecord, server: DayRecord): DayRecord {
  return {
    puzzles: puzzles.map((p, i) => mergeProgress(p, server.puzzles[i], local.puzzles[i])),
    solvedTimeSeconds: server.solvedTimeSeconds ?? local.solvedTimeSeconds,
  };
}
