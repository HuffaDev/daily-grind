import { describe, expect, it } from "bun:test";
import { BOX_COLS, BOX_ROWS, generateDailySudoku, SIZE, solvesWithSingles } from "./generator";

const days = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10));

function units(grid: string[][]): string[][] {
  const result: string[][] = [];
  for (let i = 0; i < SIZE; i++) {
    result.push(grid[i]);
    result.push(grid.map((row) => row[i]));
  }
  for (let br = 0; br < SIZE; br += BOX_ROWS) {
    for (let bc = 0; bc < SIZE; bc += BOX_COLS) {
      result.push(grid.slice(br, br + BOX_ROWS).flatMap((row) => row.slice(bc, bc + BOX_COLS)));
    }
  }
  return result;
}

describe("generateDailySudoku", () => {
  it("is the same puzzle for the same day, and a new one the next", () => {
    expect(generateDailySudoku("2026-10-31")).toEqual(generateDailySudoku("2026-10-31"));
    expect(generateDailySudoku("2026-11-01").solution).not.toEqual(generateDailySudoku("2026-10-31").solution);
  });

  it("makes valid solutions that need no guessing", () => {
    for (const day of days) {
      const { solution, given } = generateDailySudoku(day);
      for (const unit of units(solution)) expect([...unit].sort().join("")).toBe("123456");
      const clues = solution.map((row, r) => row.map((d, c) => (given[r][c] ? Number(d) : 0)));
      expect(solvesWithSingles(clues)).toBe(true);
    }
  });

  it("gives more clues early in the week", () => {
    const givens = (day: string) => generateDailySudoku(day).given.flat().filter(Boolean).length;
    expect(givens("2026-11-02")).toBe(14); // a Monday
    expect(givens("2026-11-08")).toBeLessThanOrEqual(12); // a Sunday
  });
});
