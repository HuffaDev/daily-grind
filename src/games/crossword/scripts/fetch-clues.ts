// Maintenance script — NOT run at build or runtime. Re-run manually
// (`bun src/games/crossword/scripts/fetch-clues.ts` from the repo root) to
// refresh or expand the generated word bank from Datamuse. Output is written pre-sorted.
import { writeFileSync } from "fs";
import { WORDS_2, WORDS_3, WORDS_4, WORDS_5 } from "../lib/wordbank";

// Category tags / phrasing in Wiktionary-sourced Datamuse definitions that
// disqualify that particular sense from being used as a clue.
const DISQUALIFYING = new RegExp(
  [
    "vulgar",
    "derogatory",
    "offensive",
    "slur",
    "pejorative",
    "obscene",
    "sexual",
    "sex\\b",
    "genital",
    "porn",
    "drug",
    "cannabis",
    "slang",
    "informal",
    "colloquial",
    "dated",
    "archaic",
    "obsolete",
    "rare\\b",
    "nonstandard",
    "dialectal",
    "euphemistic",
    "ethnic",
    "racist",
    "racial",
    "offens",
    "curse",
    "profan",
    "excrement",
    "buttocks",
    "breast",
    "penis",
    "vagina",
    "masturbat",
    "urin",
    "feces",
    "kill\\b",
    "murder",
    "suicide",
    "nazi",
    "abbreviation of",
    "initialism of",
    "acronym of",
    "alternative[a-z\\s-]* (?:form|spelling|case) of",
    "synonym of",
    "clipping of",
    "ellipsis of",
    "short for",
    "contraction of",
    "surname",
    "given name",
    "proper noun",
    "\\bplace in\\b",
    "\\bplace name\\b",
    "county of",
    "village in",
    "village,",
    "town in",
    "town,",
    "city (?:in|of|and)",
    "municipality",
    "province",
    "prefecture",
    "\\bcommune\\b",
    "\\bcanton\\b",
    "\\bparish\\b",
    "\\bdistrict (?:in|of)\\b",
    "\\bregion (?:in|of)\\b",
    "\\bstate (?:in|of)\\b",
    "\\bcapital of\\b",
    "\\briver in\\b",
    "\\bmountain in\\b",
    "\\bisland (?:in|of)\\b",
    "\\bcountry in\\b",
    "\\bunincorporated community\\b",
    "national stock exchange",
    "\\bgod of\\b",
    "\\bgoddess of\\b",
    "mythology",
    "language spoken",
    "\\blanguage of\\b",
    "pronunciation spelling",
    "spelling of",
    "progenitor of",
    "first (?:man|woman) ",
    "abrahamism",
    "keyboard layout",
    "station code",
    "\\bthe book of\\b",
    "\\bbook of the bible\\b",
    // Highly technical/specialist scientific fields — real words, but the
    // only "clean" sense being deep jargon makes for a bad casual clue.
    "biochemistry",
    "genetics",
    "immunology",
    "pharmacology",
    "molecular biology",
    "organic chemistry",
    "inorganic chemistry",
    "entomology",
    "mineralogy",
    "crystallography",
    "histology",
    "virology",
    "mycology",
    "enzymology",
    "biophysics",
    "proteomics",
    "genomics",
    "cytology",
    "embryology",
    "endocrinology",
    "herpetology",
    "ichthyology",
    "taxonomy",
    "\\bgenus\\b",
    "\\bspecies of\\b",
  ].join("|"),
  "i"
);

// Extra manual blocklist of specific words/roots to always exclude, as a
// backstop in case a definition doesn't carry a disqualifying tag.
const WORD_BLOCKLIST = new Set([
  "ass",
  "sex",
  "gay",
  "cad",
  "dyke",
  "dike",
  "crap",
  "shit",
  "fuck",
  "cunt",
  "cock",
  "dick",
  "prick",
  "whore",
  "slut",
  "rape",
  "nazi",
  "kill",
  "dead",
  "die",
  "gun",
  "drug",
  "beer",
  "wine",
  "drunk",
  "hell",
  "damn",
  "coa",
  "adam",
  "eve",
  "nat",
  "dug",
  "est",
]);

interface DatamuseWord {
  word: string;
  score: number;
  tags?: string[];
  defs?: string[];
}

// Minimum uses-per-million-words frequency to count as "common enough" for
// a casual solver to reasonably know — filters out obscure jargon/rarities
// that a plain relevance `score` doesn't reliably weed out.
const MIN_FREQUENCY = 2.5;

function frequencyOf(entry: DatamuseWord): number {
  const tag = (entry.tags ?? []).find((t) => t.startsWith("f:"));
  return tag ? parseFloat(tag.slice(2)) : 0;
}

// Grammatical usage tags that are noise for a crossword clue (kept distinct
// from DISQUALIFYING, which excludes the sense entirely rather than just
// trimming a label off it).
const NOISE_TAGS = new RegExp(
  "^\\((?:transitive|intransitive|ditransitive|ambitransitive|reflexive|countable|" +
    "uncountable|countable and uncountable|chiefly transitive|chiefly intransitive|" +
    "usually|especially|figurative|figuratively|literally|by extension|" +
    "chiefly|frequently figurative)[^)]*\\)\\s*",
  "i"
);

function isBalanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function cleanDefinition(raw: string): string | null {
  // Format is "pos\tdefinition text " — strip the POS code.
  const tabIdx = raw.indexOf("\t");
  let text = tabIdx >= 0 ? raw.slice(tabIdx + 1) : raw;
  text = text.trim();
  if (!text) return null;
  if (DISQUALIFYING.test(text)) return null;
  if (DISQUALIFYING.test(raw.slice(0, tabIdx))) return null;

  // Strip a leading generic grammar/usage tag (possibly more than one).
  let stripped = text;
  for (let i = 0; i < 3; i++) {
    const next = stripped.replace(NOISE_TAGS, "");
    if (next === stripped) break;
    stripped = next.trim();
  }
  if (stripped) text = stripped;

  // Keep clues terse — cut at the first sentence boundary, cap length.
  // Sentence-boundary splitting can land mid-parenthetical (e.g. a ';'
  // inside "(use, purpose; not a computer program)"), which would emit
  // text with unbalanced parens — bail out on that rather than truncate badly.
  const firstSentence = text.split(/(?<=[.;])\s/)[0].replace(/[.;]+$/, "");
  let clue = firstSentence.length > 0 ? firstSentence : text;
  if (!isBalanced(clue)) return null;

  // Some Wiktionary entries are a lead-in line for sub-senses listed as
  // separate array entries (e.g. "...or a descendant thereof - especially:"),
  // not a complete definition on its own — reject anything left dangling
  // on a colon/dash.
  if (/[:\-–—]\s*$/.test(clue)) return null;
  if (clue.length < 3 || clue.length > 90) return null;

  clue = clue.charAt(0).toUpperCase() + clue.slice(1);
  return clue;
}

async function fetchLength(length: number, existing: Set<string>): Promise<{ word: string; clue: string }[]> {
  const pattern = "?".repeat(length);
  const url = `https://api.datamuse.com/words?sp=${pattern}&md=df&max=1000`;
  const res = await fetch(url);
  const data: DatamuseWord[] = await res.json();

  const out: { word: string; clue: string }[] = [];
  for (const entry of data) {
    const word = entry.word.toUpperCase();
    if (!/^[A-Z]+$/.test(word)) continue;
    if (word.length !== length) continue;
    if (existing.has(word)) continue;
    if (WORD_BLOCKLIST.has(entry.word.toLowerCase())) continue;
    if (frequencyOf(entry) < MIN_FREQUENCY) continue;

    const defs = entry.defs ?? [];
    let clue: string | null = null;
    for (const def of defs) {
      clue = cleanDefinition(def);
      if (clue) break;
    }
    if (!clue) continue;

    out.push({ word, clue });
  }
  return out;
}

async function main() {
  // Dedupe against the hand-curated words only — not any previously
  // generated batch — so re-running this script re-derives a fresh set
  // instead of only ever finding words it already excluded last time.
  const existing = new Set<string>();
  for (const list of [WORDS_2, WORDS_3, WORDS_4, WORDS_5]) {
    for (const e of list) existing.add(e.word);
  }

  const results: Record<3 | 4 | 5, { word: string; clue: string }[]> = { 3: [], 4: [], 5: [] };
  for (const length of [3, 4, 5] as const) {
    console.log(`Fetching length ${length}...`);
    results[length] = await fetchLength(length, existing);
    results[length].sort((a, b) => a.word.localeCompare(b.word));
    console.log(`  got ${results[length].length} clean candidates`);
  }

  const fileLines: string[] = [];
  fileLines.push("// AUTO-GENERATED — do not hand-edit. Regenerate with scripts/fetch-clues.ts.");
  fileLines.push("// Sourced from the Datamuse API (https://www.datamuse.com/api/), which serves");
  fileLines.push("// Wiktionary definitions. Filtered for length, cleanliness, and commonness, and");
  fileLines.push("// deduplicated against the hand-curated words in wordbank.ts.");
  fileLines.push('import type { WordEntry } from "./wordbank";');
  fileLines.push("");
  for (const length of [3, 4, 5] as const) {
    fileLines.push(`export const GENERATED_WORDS_${length}: WordEntry[] = [`);
    for (const { word, clue } of results[length]) {
      fileLines.push(`  { word: ${JSON.stringify(word)}, clue: ${JSON.stringify(clue)} },`);
    }
    fileLines.push("];");
    fileLines.push("");
  }

  writeFileSync("src/games/crossword/lib/wordbankGenerated.ts", fileLines.join("\n"));
  console.log("Wrote src/games/crossword/lib/wordbankGenerated.ts");
}

main();
