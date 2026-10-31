import type { RoundGameDef } from "@/platform/server/roundGame";
import { Move, parseGuess, playFiveClues } from "./lib/rules";
import { fiveClues } from "./meta";

/** What the shared round-game server needs to run Five Clues' API. */
export const fiveCluesGame: RoundGameDef<Move> = { info: fiveClues, parseMove: parseGuess, play: playFiveClues };
