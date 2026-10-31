import { Chess } from "chess.js";
import { ChessPuzzle } from "./types";

// Pure puzzle rules, shared by the client (moves on the board) and the server
// (checking what the client reports). Keep this file free of browser- or
// Node-only APIs so both sides judge moves identically.

export type Color = "white" | "black";

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function isUci(move: unknown): move is string {
  return typeof move === "string" && UCI.test(move);
}

/** Moves the player makes to solve `puzzle`: every other move after the opponent's setup move. */
export function playerMoveCount(puzzle: ChessPuzzle): number {
  return puzzle.moves.length / 2;
}

/** The player moves second: the puzzle's FEN has the opponent to move. */
export function playerColor(puzzle: ChessPuzzle): Color {
  return puzzle.fen.split(" ")[1] === "w" ? "black" : "white";
}

/** Plays a UCI move on `chess`; returns false, leaving it unchanged, if the move is illegal. */
export function playUci(chess: Chess, uci: string): boolean {
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return true;
  } catch {
    return false;
  }
}

export type Verdict = "correct" | "solved" | "wrong" | "illegal";

/**
 * Judges the player's next move after `line`, their correct moves so far.
 * Like Lichess, any checkmate solves the puzzle, even one the solution doesn't list.
 */
export function judgeMove(puzzle: ChessPuzzle, line: readonly string[], uci: string): Verdict {
  const chess = new Chess(puzzle.fen);
  for (const ply of sequence(puzzle, line)) playUci(chess, ply);
  if (!playUci(chess, uci)) return "illegal";
  if (chess.isCheckmate()) return "solved";
  if (uci !== puzzle.moves[1 + 2 * line.length]) return "wrong";
  return line.length + 1 === playerMoveCount(puzzle) ? "solved" : "correct";
}

/** Whether `line` solves the puzzle, assuming it's valid (see validLine). */
export function isSolved(puzzle: ChessPuzzle, line: readonly string[]): boolean {
  if (line.length === 0) return false;
  return judgeMove(puzzle, line.slice(0, -1), line[line.length - 1]) === "solved";
}

/** The longest start of `line` that is all correct moves, stopping after a solving one. */
export function validLine(puzzle: ChessPuzzle, line: readonly string[]): string[] {
  const valid: string[] = [];
  for (const uci of line) {
    if (!isUci(uci)) break;
    const verdict = judgeMove(puzzle, valid, uci);
    if (verdict !== "correct" && verdict !== "solved") break;
    valid.push(uci);
    if (verdict === "solved") break;
  }
  return valid;
}

/**
 * Every move on the board, in order, from the puzzle's FEN: the setup move,
 * then each of the player's moves in `line` followed by the opponent's reply
 * (none after the move that solves it).
 */
export function sequence(puzzle: ChessPuzzle, line: readonly string[]): string[] {
  const plies = [puzzle.moves[0]];
  line.forEach((uci, i) => {
    plies.push(uci);
    const reply = puzzle.moves[2 + 2 * i];
    if (reply && uci === puzzle.moves[1 + 2 * i] && i + 1 < playerMoveCount(puzzle)) plies.push(reply);
  });
  // A mate the solution doesn't list ends the game early; drop anything past it.
  const chess = new Chess(puzzle.fen);
  const played: string[] = [];
  for (const ply of plies) {
    if (chess.isGameOver() || !playUci(chess, ply)) break;
    played.push(ply);
  }
  return played;
}

/** The solution in SAN, numbered from the player's first move, e.g. "29… Rxc1 30. Re1 Qd3+". */
export function solutionText(puzzle: ChessPuzzle): string {
  const chess = new Chess(puzzle.fen);
  playUci(chess, puzzle.moves[0]);
  return puzzle.moves
    .slice(1)
    .map((uci, i) => {
      const number = chess.moveNumber();
      const white = chess.turn() === "w";
      const { san } = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (white) return `${number}. ${san}`;
      return i === 0 ? `${number}… ${san}` : san;
    })
    .join(" ");
}
