"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameInfo } from "@/games/types";
import { getDailyPuzzleNumber, getPuzzleId } from "../daily";
import { GameApiError, postGameAction } from "../discordClient";
import { DEFAULT_STATS, loadStats, recordGame, Stats } from "../stats";
import { useDiscordConnection } from "../useDiscordConnection";
import {
  emptyScore,
  reconcileWithServer,
  scoreAfterMoves,
  scoreBreakdown,
  StepGameView,
  StepRules,
  StepScore,
} from "./rules";

/** How long input must pause before progress is sent to the leaderboard server. */
const PROGRESS_DEBOUNCE_MS = 600;
/** Keeps the server's play-time measurement alive while the timer runs (see ACTIVE_GAP_CAP_MS). */
const HEARTBEAT_MS = 15_000;

interface SavedGame {
  puzzleId: string;
  moves: string[];
  elapsedSeconds: number;
  score: StepScore;
  started: boolean;
}

const storageKey = (gameId: string) => `daily-grind:${gameId}:progress`;

function loadSaved(gameId: string, puzzleId: string): SavedGame {
  const fresh: SavedGame = { puzzleId, moves: [], elapsedSeconds: 0, score: emptyScore(), started: false };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(gameId)) ?? "null") as Partial<SavedGame> | null;
    if (!parsed || parsed.puzzleId !== puzzleId || !Array.isArray(parsed.moves)) return fresh;
    return { ...fresh, ...parsed };
  } catch {
    return fresh;
  }
}

function save(gameId: string, game: SavedGame): void {
  try {
    window.localStorage.setItem(storageKey(gameId), JSON.stringify(game));
  } catch {
    // Storage can be unavailable (private mode, blocked in some embeds); play continues unsaved.
  }
}

/** Fetches a step game's day from its API route; `reveal` includes an answer. */
async function fetchDay<P>(gameId: string, puzzleId: string, reveal: boolean): Promise<{ puzzle: P; solution?: string[] }> {
  const params = new URLSearchParams({ puzzleId, ...(reveal ? { reveal: "1" } : {}) });
  const res = await fetch(`/api/games/${encodeURIComponent(gameId)}?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GameApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data;
}

/**
 * Everything a daily step game needs besides its board: fetching the day's
 * puzzle, the player's moves, saving them, syncing with the leaderboard
 * server, the timer, Undo and Give up, and local stats. The board stays
 * hidden until `start()`.
 */
export function useStepGame<P>(info: GameInfo, dateKey: string, rules: StepRules<P>) {
  const puzzleId = useMemo(() => getPuzzleId(dateKey, info.puzzleVersion), [dateKey, info.puzzleVersion]);
  const puzzleNumber = useMemo(() => getDailyPuzzleNumber(dateKey), [dateKey]);

  const [puzzle, setPuzzle] = useState<P | null>(null);
  const [solution, setSolution] = useState<string[] | null>(null);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [moves, setMoves] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState<StepScore>(emptyScore);
  const [pageVisible, setPageVisible] = useState(true);
  const [showWin, setShowWin] = useState(false);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);

  const { connection, error: connectError } = useDiscordConnection();
  const [serverSynced, setServerSynced] = useState(false);
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  const [serverPoints, setServerPoints] = useState<number | null>(null);

  // Set by player input, so loading or syncing moves never counts as playing.
  const editedRef = useRef(false);
  const latestRef = useRef({ moves, elapsed });
  useEffect(() => {
    latestRef.current = { moves, elapsed };
  });
  // Game requests run one at a time, in order.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    fetchDay<P>(info.id, puzzleId, false).then(
      (day) => !cancelled && setPuzzle(day.puzzle),
      (err: Error) => !cancelled && setServerNotice(`Couldn't load today's puzzle: ${err.message}`)
    );
    return () => {
      cancelled = true;
    };
  }, [info.id, puzzleId]);

  // localStorage isn't available during server rendering, so this has to happen client-side.
  useEffect(() => {
    const saved = loadSaved(info.id, puzzleId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoves(saved.moves);
    setElapsed(saved.elapsedSeconds);
    setScore(saved.score);
    setStarted(saved.started);
    setStats(loadStats(info.id, dateKey));
    setSavedLoaded(true);
  }, [info.id, puzzleId, dateKey]);

  const loaded = savedLoaded && puzzle !== null;

  useEffect(() => {
    if (!savedLoaded) return;
    save(info.id, { puzzleId, moves, elapsedSeconds: elapsed, score, started });
  }, [savedLoaded, info.id, puzzleId, moves, elapsed, score, started]);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const gaveUp = score.gaveUp;
  const solved = score.solvedTimeSeconds !== null || (!gaveUp && puzzle !== null && rules.isSolved(puzzle, moves));
  const complete = solved || gaveUp;
  const running = loaded && started && !complete && pageVisible;

  // Once finished, show an answer: the day's par route, or what the player missed.
  useEffect(() => {
    if (!complete || solution) return;
    let cancelled = false;
    fetchDay<P>(info.id, puzzleId, true).then(
      (day) => !cancelled && setSolution(day.solution ?? null),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [complete, solution, info.id, puzzleId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const handleServerError = useCallback((err: unknown) => {
    if (err instanceof GameApiError && err.status === 409) setServerNotice(err.message);
    else console.warn("Leaderboard sync failed", err);
  }, []);

  const post = useCallback(
    (body: { action: string; moves?: string[]; elapsedSeconds?: number }) =>
      postGameAction<{ game: StepGameView | null }>(connection!, info.id, { puzzleId, ...body }),
    [connection, info.id, puzzleId]
  );

  const applyServerGame = useCallback((game: StepGameView) => {
    setScore((prev) => ({
      gaveUp: prev.gaveUp || game.score.gaveUp,
      solvedTimeSeconds: game.score.solvedTimeSeconds ?? prev.solvedTimeSeconds,
    }));
    setServerPoints(game.points);
  }, []);

  // Once signed in, keep whichever copy of today's game is further along and
  // upload this device's copy if the server is behind.
  useEffect(() => {
    if (!connection || !loaded || serverSynced) return;
    let cancelled = false;
    const { moves: localMoves, elapsed: localElapsed } = latestRef.current;
    post({ action: "sync" })
      .then(async ({ game }) => {
        if (cancelled) return;
        const merged = reconcileWithServer({ moves: localMoves, score, elapsedSeconds: localElapsed }, game);
        setMoves(merged.moves);
        setElapsed(merged.elapsedSeconds);
        setScore(merged.score);
        if (game) {
          setServerPoints(game.points);
          if (merged.elapsedSeconds > 0) setStarted(true);
        }
        if (merged.upload === "none") return;
        const res = await post({ action: merged.upload, moves: merged.moves, elapsedSeconds: merged.elapsedSeconds });
        if (res.game && !cancelled) applyServerGame(res.game);
      })
      .catch(handleServerError)
      .finally(() => {
        if (!cancelled) setServerSynced(true);
      });
    return () => {
      cancelled = true;
    };
    // Runs once per sign-in; `score` is read as it stood then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, loaded, serverSynced, post, handleServerError, applyServerGame]);

  const sendAction = useCallback(
    (action: "progress" | "giveup") => {
      if (!connection || !serverSynced) return;
      queueRef.current = queueRef.current.then(async () => {
        try {
          // Read when the request actually goes out, so queued progress sends the newest moves.
          const res = await post({ action, moves: latestRef.current.moves, elapsedSeconds: latestRef.current.elapsed });
          if (res.game) applyServerGame(res.game);
        } catch (err) {
          handleServerError(err);
        }
      });
    },
    [connection, serverSynced, post, applyServerGame, handleServerError]
  );

  // Debounced while playing; sent right away on the move that solves it.
  useEffect(() => {
    if (!editedRef.current || gaveUp) return;
    const id = setTimeout(() => sendAction("progress"), solved ? 0 : PROGRESS_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [moves, solved, gaveUp, sendAction]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => sendAction("progress"), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [running, sendAction]);

  const start = useCallback(() => {
    setStarted(true);
    editedRef.current = true;
    sendAction("progress");
  }, [sendAction]);

  const setMoveList = useCallback(
    (next: string[]) => {
      editedRef.current = true;
      setMoves(next);
      if (!puzzle) return;
      const nextScore = scoreAfterMoves(rules, puzzle, score, next, elapsed);
      setScore(nextScore);
      if (nextScore.solvedTimeSeconds !== null && score.solvedTimeSeconds === null) {
        setShowWin(true);
        setStats(recordGame(info.id, dateKey, { won: true, timeSeconds: elapsed }));
      }
    },
    [puzzle, rules, score, elapsed, info.id, dateKey]
  );

  /** Plays a move; returns why it isn't allowed instead, if it isn't. */
  const play = useCallback(
    (move: string): string | null => {
      if (!puzzle || complete || !started) return null;
      const reason = rules.invalidMove(puzzle, moves, move);
      if (reason) return reason;
      setMoveList([...moves, move]);
      return null;
    },
    [puzzle, complete, started, rules, moves, setMoveList]
  );

  const undo = useCallback(() => {
    if (!complete && !rules.noTakebacks && moves.length > 0) setMoveList(moves.slice(0, -1));
  }, [complete, rules.noTakebacks, moves, setMoveList]);

  const restart = useCallback(() => {
    if (!complete && !rules.noTakebacks && moves.length > 0) setMoveList([]);
  }, [complete, rules.noTakebacks, moves, setMoveList]);

  const giveUp = useCallback(() => {
    if (complete || !started) return;
    setScore({ ...score, gaveUp: true });
    sendAction("giveup");
    setShowWin(true);
    setStats(recordGame(info.id, dateKey, { won: false, timeSeconds: elapsed }));
  }, [complete, started, score, sendAction, info.id, dateKey, elapsed]);

  const breakdown = useMemo(
    () =>
      puzzle ? scoreBreakdown(rules, puzzle, moves, score) : { solve: 0, time: 0, skill: 0, giveUp: 0, total: 0 },
    [rules, puzzle, moves, score]
  );
  const progress = puzzle ? rules.progress(puzzle, moves) : { done: 0, total: 0 };

  return {
    puzzleId,
    puzzleNumber,
    puzzle,
    solution,
    loaded,
    moves,
    started,
    start,
    elapsed,
    // The solve time the leaderboard uses (the server's, once it has replied).
    finishTime: score.solvedTimeSeconds ?? elapsed,
    solved,
    gaveUp,
    complete,
    score,
    breakdown,
    progress,
    play,
    undo,
    restart,
    giveUp,
    stats,
    showWin,
    closeWin: () => setShowWin(false),
    connection,
    notice: serverNotice ?? (connectError ? `Leaderboard unavailable: ${connectError}` : null),
    serverPoints,
  };
}

export type StepGame<P> = ReturnType<typeof useStepGame<P>>;
