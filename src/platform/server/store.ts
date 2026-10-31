import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

// Storage shared by every game. Keys are namespaced by game id, so games never
// see each other's saves or boards; each game decides what its saved record holds.

/** One player's row on a game's daily leaderboard. */
export interface BoardEntry<Detail = unknown> {
  userId: string;
  name: string;
  avatarPath: string | null;
  points: number;
  /** Set once the player has completed the puzzle; null while unfinished, or if they gave up. */
  solvedTimeSeconds: number | null;
  updatedAt: number;
  /** Game-specific progress for the board to show, e.g. the crossword's words solved. */
  detail: Detail;
}

export interface Store {
  getGame<T>(gameId: string, puzzleId: string, userId: string): Promise<T | null>;
  saveGame<T>(gameId: string, puzzleId: string, userId: string, game: T): Promise<void>;
  upsertEntry(gameId: string, puzzleId: string, scope: string, entry: BoardEntry): Promise<void>;
  getBoard(gameId: string, puzzleId: string, scope: string): Promise<BoardEntry[]>;
  /** Every board a scope has ever had for a game, keyed by puzzle id. */
  getAllBoards(gameId: string, scope: string): Promise<Record<string, BoardEntry[]>>;
  /**
   * Runs `fn` while holding a per-player lock, so read-modify-write updates to
   * one game take turns. Requests from the same player can otherwise land on
   * separate serverless instances and overwrite each other.
   */
  withGameLock<T>(gameId: string, puzzleId: string, userId: string, fn: () => Promise<T>): Promise<T>;
  /** Sets (or, with null, clears) the channel a server's daily post goes to. */
  setDailyChannel(guildId: string, channelId: string | null): Promise<void>;
  /** Every server's daily post channel, keyed by guild id. */
  getDailyChannels(): Promise<Record<string, string>>;
  /**
   * True the first time it is called with `name` within `ttlSeconds`, false
   * after that. Lets a job that may run twice (a retried cron) act only once.
   */
  claimOnce(name: string, ttlSeconds: number): Promise<boolean>;
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
// Boards are kept forever for the all-time leaderboards.
const GAME_TTL_SECONDS = 3 * 24 * 60 * 60;

const gameKey = (gameId: string, puzzleId: string, userId: string) => `${gameId}:game:${puzzleId}:${userId}`;
const boardKey = (gameId: string, puzzleId: string, scope: string) => `${gameId}:board:${puzzleId}:${scope}`;
/** Set of the puzzle ids a scope has a board for. */
const boardIndexKey = (gameId: string, scope: string) => `${gameId}:boards:${scope}`;
const lockKey = (gameId: string, puzzleId: string, userId: string) => `${gameId}:lock:${puzzleId}:${userId}`;
/** Hash of guild id → channel id. */
const DAILY_CHANNELS_KEY = "bot:daily-channels";
const claimKey = (name: string) => `claim:${name}`;

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
    async getGame<T>(gameId: string, puzzleId: string, userId: string) {
      return parse<T>(await client.get(key(gameKey(gameId, puzzleId, userId))));
    },
    async saveGame(gameId, puzzleId, userId, game) {
      await client.send("SET", [
        key(gameKey(gameId, puzzleId, userId)),
        JSON.stringify(game),
        "EX",
        String(GAME_TTL_SECONDS),
      ]);
    },
    async upsertEntry(gameId, puzzleId, scope, entry) {
      // Sent together, Bun pipelines them on the one connection.
      await Promise.all([
        client.send("HSET", [key(boardKey(gameId, puzzleId, scope)), entry.userId, JSON.stringify(entry)]),
        client.send("SADD", [key(boardIndexKey(gameId, scope)), puzzleId]),
      ]);
    },
    async getBoard(gameId, puzzleId, scope) {
      return parseHash(await client.send("HGETALL", [key(boardKey(gameId, puzzleId, scope))]));
    },
    async getAllBoards(gameId, scope) {
      const puzzleIds: string[] = await client.send("SMEMBERS", [key(boardIndexKey(gameId, scope))]);
      const boards = await Promise.all(
        puzzleIds.map((puzzleId) => client.send("HGETALL", [key(boardKey(gameId, puzzleId, scope))]))
      );
      return Object.fromEntries(puzzleIds.map((puzzleId, i) => [puzzleId, parseHash(boards[i])]));
    },
    async withGameLock(gameId, puzzleId, userId, fn) {
      const k = key(lockKey(gameId, puzzleId, userId));
      return withRedisLock(
        k,
        async (token) => (await client.send("SET", [k, token, "NX", "PX", String(LOCK_TTL_MS)])) !== null,
        (token) => client.send("EVAL", [RELEASE_LOCK_SCRIPT, "1", k, token]),
        fn
      );
    },
    async setDailyChannel(guildId, channelId) {
      if (channelId) await client.send("HSET", [key(DAILY_CHANNELS_KEY), guildId, channelId]);
      else await client.send("HDEL", [key(DAILY_CHANNELS_KEY), guildId]);
    },
    async getDailyChannels() {
      return (await client.send("HGETALL", [key(DAILY_CHANNELS_KEY)])) ?? {};
    },
    async claimOnce(name, ttlSeconds) {
      return (await client.send("SET", [key(claimKey(name)), "1", "NX", "EX", String(ttlSeconds)])) !== null;
    },
  };
}

function upstashStore(redis: Redis): Store {
  return {
    async getGame<T>(gameId: string, puzzleId: string, userId: string) {
      return redis.get<T>(gameKey(gameId, puzzleId, userId));
    },
    async saveGame(gameId, puzzleId, userId, game) {
      await redis.set(gameKey(gameId, puzzleId, userId), game, { ex: GAME_TTL_SECONDS });
    },
    async upsertEntry(gameId, puzzleId, scope, entry) {
      await redis
        .pipeline()
        .hset(boardKey(gameId, puzzleId, scope), { [entry.userId]: entry })
        .sadd(boardIndexKey(gameId, scope), puzzleId)
        .exec();
    },
    async getBoard(gameId, puzzleId, scope) {
      const all = await redis.hgetall<Record<string, BoardEntry>>(boardKey(gameId, puzzleId, scope));
      return all ? Object.values(all) : [];
    },
    async getAllBoards(gameId, scope) {
      const puzzleIds = await redis.smembers(boardIndexKey(gameId, scope));
      if (puzzleIds.length === 0) return {};
      const pipeline = redis.pipeline();
      for (const puzzleId of puzzleIds) {
        pipeline.hgetall<Record<string, BoardEntry>>(boardKey(gameId, puzzleId, scope));
      }
      const boards = await pipeline.exec<(Record<string, BoardEntry> | null)[]>();
      return Object.fromEntries(puzzleIds.map((puzzleId, i) => [puzzleId, Object.values(boards[i] ?? {})]));
    },
    async withGameLock(gameId, puzzleId, userId, fn) {
      const k = lockKey(gameId, puzzleId, userId);
      return withRedisLock(
        k,
        async (token) => (await redis.set(k, token, { nx: true, px: LOCK_TTL_MS })) !== null,
        (token) => redis.eval(RELEASE_LOCK_SCRIPT, [k], [token]),
        fn
      );
    },
    // Upstash parses stored strings as JSON on the way out, which would turn an
    // id like "1234567890123456789" into an imprecise number; an object keeps it a string.
    async setDailyChannel(guildId, channelId) {
      if (channelId) await redis.hset(DAILY_CHANNELS_KEY, { [guildId]: { channelId } });
      else await redis.hdel(DAILY_CHANNELS_KEY, guildId);
    },
    async getDailyChannels() {
      const all = await redis.hgetall<Record<string, { channelId: string }>>(DAILY_CHANNELS_KEY);
      return Object.fromEntries(Object.entries(all ?? {}).map(([guildId, { channelId }]) => [guildId, channelId]));
    },
    async claimOnce(name, ttlSeconds) {
      return (await redis.set(claimKey(name), "1", { nx: true, ex: ttlSeconds })) !== null;
    },
  };
}

// Development fallback when no Redis is configured. Lives on globalThis so it
// survives hot reloads; it is per-process, so it is useless on serverless.
function memoryStore(): Store {
  const g = globalThis as typeof globalThis & {
    __dailyGrindMemoryStore?: {
      games: Map<string, unknown>;
      boards: Map<string, Map<string, BoardEntry>>;
      boardIndex: Map<string, Set<string>>;
      locks: Map<string, Promise<unknown>>;
      dailyChannels: Map<string, string>;
      /** Claim name → when it expires (ms). */
      claims: Map<string, number>;
    };
  };
  g.__dailyGrindMemoryStore ??= {
    games: new Map(),
    boards: new Map(),
    boardIndex: new Map(),
    locks: new Map(),
    dailyChannels: new Map(),
    claims: new Map(),
  };
  const { games, boards, boardIndex, locks, dailyChannels, claims } = g.__dailyGrindMemoryStore;
  // Copies on the way in and out, like a real database, so callers never share live objects.
  const boardEntries = (k: string) => structuredClone([...(boards.get(k)?.values() ?? [])]);
  return {
    async getGame<T>(gameId: string, puzzleId: string, userId: string) {
      const game = games.get(gameKey(gameId, puzzleId, userId));
      return game === undefined ? null : (structuredClone(game) as T);
    },
    async saveGame(gameId, puzzleId, userId, game) {
      games.set(gameKey(gameId, puzzleId, userId), structuredClone(game));
    },
    async upsertEntry(gameId, puzzleId, scope, entry) {
      const k = boardKey(gameId, puzzleId, scope);
      if (!boards.has(k)) boards.set(k, new Map());
      boards.get(k)!.set(entry.userId, structuredClone(entry));
      const indexKey = boardIndexKey(gameId, scope);
      if (!boardIndex.has(indexKey)) boardIndex.set(indexKey, new Set());
      boardIndex.get(indexKey)!.add(puzzleId);
    },
    async getBoard(gameId, puzzleId, scope) {
      return boardEntries(boardKey(gameId, puzzleId, scope));
    },
    async getAllBoards(gameId, scope) {
      const puzzleIds = boardIndex.get(boardIndexKey(gameId, scope)) ?? [];
      return Object.fromEntries(
        [...puzzleIds].map((puzzleId) => [puzzleId, boardEntries(boardKey(gameId, puzzleId, scope))])
      );
    },
    async withGameLock(gameId, puzzleId, userId, fn) {
      const k = lockKey(gameId, puzzleId, userId);
      const previous = locks.get(k) ?? Promise.resolve();
      const run = previous.catch(() => {}).then(fn);
      locks.set(k, run);
      try {
        return await run;
      } finally {
        if (locks.get(k) === run) locks.delete(k);
      }
    },
    async setDailyChannel(guildId, channelId) {
      if (channelId) dailyChannels.set(guildId, channelId);
      else dailyChannels.delete(guildId);
    },
    async getDailyChannels() {
      return Object.fromEntries(dailyChannels);
    },
    async claimOnce(name, ttlSeconds) {
      if ((claims.get(name) ?? 0) > Date.now()) return false;
      claims.set(name, Date.now() + ttlSeconds * 1000);
      return true;
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
