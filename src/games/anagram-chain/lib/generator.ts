import { commonWords, dictionaryWords, letterKey } from "@/games/shared/words/words";
import { mulberry32, seedForDateKey } from "@/platform/daily";
import { AnagramPuzzle, lettersLeft } from "./rules";

// Builds the day's chain on the server. The final word and every step of the
// answer are common words, so the day can always be solved without obscure
// ones; players may still use any word in the dictionary.

export const START_LENGTH = 3;
export const FINAL_LENGTH = 7;

/** Letter key → the common words with exactly those letters. */
let commonByKey: Map<string, string[]> | null = null;

function loadCommon(): Map<string, string[]> {
  if (commonByKey) return commonByKey;
  commonByKey = new Map();
  for (let length = START_LENGTH; length <= FINAL_LENGTH; length++) {
    for (const word of commonWords(length)) {
      const k = letterKey(word);
      commonByKey.set(k, [...(commonByKey.get(k) ?? []), word]);
    }
  }
  return commonByKey;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A chain of common words from `word` down to START_LENGTH letters, one letter fewer each step, longest first. */
function chainDown(word: string, random: () => number): string[] | null {
  if (word.length === START_LENGTH) return [word];
  const byKey = loadCommon();
  const k = letterKey(word);
  for (const letter of shuffle([...new Set(k)], random)) {
    const smaller = lettersLeft(k, letter)!;
    for (const next of shuffle(byKey.get(smaller) ?? [], random)) {
      const rest = chainDown(next, random);
      if (rest) return [word, ...rest];
    }
  }
  return null;
}

/** The day's chain, and an answer (the words after the start). */
export function generateDailyAnagram(dateKey: string): { puzzle: AnagramPuzzle; solution: string[] } {
  const random = mulberry32(seedForDateKey(dateKey));
  const finals = commonWords(FINAL_LENGTH);
  // About a third of common 7-letter words chain all the way down.
  for (;;) {
    const final = finals[Math.floor(random() * finals.length)];
    const chain = chainDown(final, random);
    if (!chain) continue;
    const [start, ...solution] = chain.reverse();
    const letters = shuffle([...final], random).join("");
    const words: string[] = [];
    for (let length = START_LENGTH + 1; length <= FINAL_LENGTH; length++) {
      for (const word of dictionaryWords(length)) if (lettersLeft(letters, word) !== null) words.push(word);
    }
    return { puzzle: { start, letters, words }, solution };
  }
}
