"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateDailyPuzzle } from "@/lib/generator";
import { getDailyPuzzleNumber, getUtcDateKey } from "@/lib/daily";
import { Direction, Slot } from "@/lib/types";
import { buildSlotMaps, formatTime, isComplete, key, slotAt } from "@/lib/puzzleUtils";
import { DEFAULT_STATS, loadStats, recordWin, Stats } from "@/lib/stats";
import { emptyProgress, loadDailyProgress, saveDailyProgress } from "@/lib/dailyProgress";
import { buildShareText } from "@/lib/share";
import CrosswordGrid, { CrosswordGridHandle } from "./CrosswordGrid";
import ClueList from "./ClueList";
import WinModal from "./WinModal";
import ThemeToggle from "./ThemeToggle";
import NextPuzzleCountdown from "./NextPuzzleCountdown";
import ShareButton from "./ShareButton";

export default function Crossword() {
  // The date key (and therefore the puzzle) is deterministic and identical
  // for every player — it only needs to be computed once per mount.
  const [dateKey] = useState(() => getUtcDateKey());
  const puzzle = useMemo(() => generateDailyPuzzle(dateKey), [dateKey]);
  const puzzleNumber = useMemo(() => getDailyPuzzleNumber(dateKey), [dateKey]);
  const maps = useMemo(() => buildSlotMaps(puzzle), [puzzle]);

  const [progressLoaded, setProgressLoaded] = useState(false);
  const [userGrid, setUserGrid] = useState<string[][]>(() => emptyProgress(dateKey, puzzle.size).userGrid);
  const [selected, setSelected] = useState({ row: 0, col: 0 });
  const [direction, setDirection] = useState<Direction>("across");
  const [wrongCells, setWrongCells] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showWin, setShowWin] = useState(false);
  // Starts at the same default on server and client; the real saved value
  // (from localStorage) is only readable client-side, so it's loaded below.
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);

  const gridRef = useRef<CrosswordGridHandle>(null);

  // Load today's saved progress and stats once, on mount — localStorage
  // isn't available during server rendering, so this has to happen client-side.
  useEffect(() => {
    const progress = loadDailyProgress(dateKey, puzzle.size);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserGrid(progress.userGrid);
    setElapsed(progress.elapsedSeconds);
    setComplete(progress.complete);
    setRevealed(progress.revealed);
    setStats(loadStats());
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
  }, [dateKey, puzzle]);

  // Persist progress on every change, once the initial load has happened
  // (otherwise we'd immediately overwrite saved progress with the defaults).
  useEffect(() => {
    if (!progressLoaded) return;
    saveDailyProgress({ dateKey, userGrid, elapsedSeconds: elapsed, complete, revealed });
  }, [progressLoaded, dateKey, userGrid, elapsed, complete, revealed]);

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
        timeSeconds: elapsed,
        revealed,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    [puzzle, puzzleNumber, elapsed, revealed]
  );

  // Timer ticks once per second while the game is running and unsolved.
  useEffect(() => {
    if (!running || complete) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running, complete]);

  // Detect completion whenever the grid changes. This transition (typing the
  // final correct letter) only happens once per game, so the resulting
  // setState calls here don't cascade on every render.
  useEffect(() => {
    if (complete || userGrid.length === 0) return;
    if (isComplete(puzzle, userGrid)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setComplete(true);
      setRunning(false);
      setShowWin(true);
      if (!revealed) {
        setStats(recordWin(elapsed));
      }
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

  const advance = useCallback(
    (r: number, c: number) => {
      const slot = slotAt(maps, r, c, direction);
      if (!slot) return;
      const idx = slot.cellCoords.findIndex(([rr, cc]) => rr === r && cc === c);
      if (idx < slot.cellCoords.length - 1) {
        const [nr, nc] = slot.cellCoords[idx + 1];
        setSelected({ row: nr, col: nc });
        gridRef.current?.focusCell(nr, nc);
      } else {
        const orderIdx = maps.ordered.findIndex((s) => s.id === slot.id);
        const nextSlot = maps.ordered[(orderIdx + 1) % maps.ordered.length];
        if (nextSlot) {
          setSelected({ row: nextSlot.row, col: nextSlot.col });
          setDirection(nextSlot.direction);
          gridRef.current?.focusCell(nextSlot.row, nextSlot.col);
        }
      }
    },
    [maps, direction]
  );

  const handleType = useCallback(
    (r: number, c: number, letter: string) => {
      if (complete) return;
      setRunning(true);
      setUserGrid((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = letter;
        return next;
      });
      clearWrong(r, c);
      advance(r, c);
    },
    [complete, clearWrong, advance]
  );

  const handleBackspace = useCallback(
    (r: number, c: number) => {
      if (complete) return;
      if (userGrid[r]?.[c]) {
        setUserGrid((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = "";
          return next;
        });
        clearWrong(r, c);
        return;
      }
      const slot = slotAt(maps, r, c, direction);
      if (!slot) return;
      const idx = slot.cellCoords.findIndex(([rr, cc]) => rr === r && cc === c);
      if (idx > 0) {
        const [pr, pc] = slot.cellCoords[idx - 1];
        setUserGrid((prev) => {
          const next = prev.map((row) => [...row]);
          next[pr][pc] = "";
          return next;
        });
        setSelected({ row: pr, col: pc });
        gridRef.current?.focusCell(pr, pc);
      }
    },
    [complete, userGrid, maps, direction, clearWrong]
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
      const idx = maps.ordered.findIndex((s) => s.id === slot.id);
      const nextIdx = shift ? (idx - 1 + maps.ordered.length) % maps.ordered.length : (idx + 1) % maps.ordered.length;
      const nextSlot = maps.ordered[nextIdx];
      setSelected({ row: nextSlot.row, col: nextSlot.col });
      setDirection(nextSlot.direction);
      gridRef.current?.focusCell(nextSlot.row, nextSlot.col);
    },
    [maps, direction]
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
    [handleType, handleBackspace, handleArrow, handleTab, handleCellSelect, clearWrong]
  );

  const selectSlot = useCallback((slot: Slot) => {
    setSelected({ row: slot.row, col: slot.col });
    setDirection(slot.direction);
    gridRef.current?.focusCell(slot.row, slot.col);
  }, []);

  const handleCheck = useCallback(() => {
    const wrong = new Set<string>();
    for (const row of puzzle.cells) {
      for (const cell of row) {
        if (cell.black) continue;
        const val = userGrid[cell.row]?.[cell.col];
        if (val && val !== cell.solution) wrong.add(key(cell.row, cell.col));
      }
    }
    setWrongCells(wrong);
  }, [puzzle, userGrid]);

  const handleReveal = useCallback(() => {
    const solved = puzzle.cells.map((row) => row.map((cell) => (cell.black ? "" : cell.solution)));
    setRevealed(true);
    setUserGrid(solved);
    setWrongCells(new Set());
  }, [puzzle]);

  const buttonClass =
    "px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors";

  return (
    <div className="max-w-3xl mx-auto p-4">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Mini Crossword</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Daily puzzle #{puzzleNumber} · same for everyone today
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {complete ? (
            <span className="text-neutral-600 dark:text-neutral-400">
              Next puzzle in <NextPuzzleCountdown />
            </span>
          ) : (
            <>
              <span className="font-mono tabular-nums text-neutral-700 dark:text-neutral-300 w-12 text-center">
                {formatTime(elapsed)}
              </span>
              <button type="button" onClick={handleCheck} className={buttonClass}>
                Check
              </button>
              <button type="button" onClick={handleReveal} className={buttonClass}>
                Reveal
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>

      {complete && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm">
          <span>
            {revealed
              ? "You revealed today's puzzle."
              : `You solved today's puzzle in ${formatTime(elapsed)}.`}{" "}
            Come back after the countdown for a new one.
          </span>
          <ShareButton
            text={shareText}
            className="shrink-0 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
          />
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        <CrosswordGrid
          ref={gridRef}
          puzzle={puzzle}
          userGrid={userGrid}
          selected={selected}
          highlighted={highlighted}
          wrongCells={wrongCells}
          locked={complete}
          onSelect={handleCellSelect}
          onKeyDown={handleKeyDown}
        />

        <div className="flex-1 grid grid-cols-2 gap-4">
          <ClueList title="Across" slots={acrossSlots} activeSlotId={activeSlot?.id ?? null} onSelect={selectSlot} />
          <ClueList title="Down" slots={downSlots} activeSlotId={activeSlot?.id ?? null} onSelect={selectSlot} />
        </div>
      </div>

      <div className="mt-5 flex gap-5 text-sm text-neutral-500 dark:text-neutral-400">
        <span>Best: {stats.bestTimeSeconds !== null ? formatTime(stats.bestTimeSeconds) : "—"}</span>
        <span>Streak: {stats.currentStreak}</span>
        <span>
          Won: {stats.gamesWon}/{stats.gamesPlayed}
        </span>
      </div>

      {showWin && (
        <WinModal
          timeSeconds={elapsed}
          stats={stats}
          revealed={revealed}
          shareText={shareText}
          onClose={() => setShowWin(false)}
        />
      )}
    </div>
  );
}
