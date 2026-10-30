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
  /** Every board a scope has ever had, keyed by puzzle id. */
  getAllBoards(scope: string): Promise<Record<string, BoardEntry[]>>;
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

// Yesterday's puzzle stays playable for late finishers; older games can go.
// Boards are kept forever for the all-time leaderboard.
const GAME_TTL_SECONDS = 3 * 24 * 60 * 60;

const gameKey = (puzzleId: string, userId: string) => `game:${puzzleId}:${userId}`;
const boardKey = (puzzleId: string, scope: string) => `board:${puzzleId}:${scope}`;
/** Set of the puzzle ids a scope has a board for. */
const boardIndexKey = (scope: string) => `boards:${scope}`;
const lockKey = (puzzleId: string, userId: string) => `lock:${puzzleId}:${userId}`;

/** Waits for a per-player lock held as a Redis key, for stores that can SET NX and EVAL. */
async function withRedisLock<T>(
  k: string,
  tryAcquire: (token: string) => Promise<boolean>,
  release: (token: string) => Promise<unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const token = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!(await tryAcquire(token))) {
    if (Date.now() > deadline) throw new LockTimeoutError(`Timed out waiting for game lock ${k}`);
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
  try {
    return await fn();
  } finally {
    await release(token);
  }
}

/**
 * A regular Redis server over TCP, e.g. "redis://:password@host:6379/1" (the
 * path picks the database) or "rediss://" for TLS. Uses Bun's built-in client,
 * since the app always runs on Bun. Values are stored as JSON strings.
 */
function redisUrlStore(url: string, keyPrefix: string): Store {
  const client = new Bun.RedisClient(url);
  const key = (k: string) => keyPrefix + k;
  const parse = <T>(value: string | null): T | null => (value === null ? null : (JSON.parse(value) as T));
  const parseHash = (hash: Record<string, string> | null) =>
    Object.values(hash ?? {}).map((value) => JSON.parse(value) as BoardEntry);

  return {
    async getGame(puzzleId, userId) {
      return parse<GameRecord>(await client.get(key(gameKey(puzzleId, userId))));
    },
    async saveGame(puzzleId, userId, game) {
      await client.send("SET", [key(gameKey(puzzleId, userId)), JSON.stringify(game), "EX", String(GAME_TTL_SECONDS)]);
    },
    async upsertEntry(puzzleId, scope, entry) {
      const k = key(boardKey(puzzleId, scope));
      // Sent together, Bun pipelines them on the one connection.
      await Promise.all([
        client.send("HSET", [k, entry.userId, JSON.stringify(entry)]),
        client.send("SADD", [key(boardIndexKey(scope)), puzzleId]),
      ]);
    },
    async getBoard(puzzleId, scope) {
      return parseHash(await client.send("HGETALL", [key(boardKey(puzzleId, scope))]));
    },
    async getAllBoards(scope) {
      const puzzleIds: string[] = await client.send("SMEMBERS", [key(boardIndexKey(scope))]);
      const boards = await Promise.all(
        puzzleIds.map((puzzleId) => client.send("HGETALL", [key(boardKey(puzzleId, scope))]))
      );
      return Object.fromEntries(puzzleIds.map((puzzleId, i) => [puzzleId, parseHash(boards[i])]));
    },
    async withGameLock(puzzleId, userId, fn) {
      const k = key(lockKey(puzzleId, userId));
      return withRedisLock(
        k,
        async (token) => (await client.send("SET", [k, token, "NX", "PX", String(LOCK_TTL_MS)])) !== null,
        (token) => client.send("EVAL", [RELEASE_LOCK_SCRIPT, "1", k, token]),
        fn
      );
    },
  };
}

function upstashStore(redis: Redis): Store {
  return {
    async getGame(puzzleId, userId) {
      return redis.get<GameRecord>(gameKey(puzzleId, userId));
    },
    async saveGame(puzzleId, userId, game) {
      await redis.set(gameKey(puzzleId, userId), game, { ex: GAME_TTL_SECONDS });
    },
    async upsertEntry(puzzleId, scope, entry) {
      const k = boardKey(puzzleId, scope);
      await redis
        .pipeline()
        .hset(k, { [entry.userId]: entry })
        // Boards used to expire; clears the TTL left on ones created before that changed.
        .persist(k)
        .sadd(boardIndexKey(scope), puzzleId)
        .exec();
    },
    async getBoard(puzzleId, scope) {
      const all = await redis.hgetall<Record<string, BoardEntry>>(boardKey(puzzleId, scope));
      return all ? Object.values(all) : [];
    },
    async getAllBoards(scope) {
      const puzzleIds = await redis.smembers(boardIndexKey(scope));
      if (puzzleIds.length === 0) return {};
      const pipeline = redis.pipeline();
      for (const puzzleId of puzzleIds) pipeline.hgetall<Record<string, BoardEntry>>(boardKey(puzzleId, scope));
      const boards = await pipeline.exec<(Record<string, BoardEntry> | null)[]>();
      return Object.fromEntries(puzzleIds.map((puzzleId, i) => [puzzleId, Object.values(boards[i] ?? {})]));
    },
    async withGameLock(puzzleId, userId, fn) {
      const k = lockKey(puzzleId, userId);
      return withRedisLock(
        k,
        async (token) => (await redis.set(k, token, { nx: true, px: LOCK_TTL_MS })) !== null,
        (token) => redis.eval(RELEASE_LOCK_SCRIPT, [k], [token]),
        fn
      );
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
    async getAllBoards(scope) {
      const all: Record<string, BoardEntry[]> = {};
      for (const [k, board] of boards) {
        // Keys are "board:<puzzleId>:<scope>"; puzzle ids have no colons, scopes do.
        const rest = k.slice("board:".length);
        const split = rest.indexOf(":");
        if (rest.slice(split + 1) === scope) all[rest.slice(0, split)] = structuredClone([...board.values()]);
      }
      return all;
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
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (process.env.REDIS_URL) {
    store = redisUrlStore(process.env.REDIS_URL, process.env.REDIS_KEY_PREFIX ?? "");
  } else if (upstashUrl && upstashToken) {
    store = upstashStore(new Redis({ url: upstashUrl, token: upstashToken }));
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("No Redis configured — using in-memory store; scores will not persist.");
    }
    store = memoryStore();
  }
  return store;
}

/** For tests against a real Redis server. */
export const createRedisUrlStore = redisUrlStore;
