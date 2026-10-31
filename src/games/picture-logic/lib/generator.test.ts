import { describe, expect, it } from "bun:test";
import { clues, dailyPicture, generateDailyPicture, lineClue, lineSolveRounds, SIZE } from "./generator";

describe("lineClue", () => {
  it("lists runs of filled cells in order", () => {
    expect(lineClue([true, true, false, true, false, false, true, true, true, false])).toEqual([2, 1, 3]);
    expect(lineClue(Array(SIZE).fill(false))).toEqual([]);
  });
});

describe("lineSolveRounds", () => {
  it("solves a puzzle that line logic settles, and gives up on an ambiguous one", () => {
    expect(lineSolveRounds([[2], [1]], [[2], [1]])).not.toBeNull();
    // A diagonal pair: either diagonal fits the clues, so it isn't a fair puzzle.
    expect(lineSolveRounds([[1], [1]], [[1], [1]])).toBeNull();
  });
});

describe("generateDailyPicture", () => {
  it("draws a solvable, symmetric picture every day for a year, without the fallback", () => {
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10);
      const picture = dailyPicture(day);
      expect(picture).not.toBeNull();
      for (const row of picture!) expect(row).toEqual([...row].reverse());
      const { rows, cols } = clues(picture!);
      expect(lineSolveRounds(rows, cols)).not.toBeNull();
    }
  });

  it("matches its clues to its solution", () => {
    const puzzle = generateDailyPicture("2026-10-31");
    const filled = puzzle.solution.map((row) => row.map((cell) => cell === "#"));
    expect(puzzle.rowClues).toEqual(clues(filled).rows);
    expect(puzzle.colClues).toEqual(clues(filled).cols);
    expect(puzzle.given.flat().some(Boolean)).toBe(false);
  });
});
