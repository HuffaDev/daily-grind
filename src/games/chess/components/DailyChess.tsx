"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDailyPuzzleNumber, getPuzzleId, getUtcDateKey } from "@/platform/daily";
import { formatTime } from "@/platform/format";
import { DEFAULT_STATS, loadStats, recordGame, Stats } from "@/platform/stats";
import { GameApiError, isInDiscord } from "@/platform/discordClient";
import { useDiscordConnection } from "@/platform/useDiscordConnection";
import { useUtcDateKey } from "@/platform/useUtcDateKey";
import LaunchLink from "@/platform/components/LaunchLink";
import Leaderboard from "@/platform/components/Leaderboard";
import NextPuzzleCountdown from "@/platform/components/NextPuzzleCountdown";
import ShareButton from "@/platform/components/ShareButton";
import ThemeToggle from "@/platform/components/ThemeToggle";
import { chess, PUZZLE_VERSION } from "../meta";
import { fetchDailyPuzzles, postChessAction } from "../lib/api";
import { loadDailyProgress, saveDailyProgress } from "../lib/progress";
import { buildShareText } from "../lib/share";
import {
  DayRecord,
  emptyDay,
  isDayFinished,
  mergeDay,
  puzzleStatus,
  sameProgress,
  scoreAfterProgress,
  scoreBreakdown,
} from "../lib/scoring";
import { ChessPuzzle, PuzzleProgress, TIERS } from "../lib/types";
import PuzzleBoard from "./PuzzleBoard";
import WinModal from "./WinModal";

/** Keeps the server's play-time measurement alive while the timer runs (see ACTIVE_GAP_CAP_MS). */
const HEARTBEAT_MS = 15_000;

function hasProgress(day: DayRecord): boolean {
  return day.puzzles.some((p) => p.line.length > 0 || p.mistakes > 0 || p.revealed);
}

export default function DailyChess() {
  // The date key picks the puzzles, which are identical for every player that
  // day. Keying on it gives each day a completely fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <ChessDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

interface ChessDayProps {
  dateKey: string;
  onPlayDate: (dateKey: string) => void;
}

function ChessDay({ dateKey, onPlayDate }: ChessDayProps) {
  // Stays on these puzzles past 00:00 UTC so a game in progress can be
  // finished (the server still accepts yesterday's); the player moves on.
  const today = useUtcDateKey();
  const newPuzzleOut = today !== dateKey;
  const puzzleId = useMemo(() => getPuzzleId(dateKey, PUZZLE_VERSION), [dateKey]);
  const puzzleNumber = useMemo(() => getDailyPuzzleNumber(dateKey), [dateKey]);

  const [puzzles, setPuzzles] = useState<ChessPuzzle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [day, setDay] = useState<DayRecord>(() => emptyDay(TIERS.length));
  const [elapsed, setElapsed] = useState(0);
  // The board stays hidden until the player starts, so nobody studies it off the clock.
  const [started, setStarted] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  // The puzzle tab the player picked; until then, the first unfinished one.
  const [picked, setPicked] = useState<number | null>(null);
  const [showWin, setShowWin] = useState(false);
  // Starts at the same default on server and client; the real saved value
  // (from localStorage) is only readable client-side, so it's loaded below.
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);

  // Inside Discord, signed in so progress counts toward the server's leaderboard.
  // In a plain browser the game stays local.
  const { connection, error: connectError } = useDiscordConnection();
  const [serverSynced, setServerSynced] = useState(false);
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  // Points as last saved by the server; the leaderboard refreshes when they
  // change, so it never fetches before the server has the new score.
  const [serverPoints, setServerPoints] = useState<number | null>(null);

  const latestRef = useRef({ day, elapsed });
  useEffect(() => {
    latestRef.current = { day, elapsed };
  });
  // Game requests run one at a time, in order, so the server sees moves in the order they were made.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    fetchDailyPuzzles(puzzleId)
      .then((result) => {
        if (!cancelled) setPuzzles(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [puzzleId, loadAttempt]);

  // Load today's saved progress and stats once, on mount — localStorage
  // isn't available during server rendering, so this has to happen client-side.
  useEffect(() => {
    const progress = loadDailyProgress(puzzleId, TIERS.length);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(progress.day);
    setElapsed(progress.elapsedSeconds);
    setStarted(progress.elapsedSeconds > 0 || hasProgress(progress.day));
    setStats(loadStats(chess.id, dateKey));
    setProgressLoaded(true);
  }, [puzzleId, dateKey]);

  useEffect(() => {
    if (!progressLoaded) return;
    saveDailyProgress({ puzzleId, day, elapsedSeconds: elapsed });
  }, [progressLoaded, puzzleId, day, elapsed]);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const finished = puzzles ? isDayFinished(puzzles, day) : false;
  const running = started && !!puzzles && progressLoaded && !finished && pageVisible;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const notice = serverNotice ?? (connectError && `Leaderboard unavailable: ${connectError}`);

  const handleServerError = useCallback((err: unknown) => {
    if (err instanceof GameApiError && err.status === 409) setServerNotice(err.message);
    else console.warn("Leaderboard sync failed", err);
  }, []);

  // Once signed in, keep the furthest progress of this device's copy and the
  // server's (played on another device), and upload whatever the server lacks.
  useEffect(() => {
    if (!connection || !progressLoaded || !puzzles || serverSynced) return;
    let cancelled = false;
    const { day: local, elapsed: localElapsed } = latestRef.current;
    postChessAction(connection, { puzzleId, action: "sync" })
      .then(async ({ game }) => {
        if (cancelled) return;
        const merged = game ? mergeDay(puzzles, local, game.day) : local;
        const elapsedSeconds = Math.max(localElapsed, game?.elapsedSeconds ?? 0);
        setDay(merged);
        setElapsed(elapsedSeconds);
        if (game) {
          setServerPoints(game.points);
          if (hasProgress(merged) || game.elapsedSeconds > 0) setStarted(true);
        }
        const behind = game
          ? merged.puzzles.some((p, i) => !sameProgress(p, game.day.puzzles[i]))
          : hasProgress(merged);
        if (!behind) return;
        const res = await postChessAction(connection, {
          puzzleId,
          action: "progress",
          puzzles: merged.puzzles,
          elapsedSeconds,
        });
        if (res.game && !cancelled) {
          const serverDay = res.game.day;
          setDay((prev) => mergeDay(puzzles, prev, serverDay));
          setServerPoints(res.game.points);
        }
      })
      .catch(handleServerError)
      .finally(() => {
        if (!cancelled) setServerSynced(true);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, progressLoaded, puzzles, serverSynced, puzzleId, handleServerError]);

  /** Sends the day's progress (`progress`, or the latest when the request goes out) to the server. */
  const sendProgress = useCallback(
    (progress?: PuzzleProgress[]) => {
      if (!connection || !serverSynced || !puzzles) return;
      queueRef.current = queueRef.current.then(async () => {
        try {
          const res = await postChessAction(connection, {
            puzzleId,
            action: "progress",
            puzzles: progress ?? latestRef.current.day.puzzles,
            elapsedSeconds: latestRef.current.elapsed,
          });
          if (res.game) {
            const serverDay = res.game.day;
            setDay((prev) => mergeDay(puzzles, prev, serverDay));
            setServerPoints(res.game.points);
          }
        } catch (err) {
          handleServerError(err);
        }
      });
    },
    [connection, serverSynced, puzzles, puzzleId, handleServerError]
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => sendProgress(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [running, sendProgress]);

  const handleStart = useCallback(() => {
    setStarted(true);
    sendProgress();
  }, [sendProgress]);

  const handleProgress = useCallback(
    (index: number, progress: PuzzleProgress) => {
      if (!puzzles) return;
      // Stays on this puzzle once it's done, to show the result; "Next puzzle" moves on.
      setPicked(index);
      const next = scoreAfterProgress(
        puzzles,
        { ...day, puzzles: day.puzzles.map((p, i) => (i === index ? progress : p)) },
        elapsed
      );
      setDay(next);
      if (!isDayFinished(puzzles, day) && isDayFinished(puzzles, next)) {
        setShowWin(true);
        const won = next.solvedTimeSeconds !== null;
        setStats(recordGame(chess.id, dateKey, { won, timeSeconds: next.solvedTimeSeconds ?? elapsed }));
      }
      sendProgress(next.puzzles);
    },
    [puzzles, day, elapsed, dateKey, sendProgress]
  );

  const statuses = useMemo(
    () => (puzzles ? puzzles.map((p, i) => puzzleStatus(p, day.puzzles[i])) : null),
    [puzzles, day]
  );
  const firstPlaying = statuses ? Math.max(0, statuses.indexOf("playing")) : 0;
  const active = picked ?? firstPlaying;
  const nextPlaying = statuses?.findIndex((s, i) => s === "playing" && i !== active) ?? -1;

  const breakdown = useMemo(() => (puzzles ? scoreBreakdown(puzzles, day) : null), [puzzles, day]);
  // The solve time the leaderboard uses (the server's, once it has replied),
  // so the banner, win screen, share text and board all agree.
  const finishTime = day.solvedTimeSeconds ?? elapsed;
  const won = day.solvedTimeSeconds !== null;

  const shareText = useMemo(
    () =>
      puzzles
        ? buildShareText({
            puzzles,
            day,
            puzzleNumber,
            timeSeconds: finishTime,
            points: breakdown?.total,
            // Discord's share dialog attaches the Activity link itself.
            url: typeof window !== "undefined" && !isInDiscord() ? window.location.href : undefined,
          })
        : "",
    [puzzles, day, puzzleNumber, finishTime, breakdown]
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

  const activePuzzle = puzzles?.[active];

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
            <Image src={chess.icon} alt="" width={32} height={32} priority className="size-8 short:size-5 rounded-lg" />
            {chess.name}
          </h1>
          <p className="short:hidden text-xs text-neutral-500 dark:text-neutral-400">
            Daily puzzles #{puzzleNumber} · same for everyone today
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-50"
            title="Puzzles solved − wrong moves + completion and time bonuses"
          >
            {breakdown?.total ?? 0} pts
          </span>
          {finished ? (
            !newPuzzleOut && (
              <span className="text-neutral-600 dark:text-neutral-400">
                Next puzzles in <NextPuzzleCountdown />
              </span>
            )
          ) : (
            <span className="font-mono tabular-nums text-neutral-700 dark:text-neutral-300 w-12 text-center">
              {formatTime(elapsed)}
            </span>
          )}
          <span className="short:hidden">
            <ThemeToggle />
          </span>
        </div>
      </header>

      {newPuzzleOut && (
        <div className="mb-4 short:mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 px-4 py-2 text-sm">
          <span>{finished ? "Today's puzzles are out." : "New puzzles are out. You can still finish these."}</span>
          <button
            type="button"
            onClick={() => onPlayDate(today)}
            className="shrink-0 px-3 py-1.5 rounded-md font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Play today&apos;s puzzles
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 px-4 py-2 text-sm">
          {notice}
        </div>
      )}

      {finished && (
        <div className="short:hidden mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm">
          <span>
            {won ? `You solved today's puzzles in ${formatTime(finishTime)}.` : "You're done with today's puzzles."}{" "}
            Come back after the countdown for new ones.
          </span>
          <ShareButton
            text={shareText}
            onShare={handleShare}
            className="shrink-0 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
          />
        </div>
      )}

      <div className="max-w-[480px] mx-auto">
        <div className="grid grid-cols-3 gap-2 mb-3 short:mb-1" role="tablist">
          {TIERS.map((tier, i) => {
            const status = statuses?.[i];
            const selected = i === active;
            return (
              <button
                key={tier.name}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setPicked(i)}
                className={`rounded-lg px-2 py-1.5 short:py-0.5 text-sm text-left ring-1 transition-colors ${
                  selected
                    ? "bg-white dark:bg-neutral-900 ring-amber-500"
                    : "bg-neutral-100 dark:bg-neutral-900/60 ring-neutral-200 dark:ring-neutral-800 hover:ring-amber-400"
                }`}
              >
                <span className="flex items-center justify-between font-semibold text-neutral-900 dark:text-neutral-50">
                  {tier.name}
                  <span aria-hidden>{status === "solved" ? "✅" : status === "revealed" ? "🔎" : ""}</span>
                </span>
                <span className="short:hidden block text-xs text-neutral-500 dark:text-neutral-400">
                  {puzzles ? `Rated ${puzzles[i].rating}` : " "}
                </span>
              </button>
            );
          })}
        </div>

        {activePuzzle && started ? (
          <PuzzleBoard
            key={active}
            puzzle={activePuzzle}
            tier={active}
            progress={day.puzzles[active]}
            onProgress={(progress) => handleProgress(active, progress)}
          />
        ) : (
          <div className="relative aspect-square w-full max-w-[480px] short:max-w-[calc(100dvh-6rem)] mx-auto rounded-lg overflow-hidden">
            <div
              className="absolute inset-0 opacity-40 blur-sm"
              style={{ background: "repeating-conic-gradient(#b58863 0% 25%, #f0d9b5 0% 50%) 0 0 / 25% 25%" }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {loadError ? (
                <>
                  <p className="text-sm text-neutral-900 dark:text-neutral-50">Couldn&apos;t load the puzzles: {loadError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadError(null);
                      setLoadAttempt((n) => n + 1);
                    }}
                    className="px-4 py-2 rounded-lg font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
                  >
                    Try again
                  </button>
                </>
              ) : !puzzles || !progressLoaded ? (
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Loading puzzles…</p>
              ) : (
                <>
                  <p className="text-neutral-900 dark:text-neutral-50 font-semibold">Three puzzles, easy to hard.</p>
                  <p className="short:hidden text-sm text-neutral-800 dark:text-neutral-200">
                    Find the best move each time. Wrong moves cost points; the clock starts when you do.
                  </p>
                  <button
                    type="button"
                    onClick={handleStart}
                    className="px-5 py-2.5 rounded-lg font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-900 shadow transition-colors"
                  >
                    Start
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {started && statuses?.[active] !== "playing" && nextPlaying >= 0 && (
          <button
            type="button"
            onClick={() => setPicked(nextPlaying)}
            className="mt-3 w-full px-3 py-2 rounded-lg font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
          >
            Next puzzle: {TIERS[nextPlaying].name} →
          </button>
        )}

        <div className="short:hidden mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
          <span>Best: {stats.bestTimeSeconds !== null ? formatTime(stats.bestTimeSeconds) : "—"}</span>
          <span>Streak: {stats.currentStreak}</span>
          <span>
            Won: {stats.gamesWon}/{stats.gamesPlayed}
          </span>
          <span className="ml-auto text-xs">
            Puzzles from the{" "}
            {activePuzzle && statuses?.[active] !== "playing" && !isInDiscord() ? (
              <a
                href={`https://lichess.org/training/${activePuzzle.id}`}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                Lichess database
              </a>
            ) : (
              "Lichess database"
            )}
          </span>
        </div>
      </div>

      {connection && (
        <Leaderboard connection={connection} game={chess} puzzleId={puzzleId} myPoints={serverPoints} />
      )}

      {showWin && breakdown && (
        <WinModal
          timeSeconds={finishTime}
          stats={stats}
          won={won}
          breakdown={breakdown}
          shareText={shareText}
          onShare={handleShare}
          onClose={() => setShowWin(false)}
        />
      )}
    </div>
  );
}
