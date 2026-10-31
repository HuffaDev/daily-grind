import { whichWayGame } from "@/games/which-way/server";
import { roundGameRoute } from "@/platform/server/roundGame";

export const POST = roundGameRoute(whichWayGame);
