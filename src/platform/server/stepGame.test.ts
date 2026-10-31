import { describe, expect, it } from "bun:test";
import type { GameInfo } from "@/games/types";
import { getPuzzleId, getUtcDateKey } from "../daily";
import { StepBoardDetail } from "../stepGame/rules";
import { COUNT_RULES } from "../stepGame/testFixtures";
import { getDailyBoard } from "./leaderboard";
import { createSession, verifySession } from "./session";
import { applyStepAction, StepGameDef, stepGameRoute } from "./stepGame";
import { BoardEntry } from "./store";

// Runs against the in-memory store with a made-up counting game (see stepGame/testFixtures.ts).

const info: GameInfo = {
  id: "test-step",
  name: "Test Step",
  tagline: "",
  icon: "",
  emoji: "🧪",
  puzzleVersion: 1,
  summarizeToday: (entry) => `${(entry as BoardEntry<StepBoardDetail>).detail.done}`,
};
const def: StepGameDef<number> = { info, rules: COUNT_RULES, puzzleFor: () => ({ puzzle: 3, solution: ["1", "2", "3"] }) };
const puzzleId = getPuzzleId(getUtcDateKey(), 1);
let nextUser = 7000;

function newPlayer() {
  return verifySession(createSession({ userId: String(nextUser++), name: "Player", avatarPath: null, scope: "guild:step" }))!;
}

describe("applyStepAction", () => {
  it("scores a solve with the slower of client and server time", async () => {
    const player = newPlayer();
    await applyStepAction(def, player, puzzleId, "progress", { moves: ["1"], elapsedSeconds: 30 });
    const { game } = await applyStepAction(def, player, puzzleId, "progress", { moves: ["1", "2", "3"], elapsedSeconds: 1 });
    expect(game!.score.solvedTimeSeconds).toBe(30);
    expect(game!.points).toBe(400 + 180 - 30);
    const row = (await getDailyBoard("guild:step", info, puzzleId)).find((e) => e.userId === player.userId)!;
    expect(row.detail).toEqual({ done: 3, total: 3, moves: 3, gaveUp: false });
  });

  it("rejects moves the rules don't allow", async () => {
    const player = newPlayer();
    await expect(applyStepAction(def, player, puzzleId, "progress", { moves: ["2"] })).rejects.toThrow("Count up by one");
    await expect(applyStepAction(def, player, puzzleId, "progress", { moves: [1] })).rejects.toThrow("Invalid moves");
  });

  it("keeps progress on giving up, and never scores a solve after", async () => {
    const player = newPlayer();
    await applyStepAction(def, player, puzzleId, "giveup", { moves: ["1", "2"] });
    const { game } = await applyStepAction(def, player, puzzleId, "progress", { moves: ["1", "2", "3"] });
    expect(game).toMatchObject({ moves: ["1", "2"], score: { gaveUp: true, solvedTimeSeconds: null }, points: 20 });
  });

  it("serves the puzzle, and an answer only when asked", async () => {
    const { GET } = stepGameRoute(def);
    const res = await GET(new Request(`http://test/api?puzzleId=${puzzleId}`));
    expect(await res.json()).toEqual({ puzzle: 3 });
    const revealed = await GET(new Request(`http://test/api?puzzleId=${puzzleId}&reveal=1`));
    expect(await revealed.json()).toEqual({ puzzle: 3, solution: ["1", "2", "3"] });
  });
});
