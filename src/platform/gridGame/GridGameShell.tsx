"use client";

import Image from "next/image";
import { ReactNode, useEffect, useMemo, useState } from "react";
import type { GameInfo } from "@/games/types";
import { isInDiscord } from "../discordClient";
import { formatTime } from "../format";
import { useUtcDateKey } from "../useUtcDateKey";
import LaunchLink from "../components/LaunchLink";
import Leaderboard from "../components/Leaderboard";
import NextPuzzleCountdown from "../components/NextPuzzleCountdown";
import ShareButton from "../components/ShareButton";
import ThemeToggle from "../components/ThemeToggle";
import { buildGridShareText, GridRules } from "./rules";
import type { GridGame } from "./useGridGame";

export interface CheckButton {
  label: string;
  title: string;
  /** Cell keys to check; omitted checks the whole grid. Null disables the button (nothing selected). */
  cells?: string[] | null;
}

interface Props {
  info: GameInfo;
  rules: GridRules;
  game: GridGame;
  dateKey: string;
  onPlayDate: (dateKey: string) => void;
  /** Shown on the Start screen, e.g. how to play. */
  intro: ReactNode;
  checks: CheckButton[];
  /** The grid; only rendered once the player has started. */
  children: ReactNode;
  /** Below the grid while playing, e.g. a number pad. */
  controls?: ReactNode;
}

const buttonClass =
  "px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors";

/** The page around a grid game: header, Start screen, Check/Reveal, results, stats and leaderboard. */
export default function GridGameShell({ info, rules, game, dateKey, onPlayDate, intro, checks, children, controls }: Props) {
  // Stays on this puzzle past 00:00 UTC so a game in progress can be
  // finished (the server still accepts yesterday's); the player moves on.
  const today = useUtcDateKey();
  const newPuzzleOut = today !== dateKey;
  const [confirmReveal, setConfirmReveal] = useState(false);

  useEffect(() => {
    if (!confirmReveal) return;
    const id = setTimeout(() => setConfirmReveal(false), 3000);
    return () => clearTimeout(id);
  }, [confirmReveal]);

  const { connection, breakdown, complete, revealed } = game;

  const shareText = useMemo(
    () =>
      buildGridShareText({
        name: info.name,
        emoji: info.emoji,
        puzzleNumber: game.puzzleNumber,
        record: game.score,
        timeSeconds: game.finishTime,
        done: game.done,
        total: game.total,
        points: breakdown.total,
        // Discord's share dialog attaches the Activity link itself.
        url: typeof window !== "undefined" && !isInDiscord() ? window.location.href : undefined,
      }),
    [info, game.puzzleNumber, game.score, game.finishTime, game.done, game.total, breakdown.total]
  );

  const handleShare = useMemo(
    () =>
      connection
        ? async (text: string) => {
            await connection.sdk.commands.shareLink({ message: text });
          }
        : undefined,
    [connection]
  );

  const { scoring } = rules;

  return (
    <div className="max-w-3xl mx-auto p-4 short:p-2">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4 short:mb-2">
        <div>
          <LaunchLink
            href="/"
            className="short:hidden text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            ← All games
          </LaunchLink>
          <h1 className="flex items-center gap-2 text-2xl short:text-base font-bold text-neutral-900 dark:text-neutral-50">
            <Image src={info.icon} alt="" width={32} height={32} priority className="size-8 short:size-5 rounded-lg" />
            {info.name}
          </h1>
          <p className="short:hidden text-xs text-neutral-500 dark:text-neutral-400">
            Daily puzzle #{game.puzzleNumber} · same for everyone today
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-50"
            title="Solve + time bonus − check penalties"
          >
            {breakdown.total} pts
          </span>
          {complete ? (
            !newPuzzleOut && (
              <span className="text-neutral-600 dark:text-neutral-400">
                Next puzzle in <NextPuzzleCountdown />
              </span>
            )
          ) : (
            <>
              <span className="font-mono tabular-nums text-neutral-700 dark:text-neutral-300 w-12 text-center">
                {formatTime(game.elapsed)}
              </span>
              {game.started &&
                checks.map((check) => (
                  <button
                    key={check.label}
                    type="button"
                    disabled={check.cells === null}
                    onClick={() => check.cells !== null && game.check(check.cells)}
                    className={`short:hidden ${buttonClass}`}
                    title={check.title}
                  >
                    {check.label}
                  </button>
                ))}
              {game.started && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmReveal) return setConfirmReveal(true);
                    setConfirmReveal(false);
                    game.reveal();
                  }}
                  className={`short:hidden ${buttonClass}`}
                  title="Show the solution (no solve or time bonus)"
                >
                  {confirmReveal ? "Sure? Reveal" : "Reveal"}
                </button>
              )}
            </>
          )}
          <span className="short:hidden">
            <ThemeToggle />
          </span>
        </div>
      </header>

      {newPuzzleOut && (
        <div className="mb-4 short:mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 px-4 py-2 text-sm">
          <span>{complete ? "Today's puzzle is out." : "A new puzzle is out. You can still finish this one."}</span>
          <button
            type="button"
            onClick={() => onPlayDate(today)}
            className="shrink-0 px-3 py-1.5 rounded-md font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Play today&apos;s puzzle
          </button>
        </div>
      )}

      {game.notice && (
        <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 px-4 py-2 text-sm">
          {game.notice}
        </div>
      )}

      {complete && (
        <div className="short:hidden mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm">
          <span>
            {revealed ? "You revealed today's puzzle." : `You solved today's puzzle in ${formatTime(game.finishTime)}.`}{" "}
            Come back after the countdown for a new one.
          </span>
          <ShareButton
            text={shareText}
            onShare={handleShare}
            className="shrink-0 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
          />
        </div>
      )}

      {game.started || complete ? (
        <>
          {children}
          {!complete && controls}
        </>
      ) : (
        <div className="relative aspect-square w-full max-w-[420px] short:max-w-[calc(100dvh-5.5rem)] mx-auto rounded-lg bg-neutral-200 dark:bg-neutral-900 ring-1 ring-neutral-300 dark:ring-neutral-800">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {game.loaded ? (
              <>
                <div className="short:hidden text-sm text-neutral-800 dark:text-neutral-200 space-y-2">{intro}</div>
                <button
                  type="button"
                  onClick={game.start}
                  className="px-5 py-2.5 rounded-lg font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-900 shadow transition-colors"
                >
                  Start
                </button>
                <p className="short:hidden text-xs text-neutral-500 dark:text-neutral-400">The clock starts when you do.</p>
              </>
            ) : (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading…</p>
            )}
          </div>
        </div>
      )}

      <div className="short:hidden mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400 justify-center">
        <span>Best: {game.stats.bestTimeSeconds !== null ? formatTime(game.stats.bestTimeSeconds) : "—"}</span>
        <span>Streak: {game.stats.currentStreak}</span>
        <span>
          Won: {game.stats.gamesWon}/{game.stats.gamesPlayed}
        </span>
      </div>

      {connection && (
        <Leaderboard connection={connection} game={info} puzzleId={game.puzzleId} myPoints={game.serverPoints} />
      )}

      {game.showWin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-sm w-full max-h-full overflow-y-auto p-6 text-center animate-[pop_0.25s_ease-out]">
            <div className="text-4xl mb-2">{revealed ? "🔎" : "🎉"}</div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
              {revealed ? "Puzzle Revealed" : "Solved!"}
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">
              {revealed ? "Here's the solution." : `You finished in ${formatTime(game.finishTime)}.`} Come back tomorrow
              for the next one.
            </p>
            <div className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {breakdown.total} <span className="text-base font-medium text-neutral-500 dark:text-neutral-400">pts</span>
            </div>
            <dl className="mt-2 mb-4 text-sm text-neutral-600 dark:text-neutral-400 space-y-0.5">
              {revealed ? (
                <div className="flex justify-between">
                  <dt>Cells before reveal ({scoring.revealPointsPerCell} each)</dt>
                  <dd className="tabular-nums">+{breakdown.reveal}</dd>
                </div>
              ) : (
                <>
                  <div className="flex justify-between"><dt>Solve</dt><dd className="tabular-nums">+{breakdown.solve}</dd></div>
                  <div className="flex justify-between"><dt>Time bonus</dt><dd className="tabular-nums">+{breakdown.time}</dd></div>
                </>
              )}
              {breakdown.penalty > 0 && (
                <div className="flex justify-between"><dt>Check penalty</dt><dd className="tabular-nums">−{breakdown.penalty}</dd></div>
              )}
            </dl>
            <dl className="grid grid-cols-3 gap-2 text-sm mb-6">
              {[
                ["Best time", game.stats.bestTimeSeconds !== null ? formatTime(game.stats.bestTimeSeconds) : "—"],
                ["Streak", game.stats.currentStreak],
                ["Won", game.stats.gamesWon],
              ].map(([label, value]) => (
                <div key={label} className="bg-neutral-100 dark:bg-neutral-800 rounded-lg py-2">
                  <dt className="text-neutral-500 dark:text-neutral-400 text-xs">{label}</dt>
                  <dd className="font-semibold text-neutral-900 dark:text-neutral-50">{value}</dd>
                </div>
              ))}
            </dl>
            <ShareButton
              text={shareText}
              onShare={handleShare}
              className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-900 font-semibold rounded-lg py-2 transition-colors mb-2"
            />
            <button
              type="button"
              onClick={game.closeWin}
              className="w-full text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 py-1 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
