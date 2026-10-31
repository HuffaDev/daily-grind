import { describe, expect, it } from "bun:test";
import { getDailyPuzzleNumber } from "./daily";

describe("getDailyPuzzleNumber", () => {
  it("counts from launch day as #1", () => {
    expect(getDailyPuzzleNumber("2026-10-31")).toBe(1);
    expect(getDailyPuzzleNumber("2026-11-01")).toBe(2);
    expect(getDailyPuzzleNumber("2027-10-31")).toBe(366);
  });
});
