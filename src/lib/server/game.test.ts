import { describe, expect, it } from "bun:test";
import { getUtcDateKey } from "@/lib/daily";
import { getPuzzleId } from "@/lib/generator";
import { emptyGrid, gridWithSlot, puzzleFor, solutionGrid, wrongLetterAt } from "@/lib/testUtils";
import { applyGameAction, getLeaderboard } from "./game";
import { createSession, verifySession } from "./session";

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
    const onB = async () => (await getLeaderboard(elsewhere, puzzleId)).filter((e) => e.userId === player.userId);
    expect(await onB()).toHaveLength(0);
    await applyGameAction(elsewhere, puzzleId, "sync", {});
    expect(await onB()).toHaveLength(1);
  });
});
