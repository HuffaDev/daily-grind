import { commonWords, dictionaryWords } from "@/games/shared/words/words";
import { mulberry32, seedForDateKey } from "@/platform/daily";
import { LadderPuzzle, lettersApart, WORD_LENGTH } from "./rules";

// Builds the day's ladder on the server, from common words only, so the
// start, the target and the par route are all words people know. Players may
// still step through any word in the dictionary.

/** Par by weekday, Sunday first: short early in the week, longest at the weekend. */
const PAR_BY_WEEKDAY = [6, 4, 4, 5, 5, 5, 6];

/** Each common word's neighbours: common words one letter away. */
function neighbours(words: string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>(words.map((w) => [w, []]));
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (lettersApart(words[i], words[j]) === 1) {
        graph.get(words[i])!.push(words[j]);
        graph.get(words[j])!.push(words[i]);
      }
    }
  }
  return graph;
}

/** Shortest routes from `start`: each reachable word's previous word on one. */
function shortestFrom(graph: Map<string, string[]>, start: string): Map<string, { from: string | null; steps: number }> {
  const seen = new Map<string, { from: string | null; steps: number }>([[start, { from: null, steps: 0 }]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const word = queue[i];
    for (const next of graph.get(word)!) {
      if (seen.has(next)) continue;
      seen.set(next, { from: word, steps: seen.get(word)!.steps + 1 });
      queue.push(next);
    }
  }
  return seen;
}

let graph: Map<string, string[]> | null = null;

/** The day's ladder, and its par route (the words after the start). */
export function generateDailyLadder(dateKey: string): { puzzle: LadderPuzzle; solution: string[] } {
  graph ??= neighbours(commonWords(WORD_LENGTH));
  const random = mulberry32(seedForDateKey(dateKey));
  const [y, m, d] = dateKey.split("-").map(Number);
  const par = PAR_BY_WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const starts = [...graph.keys()].sort();

  // Most common words reach plenty of others at any par; a few are islands.
  for (;;) {
    const start = starts[Math.floor(random() * starts.length)];
    const routes = shortestFrom(graph, start);
    const targets = [...routes].filter(([, r]) => r.steps === par).map(([word]) => word);
    if (targets.length === 0) continue;
    const target = targets[Math.floor(random() * targets.length)];
    const solution: string[] = [];
    for (let word: string | null = target; word !== start; word = routes.get(word!)!.from) solution.unshift(word!);
    return { puzzle: { start, target, par, words: dictionaryWords(WORD_LENGTH) }, solution };
  }
}
