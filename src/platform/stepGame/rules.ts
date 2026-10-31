import { formatTime } from "../format";

// The shared engine for daily step puzzles (Ladder, Anagram Chain, Daily
// Heist): the player builds a list of moves — words, or steps through a map —
// from the day's start until the puzzle is solved, and may take moves back.
// Pure rules, used by the client (instant feedback, solo play) and the server
// (authoritative leaderboard); keep this file free of browser- or Node-only APIs.

export interface StepScoring {
  /** For solving without giving up. */
  solvePoints: number;
  timeBonusMax: number;
  /** The time bonus decays linearly from timeBonusMax to zero over this many seconds. */
  timeBonusWindowSeconds: number;
}

/** What a game tells the engine about its moves. `P` is the puzzle as players see it. */
export interface StepRules<P> {
  /** Why `move` can't follow `moves`, or null if it can. */
  invalidMove(puzzle: P, moves: readonly string[], move: string): string | null;
  isSolved(puzzle: P, moves: readonly string[]): boolean;
  /** How far along the moves are, for the leaderboard: e.g. words placed out of words needed. */
  progress(puzzle: P, moves: readonly string[]): { done: number; total: number };
  /** Added to a solve's points for how well it went, e.g. a penalty per move over par. Zero or less. */
  skillPoints(puzzle: P, moves: readonly string[]): number;
  /** What skillPoints are called on the results screen, e.g. "Over par". */
  skillLabel: string;
  /** Kept after giving up, for the progress made. */
  giveUpPoints(puzzle: P, moves: readonly string[]): number;
  /** Longest move list accepted. */
  maxMoves: number;
  /**
   * Moves are final, e.g. wrong guesses that cost points: hides Undo and
   * Restart, and the server refuses a move list that doesn't extend the one it saved.
   */
  noTakebacks?: boolean;
  scoring: StepScoring;
}

export interface StepScore {
  /** Set once the puzzle is solved without giving up — earns the solve and time bonuses. */
  solvedTimeSeconds: number | null;
  gaveUp: boolean;
}

export interface StepBreakdown {
  solve: number;
  time: number;
  skill: number;
  giveUp: number;
  total: number;
}

/** What step games' leaderboard rows show besides points and time. */
export interface StepBoardDetail {
  done: number;
  total: number;
  /** Moves in the player's answer. */
  moves: number;
  gaveUp: boolean;
}

export function emptyScore(): StepScore {
  return { solvedTimeSeconds: null, gaveUp: false };
}

/** Why a whole move list isn't playable (its first bad move), or null if it is. Nothing may follow a solve. */
export function invalidMoves<P>(rules: StepRules<P>, puzzle: P, moves: readonly string[]): string | null {
  if (moves.length > rules.maxMoves) return "Too many moves";
  for (let i = 0; i < moves.length; i++) {
    const before = moves.slice(0, i);
    if (rules.isSolved(puzzle, before)) return "Already solved";
    const reason = rules.invalidMove(puzzle, before, moves[i]);
    if (reason) return reason;
  }
  return null;
}

export function timeBonus(scoring: StepScoring, seconds: number): number {
  return Math.round(scoring.timeBonusMax * Math.max(0, 1 - seconds / scoring.timeBonusWindowSeconds));
}

/** Locks in the solve time once the moves solve the puzzle. */
export function scoreAfterMoves<P>(
  rules: StepRules<P>,
  puzzle: P,
  score: StepScore,
  moves: readonly string[],
  elapsedSeconds: number
): StepScore {
  if (score.gaveUp || score.solvedTimeSeconds !== null) return score;
  return rules.isSolved(puzzle, moves) ? { ...score, solvedTimeSeconds: elapsedSeconds } : score;
}

export function scoreBreakdown<P>(
  rules: StepRules<P>,
  puzzle: P,
  moves: readonly string[],
  score: StepScore
): StepBreakdown {
  const solved = score.solvedTimeSeconds !== null;
  const solve = solved ? rules.scoring.solvePoints : 0;
  const time = solved ? timeBonus(rules.scoring, score.solvedTimeSeconds!) : 0;
  const skill = solved ? rules.skillPoints(puzzle, moves) : 0;
  const giveUp = score.gaveUp ? rules.giveUpPoints(puzzle, moves) : 0;
  return { solve, time, skill, giveUp, total: Math.max(0, solve + time + skill + giveUp) };
}

/** The game as the server reports it. */
export interface StepGameView {
  moves: string[];
  elapsedSeconds: number;
  score: StepScore;
  points: number;
}

export interface LocalStepGame {
  moves: string[];
  score: StepScore;
  elapsedSeconds: number;
}

/**
 * Decides which copy of today's game to keep when the player signs in: this
 * device's or the server's, whichever is further along. `upload` says what to
 * send so the server catches up.
 */
export function reconcileWithServer(
  local: LocalStepGame,
  server: StepGameView | null
): LocalStepGame & { upload: "none" | "progress" | "giveup" } {
  if (!server) {
    if (local.score.gaveUp) return { ...local, upload: "giveup" };
    return { ...local, upload: local.moves.length > 0 ? "progress" : "none" };
  }
  const elapsedSeconds = Math.max(local.elapsedSeconds, server.elapsedSeconds);
  if (server.score.solvedTimeSeconds !== null || server.score.gaveUp) {
    return { moves: server.moves, score: server.score, elapsedSeconds, upload: "none" };
  }
  if (local.score.gaveUp) return { ...local, elapsedSeconds, upload: "giveup" };
  if (local.score.solvedTimeSeconds !== null || local.moves.length > server.moves.length) {
    // The server times the solve itself from the moves it receives.
    return { moves: local.moves, score: server.score, elapsedSeconds, upload: "progress" };
  }
  return { moves: server.moves, score: server.score, elapsedSeconds, upload: "none" };
}

/** A step game's leaderboard summary, for GameInfo.summarizeToday; `unit` names a move, e.g. "step". */
export function summarizeStepEntry(solvedTimeSeconds: number | null, detail: StepBoardDetail, unit: string): string {
  if (solvedTimeSeconds !== null) {
    return `✅ ${formatTime(solvedTimeSeconds)} · ${detail.moves} ${unit}${detail.moves === 1 ? "" : "s"}`;
  }
  if (detail.gaveUp) return `🏳️ ${detail.done}/${detail.total}`;
  return `${detail.done}/${detail.total}`;
}

/** The result to share. It never lists the moves, which would give away the day's answer. */
export function buildStepShareText(params: {
  name: string;
  emoji: string;
  puzzleNumber: number;
  score: StepScore;
  timeSeconds: number;
  /** e.g. "5 steps (par 4)". */
  detail: string;
  points: number;
  url?: string;
}): string {
  const { name, emoji, puzzleNumber, score, timeSeconds, detail, points, url } = params;
  const status = score.gaveUp ? "Gave up 🏳️" : `Solved in ${formatTime(timeSeconds)} 🎉`;
  const lines = [`${emoji} ${name} #${puzzleNumber}`, `${status} · ${points} pts`, detail];
  if (url) lines.push("", url);
  return lines.join("\n");
}
