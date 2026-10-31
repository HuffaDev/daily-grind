import { describe, expect, it } from "bun:test";
import { allTimeStandings } from "./allTime";
import { BoardEntry } from "./store";

function entry(userId: string, fields: Partial<BoardEntry> = {}): BoardEntry {
  return {
    userId,
    name: `Player ${userId}`,
    avatarPath: null,
    points: 100,
    wordsSolved: 10,
    totalWords: 10,
    solvedTimeSeconds: 60,
    revealed: false,
    updatedAt: 0,
    ...fields,
  };
}

const unsolved = { points: 20, solvedTimeSeconds: null, wordsSolved: 2 };

describe("allTimeStandings", () => {
  it("totals points and solves, ranked by points", () => {
    const standings = allTimeStandings(
      {
        "2026-10-28.v1": [entry("a", { points: 90 }), entry("b", { points: 80 })],
        "2026-10-29.v1": [entry("a", unsolved), entry("b", { points: 95, solvedTimeSeconds: 40 })],
      },
      "2026-10-30"
    );
    expect(standings.map((s) => [s.userId, s.points, s.played, s.solved])).toEqual([
      ["b", 175, 2, 2],
      ["a", 110, 2, 1],
    ]);
    expect(standings[0]).toMatchObject({ bestTimeSeconds: 40, averageTimeSeconds: 50 });
    expect(standings[1]).toMatchObject({ bestTimeSeconds: 60, averageTimeSeconds: 60 });
  });

  it("awards wins for finished days only, and only to a solve", () => {
    const standings = allTimeStandings(
      {
        "2026-10-28.v1": [entry("a", { points: 90 }), entry("b", { points: 80 })],
        // Nobody solved it, so nobody won it
        "2026-10-29.v1": [entry("a", unsolved)],
        // Still being played
        "2026-10-30.v1": [entry("b", { points: 99 })],
      },
      "2026-10-30"
    );
    const wins = Object.fromEntries(standings.map((s) => [s.userId, s.wins]));
    expect(wins).toEqual({ a: 1, b: 0 });
  });

  it("keeps a streak alive until today's puzzle is missed", () => {
    const boards = {
      "2026-10-27.v1": [entry("a")],
      "2026-10-28.v1": [entry("a")],
      "2026-10-29.v1": [entry("a")],
    };
    expect(allTimeStandings(boards, "2026-10-30")[0].currentStreak).toBe(3);
    expect(allTimeStandings(boards, "2026-10-31")[0].currentStreak).toBe(0);
    const solvedToday = { ...boards, "2026-10-30.v1": [entry("a")] };
    expect(allTimeStandings(solvedToday, "2026-10-30")[0].currentStreak).toBe(4);
  });

  it("counts a date once across puzzle versions and shows the latest name", () => {
    const standings = allTimeStandings(
      {
        "2026-10-29.v1": [entry("a", { ...unsolved, name: "Old name", updatedAt: 1 })],
        "2026-10-29.v2": [entry("a", { name: "New name", updatedAt: 2 })],
      },
      "2026-10-30"
    );
    expect(standings[0]).toMatchObject({ name: "New name", played: 1, solved: 1, points: 100 });
  });
});
