import { describe, expect, it } from "bun:test";
import { buildShareText } from "./share";
import { puzzleFor } from "./testUtils";

const puzzle = puzzleFor("2026-10-30");
const whiteCells = puzzle.cells.flat().filter((cell) => !cell.black).length;
const count = (text: string, emoji: string) => text.split(emoji).length - 1;

describe("buildShareText", () => {
  it("is all green for a solve", () => {
    const text = buildShareText({ puzzle, puzzleNumber: 1, timeSeconds: 60, revealed: false });
    expect(count(text, "🟩")).toBe(whiteCells);
    expect(count(text, "🟨")).toBe(0);
  });

  it("keeps words solved before a reveal green", () => {
    const slot = puzzle.slots[0];
    const text = buildShareText({ puzzle, puzzleNumber: 1, timeSeconds: 60, revealed: true, solvedWords: [slot.id] });
    expect(count(text, "🟩")).toBe(slot.cellCoords.length);
    expect(count(text, "🟨")).toBe(whiteCells - slot.cellCoords.length);
    expect(text).toContain(`Revealed after solving 1/${puzzle.slots.length} words`);
  });
});
