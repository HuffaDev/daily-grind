import { mulberry32, seedForDateKey } from "@/platform/daily";
import type { GridPuzzle, GridRules } from "@/platform/gridGame/rules";

// A 10×10 nonogram: each row's and column's clue lists the runs of filled
// cells in order. The picture is a left–right symmetric pixel sprite,
// generated deterministically from the date. Any change here changes the
// puzzle a date produces, so bump PUZZLE_VERSION in meta.ts.

export const SIZE = 10;
export const FILLED = "#" as const;
export const MARKED = "x" as const;

export const PICTURE_RULES: GridRules = {
  values: [FILLED, MARKED],
  // A cross is only a note; an empty cell and a crossed one both mean "not filled".
  matches: (entry, expected) => (expected === FILLED ? entry === FILLED : entry !== FILLED),
  scoring: {
    solvePoints: 450,
    timeBonusMax: 200,
    timeBonusWindowSeconds: 900,
    checkPenaltyPerCell: 5,
    revealPointsPerCell: 5,
  },
};

/** Lengths of the runs of filled cells in a line; empty for a blank line. */
export function lineClue(line: readonly boolean[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) run++;
    else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs;
}

export function clues(picture: boolean[][]): { rows: number[][]; cols: number[][] } {
  return {
    rows: picture.map(lineClue),
    cols: picture[0].map((_, c) => lineClue(picture.map((row) => row[c]))),
  };
}

type Cell = -1 | 0 | 1; // unknown, empty, filled

/**
 * Settles what one line's clue and known cells force: tries every placement
 * of the runs that fits, and keeps the cells all of them agree on.
 * Returns null if nothing fits.
 */
function settleLine(clue: readonly number[], line: readonly Cell[]): Cell[] | null {
  const n = line.length;
  let agreed: Cell[] | null = null;
  const placement: Cell[] = Array(n).fill(0);

  function place(run: number, from: number) {
    if (run === clue.length) {
      for (let i = from; i < n; i++) if (line[i] === 1) return;
      agreed = agreed ? agreed.map((v, i) => (v === placement[i] ? v : -1)) : [...placement];
      return;
    }
    const length = clue[run];
    for (let start = from; start + length <= n; start++) {
      // Cells skipped before the run must be allowed to be empty.
      if (line[start - 1] === 1 && start - 1 >= from) return;
      let fits = true;
      for (let i = start; i < start + length; i++) if (line[i] === 0) fits = false;
      if (start + length < n && line[start + length] === 1) fits = false;
      if (fits) {
        for (let i = start; i < start + length; i++) placement[i] = 1;
        place(run + 1, start + length + 1);
        for (let i = start; i < start + length; i++) placement[i] = 0;
      }
    }
  }

  place(0, 0);
  return agreed;
}

/**
 * How many passes over every row and column line-by-line logic needs to solve
 * the puzzle — the way people solve nonograms — or null if it gets stuck.
 * Solving this way also means the picture is the only solution.
 */
export function lineSolveRounds(rowClues: number[][], colClues: number[][]): number | null {
  const grid: Cell[][] = Array.from({ length: rowClues.length }, () => Array(colClues.length).fill(-1));
  let rounds = 0;
  for (let progress = true; progress; ) {
    progress = false;
    rounds++;
    for (let r = 0; r < grid.length; r++) {
      const settled = settleLine(rowClues[r], grid[r]);
      if (!settled) return null;
      settled.forEach((v, c) => {
        if (v !== -1 && grid[r][c] === -1) {
          grid[r][c] = v;
          progress = true;
        }
      });
    }
    for (let c = 0; c < colClues.length; c++) {
      const settled = settleLine(colClues[c], grid.map((row) => row[c]));
      if (!settled) return null;
      settled.forEach((v, r) => {
        if (v !== -1 && grid[r][c] === -1) {
          grid[r][c] = v;
          progress = true;
        }
      });
    }
  }
  return grid.every((row) => row.every((v) => v !== -1)) ? rounds : null;
}

/** A random left–right symmetric sprite, smoothed into blobs so it reads as a picture rather than noise. */
function randomSprite(random: () => number): boolean[][] {
  const half = SIZE / 2;
  let cells = Array.from({ length: SIZE }, () => Array.from({ length: half }, () => random() < 0.5));
  const at = (r: number, c: number) => {
    if (r < 0 || r >= SIZE || c < 0) return false;
    return c < half ? cells[r][c] : cells[r][SIZE - 1 - c];
  };
  cells = cells.map((row, r) =>
    row.map((filled, c) => {
      let neighbours = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && at(r + dr, c + dc)) neighbours++;
      return neighbours >= 5 || (filled && neighbours >= 3);
    })
  );
  return cells.map((row) => [...row, ...[...row].reverse()]);
}

function interesting(picture: boolean[][]): boolean {
  const filled = picture.flat().filter(Boolean).length;
  const { rows, cols } = clues(picture);
  const blankLines = [...rows, ...cols].filter((clue) => clue.length === 0).length;
  return filled >= 36 && filled <= 62 && blankLines <= 2;
}

/** A heart: used only if no random sprite works out, which the tests check never happens in practice. */
const FALLBACK = [
  "..........",
  ".###..###.",
  "##########",
  "##########",
  "##########",
  ".########.",
  "..######..",
  "...####...",
  "....##....",
  "..........",
].map((row) => [...row].map((ch) => ch === "#"));

/** Solvable sprites to choose the day's from: the one that takes the most logic to solve wins. */
const CANDIDATES = 8;

/** The day's picture, or null for the fallback; exposed for tests. */
export function dailyPicture(dateKey: string): boolean[][] | null {
  const random = mulberry32(seedForDateKey(`picture-logic:${dateKey}`));
  let best: { picture: boolean[][]; rounds: number } | null = null;
  let found = 0;
  for (let attempt = 0; attempt < 2000 && found < CANDIDATES; attempt++) {
    const picture = randomSprite(random);
    if (!interesting(picture)) continue;
    const { rows, cols } = clues(picture);
    const rounds = lineSolveRounds(rows, cols);
    if (rounds === null) continue;
    found++;
    if (!best || rounds > best.rounds) best = { picture, rounds };
  }
  return best?.picture ?? null;
}

export function generateDailyPicture(dateKey: string): GridPuzzle & { rowClues: number[][]; colClues: number[][] } {
  const picture = dailyPicture(dateKey) ?? FALLBACK;
  const { rows, cols } = clues(picture);
  return {
    size: SIZE,
    solution: picture.map((row) => row.map((filled) => (filled ? FILLED : ""))),
    given: picture.map((row) => row.map(() => false)),
    rowClues: rows,
    colClues: cols,
  };
}
