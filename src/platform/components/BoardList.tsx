"use client";

import { useEffect, useState } from "react";
import { avatarUrl } from "@/platform/discordClient";

export interface BoardRow {
  userId: string;
  name: string;
  avatarPath: string | null;
  points: number;
  /** Short stats shown before the points, e.g. "✅ 1:23". */
  summary: string;
}

const POLL_MS = 10_000;

/**
 * Loads a board now, whenever `deps` change, and every few seconds while the
 * page is visible. `rows` is null until the first load; `failed` is set while loading fails.
 */
export function usePolledBoard<T>(load: () => Promise<T>, deps: readonly unknown[]): { rows: T | null; failed: boolean } {
  const [rows, setRows] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await load();
        if (!cancelled) {
          setRows(next);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // `load` is usually an inline closure; callers list what it depends on in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { rows, failed };
}

interface Props {
  rows: BoardRow[] | null;
  failed: boolean;
  /** The signed-in player, whose row is highlighted. */
  myUserId: string;
}

export default function BoardList({ rows, failed, myUserId }: Props) {
  if (rows === null) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {failed ? "Couldn't load the leaderboard." : "Loading…"}
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">No scores yet — be the first!</p>;
  }
  return (
    <ol className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-sm">
      {rows.map((row, i) => (
        <li
          key={row.userId}
          className={`flex items-center gap-3 px-3 py-2 ${row.userId === myUserId ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}
        >
          <span className="w-5 text-right tabular-nums text-neutral-500 dark:text-neutral-400">{i + 1}</span>
          <Avatar player={row} />
          <span className="flex-1 truncate font-medium text-neutral-900 dark:text-neutral-50">{row.name}</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">{row.summary}</span>
          <span className="w-14 text-right font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
            {row.points}
          </span>
        </li>
      ))}
    </ol>
  );
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
