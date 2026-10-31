import { describe, expect, it } from "bun:test";
import { GUESSES, PUZZLES } from "./content";
import { dailyPuzzles, KINDS, parseGuess, playFiveClues, replay, shareLine, suggestions } from "./rules";

describe("the puzzles", () => {
  it("are all valid: five clues, an answer on the guess list, one of each answer", () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.clues).toHaveLength(5);
      expect(GUESSES[puzzle.kind]).toContain(puzzle.answer);
    }
    expect(new Set(PUZZLES.map((puzzle) => puzzle.answer)).size).toBe(PUZZLES.length);
    for (const kind of KINDS) expect(new Set(GUESSES[kind]).size).toBe(GUESSES[kind].length);
  });

  it("never name their own answer in a clue", () => {
    for (const puzzle of PUZZLES) {
      for (const word of puzzle.answer.split(" ").filter((part) => part.length > 2)) {
        for (const clue of puzzle.clues) expect(`${puzzle.answer}: ${clue}`).not.toMatch(new RegExp(`: .*\\b${word}`, "i"));
      }
    }
  });
});

describe("dailyPuzzles", () => {
  it("gives everyone a person, a country and an animal each day, with no repeats within a month", () => {
    const last = new Map<string, number>();
    for (let day = 0; day < 365; day++) {
      const dateKey = new Date(Date.UTC(2026, 0, day + 1)).toISOString().slice(0, 10);
      const puzzles = dailyPuzzles(dateKey);
      expect(puzzles.map((puzzle) => puzzle.kind)).toEqual(KINDS);
      for (const { answer } of puzzles) {
        if (last.has(answer)) expect(day - last.get(answer)!).toBeGreaterThanOrEqual(20);
        last.set(answer, day);
      }
    }
  });
});

describe("suggestions", () => {
  it("waits for two letters, so one keypress can't browse the list", () => {
    expect(suggestions("animal", "o")).toEqual([]);
  });

  it("matches the start of any word, ignoring case and accents", () => {
    expect(suggestions("person", "CURÍE")).toEqual(["Marie Curie"]);
    expect(suggestions("country", "zeala")).toEqual(["New Zealand"]);
    expect(suggestions("country", "pan")).toEqual(["Panama"]);
    expect(suggestions("country", "holl")).toEqual(["Netherlands"]);
  });

  it("leaves out past guesses", () => {
    expect(suggestions("animal", "ow", ["Owl"])).toEqual([]);
  });
});

describe("playing a day", () => {
  const day = "2026-11-01";
  const puzzles = dailyPuzzles(day);
  const [first, second, third] = puzzles.map((puzzle) => puzzle.answer);
  const wrong = GUESSES.person.find((name) => name !== first)!;

  it("pays 250 on the first clue and 50 less for each clue after", () => {
    expect(playFiveClues(day, [first, second, third])).toMatchObject({ finished: true, solved: true, points: 750 });
    expect(playFiveClues(day, [null, first]).points).toBe(200);
    expect(playFiveClues(day, [null, null, null, null, first]).points).toBe(50);
  });

  it("shows the next clue after a wrong guess or a skip", () => {
    expect(replay(puzzles, [wrong, null])[0]).toEqual({ shown: 3, wrong: [wrong], outcome: null });
  });

  it("moves on with no points after the fifth clue, and a miss isn't a solve", () => {
    const result = playFiveClues(day, [null, null, null, null, null, second, third]);
    expect(result).toMatchObject({ finished: true, solved: false, points: 500 });
  });

  it("only accepts names on the list, or a skip, from a client", () => {
    expect(parseGuess(first)).toBe(first);
    expect(parseGuess(null)).toBeNull();
    for (const bad of ["not a name", 3, undefined]) expect(parseGuess(bad)).toBeUndefined();
  });

  it("shares the clues used without giving away an answer", () => {
    expect(shareLine(7, [{ solvedOnClue: 3 }, { solvedOnClue: 1 }, { solvedOnClue: null }])).toBe("🔎 Five Clues #7 🟧🟧🟦 🟦 🟧🟧🟧🟧🟧 400 pts");
  });
});
