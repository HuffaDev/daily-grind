"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameInfo } from "@/games/types";
import { getDailyPuzzleNumber, getPuzzleId } from "../daily";
import { GameApiError, postGameAction } from "../discordClient";
import { DEFAULT_STATS, loadStats, recordGame, Stats } from "../stats";
import { useDiscordConnection } from "../useDiscordConnection";
import {
  emptyScore,
  GridGameView,
  GridPuzzle,
  GridRules,
  GridScore,
  isSolved,
  key,
  mergeScore,
  progress,
  reconcileWithServer,
  scoreAfterCheck,
  scoreAfterGrid,
  scoreAfterReveal,
  scoreBreakdown,
  startingGrid,
} from "./rules";

/** How long input must pause before progress is sent to the leaderboard server. */
const PROGRESS_DEBOUNCE_MS = 600;
/** Keeps the server's play-time measurement alive while the timer runs (see ACTIVE_GAP_CAP_MS). */
const HEARTBEAT_MS = 15_000;

interface SavedGame {
  puzzleId: string;
  grid: string[][];
  elapsedSeconds: number;
  score: GridScore;
  started: boolean;
  /** Cells a Check confirmed correct; they can no longer be changed. */
  lockedCells: string[];
}

const storageKey = (gameId: string) => `daily-grind:${gameId}:progress`;

function loadSaved(gameId: string, puzzleId: string, puzzle: GridPuzzle): SavedGame {
  const fresh: SavedGame = {
    puzzleId,
    grid: startingGrid(puzzle),
    elapsedSeconds: 0,
    score: emptyScore(),
    started: false,
    lockedCells: [],
  };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(gameId)) ?? "null") as Partial<SavedGame> | null;
    if (!parsed || parsed.puzzleId !== puzzleId || parsed.grid?.length !== puzzle.size) return fresh;
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

/**
 * Everything a daily grid game needs besides its grid UI: the player's grid,
 * saving it, syncing it with the leaderboard server, the timer, Check and
 * Reveal, and local stats. The board stays hidden until `start()`.
 */
export function useGridGame(info: GameInfo, dateKey: string, puzzle: GridPuzzle, rules: GridRules) {
  const puzzleId = useMemo(() => getPuzzleId(dateKey, info.puzzleVersion), [dateKey, info.puzzleVersion]);
  const puzzleNumber = useMemo(() => getDailyPuzzleNumber(dateKey), [dateKey]);

  const [loaded, setLoaded] = useState(false);
  const [grid, setGrid] = useState<string[][]>(() => startingGrid(puzzle));
  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState<GridScore>(emptyScore);
  const [wrongCells, setWrongCells] = useState<Set<string>>(new Set());
  const [checkedCells, setCheckedCells] = useState<Set<string>>(new Set());
  const [pageVisible, setPageVisible] = useState(true);
  const [showWin, setShowWin] = useState(false);
  // Starts at the same default on server and client; the real saved value
  // (from localStorage) is only readable client-side, so it's loaded below.
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);

  // Inside Discord, signed in so progress counts toward the server's leaderboard.
  // In a plain browser the game stays fully local.
  const { connection, error: connectError } = useDiscordConnection();
  const [serverSynced, setServerSynced] = useState(false);
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  // Points as last saved by the server; the leaderboard refreshes when they change.
  const [serverPoints, setServerPoints] = useState<number | null>(null);

  // Set by player input, so loading or syncing a grid never counts as playing.
  const editedRef = useRef(false);
  const latestRef = useRef({ grid, elapsed, score });
  useEffect(() => {
    latestRef.current = { grid, elapsed, score };
  });
  // Game requests run one at a time, in order. Sent concurrently, a reveal and
  // a progress update could reach the server in either order.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // localStorage isn't available during server rendering, so this has to happen client-side.
  useEffect(() => {
    const saved = loadSaved(info.id, puzzleId, puzzle);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGrid(saved.grid);
    setElapsed(saved.elapsedSeconds);
    setScore(saved.score);
    setStarted(saved.started);
    setCheckedCells(new Set(saved.lockedCells));
    setStats(loadStats(info.id, dateKey));
    setLoaded(true);
  }, [info.id, puzzleId, puzzle, dateKey]);

  useEffect(() => {
    if (!loaded) return;
    save(info.id, { puzzleId, grid, elapsedSeconds: elapsed, score, started, lockedCells: [...checkedCells] });
  }, [loaded, info.id, puzzleId, grid, elapsed, score, started, checkedCells]);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const revealed = score.revealed;
  const solved = score.solvedTimeSeconds !== null || (!revealed && isSolved(rules, puzzle, grid));
  const complete = solved || revealed;
  const running = loaded && started && !complete && pageVisible;

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
    (body: { action: string; grid?: string[][]; elapsedSeconds?: number; cells?: string[] }) =>
      postGameAction<{ game: GridGameView | null; wrongCells?: string[] }>(connection!, info.id, { puzzleId, ...body }),
    [connection, info.id, puzzleId]
  );

  // Once signed in, keep whichever copy of today's game is further along and
  // upload this device's copy if the server is behind.
  useEffect(() => {
    if (!connection || !loaded || serverSynced) return;
    let cancelled = false;
    const { grid: localGrid, elapsed: localElapsed, score: localScore } = latestRef.current;
    post({ action: "sync" })
      .then(async ({ game }) => {
        if (cancelled) return;
        const merged = reconcileWithServer(
          puzzle,
          { grid: localGrid, score: localScore, elapsedSeconds: localElapsed },
          game
        );
        setGrid(merged.grid);
        setElapsed(merged.elapsedSeconds);
        setScore(merged.score);
        if (game) {
          setServerPoints(game.points);
          if (merged.elapsedSeconds > 0) setStarted(true);
        }
        if (merged.upload === "none") return;
        const res = await post({
          action: merged.upload,
          // A reveal goes up without the revealed grid, which would earn credit for every cell.
          grid: merged.upload === "reveal" ? startingGrid(puzzle) : merged.grid,
          elapsedSeconds: merged.elapsedSeconds,
        });
        if (res.game && !cancelled) {
          const serverScore = res.game.score;
          setScore((prev) => mergeScore(prev, serverScore));
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
  }, [connection, loaded, serverSynced, puzzle, post, handleServerError]);

  const sendAction = useCallback(
    (action: "progress" | "check" | "reveal", gridToSend?: string[][], cells?: string[]) => {
      if (!connection || !serverSynced) return;
      queueRef.current = queueRef.current.then(async () => {
        try {
          const res = await post({
            action,
            // Read when the request actually goes out, so queued progress sends the newest grid.
            grid: gridToSend ?? latestRef.current.grid,
            elapsedSeconds: latestRef.current.elapsed,
            cells,
          });
          if (res.game) {
            const serverScore = res.game.score;
            setScore((prev) => mergeScore(prev, serverScore));
            setServerPoints(res.game.points);
          }
        } catch (err) {
          handleServerError(err);
        }
      });
    },
    [connection, serverSynced, post, handleServerError]
  );

  // Debounced while playing; sent right away on the input that completes the grid.
  // Never after a reveal: the revealed grid is fully correct and would score as a solve.
  useEffect(() => {
    if (!editedRef.current || revealed) return;
    const id = setTimeout(() => sendAction("progress"), solved ? 0 : PROGRESS_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [grid, solved, revealed, sendAction]);

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

  // Cells that can't change: givens, and those a Check confirmed (while still right).
  const locked = useMemo(() => {
    const result = new Set<string>();
    puzzle.given.forEach((row, r) => row.forEach((g, c) => g && result.add(key(r, c))));
    for (const k of checkedCells) {
      const [r, c] = k.split(",").map(Number);
      if (grid[r]?.[c] && rules.matches(grid[r][c], puzzle.solution[r][c])) result.add(k);
    }
    return result;
  }, [puzzle, checkedCells, grid, rules]);

  /** Sets cells (key → value). Locked cells and finished games are left alone. */
  const setCells = useCallback(
    (changes: Record<string, string>) => {
      if (complete || !started) return;
      const entries = Object.entries(changes).filter(([k]) => !locked.has(k));
      if (entries.length === 0) return;
      editedRef.current = true;
      const next = grid.map((row) => [...row]);
      for (const [k, value] of entries) {
        const [r, c] = k.split(",").map(Number);
        next[r][c] = value;
      }
      setGrid(next);
      setWrongCells((prev) => {
        if (!entries.some(([k]) => prev.has(k))) return prev;
        const rest = new Set(prev);
        for (const [k] of entries) rest.delete(k);
        return rest;
      });
      const nextScore = scoreAfterGrid(rules, puzzle, score, next, elapsed);
      setScore(nextScore);
      if (nextScore.solvedTimeSeconds !== null && score.solvedTimeSeconds === null) {
        setShowWin(true);
        setStats(recordGame(info.id, dateKey, { won: true, timeSeconds: elapsed }));
      }
    },
    [complete, started, locked, grid, rules, puzzle, score, elapsed, info.id, dateKey]
  );

  /** Marks wrong entries among `cells` (every cell if omitted) in red and locks the correct ones. */
  const check = useCallback(
    (cells?: string[]) => {
      if (complete || !started) return;
      const unchecked = cells?.filter((k) => !locked.has(k));
      if (unchecked && unchecked.length === 0) return;
      const result = scoreAfterCheck(rules, puzzle, score, grid, unchecked);
      setWrongCells((prev) => {
        const next = new Set(unchecked ? [...prev].filter((k) => !unchecked.includes(k)) : []);
        for (const k of result.wrongCells) next.add(k);
        return next;
      });
      setCheckedCells((prev) => new Set([...prev, ...result.correctCells]));
      setScore(result.record);
      sendAction("check", grid, unchecked);
    },
    [complete, started, locked, rules, puzzle, score, grid, sendAction]
  );

  const reveal = useCallback(() => {
    if (complete || !started) return;
    setScore(scoreAfterReveal(rules, puzzle, score, grid));
    sendAction("reveal", grid);
    setGrid(puzzle.solution.map((row) => [...row]));
    setWrongCells(new Set());
    setShowWin(true);
    setStats(recordGame(info.id, dateKey, { won: false, timeSeconds: elapsed }));
  }, [complete, started, rules, puzzle, score, grid, sendAction, info.id, dateKey, elapsed]);

  const breakdown = useMemo(() => scoreBreakdown(rules, score), [rules, score]);
  // The solve time the leaderboard uses (the server's, once it has replied).
  const finishTime = score.solvedTimeSeconds ?? elapsed;
  // After a reveal the grid is the solution; the credit says what the player had done themselves.
  const done = revealed
    ? score.revealCredit / rules.scoring.revealPointsPerCell
    : progress(rules, puzzle, grid).done;

  return {
    puzzleId,
    puzzleNumber,
    loaded,
    grid,
    started,
    start,
    elapsed,
    finishTime,
    solved,
    revealed,
    complete,
    score,
    breakdown,
    done,
    total: progress(rules, puzzle, grid).total,
    wrongCells,
    locked,
    setCells,
    check,
    reveal,
    stats,
    showWin,
    closeWin: () => setShowWin(false),
    connection,
    notice: serverNotice ?? (connectError ? `Leaderboard unavailable: ${connectError}` : null),
    serverPoints,
  };
}

export type GridGame = ReturnType<typeof useGridGame>;
