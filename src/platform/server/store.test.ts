import { afterAll, describe, expect, it } from "bun:test";
import { BoardEntry, createRedisUrlStore } from "./store";

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

  const game = { grid: [["A", ""]], elapsedSeconds: 3 };
  const entry = (userId: string, points: number): BoardEntry => ({
    userId,
    name: `Player ${userId}`,
    avatarPath: null,
    points,
    solvedTimeSeconds: null,
    updatedAt: 0,
    detail: { wordsSolved: 1 },
  });

  it("round-trips games, with a TTL, under the key prefix", async () => {
    expect(await store.getGame("test", "2026-10-30.v1", "1")).toBeNull();
    await store.saveGame("test", "2026-10-30.v1", "1", game);
    expect(await store.getGame("test", "2026-10-30.v1", "1")).toEqual(game);
    expect(await store.getGame("other", "2026-10-30.v1", "1")).toBeNull();
    const ttl: number = await admin.send("TTL", [`${prefix}test:game:2026-10-30.v1:1`]);
    expect(ttl).toBeGreaterThan(0);
  });

  it("keeps boards per game and scope, without a TTL", async () => {
    await store.upsertEntry("test", "2026-10-29.v1", "guild:1", entry("1", 10));
    await store.upsertEntry("test", "2026-10-30.v1", "guild:1", entry("1", 20));
    await store.upsertEntry("test", "2026-10-30.v1", "guild:1", entry("2", 30));
    await store.upsertEntry("test", "2026-10-30.v1", "guild:1", entry("2", 35));
    await store.upsertEntry("test", "2026-10-30.v1", "guild:2", entry("3", 40));
    await store.upsertEntry("other", "2026-10-30.v1", "guild:1", entry("4", 50));

    const board = await store.getBoard("test", "2026-10-30.v1", "guild:1");
    expect(board.map((e) => [e.userId, e.points]).sort()).toEqual([
      ["1", 20],
      ["2", 35],
    ]);
    const all = await store.getAllBoards("test", "guild:1");
    expect(Object.keys(all).sort()).toEqual(["2026-10-29.v1", "2026-10-30.v1"]);
    expect(await store.getAllBoards("test", "guild:nope")).toEqual({});
    expect(await admin.send("TTL", [`${prefix}test:board:2026-10-30.v1:guild:1`])).toBe(-1);
  });

  it("runs locked updates for one player one at a time", async () => {
    const order: string[] = [];
    const update = (name: string) =>
      store.withGameLock("test", "2026-10-30.v1", "1", async () => {
        order.push(`${name} start`);
        await Bun.sleep(50);
        order.push(`${name} end`);
      });
    await Promise.all([update("a"), update("b")]);
    // Either may win the lock, but the other must wait for it to finish.
    const [first, second] = order[0] === "a start" ? ["a", "b"] : ["b", "a"];
    expect(order).toEqual([`${first} start`, `${first} end`, `${second} start`, `${second} end`]);
    expect(await admin.send("EXISTS", [`${prefix}test:lock:2026-10-30.v1:1`])).toBe(0);
  });
});
