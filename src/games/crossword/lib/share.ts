import { Puzzle } from "./types";
import { formatTime } from "@/platform/format";
import { key } from "./puzzleUtils";

export interface ShareParams {
  puzzle: Puzzle;
  puzzleNumber: number;
  timeSeconds: number;
  revealed: boolean;
  /** Slot ids the player solved themselves; after a reveal only these show green. */
  solvedWords?: readonly string[];
  points?: number;
  url?: string;
}

/**
 * Builds a Wordle-style shareable text block: an emoji rendering of today's
 * grid plus the result. After a reveal, cells in words the player solved stay
 * green and the rest are yellow.
 */
export function buildShareText({
  puzzle,
  puzzleNumber,
  timeSeconds,
  revealed,
  solvedWords = [],
  points,
  url,
}: ShareParams): string {
  const solved = new Set(solvedWords);
  const solvedCells = new Set(
    puzzle.slots.filter((s) => solved.has(s.id)).flatMap((s) => s.cellCoords.map(([r, c]) => key(r, c)))
  );
  const grid = puzzle.cells
    .map((row) =>
      row
        .map((cell) => {
          if (cell.black) return "⬛";
          return !revealed || solvedCells.has(key(cell.row, cell.col)) ? "🟩" : "🟨";
        })
        .join("")
    )
    .join("\n");

  const solvedCount = puzzle.slots.filter((s) => solved.has(s.id)).length;
  let statusLine = revealed
    ? `Revealed after solving ${solvedCount}/${puzzle.slots.length} words 🔎`
    : `Solved in ${formatTime(timeSeconds)} 🎉`;
  if (points !== undefined) statusLine += ` · ${points} pts`;

  const lines = [`Mini Crossword #${puzzleNumber}`, statusLine, "", grid];
  if (url) lines.push("", url);
  return lines.join("\n");
}
