"use client";

import { GAMES } from "@/games/registry";
import { useDiscordConnection } from "@/platform/useDiscordConnection";
import GlobalLeaderboard from "./GlobalLeaderboard";
import LaunchLink from "./LaunchLink";
import NextPuzzleCountdown from "./NextPuzzleCountdown";
import ThemeToggle from "./ThemeToggle";

/** The landing page: pick a game, and see the server's standings across all of them. */
export default function Hub() {
  const { connection, error } = useDiscordConnection();

  return (
    <div className="max-w-3xl mx-auto p-4 short:p-2">
      <header className="flex items-start justify-between gap-3 mb-6 short:mb-2">
        <div>
          <h1 className="text-2xl short:text-base font-bold text-neutral-900 dark:text-neutral-50">Daily Grind</h1>
          <p className="short:hidden text-xs text-neutral-500 dark:text-neutral-400">
            New puzzles every day · next in <NextPuzzleCountdown />
          </p>
        </div>
        <span className="short:hidden">
          <ThemeToggle />
        </span>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 mb-8 short:mb-2">
        {GAMES.map((game) => (
          <li key={game.id}>
            <LaunchLink
              href={`/${game.id}`}
              className="flex items-center gap-4 rounded-xl bg-white dark:bg-neutral-900 p-4 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-800 hover:ring-amber-500 dark:hover:ring-amber-500 transition-shadow"
            >
              <span className="text-3xl" aria-hidden>
                {game.emoji}
              </span>
              <span>
                <span className="block font-semibold text-neutral-900 dark:text-neutral-50">{game.name}</span>
                <span className="block text-sm text-neutral-500 dark:text-neutral-400">{game.tagline}</span>
              </span>
            </LaunchLink>
          </li>
        ))}
      </ul>

      {error && (
        <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 px-4 py-2 text-sm">
          Leaderboard unavailable: {error}
        </div>
      )}
      {connection && (
        <div className="short:hidden">
          <GlobalLeaderboard connection={connection} />
        </div>
      )}
    </div>
  );
}
