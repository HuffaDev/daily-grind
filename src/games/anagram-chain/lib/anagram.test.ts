import { describe, expect, it } from "bun:test";
import { commonWords } from "@/games/shared/words/words";
import { invalidMoves } from "@/platform/stepGame/rules";
import { FINAL_LENGTH, generateDailyAnagram } from "./generator";
import { ANAGRAM_RULES, AnagramPuzzle } from "./rules";

const puzzle: AnagramPuzzle = { start: "ace", letters: "rhcegar", words: ["each", "acre", "race", "reach", "charge", "charger"] };

describe("ANAGRAM_RULES", () => {
  it("allows a word that adds one of the day's letters", () => {
    expect(ANAGRAM_RULES.invalidMove(puzzle, [], "each")).toBeNull();
    expect(ANAGRAM_RULES.invalidMove(puzzle, [], "reach")).toBe("Add one letter: 4 letters");
    expect(ANAGRAM_RULES.invalidMove(puzzle, ["each"], "chart")).toBe("Keep every letter of EACH");
    expect(ANAGRAM_RULES.invalidMove(puzzle, ["each", "reach"], "charge")).toBeNull();
    expect(ANAGRAM_RULES.invalidMove({ ...puzzle, letters: "acehr" }, [], "acre")).toBeNull();
    expect(ANAGRAM_RULES.invalidMove({ ...puzzle, letters: "aceh" }, [], "acre")).toBe("Use only the day's letters");
  });

  it("is solved once every letter is used", () => {
    expect(ANAGRAM_RULES.isSolved(puzzle, ["each", "reach", "charge", "charger"])).toBe(true);
    expect(ANAGRAM_RULES.progress(puzzle, ["each"])).toEqual({ done: 1, total: 4 });
  });
});

describe("generateDailyAnagram", () => {
  it("builds a chain of common words every day for a year", () => {
    const common = new Set(commonWords(FINAL_LENGTH));
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10);
      const { puzzle: p, solution } = generateDailyAnagram(day);
      expect(p.letters).toHaveLength(FINAL_LENGTH);
      expect(invalidMoves(ANAGRAM_RULES, p, solution)).toBeNull();
      expect(ANAGRAM_RULES.isSolved(p, solution)).toBe(true);
      expect(common.has(solution.at(-1)!)).toBe(true);
    }
  });
});
