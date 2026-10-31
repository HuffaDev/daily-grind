import { formatTime } from "@/platform/format";
import { DayRecord, puzzleStatus } from "./scoring";
import { ChessPuzzle, TIERS } from "./types";

export interface ShareParams {
  puzzles: readonly ChessPuzzle[];
  day: DayRecord;
  puzzleNumber: number;
  timeSeconds: number;
  points?: number;
  url?: string;
}

/**
 * Builds a Wordle-style shareable text block: one row per puzzle, a 🟥 for
 * each wrong move tried and a 🟩 for each move found, or 🔎 if revealed.
 */
export function buildShareText({ puzzles, day, puzzleNumber, timeSeconds, points, url }: ShareParams): string {
  const rows = puzzles.map((puzzle, i) => {
    const progress = day.puzzles[i];
    const status = puzzleStatus(puzzle, progress);
    const moves = "🟥".repeat(progress.mistakes) + "🟩".repeat(progress.line.length);
    return `${TIERS[i].name}: ${moves}${status === "revealed" ? "🔎" : ""}`;
  });

  const solved = puzzles.filter((p, i) => puzzleStatus(p, day.puzzles[i]) === "solved").length;
  let statusLine =
    day.solvedTimeSeconds !== null
      ? `Solved in ${formatTime(timeSeconds)} 🎉`
      : `Solved ${solved}/${puzzles.length} 🔎`;
  if (points !== undefined) statusLine += ` · ${points} pts`;

  const lines = [`Daily Chess #${puzzleNumber}`, statusLine, "", ...rows];
  if (url) lines.push("", url);
  return lines.join("\n");
}
