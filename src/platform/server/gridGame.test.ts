import { describe, expect, it } from "bun:test";
import type { GameInfo } from "@/games/types";
import { getPuzzleId, getUtcDateKey } from "../daily";
import { GridBoardDetail, startingGrid } from "../gridGame/rules";
import { PUZZLE, RULES } from "../gridGame/testFixtures";
import { applyGridAction, GridGameDef } from "./gridGame";
import { getDailyBoard } from "./leaderboard";
import { createSession, verifySession } from "./session";
import { BoardEntry } from "./store";

// Runs against the in-memory store with a made-up 2×2 game (see gridGame/testFixtures.ts).

const info: GameInfo = {
  id: "test-grid",
  name: "Test Grid",
  tagline: "",
  icon: "",
  emoji: "🧪",
  puzzleVersion: 1,
  summarizeToday: (entry) => `${(entry as BoardEntry<GridBoardDetail>).detail.done}`,
};
const def: GridGameDef = { info, rules: RULES, puzzleFor: () => PUZZLE };
const puzzleId = getPuzzleId(getUtcDateKey(), 1);
const SOLVED = [["#", "x"], ["#", "#"]];
let nextUser = 5000;

function newPlayer() {
  return verifySession(createSession({ userId: String(nextUser++), name: "Player", avatarPath: null, scope: "guild:grid" }))!;
}

describe("applyGridAction", () => {
  it("scores a solve with the slower of client and server time", async () => {
    const player = newPlayer();
    await applyGridAction(def, player, puzzleId, "progress", { grid: startingGrid(PUZZLE), elapsedSeconds: 30 });
    const { game } = await applyGridAction(def, player, puzzleId, "progress", { grid: SOLVED, elapsedSeconds: 1 });
    expect(game!.score.solvedTimeSeconds).toBe(30);
    expect(game!.points).toBe(400 + 190);
    const row = (await getDailyBoard("guild:grid", info, puzzleId)).find((e) => e.userId === player.userId)!;
    expect(row.detail).toEqual({ done: 2, total: 2, revealed: false });
  });

  it("can't overwrite givens or send values the game doesn't allow", async () => {
    const player = newPlayer();
    const { game } = await applyGridAction(def, player, puzzleId, "progress", { grid: [["Q", "#"], ["#", ""]] });
    expect(game!.grid).toEqual([["", "#"], ["#", "#"]]);
    await expect(applyGridAction(def, player, puzzleId, "progress", { grid: [["#"]] })).rejects.toThrow("Invalid grid");
  });

  it("credits a reveal from the grid before it, and never scores it as a solve", async () => {
    const player = newPlayer();
    await applyGridAction(def, player, puzzleId, "reveal", { grid: [["", ""], ["#", "#"]] });
    const { game } = await applyGridAction(def, player, puzzleId, "progress", { grid: SOLVED });
    expect(game!.score).toMatchObject({ revealed: true, revealCredit: 10, solvedTimeSeconds: null });
    expect(game!.grid).toEqual(PUZZLE.solution);
  });

  it("charges Check for wrong cells and reports them", async () => {
    const player = newPlayer();
    const res = await applyGridAction(def, player, puzzleId, "check", { grid: [["x", "#"], ["#", "#"]] });
    expect(res.wrongCells).toEqual(["0,0", "0,1"]);
    expect(res.game!.score.checkPenalty).toBe(10);
  });

  it("rejects puzzles from other days or versions", async () => {
    const player = newPlayer();
    await expect(applyGridAction(def, player, "2020-01-01.v1", "sync", {})).rejects.toThrow("no longer active");
    await expect(applyGridAction(def, player, `${getUtcDateKey()}.v9`, "sync", {})).rejects.toThrow("version mismatch");
  });
});
