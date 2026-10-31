import { generateDailyPuzzle } from "./generator";
import { Puzzle, Slot } from "./types";

// Shared fixtures for tests. Puzzles are deterministic per date, but tests
// should only rely on their shape, not on particular answers.

export function puzzleFor(dateKey: string): Puzzle {
  return generateDailyPuzzle(dateKey);
}

export function solutionGrid(puzzle: Puzzle): string[][] {
  return puzzle.cells.map((row) => row.map((cell) => (cell.black ? "" : cell.solution)));
}

export function emptyGrid(puzzle: Puzzle): string[][] {
  return puzzle.cells.map((row) => row.map(() => ""));
}

/** An otherwise empty grid with just `slot` filled in correctly. */
export function gridWithSlot(puzzle: Puzzle, slot: Slot): string[][] {
  const grid = emptyGrid(puzzle);
  for (const [r, c] of slot.cellCoords) grid[r][c] = puzzle.cells[r][c].solution;
  return grid;
}

/** A letter that is wrong for the cell at (r, c). */
export function wrongLetterAt(puzzle: Puzzle, r: number, c: number): string {
  return puzzle.cells[r][c].solution === "Q" ? "Z" : "Q";
}
