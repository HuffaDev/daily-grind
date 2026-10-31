"use client";

import { useState } from "react";
import type { GameInfo } from "@/games/types";
import { AllTimeEntry, DiscordConnection, fetchAllTimeLeaderboard, fetchLeaderboard } from "@/platform/discordClient";
import { formatTime } from "@/platform/format";
import BoardList, { BoardRow, usePolledBoard } from "./BoardList";

interface Props {
  connection: DiscordConnection;
  game: GameInfo;
  puzzleId: string;
  /** The player's points as the server last saved them; a change triggers an immediate refresh. */
  myPoints: number | null;
}

type Period = "today" | "allTime";

/** A game's leaderboard for the player's server: today's puzzle, or all time. */
export default function Leaderboard({ connection, game, puzzleId, myPoints }: Props) {
  const [period, setPeriod] = useState<Period>("today");
  const { rows: loaded, failed } = usePolledBoard<{ period: Period; rows: BoardRow[] }>(
    async () => ({
      period,
      rows:
        period === "today"
          ? (await fetchLeaderboard(connection, game.id, puzzleId)).map((entry) => ({
              ...entry,
              summary: game.summarizeToday(entry),
            }))
          : (await fetchAllTimeLeaderboard(connection, game.id)).map((entry) => ({
              ...entry,
              summary: allTimeSummary(entry),
            })),
    }),
    [connection, game, puzzleId, myPoints, period]
  );
  // Right after switching tabs the last load is still the other tab's; show "Loading…" instead.
  const rows = loaded?.period === period ? loaded.rows : null;

  return (
    <section className="short:hidden mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {period === "today" ? "Today's leaderboard" : "All-time leaderboard"}
        </h2>
        <div className="flex rounded-md bg-neutral-200 dark:bg-neutral-800 p-0.5 text-xs">
          {(["today", "allTime"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 font-medium ${
                period === p
                  ? "bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 shadow-sm"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {p === "today" ? "Today" : "All time"}
            </button>
          ))}
        </div>
      </div>
      <BoardList rows={rows} failed={failed} myUserId={connection.user.id} />
    </section>
  );
}

function allTimeSummary(entry: AllTimeEntry): string {
  const parts = [`✅ ${entry.solved}/${entry.played}`];
  if (entry.wins > 0) parts.push(`🏆 ${entry.wins}`);
  if (entry.bestTimeSeconds !== null) parts.push(`⚡ ${formatTime(entry.bestTimeSeconds)}`);
  if (entry.currentStreak > 0) parts.push(`🔥 ${entry.currentStreak}`);
  return parts.join(" · ");
}
