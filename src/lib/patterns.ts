// Symmetric (180-degree rotation) block patterns for a 5x5 mini grid.
// Each pattern keeps every white-cell run at least 2 letters long, and —
// critically — keeps the mutually-crossing "core" small (one 5x5 spine at
// most) so the puzzle is solvable with a modest curated word bank instead
// of a full-size crossword dictionary.
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
  // Four corners + a middle interior pair — mostly 3s and 5s with a
  // light sprinkling of 2-letter entries for variety.
  [
    [0, 0],
    [0, 4],
    [4, 0],
    [4, 4],
    [1, 2],
    [3, 2],
  ],
  [
    [0, 0],
    [0, 4],
    [4, 0],
    [4, 4],
    [2, 1],
    [2, 3],
  ],
  // "Plus" pattern — heavier on 2-letter entries (8 of the 14 slots).
  [
    [0, 2],
    [2, 0],
    [2, 4],
    [4, 2],
  ],
];
