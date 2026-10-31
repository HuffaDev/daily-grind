import { GameError, newPlayTime, PlayTime, recordPlay, resolveActivePuzzle, scoredSeconds } from "@/platform/server/games";
import { reportSolve } from "@/platform/server/webhook";
import { Session } from "@/platform/server/session";
import { BoardEntry, getStore, LockTimeoutError } from "@/platform/server/store";
import { chess } from "../meta";
import { getDailyPuzzles } from "../lib/puzzles";
import { isUci } from "../lib/solution";
import { DayRecord, emptyDay, mergeProgress, puzzleStatus, scoreAfterProgress, scoreBreakdown } from "../lib/scoring";
import { ChessBoardDetail, ChessPuzzle, PuzzleProgress } from "../lib/types";

export type GameAction = "sync" | "progress";

/** Server-side record of one player's attempt at one day's puzzles. */
export interface GameRecord extends PlayTime {
  day: DayRecord;
}

export interface GameView {
  day: DayRecord;
  elapsedSeconds: number;
  points: number;
}

/** Wrong moves past this are clamped; nobody makes that many honestly. */
const MAX_MISTAKES = 99;

const puzzleCache = new Map<string, ChessPuzzle[]>();

function puzzlesFor(dateKey: string): ChessPuzzle[] {
  let puzzles = puzzleCache.get(dateKey);
  if (!puzzles) {
    puzzles = getDailyPuzzles(dateKey);
    puzzleCache.set(dateKey, puzzles);
  }
  return puzzles;
}

/** The day's puzzles for `puzzleId`, if it's an active one. Served to the client at /api/games/chess/puzzles. */
export function activePuzzles(puzzleId: unknown): ChessPuzzle[] {
  return puzzlesFor(resolveActivePuzzle(chess, puzzleId));
}

/** The client's progress, shape-checked; the moves themselves are checked by mergeProgress. */
function sanitizeProgress(value: unknown, count: number): PuzzleProgress[] {
  if (!Array.isArray(value) || value.length !== count) throw new GameError("Invalid progress", 400);
  return value.map((p) => {
    const { line, mistakes, revealed } = (p ?? {}) as Partial<Record<keyof PuzzleProgress, unknown>>;
    if (!Array.isArray(line) || line.length > 8 || !line.every(isUci)) throw new GameError("Invalid progress", 400);
    const n = Number(mistakes);
    return {
      line,
      mistakes: Number.isInteger(n) && n > 0 ? Math.min(n, MAX_MISTAKES) : 0,
      revealed: revealed === true,
    };
  });
}

function toView(puzzles: ChessPuzzle[], game: GameRecord): GameView {
  return {
    day: game.day,
    elapsedSeconds: game.clientElapsedSeconds,
    points: scoreBreakdown(puzzles, game.day).total,
  };
}

function toEntry(puzzles: ChessPuzzle[], session: Session, game: GameRecord): BoardEntry<ChessBoardDetail> {
  const statuses = puzzles.map((p, i) => puzzleStatus(p, game.day.puzzles[i]));
  return {
    userId: session.userId,
    name: session.name,
    avatarPath: session.avatarPath,
    points: scoreBreakdown(puzzles, game.day).total,
    solvedTimeSeconds: game.day.solvedTimeSeconds,
    updatedAt: Date.now(),
    detail: {
      solved: statuses.filter((s) => s === "solved").length,
      total: puzzles.length,
      mistakes: game.day.puzzles.reduce((sum, p) => sum + p.mistakes, 0),
      revealed: statuses.filter((s) => s === "revealed").length,
    },
  };
}

export async function applyGameAction(
  session: Session,
  puzzleId: string,
  action: GameAction,
  body: { puzzles?: unknown; elapsedSeconds?: unknown }
): Promise<{ game: GameView | null }> {
  const dateKey = resolveActivePuzzle(chess, puzzleId);
  const puzzles = puzzlesFor(dateKey);
  const store = getStore();

  if (action === "sync") {
    const game = await store.getGame<GameRecord>(chess.id, puzzleId, session.userId);
    if (!game) return { game: null };
    // Opening the Activity in another server lists an existing score there too.
    await store.upsertEntry(chess.id, puzzleId, session.scope, toEntry(puzzles, session, game));
    return { game: toView(puzzles, game) };
  }

  let result: Awaited<ReturnType<typeof updateGame>>;
  try {
    result = await store.withGameLock(chess.id, puzzleId, session.userId, () =>
      updateGame(session, puzzleId, puzzles, body)
    );
  } catch (err) {
    if (err instanceof LockTimeoutError) throw new GameError("Server busy, try again", 503);
    throw err;
  }

  // Reported outside the lock so a slow webhook doesn't hold up the player's next update.
  const { newlySolved, ...response } = result;
  if (newlySolved) {
    await reportSolve({
      gameId: chess.id,
      userId: session.userId,
      dateKey,
      solveTimeSeconds: response.game.day.solvedTimeSeconds!,
      points: response.game.points,
    });
  }
  return response;
}

/**
 * The read-modify-write half of applyGameAction; callers must hold the player's game lock.
 * `newlySolved` is true only for the update that first solves every puzzle without a reveal.
 */
async function updateGame(
  session: Session,
  puzzleId: string,
  puzzles: ChessPuzzle[],
  body: { puzzles?: unknown; elapsedSeconds?: unknown }
): Promise<{ game: GameView; newlySolved: boolean }> {
  const store = getStore();
  const now = Date.now();
  const incoming = sanitizeProgress(body.puzzles, puzzles.length);
  const game = (await store.getGame<GameRecord>(chess.id, puzzleId, session.userId)) ?? {
    day: emptyDay(puzzles.length),
    ...newPlayTime(now),
  };

  const wasSolved = game.day.solvedTimeSeconds !== null;
  if (!wasSolved) {
    recordPlay(game, now, body.elapsedSeconds);
    const day = { ...game.day, puzzles: puzzles.map((p, i) => mergeProgress(p, game.day.puzzles[i], incoming[i])) };
    game.day = scoreAfterProgress(puzzles, day, scoredSeconds(game));
  }

  await store.saveGame(chess.id, puzzleId, session.userId, game);
  await store.upsertEntry(chess.id, puzzleId, session.scope, toEntry(puzzles, session, game));
  return { game: toView(puzzles, game), newlySolved: !wasSolved && game.day.solvedTimeSeconds !== null };
}
