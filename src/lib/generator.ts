import { BLOCK_PATTERNS } from "./patterns";
import { WORD_BANK, WordEntry } from "./wordbank";
import { Cell, Puzzle, Slot } from "./types";
import { getUtcDateKey, mulberry32, seedForDateKey } from "./daily";

/**
 * Bump whenever the word bank, block patterns, or generator logic change.
 * The generated puzzle depends on all of them, so a change silently alters
 * the day's puzzle — the version keeps saved progress and leaderboards from
 * mixing grids from different builds.
 */
export const PUZZLE_VERSION = 1;

const SIZE = 5;
const MAX_BACKTRACK_STEPS = 150_000;

type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildGrid(blacks: [number, number][]): Cell[][] {
  const blackSet = new Set(blacks.map(([r, c]) => `${r},${c}`));
  const cells: Cell[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < SIZE; c++) {
      row.push({
        row: r,
        col: c,
        black: blackSet.has(`${r},${c}`),
        solution: "",
        number: null,
      });
    }
    cells.push(row);
  }
  return cells;
}

function computeSlots(cells: Cell[][]): Slot[] {
  const slots: Slot[] = [];
  let counter = 1;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = cells[r][c];
      if (cell.black) continue;

      const leftBlocked = c === 0 || cells[r][c - 1].black;
      const rightOpen = c + 1 < SIZE && !cells[r][c + 1].black;
      const startsAcross = leftBlocked && rightOpen;

      const topBlocked = r === 0 || cells[r - 1][c].black;
      const bottomOpen = r + 1 < SIZE && !cells[r + 1][c].black;
      const startsDown = topBlocked && bottomOpen;

      if (!startsAcross && !startsDown) continue;

      cell.number = counter;

      if (startsAcross) {
        const coords: [number, number][] = [];
        let cc = c;
        while (cc < SIZE && !cells[r][cc].black) {
          coords.push([r, cc]);
          cc++;
        }
        slots.push({
          id: `${counter}A`,
          direction: "across",
          number: counter,
          row: r,
          col: c,
          length: coords.length,
          cellCoords: coords,
          answer: "",
          clue: "",
        });
      }

      if (startsDown) {
        const coords: [number, number][] = [];
        let rr = r;
        while (rr < SIZE && !cells[rr][c].black) {
          coords.push([rr, c]);
          rr++;
        }
        slots.push({
          id: `${counter}D`,
          direction: "down",
          number: counter,
          row: r,
          col: c,
          length: coords.length,
          cellCoords: coords,
          answer: "",
          clue: "",
        });
      }

      counter++;
    }
  }

  return slots;
}

function everyWhiteCellCovered(cells: Cell[][], slots: Slot[]): boolean {
  const covered = new Set<string>();
  for (const slot of slots) {
    for (const [r, c] of slot.cellCoords) covered.add(`${r},${c}`);
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!cells[r][c].black && !covered.has(`${r},${c}`)) return false;
    }
  }
  return true;
}

function matchesPattern(word: string, pattern: string): boolean {
  for (let i = 0; i < word.length; i++) {
    if (pattern[i] !== "." && pattern[i] !== word[i]) return false;
  }
  return true;
}

function fillGrid(cells: Cell[][], slots: Slot[], rng: Rng): boolean {
  const used = new Set<string>();
  let steps = 0;

  const bank: Record<number, WordEntry[]> = {
    2: WORD_BANK[2],
    3: WORD_BANK[3],
    4: WORD_BANK[4],
    5: WORD_BANK[5],
  };

  function currentPattern(slot: Slot): string {
    return slot.cellCoords.map(([r, c]) => cells[r][c].solution || ".").join("");
  }

  function candidatesFor(slot: Slot): WordEntry[] {
    const pattern = currentPattern(slot);
    const wordList = bank[slot.length as 2 | 3 | 4 | 5] ?? [];
    return wordList.filter((e) => !used.has(e.word) && matchesPattern(e.word, pattern));
  }

  // Most-constrained-variable search: at each step, fill the remaining slot
  // with the fewest matching candidates so dead ends are found quickly.
  function backtrack(remaining: Slot[]): boolean {
    if (remaining.length === 0) return true;
    if (++steps > MAX_BACKTRACK_STEPS) return false;

    let bestIdx = -1;
    let bestCandidates: WordEntry[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const candidates = candidatesFor(remaining[i]);
      if (bestIdx === -1 || candidates.length < bestCandidates.length) {
        bestIdx = i;
        bestCandidates = candidates;
        if (candidates.length === 0) break;
      }
    }

    const slot = remaining[bestIdx];
    const rest = remaining.filter((_, i) => i !== bestIdx);

    for (const cand of shuffle(bestCandidates, rng)) {
      const newlySet: [number, number][] = [];
      for (let i = 0; i < slot.cellCoords.length; i++) {
        const [r, c] = slot.cellCoords[i];
        if (!cells[r][c].solution) {
          cells[r][c].solution = cand.word[i];
          newlySet.push([r, c]);
        }
      }
      slot.answer = cand.word;
      slot.clue = cand.clue;
      used.add(cand.word);

      if (backtrack(rest)) return true;

      used.delete(cand.word);
      slot.answer = "";
      slot.clue = "";
      for (const [r, c] of newlySet) cells[r][c].solution = "";
    }

    return false;
  }

  return backtrack(slots);
}

/** Generates a puzzle from the given RNG — the same rng sequence always produces the same puzzle. */
export function generatePuzzle(rng: Rng = Math.random): Puzzle {
  const patternOrder = shuffle(BLOCK_PATTERNS, rng);

  for (const blacks of patternOrder) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const cells = buildGrid(blacks);
      const slots = computeSlots(cells);
      if (slots.length === 0 || !everyWhiteCellCovered(cells, slots)) continue;
      if (fillGrid(cells, slots, rng)) {
        return { size: SIZE, cells, slots };
      }
    }
  }

  throw new Error("Failed to generate a puzzle — word bank may be too small.");
}

/**
 * Generates the shared daily puzzle for a given UTC date key (defaults to
 * today). Every player who requests the same date key gets an identical
 * puzzle, since the seed — and therefore the whole generation sequence —
 * is derived deterministically from the date string.
 */
export function generateDailyPuzzle(dateKey: string = getUtcDateKey()): Puzzle {
  const rng = mulberry32(seedForDateKey(dateKey));
  return generatePuzzle(rng);
}

/** Identifies one day's puzzle as produced by this build, e.g. "2026-10-30.v1". */
export function getPuzzleId(dateKey: string): string {
  return `${dateKey}.v${PUZZLE_VERSION}`;
}

export function parsePuzzleId(puzzleId: string): { dateKey: string; version: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.v(\d+)$/.exec(puzzleId);
  if (!match) return null;
  return { dateKey: match[1], version: Number(match[2]) };
}
