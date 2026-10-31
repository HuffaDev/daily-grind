import { describe, expect, it } from "bun:test";
import { invalidMoves } from "@/platform/stepGame/rules";
import { generateDailyHeist, guardAt, guardSight, HEIST_RULES, HeistPuzzle, solve } from "./heist";

// A corridor with a guard pacing the middle of the bottom row.
const puzzle: HeistPuzzle = {
  map: [".......", ".......", ".......", ".......", ".......", "....#..", "......."],
  start: [0, 0],
  loot: [0, 3],
  exit: [0, 6],
  guards: [
    [
      [6, 1],
      [6, 2],
      [6, 3],
    ],
  ],
  par: 6,
};

describe("guards", () => {
  it("pace their route back and forth", () => {
    expect([0, 1, 2, 3, 4, 5].map((t) => guardAt(puzzle.guards[0], t))).toEqual([
      [6, 1],
      [6, 2],
      [6, 3],
      [6, 2],
      [6, 1],
      [6, 2],
    ]);
  });

  it("see their own square and the way they're heading, until a wall", () => {
    expect(guardSight(puzzle.map, puzzle.guards[0], 0)).toEqual([
      [6, 1],
      [6, 2],
      [6, 3],
    ]);
    const column: HeistPuzzle["guards"][0] = [
      [3, 4],
      [4, 4],
    ];
    // Heading down, its view stops at the wall at (5,4).
    expect(guardSight(puzzle.map, column, 0)).toEqual([
      [3, 4],
      [4, 4],
    ]);
  });
});

describe("HEIST_RULES", () => {
  it("blocks walls and being seen", () => {
    expect(HEIST_RULES.invalidMove(puzzle, [], "U")).toBe("There's a wall there");
    expect(HEIST_RULES.invalidMove(puzzle, [], "R")).toBeNull();
    const nearGuard = { ...puzzle, start: [5, 3] as [number, number] };
    expect(HEIST_RULES.invalidMove(nearGuard, [], "D")).toBe("A guard would spot you");
  });

  it("needs the loot before the exit", () => {
    const route = ["R", "R", "R", "R", "R", "R"];
    expect(HEIST_RULES.isSolved(puzzle, route)).toBe(true);
    expect(HEIST_RULES.progress(puzzle, route.slice(0, 3))).toEqual({ done: 1, total: 2 });
    expect(solve(puzzle)).toEqual(route);
  });
});

describe("generateDailyHeist", () => {
  it("makes a job where the guards matter every day for a year", () => {
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10);
      const { puzzle: p, solution } = generateDailyHeist(day);
      expect(invalidMoves(HEIST_RULES, p, solution)).toBeNull();
      expect(HEIST_RULES.isSolved(p, solution)).toBe(true);
      expect(solution.length).toBe(p.par);
      expect(p.par).toBeGreaterThan(solve(p, true)!.length);
    }
  });
});
