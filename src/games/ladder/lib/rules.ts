import type { StepRules } from "@/platform/stepGame/rules";

// Word Ladder: turn the start word into the target, changing one letter per
// step, every step a real word. Moves are the words after the start.

export const WORD_LENGTH = 4;

export interface LadderPuzzle {
  start: string;
  target: string;
  /** Fewest steps the day's ladder takes using common words. */
  par: number;
  /** Every word players may use, so the client can check steps without asking the server. */
  words: string[];
}

const wordSets = new WeakMap<LadderPuzzle, Set<string>>();

function wordSet(puzzle: LadderPuzzle): Set<string> {
  let set = wordSets.get(puzzle);
  if (!set) {
    set = new Set(puzzle.words);
    wordSets.set(puzzle, set);
  }
  return set;
}

/** How many positions two same-length words differ in. */
export function lettersApart(a: string, b: string): number {
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
  return count;
}

export function currentWord(puzzle: LadderPuzzle, moves: readonly string[]): string {
  return moves.at(-1) ?? puzzle.start;
}

export const LADDER_RULES: StepRules<LadderPuzzle> = {
  invalidMove(puzzle, moves, move) {
    if (move.length !== WORD_LENGTH) return `Words have ${WORD_LENGTH} letters`;
    if (lettersApart(currentWord(puzzle, moves), move) !== 1) return "Change exactly one letter";
    if (move === puzzle.start || moves.includes(move)) return "Already used";
    if (!wordSet(puzzle).has(move)) return "Not in the word list";
    return null;
  },
  isSolved: (puzzle, moves) => moves.at(-1) === puzzle.target,
  // Letters already matching the target, in place.
  progress: (puzzle, moves) => ({
    done: WORD_LENGTH - lettersApart(currentWord(puzzle, moves), puzzle.target),
    total: WORD_LENGTH,
  }),
  skillPoints(puzzle, moves) {
    const over = moves.length - puzzle.par;
    return over > 0 ? -Math.min(200, 40 * over) : 0;
  },
  skillLabel: "Steps over par",
  giveUpPoints: (puzzle, moves) => 20 * LADDER_RULES.progress(puzzle, moves).done,
  maxMoves: 40,
  scoring: { solvePoints: 400, timeBonusMax: 200, timeBonusWindowSeconds: 300 },
};
