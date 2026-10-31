import { describe, expect, it } from "bun:test";
import { playingMessage } from "./messages";
import { applyPresence, CARD_WINDOW_MS, PlayingCard, playingNow, PresenceUpdate } from "./playingCard";

const lux = { userId: "1", name: "Lux" };
const huffa = { userId: "2", name: "huffa" };

function report(reporter: { userId: string; name: string }, users: string[] | null, leaving = false): PresenceUpdate {
  return { instanceId: "i1", users, reporter, leaving };
}

describe("applyPresence", () => {
  it("starts a card when someone opens the Activity, and adds people as they report", () => {
    let card = applyPresence(null, report(lux, ["1"]), 1_000)!;
    expect(card.messageId).toBeNull();
    card = applyPresence({ ...card, messageId: "m1" }, report(huffa, ["1", "2"]), 2_000)!;
    expect(card.messageId).toBe("m1");
    expect(card.players.map((p) => p.name)).toEqual(["huffa", "Lux"]);
    expect([...playingNow(card)]).toEqual(["1", "2"]);
  });

  it("keeps players who left on the card, no longer playing", () => {
    let card = applyPresence(null, report(lux, ["1", "2"]), 1_000)!;
    card = applyPresence(card, report(huffa, ["1", "2"]), 1_000)!;
    card = applyPresence(card, report(lux, ["1", "2"], true), 5_000)!;
    expect([...playingNow(card)]).toEqual(["2"]);
    expect(card.players.find((p) => p.userId === "1")!.lastSeenAt).toBe(1_000);
    // The Activity ending clears it.
    card = applyPresence(card, report(huffa, null), 6_000)!;
    expect(playingNow(card).size).toBe(0);
    expect(card.players).toHaveLength(2);
  });

  it("never adds someone Discord doesn't list in the Activity", () => {
    expect(applyPresence(null, report(lux, ["2"]), 1_000)).toBeNull();
    const card = applyPresence(null, report(huffa, ["2"]), 1_000)!;
    expect(applyPresence(card, report(lux, ["2"]), 2_000)!.players.map((p) => p.name)).toEqual(["huffa"]);
  });

  it("starts a new card after an hour without activity", () => {
    const card: PlayingCard = { ...applyPresence(null, report(lux, ["1"]), 0)!, messageId: "m1" };
    expect(applyPresence(card, report(lux, ["1"], true), CARD_WINDOW_MS)).toBeNull();
    expect(applyPresence(card, report(huffa, ["2"]), CARD_WINDOW_MS)!.messageId).toBeNull();
  });
});

describe("playingMessage", () => {
  const players = [
    { ...lux, lastSeenAt: 90_000 },
    { ...huffa, lastSeenAt: 90_000 },
    { userId: "3", name: "*mimsy*", lastSeenAt: 60_000 },
    { userId: "4", name: "ichi", lastSeenAt: 30_000 },
  ];

  it("leads with who's playing, and lists who left", () => {
    const message = playingMessage(players, new Set(["1", "2"]));
    expect(message.content).toBe("**Lux** and **huffa** are playing!");
    expect(message.embeds![0].description).toBe(
      "🟢 Lux\n🟢 huffa\n⚪ \\*mimsy\\* · left <t:60:R>\n⚪ ichi · left <t:30:R>"
    );
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(playingMessage(players, new Set(["4"])).content).toBe("**ichi** is playing!");
  });

  it("says who was playing once everyone has left", () => {
    expect(playingMessage(players, new Set()).content).toBe("**Lux**, **huffa** and 2 others were playing");
    expect(playingMessage(players.slice(3), new Set()).content).toBe("**ichi** was playing");
  });
});
