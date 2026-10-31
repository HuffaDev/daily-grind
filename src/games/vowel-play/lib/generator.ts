import { getDailyPuzzleNumber, mulberry32, seedForDateKey } from "@/platform/daily";
import { ClueKind, makeClue, VowelPlayPuzzle } from "./rules";
import { MOVIES, TV_SHOWS } from "./titles";

// Picks each day's titles. All the titles are shuffled into one long deck and
// each day deals the next CLUES_PER_DAY, so nothing repeats until the whole
// list has been used; then the deck is reshuffled for the next round.

export const CLUES_PER_DAY = 10;

interface Entry {
  title: string;
  kind: ClueKind;
}

const ALL: Entry[] = [
  ...MOVIES.map((title) => ({ title, kind: "movie" as const })),
  ...TV_SHOWS.map((title) => ({ title, kind: "tv" as const })),
];

const decks = new Map<number, Entry[]>();

/** The order titles come up in during `round` (one pass through the whole list). */
function deck(round: number): Entry[] {
  let cards = decks.get(round);
  if (!cards) {
    const random = mulberry32(seedForDateKey(`vowel-play:round:${round}`));
    cards = [...ALL];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    decks.set(round, cards);
  }
  return cards;
}

/** The day's titles to guess, and the answers in order. */
export function generateDailyVowelPlay(dateKey: string): { puzzle: VowelPlayPuzzle; solution: string[] } {
  const day = getDailyPuzzleNumber(dateKey) - 1;
  const picked: Entry[] = [];
  // Where one round's deck runs into the next, skip a title already dealt today.
  for (let i = day * CLUES_PER_DAY; picked.length < CLUES_PER_DAY; i++) {
    const round = Math.floor(i / ALL.length);
    const entry = deck(round)[i - round * ALL.length];
    if (!picked.includes(entry)) picked.push(entry);
  }
  const salt = dateKey;
  return {
    puzzle: { salt, clues: picked.map(({ title, kind }) => makeClue(salt, title, kind)) },
    solution: picked.map(({ title }) => title),
  };
}
