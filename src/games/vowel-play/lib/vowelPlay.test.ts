import { describe, expect, it } from "bun:test";
import { invalidMoves, scoreBreakdown } from "@/platform/stepGame/rules";
import { CLUES_PER_DAY, generateDailyVowelPlay } from "./generator";
import {
  cleanGuess,
  consonants,
  makeClue,
  PASS,
  stateAfter,
  stripVowels,
  VOWEL_PLAY_RULES,
  VowelPlayPuzzle,
} from "./rules";
import { MOVIES, TV_SHOWS } from "./titles";

const ALL = [...MOVIES, ...TV_SHOWS];

describe("stripping vowels", () => {
  it("keeps only the consonants, dropping word gaps and punctuation", () => {
    expect(stripVowels("Breaking Bad")).toBe("BRKNGBD");
    expect(stripVowels("Spider-Man")).toBe("SPDRMN");
    expect(stripVowels("A Quiet Place")).toBe("QTPLC");
    expect(stripVowels("Schindler's List")).toBe("SCHNDLRSLST");
    expect(stripVowels("Mad Max: Fury Road")).toBe("MDMXFRYRD");
  });

  it("cleans guesses the same way as titles", () => {
    expect(cleanGuess("  Spider-MAN!! ")).toBe("spider man");
    expect(cleanGuess("Amélie")).toBe("amelie");
    expect(cleanGuess("Thelma & Louise")).toBe("thelma and louise");
  });
});

describe("the title list", () => {
  it("has every title once, even ignoring case, spaces and punctuation", () => {
    const keys = ALL.map((t) => cleanGuess(t).replace(/ /g, ""));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it("only has titles that make fair clues", () => {
    const bad = ALL.filter(
      (t) =>
        !/^[A-Za-z0-9 ':,.!?-]+$/.test(t) ||
        cleanGuess(t).length > 32 ||
        consonants(t).length < 4
    );
    expect(bad).toEqual([]);
  });
});

const SALT = "test";
const puzzle: VowelPlayPuzzle = {
  salt: SALT,
  clues: [makeClue(SALT, "Breaking Bad", "tv"), makeClue(SALT, "Toy Story", "movie")],
};
const rules = VOWEL_PLAY_RULES;

describe("guessing", () => {
  it("moves on after a right answer, spaces or not", () => {
    expect(rules.invalidMove(puzzle, [], "breaking bad")).toBeNull();
    expect(stateAfter(puzzle, ["breakingbad"]).current).toBe(1);
  });

  it("refuses guesses that don't fit the letters, without penalty", () => {
    expect(rules.invalidMove(puzzle, [], "better call saul")).toBe("Those letters don't match");
    expect(rules.invalidMove(puzzle, [], "Breaking Bad")).toBe("Type a title");
  });

  it("counts a fitting wrong guess, once", () => {
    // Same consonants, wrong vowels.
    expect(rules.invalidMove(puzzle, [], "broking bed")).toBeNull();
    const state = stateAfter(puzzle, ["broking bed"]);
    expect(state).toMatchObject({ current: 0, wrong: 1, wrongHere: ["broking bed"] });
    expect(rules.invalidMove(puzzle, ["broking bed"], "brokingbed")).toBe("Already tried that");
  });

  it("solves once every title is answered or passed, and scores the penalties", () => {
    const moves = ["broking bed", "breaking bad", PASS];
    expect(invalidMoves(rules, puzzle, moves)).toBeNull();
    expect(rules.isSolved(puzzle, moves)).toBe(true);
    expect(rules.progress(puzzle, moves)).toEqual({ done: 1, total: 2 });
    const breakdown = scoreBreakdown(rules, puzzle, moves, { solvedTimeSeconds: 180, gaveUp: false });
    expect(breakdown).toEqual({ solve: 400, time: 100, skill: -70, giveUp: 0, total: 430 });
    expect(stateAfter(puzzle, moves).results.map((r) => r.status)).toEqual(["right", "passed"]);
  });

  it("is never worth anything to pass everything", () => {
    const moves = Array(CLUES_PER_DAY).fill(PASS);
    const day = generateDailyVowelPlay("2026-11-01").puzzle;
    expect(scoreBreakdown(rules, day, moves, { solvedTimeSeconds: 0, gaveUp: false }).total).toBe(0);
  });
});

describe("daily puzzles", () => {
  it("are the same for a date, with answers that check out", () => {
    const { puzzle: day, solution } = generateDailyVowelPlay("2026-11-05");
    expect(generateDailyVowelPlay("2026-11-05")).toEqual({ puzzle: day, solution });
    expect(day.clues).toHaveLength(CLUES_PER_DAY);
    const answers = solution.map(cleanGuess);
    expect(invalidMoves(rules, day, answers)).toBeNull();
    expect(rules.isSolved(day, answers)).toBe(true);
  });

  it("don't repeat a title until the whole list has been used", () => {
    const days = Math.floor(ALL.length / CLUES_PER_DAY);
    const seen: string[] = [];
    for (let d = 0; d < days; d++) {
      const date = new Date(Date.UTC(2026, 9, 31 + d)).toISOString().slice(0, 10);
      seen.push(...generateDailyVowelPlay(date).solution);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("never send the titles to the browser", () => {
    const { puzzle: day, solution } = generateDailyVowelPlay("2026-11-05");
    const sent = JSON.stringify(day).toLowerCase();
    for (const title of solution) expect(sent).not.toContain(cleanGuess(title));
  });
});
