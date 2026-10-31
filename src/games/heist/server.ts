import type { StepGameDef } from "@/platform/server/stepGame";
import { generateDailyHeist, HEIST_RULES, HeistPuzzle } from "./lib/heist";
import { heist } from "./meta";

/** What the shared step-game server needs to run Daily Heist's API. */
export const heistGame: StepGameDef<HeistPuzzle> = { info: heist, rules: HEIST_RULES, puzzleFor: generateDailyHeist };
