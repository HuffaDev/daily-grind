import { gridGameRoute } from "@/platform/server/gridGame";
import { sudokuGame } from "@/games/sudoku/server";

export const POST = gridGameRoute(sudokuGame);
