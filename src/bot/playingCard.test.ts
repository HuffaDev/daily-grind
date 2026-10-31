import { describe, expect, it } from "bun:test";
import { playingMessage } from "./messages";
import { CARD_WINDOW_MS, launcher, Player, PlayingCard, withLaunch } from "./playingCard";

const at = (userId: string, launchedAt: number): Player => ({ userId, name: `P${userId}`, launchedAt });

describe("withLaunch", () => {
  const card: PlayingCard = { messageId: "m1", updatedAt: 1_000, players: [at("2", 1_000), at("1", 500)] };

  it("adds players to the card from the last hour, most recent first, once each", () => {
    expect(withLaunch(card, at("1", 2_000))).toEqual({
      messageId: "m1",
      updatedAt: 2_000,
      players: [at("1", 2_000), at("2", 1_000)],
    });
  });

  it("starts a new card after an hour with no launches", () => {
    const later = 1_000 + CARD_WINDOW_MS;
    expect(withLaunch(card, at("3", later))).toEqual({ messageId: null, updatedAt: later, players: [at("3", later)] });
    expect(withLaunch(null, at("3", 5)).messageId).toBeNull();
  });
});

describe("launcher", () => {
  const user = { id: "7", username: "lux", global_name: "Lux" };

  it("prefers the server nickname, then the display name, then the username", () => {
    expect(launcher({ member: { nick: "Lux 🌻", user } } as never, 9)).toEqual({ userId: "7", name: "Lux 🌻", launchedAt: 9 });
    expect(launcher({ member: { nick: null, user } } as never, 9)?.name).toBe("Lux");
    expect(launcher({ user: { ...user, global_name: null } } as never, 9)?.name).toBe("lux");
    expect(launcher({} as never, 9)).toBeNull();
  });
});

describe("playingMessage", () => {
  it("lists players with escaped names and relative times, without pinging anyone", () => {
    const message = playingMessage([{ name: "*Ana*", launchedAt: 90_000 }]);
    expect(message.embeds![0].description).toBe("🎮 \\*Ana\\* · <t:90:R>");
    expect(message.content).toBe("**\\*Ana\\*** joined in!");
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.components).toHaveLength(1);
  });

  it("names the two latest players in the headline and counts the rest", () => {
    const players = ["Lux", "huffa", "mimsy", "ichi"].map((name, i) => ({ name, launchedAt: i }));
    expect(playingMessage(players.slice(0, 2)).content).toBe("**Lux** and **huffa** joined in!");
    expect(playingMessage(players.slice(0, 3)).content).toBe("**Lux**, **huffa** and 1 other joined in!");
    expect(playingMessage(players).content).toBe("**Lux**, **huffa** and 2 others joined in!");
  });
});
