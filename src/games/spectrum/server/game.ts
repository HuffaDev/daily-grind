import { GameError, resolveActivePuzzle } from "@/platform/server/games";
import type { Session } from "@/platform/server/session";
import { BoardEntry, getStore, LockTimeoutError } from "@/platform/server/store";
import { spectrum } from "../meta";
import { averages, scoreMarks, validMarks } from "../lib/rounds";

// Spectrum's scores depend on everyone else's marks, so each server ("scope")
// keeps one shared record of its players' marks, and every new set of marks
// rescores the whole board. A player's own record keeps their marks, so they
// count in every server they open the game in.

export type GameAction = "sync" | "submit";

/** One player's marks for one day. */
interface PlayerRecord {
  marks: number[];
  seconds: number;
}

/** A scope's marks for one day, by user id. */
interface ScopeRecord {
  players: Record<string, number[]>;
}

export interface SpectrumDetail {
  /** How far the player's marks are from the room's averages, on average. */
  averageMiss: number;
}

/** What the player sees: their marks, and the room's averages once they've played. */
export interface GameView {
  marks: number[] | null;
  /** Each round's average mark in this server, and how many players it's from. */
  room: { means: number[]; players: number } | null;
  points: number;
}

/** The scope's shared record lives beside the players' own, under a key no user id can take. */
const scopeKey = (scope: string) => `scope:${scope}`;
const MAX_SECONDS = 60 * 60;

/** Adds the player's marks to their scope and rescores everyone there. Callers hold the scope's lock. */
async function joinScope(puzzleId: string, session: Session, mine: PlayerRecord): Promise<GameView> {
  const store = getStore();
  const key = scopeKey(session.scope);
  const record = (await store.getGame<ScopeRecord>(spectrum.id, puzzleId, key)) ?? { players: {} };
  const isNew = !record.players[session.userId];
  record.players[session.userId] = mine.marks;
  if (isNew) await store.saveGame(spectrum.id, puzzleId, key, record);

  const means = averages(Object.values(record.players));
  const board = new Map((await store.getBoard(spectrum.id, puzzleId, session.scope)).map((e) => [e.userId, e]));
  let myPoints = 0;
  for (const [userId, marks] of Object.entries(record.players)) {
    const { points, averageMiss } = scoreMarks(marks, means);
    const previous = board.get(userId);
    const isMe = userId === session.userId;
    if (isMe) myPoints = points;
    if (!isMe && (!previous || previous.points === points)) continue;
    const entry: BoardEntry<SpectrumDetail> = {
      userId,
      name: isMe ? session.name : previous!.name,
      avatarPath: isMe ? session.avatarPath : previous!.avatarPath,
      points,
      solvedTimeSeconds: isMe ? mine.seconds : previous!.solvedTimeSeconds,
      updatedAt: isMe ? Date.now() : previous!.updatedAt,
      detail: { averageMiss },
    };
    await store.upsertEntry(spectrum.id, puzzleId, session.scope, entry);
  }
  return { marks: mine.marks, room: { means, players: Object.keys(record.players).length }, points: myPoints };
}

export async function applySpectrumAction(
  session: Session,
  puzzleId: string,
  action: GameAction,
  body: { marks?: unknown; elapsedSeconds?: unknown }
): Promise<{ game: GameView }> {
  resolveActivePuzzle(spectrum, puzzleId);
  const store = getStore();
  try {
    let mine = await store.getGame<PlayerRecord>(spectrum.id, puzzleId, session.userId);
    if (action === "submit" && !mine) {
      if (!validMarks(body.marks)) throw new GameError("Invalid marks", 400);
      const seconds = Math.min(MAX_SECONDS, Math.max(0, Math.floor(Number(body.elapsedSeconds) || 0)));
      // Marks are final: a second submit (another device, a retry) keeps the first.
      mine = await store.withGameLock(spectrum.id, puzzleId, session.userId, async () => {
        const saved = await store.getGame<PlayerRecord>(spectrum.id, puzzleId, session.userId);
        if (saved) return saved;
        const record = { marks: body.marks as number[], seconds };
        await store.saveGame(spectrum.id, puzzleId, session.userId, record);
        return record;
      });
    }
    if (!mine) return { game: { marks: null, room: null, points: 0 } };
    const played = mine;
    const game = await store.withGameLock(spectrum.id, puzzleId, scopeKey(session.scope), () =>
      joinScope(puzzleId, session, played)
    );
    return { game };
  } catch (err) {
    if (err instanceof LockTimeoutError) throw new GameError("Server busy, try again", 503);
    throw err;
  }
}
