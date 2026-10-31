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
import { buildStepShareText, StepRules } from "./rules";
import type { StepGame } from "./useStepGame";

interface Props<P> {
  info: GameInfo;
  rules: StepRules<P>;
  game: StepGame<P>;
  dateKey: string;
  onPlayDate: (dateKey: string) => void;
  /** Shown on the Start screen, e.g. how to play. */
  intro: ReactNode;
  /** The result line to share, e.g. "5 steps (par 4)"; it must not give away the answer. */
  shareDetail: string;
  /** The board; only rendered once the player has started. */
  children: ReactNode;
}

const buttonClass =
  "px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors";

/** The page around a step game: header, Start screen, Undo/Restart/Give up, results, stats and leaderboard. */
export default function StepGameShell<P>({ info, rules, game, dateKey, onPlayDate, intro, shareDetail, children }: Props<P>) {
  // Stays on this puzzle past 00:00 UTC so a game in progress can be
  // finished (the server still accepts yesterday's); the player moves on.
  const today = useUtcDateKey();
  const newPuzzleOut = today !== dateKey;
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  useEffect(() => {
    if (!confirmGiveUp) return;
    const id = setTimeout(() => setConfirmGiveUp(false), 3000);
    return () => clearTimeout(id);
  }, [confirmGiveUp]);

  const { connection, breakdown, complete, gaveUp } = game;

  const shareText = useMemo(
    () =>
      buildStepShareText({
        name: info.name,
        emoji: info.emoji,
        puzzleNumber: game.puzzleNumber,
        score: game.score,
        timeSeconds: game.finishTime,
        detail: shareDetail,
        points: breakdown.total,
        // Discord's share dialog attaches the Activity link itself.
        url: typeof window !== "undefined" && !isInDiscord() ? window.location.href : undefined,
      }),
    [info, game.puzzleNumber, game.score, game.finishTime, shareDetail, breakdown.total]
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

  const playing = game.started && !complete;

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
          <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-50" title="Solve + time bonus">
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
              {playing && (
                <>
                  {!rules.noTakebacks && (
                    <>
                      <button type="button" onClick={game.undo} disabled={game.moves.length === 0} className={buttonClass}>
                        Undo
                      </button>
                      <button
                        type="button"
                        onClick={game.restart}
                        disabled={game.moves.length === 0}
                        className={`short:hidden ${buttonClass}`}
                      >
                        Restart
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmGiveUp) return setConfirmGiveUp(true);
                      setConfirmGiveUp(false);
                      game.giveUp();
                    }}
                    className={`short:hidden ${buttonClass}`}
                    title="See an answer (no solve or time bonus)"
                  >
                    {confirmGiveUp ? "Sure? Give up" : "Give up"}
                  </button>
                </>
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
            {gaveUp ? "You gave up on today's puzzle." : `You solved today's puzzle in ${formatTime(game.finishTime)}.`}{" "}
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
        game.puzzle && children
      ) : (
        <div className="relative min-h-72 w-full max-w-[420px] mx-auto rounded-lg bg-neutral-200 dark:bg-neutral-900 ring-1 ring-neutral-300 dark:ring-neutral-800">
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
            <div className="text-4xl mb-2">{gaveUp ? "🏳️" : "🎉"}</div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">{gaveUp ? "Gave Up" : "Solved!"}</h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">
              {gaveUp ? "An answer is shown on the page." : `You finished in ${formatTime(game.finishTime)}.`} Come back
              tomorrow for the next one.
            </p>
            <div className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {breakdown.total} <span className="text-base font-medium text-neutral-500 dark:text-neutral-400">pts</span>
            </div>
            <dl className="mt-2 mb-4 text-sm text-neutral-600 dark:text-neutral-400 space-y-0.5">
              {gaveUp ? (
                <div className="flex justify-between"><dt>Progress before giving up</dt><dd className="tabular-nums">+{breakdown.giveUp}</dd></div>
              ) : (
                <>
                  <div className="flex justify-between"><dt>Solve</dt><dd className="tabular-nums">+{breakdown.solve}</dd></div>
                  <div className="flex justify-between"><dt>Time bonus</dt><dd className="tabular-nums">+{breakdown.time}</dd></div>
                  {breakdown.skill !== 0 && (
                    <div className="flex justify-between"><dt>{rules.skillLabel}</dt><dd className="tabular-nums">−{-breakdown.skill}</dd></div>
                  )}
                </>
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
