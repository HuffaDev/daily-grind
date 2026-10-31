import type { GameInfo } from "@/games/types";
import {
  emptyScore,
  GridBoardDetail,
  GridGameView,
  GridPuzzle,
  GridRules,
  GridScore,
  progress,
  scoreAfterCheck,
  scoreAfterGrid,
  scoreAfterReveal,
  scoreBreakdown,
  startingGrid,
} from "../gridGame/rules";
import { GameError, gameErrorResponse, newPlayTime, PlayTime, recordPlay, resolveActivePuzzle, scoredSeconds } from "./games";
import { Session, sessionFromRequest } from "./session";
import { BoardEntry, getStore, LockTimeoutError } from "./store";
import { reportSolve } from "./webhook";

// The server half of the grid-puzzle engine (see gridGame/rules.ts). A game
// supplies its GridGameDef; this handles its API route, storage and board.

export interface GridGameDef {
  info: GameInfo;
  rules: GridRules;
  /** The day's puzzle; must be deterministic for a date. */
  puzzleFor(dateKey: string): GridPuzzle;
}

export type GridAction = "sync" | "progress" | "check" | "reveal";
const ACTIONS: GridAction[] = ["sync", "progress", "check", "reveal"];

/** Server-side record of one player's attempt at one day's puzzle. */
export interface GridGameRecord extends PlayTime {
  grid: string[][];
  score: GridScore;
}

type Body = { grid?: unknown; elapsedSeconds?: unknown; cells?: unknown };

const puzzleCache = new Map<string, GridPuzzle>();

function cachedPuzzle(def: GridGameDef, dateKey: string): GridPuzzle {
  const cacheKey = `${def.info.id}:${dateKey}`;
  let puzzle = puzzleCache.get(cacheKey);
  if (!puzzle) {
    puzzle = def.puzzleFor(dateKey);
    puzzleCache.set(cacheKey, puzzle);
  }
  return puzzle;
}

/** The client's grid with anything not allowed blanked, and the givens put back. */
function sanitizeGrid(def: GridGameDef, puzzle: GridPuzzle, grid: unknown): string[][] {
  const allowed = new Set(def.rules.values);
  if (!Array.isArray(grid) || grid.length !== puzzle.size) throw new GameError("Invalid grid", 400);
  return grid.map((row, r) => {
    if (!Array.isArray(row) || row.length !== puzzle.size) throw new GameError("Invalid grid", 400);
    return row.map((cell, c) => {
      if (puzzle.given[r][c]) return puzzle.solution[r][c];
      return typeof cell === "string" && allowed.has(cell) ? cell : "";
    });
  });
}

/** Cell keys ("r,c") to Check; anything malformed is dropped. Omitted means the whole grid. */
function sanitizeCells(cells: unknown, size: number): string[] | undefined {
  if (cells === undefined) return undefined;
  if (!Array.isArray(cells)) throw new GameError("Invalid cells", 400);
  return cells.filter((cell): cell is string => {
    const match = typeof cell === "string" && /^(\d+),(\d+)$/.exec(cell);
    return !!match && Number(match[1]) < size && Number(match[2]) < size;
  });
}

function toView(def: GridGameDef, game: GridGameRecord): GridGameView {
  return {
    grid: game.grid,
    elapsedSeconds: game.clientElapsedSeconds,
    score: game.score,
    points: scoreBreakdown(def.rules, game.score).total,
  };
}

function toEntry(def: GridGameDef, puzzle: GridPuzzle, session: Session, game: GridGameRecord): BoardEntry<GridBoardDetail> {
  return {
    userId: session.userId,
    name: session.name,
    avatarPath: session.avatarPath,
    points: scoreBreakdown(def.rules, game.score).total,
    solvedTimeSeconds: game.score.solvedTimeSeconds,
    updatedAt: Date.now(),
    detail: { ...progress(def.rules, puzzle, game.grid), revealed: game.score.revealed },
  };
}

export async function applyGridAction(
  def: GridGameDef,
  session: Session,
  puzzleId: string,
  action: GridAction,
  body: Body
): Promise<{ game: GridGameView | null; wrongCells?: string[] }> {
  const dateKey = resolveActivePuzzle(def.info, puzzleId);
  const puzzle = cachedPuzzle(def, dateKey);
  const store = getStore();

  if (action === "sync") {
    const game = await store.getGame<GridGameRecord>(def.info.id, puzzleId, session.userId);
    if (!game) return { game: null };
    // Opening the Activity in another server lists an existing score there too.
    await store.upsertEntry(def.info.id, puzzleId, session.scope, toEntry(def, puzzle, session, game));
    return { game: toView(def, game) };
  }

  let result: Awaited<ReturnType<typeof updateGame>>;
  try {
    result = await store.withGameLock(def.info.id, puzzleId, session.userId, () =>
      updateGame(def, session, puzzleId, puzzle, action, body)
    );
  } catch (err) {
    if (err instanceof LockTimeoutError) throw new GameError("Server busy, try again", 503);
    throw err;
  }

  // Reported outside the lock so a slow webhook doesn't hold up the player's next update.
  const { newlySolved, ...response } = result;
  if (newlySolved) {
    await reportSolve({
      gameId: def.info.id,
      userId: session.userId,
      dateKey,
      solveTimeSeconds: response.game.score.solvedTimeSeconds!,
      points: response.game.points,
    });
  }
  return response;
}

/**
 * The read-modify-write half of applyGridAction; callers must hold the player's game lock.
 * `newlySolved` is true only for the update that first completes the puzzle without a reveal.
 */
async function updateGame(
  def: GridGameDef,
  session: Session,
  puzzleId: string,
  puzzle: GridPuzzle,
  action: Exclude<GridAction, "sync">,
  body: Body
): Promise<{ game: GridGameView; wrongCells?: string[]; newlySolved: boolean }> {
  const store = getStore();
  const now = Date.now();
  let game = await store.getGame<GridGameRecord>(def.info.id, puzzleId, session.userId);

  const finished = game ? game.score.solvedTimeSeconds !== null || game.score.revealed : false;
  game ??= { grid: startingGrid(puzzle), score: emptyScore(), ...newPlayTime(now) };

  if (!finished) recordPlay(game, now, body.elapsedSeconds);

  const grid = sanitizeGrid(def, puzzle, body.grid);
  let wrongCells: string[] | undefined;
  if (action === "reveal") {
    // Credit comes from the grid as it stood just before the reveal.
    game.score = scoreAfterReveal(def.rules, puzzle, game.score, finished ? game.grid : grid);
    if (!finished) game.grid = puzzle.solution.map((row) => [...row]);
  } else if (action === "check") {
    const result = scoreAfterCheck(def.rules, puzzle, game.score, grid, sanitizeCells(body.cells, puzzle.size));
    game.score = result.record;
    wrongCells = result.wrongCells;
  } else if (!finished) {
    game.grid = grid;
    game.score = scoreAfterGrid(def.rules, puzzle, game.score, grid, scoredSeconds(game));
  }

  await store.saveGame(def.info.id, puzzleId, session.userId, game);
  await store.upsertEntry(def.info.id, puzzleId, session.scope, toEntry(def, puzzle, session, game));
  const newlySolved = !finished && game.score.solvedTimeSeconds !== null && !game.score.revealed;
  return { game: toView(def, game), wrongCells, newlySolved };
}

/** The POST handler for a grid game's /api/games/<id> route. */
export function gridGameRoute(def: GridGameDef) {
  return async function POST(req: Request): Promise<Response> {
    const session = sessionFromRequest(req);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body & { puzzleId?: string; action?: GridAction };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }
    try {
      return Response.json(await applyGridAction(def, session, body.puzzleId ?? "", body.action, body));
    } catch (err) {
      return gameErrorResponse(err);
    }
  };
}
