import { Direction, Puzzle, Slot } from "./types";

export function key(r: number, c: number): string {
  return `${r},${c}`;
}

export interface SlotMaps {
  across: Map<string, Slot>;
  down: Map<string, Slot>;
  ordered: Slot[];
}

export function buildSlotMaps(puzzle: Puzzle): SlotMaps {
  const across = new Map<string, Slot>();
  const down = new Map<string, Slot>();

  for (const slot of puzzle.slots) {
    const map = slot.direction === "across" ? across : down;
    for (const [r, c] of slot.cellCoords) {
      map.set(key(r, c), slot);
    }
  }

  const ordered = [...puzzle.slots].sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return a.direction === "across" ? -1 : 1;
  });

  return { across, down, ordered };
}

export function slotAt(maps: SlotMaps, r: number, c: number, direction: Direction): Slot | undefined {
  return (direction === "across" ? maps.across : maps.down).get(key(r, c));
}

export function isComplete(puzzle: Puzzle, userGrid: string[][]): boolean {
  for (const row of puzzle.cells) {
    for (const cell of row) {
      if (cell.black) continue;
      if (userGrid[cell.row][cell.col] !== cell.solution) return false;
    }
  }
  return true;
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
