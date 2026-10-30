import { generateDailyPuzzle, parsePuzzleId, PUZZLE_VERSION } from "@/lib/generator";
import { getUtcDateKey } from "@/lib/daily";
import { Puzzle } from "@/lib/types";
import { emptyScore, scoreAfterCheck, scoreAfterGrid, scoreAfterReveal, scoreBreakdown, ScoreRecord } from "@/lib/scoring";
import { Session } from "./session";
import { BoardEntry, GameRecord, getStore, LockTimeoutError } from "./store";

export type GameAction = "sync" | "progress" | "check" | "reveal";

export interface GameView {
  grid: string[][];
  elapsedSeconds: number;
  score: ScoreRecord;
  points: number;
}

export class GameError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Requests further apart than this mean the player wasn't playing (tab closed,
 * device asleep), so the gap doesn't count toward their server-measured time.
 * The client sends a heartbeat well inside this window while the timer runs.
 */
const ACTIVE_GAP_CAP_MS = 45_000;

const puzzleCache = new Map<string, Puzzle>();

function puzzleFor(dateKey: string): Puzzle {
  let puzzle = puzzleCache.get(dateKey);
  if (!puzzle) {
    puzzle = generateDailyPuzzle(dateKey);
    puzzleCache.set(dateKey, puzzle);
  }
  return puzzle;
}

/** Only today's and yesterday's (UTC) puzzles accept play, and only from a build with the same generator. */
export function resolvePuzzle(puzzleId: unknown): Puzzle {
  const parsed = typeof puzzleId === "string" ? parsePuzzleId(puzzleId) : null;
  if (!parsed) throw new GameError("Invalid puzzle id", 400);
  if (parsed.version !== PUZZLE_VERSION) throw new GameError("Puzzle version mismatch — reload to update", 409);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (parsed.dateKey !== getUtcDateKey(now) && parsed.dateKey !== getUtcDateKey(yesterday)) {
    throw new GameError("Puzzle is no longer active", 409);
  }
  return puzzleFor(parsed.dateKey);
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

function toEntry(puzzle: Puzzle, session: Session, game: GameRecord): BoardEntry {
  return {
    userId: session.userId,
    name: session.name,
    avatarPath: session.avatarPath,
    points: scoreBreakdown(puzzle, game.score).total,
    wordsSolved: game.score.solvedWords.length,
    totalWords: puzzle.slots.length,
    solvedTimeSeconds: game.score.solvedTimeSeconds,
    revealed: game.score.revealed,
    updatedAt: Date.now(),
  };
}

export async function applyGameAction(
  session: Session,
  puzzleId: string,
  action: GameAction,
  body: { grid?: unknown; elapsedSeconds?: unknown; cells?: unknown }
): Promise<{ game: GameView | null; wrongCells?: string[] }> {
  const puzzle = resolvePuzzle(puzzleId);
  const store = getStore();

  if (action === "sync") {
    const game = await store.getGame(puzzleId, session.userId);
    if (!game) return { game: null };
    // Opening the Activity in another server lists an existing score there too.
    await store.upsertEntry(puzzleId, session.scope, toEntry(puzzle, session, game));
    return { game: toView(puzzle, game) };
  }

  try {
    return await store.withGameLock(puzzleId, session.userId, () =>
      updateGame(session, puzzleId, puzzle, action, body)
    );
  } catch (err) {
    if (err instanceof LockTimeoutError) throw new GameError("Server busy, try again", 503);
    throw err;
  }
}

/** The read-modify-write half of applyGameAction; callers must hold the player's game lock. */
async function updateGame(
  session: Session,
  puzzleId: string,
  puzzle: Puzzle,
  action: Exclude<GameAction, "sync">,
  body: { grid?: unknown; elapsedSeconds?: unknown; cells?: unknown }
): Promise<{ game: GameView; wrongCells?: string[] }> {
  const store = getStore();
  const now = Date.now();
  let game = await store.getGame(puzzleId, session.userId);

  const finished = game ? game.score.solvedTimeSeconds !== null || game.score.revealed : false;
  game ??= {
    grid: puzzle.cells.map((row) => row.map(() => "")),
    score: emptyScore(),
    clientElapsedSeconds: 0,
    activeSeconds: 0,
    lastSeenAt: now,
    startedAt: now,
  };

  if (!finished) {
    const gap = now - game.lastSeenAt;
    if (gap <= ACTIVE_GAP_CAP_MS) game.activeSeconds += gap / 1000;
    game.lastSeenAt = now;
    const elapsed = Number(body.elapsedSeconds);
    if (Number.isFinite(elapsed) && elapsed > game.clientElapsedSeconds) game.clientElapsedSeconds = Math.floor(elapsed);
  }

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
      // The client clock can be rewound, the server's can't; scoring uses whichever is slower.
      const scoredSeconds = Math.round(Math.max(game.clientElapsedSeconds, game.activeSeconds));
      game.score = scoreAfterGrid(puzzle, game.score, grid, scoredSeconds);
    }
  }

  await store.saveGame(puzzleId, session.userId, game);
  await store.upsertEntry(puzzleId, session.scope, toEntry(puzzle, session, game));
  return { game: toView(puzzle, game), wrongCells };
}

export async function getLeaderboard(session: Session, puzzleId: string): Promise<BoardEntry[]> {
  resolvePuzzle(puzzleId);
  const entries = await getStore().getBoard(puzzleId, session.scope);
  return entries.sort(
    (a, b) =>
      b.points - a.points ||
      (a.solvedTimeSeconds ?? Infinity) - (b.solvedTimeSeconds ?? Infinity) ||
      a.updatedAt - b.updatedAt
  );
}
