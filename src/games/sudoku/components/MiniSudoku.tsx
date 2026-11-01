"use client";

import { useEffect, useMemo, useState } from "react";
import { getUtcDateKey } from "@/platform/daily";
import GridGameShell from "@/platform/gridGame/GridGameShell";
import { key } from "@/platform/gridGame/rules";
import { useGridGame } from "@/platform/gridGame/useGridGame";
import { sudoku } from "../meta";
import { sudokuManual } from "../manual";
import { BOX_COLS, BOX_ROWS, generateDailySudoku, SIZE, SUDOKU_RULES } from "../lib/generator";

export default function MiniSudoku() {
  // The date key picks the puzzle; keying on it gives each day a fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <SudokuDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

function SudokuDay({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const puzzle = useMemo(() => generateDailySudoku(dateKey), [dateKey]);
  const game = useGridGame(sudoku, dateKey, puzzle, SUDOKU_RULES);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const { grid, setCells, started, complete, locked, wrongCells } = game;

  const selectedValue = selected ? grid[selected.r][selected.c] : "";
  const enter = (value: string) => selected && setCells({ [key(selected.r, selected.c)]: value });

  // Typing works anywhere on the page: digits fill, Backspace clears, arrows move.
  useEffect(() => {
    if (!started || complete) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (moves[e.key]) {
        e.preventDefault();
        const [dr, dc] = moves[e.key];
        setSelected((s) => {
          const from = s ?? { r: 0, c: 0 };
          return { r: (from.r + dr + SIZE) % SIZE, c: (from.c + dc + SIZE) % SIZE };
        });
      } else if (selected && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        setCells({ [key(selected.r, selected.c)]: e.key });
      } else if (selected && (e.key === "Backspace" || e.key === "Delete" || e.key === "0")) {
        e.preventDefault();
        setCells({ [key(selected.r, selected.c)]: "" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, complete, selected, setCells]);

  const sameBox = (r: number, c: number) =>
    !!selected &&
    Math.floor(r / BOX_ROWS) === Math.floor(selected.r / BOX_ROWS) &&
    Math.floor(c / BOX_COLS) === Math.floor(selected.c / BOX_COLS);

  return (
    <GridGameShell
      info={sudoku}
      manual={sudokuManual}
      rules={SUDOKU_RULES}
      game={game}
      dateKey={dateKey}
      onPlayDate={onPlayDate}
      intro={
        <>
          <p className="font-semibold text-neutral-900 dark:text-neutral-50">Fill the grid with 1–6.</p>
          <p>Each row, column and 2×3 box holds every digit once. No guessing needed.</p>
        </>
      }
      checks={[
        { label: "Check cell", title: "Check the selected cell (−10 if wrong)", cells: selected ? [key(selected.r, selected.c)] : null },
        { label: "Check grid", title: "Check every filled cell (−10 per wrong one)" },
      ]}
      controls={
        <div className="mt-4 short:mt-1 grid grid-cols-7 gap-2 w-full max-w-[420px] mx-auto">
          {SUDOKU_RULES.values.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => enter(digit)}
              className="rounded-lg py-3 short:py-1 text-xl font-semibold bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 ring-1 ring-neutral-300 dark:ring-neutral-700 hover:ring-amber-500 active:bg-amber-100 dark:active:bg-amber-950 transition-colors"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => enter("")}
            aria-label="Erase"
            className="rounded-lg py-3 short:py-1 text-xl bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
          >
            ⌫
          </button>
        </div>
      }
    >
      {/* Like the crossword, the grid stays paper-white in dark mode. */}
      <div
        role="grid"
        aria-label="Sudoku grid"
        className="grid grid-cols-6 w-full max-w-[420px] short:max-w-[calc(100dvh-8rem)] aspect-square mx-auto select-none rounded-lg overflow-hidden border-2 border-neutral-800 bg-neutral-800"
      >
        {grid.flatMap((row, r) =>
          row.map((value, c) => {
            const k = key(r, c);
            const given = puzzle.given[r][c];
            const isSelected = selected?.r === r && selected?.c === c;
            const related = !!selected && (selected.r === r || selected.c === c || sameBox(r, c));
            const sameDigit = !!value && value === selectedValue;
            const background = isSelected
              ? "bg-amber-300"
              : sameDigit
                ? "bg-amber-100"
                : related
                  ? "bg-blue-50"
                  : "bg-white";
            const text = wrongCells.has(k)
              ? "text-red-600"
              : given
                ? "text-neutral-900 font-bold"
                : locked.has(k) || complete
                  ? "text-green-700 font-semibold"
                  : "text-blue-700 font-semibold";
            const borders = [
              c % BOX_COLS === BOX_COLS - 1 && c < SIZE - 1 ? "border-r-2" : "border-r",
              r % BOX_ROWS === BOX_ROWS - 1 && r < SIZE - 1 ? "border-b-2" : "border-b",
            ].join(" ");
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                aria-label={`Row ${r + 1}, column ${c + 1}${value ? `: ${value}` : ""}`}
                onClick={() => setSelected({ r, c })}
                className={`${background} ${text} ${borders} border-neutral-800 flex items-center justify-center text-2xl sm:text-3xl short:text-lg`}
              >
                {value}
              </button>
            );
          })
        )}
      </div>
    </GridGameShell>
  );
}
