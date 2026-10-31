import { stepGameRoute } from "@/platform/server/stepGame";
import { anagramChainGame } from "@/games/anagram-chain/server";

const route = stepGameRoute(anagramChainGame);
export const GET = route.GET;
export const POST = route.POST;
