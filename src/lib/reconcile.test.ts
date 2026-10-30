import { describe, expect, it } from "vitest";
import { reconcileWithServer } from "./reconcile";
import { emptyScore, scoreAfterGrid, scoreBreakdown } from "./scoring";
import type { GameView } from "./server/game";
import { emptyGrid, gridWithSlot, puzzleFor, solutionGrid } from "./testUtils";

const puzzle = puzzleFor("2026-10-30");
const [slotA, slotB] = puzzle.slots;

function serverGame(grid: string[][], score = emptyScore(), elapsedSeconds = 10): GameView {
  return { grid, score, elapsedSeconds, points: scoreBreakdown(puzzle, score).total };
}

describe("reconcileWithServer", () => {
  it("does nothing when neither side has played", () => {
    const local = { grid: emptyGrid(puzzle), score: emptyScore(), elapsedSeconds: 0 };
    expect(reconcileWithServer(puzzle, local, null).upload).toBe("none");
  });

  it("uploads local progress the server never received", () => {
    const local = { grid: gridWithSlot(puzzle, slotA), score: emptyScore(), elapsedSeconds: 20 };
    const result = reconcileWithServer(puzzle, local, null);
    expect(result.upload).toBe("progress");
    expect(result.grid).toBe(local.grid);
  });

  it("uploads a local reveal as a reveal, never as its solved grid", () => {
    const local = { grid: solutionGrid(puzzle), score: { ...emptyScore(), revealed: true }, elapsedSeconds: 20 };
    expect(reconcileWithServer(puzzle, local, null).upload).toBe("reveal");
    expect(reconcileWithServer(puzzle, local, serverGame(gridWithSlot(puzzle, slotA))).upload).toBe("reveal");
  });

  it("keeps the local grid when it is further along than the server copy", () => {
    const localGrid = gridWithSlot(puzzle, slotA);
    for (const [r, c] of slotB.cellCoords) localGrid[r][c] = puzzle.cells[r][c].solution;
    const local = { grid: localGrid, score: emptyScore(), elapsedSeconds: 40 };
    const result = reconcileWithServer(puzzle, local, serverGame(gridWithSlot(puzzle, slotA), emptyScore(), 30));
    expect(result.upload).toBe("progress");
    expect(result.grid).toBe(localGrid);
    expect(result.elapsedSeconds).toBe(40);
  });

  it("takes the server grid when it is further along (played on another device)", () => {
    const serverGrid = gridWithSlot(puzzle, slotA);
    const local = { grid: emptyGrid(puzzle), score: emptyScore(), elapsedSeconds: 5 };
    const result = reconcileWithServer(puzzle, local, serverGame(serverGrid, emptyScore(), 30));
    expect(result).toMatchObject({ grid: serverGrid, upload: "none", elapsedSeconds: 30 });
  });

  it("always takes a finished server game", () => {
    const solved = scoreAfterGrid(puzzle, emptyScore(), solutionGrid(puzzle), 60);
    const local = { grid: gridWithSlot(puzzle, slotA), score: emptyScore(), elapsedSeconds: 5 };
    const result = reconcileWithServer(puzzle, local, serverGame(solutionGrid(puzzle), solved, 60));
    expect(result).toMatchObject({ score: solved, upload: "none" });
  });
});
