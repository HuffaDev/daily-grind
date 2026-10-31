import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { getUtcDateKey } from "@/platform/daily";
import { getAllTimeBoard, getDailyBoard, getGlobalBoard } from "@/platform/server/leaderboard";
import { createSession, verifySession } from "@/platform/server/session";
import { crossword } from "../meta";
import { getPuzzleId } from "../lib/generator";
import { emptyGrid, gridWithSlot, puzzleFor, solutionGrid, wrongLetterAt } from "../lib/testUtils";
import { applyGameAction } from "./game";

// Runs against the in-memory store (no Redis configured in tests). Each test
// uses its own user id, since the store is shared across the file.

const dateKey = getUtcDateKey();
const puzzleId = getPuzzleId(dateKey);
const puzzle = puzzleFor(dateKey);
let nextUser = 1;

function newPlayer(scope = "guild:1") {
  return verifySession(createSession({ userId: String(nextUser++), name: "Player", avatarPath: null, scope }))!;
}

describe("sessions", () => {
  it("rejects tampered tokens", () => {
    const token = createSession({ userId: "1", name: "A", avatarPath: null, scope: "guild:1" });
    expect(verifySession(token)).not.toBeNull();
    expect(verifySession(token + "x")).toBeNull();
    expect(verifySession(token.replace(/^./, "x"))).toBeNull();
  });
});

describe("applyGameAction", () => {
  it("scores a solve with the slower of client and server time", async () => {
    const player = newPlayer();
    await applyGameAction(player, puzzleId, "progress", { grid: emptyGrid(puzzle), elapsedSeconds: 30 });
    // A client that rewinds its clock can't lower the time it already reported.
    const { game } = await applyGameAction(player, puzzleId, "progress", {
      grid: solutionGrid(puzzle),
      elapsedSeconds: 1,
    });
    expect(game!.score.solvedTimeSeconds).toBe(30);
  });

  it("rejects puzzles from other days or generator versions", async () => {
    const player = newPlayer();
    await expect(applyGameAction(player, "2020-01-01.v1", "sync", {})).rejects.toThrow("no longer active");
    await expect(applyGameAction(player, `${dateKey}.v999`, "sync", {})).rejects.toThrow("version mismatch");
  });

  // Regression: concurrent updates used to read the same saved game and the
  // last write won, which could drop a reveal and score the game as a solve.
  it.each([
    ["progress first", ["progress", "reveal"] as const],
    ["reveal first", ["reveal", "progress"] as const],
  ])("never loses a reveal to a concurrent progress update (%s)", async (_, order) => {
    const player = newPlayer();
    await applyGameAction(player, puzzleId, "progress", { grid: emptyGrid(puzzle), elapsedSeconds: 2 });
    const partial = gridWithSlot(puzzle, puzzle.slots[0]);
    await Promise.all(
      order.map((action) => applyGameAction(player, puzzleId, action, { grid: partial, elapsedSeconds: 3 }))
    );
    const { game } = await applyGameAction(player, puzzleId, "progress", {
      grid: solutionGrid(puzzle),
      elapsedSeconds: 4,
    });
    expect(game!.score.revealed).toBe(true);
    expect(game!.score.solvedTimeSeconds).toBeNull();
  });

  it("never loses a check penalty to a concurrent progress update", async () => {
    const player = newPlayer();
    const [r, c] = puzzle.slots[0].cellCoords[0];
    const wrong = emptyGrid(puzzle);
    wrong[r][c] = wrongLetterAt(puzzle, r, c);
    await Promise.all([
      applyGameAction(player, puzzleId, "check", { grid: wrong, elapsedSeconds: 3 }),
      applyGameAction(player, puzzleId, "progress", { grid: wrong, elapsedSeconds: 3 }),
    ]);
    const { game } = await applyGameAction(player, puzzleId, "sync", {});
    expect(game!.score.checkPenalty).toBe(5);
  });

  it("lists a score only on its own server board until the player opens it elsewhere", async () => {
    const player = newPlayer("guild:a");
    await applyGameAction(player, puzzleId, "progress", {
      grid: gridWithSlot(puzzle, puzzle.slots[0]),
      elapsedSeconds: 3,
    });
    const elsewhere = verifySession(createSession({ ...player, scope: "guild:b" }))!;
    const onB = async () =>
      (await getDailyBoard(elsewhere.scope, crossword, puzzleId)).filter((e) => e.userId === player.userId);
    expect(await onB()).toHaveLength(0);
    await applyGameAction(elsewhere, puzzleId, "sync", {});
    expect(await onB()).toHaveLength(1);
  });

  it("lists a server's players on its all-time board", async () => {
    const player = newPlayer("guild:all-time");
    await applyGameAction(player, puzzleId, "progress", { grid: solutionGrid(puzzle), elapsedSeconds: 12 });
    const board = await getAllTimeBoard(player.scope, crossword);
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ userId: player.userId, played: 1, solved: 1, bestTimeSeconds: 12 });
    expect(await getAllTimeBoard("guild:elsewhere", crossword)).toEqual([]);
  });

  it("counts toward the server's global board", async () => {
    const player = newPlayer("guild:global");
    const { game } = await applyGameAction(player, puzzleId, "progress", {
      grid: solutionGrid(puzzle),
      elapsedSeconds: 12,
    });
    expect(await getGlobalBoard(player.scope)).toEqual([
      expect.objectContaining({ userId: player.userId, points: game!.points, gamePoints: { crossword: game!.points } }),
    ]);
  });
});

describe("results webhook", () => {
  const realFetch = globalThis.fetch;
  let reports: { body: unknown; authorization: string | null }[] = [];

  beforeEach(() => {
    reports = [];
    process.env.RESULTS_WEBHOOK_URL = "https://webhook.test/results";
    process.env.RESULTS_WEBHOOK_TOKEN = "token";
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      reports.push({
        body: JSON.parse(String(init?.body)),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.RESULTS_WEBHOOK_URL;
    delete process.env.RESULTS_WEBHOOK_TOKEN;
  });

  it("reports a solve once", async () => {
    const player = newPlayer();
    await applyGameAction(player, puzzleId, "progress", { grid: emptyGrid(puzzle), elapsedSeconds: 20 });
    const { game } = await applyGameAction(player, puzzleId, "progress", {
      grid: solutionGrid(puzzle),
      elapsedSeconds: 42,
    });
    await applyGameAction(player, puzzleId, "progress", { grid: solutionGrid(puzzle), elapsedSeconds: 50 });
    expect(reports).toEqual([
      {
        body: { game: "crossword", user_id: player.userId, date: dateKey, solve_time_secs: 42, points: game!.points },
        authorization: "Bearer token",
      },
    ]);
  });

  it("sends no Authorization header without a token", async () => {
    delete process.env.RESULTS_WEBHOOK_TOKEN;
    await applyGameAction(newPlayer(), puzzleId, "progress", { grid: solutionGrid(puzzle), elapsedSeconds: 9 });
    expect(reports.map((r) => r.authorization)).toEqual([null]);
  });

  it("never reports a revealed puzzle", async () => {
    const player = newPlayer();
    await applyGameAction(player, puzzleId, "progress", { grid: emptyGrid(puzzle), elapsedSeconds: 5 });
    await applyGameAction(player, puzzleId, "reveal", {});
    expect(reports).toEqual([]);
  });

  it("still saves the game when the webhook is down", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const player = newPlayer();
    const { game } = await applyGameAction(player, puzzleId, "progress", {
      grid: solutionGrid(puzzle),
      elapsedSeconds: 7,
    });
    expect(game!.score.solvedTimeSeconds).toBe(7);
  });
});
