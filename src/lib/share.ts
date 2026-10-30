import { Puzzle } from "./types";
import { formatTime } from "./puzzleUtils";

export interface ShareParams {
  puzzle: Puzzle;
  puzzleNumber: number;
  timeSeconds: number;
  revealed: boolean;
  points?: number;
  url?: string;
}

/** Builds a Wordle-style shareable text block: an emoji rendering of today's grid plus the result. */
export function buildShareText({ puzzle, puzzleNumber, timeSeconds, revealed, points, url }: ShareParams): string {
  const filledEmoji = revealed ? "🟨" : "🟩";
  const grid = puzzle.cells
    .map((row) => row.map((cell) => (cell.black ? "⬛" : filledEmoji)).join(""))
    .join("\n");

  let statusLine = revealed ? "Revealed today's puzzle 🔎" : `Solved in ${formatTime(timeSeconds)} 🎉`;
  if (points !== undefined) statusLine += ` · ${points} pts`;

  const lines = [`Mini Crossword #${puzzleNumber}`, statusLine, "", grid];
  if (url) lines.push("", url);
  return lines.join("\n");
}
