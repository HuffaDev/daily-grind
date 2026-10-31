import { describe, expect, it } from "bun:test";
import { commonWords } from "@/games/shared/words/words";
import { invalidMoves } from "@/platform/stepGame/rules";
import { generateDailyLadder } from "./generator";
import { LADDER_RULES, LadderPuzzle } from "./rules";

const puzzle: LadderPuzzle = { start: "cold", target: "warm", par: 4, words: ["cold", "cord", "card", "ward", "warm", "word"] };

describe("LADDER_RULES", () => {
  it("allows one-letter changes to listed words, once each", () => {
    expect(LADDER_RULES.invalidMove(puzzle, [], "cord")).toBeNull();
    expect(LADDER_RULES.invalidMove(puzzle, [], "card")).toBe("Change exactly one letter");
    expect(LADDER_RULES.invalidMove(puzzle, [], "colt")).toBe("Not in the word list");
    expect(LADDER_RULES.invalidMove(puzzle, ["cord"], "cold")).toBe("Already used");
    expect(LADDER_RULES.invalidMove(puzzle, [], "cords")).toBe("Words have 4 letters");
  });

  it("scores par and over par, and counts letters in place as progress", () => {
    const par = ["cord", "card", "ward", "warm"];
    expect(LADDER_RULES.isSolved(puzzle, par)).toBe(true);
    expect(LADDER_RULES.skillPoints(puzzle, par)).toBe(0);
    expect(LADDER_RULES.skillPoints(puzzle, ["cord", "word", "ward", "card", "cord", "warm"])).toBe(-80);
    expect(LADDER_RULES.progress(puzzle, ["cord", "card"])).toEqual({ done: 2, total: 4 });
  });
});

describe("generateDailyLadder", () => {
  it("builds a fair ladder from common words every day for a year", () => {
    const common = new Set(commonWords(4));
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10);
      const { puzzle: p, solution } = generateDailyLadder(day);
      expect(invalidMoves(LADDER_RULES, p, solution)).toBeNull();
      expect(LADDER_RULES.isSolved(p, solution)).toBe(true);
      expect(solution.length).toBe(p.par);
      expect([p.start, ...solution].every((w) => common.has(w))).toBe(true);
    }
  });
});
