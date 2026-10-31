import type { GameInfo } from "@/games/types";
import {
  emptyScore,
  invalidMoves,
  StepBoardDetail,
  StepGameView,
  StepRules,
  StepScore,
  scoreAfterMoves,
  scoreBreakdown,
} from "../stepGame/rules";
import { GameError, gameErrorResponse, newPlayTime, PlayTime, recordPlay, resolveActivePuzzle, scoredSeconds } from "./games";
import { Session, sessionFromRequest } from "./session";
import { BoardEntry, getStore, LockTimeoutError } from "./store";
import { reportSolve } from "./webhook";

// The server half of the step-puzzle engine (see stepGame/rules.ts). A game
// supplies its StepGameDef; this serves its puzzle and runs its API route,
// storage and board.

export interface StepGameDef<P> {
  info: GameInfo;
  rules: StepRules<P>;
  /** The day's puzzle as players see it, and an answer to show after giving up. Deterministic for a date. */
  puzzleFor(dateKey: string): { puzzle: P; solution: string[] };
}

export type StepAction = "sync" | "progress" | "giveup";
const ACTIONS: StepAction[] = ["sync", "progress", "giveup"];

/** Server-side record of one player's attempt at one day's puzzle. */
export interface StepGameRecord extends PlayTime {
  moves: string[];
  score: StepScore;
}

type Body = { moves?: unknown; elapsedSeconds?: unknown };

const MAX_MOVE_LENGTH = 32;
const puzzleCache = new Map<string, { puzzle: unknown; solution: string[] }>();

/** The day's puzzle, built once per server instance: word games search a dictionary to make it. */
export function cachedPuzzle<P>(def: StepGameDef<P>, dateKey: string): { puzzle: P; solution: string[] } {
  const cacheKey = `${def.info.id}:${dateKey}`;
  let day = puzzleCache.get(cacheKey);
  if (!day) {
    day = def.puzzleFor(dateKey);
    puzzleCache.set(cacheKey, day);
  }
  return day as { puzzle: P; solution: string[] };
}

/** The client's moves, if they're a list of short strings that's playable from the start. */
function sanitizeMoves<P>(def: StepGameDef<P>, puzzle: P, moves: unknown): string[] {
  if (!Array.isArray(moves) || !moves.every((m) => typeof m === "string" && m.length <= MAX_MOVE_LENGTH)) {
    throw new GameError("Invalid moves", 400);
  }
  const reason = invalidMoves(def.rules, puzzle, moves);
  if (reason) throw new GameError(reason, 400);
  return moves;
}

/** Whether `next` keeps every move of `saved`, in order, and maybe adds more. */
function extendsMoves(saved: readonly string[], next: readonly string[]): boolean {
  return next.length >= saved.length && saved.every((move, i) => next[i] === move);
}

function toView<P>(def: StepGameDef<P>, puzzle: P, game: StepGameRecord): StepGameView {
  return {
    moves: game.moves,
    elapsedSeconds: game.clientElapsedSeconds,
    score: game.score,
    points: scoreBreakdown(def.rules, puzzle, game.moves, game.score).total,
  };
}

function toEntry<P>(def: StepGameDef<P>, puzzle: P, session: Session, game: StepGameRecord): BoardEntry<StepBoardDetail> {
  return {
    userId: session.userId,
    name: session.name,
    avatarPath: session.avatarPath,
    points: scoreBreakdown(def.rules, puzzle, game.moves, game.score).total,
    solvedTimeSeconds: game.score.solvedTimeSeconds,
    updatedAt: Date.now(),
    detail: { ...def.rules.progress(puzzle, game.moves), moves: game.moves.length, gaveUp: game.score.gaveUp },
  };
}

export async function applyStepAction<P>(
  def: StepGameDef<P>,
  session: Session,
  puzzleId: string,
  action: StepAction,
  body: Body
): Promise<{ game: StepGameView | null }> {
  const dateKey = resolveActivePuzzle(def.info, puzzleId);
  const { puzzle } = cachedPuzzle(def, dateKey);
  const store = getStore();

  if (action === "sync") {
    const game = await store.getGame<StepGameRecord>(def.info.id, puzzleId, session.userId);
    if (!game) return { game: null };
    // Opening the Activity in another server lists an existing score there too.
    await store.upsertEntry(def.info.id, puzzleId, session.scope, toEntry(def, puzzle, session, game));
    return { game: toView(def, puzzle, game) };
  }

  let result: { game: StepGameView; newlySolved: boolean };
  try {
    result = await store.withGameLock(def.info.id, puzzleId, session.userId, () =>
      updateGame(def, session, puzzleId, puzzle, action, body)
    );
  } catch (err) {
    if (err instanceof LockTimeoutError) throw new GameError("Server busy, try again", 503);
    throw err;
  }

  // Reported outside the lock so a slow webhook doesn't hold up the player's next update.
  if (result.newlySolved) {
    await reportSolve({
      gameId: def.info.id,
      userId: session.userId,
      dateKey,
      solveTimeSeconds: result.game.score.solvedTimeSeconds!,
      points: result.game.points,
    });
  }
  return { game: result.game };
}

/** The read-modify-write half of applyStepAction; callers must hold the player's game lock. */
async function updateGame<P>(
  def: StepGameDef<P>,
  session: Session,
  puzzleId: string,
  puzzle: P,
  action: Exclude<StepAction, "sync">,
  body: Body
): Promise<{ game: StepGameView; newlySolved: boolean }> {
  const store = getStore();
  const now = Date.now();
  let game = await store.getGame<StepGameRecord>(def.info.id, puzzleId, session.userId);
  const finished = game ? game.score.solvedTimeSeconds !== null || game.score.gaveUp : false;
  game ??= { moves: [], score: emptyScore(), ...newPlayTime(now) };

  if (!finished) {
    recordPlay(game, now, body.elapsedSeconds);
    // A give-up may come without moves (e.g. from another device); it keeps what's saved.
    if (body.moves !== undefined || action === "progress") {
      const moves = sanitizeMoves(def, puzzle, body.moves);
      if (!def.rules.noTakebacks || extendsMoves(game.moves, moves)) game.moves = moves;
      // A stale give-up (e.g. from a device that's behind) still gives up, keeping what's saved.
      else if (action === "progress") throw new GameError("Moves can't be taken back", 400);
    }
    game.score =
      action === "giveup"
        ? { ...game.score, gaveUp: true }
        : scoreAfterMoves(def.rules, puzzle, game.score, game.moves, scoredSeconds(game));
  }

  await store.saveGame(def.info.id, puzzleId, session.userId, game);
  await store.upsertEntry(def.info.id, puzzleId, session.scope, toEntry(def, puzzle, session, game));
  const newlySolved = !finished && game.score.solvedTimeSeconds !== null;
  return { game: toView(def, puzzle, game), newlySolved };
}

/**
 * The handlers for a step game's /api/games/<id> route. GET serves the day's
 * puzzle (?puzzleId=…, and &reveal=1 for an answer too) without sign-in, so
 * the game also works outside Discord; POST saves play.
 */
export function stepGameRoute<P>(def: StepGameDef<P>) {
  async function GET(req: Request): Promise<Response> {
    const params = new URL(req.url).searchParams;
    try {
      const dateKey = resolveActivePuzzle(def.info, params.get("puzzleId"));
      const { puzzle, solution } = cachedPuzzle(def, dateKey);
      return Response.json(params.get("reveal") === "1" ? { puzzle, solution } : { puzzle });
    } catch (err) {
      return gameErrorResponse(err);
    }
  }

  async function POST(req: Request): Promise<Response> {
    const session = sessionFromRequest(req);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Body & { puzzleId?: string; action?: StepAction };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }
    try {
      return Response.json(await applyStepAction(def, session, body.puzzleId ?? "", body.action, body));
    } catch (err) {
      return gameErrorResponse(err);
    }
  }

  return { GET, POST };
}
