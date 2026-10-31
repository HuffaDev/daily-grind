import { describe, expect, it } from "bun:test";
import { getPuzzleId, getUtcDateKey } from "@/platform/daily";
import { getDailyBoard } from "@/platform/server/leaderboard";
import { createSession, verifySession } from "@/platform/server/session";
import { spectrum } from "../meta";
import { applySpectrumAction } from "../server/game";
import { averages, dailyRounds, roundPoints, scoreMarks, SUBJECTS, validMarks } from "./rounds";

describe("rounds", () => {
  it("gives three different subjects on different scales, without repeats for months", () => {
    const seen = new Set<string>();
    for (let i = 0; i < Math.floor(SUBJECTS.length / 3); i++) {
      const rounds = dailyRounds(new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10));
      expect(new Set(rounds.map((r) => r.left)).size).toBe(3);
      for (const r of rounds) {
        expect(seen.has(r.subject)).toBe(false);
        seen.add(r.subject);
      }
    }
  });

  it("scores closeness to the average", () => {
    expect(roundPoints(0)).toBe(200);
    expect(roundPoints(10)).toBe(150);
    expect(roundPoints(55)).toBe(0);
    expect(averages([[0, 50, 100], [100, 50, 0]])).toEqual([50, 50, 50]);
    expect(scoreMarks([40, 50, 70], [50, 50, 50])).toEqual({ points: 150 + 200 + 100, averageMiss: 10 });
    expect(validMarks([0, 50, 100])).toBe(true);
    expect(validMarks([0, 50, 101])).toBe(false);
    expect(validMarks([0, 50])).toBe(false);
  });
});

describe("applySpectrumAction", () => {
  const puzzleId = getPuzzleId(getUtcDateKey(), spectrum.puzzleVersion);
  const player = (userId: string) =>
    verifySession(createSession({ userId, name: `P${userId}`, avatarPath: null, scope: "guild:spectrum" }))!;

  it("hides the room until you've played, and rescores everyone as players join", async () => {
    expect((await applySpectrumAction(player("1"), puzzleId, "sync", {})).game).toEqual({ marks: null, room: null, points: 0 });
    const first = await applySpectrumAction(player("1"), puzzleId, "submit", { marks: [20, 50, 80] });
    expect(first.game).toEqual({ marks: [20, 50, 80], room: { means: [20, 50, 80], players: 1 }, points: 600 });
    const second = await applySpectrumAction(player("2"), puzzleId, "submit", { marks: [40, 50, 80] });
    expect(second.game.room).toEqual({ means: [30, 50, 80], players: 2 });
    const board = await getDailyBoard("guild:spectrum", spectrum, puzzleId);
    expect(board.map((e) => e.points)).toEqual([550, 550]);
    // Marks are final.
    const again = await applySpectrumAction(player("1"), puzzleId, "submit", { marks: [90, 90, 90] });
    expect(again.game.marks).toEqual([20, 50, 80]);
  });

  it("rejects marks out of range", async () => {
    await expect(applySpectrumAction(player("3"), puzzleId, "submit", { marks: [1, 2, 300] })).rejects.toThrow("Invalid marks");
  });
});
