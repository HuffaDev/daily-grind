import { stepGameRoute } from "@/platform/server/stepGame";
import { vowelPlayGame } from "@/games/vowel-play/server";

const route = stepGameRoute(vowelPlayGame);
export const GET = route.GET;
export const POST = route.POST;
