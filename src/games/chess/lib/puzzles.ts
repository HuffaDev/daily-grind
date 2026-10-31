import { getDailyPuzzleNumber } from "@/platform/daily";
import bank from "../data/puzzles.json";
import { ChessPuzzle, TIERS } from "./types";

// The puzzle bank is only read on the server: the client fetches its day's
// puzzles from /api/games/chess/puzzles rather than shipping every future one.

function parse(row: string): ChessPuzzle {
  const [id, fen, moves, rating, mateIn] = row.split(",");
  return { id, fen, moves: moves.split(" "), rating: Number(rating), mateIn: Number(mateIn) || null };
}

/**
 * The day's puzzles, one per tier, easiest first. Days walk through each
 * tier's (pre-shuffled) list in order, so no puzzle repeats until the bank
 * runs out, years from launch.
 */
export function getDailyPuzzles(dateKey: string): ChessPuzzle[] {
  const day = getDailyPuzzleNumber(dateKey) - 1;
  return TIERS.map((_, tier) => {
    const rows = (bank as string[][])[tier];
    return parse(rows[((day % rows.length) + rows.length) % rows.length]);
  });
}
