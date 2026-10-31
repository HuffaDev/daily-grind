import { describe, expect, it } from "bun:test";
import { getPuzzleId, getUtcDateKey } from "@/platform/daily";
import { getAllTimeBoard, getDailyBoard, getGlobalBoard } from "@/platform/server/leaderboard";
import { applyRoundAction } from "@/platform/server/roundGame";
import { createSession, verifySession } from "@/platform/server/session";
import { reconcileMoves } from "@/platform/roundGame/types";
import { dailyPuzzles } from "./five-clues/lib/rules";
import { fiveClues } from "./five-clues/meta";
import { fiveCluesGame } from "./five-clues/server";
import { bearing, dailyRound } from "./which-way/lib/rules";
import { whichWay } from "./which-way/meta";
import { whichWayGame } from "./which-way/server";

const dateKey = getUtcDateKey();
const wayId = getPuzzleId(dateKey, whichWay.puzzleVersion);
const cluesId = getPuzzleId(dateKey, fiveClues.puzzleVersion);
const { origin, targets } = dailyRound(dateKey);
const perfectAims = targets.map((target) => bearing(origin, target));
const answers = dailyPuzzles(dateKey).map((puzzle) => puzzle.answer);
let nextUser = 5000;

function newPlayer(scope = "guild:round") {
  return verifySession(createSession({ userId: String(nextUser++), name: "Player", avatarPath: null, scope }))!;
}

describe("the shared round-game server", () => {
  it("scores the moves itself and never lets one be taken back", async () => {
    const player = newPlayer();
    const opposite = (perfectAims[0] + 180) % 360;
    await applyRoundAction(whichWayGame, player, wayId, "progress", { moves: [opposite] });
    const { game } = await applyRoundAction(whichWayGame, player, wayId, "progress", { moves: perfectAims });
    expect(game!.moves).toEqual([opposite]);
    expect(game!.points).toBe(0);
  });

  it("stops counting at the end of the game", async () => {
    const { game } = await applyRoundAction(whichWayGame, newPlayer(), wayId, "progress", { moves: [...perfectAims, 10] });
    expect(game!.moves).toEqual(perfectAims);
  });

  it("rejects invalid moves and old puzzles", async () => {
    await expect(applyRoundAction(fiveCluesGame, newPlayer(), cluesId, "progress", { moves: ["Not On The List"] })).rejects.toThrow("Invalid moves");
    await expect(applyRoundAction(whichWayGame, newPlayer(), "2020-01-01.v1", "progress", { moves: [] })).rejects.toThrow("no longer active");
  });

  it("restores a game from the server, and lists it in another server", async () => {
    const player = newPlayer("guild:first");
    await applyRoundAction(whichWayGame, player, wayId, "progress", { moves: perfectAims });
    const { game } = await applyRoundAction(whichWayGame, { ...player, scope: "guild:second" }, wayId, "sync", {});
    expect(game!.moves).toEqual(perfectAims);
    expect((await getDailyBoard("guild:second", whichWay, wayId)).map((entry) => entry.userId)).toContain(player.userId);
  });
});

describe("reconcileMoves", () => {
  it("keeps the copy that's further along, and the server's if they disagree", () => {
    expect(reconcileMoves([1, 2], [1])).toEqual({ moves: [1, 2], upload: true });
    expect(reconcileMoves([1], [1, 2])).toEqual({ moves: [1, 2], upload: false });
    expect(reconcileMoves([3], [1, 2])).toEqual({ moves: [1, 2], upload: false });
  });
});

describe("the leaderboards", () => {
  it("rank both games on their own boards and add them up on the Daily Grind board", async () => {
    const scope = "guild:boards";
    const ace = newPlayer(scope);
    const partial = newPlayer(scope);
    await applyRoundAction(whichWayGame, ace, wayId, "progress", { moves: perfectAims, elapsedSeconds: 30 });
    await applyRoundAction(fiveCluesGame, ace, cluesId, "progress", { moves: answers, elapsedSeconds: 40 });
    await applyRoundAction(whichWayGame, partial, wayId, "progress", { moves: perfectAims.slice(0, 2) });
    await applyRoundAction(fiveCluesGame, partial, cluesId, "progress", { moves: [null, null, null, null, null, answers[1], answers[2]] });

    const way = await getDailyBoard(scope, whichWay, wayId);
    expect(way.map((entry) => entry.userId)).toEqual([ace.userId, partial.userId]);
    expect(whichWay.summarizeToday(way[0])).toBe("✅ 0° off · 0:30");
    expect(whichWay.summarizeToday(way[1])).toBe("2/5 cities");

    const clues = await getDailyBoard(scope, fiveClues, cluesId);
    expect(fiveClues.summarizeToday(clues[0])).toBe("✅ 3 clues · 0:40");
    expect(fiveClues.summarizeToday(clues[1])).toBe("2/3 found · 7 clues");

    const allTime = await getAllTimeBoard(scope, fiveClues);
    expect(allTime.find((entry) => entry.userId === partial.userId)).toMatchObject({ points: 500, played: 1, solved: 0 });

    const global = await getGlobalBoard(scope);
    expect(global.find((entry) => entry.userId === ace.userId)).toMatchObject({ points: 1500, gamePoints: { "which-way": 750, "five-clues": 750 } });
    expect(global.find((entry) => entry.userId === partial.userId)).toMatchObject({ points: 800, gamePoints: { "which-way": 300, "five-clues": 500 } });
  });
});
