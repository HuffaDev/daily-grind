import { afterAll, describe, expect, it } from "bun:test";
import { emptyScore } from "@/lib/scoring";
import { BoardEntry, createRedisUrlStore, GameRecord } from "./store";

// Runs only against a real, disposable Redis database, e.g.
//   TEST_REDIS_URL=redis://127.0.0.1:6379/15 bun test
// Each run uses its own key prefix and deletes its keys afterwards.
const url = process.env.TEST_REDIS_URL;

describe.if(!!url)("Redis URL store", () => {
  const prefix = `test:${crypto.randomUUID()}:`;
  const store = createRedisUrlStore(url!, prefix);
  const admin = new Bun.RedisClient(url!);

  afterAll(async () => {
    const keys: string[] = await admin.send("KEYS", [`${prefix}*`]);
    if (keys.length) await admin.send("DEL", keys);
    admin.close();
  });

  const game: GameRecord = {
    grid: [["A", ""]],
    score: emptyScore(),
    clientElapsedSeconds: 3,
    activeSeconds: 2.5,
    lastSeenAt: 1,
    startedAt: 0,
  };
  const entry = (userId: string, points: number): BoardEntry => ({
    userId,
    name: `Player ${userId}`,
    avatarPath: null,
    points,
    wordsSolved: 1,
    totalWords: 10,
    solvedTimeSeconds: null,
    revealed: false,
    updatedAt: 0,
  });

  it("round-trips games, with a TTL, under the key prefix", async () => {
    expect(await store.getGame("2026-10-30.v1", "1")).toBeNull();
    await store.saveGame("2026-10-30.v1", "1", game);
    expect(await store.getGame("2026-10-30.v1", "1")).toEqual(game);
    const ttl: number = await admin.send("TTL", [`${prefix}game:2026-10-30.v1:1`]);
    expect(ttl).toBeGreaterThan(0);
  });

  it("keeps boards per scope, without a TTL", async () => {
    await store.upsertEntry("2026-10-29.v1", "guild:1", entry("1", 10));
    await store.upsertEntry("2026-10-30.v1", "guild:1", entry("1", 20));
    await store.upsertEntry("2026-10-30.v1", "guild:1", entry("2", 30));
    await store.upsertEntry("2026-10-30.v1", "guild:1", entry("2", 35));
    await store.upsertEntry("2026-10-30.v1", "guild:2", entry("3", 40));

    const board = await store.getBoard("2026-10-30.v1", "guild:1");
    expect(board.map((e) => [e.userId, e.points]).sort()).toEqual([
      ["1", 20],
      ["2", 35],
    ]);
    const all = await store.getAllBoards("guild:1");
    expect(Object.keys(all).sort()).toEqual(["2026-10-29.v1", "2026-10-30.v1"]);
    expect(await store.getAllBoards("guild:nope")).toEqual({});
    expect(await admin.send("TTL", [`${prefix}board:2026-10-30.v1:guild:1`])).toBe(-1);
  });

  it("runs locked updates for one player one at a time", async () => {
    const order: string[] = [];
    const update = (name: string) =>
      store.withGameLock("2026-10-30.v1", "1", async () => {
        order.push(`${name} start`);
        await Bun.sleep(50);
        order.push(`${name} end`);
      });
    await Promise.all([update("a"), update("b")]);
    // Either may win the lock, but the other must wait for it to finish.
    const [first, second] = order[0] === "a start" ? ["a", "b"] : ["b", "a"];
    expect(order).toEqual([`${first} start`, `${first} end`, `${second} start`, `${second} end`]);
    expect(await admin.send("EXISTS", [`${prefix}lock:2026-10-30.v1:1`])).toBe(0);
  });
});
