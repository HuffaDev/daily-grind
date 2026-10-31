import lists from "./data/words.json";

// The word lists the word games share (see scripts/build-words.ts). Only read
// on the server: each game sends its client just the words its day needs.

export const MIN_LENGTH = 3;
export const MAX_LENGTH = 7;

let parsed: { dictionary: Set<string>; common: string[] } | null = null;

function load() {
  parsed ??= { dictionary: new Set(lists.dictionary.split(" ")), common: lists.common.split(" ") };
  return parsed;
}

/** Whether players may use `word`: any real word in the dictionary, lowercase. */
export function isWord(word: string): boolean {
  return load().dictionary.has(word);
}

/** Every dictionary word of a length, alphabetically. */
export function dictionaryWords(length: number): string[] {
  return [...load().dictionary].filter((word) => word.length === length);
}

/** Common words of a length, alphabetically: what puzzles are built from. */
export function commonWords(length: number): string[] {
  return load().common.filter((word) => word.length === length);
}

/** A word's letters in alphabetical order, so anagrams share it: "stare" → "aerst". */
export function letterKey(word: string): string {
  return [...word].sort().join("");
}
