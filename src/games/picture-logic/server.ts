import type { GridGameDef } from "@/platform/server/gridGame";
import { generateDailyPicture, PICTURE_RULES } from "./lib/generator";
import { pictureLogic } from "./meta";

/** What the shared grid-game server needs to run Picture Logic's API. */
export const pictureLogicGame: GridGameDef = { info: pictureLogic, rules: PICTURE_RULES, puzzleFor: generateDailyPicture };
