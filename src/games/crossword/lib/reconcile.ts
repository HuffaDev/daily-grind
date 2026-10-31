import { Puzzle } from "./types";
import { ScoreRecord } from "./scoring";
import type { GameView } from "../server/game";

export interface LocalGame {
  grid: string[][];
  score: ScoreRecord;
  elapsedSeconds: number;
}

export interface Reconciled extends LocalGame {
  /** What the client must send so the server catches up with progress it never received. */
  upload: "none" | "progress" | "reveal";
}

/**
 * Combines the local score with the server's. Responses can lag behind
 * typing, so words solved locally but not yet acknowledged are kept; the
 * server's solve time wins because it is the one the leaderboard uses.
 */
export function mergeScore(local: ScoreRecord, server: ScoreRecord): ScoreRecord {
  return {
    solvedWords: [...new Set([...local.solvedWords, ...server.solvedWords])],
    checkPenalty: Math.max(local.checkPenalty, server.checkPenalty),
    revealed: local.revealed || server.revealed,
    solvedTimeSeconds: server.solvedTimeSeconds ?? local.solvedTimeSeconds,
  };
}

function filledCells(puzzle: Puzzle, grid: string[][]): number {
  let count = 0;
  for (const row of puzzle.cells) {
    for (const cell of row) {
      if (!cell.black && grid[cell.row]?.[cell.col]) count++;
    }
  }
  return count;
}

/**
 * Decides which copy of today's game to keep when the Activity starts:
 * this device's save or the server's. Either can be ahead — the server after
 * playing on another device, this device after uploads failed (e.g. offline).
 */
export function reconcileWithServer(puzzle: Puzzle, local: LocalGame, server: GameView | null): Reconciled {
  const localFilled = filledCells(puzzle, local.grid);

  if (!server) {
    // A local reveal goes up as a reveal, never as its (fully correct) grid,
    // which the server would score as a solve. Words earned before it are lost.
    if (local.score.revealed) return { ...local, upload: "reveal" };
    return { ...local, upload: localFilled > 0 ? "progress" : "none" };
  }

  const elapsedSeconds = Math.max(local.elapsedSeconds, server.elapsedSeconds);
  const serverFinished = server.score.solvedTimeSeconds !== null || server.score.revealed;

  if (serverFinished) {
    return { grid: server.grid, score: server.score, elapsedSeconds, upload: "none" };
  }
  if (local.score.revealed) {
    return { grid: local.grid, score: mergeScore(local.score, server.score), elapsedSeconds, upload: "reveal" };
  }
  if (localFilled > filledCells(puzzle, server.grid)) {
    return { grid: local.grid, score: mergeScore(local.score, server.score), elapsedSeconds, upload: "progress" };
  }
  return { grid: server.grid, score: server.score, elapsedSeconds, upload: "none" };
}
