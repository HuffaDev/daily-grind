import type { StepRules } from "./rules";

// A made-up step game for the engine's tests: count from 1 up to the puzzle,
// a number. The par is two moves, so every solve here is one over par.

export const COUNT_RULES: StepRules<number> = {
  invalidMove: (_target, moves, move) => (Number(move) === moves.length + 1 ? null : "Count up by one"),
  isSolved: (target, moves) => moves.length === target,
  progress: (target, moves) => ({ done: moves.length, total: target }),
  skillPoints: (_target, moves) => -30 * Math.max(0, moves.length - 2),
  skillLabel: "Over par",
  giveUpPoints: (_target, moves) => 10 * moves.length,
  maxMoves: 10,
  scoring: { solvePoints: 400, timeBonusMax: 200, timeBonusWindowSeconds: 300 },
};
