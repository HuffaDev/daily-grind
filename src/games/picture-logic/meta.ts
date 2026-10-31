import type { BoardEntry } from "@/platform/server/store";
import { GridBoardDetail, summarizeGridEntry } from "@/platform/gridGame/rules";
import type { GameInfo } from "../types";

/** Bump whenever lib/generator.ts changes: it alters the picture a date produces. */
export const PUZZLE_VERSION = 1;

export const pictureLogic: GameInfo = {
  id: "picture-logic",
  name: "Picture Logic",
  tagline: "Fill the grid from number clues to reveal a picture.",
  icon: "/games/picture-logic.png",
  emoji: "🖼️",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday: ({ solvedTimeSeconds, detail }: BoardEntry<GridBoardDetail>) =>
    summarizeGridEntry(solvedTimeSeconds, detail),
};
