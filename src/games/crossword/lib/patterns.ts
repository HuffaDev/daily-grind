// Symmetric (180-degree rotation) block patterns for a 5x5 mini grid.
// Each pattern keeps every white-cell run at least 2 letters long, and —
// critically — keeps the mutually-crossing "core" small (one 5x5 spine at
// most) so the puzzle is solvable with a modest curated word bank instead
// of a full-size crossword dictionary. Fuller grids (all four corners only,
// or bigger notches) fill so rarely that the same few grids keep coming
// back; variety.test.ts catches that.
export const BLOCK_PATTERNS: [number, number][][] = [
  // Four corners blocked + a diagonal interior pair.
  [
    [0, 0],
    [0, 4],
    [4, 0],
    [4, 4],
    [1, 1],
    [3, 3],
  ],
  [
    [0, 0],
    [0, 4],
    [4, 0],
    [4, 4],
    [1, 3],
    [3, 1],
  ],
  // Two opposite corners blocked + a diagonal interior pair.
  [
    [0, 4],
    [4, 0],
    [1, 1],
    [3, 3],
  ],
  [
    [0, 4],
    [4, 0],
    [1, 3],
    [3, 1],
  ],
  // Four corners + a middle interior pair — mostly 3s and 5s, and the only
  // patterns with 2-letter entries (four each), so those stay rare.
  [
    [0, 0],
    [0, 4],
    [4, 0],
    [4, 4],
    [1, 2],
    [3, 2],
  ],
  // A staircase from top-left to bottom-right: 3- and 4-letter entries
  // around a single 5-letter row and column.
  [
    [0, 0],
    [0, 1],
    [1, 0],
    [3, 4],
    [4, 3],
    [4, 4],
  ],
];
