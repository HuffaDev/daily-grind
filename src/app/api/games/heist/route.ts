import { stepGameRoute } from "@/platform/server/stepGame";
import { heistGame } from "@/games/heist/server";

const route = stepGameRoute(heistGame);
export const GET = route.GET;
export const POST = route.POST;
