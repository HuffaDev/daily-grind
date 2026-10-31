import type { BoardEntry } from "@/platform/server/store";
import { StepBoardDetail, summarizeStepEntry } from "@/platform/stepGame/rules";
import type { GameInfo } from "../types";

/** Bump whenever lib/generator.ts or the word lists change: it alters the puzzle a date produces. */
export const PUZZLE_VERSION = 1;

export const ladder: GameInfo = {
  id: "ladder",
  name: "Ladder",
  tagline: "Turn one word into another, a letter at a time.",
  icon: "/games/ladder.png",
  emoji: "🪜",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday: ({ solvedTimeSeconds, detail }: BoardEntry<StepBoardDetail>) =>
    summarizeStepEntry(solvedTimeSeconds, detail, "step"),
};
