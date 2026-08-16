"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Puzzle } from "@/lib/types";
import { key } from "@/lib/puzzleUtils";

export interface CrosswordGridHandle {
  focusCell: (r: number, c: number) => void;
}

interface Props {
  puzzle: Puzzle;
  userGrid: string[][];
  selected: { row: number; col: number };
  highlighted: Set<string>;
  wrongCells: Set<string>;
  locked?: boolean;
  onSelect: (r: number, c: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => void;
}

const CrosswordGrid = forwardRef<CrosswordGridHandle, Props>(function CrosswordGrid(
  { puzzle, userGrid, selected, highlighted, wrongCells, locked = false, onSelect, onKeyDown },
  ref
) {
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useImperativeHandle(ref, () => ({
    focusCell(r, c) {
      inputRefs.current.get(key(r, c))?.focus();
    },
  }));

  return (
    // The grid itself intentionally ignores light/dark mode: typeable cells
    // are always white and blocked cells are always black, like a printed
    // crossword. Only the surrounding page chrome follows the app theme.
    <div
      className="grid grid-cols-5 gap-[3px] bg-neutral-500 p-[3px] rounded-lg w-full max-w-[420px] aspect-square mx-auto select-none"
      role="grid"
      aria-label="Crossword grid"
    >
      {puzzle.cells.flat().map((cell) => {
        const k = key(cell.row, cell.col);

        if (cell.black) {
          return <div key={k} className="bg-black rounded-[2px]" />;
        }

        const isSelected = selected.row === cell.row && selected.col === cell.col;
        const isHighlighted = highlighted.has(k);
        const isWrong = wrongCells.has(k);

        return (
          <div
            key={k}
            className={`relative rounded-[2px] ${
              isSelected ? "bg-amber-300" : isHighlighted ? "bg-blue-100" : "bg-white"
            }`}
          >
            {cell.number !== null && (
              <span className="absolute top-[1px] left-[2px] text-[9px] sm:text-[10px] leading-none text-neutral-500 pointer-events-none">
                {cell.number}
              </span>
            )}
            <input
              ref={(el) => {
                if (el) inputRefs.current.set(k, el);
                else inputRefs.current.delete(k);
              }}
              value={userGrid[cell.row][cell.col]}
              maxLength={1}
              readOnly={locked}
              tabIndex={locked ? -1 : 0}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={`Row ${cell.row + 1}, column ${cell.col + 1}`}
              onClick={() => !locked && onSelect(cell.row, cell.col)}
              onKeyDown={(e) => !locked && onKeyDown(e, cell.row, cell.col)}
              onChange={() => {}}
              className={`w-full h-full bg-transparent text-center font-semibold text-lg sm:text-2xl uppercase caret-transparent focus:outline-none ${
                isWrong ? "text-red-600" : "text-neutral-900"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
});

export default CrosswordGrid;
