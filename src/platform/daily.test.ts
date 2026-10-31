import { describe, expect, it } from "bun:test";
import { getDailyPuzzleNumber, getPuzzleId, parsePuzzleId, previousDateKey } from "./daily";

describe("getDailyPuzzleNumber", () => {
  it("counts from launch day as #1", () => {
    expect(getDailyPuzzleNumber("2026-10-31")).toBe(1);
    expect(getDailyPuzzleNumber("2026-11-01")).toBe(2);
    expect(getDailyPuzzleNumber("2027-10-31")).toBe(366);
  });
});

describe("previousDateKey", () => {
  it("steps back one UTC day across month and year boundaries", () => {
    expect(previousDateKey("2026-10-30")).toBe("2026-10-29");
    expect(previousDateKey("2026-03-01")).toBe("2026-02-28");
    expect(previousDateKey("2027-01-01")).toBe("2026-12-31");
  });
});

describe("puzzle ids", () => {
  it("round-trip the date and version", () => {
    expect(parsePuzzleId(getPuzzleId("2026-10-31", 3))).toEqual({ dateKey: "2026-10-31", version: 3 });
    expect(parsePuzzleId("2026-10-31")).toBeNull();
  });
});
