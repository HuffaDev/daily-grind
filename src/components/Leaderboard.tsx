"use client";

import { useEffect, useState } from "react";
import {
  AllTimeEntry,
  avatarUrl,
  BoardEntry,
  DiscordConnection,
  fetchAllTimeLeaderboard,
  fetchLeaderboard,
} from "@/lib/discordClient";
import { formatTime } from "@/lib/puzzleUtils";

interface Props {
  connection: DiscordConnection;
  puzzleId: string;
  /** The player's points as the server last saved them; a change triggers an immediate refresh. */
  myPoints: number | null;
}

type Period = "today" | "allTime";

const POLL_MS = 10_000;

export default function Leaderboard({ connection, puzzleId, myPoints }: Props) {
  const [period, setPeriod] = useState<Period>("today");
  const [entries, setEntries] = useState<BoardEntry[] | null>(null);
  const [allTimeEntries, setAllTimeEntries] = useState<AllTimeEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        if (period === "today") {
          const next = await fetchLeaderboard(connection, puzzleId);
          if (!cancelled) setEntries(next);
        } else {
          const next = await fetchAllTimeLeaderboard(connection);
          if (!cancelled) setAllTimeEntries(next);
        }
        if (!cancelled) setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, puzzleId, myPoints, period]);

  const shown = period === "today" ? entries : allTimeEntries;

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
      {shown === null ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {failed ? "Couldn't load the leaderboard." : "Loading…"}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No scores yet — be the first!</p>
      ) : (
        <ol className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-sm">
          {shown.map((entry, i) => {
            const isMe = entry.userId === connection.user.id;
            return (
              <li
                key={entry.userId}
                className={`flex items-center gap-3 px-3 py-2 ${isMe ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}
              >
                <span className="w-5 text-right tabular-nums text-neutral-500 dark:text-neutral-400">{i + 1}</span>
                <Avatar player={entry} />
                <span className="flex-1 truncate font-medium text-neutral-900 dark:text-neutral-50">{entry.name}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                  {"played" in entry ? allTimeSummary(entry) : todaySummary(entry)}
                </span>
                <span className="w-14 text-right font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {entry.points}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function todaySummary(entry: BoardEntry): string {
  if (entry.solvedTimeSeconds !== null) return `✅ ${formatTime(entry.solvedTimeSeconds)}`;
  if (entry.revealed) return `🔎 ${entry.wordsSolved}/${entry.totalWords}`;
  return `${entry.wordsSolved}/${entry.totalWords} words`;
}

function allTimeSummary(entry: AllTimeEntry): string {
  const parts = [`✅ ${entry.solved}/${entry.played}`];
  if (entry.wins > 0) parts.push(`🏆 ${entry.wins}`);
  if (entry.bestTimeSeconds !== null) parts.push(`⚡ ${formatTime(entry.bestTimeSeconds)}`);
  if (entry.currentStreak > 0) parts.push(`🔥 ${entry.currentStreak}`);
  return parts.join(" · ");
}

/** The player's Discord avatar, or their initial if the image can't load. */
function Avatar({ player }: { player: { userId: string; name: string; avatarPath: string | null } }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="size-6 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700 flex items-center justify-center text-xs font-semibold text-neutral-700 dark:text-neutral-200">
        {player.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxied Discord avatar, not optimizable by next/image
    <img
      src={avatarUrl(player.userId, player.avatarPath)}
      alt=""
      width={24}
      height={24}
      onError={() => setFailed(true)}
      className="size-6 shrink-0 rounded-full object-cover"
    />
  );
}
