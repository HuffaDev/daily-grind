import { describe, expect, it } from "bun:test";
import { Cycle, makeSchedule } from "./schedule";

const pool = Array.from({ length: 20 }, (_, i) => i);

describe("Cycle", () => {
  it("uses every item once before any comes round again", () => {
    const cycle = new Cycle(pool, "test");
    const first = Array.from({ length: 20 }, () => cycle.take());
    expect([...first].sort((a, b) => a - b)).toEqual(pool);
  });

  it("gives the same order every time, so everyone gets the same puzzle", () => {
    const a = new Cycle(pool, "same");
    const b = new Cycle(pool, "same");
    expect(Array.from({ length: 50 }, () => a.take())).toEqual(Array.from({ length: 50 }, () => b.take()));
  });

  it("keeps a long gap between repeats, even across reshuffles", () => {
    const cycle = new Cycle(pool, "gap");
    const taken = Array.from({ length: 400 }, () => cycle.take());
    for (let i = 15; i < taken.length; i++) expect(taken.slice(i - 15, i)).not.toContain(taken[i]);
  });

  it("skips ahead to an item that fits, or borrows one when none is left", () => {
    const cycle = new Cycle(pool, "skip");
    const evens = Array.from({ length: 10 }, () => cycle.take((n) => n % 2 === 0));
    expect(evens.every((n) => n % 2 === 0)).toBe(true);
    expect(cycle.take((n) => n === evens[0])).toBe(evens[0]);
  });
});

describe("makeSchedule", () => {
  it("gives the same day whichever day is asked for first", () => {
    let built = 0;
    const schedule = makeSchedule(() => built++);
    expect(schedule(3)).toBe(3);
    expect(schedule(1)).toBe(1);
  });
});
