import { gridGameRoute } from "@/platform/server/gridGame";
import { pictureLogicGame } from "@/games/picture-logic/server";

export const POST = gridGameRoute(pictureLogicGame);
