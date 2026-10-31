import { describe, expect, it } from "bun:test";
import { applyGame, DEFAULT_STATS } from "./stats";

const win = (timeSeconds: number) => ({ won: true, timeSeconds });
const reveal = { won: false, timeSeconds: 0 };

describe("applyGame", () => {
  it("counts revealed games as played but not won", () => {
    let stats = applyGame(DEFAULT_STATS, "2026-10-29", win(90));
    stats = applyGame(stats, "2026-10-30", reveal);
    expect(stats).toMatchObject({ gamesPlayed: 2, gamesWon: 1, currentStreak: 0, bestStreak: 1 });
  });

  it("counts each puzzle date once", () => {
    let stats = applyGame(DEFAULT_STATS, "2026-10-30", win(90));
    stats = applyGame(stats, "2026-10-30", win(60));
    expect(stats).toMatchObject({ gamesPlayed: 1, gamesWon: 1, bestTimeSeconds: 90 });
  });

  it("extends the streak on consecutive puzzle dates and restarts it after a gap", () => {
    let stats = applyGame(DEFAULT_STATS, "2026-10-28", win(90));
    stats = applyGame(stats, "2026-10-29", win(80));
    expect(stats.currentStreak).toBe(2);
    stats = applyGame(stats, "2026-10-31", win(70));
    expect(stats).toMatchObject({ currentStreak: 1, bestStreak: 2, bestTimeSeconds: 70 });
  });
});
