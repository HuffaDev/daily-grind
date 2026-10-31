import { describe, expect, it } from "bun:test";
import {
  buildStepShareText,
  emptyScore,
  invalidMoves,
  reconcileWithServer,
  scoreAfterMoves,
  scoreBreakdown,
  summarizeStepEntry,
} from "./rules";
import { COUNT_RULES } from "./testFixtures";

describe("step rules", () => {
  it("checks a whole move list, and allows nothing after a solve", () => {
    expect(invalidMoves(COUNT_RULES, 3, ["1", "2", "3"])).toBeNull();
    expect(invalidMoves(COUNT_RULES, 3, ["1", "3"])).toBe("Count up by one");
    expect(invalidMoves(COUNT_RULES, 3, ["1", "2", "3", "4"])).toBe("Already solved");
    expect(invalidMoves(COUNT_RULES, 3, Array(11).fill("1"))).toBe("Too many moves");
  });

  it("scores a solve with the time bonus and skill, and a give-up with its progress", () => {
    const solved = scoreAfterMoves(COUNT_RULES, 3, emptyScore(), ["1", "2", "3"], 150);
    expect(solved.solvedTimeSeconds).toBe(150);
    expect(scoreBreakdown(COUNT_RULES, 3, ["1", "2", "3"], solved)).toEqual({
      solve: 400,
      time: 100,
      skill: -30,
      giveUp: 0,
      total: 470,
    });
    const gaveUp = { ...emptyScore(), gaveUp: true };
    expect(scoreBreakdown(COUNT_RULES, 3, ["1"], gaveUp).total).toBe(10);
    // Giving up stops a later solve from scoring.
    expect(scoreAfterMoves(COUNT_RULES, 3, gaveUp, ["1", "2", "3"], 5)).toBe(gaveUp);
  });
});

describe("reconcileWithServer", () => {
  const local = { moves: ["1", "2"], score: emptyScore(), elapsedSeconds: 40 };

  it("uploads moves the server lacks, and keeps the server's finished game", () => {
    expect(reconcileWithServer(local, null).upload).toBe("progress");
    const server = { moves: ["1"], elapsedSeconds: 60, score: emptyScore(), points: 0 };
    expect(reconcileWithServer(local, server)).toMatchObject({ moves: ["1", "2"], elapsedSeconds: 60, upload: "progress" });
    const done = { ...server, moves: ["1", "2", "3"], score: { solvedTimeSeconds: 50, gaveUp: false } };
    expect(reconcileWithServer(local, done)).toMatchObject({ moves: ["1", "2", "3"], upload: "none" });
  });

  it("sends a local give-up up as one", () => {
    expect(reconcileWithServer({ ...local, score: { ...emptyScore(), gaveUp: true } }, null).upload).toBe("giveup");
  });
});

describe("summaries", () => {
  it("summarizes board rows and share text without the moves", () => {
    expect(summarizeStepEntry(83, { done: 2, total: 2, moves: 5, gaveUp: false }, "step")).toBe("✅ 1:23 · 5 steps");
    expect(summarizeStepEntry(null, { done: 1, total: 4, moves: 1, gaveUp: true }, "word")).toBe("🏳️ 1/4");
    const text = buildStepShareText({
      name: "Ladder",
      emoji: "🪜",
      puzzleNumber: 3,
      score: { solvedTimeSeconds: 95, gaveUp: false },
      timeSeconds: 95,
      detail: "5 steps (par 4)",
      points: 520,
    });
    expect(text).toBe("🪜 Ladder #3\nSolved in 1:35 🎉 · 520 pts\n5 steps (par 4)");
  });
});
