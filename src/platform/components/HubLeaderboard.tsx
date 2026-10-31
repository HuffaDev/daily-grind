"use client";

import { useState } from "react";
import { GAMES } from "@/games/registry";
import { getPuzzleId } from "@/platform/daily";
import type { DiscordConnection } from "@/platform/discordClient";
import { useUtcDateKey } from "@/platform/useUtcDateKey";
import GlobalLeaderboard from "./GlobalLeaderboard";
import Leaderboard from "./Leaderboard";

/** "all" for the Daily Grind total, otherwise a game id. */
type Tab = "all" | string;

/** The hub's boards: the Daily Grind total across games, or any one game's own board. */
export default function HubLeaderboard({ connection }: { connection: DiscordConnection }) {
  const [tab, setTab] = useState<Tab>("all");
  const today = useUtcDateKey();
  const game = GAMES.find((g) => g.id === tab);
  const tabs = [{ id: "all", label: "Daily Grind" }, ...GAMES.map((g) => ({ id: g.id, label: `${g.emoji} ${g.name}` }))];

  return (
    <section>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1 rounded-lg bg-neutral-200 dark:bg-neutral-800 p-1 text-sm">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1 font-medium ${
              tab === id
                ? "bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 shadow-sm"
                : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {game ? (
        <Leaderboard
          key={game.id}
          connection={connection}
          game={game}
          puzzleId={getPuzzleId(today, game.puzzleVersion)}
          myPoints={null}
          className=""
        />
      ) : (
        <GlobalLeaderboard connection={connection} />
      )}
    </section>
  );
}
