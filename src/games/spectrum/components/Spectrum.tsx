"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDailyPuzzleNumber, getPuzzleId, getUtcDateKey } from "@/platform/daily";
import { GameApiError, isInDiscord, postGameAction } from "@/platform/discordClient";
import LaunchLink from "@/platform/components/LaunchLink";
import Leaderboard from "@/platform/components/Leaderboard";
import NextPuzzleCountdown from "@/platform/components/NextPuzzleCountdown";
import ShareButton from "@/platform/components/ShareButton";
import GameManual from "@/platform/components/GameManual";
import ThemeToggle from "@/platform/components/ThemeToggle";
import { DEFAULT_STATS, loadStats, recordGame, Stats } from "@/platform/stats";
import { useDiscordConnection } from "@/platform/useDiscordConnection";
import { useUtcDateKey } from "@/platform/useUtcDateKey";
import { spectrum } from "../meta";
import { spectrumManual } from "../manual";
import type { GameView } from "../server/game";
import { dailyRounds, MAX_MARK, roundPoints, ROUNDS } from "../lib/rounds";

export default function Spectrum() {
  // The date key picks the rounds; keying on it gives each day a fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <SpectrumDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

interface Saved {
  puzzleId: string;
  /** Marks locked in so far, in round order. */
  marks: number[];
  startedAt: number | null;
}

const storageKey = `daily-grind:${spectrum.id}:progress`;

function loadSaved(puzzleId: string): Saved {
  const fresh: Saved = { puzzleId, marks: [], startedAt: null };
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Saved | null;
    return saved?.puzzleId === puzzleId && Array.isArray(saved.marks) ? saved : fresh;
  } catch {
    return fresh;
  }
}

function save(game: Saved) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(game));
  } catch {
    // Storage can be unavailable (private mode, blocked in some embeds); play continues unsaved.
  }
}

function SpectrumDay({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const puzzleId = getPuzzleId(dateKey, spectrum.puzzleVersion);
  const rounds = useMemo(() => dailyRounds(dateKey), [dateKey]);
  const today = useUtcDateKey();
  const newPuzzleOut = today !== dateKey;

  const [loaded, setLoaded] = useState(false);
  const [marks, setMarks] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [slider, setSlider] = useState(MAX_MARK / 2);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [view, setView] = useState<GameView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { connection, error: connectError } = useDiscordConnection();

  useEffect(() => {
    const saved = loadSaved(puzzleId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarks(saved.marks);
    setStartedAt(saved.startedAt);
    setStats(loadStats(spectrum.id, dateKey));
    setLoaded(true);
  }, [puzzleId, dateKey]);

  useEffect(() => {
    if (loaded) save({ puzzleId, marks, startedAt });
  }, [loaded, puzzleId, marks, startedAt]);

  const done = marks.length === ROUNDS;
  // Once played here or on another device, the server's marks win.
  const shownMarks = view?.marks ?? marks;
  const finished = done || !!view?.marks;

  const post = useCallback(
    (body: { action: "sync" | "submit"; marks?: number[]; elapsedSeconds?: number }) =>
      postGameAction<{ game: GameView }>(connection!, spectrum.id, { puzzleId, ...body }).then(
        (res) => setView(res.game),
        (err) => {
          if (err instanceof GameApiError && err.status === 409) setNotice(err.message);
          else console.warn("Leaderboard sync failed", err);
        }
      ),
    [connection, puzzleId]
  );

  // Signed in: load the server's copy, and send this device's marks if it doesn't have them yet.
  useEffect(() => {
    if (!connection || !loaded) return;
    const elapsedSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    post(done ? { action: "submit", marks, elapsedSeconds } : { action: "sync" });
    // Once per sign-in and once on finishing; `marks` and `startedAt` are read as they stand then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, loaded, done, post]);

  function lockIn() {
    const next = [...marks, slider];
    setMarks(next);
    setStartedAt((s) => s ?? Date.now());
    setSlider(MAX_MARK / 2);
    if (next.length === ROUNDS) {
      const seconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
      setStats(recordGame(spectrum.id, dateKey, { won: true, timeSeconds: seconds }));
    }
  }

  const shareText = [
    `${spectrum.emoji} ${spectrum.name} #${getDailyPuzzleNumber(dateKey)}`,
    view?.room
      ? `${view.points} pts · in tune with ${view.room.players} player${view.room.players === 1 ? "" : "s"}`
      : "Marks are in",
    ...(typeof window !== "undefined" && !isInDiscord() ? ["", window.location.href] : []),
  ].join("\n");

  const handleShare = connection
    ? async (text: string) => {
        await connection.sdk.commands.shareLink({ message: text });
      }
    : undefined;

  const round = rounds[marks.length];

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
            <Image src={spectrum.icon} alt="" width={32} height={32} priority className="size-8 short:size-5 rounded-lg" />
            {spectrum.name}
          </h1>
          <p className="short:hidden text-xs text-neutral-500 dark:text-neutral-400">
            Daily puzzle #{getDailyPuzzleNumber(dateKey)} · same for everyone today
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {view?.room && (
            <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{view.points} pts</span>
          )}
          {finished && !newPuzzleOut && (
            <span className="text-neutral-600 dark:text-neutral-400">
              Next puzzle in <NextPuzzleCountdown />
            </span>
          )}
          <span className="short:hidden">
            <GameManual gameId={spectrum.id} name={spectrum.name} manual={spectrumManual} />
          </span>
          <span className="short:hidden">
            <ThemeToggle />
          </span>
        </div>
      </header>

      {newPuzzleOut && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 px-4 py-2 text-sm">
          <span>{finished ? "Today's puzzle is out." : "A new puzzle is out. You can still finish this one."}</span>
          <button
            type="button"
            onClick={() => onPlayDate(today)}
            className="shrink-0 px-3 py-1.5 rounded-md font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Play today&apos;s puzzle
          </button>
        </div>
      )}

      {(notice || connectError) && (
        <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 px-4 py-2 text-sm">
          {notice ?? `Leaderboard unavailable: ${connectError}`}
        </div>
      )}

      {!loaded ? (
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">Loading…</p>
      ) : !finished ? (
        <div className="mx-auto max-w-md rounded-xl bg-white dark:bg-neutral-900 p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-800">
          <p className="mb-1 text-center text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Round {marks.length + 1} of {ROUNDS} · where would your server put it?
          </p>
          <h2 className="mb-5 text-center text-3xl font-bold text-neutral-900 dark:text-neutral-50">{round.subject}</h2>
          <input
            type="range"
            min={0}
            max={MAX_MARK}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            aria-label={`${round.subject}: ${round.left} to ${round.right}`}
            className="w-full accent-amber-500"
          />
          <div className="mt-1 flex justify-between text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            <span>← {round.left}</span>
            <span>{round.right} →</span>
          </div>
          <button
            type="button"
            onClick={lockIn}
            className="mt-5 w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-neutral-900 hover:bg-amber-400 transition-colors"
          >
            Lock in
          </button>
          <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
            You score by landing close to your server&apos;s average, so think about them, not just you.
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-3">
          {rounds.map((r, i) => {
            const mine = shownMarks[i];
            const mean = view?.room?.means[i];
            return (
              <div key={i} className="rounded-xl bg-white dark:bg-neutral-900 p-4 ring-1 ring-neutral-200 dark:ring-neutral-800">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-bold text-neutral-900 dark:text-neutral-50">{r.subject}</h3>
                  {mean !== undefined && (
                    <span className="text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                      +{roundPoints(Math.abs(mine - mean))}
                    </span>
                  )}
                </div>
                <div className="relative h-3 rounded-full bg-gradient-to-r from-sky-300 to-amber-300 dark:from-sky-800 dark:to-amber-800">
                  {mean !== undefined && (
                    <span
                      title="Server average"
                      className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-900 ring-2 ring-white dark:bg-white dark:ring-neutral-900"
                      style={{ left: `${(mean / MAX_MARK) * 100}%` }}
                    />
                  )}
                  <span
                    title="Your mark"
                    className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded bg-amber-600"
                    style={{ left: `${(mine / MAX_MARK) * 100}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>{r.left}</span>
                  <span>{r.right}</span>
                </div>
              </div>
            );
          })}
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            {view?.room
              ? `▮ your mark · ● the server's average of ${view.room.players} player${view.room.players === 1 ? "" : "s"}. Points shift as more people play.`
              : connection
                ? "Comparing with your server…"
                : "Play in Discord to see how your server's marks compare."}
          </p>
          <div className="flex justify-center gap-2">
            {connection && (
              <button
                type="button"
                onClick={() => post({ action: "sync" })}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700"
              >
                Refresh
              </button>
            )}
            <ShareButton
              text={shareText}
              onShare={handleShare}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
            />
          </div>
        </div>
      )}

      <div className="short:hidden mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400 justify-center">
        <span>Streak: {stats.currentStreak}</span>
        <span>Played: {stats.gamesPlayed}</span>
      </div>

      {connection && <Leaderboard connection={connection} game={spectrum} puzzleId={puzzleId} myPoints={view?.points ?? null} />}
    </div>
  );
}
