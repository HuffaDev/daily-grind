import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { crossword } from "@/games/crossword/meta";
import { getPuzzleId, getUtcDateKey, previousDateKey } from "@/platform/daily";
import { BoardEntry, getStore } from "@/platform/server/store";
import { GET as cronGet } from "@/app/api/cron/daily/route";
import { runDailyPosts } from "./daily";
import { InteractionType, MessageBody, ResponseType, verifyInteraction } from "./discord";
import { handleInteraction } from "./interactions";

// Runs against the in-memory store; each test uses its own guild id, since the store is shared.

const today = getUtcDateKey();
let nextGuild = 1;
const newGuild = () => `9000${nextGuild++}`;

function entry(userId: string, name: string, points: number, solvedTimeSeconds: number | null = 60): BoardEntry {
  return {
    userId,
    name,
    avatarPath: null,
    points,
    solvedTimeSeconds,
    updatedAt: 0,
    detail: { wordsSolved: 10, totalWords: 10, revealed: false },
  };
}

const command = (guildId: string | undefined, name: string, options?: unknown[]) =>
  ({ type: InteractionType.APPLICATION_COMMAND, guild_id: guildId, data: { name, options } }) as never;

/** Discord REST calls the bot made, with a scripted reply. */
let sent: { url: string; body: MessageBody }[] = [];
let discordReply: () => Response = () => Response.json({ id: "1" });
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent = [];
  discordReply = () => Response.json({ id: "1" });
  process.env.DISCORD_BOT_TOKEN = "bot-token";
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return discordReply();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.DISCORD_BOT_TOKEN;
});

describe("verifyInteraction", () => {
  it("accepts only requests signed with the app's key", async () => {
    const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    process.env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("hex");
    const body = JSON.stringify({ type: 1 });
    const sign = async (message: string) =>
      Buffer.from(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(message))).toString("hex");
    const request = (signature: string) =>
      new Request("https://x.test", { headers: { "x-signature-ed25519": signature, "x-signature-timestamp": "123" } });

    expect(await verifyInteraction(request(await sign(`123${body}`)), body)).toBe(true);
    expect(await verifyInteraction(request(await sign(`123${body}`)), body + " ")).toBe(false);
    expect(await verifyInteraction(request(await sign(`999${body}`)), body)).toBe(false);
    expect(await verifyInteraction(request("zz"), body)).toBe(false);
    delete process.env.DISCORD_PUBLIC_KEY;
  });
});

describe("handleInteraction", () => {
  it("answers Discord's endpoint check", async () => {
    expect(await handleInteraction({ type: InteractionType.PING })).toEqual({ type: ResponseType.PONG });
  });

  it("launches the Activity from /play and the Play button", async () => {
    expect(await handleInteraction(command("1", "play"))).toEqual({ type: ResponseType.LAUNCH_ACTIVITY });
    expect(
      await handleInteraction({ type: InteractionType.MESSAGE_COMPONENT, guild_id: "1", data: { custom_id: "play" } })
    ).toEqual({ type: ResponseType.LAUNCH_ACTIVITY });
  });

  it("shows the server's global and per-game boards, escaping names and never pinging", async () => {
    const guild = newGuild();
    const puzzleId = getPuzzleId(today, crossword.puzzleVersion);
    await getStore().upsertEntry(crossword.id, puzzleId, `guild:${guild}`, entry("1", "Ana_B", 600));
    await getStore().upsertEntry(crossword.id, puzzleId, `guild:${guild}`, entry("2", "Bo", 640, 45));

    const global = await handleInteraction(command(guild, "leaderboard"));
    expect(global).toMatchObject({ type: ResponseType.CHANNEL_MESSAGE, data: { allowed_mentions: { parse: [] } } });
    const globalText = (global as { data: MessageBody }).data.embeds![0].description!;
    expect(globalText.split("\n")).toEqual([
      "**1.** Bo — 640 pts · ✅ 1/1 · 🔥 1",
      "**2.** Ana\\_B — 600 pts · ✅ 1/1 · 🔥 1",
    ]);

    const game = await handleInteraction(command(guild, "leaderboard", [{ name: "game", type: 3, value: "crossword" }]));
    expect((game as { data: MessageBody }).data.embeds![0].description).toContain("**1.** Bo — 640 pts · ✅ 0:45");
  });

  it("only works in servers", async () => {
    const reply = await handleInteraction(command(undefined, "leaderboard"));
    expect(reply).toMatchObject({ data: { flags: 64 } });
  });

  it("turns daily posts on after posting today's, and off again", async () => {
    const guild = newGuild();
    const set = [{ name: "set", type: 1, options: [{ name: "channel", type: 7, value: "555" }] }];
    const reply = await handleInteraction(command(guild, "daily", set));
    expect(reply).toMatchObject({ data: { content: expect.stringContaining("<#555>"), flags: 64 } });
    expect(sent.map((s) => s.url)).toEqual(["https://discord.com/api/v10/channels/555/messages"]);
    expect(sent[0].body.embeds![0].title).toContain("new puzzles are out");
    expect((await getStore().getDailyChannels())[guild]).toBe("555");

    // Setting it again the same day still posts, to check the new channel.
    await handleInteraction(command(guild, "daily", set));
    expect(sent).toHaveLength(2);

    await handleInteraction(command(guild, "daily", [{ name: "stop", type: 1 }]));
    expect((await getStore().getDailyChannels())[guild]).toBeUndefined();
  });

  it("keeps daily posts off when it can't post in the channel", async () => {
    const guild = newGuild();
    discordReply = () => Response.json({ code: 50001, message: "Missing Access" }, { status: 403 });
    const set = [{ name: "set", type: 1, options: [{ name: "channel", type: 7, value: "556" }] }];
    const reply = await handleInteraction(command(guild, "daily", set));
    expect(reply).toMatchObject({ data: { content: expect.stringContaining("can't post"), flags: 64 } });
    expect((await getStore().getDailyChannels())[guild]).toBeUndefined();
  });
});

describe("daily posts", () => {
  it("post once a day per server, with yesterday's best solvers", async () => {
    const guild = newGuild();
    await getStore().setDailyChannel(guild, "777");
    const yesterdayId = getPuzzleId(previousDateKey(today), crossword.puzzleVersion);
    await getStore().upsertEntry(crossword.id, yesterdayId, `guild:${guild}`, entry("1", "Ana", 600));
    await getStore().upsertEntry(crossword.id, yesterdayId, `guild:${guild}`, entry("2", "Gave up", 900, null));

    await runDailyPosts(today);
    await runDailyPosts(today);
    const mine = sent.filter((s) => s.url.endsWith("/channels/777/messages"));
    expect(mine).toHaveLength(1);
    expect(mine[0].body.embeds![0].fields).toEqual([{ name: "Yesterday's best", value: "📝 🥇 Ana · 600" }]);
    expect(mine[0].body.components).toEqual([
      { type: 1, components: [expect.objectContaining({ type: 2, custom_id: "play" })] },
    ]);
    await getStore().setDailyChannel(guild, null);
  });

  it("turn off for a server whose channel was deleted", async () => {
    const guild = newGuild();
    await getStore().setDailyChannel(guild, "778");
    discordReply = () => Response.json({ code: 10003, message: "Unknown Channel" }, { status: 404 });
    const result = await runDailyPosts("2030-01-01");
    expect(result.removed).toBeGreaterThanOrEqual(1);
    expect((await getStore().getDailyChannels())[guild]).toBeUndefined();
  });

  it("only run from Vercel Cron, with the cron secret", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const call = (authorization?: string) =>
      cronGet(new Request("https://x.test/api/cron/daily", { headers: authorization ? { authorization } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("Bearer cron-secret")).status).toBe(200);
    delete process.env.CRON_SECRET;
  });
});
