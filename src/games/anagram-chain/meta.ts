import type { BoardEntry } from "@/platform/server/store";
import { StepBoardDetail, summarizeStepEntry } from "@/platform/stepGame/rules";
import type { GameInfo } from "../types";

/** Bump whenever lib/generator.ts or the word lists change: it alters the puzzle a date produces. */
export const PUZZLE_VERSION = 1;

export const anagramChain: GameInfo = {
  id: "anagram-chain",
  name: "Anagram Chain",
  tagline: "Grow a word one letter at a time until it uses all seven.",
  icon: "/games/anagram-chain.png",
  emoji: "🔤",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday: ({ solvedTimeSeconds, detail }: BoardEntry<StepBoardDetail>) =>
    summarizeStepEntry(solvedTimeSeconds, detail, "word"),
};
