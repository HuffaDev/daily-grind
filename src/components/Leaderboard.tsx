"use client";

import { useEffect, useState } from "react";
import { avatarUrl, BoardEntry, DiscordConnection, fetchLeaderboard } from "@/lib/discordClient";
import { formatTime } from "@/lib/puzzleUtils";

interface Props {
  connection: DiscordConnection;
  puzzleId: string;
  /** The player's own points; a change triggers an immediate refresh. */
  myPoints: number;
}

const POLL_MS = 10_000;

export default function Leaderboard({ connection, puzzleId, myPoints }: Props) {
  const [entries, setEntries] = useState<BoardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await fetchLeaderboard(connection, puzzleId);
        if (!cancelled) {
          setEntries(next);
          setFailed(false);
        }
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
  }, [connection, puzzleId, myPoints]);

  return (
    <section className="short:hidden mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
        Today&apos;s leaderboard
      </h2>
      {entries === null ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {failed ? "Couldn't load the leaderboard." : "Loading…"}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No scores yet — be the first!</p>
      ) : (
        <ol className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-sm">
          {entries.map((entry, i) => {
            const isMe = entry.userId === connection.user.id;
            return (
              <li
                key={entry.userId}
                className={`flex items-center gap-3 px-3 py-2 ${isMe ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}
              >
                <span className="w-5 text-right tabular-nums text-neutral-500 dark:text-neutral-400">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied Discord CDN, not optimizable by next/image */}
                <img
                  src={avatarUrl(entry.userId, entry.avatarPath)}
                  alt=""
                  width={24}
                  height={24}
                  className="rounded-full"
                />
                <span className="flex-1 truncate font-medium text-neutral-900 dark:text-neutral-50">{entry.name}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                  {entry.solvedTimeSeconds !== null
                    ? `✅ ${formatTime(entry.solvedTimeSeconds)}`
                    : entry.revealed
                      ? `🔎 ${entry.wordsSolved}/${entry.totalWords}`
                      : `${entry.wordsSolved}/${entry.totalWords} words`}
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
