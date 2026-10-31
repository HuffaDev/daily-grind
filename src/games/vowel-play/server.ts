import type { StepGameDef } from "@/platform/server/stepGame";
import { generateDailyVowelPlay } from "./lib/generator";
import { VOWEL_PLAY_RULES, VowelPlayPuzzle } from "./lib/rules";
import { vowelPlay } from "./meta";

/** What the shared step-game server needs to run Vowel Play's API. */
export const vowelPlayGame: StepGameDef<VowelPlayPuzzle> = {
  info: vowelPlay,
  rules: VOWEL_PLAY_RULES,
  puzzleFor: generateDailyVowelPlay,
};
