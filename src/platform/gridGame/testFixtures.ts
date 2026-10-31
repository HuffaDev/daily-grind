import type { GridPuzzle, GridRules } from "./rules";

// A 2×2 Picture-Logic-style game: "#" filled, "x" crossed out (counts as empty).
export const RULES: GridRules = {
  values: ["#", "x"],
  matches: (entry, expected) => (expected === "#" ? entry === "#" : entry !== "#"),
  scoring: { solvePoints: 400, timeBonusMax: 200, timeBonusWindowSeconds: 600, checkPenaltyPerCell: 5, revealPointsPerCell: 10 },
};
export const PUZZLE: GridPuzzle = {
  size: 2,
  solution: [
    ["#", ""],
    ["#", "#"],
  ],
  given: [
    [false, false],
    [false, true],
  ],
};
