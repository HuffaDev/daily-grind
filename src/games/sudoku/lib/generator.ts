import { mulberry32, seedForDateKey } from "@/platform/daily";
import type { GridPuzzle, GridRules } from "@/platform/gridGame/rules";

// A 6×6 sudoku: digits 1–6 once per row, column and 2×3 box. Generated
// deterministically from the date, like every daily puzzle. Any change here
// changes the puzzle a date produces, so bump PUZZLE_VERSION in meta.ts.

export const SIZE = 6;
export const BOX_ROWS = 2;
export const BOX_COLS = 3;

export const SUDOKU_RULES: GridRules = {
  values: ["1", "2", "3", "4", "5", "6"],
  matches: (entry, expected) => entry === expected,
  scoring: {
    solvePoints: 450,
    timeBonusMax: 200,
    timeBonusWindowSeconds: 600,
    checkPenaltyPerCell: 10,
    revealPointsPerCell: 10,
  },
};

/** Clues to aim for by UTC weekday, Sunday first: easiest on Monday, hardest on Sunday. */
const TARGET_GIVENS = [10, 14, 13, 12, 12, 11, 11];

type Board = number[][]; // 0 = empty

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function candidates(board: Board, r: number, c: number): number[] {
  const used = new Set<number>();
  for (let i = 0; i < SIZE; i++) {
    used.add(board[r][i]);
    used.add(board[i][c]);
  }
  const br = r - (r % BOX_ROWS);
  const bc = c - (c % BOX_COLS);
  for (let i = 0; i < BOX_ROWS; i++) for (let j = 0; j < BOX_COLS; j++) used.add(board[br + i][bc + j]);
  return [1, 2, 3, 4, 5, 6].filter((d) => !used.has(d));
}

/** A random complete grid, by backtracking with shuffled digits. */
function fill(board: Board, random: () => number, cell = 0): boolean {
  if (cell === SIZE * SIZE) return true;
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  for (const d of shuffle(candidates(board, r, c), random)) {
    board[r][c] = d;
    if (fill(board, random, cell + 1)) return true;
  }
  board[r][c] = 0;
  return false;
}

/** Rows, columns and boxes, each as its six cells. */
const UNITS: [number, number][][] = (() => {
  const units: [number, number][][] = [];
  for (let i = 0; i < SIZE; i++) {
    units.push(Array.from({ length: SIZE }, (_, j) => [i, j] as [number, number]));
    units.push(Array.from({ length: SIZE }, (_, j) => [j, i] as [number, number]));
  }
  for (let br = 0; br < SIZE; br += BOX_ROWS) {
    for (let bc = 0; bc < SIZE; bc += BOX_COLS) {
      const box: [number, number][] = [];
      for (let i = 0; i < BOX_ROWS; i++) for (let j = 0; j < BOX_COLS; j++) box.push([br + i, bc + j]);
      units.push(box);
    }
  }
  return units;
})();

/**
 * Whether the puzzle solves with only naked and hidden singles: no guessing
 * needed, and therefore exactly one solution.
 */
export function solvesWithSingles(puzzle: Board): boolean {
  const board = puzzle.map((row) => [...row]);
  for (let progress = true; progress; ) {
    progress = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c]) continue;
        const options = candidates(board, r, c);
        if (options.length === 0) return false;
        if (options.length === 1) {
          board[r][c] = options[0];
          progress = true;
        }
      }
    }
    for (const unit of UNITS) {
      for (let d = 1; d <= SIZE; d++) {
        if (unit.some(([r, c]) => board[r][c] === d)) continue;
        const spots = unit.filter(([r, c]) => !board[r][c] && candidates(board, r, c).includes(d));
        if (spots.length === 1) {
          board[spots[0][0]][spots[0][1]] = d;
          progress = true;
        }
      }
    }
  }
  return board.every((row) => row.every(Boolean));
}

export function generateDailySudoku(dateKey: string): GridPuzzle {
  const random = mulberry32(seedForDateKey(`sudoku:${dateKey}`));
  const solution: Board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  fill(solution, random);

  const [y, m, d] = dateKey.split("-").map(Number);
  const target = TARGET_GIVENS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const puzzle = solution.map((row) => [...row]);
  let givens = SIZE * SIZE;
  for (const cell of shuffle([...Array(SIZE * SIZE).keys()], random)) {
    if (givens <= target) break;
    const r = Math.floor(cell / SIZE);
    const c = cell % SIZE;
    puzzle[r][c] = 0;
    if (solvesWithSingles(puzzle)) givens--;
    else puzzle[r][c] = solution[r][c];
  }

  return {
    size: SIZE,
    solution: solution.map((row) => row.map(String)),
    given: puzzle.map((row) => row.map(Boolean)),
  };
}
