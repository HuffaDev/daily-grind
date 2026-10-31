import { describe, expect, it } from "bun:test";
import { generateDailyPuzzle } from "./generator";

describe("generateDailyPuzzle over a year", () => {
  const days = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10));
  const puzzles = days.map((day) => generateDailyPuzzle(day));
  const answers = puzzles.map((p) => p.slots.map((s) => s.answer));

  it("never repeats a grid", () => {
    expect(new Set(answers.map((a) => [...a].sort().join())).size).toBe(days.length);
  });

  it("doesn't lean on the same few words", () => {
    const uses = new Map<string, number>();
    for (const word of answers.flat()) uses.set(word, (uses.get(word) ?? 0) + 1);
    const [top, most] = [...uses].sort((a, b) => b[1] - a[1])[0];
    expect(`${top} ×${most}`).toBe(`${top} ×${Math.min(most, MAX_USES)}`);
  });

  it("keeps two-letter answers rare", () => {
    const all = answers.flat();
    expect(all.filter((w) => w.length === 2).length / all.length).toBeLessThan(0.06);
  });
});

/** The most days in a year any one answer may appear. */
const MAX_USES = 40;
