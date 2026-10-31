import type { RoundGameDef } from "@/platform/server/roundGame";
import { parseAim, playWhichWay } from "./lib/rules";
import { whichWay } from "./meta";

/** What the shared round-game server needs to run Which Way's API. */
export const whichWayGame: RoundGameDef<number> = { info: whichWay, parseMove: parseAim, play: playWhichWay };
