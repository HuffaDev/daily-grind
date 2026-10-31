import { describe, expect, it } from "bun:test";
import { buildShareText } from "./share";
import {
  COMPLETION_BONUS,
  emptyDay,
  isDayFinished,
  mergeProgress,
  puzzlePoints,
  scoreAfterProgress,
  scoreBreakdown,
  timeBonus,
} from "./scoring";
import { ChessPuzzle } from "./types";

const skewer: ChessPuzzle = {
  id: "UnBrP",
  fen: "7r/8/1Pk2p2/1R2p3/P3p3/4P3/3K4/8 w - - 3 44",
  moves: ["b5b2", "h8h2", "d2c3", "h2b2", "c3b2", "c6b6"],
  rating: 1284,
  mateIn: null,
};
const solution = ["h8h2", "h2b2", "c6b6"];
const puzzles = [skewer, skewer, skewer];

describe("puzzlePoints", () => {
  it("pays the tier's points for a solve, less a third per mistake", () => {
    expect(puzzlePoints(skewer, 0, { line: solution, mistakes: 0, revealed: false })).toBe(100);
    expect(puzzlePoints(skewer, 2, { line: solution, mistakes: 1, revealed: false })).toBe(133);
    expect(puzzlePoints(skewer, 0, { line: solution, mistakes: 5, revealed: false })).toBe(0);
  });

  it("pays nothing for an unsolved or revealed puzzle", () => {
    expect(puzzlePoints(skewer, 0, { line: solution.slice(0, 2), mistakes: 0, revealed: false })).toBe(0);
    expect(puzzlePoints(skewer, 0, { line: [], mistakes: 0, revealed: true })).toBe(0);
  });
});

describe("scoreAfterProgress", () => {
  it("sets the solve time once every puzzle is solved", () => {
    let day = emptyDay(3);
    day.puzzles[0] = { line: solution, mistakes: 0, revealed: false };
    day = scoreAfterProgress(puzzles, day, 50);
    expect(day.solvedTimeSeconds).toBeNull();
    day.puzzles = day.puzzles.map(() => ({ line: solution, mistakes: 0, revealed: false }));
    day = scoreAfterProgress(puzzles, day, 120);
    expect(day.solvedTimeSeconds).toBe(120);
    expect(scoreBreakdown(puzzles, day).total).toBe(100 + 150 + 200 + COMPLETION_BONUS + timeBonus(120));
  });

  it("never counts a day with a revealed puzzle as solved", () => {
    const day = emptyDay(3);
    day.puzzles = [
      { line: solution, mistakes: 0, revealed: false },
      { line: solution, mistakes: 0, revealed: false },
      { line: [], mistakes: 0, revealed: true },
    ];
    expect(isDayFinished(puzzles, day)).toBe(true);
    expect(scoreAfterProgress(puzzles, day, 60).solvedTimeSeconds).toBeNull();
    expect(scoreBreakdown(puzzles, day).total).toBe(250);
  });
});

describe("mergeProgress", () => {
  it("keeps the longer line, the most mistakes, and any reveal", () => {
    const merged = mergeProgress(
      skewer,
      { line: ["h8h2"], mistakes: 2, revealed: false },
      { line: ["h8h2", "h2b2"], mistakes: 1, revealed: true }
    );
    expect(merged).toEqual({ line: ["h8h2", "h2b2"], mistakes: 2, revealed: true });
  });

  it("drops wrong moves from an upload", () => {
    const merged = mergeProgress(skewer, { line: [], mistakes: 0, revealed: false }, {
      line: ["h8h2", "h2h1"],
      mistakes: 0,
      revealed: false,
    });
    expect(merged.line).toEqual(["h8h2"]);
  });

  it("freezes a puzzle revealed unsolved, so the solution can't be replayed", () => {
    const merged = mergeProgress(skewer, { line: [], mistakes: 0, revealed: true }, {
      line: solution,
      mistakes: 0,
      revealed: false,
    });
    expect(merged.line).toEqual([]);
  });
});

describe("buildShareText", () => {
  it("shows one row per puzzle", () => {
    const day = emptyDay(3);
    day.puzzles = [
      { line: solution, mistakes: 0, revealed: false },
      { line: solution, mistakes: 1, revealed: false },
      { line: ["h8h2"], mistakes: 0, revealed: true },
    ];
    expect(buildShareText({ puzzles, day, puzzleNumber: 3, timeSeconds: 95, points: 200 })).toBe(
      ["Daily Chess #3", "Solved 2/3 🔎 · 200 pts", "", "Easy: 🟩🟩🟩", "Medium: 🟥🟩🟩🟩", "Hard: 🟩🔎"].join("\n")
    );
  });
});
