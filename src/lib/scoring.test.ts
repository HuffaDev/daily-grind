import { describe, expect, it } from "bun:test";
import {
  COMPLETION_BONUS,
  emptyScore,
  scoreAfterCheck,
  scoreAfterGrid,
  scoreAfterReveal,
  scoreBreakdown,
  timeBonus,
  wordPoints,
} from "./scoring";
import { emptyGrid, gridWithSlot, puzzleFor, solutionGrid, wrongLetterAt } from "./testUtils";

const puzzle = puzzleFor("2026-10-30");

describe("wordPoints", () => {
  it("is 10 per letter plus rare-letter bonuses", () => {
    expect(wordPoints("TEA")).toBe(30);
    expect(wordPoints("JAZZY")).toBe(75);
  });
});

describe("timeBonus", () => {
  it("decays linearly from 200 to 0 over ten minutes", () => {
    expect(timeBonus(0)).toBe(200);
    expect(timeBonus(90)).toBe(170);
    expect(timeBonus(300)).toBe(100);
    expect(timeBonus(600)).toBe(0);
    expect(timeBonus(900)).toBe(0);
  });
});

describe("scoring a game", () => {
  it("banks a correct word and keeps it after the word is broken", () => {
    const slot = puzzle.slots[0];
    let score = scoreAfterGrid(puzzle, emptyScore(), gridWithSlot(puzzle, slot), 5);
    expect(score.solvedWords).toEqual([slot.id]);
    score = scoreAfterGrid(puzzle, score, emptyGrid(puzzle), 6);
    expect(scoreBreakdown(puzzle, score).words).toBe(wordPoints(slot.answer));
  });

  it("awards completion and time bonuses on a full solve", () => {
    const score = scoreAfterGrid(puzzle, emptyScore(), solutionGrid(puzzle), 90);
    const breakdown = scoreBreakdown(puzzle, score);
    expect(score.solvedTimeSeconds).toBe(90);
    expect(breakdown.completion).toBe(COMPLETION_BONUS);
    expect(breakdown.time).toBe(170);
  });

  it("charges 5 per wrong cell on Check, but not after finishing", () => {
    const [r, c] = puzzle.slots[0].cellCoords[0];
    const grid = emptyGrid(puzzle);
    grid[r][c] = wrongLetterAt(puzzle, r, c);
    const result = scoreAfterCheck(puzzle, emptyScore(), grid);
    expect(result.wrongCells).toEqual([`${r},${c}`]);
    expect(result.record.checkPenalty).toBe(5);

    const solved = scoreAfterGrid(puzzle, emptyScore(), solutionGrid(puzzle), 60);
    expect(scoreAfterCheck(puzzle, solved, grid).record.checkPenalty).toBe(0);
  });

  it("checks only the given cells, reporting right and wrong letters", () => {
    const slot = puzzle.slots[0];
    const grid = gridWithSlot(puzzle, slot);
    const [[r0, c0], [r1, c1]] = slot.cellCoords;
    grid[r1][c1] = wrongLetterAt(puzzle, r1, c1);
    const word = slot.cellCoords.map(([r, c]) => `${r},${c}`);

    const letter = scoreAfterCheck(puzzle, emptyScore(), grid, [`${r0},${c0}`]);
    expect(letter.correctCells).toEqual([`${r0},${c0}`]);
    expect(letter.wrongCells).toEqual([]);
    expect(letter.record.checkPenalty).toBe(0);

    const whole = scoreAfterCheck(puzzle, emptyScore(), grid, word);
    expect(whole.wrongCells).toEqual([`${r1},${c1}`]);
    expect(whole.correctCells).toHaveLength(word.length - 1);
    expect(whole.record.checkPenalty).toBe(5);
  });

  it("keeps earned words after Reveal but gives no bonuses for the revealed grid", () => {
    const slot = puzzle.slots[0];
    let score = scoreAfterGrid(puzzle, emptyScore(), gridWithSlot(puzzle, slot), 5);
    score = scoreAfterReveal(score);
    score = scoreAfterGrid(puzzle, score, solutionGrid(puzzle), 6);
    expect(scoreBreakdown(puzzle, score)).toMatchObject({
      words: wordPoints(slot.answer),
      completion: 0,
      time: 0,
    });
  });

  it("never goes below zero", () => {
    const score = { ...emptyScore(), checkPenalty: 500 };
    expect(scoreBreakdown(puzzle, score).total).toBe(0);
  });
});
