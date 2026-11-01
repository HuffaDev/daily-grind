"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDailyPuzzleNumber, getUtcDateKey } from "@/platform/daily";
import { formatTime } from "@/platform/format";
import { DEFAULT_STATS, loadStats, recordGame, Stats } from "@/platform/stats";
import { GameApiError, isInDiscord } from "@/platform/discordClient";
import { useDiscordConnection } from "@/platform/useDiscordConnection";
import { useUtcDateKey } from "@/platform/useUtcDateKey";
import LaunchLink from "@/platform/components/LaunchLink";
import Leaderboard from "@/platform/components/Leaderboard";
import NextPuzzleCountdown from "@/platform/components/NextPuzzleCountdown";
import ShareButton from "@/platform/components/ShareButton";
import GameManual from "@/platform/components/GameManual";
import ThemeToggle from "@/platform/components/ThemeToggle";
import { crossword } from "../meta";
import { crosswordManual } from "../manual";
import { postCrosswordAction } from "../lib/api";
import { generateDailyPuzzle, getPuzzleId } from "../lib/generator";
import { Direction, Slot } from "../lib/types";
import { buildSlotMaps, isComplete, key, slotAt } from "../lib/puzzleUtils";
import { emptyProgress, loadDailyProgress, saveDailyProgress } from "../lib/progress";
import { buildShareText } from "../lib/share";
import { emptyScore, scoreAfterCheck, scoreAfterGrid, scoreAfterReveal, scoreBreakdown, ScoreRecord } from "../lib/scoring";
import { mergeScore, reconcileWithServer } from "../lib/reconcile";
import CrosswordGrid, { CrosswordGridHandle } from "./CrosswordGrid";
import ClueList from "./ClueList";
import WinModal from "./WinModal";

/** How long typing must pause before progress is sent to the leaderboard server. */
const PROGRESS_DEBOUNCE_MS = 600;
/** Keeps the server's play-time measurement alive while the timer runs (see ACTIVE_GAP_CAP_MS). */
const HEARTBEAT_MS = 15_000;

/**
 * Index of the first cell of `slot` that isn't locked, starting at `from` and
 * moving by `step` (1 forwards, -1 backwards); null if every one is locked.
 */
function openCellIndex(slot: Slot, locked: Set<string>, from: number, step: 1 | -1): number | null {
  for (let i = from; i >= 0 && i < slot.cellCoords.length; i += step) {
    const [r, c] = slot.cellCoords[i];
    if (!locked.has(key(r, c))) return i;
  }
  return null;
}

export default function Crossword() {
  // The date key picks the puzzle, which is identical for every player that
  // day. Keying on it gives each day's puzzle a completely fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <DailyCrossword key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

interface DailyCrosswordProps {
  dateKey: string;
  onPlayDate: (dateKey: string) => void;
}

function DailyCrossword({ dateKey, onPlayDate }: DailyCrosswordProps) {
  // Stays on this puzzle past 00:00 UTC so an in-progress game can be
  // finished (the server still accepts yesterday's); the player moves on.
  const today = useUtcDateKey();
  const newPuzzleOut = today !== dateKey;
  const puzzle = useMemo(() => generateDailyPuzzle(dateKey), [dateKey]);
  const puzzleId = useMemo(() => getPuzzleId(dateKey), [dateKey]);
  const puzzleNumber = useMemo(() => getDailyPuzzleNumber(dateKey), [dateKey]);
  const maps = useMemo(() => buildSlotMaps(puzzle), [puzzle]);

  const [progressLoaded, setProgressLoaded] = useState(false);
  const [userGrid, setUserGrid] = useState<string[][]>(() => emptyProgress(puzzleId, puzzle.size).userGrid);
  const [selected, setSelected] = useState({ row: 0, col: 0 });
  const [direction, setDirection] = useState<Direction>("across");
  const [wrongCells, setWrongCells] = useState<Set<string>>(new Set());
  const [lockedCells, setLockedCells] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [score, setScore] = useState<ScoreRecord>(emptyScore);
  const revealed = score.revealed;
  const [showWin, setShowWin] = useState(false);
  // Starts at the same default on server and client; the real saved value
  // (from localStorage) is only readable client-side, so it's loaded below.
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);

  // Inside Discord, signed in so progress counts toward the server's leaderboard.
  // In a plain browser the game stays fully local.
  const { connection, error: connectError } = useDiscordConnection();
  const [serverSynced, setServerSynced] = useState(false);
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  // Points as last saved by the server; the leaderboard refreshes when they
  // change, so it never fetches before the server has the new score.
  const [serverPoints, setServerPoints] = useState<number | null>(null);

  const gridRef = useRef<CrosswordGridHandle>(null);
  // Set by player edits, so loading or syncing a grid never counts as playing.
  const editedRef = useRef(false);
  const latestRef = useRef({ userGrid, elapsed, score });
  useEffect(() => {
    latestRef.current = { userGrid, elapsed, score };
  });
  // Game requests run one at a time, in order. Sent concurrently, a reveal and
  // a progress update could reach the server in either order.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // Load today's saved progress and stats once, on mount — localStorage
  // isn't available during server rendering, so this has to happen client-side.
  useEffect(() => {
    const progress = loadDailyProgress(puzzleId, puzzle.size);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserGrid(progress.userGrid);
    setElapsed(progress.elapsedSeconds);
    setComplete(progress.complete);
    setScore(progress.score);
    setLockedCells(new Set(progress.lockedCells));
    setStats(loadStats(crossword.id, dateKey));
    setProgressLoaded(true);
    const first = firstWhiteCell();
    setSelected(first);

    function firstWhiteCell() {
      for (const row of puzzle.cells) {
        for (const cell of row) {
          if (!cell.black) return { row: cell.row, col: cell.col };
        }
      }
      return { row: 0, col: 0 };
    }
  }, [puzzleId, puzzle, dateKey]);

  // Persist progress on every change, once the initial load has happened
  // (otherwise we'd immediately overwrite saved progress with the defaults).
  useEffect(() => {
    if (!progressLoaded) return;
    saveDailyProgress({ puzzleId, userGrid, elapsedSeconds: elapsed, complete, score, lockedCells: [...lockedCells] });
  }, [progressLoaded, puzzleId, userGrid, elapsed, complete, score, lockedCells]);

  // Words currently filled in correctly. After a reveal, only the ones the
  // player solved themselves count, so the revealed rest doesn't show as theirs.
  const solvedSlotIds = useMemo(() => {
    if (score.revealed) return new Set(score.solvedWords);
    return new Set(
      puzzle.slots
        .filter((s) => s.cellCoords.every(([r, c]) => userGrid[r]?.[c] === puzzle.cells[r][c].solution))
        .map((s) => s.id)
    );
  }, [puzzle, userGrid, score.revealed, score.solvedWords]);

  const solvedCells = useMemo(
    () =>
      new Set(
        puzzle.slots.filter((s) => solvedSlotIds.has(s.id)).flatMap((s) => s.cellCoords.map(([r, c]) => key(r, c)))
      ),
    [puzzle, solvedSlotIds]
  );

  // Letters that can't change: those in solved words, and those a Check
  // confirmed. A Check lock only holds while its letter is still right (a
  // synced grid from another device can differ), so it never traps a wrong one.
  const locked = useMemo(() => {
    const result = new Set(solvedCells);
    for (const k of lockedCells) {
      const [r, c] = k.split(",").map(Number);
      if (userGrid[r]?.[c] && userGrid[r][c] === puzzle.cells[r]?.[c]?.solution) result.add(k);
    }
    return result;
  }, [solvedCells, lockedCells, userGrid, puzzle]);

  const notice = serverNotice ?? (connectError && `Leaderboard unavailable: ${connectError}`);

  const handleServerError = useCallback((err: unknown) => {
    if (err instanceof GameApiError && err.status === 409) setServerNotice(err.message);
    else console.warn("Leaderboard sync failed", err);
  }, []);

  // Once signed in, keep whichever copy of today's game is further along —
  // the server's (played on another device) or this device's (uploads failed)
  // — and upload this device's copy if the server is behind.
  useEffect(() => {
    if (!connection || !progressLoaded || serverSynced) return;
    let cancelled = false;
    const { userGrid: localGrid, elapsed: localElapsed, score: localScore } = latestRef.current;
    postCrosswordAction(connection, { puzzleId, action: "sync" })
      .then(async ({ game }) => {
        if (cancelled) return;
        const merged = reconcileWithServer(
          puzzle,
          { grid: localGrid, score: localScore, elapsedSeconds: localElapsed },
          game
        );
        setUserGrid(merged.grid);
        setElapsed(merged.elapsedSeconds);
        setScore(merged.score);
        setComplete(isComplete(puzzle, merged.grid));
        if (game) setServerPoints(game.points);
        if (merged.upload === "none") return;
        const res = await postCrosswordAction(connection, {
          puzzleId,
          action: merged.upload,
          grid: merged.grid,
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
  }, [connection, progressLoaded, serverSynced, puzzleId, puzzle, handleServerError]);

  const sendAction = useCallback(
    (action: "progress" | "check" | "reveal", grid?: string[][], cells?: string[]) => {
      if (!connection || !serverSynced) return;
      queueRef.current = queueRef.current.then(async () => {
        try {
          const res = await postCrosswordAction(connection, {
            puzzleId,
            action,
            // Read when the request actually goes out, so queued progress sends the newest grid.
            grid: grid ?? latestRef.current.userGrid,
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
    [connection, serverSynced, puzzleId, handleServerError]
  );

  // Debounced while typing; sent right away on the edit that completes the grid.
  // Never after a reveal: the revealed grid is fully correct and would score as a solve.
  useEffect(() => {
    if (!editedRef.current || revealed) return;
    const id = setTimeout(() => sendAction("progress"), complete ? 0 : PROGRESS_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [userGrid, complete, revealed, sendAction]);

  useEffect(() => {
    if (!running || complete || revealed) return;
    const id = setInterval(() => sendAction("progress"), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [running, complete, revealed, sendAction]);

  const breakdown = useMemo(() => scoreBreakdown(puzzle, score), [puzzle, score]);
  // The solve time the leaderboard uses (the server's, once it has replied),
  // so the banner, win screen, share text and board all agree.
  const finishTime = score.solvedTimeSeconds ?? elapsed;

  const activeSlot = useMemo(
    () => slotAt(maps, selected.row, selected.col, direction) ?? null,
    [maps, selected, direction]
  );

  const highlighted = useMemo(() => {
    if (!activeSlot) return new Set<string>();
    return new Set(activeSlot.cellCoords.map(([r, c]) => key(r, c)));
  }, [activeSlot]);

  const acrossSlots = useMemo(
    () => puzzle.slots.filter((s) => s.direction === "across").sort((a, b) => a.number - b.number),
    [puzzle]
  );
  const downSlots = useMemo(
    () => puzzle.slots.filter((s) => s.direction === "down").sort((a, b) => a.number - b.number),
    [puzzle]
  );

  const shareText = useMemo(
    () =>
      buildShareText({
        puzzle,
        puzzleNumber,
        timeSeconds: finishTime,
        revealed,
        solvedWords: score.solvedWords,
        points: breakdown.total,
        // Discord's share dialog attaches the Activity link itself.
        url: typeof window !== "undefined" && !isInDiscord() ? window.location.href : undefined,
      }),
    [puzzle, puzzleNumber, finishTime, revealed, score.solvedWords, breakdown.total]
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

  // Timer ticks once per second while the game is running and unsolved.
  useEffect(() => {
    if (!running || complete) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running, complete]);

  // Bank points for newly correct words, then detect completion. The
  // completion transition (typing the final correct letter) only happens once
  // per game, so the resulting setState calls don't cascade on every render.
  useEffect(() => {
    if (complete || userGrid.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScore((prev) => scoreAfterGrid(puzzle, prev, userGrid, elapsed));
    if (isComplete(puzzle, userGrid)) {
      setComplete(true);
      setRunning(false);
      setShowWin(true);
      setStats(recordGame(crossword.id, dateKey, { won: !revealed, timeSeconds: elapsed }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGrid, puzzle]);

  const clearWrong = useCallback((r: number, c: number) => {
    setWrongCells((prev) => {
      if (!prev.has(key(r, c))) return prev;
      const next = new Set(prev);
      next.delete(key(r, c));
      return next;
    });
  }, []);

  const handleCellSelect = useCallback(
    (r: number, c: number) => {
      const sameCell = selected.row === r && selected.col === c;
      let dir = direction;
      if (sameCell) {
        const other: Direction = direction === "across" ? "down" : "across";
        if (slotAt(maps, r, c, other)) dir = other;
      } else if (!slotAt(maps, r, c, dir)) {
        dir = dir === "across" ? "down" : "across";
      }
      setSelected({ row: r, col: c });
      setDirection(dir);
    },
    [maps, selected, direction]
  );

  const moveTo = useCallback((r: number, c: number) => {
    setSelected({ row: r, col: c });
    gridRef.current?.focusCell(r, c);
  }, []);

  /** Selects `slot` at its first unlocked cell (its start if it's all locked). */
  const goToSlot = useCallback(
    (slot: Slot) => {
      const [r, c] = slot.cellCoords[openCellIndex(slot, locked, 0, 1) ?? 0];
      setDirection(slot.direction);
      moveTo(r, c);
    },
    [locked, moveTo]
  );

  /** The next slot after `slot` (or before, for step -1) that still has an unlocked cell. */
  const nextOpenSlot = useCallback(
    (slot: Slot, step: 1 | -1): Slot | null => {
      const n = maps.ordered.length;
      const idx = maps.ordered.findIndex((s) => s.id === slot.id);
      for (let i = 1; i <= n; i++) {
        const candidate = maps.ordered[(idx + step * i + n * n) % n];
        if (openCellIndex(candidate, locked, 0, 1) !== null) return candidate;
      }
      return null;
    },
    [maps, locked]
  );

  // Moves to the next unlocked cell of the word, or on to the next word with one.
  const advance = useCallback(
    (r: number, c: number) => {
      const slot = slotAt(maps, r, c, direction);
      if (!slot) return;
      const idx = slot.cellCoords.findIndex(([rr, cc]) => rr === r && cc === c);
      const next = openCellIndex(slot, locked, idx + 1, 1);
      if (next !== null) {
        const [nr, nc] = slot.cellCoords[next];
        moveTo(nr, nc);
        return;
      }
      const nextSlot = nextOpenSlot(slot, 1);
      if (nextSlot) goToSlot(nextSlot);
    },
    [maps, direction, locked, moveTo, nextOpenSlot, goToSlot]
  );

  const handleType = useCallback(
    (r: number, c: number, letter: string) => {
      if (complete) return;
      // A Check-confirmed letter can't be overwritten; typing just moves past it.
      if (locked.has(key(r, c))) {
        advance(r, c);
        return;
      }
      editedRef.current = true;
      setRunning(true);
      setUserGrid((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = letter;
        return next;
      });
      clearWrong(r, c);
      advance(r, c);
    },
    [complete, locked, clearWrong, advance]
  );

  const handleBackspace = useCallback(
    (r: number, c: number) => {
      if (complete) return;
      editedRef.current = true;
      if (userGrid[r]?.[c] && !locked.has(key(r, c))) {
        setUserGrid((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = "";
          return next;
        });
        clearWrong(r, c);
        return;
      }
      // Steps back over locked letters to the previous one that can change.
      const slot = slotAt(maps, r, c, direction);
      if (!slot) return;
      const idx = slot.cellCoords.findIndex(([rr, cc]) => rr === r && cc === c);
      const prevIdx = openCellIndex(slot, locked, idx - 1, -1);
      if (prevIdx === null) return;
      const [pr, pc] = slot.cellCoords[prevIdx];
      setUserGrid((prev) => {
        const next = prev.map((row) => [...row]);
        next[pr][pc] = "";
        return next;
      });
      clearWrong(pr, pc);
      moveTo(pr, pc);
    },
    [complete, userGrid, locked, maps, direction, clearWrong, moveTo]
  );

  const handleArrow = useCallback(
    (r: number, c: number, arrowKey: string) => {
      let nr = r;
      let nc = c;
      let dir = direction;
      if (arrowKey === "ArrowLeft") {
        nc = c - 1;
        dir = "across";
      } else if (arrowKey === "ArrowRight") {
        nc = c + 1;
        dir = "across";
      } else if (arrowKey === "ArrowUp") {
        nr = r - 1;
        dir = "down";
      } else if (arrowKey === "ArrowDown") {
        nr = r + 1;
        dir = "down";
      }
      if (nr < 0 || nr >= puzzle.size || nc < 0 || nc >= puzzle.size) return;
      if (puzzle.cells[nr][nc].black) return;
      setSelected({ row: nr, col: nc });
      setDirection(dir);
      gridRef.current?.focusCell(nr, nc);
    },
    [puzzle, direction]
  );

  const handleTab = useCallback(
    (r: number, c: number, shift: boolean) => {
      const slot = slotAt(maps, r, c, direction) ?? slotAt(maps, r, c, direction === "across" ? "down" : "across");
      if (!slot) return;
      // Skips solved words; once everything is locked, just cycles through them.
      const step = shift ? -1 : 1;
      const n = maps.ordered.length;
      const idx = maps.ordered.findIndex((s) => s.id === slot.id);
      goToSlot(nextOpenSlot(slot, step) ?? maps.ordered[(idx + step + n) % n]);
    },
    [maps, direction, nextOpenSlot, goToSlot]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
      const k = e.key;
      if (/^[a-zA-Z]$/.test(k)) {
        e.preventDefault();
        handleType(r, c, k.toUpperCase());
      } else if (k === "Backspace") {
        e.preventDefault();
        handleBackspace(r, c);
      } else if (k === "Delete") {
        e.preventDefault();
        if (locked.has(key(r, c))) return;
        editedRef.current = true;
        setUserGrid((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = "";
          return next;
        });
        clearWrong(r, c);
      } else if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
        handleArrow(r, c, k);
      } else if (k === "Tab") {
        e.preventDefault();
        handleTab(r, c, e.shiftKey);
      } else if (k === " " || k === "Enter") {
        e.preventDefault();
        handleCellSelect(r, c);
      }
    },
    [handleType, handleBackspace, handleArrow, handleTab, handleCellSelect, clearWrong, locked]
  );


  /** Marks wrong letters among `cells` in red and locks the correct ones. */
  const checkCells = useCallback(
    (cells: string[]) => {
      // Clicking the button took focus from the grid; give it back so typing continues.
      gridRef.current?.focusCell(selected.row, selected.col);
      const unchecked = cells.filter((k) => !locked.has(k));
      if (unchecked.length === 0) return;
      const result = scoreAfterCheck(puzzle, score, userGrid, unchecked);
      setWrongCells((prev) => {
        const next = new Set(prev);
        for (const k of unchecked) next.delete(k);
        for (const k of result.wrongCells) next.add(k);
        return next;
      });
      setLockedCells((prev) => new Set([...prev, ...result.correctCells]));
      setScore(result.record);
      sendAction("check", userGrid, unchecked);
    },
    [puzzle, score, userGrid, locked, selected, sendAction]
  );

  const handleCheckLetter = useCallback(
    () => checkCells([key(selected.row, selected.col)]),
    [checkCells, selected]
  );

  const handleCheckWord = useCallback(() => {
    if (activeSlot) checkCells(activeSlot.cellCoords.map(([r, c]) => key(r, c)));
  }, [checkCells, activeSlot]);

  const handleReveal = useCallback(() => {
    const solved = puzzle.cells.map((row) => row.map((cell) => (cell.black ? "" : cell.solution)));
    setScore(scoreAfterReveal);
    setUserGrid(solved);
    setWrongCells(new Set());
    sendAction("reveal");
  }, [puzzle, sendAction]);

  const buttonClass =
    "short:hidden px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors";

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
            <Image
              src={crossword.icon}
              alt=""
              width={32}
              height={32}
              priority
              className="size-8 short:size-5 rounded-lg"
            />
            {crossword.name}
          </h1>
          <p className="short:hidden text-xs text-neutral-500 dark:text-neutral-400">
            Daily puzzle #{puzzleNumber} · same for everyone today
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-50"
            title="Words solved + completion and time bonuses − check penalties"
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
                {formatTime(elapsed)}
              </span>
              <button
                type="button"
                onClick={handleCheckLetter}
                className={buttonClass}
                title="Check the selected letter (−5 if wrong)"
              >
                Check letter
              </button>
              <button
                type="button"
                onClick={handleCheckWord}
                className={buttonClass}
                title="Check the highlighted word (−5 per wrong letter)"
              >
                Check word
              </button>
              <button type="button" onClick={handleReveal} className={buttonClass}>
                Reveal
              </button>
            </>
          )}
          <span className="short:hidden">
            <GameManual gameId={crossword.id} name={crossword.name} manual={crosswordManual} />
          </span>
          <span className="short:hidden">
            <ThemeToggle />
          </span>
        </div>
      </header>

      {newPuzzleOut && (
        <div className="mb-4 short:mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 px-4 py-2 text-sm">
          <span>
            {complete ? "Today's puzzle is out." : "A new puzzle is out. You can still finish this one."}
          </span>
          <button
            type="button"
            onClick={() => onPlayDate(today)}
            className="shrink-0 px-3 py-1.5 rounded-md font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Play today&apos;s puzzle
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 px-4 py-2 text-sm">
          {notice}
        </div>
      )}

      {complete && (
        <div className="short:hidden mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm">
          <span>
            {revealed
              ? "You revealed today's puzzle."
              : `You solved today's puzzle in ${formatTime(finishTime)}.`}{" "}
            Come back after the countdown for a new one.
          </span>
          <ShareButton
            text={shareText}
            onShare={handleShare}
            className="shrink-0 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
          />
        </div>
      )}

      {activeSlot && !complete && (
        <p className="mb-3 short:mb-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 px-3 py-2 short:py-1 text-sm text-neutral-800 dark:text-neutral-100">
          <span className="font-semibold mr-1">
            {activeSlot.number}
            {activeSlot.direction === "across" ? "A" : "D"}
          </span>
          {activeSlot.clue}
        </p>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        <CrosswordGrid
          ref={gridRef}
          puzzle={puzzle}
          userGrid={userGrid}
          selected={selected}
          highlighted={highlighted}
          wrongCells={wrongCells}
          lockedCells={locked}
          solvedCells={solvedCells}
          locked={complete}
          onSelect={handleCellSelect}
          onKeyDown={handleKeyDown}
          onInputLetter={handleType}
          onInputClear={handleBackspace}
        />

        <div className="short:hidden flex-1 grid grid-cols-2 gap-4">
          <ClueList title="Across" slots={acrossSlots} activeSlotId={activeSlot?.id ?? null} onSelect={goToSlot} solvedIds={solvedSlotIds} />
          <ClueList title="Down" slots={downSlots} activeSlotId={activeSlot?.id ?? null} onSelect={goToSlot} solvedIds={solvedSlotIds} />
        </div>
      </div>

      <div className="short:hidden mt-5 flex gap-5 text-sm text-neutral-500 dark:text-neutral-400">
        <span>Best: {stats.bestTimeSeconds !== null ? formatTime(stats.bestTimeSeconds) : "—"}</span>
        <span>Streak: {stats.currentStreak}</span>
        <span>
          Won: {stats.gamesWon}/{stats.gamesPlayed}
        </span>
      </div>

      {connection && (
        <Leaderboard
          connection={connection}
          game={crossword}
          puzzleId={puzzleId}
          myPoints={serverPoints}
        />
      )}

      {showWin && (
        <WinModal
          timeSeconds={finishTime}
          stats={stats}
          revealed={revealed}
          breakdown={breakdown}
          shareText={shareText}
          onShare={handleShare}
          onClose={() => setShowWin(false)}
        />
      )}
    </div>
  );
}
