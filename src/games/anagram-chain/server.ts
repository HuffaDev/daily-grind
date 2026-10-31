import type { StepGameDef } from "@/platform/server/stepGame";
import { generateDailyAnagram } from "./lib/generator";
import { ANAGRAM_RULES, AnagramPuzzle } from "./lib/rules";
import { anagramChain } from "./meta";

/** What the shared step-game server needs to run Anagram Chain's API. */
export const anagramChainGame: StepGameDef<AnagramPuzzle> = {
  info: anagramChain,
  rules: ANAGRAM_RULES,
  puzzleFor: generateDailyAnagram,
};
