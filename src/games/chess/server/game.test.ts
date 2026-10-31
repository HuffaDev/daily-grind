import { describe, expect, it } from "bun:test";
import { getPuzzleId, getUtcDateKey } from "@/platform/daily";
import { getDailyBoard } from "@/platform/server/leaderboard";
import { createSession, verifySession } from "@/platform/server/session";
import { chess, PUZZLE_VERSION } from "../meta";
import { ChessPuzzle, PuzzleProgress } from "../lib/types";
import { activePuzzles, applyGameAction } from "./game";

// Runs against the in-memory store (no Redis configured in tests). Each test
// uses its own user id, since the store is shared across the file.

const dateKey = getUtcDateKey();
const puzzleId = getPuzzleId(dateKey, PUZZLE_VERSION);
const puzzles = activePuzzles(puzzleId);
let nextUser = 1000;

function newPlayer(scope = "guild:chess") {
  return verifySession(createSession({ userId: String(nextUser++), name: "Player", avatarPath: null, scope }))!;
}

function solved(puzzle: ChessPuzzle): PuzzleProgress {
  return { line: puzzle.moves.filter((_, i) => i % 2 === 1), mistakes: 0, revealed: false };
}

const fresh = (): PuzzleProgress => ({ line: [], mistakes: 0, revealed: false });

describe("chess applyGameAction", () => {
  it("serves only active puzzles", () => {
    expect(puzzles).toHaveLength(3);
    expect(() => activePuzzles("2020-01-01.v1")).toThrow("no longer active");
    expect(() => activePuzzles(`${dateKey}.v999`)).toThrow("version mismatch");
  });

  it("scores a full solve with the slower of client and server time", async () => {
    const player = newPlayer();
    await applyGameAction(player, puzzleId, "progress", { puzzles: puzzles.map(fresh), elapsedSeconds: 40 });
    const { game } = await applyGameAction(player, puzzleId, "progress", {
      puzzles: puzzles.map(solved),
      elapsedSeconds: 1,
    });
    expect(game!.day.solvedTimeSeconds).toBe(40);
    expect(game!.points).toBeGreaterThan(450);

    const board = await getDailyBoard("guild:chess", chess, puzzleId);
    const row = board.find((e) => e.userId === player.userId)!;
    expect(chess.summarizeToday(row)).toBe("✅ 0:40");
  });

  it("ignores made-up moves and never lowers mistakes", async () => {
    const player = newPlayer();
    await applyGameAction(player, puzzleId, "progress", {
      puzzles: puzzles.map(() => ({ line: [], mistakes: 2, revealed: false })),
    });
    const { game } = await applyGameAction(player, puzzleId, "progress", {
      puzzles: puzzles.map((p) => ({ line: ["a1a1", ...solved(p).line], mistakes: 0, revealed: false })),
    });
    expect(game!.day.puzzles.every((p) => p.line.length === 0 && p.mistakes === 2)).toBe(true);
    expect(game!.points).toBe(0);
  });

  it("never loses a reveal to a concurrent upload", async () => {
    const player = newPlayer();
    const revealed = puzzles.map((p, i) => (i === 2 ? { ...fresh(), revealed: true } : solved(p)));
    await Promise.all([
      applyGameAction(player, puzzleId, "progress", { puzzles: revealed }),
      applyGameAction(player, puzzleId, "progress", { puzzles: puzzles.map(fresh) }),
    ]);
    const { game } = await applyGameAction(player, puzzleId, "progress", { puzzles: puzzles.map(solved) });
    expect(game!.day.puzzles[2].revealed).toBe(true);
    expect(game!.day.solvedTimeSeconds).toBeNull();
  });

  it("rejects malformed progress", async () => {
    const player = newPlayer();
    await expect(applyGameAction(player, puzzleId, "progress", { puzzles: [] })).rejects.toThrow("Invalid progress");
    await expect(
      applyGameAction(player, puzzleId, "progress", { puzzles: puzzles.map(() => ({ line: "e2e4" })) })
    ).rejects.toThrow("Invalid progress");
  });
});
