import { describe, expect, it } from "bun:test";
import {
  buildGridShareText,
  emptyScore,
  isSolved,
  progress,
  reconcileWithServer,
  scoreAfterCheck,
  scoreAfterGrid,
  scoreAfterReveal,
  scoreBreakdown,
  startingGrid,
  summarizeGridEntry,
} from "./rules";
import { PUZZLE, RULES } from "./testFixtures";

const SOLVED = [
  ["#", "x"],
  ["#", "#"],
];

describe("grid rules", () => {
  it("starts with the givens filled in", () => {
    expect(startingGrid(PUZZLE)).toEqual([
      ["", ""],
      ["", "#"],
    ]);
  });

  it("treats a crossed cell like an empty one", () => {
    expect(isSolved(RULES, PUZZLE, SOLVED)).toBe(true);
    expect(isSolved(RULES, PUZZLE, [["#", ""], ["#", "#"]])).toBe(true);
    expect(isSolved(RULES, PUZZLE, [["#", "#"], ["#", "#"]])).toBe(false);
  });

  it("counts progress over the cells the player must fill, not givens", () => {
    expect(progress(RULES, PUZZLE, [["#", ""], ["", "#"]])).toEqual({ done: 1, total: 2 });
  });

  it("scores a solve with the time bonus, less check penalties", () => {
    let record = scoreAfterGrid(RULES, PUZZLE, emptyScore(), [["x", ""], ["#", "#"]], 10);
    record = scoreAfterCheck(RULES, PUZZLE, record, [["x", ""], ["#", "#"]]).record;
    expect(record.checkPenalty).toBe(5);
    record = scoreAfterGrid(RULES, PUZZLE, record, SOLVED, 300);
    expect(record.solvedTimeSeconds).toBe(300);
    expect(scoreBreakdown(RULES, record)).toEqual({ solve: 400, time: 100, reveal: 0, penalty: 5, total: 495 });
  });

  it("flags wrong entries only, within the cells asked about", () => {
    const grid = [["x", "#"], ["#", "#"]];
    expect(scoreAfterCheck(RULES, PUZZLE, emptyScore(), grid).wrongCells).toEqual(["0,0", "0,1"]);
    expect(scoreAfterCheck(RULES, PUZZLE, emptyScore(), grid, ["0,1"]).wrongCells).toEqual(["0,1"]);
    expect(scoreAfterCheck(RULES, PUZZLE, emptyScore(), grid).correctCells).toEqual(["1,0"]);
  });

  it("keeps a little for cells done before a reveal, and no solve bonus", () => {
    const record = scoreAfterReveal(RULES, PUZZLE, emptyScore(), [["", ""], ["#", "#"]]);
    expect(scoreBreakdown(RULES, record)).toEqual({ solve: 0, time: 0, reveal: 10, penalty: 0, total: 10 });
    // A revealed grid is complete but never scores as a solve.
    expect(scoreAfterGrid(RULES, PUZZLE, record, SOLVED, 5).solvedTimeSeconds).toBeNull();
  });
});

describe("reconcileWithServer", () => {
  const local = { grid: [["#", ""], ["", "#"]], score: emptyScore(), elapsedSeconds: 40 };

  it("uploads local progress the server lacks", () => {
    expect(reconcileWithServer(PUZZLE, local, null).upload).toBe("progress");
    const server = { grid: startingGrid(PUZZLE), elapsedSeconds: 50, score: emptyScore(), points: 0 };
    const merged = reconcileWithServer(PUZZLE, local, server);
    expect(merged).toMatchObject({ grid: local.grid, elapsedSeconds: 50, upload: "progress" });
  });

  it("takes a finished game from the server", () => {
    const score = { ...emptyScore(), solvedTimeSeconds: 30 };
    const merged = reconcileWithServer(PUZZLE, local, { grid: SOLVED, elapsedSeconds: 30, score, points: 600 });
    expect(merged).toMatchObject({ grid: SOLVED, score, upload: "none" });
  });

  it("sends a local reveal up as a reveal", () => {
    const revealed = { ...local, score: { ...emptyScore(), revealed: true } };
    expect(reconcileWithServer(PUZZLE, revealed, null).upload).toBe("reveal");
  });
});

describe("summaries", () => {
  it("summarizes leaderboard rows and share text", () => {
    expect(summarizeGridEntry(83, { done: 2, total: 2, revealed: false })).toBe("✅ 1:23");
    expect(summarizeGridEntry(null, { done: 3, total: 9, revealed: true })).toBe("🔎 3/9");
    expect(summarizeGridEntry(null, { done: 3, total: 9, revealed: false })).toBe("3/9 cells");
    const text = buildGridShareText({
      name: "Mini Sudoku",
      emoji: "🔢",
      puzzleNumber: 2,
      record: { ...emptyScore(), solvedTimeSeconds: 95 },
      timeSeconds: 95,
      done: 24,
      total: 24,
      points: 618,
    });
    expect(text).toBe("🔢 Mini Sudoku #2\nSolved in 1:35 🎉 · 618 pts\nNo checks used ✨");
  });
});
