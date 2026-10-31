import { GameError, newPlayTime, PlayTime, recordPlay, resolveActivePuzzle, scoredSeconds } from "@/platform/server/games";
import { reportSolve } from "@/platform/server/webhook";
import { Session } from "@/platform/server/session";
import { BoardEntry, getStore, LockTimeoutError } from "@/platform/server/store";
import { crossword } from "../meta";
import { generateDailyPuzzle } from "../lib/generator";
import { CrosswordBoardDetail, Puzzle } from "../lib/types";
import { emptyScore, scoreAfterCheck, scoreAfterGrid, scoreAfterReveal, scoreBreakdown, ScoreRecord } from "../lib/scoring";

export type GameAction = "sync" | "progress" | "check" | "reveal";

/** Server-side record of one player's attempt at one day's puzzle. */
export interface GameRecord extends PlayTime {
  grid: string[][];
  score: ScoreRecord;
}

export interface GameView {
  grid: string[][];
  elapsedSeconds: number;
  score: ScoreRecord;
  points: number;
}

const puzzleCache = new Map<string, Puzzle>();

function puzzleFor(dateKey: string): Puzzle {
  let puzzle = puzzleCache.get(dateKey);
  if (!puzzle) {
    puzzle = generateDailyPuzzle(dateKey);
    puzzleCache.set(dateKey, puzzle);
  }
  return puzzle;
}

function sanitizeGrid(grid: unknown, size: number): string[][] {
  if (!Array.isArray(grid) || grid.length !== size) throw new GameError("Invalid grid", 400);
  return grid.map((row) => {
    if (!Array.isArray(row) || row.length !== size) throw new GameError("Invalid grid", 400);
    return row.map((cell) => (typeof cell === "string" && /^[A-Z]$/.test(cell) ? cell : ""));
  });
}

/** Cell keys ("r,c") to Check; anything malformed is dropped. Omitted means the whole grid. */
function sanitizeCells(cells: unknown, size: number): string[] | undefined {
  if (cells === undefined) return undefined;
  if (!Array.isArray(cells)) throw new GameError("Invalid cells", 400);
  return cells.filter((cell): cell is string => {
    const match = typeof cell === "string" && /^(\d),(\d)$/.exec(cell);
    return !!match && Number(match[1]) < size && Number(match[2]) < size;
  });
}

function toView(puzzle: Puzzle, game: GameRecord): GameView {
  return {
    grid: game.grid,
    elapsedSeconds: game.clientElapsedSeconds,
    score: game.score,
    points: scoreBreakdown(puzzle, game.score).total,
  };
}

function toEntry(puzzle: Puzzle, session: Session, game: GameRecord): BoardEntry<CrosswordBoardDetail> {
  return {
    userId: session.userId,
    name: session.name,
    avatarPath: session.avatarPath,
    points: scoreBreakdown(puzzle, game.score).total,
    solvedTimeSeconds: game.score.solvedTimeSeconds,
    updatedAt: Date.now(),
    detail: {
      wordsSolved: game.score.solvedWords.length,
      totalWords: puzzle.slots.length,
      revealed: game.score.revealed,
    },
  };
}

export async function applyGameAction(
  session: Session,
  puzzleId: string,
  action: GameAction,
  body: { grid?: unknown; elapsedSeconds?: unknown; cells?: unknown }
): Promise<{ game: GameView | null; wrongCells?: string[] }> {
  const dateKey = resolveActivePuzzle(crossword, puzzleId);
  const puzzle = puzzleFor(dateKey);
  const store = getStore();

  if (action === "sync") {
    const game = await store.getGame<GameRecord>(crossword.id, puzzleId, session.userId);
    if (!game) return { game: null };
    // Opening the Activity in another server lists an existing score there too.
    await store.upsertEntry(crossword.id, puzzleId, session.scope, toEntry(puzzle, session, game));
    return { game: toView(puzzle, game) };
  }

  let result: Awaited<ReturnType<typeof updateGame>>;
  try {
    result = await store.withGameLock(crossword.id, puzzleId, session.userId, () =>
      updateGame(session, puzzleId, puzzle, action, body)
    );
  } catch (err) {
    if (err instanceof LockTimeoutError) throw new GameError("Server busy, try again", 503);
    throw err;
  }

  // Reported outside the lock so a slow webhook doesn't hold up the player's next update.
  const { newlySolved, ...response } = result;
  if (newlySolved) {
    await reportSolve({
      gameId: crossword.id,
      userId: session.userId,
      dateKey,
      solveTimeSeconds: response.game.score.solvedTimeSeconds!,
      points: response.game.points,
    });
  }
  return response;
}

/**
 * The read-modify-write half of applyGameAction; callers must hold the player's game lock.
 * `newlySolved` is true only for the update that first completes the puzzle without a reveal.
 */
async function updateGame(
  session: Session,
  puzzleId: string,
  puzzle: Puzzle,
  action: Exclude<GameAction, "sync">,
  body: { grid?: unknown; elapsedSeconds?: unknown; cells?: unknown }
): Promise<{ game: GameView; wrongCells?: string[]; newlySolved: boolean }> {
  const store = getStore();
  const now = Date.now();
  let game = await store.getGame<GameRecord>(crossword.id, puzzleId, session.userId);

  const finished = game ? game.score.solvedTimeSeconds !== null || game.score.revealed : false;
  game ??= {
    grid: puzzle.cells.map((row) => row.map(() => "")),
    score: emptyScore(),
    ...newPlayTime(now),
  };

  if (!finished) recordPlay(game, now, body.elapsedSeconds);

  let wrongCells: string[] | undefined;
  if (action === "reveal") {
    game.score = scoreAfterReveal(game.score);
    game.grid = puzzle.cells.map((row) => row.map((cell) => (cell.black ? "" : cell.solution)));
  } else {
    const grid = sanitizeGrid(body.grid, puzzle.size);
    if (action === "check") {
      const result = scoreAfterCheck(puzzle, game.score, grid, sanitizeCells(body.cells, puzzle.size));
      game.score = result.record;
      wrongCells = result.wrongCells;
    } else if (!finished) {
      game.grid = grid;
      game.score = scoreAfterGrid(puzzle, game.score, grid, scoredSeconds(game));
    }
  }

  await store.saveGame(crossword.id, puzzleId, session.userId, game);
  await store.upsertEntry(crossword.id, puzzleId, session.scope, toEntry(puzzle, session, game));
  const newlySolved = !finished && game.score.solvedTimeSeconds !== null && !game.score.revealed;
  return { game: toView(puzzle, game), wrongCells, newlySolved };
}
