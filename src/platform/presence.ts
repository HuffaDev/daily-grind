import type { DiscordConnection } from "./discordClient";

// Tells the server who's in the Activity so the bot can keep the channel's
// "playing" card current (see src/bot/playingCard.ts): on opening, whenever
// someone joins or leaves, every minute as a fallback, and on closing.

const REPORT_EVERY_MS = 60_000;

let started = false;

/** Starts reporting for this page load; later calls do nothing. */
export function startPresence(conn: DiscordConnection) {
  const { channelId, instanceId } = conn.sdk;
  if (started || !channelId || !instanceId) return;
  started = true;

  const report = () =>
    fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${conn.session}` },
      body: JSON.stringify({ channelId, instanceId }),
    }).catch(() => {});

  report();
  setInterval(report, REPORT_EVERY_MS);
  conn.sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", report).catch(() => {});
  // A beacon still gets sent as the page goes away; it can't carry headers, so the session rides in the body.
  window.addEventListener("pagehide", () => {
    const body = JSON.stringify({ channelId, instanceId, leaving: true, session: conn.session });
    navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" }));
  });
}
