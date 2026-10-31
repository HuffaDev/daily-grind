import type { GameInfo } from "@/games/types";
import { movesStartWith, PlayRound, RoundGameView } from "../roundGame/types";
import { GameError, gameErrorResponse, newPlayTime, PlayTime, recordPlay, resolveActivePuzzle, scoredSeconds } from "./games";
import { reportSolve } from "./webhook";
import { Session, sessionFromRequest } from "./session";
import { BoardEntry, getStore, LockTimeoutError } from "./store";

/** What the shared server needs to run a round game's API. */
export interface RoundGameDef<Move> {
  info: GameInfo;
  /** The move a client sent, or undefined if it isn't a valid one. */
  parseMove(value: unknown): Move | undefined;
  play: PlayRound<Move>;
}

type Action = "sync" | "progress";

interface Body {
  moves?: unknown;
  elapsedSeconds?: unknown;
}

interface GameRecord<Move> extends PlayTime {
  moves: Move[];
  solvedTimeSeconds: number | null;
}

/** Far more than any round game takes; stops an oversized upload from being replayed move by move. */
const MAX_MOVES = 100;

function parseMoves<Move>(def: RoundGameDef<Move>, value: unknown): Move[] {
  if (!Array.isArray(value) || value.length > MAX_MOVES) throw new GameError("Invalid moves", 400);
  return value.map((raw) => {
    const move = def.parseMove(raw);
    if (move === undefined) throw new GameError("Invalid moves", 400);
    return move;
  });
}

function toView<Move>(def: RoundGameDef<Move>, dateKey: string, game: GameRecord<Move>): RoundGameView<Move> {
  return { moves: game.moves, points: def.play(dateKey, game.moves).points, elapsedSeconds: game.clientElapsedSeconds };
}

function toEntry<Move>(def: RoundGameDef<Move>, dateKey: string, session: Session, game: GameRecord<Move>): BoardEntry {
  const { points, detail } = def.play(dateKey, game.moves);
  return {
    userId: session.userId,
    name: session.name,
    avatarPath: session.avatarPath,
    points,
    solvedTimeSeconds: game.solvedTimeSeconds,
    updatedAt: Date.now(),
    detail,
  };
}

export async function applyRoundAction<Move>(
  def: RoundGameDef<Move>,
  session: Session,
  puzzleId: string,
  action: Action,
  body: Body
): Promise<{ game: RoundGameView<Move> | null }> {
  const { info } = def;
  const dateKey = resolveActivePuzzle(info, puzzleId);
  const store = getStore();

  if (action === "sync") {
    const game = await store.getGame<GameRecord<Move>>(info.id, puzzleId, session.userId);
    if (!game) return { game: null };
    // Opening the Activity in another server lists an existing score there too.
    await store.upsertEntry(info.id, puzzleId, session.scope, toEntry(def, dateKey, session, game));
    return { game: toView(def, dateKey, game) };
  }

  const incoming = parseMoves(def, body.moves);
  let result: { game: GameRecord<Move> | null; newlySolved: boolean };
  try {
    result = await store.withGameLock(info.id, puzzleId, session.userId, () =>
      updateGame(def, session, puzzleId, dateKey, incoming, body.elapsedSeconds)
    );
  } catch (err) {
    if (err instanceof LockTimeoutError) throw new GameError("Server busy, try again", 503);
    throw err;
  }
  const { game, newlySolved } = result;
  if (!game) return { game: null };

  // Reported outside the lock so a slow webhook doesn't hold up the player's next update.
  if (newlySolved) {
    await reportSolve({
      gameId: info.id,
      userId: session.userId,
      dateKey,
      solveTimeSeconds: game.solvedTimeSeconds!,
      points: def.play(dateKey, game.moves).points,
    });
  }
  return { game: toView(def, dateKey, game) };
}

/** The read-modify-write half of applyRoundAction; callers must hold the player's game lock. */
async function updateGame<Move>(
  def: RoundGameDef<Move>,
  session: Session,
  puzzleId: string,
  dateKey: string,
  incoming: Move[],
  elapsedSeconds: unknown
): Promise<{ game: GameRecord<Move> | null; newlySolved: boolean }> {
  const { info, play } = def;
  const store = getStore();
  const now = Date.now();
  const saved = await store.getGame<GameRecord<Move>>(info.id, puzzleId, session.userId);
  if (!saved && incoming.length === 0) return { game: null, newlySolved: false };
  const game: GameRecord<Move> = saved ?? { moves: [], solvedTimeSeconds: null, ...newPlayTime(now) };

  // Moves are final: anything that rewrites one is ignored, and the player gets the saved game back.
  const finished = play(dateKey, game.moves).finished;
  if (finished || !movesStartWith(incoming, game.moves)) return { game, newlySolved: false };

  recordPlay(game, now, elapsedSeconds);
  if (incoming.length === game.moves.length) {
    await store.saveGame(info.id, puzzleId, session.userId, game);
    return { game, newlySolved: false };
  }

  for (const move of incoming.slice(game.moves.length)) {
    game.moves.push(move);
    if (play(dateKey, game.moves).finished) break;
  }

  const result = play(dateKey, game.moves);
  const newlySolved = result.solved && game.solvedTimeSeconds === null;
  if (newlySolved) game.solvedTimeSeconds = scoredSeconds(game);

  await store.saveGame(info.id, puzzleId, session.userId, game);
  await store.upsertEntry(info.id, puzzleId, session.scope, toEntry(def, dateKey, session, game));
  return { game, newlySolved };
}

const ACTIONS: Action[] = ["sync", "progress"];

/** The POST handler for `src/app/api/games/<id>/route.ts`. */
export function roundGameRoute<Move>(def: RoundGameDef<Move>) {
  return async function POST(req: Request): Promise<Response> {
    const session = sessionFromRequest(req);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body & { puzzleId?: string; action?: Action };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }
    try {
      return Response.json(await applyRoundAction(def, session, body.puzzleId ?? "", body.action, body));
    } catch (err) {
      return gameErrorResponse(err);
    }
  };
}
