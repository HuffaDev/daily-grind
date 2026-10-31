"use client";

import { PointerEvent, useMemo, useRef, useState } from "react";
import { getUtcDateKey } from "@/platform/daily";
import GridGameShell from "@/platform/gridGame/GridGameShell";
import { key } from "@/platform/gridGame/rules";
import { useGridGame } from "@/platform/gridGame/useGridGame";
import { pictureLogic } from "../meta";
import { FILLED, generateDailyPicture, lineClue, MARKED, PICTURE_RULES, SIZE } from "../lib/generator";

export default function PictureLogic() {
  // The date key picks the puzzle; keying on it gives each day a fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <PictureDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

/**
 * One drag across the grid. It stays in the row or column it heads along and
 * covers every cell from where it started to the pointer, so a fast drag
 * doesn't skip cells between pointer events.
 */
interface Stroke {
  start: { r: number; c: number };
  value: string;
  /** Only cells holding what the first cell held change, so a fill drag doesn't wipe out crosses and vice versa. */
  over: string;
  /** The grid when the drag began, to put back cells the drag stops covering. */
  before: string[][];
  /** Cells currently painted by this drag. */
  painted: string[];
}

function sameClue(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

function PictureDay({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const puzzle = useMemo(() => generateDailyPicture(dateKey), [dateKey]);
  const game = useGridGame(pictureLogic, dateKey, puzzle, PICTURE_RULES);
  const [mode, setMode] = useState<typeof FILLED | typeof MARKED>(FILLED);
  const strokeRef = useRef<Stroke | null>(null);
  const { grid, setCells, complete, locked, wrongCells } = game;

  // A clue greys out once its line's filled cells match it.
  const filled = grid.map((row) => row.map((v) => v === FILLED));
  const rowsDone = puzzle.rowClues.map((clue, r) => sameClue(clue, lineClue(filled[r])));
  const colsDone = puzzle.colClues.map((clue, c) => sameClue(clue, lineClue(filled.map((row) => row[c]))));

  /** Paints the stroke's line from its start to (r, c), and puts back cells it no longer covers. */
  function paintTo(r: number, c: number) {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const { start, before } = stroke;
    const alongColumn = Math.abs(r - start.r) > Math.abs(c - start.c);
    const line: string[] = [];
    const [from, to] = alongColumn ? [start.r, r] : [start.c, c];
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
      const [rr, cc] = alongColumn ? [i, start.c] : [start.r, i];
      if (before[rr][cc] === stroke.over) line.push(key(rr, cc));
    }
    const changes: Record<string, string> = {};
    for (const k of stroke.painted) {
      const [rr, cc] = k.split(",").map(Number);
      changes[k] = before[rr][cc];
    }
    for (const k of line) changes[k] = stroke.value;
    stroke.painted = line;
    setCells(changes);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>, r: number, c: number) {
    if (complete || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    const tool = e.button === 2 ? MARKED : mode;
    const current = grid[r][c];
    // Pressing a cell that already holds the tool's mark clears it; the drag then clears its like.
    strokeRef.current = {
      start: { r, c },
      value: current === tool ? "" : tool,
      over: current,
      before: grid.map((row) => [...row]),
      painted: [],
    };
    paintTo(r, c);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!strokeRef.current) return;
    // Touch keeps sending moves to the cell the drag started on, so find the one under the finger.
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-cell]");
    const cellKey = cell?.getAttribute("data-cell");
    if (!cellKey) return;
    const [r, c] = cellKey.split(",").map(Number);
    paintTo(r, c);
  }

  const endStroke = () => {
    strokeRef.current = null;
  };

  const clueText = "text-[10px] sm:text-xs font-semibold tabular-nums leading-tight";

  return (
    <GridGameShell
      info={pictureLogic}
      rules={PICTURE_RULES}
      game={game}
      dateKey={dateKey}
      onPlayDate={onPlayDate}
      intro={
        <>
          <p className="font-semibold text-neutral-900 dark:text-neutral-50">Fill the cells to draw today&apos;s picture.</p>
          <p>
            Each clue lists the runs of filled cells in its row or column, in order. Cross out cells you know are empty.
          </p>
        </>
      }
      checks={[{ label: "Check", title: "Check every marked cell (−5 per wrong one)" }]}
      controls={
        <div className="mt-4 short:mt-1 flex items-center justify-center gap-2 text-sm">
          {[
            { tool: FILLED, label: "■ Fill" } as const,
            { tool: MARKED, label: "✕ Cross" } as const,
          ].map(({ tool, label }) => (
            <button
              key={tool}
              type="button"
              onClick={() => setMode(tool)}
              aria-pressed={mode === tool}
              className={`px-4 py-2 short:py-1 rounded-lg font-semibold ring-1 transition-colors ${
                mode === tool
                  ? "bg-amber-500 text-neutral-900 ring-amber-500"
                  : "bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 ring-neutral-300 dark:ring-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="short:hidden hidden sm:inline text-xs text-neutral-500 dark:text-neutral-400">
            Drag along a row or column · right-click to cross
          </span>
        </div>
      }
    >
      {/* Like the crossword, the grid stays paper-white in dark mode. */}
      <div
        className="grid w-full max-w-[460px] short:max-w-[calc(100dvh-7rem)] mx-auto select-none touch-none rounded-lg bg-white p-2"
        style={{ gridTemplateColumns: `auto repeat(${SIZE}, minmax(0, 1fr))` }}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div />
        {puzzle.colClues.map((clue, c) => (
          <div
            key={`col-${c}`}
            className={`${clueText} flex flex-col items-center justify-end pb-1 ${colsDone[c] ? "text-neutral-300" : "text-neutral-800"}`}
          >
            {(clue.length ? clue : [0]).map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </div>
        ))}
        {grid.map((row, r) => [
          <div
            key={`row-${r}`}
            className={`${clueText} flex items-center justify-end gap-1 pr-1.5 ${rowsDone[r] ? "text-neutral-300" : "text-neutral-800"}`}
          >
            {(puzzle.rowClues[r].length ? puzzle.rowClues[r] : [0]).map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </div>,
          ...row.map((value, c) => {
            const k = key(r, c);
            const wrong = wrongCells.has(k);
            const borders = [
              c === 0 ? "border-l-2" : c % 5 === 0 ? "border-l-2" : "border-l",
              r === 0 ? "border-t-2" : r % 5 === 0 ? "border-t-2" : "border-t",
              c === SIZE - 1 ? "border-r-2" : "",
              r === SIZE - 1 ? "border-b-2" : "",
            ].join(" ");
            return (
              <div
                key={k}
                data-cell={k}
                role="gridcell"
                aria-label={`Row ${r + 1}, column ${c + 1}: ${value === FILLED ? "filled" : value === MARKED ? "crossed" : "empty"}`}
                onPointerDown={(e) => handlePointerDown(e, r, c)}
                className={`aspect-square ${borders} border-neutral-400 flex items-center justify-center ${
                  value === FILLED
                    ? wrong
                      ? "bg-red-500"
                      : locked.has(k) || complete
                        ? "bg-neutral-900"
                        : "bg-neutral-800"
                    : "bg-white hover:bg-amber-100"
                } ${complete ? "" : "cursor-pointer"}`}
              >
                {value === MARKED && (
                  <span className={`text-sm sm:text-base leading-none ${wrong ? "text-red-600 font-bold" : "text-neutral-400"}`}>
                    ✕
                  </span>
                )}
              </div>
            );
          }),
        ])}
      </div>
    </GridGameShell>
  );
}
