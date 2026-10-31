import { describe, expect, it } from "bun:test";
import { ChannelMessage, cardsToDelete, RECENT_MS } from "./launchCards";

const APP = "111";
const NOW = Date.UTC(2026, 9, 31, 12);

/** A snowflake made `msAgo` before NOW. */
function idAt(msAgo: number): string {
  return String(BigInt(NOW - msAgo - 1420070400000) << BigInt(22));
}

function card(msAgo: number, extra: Partial<ChannelMessage> = {}): ChannelMessage {
  return { id: idAt(msAgo), author: { id: APP }, content: "", embeds: [], interaction_metadata: {}, ...extra };
}

describe("cardsToDelete", () => {
  const launch = idAt(2_000);

  it("waits until the new launch's card appears", () => {
    expect(cardsToDelete([card(60_000)], APP, launch, NOW)).toBeNull();
  });

  it("deletes earlier cards from the last hour and keeps the new one", () => {
    const fresh = card(1_000);
    const earlier = card(10 * 60_000);
    const old = card(RECENT_MS + 60_000);
    expect(cardsToDelete([fresh, earlier, old], APP, launch, NOW)).toEqual([earlier.id]);
  });

  it("leaves other messages alone", () => {
    const messages = [
      card(1_000),
      card(5_000, { author: { id: "222" } }),
      card(6_000, { content: "🏆 Leaderboard" }),
      card(7_000, { embeds: [{}] }),
      card(8_000, { interaction_metadata: undefined }),
    ];
    expect(cardsToDelete(messages, APP, launch, NOW)).toEqual([]);
  });
});
