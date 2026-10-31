"use client";

import { DiscordConnection, fetchGlobalLeaderboard, GlobalEntry } from "@/platform/discordClient";
import { GAMES } from "@/games/registry";
import BoardList, { BoardRow, usePolledBoard } from "./BoardList";

/** Standings across every game for the player's server. */
export default function GlobalLeaderboard({ connection }: { connection: DiscordConnection }) {
  const { rows, failed } = usePolledBoard<BoardRow[]>(
    async () => (await fetchGlobalLeaderboard(connection)).map((entry) => ({ ...entry, summary: summary(entry) })),
    [connection]
  );

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Daily Grind: all games
      </h2>
      <BoardList rows={rows} failed={failed} myUserId={connection.user.id} />
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        All games, all time. 🔥 counts days in a row with at least one game solved.
      </p>
    </section>
  );
}

function summary(entry: GlobalEntry): string {
  // The games a player has points in, as their emoji, e.g. "📝".
  const games = GAMES.filter((game) => game.id in entry.gamePoints).map((game) => game.emoji).join("");
  const parts = [games, `✅ ${entry.solved}/${entry.played}`];
  if (entry.wins > 0) parts.push(`🏆 ${entry.wins}`);
  if (entry.currentStreak > 0) parts.push(`🔥 ${entry.currentStreak}`);
  return parts.join(" · ");
}
