import { stepGameRoute } from "@/platform/server/stepGame";
import { ladderGame } from "@/games/ladder/server";

const route = stepGameRoute(ladderGame);
export const GET = route.GET;
export const POST = route.POST;
