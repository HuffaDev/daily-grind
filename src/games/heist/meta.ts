import type { BoardEntry } from "@/platform/server/store";
import { StepBoardDetail, summarizeStepEntry } from "@/platform/stepGame/rules";
import type { GameInfo } from "../types";

/** Bump whenever lib/heist.ts changes how maps are made or turns play out: it alters the puzzle a date produces. */
export const PUZZLE_VERSION = 1;

export const heist: GameInfo = {
  id: "heist",
  name: "Daily Heist",
  tagline: "Grab the loot and slip past the guards.",
  icon: "/games/heist.png",
  emoji: "💰",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday: ({ solvedTimeSeconds, detail }: BoardEntry<StepBoardDetail>) =>
    summarizeStepEntry(solvedTimeSeconds, detail, "turn"),
};
