import type { BoardEntry } from "@/platform/server/store";
import { GridBoardDetail, summarizeGridEntry } from "@/platform/gridGame/rules";
import type { GameInfo } from "../types";

/** Bump whenever lib/generator.ts changes: it alters the puzzle a date produces. */
export const PUZZLE_VERSION = 1;

export const sudoku: GameInfo = {
  id: "sudoku",
  name: "Mini Sudoku",
  tagline: "A 6×6 sudoku, easy Monday to tough Sunday.",
  icon: "/games/sudoku.png",
  emoji: "🔢",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday: ({ solvedTimeSeconds, detail }: BoardEntry<GridBoardDetail>) =>
    summarizeGridEntry(solvedTimeSeconds, detail),
};
