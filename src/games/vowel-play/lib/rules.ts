import type { StepRules } from "@/platform/stepGame/rules";

// Vowel Play: work out films and TV shows from their titles with the vowels
// taken out. Moves are guesses at the current title, cleaned up by
// cleanGuess, or PASS to skip it. Guesses must use the title's consonants in
// order, so only a real attempt counts as a wrong guess, and wrong guesses are
// final (noTakebacks) because they cost points.
//
// The puzzle never holds the answers, only a salted hash of each, so the
// client can check guesses without the day's titles shipping to the browser.

export const PASS = "?";
/** Longest guess, spaces included; every title in the list fits. */
export const MAX_GUESS_LENGTH = 32;

export type ClueKind = "movie" | "tv";

export interface Clue {
  /** The title in capitals with vowels, spaces and punctuation removed, e.g. "BRKNGBD". */
  letters: string;
  kind: ClueKind;
  /** hashAnswer(salt, the title). */
  check: number;
}

export interface VowelPlayPuzzle {
  salt: string;
  clues: Clue[];
}

/** cyrb53: a fast 53-bit string hash, safe to send as a JSON number. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * A guess or title in its canonical form: lower case, accents dropped, "&" as
 * "and", hyphens and slashes as spaces, other punctuation gone, single spaces.
 * "Spider-Man" → "spider man", "Schindler's List" → "schindlers list".
 */
export function cleanGuess(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-/]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What the player sees of a title: "Breaking Bad" → "BRKNGBD", "A Quiet Place" → "QTPLC".
 * The word gaps go too, so the player has to work out where each word ends.
 */
export function stripVowels(title: string): string {
  return consonants(title).toUpperCase();
}

/** The consonants (and digits) of a text, in order, without gaps: what a guess has to match. */
export function consonants(text: string): string {
  return cleanGuess(text).replace(/[aeiou ]/g, "");
}

/** Spaces don't matter when checking an answer: "spiderman" and "spider man" are the same guess. */
export function hashAnswer(salt: string, text: string): number {
  return cyrb53(`${salt}:${cleanGuess(text).replace(/ /g, "")}`);
}

export function makeClue(salt: string, title: string, kind: ClueKind): Clue {
  return { letters: stripVowels(title), kind, check: hashAnswer(salt, title) };
}

export type ClueResult = { status: "right"; guess: string; wrong: string[] } | { status: "passed"; wrong: string[] };

export interface VowelPlayState {
  /** One per title dealt with, in order. */
  results: ClueResult[];
  /** The title being worked on; clues.length once all are done. */
  current: number;
  /** Wrong guesses at the current title so far. */
  wrongHere: string[];
  right: number;
  passes: number;
  wrong: number;
}

/** Plays `moves` through from the start. Unplayable moves aren't expected; see VOWEL_PLAY_RULES.invalidMove. */
export function stateAfter(puzzle: VowelPlayPuzzle, moves: readonly string[]): VowelPlayState {
  const state: VowelPlayState = { results: [], current: 0, wrongHere: [], right: 0, passes: 0, wrong: 0 };
  for (const move of moves) {
    const clue = puzzle.clues[state.current];
    if (!clue) break;
    if (move === PASS) {
      state.results.push({ status: "passed", wrong: state.wrongHere });
      state.passes++;
    } else if (hashAnswer(puzzle.salt, move) === clue.check) {
      state.results.push({ status: "right", guess: move, wrong: state.wrongHere });
      state.right++;
    } else {
      state.wrongHere = [...state.wrongHere, move];
      state.wrong++;
      continue;
    }
    state.current++;
    state.wrongHere = [];
  }
  return state;
}

export const PASS_PENALTY = 60;
export const WRONG_PENALTY = 10;

export const VOWEL_PLAY_RULES: StepRules<VowelPlayPuzzle> = {
  invalidMove(puzzle, moves, move) {
    const state = stateAfter(puzzle, moves);
    const clue = puzzle.clues[state.current];
    if (!clue) return "All done";
    if (move === PASS) return null;
    if (!move || move !== cleanGuess(move)) return "Type a title";
    if (move.length > MAX_GUESS_LENGTH) return "That's too long";
    if (consonants(move) !== consonants(clue.letters)) return "Those letters don't match";
    const squashed = move.replace(/ /g, "");
    if (state.wrongHere.some((guess) => guess.replace(/ /g, "") === squashed)) return "Already tried that";
    return null;
  },
  isSolved: (puzzle, moves) => stateAfter(puzzle, moves).current >= puzzle.clues.length,
  progress(puzzle, moves) {
    return { done: stateAfter(puzzle, moves).right, total: puzzle.clues.length };
  },
  skillPoints(puzzle, moves) {
    const { passes, wrong } = stateAfter(puzzle, moves);
    return -(PASS_PENALTY * passes + WRONG_PENALTY * wrong);
  },
  skillLabel: "Passes and wrong guesses",
  giveUpPoints: (puzzle, moves) => 30 * stateAfter(puzzle, moves).right,
  maxMoves: 200,
  noTakebacks: true,
  scoring: { solvePoints: 400, timeBonusMax: 200, timeBonusWindowSeconds: 360 },
};
