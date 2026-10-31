import type { GridGameDef } from "@/platform/server/gridGame";
import { generateDailySudoku, SUDOKU_RULES } from "./lib/generator";
import { sudoku } from "./meta";

/** What the shared grid-game server needs to run Mini Sudoku's API. */
export const sudokuGame: GridGameDef = { info: sudoku, rules: SUDOKU_RULES, puzzleFor: generateDailySudoku };
