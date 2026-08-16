export type Direction = "across" | "down";

export interface Cell {
  row: number;
  col: number;
  black: boolean;
  solution: string;
  number: number | null;
}

export interface Slot {
  id: string;
  direction: Direction;
  number: number;
  row: number;
  col: number;
  length: number;
  cellCoords: [number, number][];
  answer: string;
  clue: string;
}

export interface Puzzle {
  size: number;
  cells: Cell[][];
  slots: Slot[];
}
