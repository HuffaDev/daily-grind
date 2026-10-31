// Builds data/words.json, the word lists Ladder and Anagram Chain share, from
// two downloaded lists:
//
//   - ENABLE (public domain, https://github.com/dolph/dictionary/blob/master/enable1.txt):
//     every word players may enter.
//   - google-10000-english-no-swears (https://github.com/first20hours/google-10000-english):
//     the common words puzzles are built from, so a day's answer is never obscure.
//
// Run from the repo root:
//
//   bun src/games/shared/words/scripts/build-words.ts path/to/enable1.txt path/to/google-10000-english-no-swears.txt
//
// Never run at build or runtime. Rebuilding can change the puzzle a date gets,
// so bump PUZZLE_VERSION in each word game's meta.ts afterwards.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MAX_LENGTH, MIN_LENGTH } from "../words";

const [dictionaryPath, commonPath] = process.argv.slice(2);
if (!dictionaryPath || !commonPath) {
  console.error("Usage: bun src/games/shared/words/scripts/build-words.ts <enable1.txt> <common-words.txt>");
  process.exit(1);
}

async function readWords(path: string): Promise<string[]> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z]+$/.test(word) && word.length >= MIN_LENGTH && word.length <= MAX_LENGTH);
}

const dictionary = [...new Set(await readWords(dictionaryPath))].sort();
const allowed = new Set(dictionary);
// Common words that are also real words: drops abbreviations and names like "html" or "april".
const common = [...new Set(await readWords(commonPath))].filter((word) => allowed.has(word)).sort();

// Space-separated, one string per list, to keep the file small.
const out = fileURLToPath(new URL("../data/words.json", import.meta.url));
await mkdir(fileURLToPath(new URL("../data/", import.meta.url)), { recursive: true });
await writeFile(out, JSON.stringify({ dictionary: dictionary.join(" "), common: common.join(" ") }) + "\n");
console.log(`Wrote ${dictionary.length} words, ${common.length} of them common, to ${out}`);
