import type { StepRules } from "@/platform/stepGame/rules";

// Anagram Chain: grow the start word into a word using all the day's letters,
// adding one letter each step and rearranging freely, every step a real word.
// Moves are the words after the start.

export interface AnagramPuzzle {
  start: string;
  /** The day's letters, shuffled; the start word's letters are among them. */
  letters: string;
  /** Every word players may make from the letters, so the client can check steps without asking the server. */
  words: string[];
}

const wordSets = new WeakMap<AnagramPuzzle, Set<string>>();

function wordSet(puzzle: AnagramPuzzle): Set<string> {
  let set = wordSets.get(puzzle);
  if (!set) {
    set = new Set(puzzle.words);
    wordSets.set(puzzle, set);
  }
  return set;
}

/** `letters` with each of `used` taken out once, or null if some aren't there. */
export function lettersLeft(letters: string, used: string): string | null {
  let left = letters;
  for (const letter of used) {
    const i = left.indexOf(letter);
    if (i < 0) return null;
    left = left.slice(0, i) + left.slice(i + 1);
  }
  return left;
}

export function currentWord(puzzle: AnagramPuzzle, moves: readonly string[]): string {
  return moves.at(-1) ?? puzzle.start;
}

/** Words to find: one per letter beyond the start word. */
export const stepsNeeded = (puzzle: AnagramPuzzle) => puzzle.letters.length - puzzle.start.length;

export const ANAGRAM_RULES: StepRules<AnagramPuzzle> = {
  invalidMove(puzzle, moves, move) {
    const current = currentWord(puzzle, moves);
    if (move.length !== current.length + 1) return `Add one letter: ${current.length + 1} letters`;
    const added = lettersLeft(move, current);
    if (added === null) return `Keep every letter of ${current.toUpperCase()}`;
    if (lettersLeft(lettersLeft(puzzle.letters, current)!, added) === null) return "Use only the day's letters";
    if (!wordSet(puzzle).has(move)) return "Not in the word list";
    return null;
  },
  isSolved: (puzzle, moves) => moves.length === stepsNeeded(puzzle),
  progress: (puzzle, moves) => ({ done: moves.length, total: stepsNeeded(puzzle) }),
  skillPoints: () => 0,
  skillLabel: "",
  giveUpPoints: (_puzzle, moves) => 40 * moves.length,
  maxMoves: 10,
  scoring: { solvePoints: 400, timeBonusMax: 200, timeBonusWindowSeconds: 300 },
};
