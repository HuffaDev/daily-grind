import { fiveCluesGame } from "@/games/five-clues/server";
import { roundGameRoute } from "@/platform/server/roundGame";

export const POST = roundGameRoute(fiveCluesGame);
