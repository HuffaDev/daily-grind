import type { StepGameDef } from "@/platform/server/stepGame";
import { generateDailyLadder } from "./lib/generator";
import { LADDER_RULES, LadderPuzzle } from "./lib/rules";
import { ladder } from "./meta";

/** What the shared step-game server needs to run Ladder's API. */
export const ladderGame: StepGameDef<LadderPuzzle> = { info: ladder, rules: LADDER_RULES, puzzleFor: generateDailyLadder };
