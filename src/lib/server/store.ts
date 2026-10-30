import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { ScoreRecord } from "@/lib/scoring";

/** Server-side record of one player's attempt at one day's puzzle. */
export interface GameRecord {
  grid: string[][];
  score: ScoreRecord;
  /** Highest elapsed time the client has reported. */
  clientElapsedSeconds: number;
  /** Time the server saw the player actively playing, from gaps between requests. */
  activeSeconds: number;
  lastSeenAt: number;
  startedAt: number;
}

export interface BoardEntry {
  userId: string;
  name: string;
  avatarPath: string | null;
  points: number;
  wordsSolved: number;
  totalWords: number;
  solvedTimeSeconds: number | null;
  revealed: boolean;
  updatedAt: number;
}

export interface Store {
  getGame(puzzleId: string, userId: string): Promise<GameRecord | null>;
  saveGame(puzzleId: string, userId: string, game: GameRecord): Promise<void>;
  upsertEntry(puzzleId: string, scope: string, entry: BoardEntry): Promise<void>;
  getBoard(puzzleId: string, scope: string): Promise<BoardEntry[]>;
  /**
   * Runs `fn` while holding a per-player lock, so read-modify-write updates to
   * one game take turns. Requests from the same player can otherwise land on
   * separate serverless instances and overwrite each other.
   */
  withGameLock<T>(puzzleId: string, userId: string, fn: () => Promise<T>): Promise<T>;
}

export class LockTimeoutError extends Error {}

/** Expires a lock left behind by a crashed request; far longer than one game update takes. */
const LOCK_TTL_MS = 5_000;
const LOCK_WAIT_MS = 4_000;
const LOCK_RETRY_MS = 40;

// Deletes the lock only if it still holds our token, so a request that
// overran the TTL can't release a lock another request has since taken.
const RELEASE_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

// Yesterday's puzzle stays reachable for late finishers; anything older can go.
const TTL_SECONDS = 3 * 24 * 60 * 60;

const gameKey = (puzzleId: string, userId: string) => `game:${puzzleId}:${userId}`;
const boardKey = (puzzleId: string, scope: string) => `board:${puzzleId}:${scope}`;
const lockKey = (puzzleId: string, userId: string) => `lock:${puzzleId}:${userId}`;

function redisStore(redis: Redis): Store {
  return {
    async getGame(puzzleId, userId) {
      return redis.get<GameRecord>(gameKey(puzzleId, userId));
    },
    async saveGame(puzzleId, userId, game) {
      await redis.set(gameKey(puzzleId, userId), game, { ex: TTL_SECONDS });
    },
    async upsertEntry(puzzleId, scope, entry) {
      const k = boardKey(puzzleId, scope);
      await redis.pipeline().hset(k, { [entry.userId]: entry }).expire(k, TTL_SECONDS).exec();
    },
    async getBoard(puzzleId, scope) {
      const all = await redis.hgetall<Record<string, BoardEntry>>(boardKey(puzzleId, scope));
      return all ? Object.values(all) : [];
    },
    async withGameLock(puzzleId, userId, fn) {
      const k = lockKey(puzzleId, userId);
      const token = randomUUID();
      const deadline = Date.now() + LOCK_WAIT_MS;
      while (!(await redis.set(k, token, { nx: true, px: LOCK_TTL_MS }))) {
        if (Date.now() > deadline) throw new LockTimeoutError("Timed out waiting for game lock");
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
      try {
        return await fn();
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, [k], [token]);
      }
    },
  };
}

// Development fallback when no Redis is configured. Lives on globalThis so it
// survives hot reloads; it is per-process, so it is useless on serverless.
function memoryStore(): Store {
  const g = globalThis as typeof globalThis & {
    __crosswordMemoryStore?: {
      games: Map<string, GameRecord>;
      boards: Map<string, Map<string, BoardEntry>>;
      locks: Map<string, Promise<unknown>>;
    };
  };
  g.__crosswordMemoryStore ??= { games: new Map(), boards: new Map(), locks: new Map() };
  const { games, boards, locks } = g.__crosswordMemoryStore;
  // Copies on the way in and out, like a real database, so callers never share live objects.
  return {
    async getGame(puzzleId, userId) {
      const game = games.get(gameKey(puzzleId, userId));
      return game ? structuredClone(game) : null;
    },
    async saveGame(puzzleId, userId, game) {
      games.set(gameKey(puzzleId, userId), structuredClone(game));
    },
    async upsertEntry(puzzleId, scope, entry) {
      const k = boardKey(puzzleId, scope);
      if (!boards.has(k)) boards.set(k, new Map());
      boards.get(k)!.set(entry.userId, entry);
    },
    async getBoard(puzzleId, scope) {
      return [...(boards.get(boardKey(puzzleId, scope))?.values() ?? [])];
    },
    async withGameLock(puzzleId, userId, fn) {
      const k = lockKey(puzzleId, userId);
      const previous = locks.get(k) ?? Promise.resolve();
      const run = previous.catch(() => {}).then(fn);
      locks.set(k, run);
      try {
        return await run;
      } finally {
        if (locks.get(k) === run) locks.delete(k);
      }
    },
  };
}

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  // Vercel's Upstash integration may expose either naming scheme.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    store = redisStore(new Redis({ url, token }));
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("No Upstash Redis configured — using in-memory store; scores will not persist.");
    }
    store = memoryStore();
  }
  return store;
}
