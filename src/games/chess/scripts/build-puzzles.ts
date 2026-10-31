// Builds data/puzzles.json, the bank the daily puzzles are drawn from, out of
// the Lichess puzzle database (CC0, https://database.lichess.org/#puzzles).
// Run from the repo root with the downloaded file:
//
//   bun src/games/chess/scripts/build-puzzles.ts path/to/lichess_db_puzzle.csv.zst
//
// Never run at build or runtime. Rebuilding changes which puzzle a date gets,
// so bump PUZZLE_VERSION in meta.ts afterwards.

import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createZstdDecompress } from "node:zlib";
import { Chess } from "chess.js";
import { mulberry32 } from "@/platform/daily";
import { TIERS } from "../lib/types";

/** Puzzles kept per tier: one a day, so this many days before the bank repeats. */
const PER_TIER = 1500;
const MIN_PLAYS = 1000;
const MIN_POPULARITY = 85;
const MAX_RATING_DEVIATION = 80;
/** Longest solution, in the player's own moves. */
const MAX_PLAYER_MOVES = 4;

const input = process.argv[2];
if (!input) {
  console.error("Usage: bun src/games/chess/scripts/build-puzzles.ts <lichess_db_puzzle.csv.zst>");
  process.exit(1);
}

const candidates: string[][] = TIERS.map(() => []);
const lines = createInterface({ input: createReadStream(input).pipe(createZstdDecompress()), crlfDelay: Infinity });
let read = 0;
for await (const line of lines) {
  if (read++ === 0) continue; // header
  // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
  const [id, fen, moves, rating, deviation, popularity, plays, themes] = line.split(",");
  const tier = TIERS.findIndex((t) => Number(rating) >= t.minRating && Number(rating) <= t.maxRating);
  if (tier < 0) continue;
  if (Number(plays) < MIN_PLAYS || Number(popularity) < MIN_POPULARITY) continue;
  if (Number(deviation) > MAX_RATING_DEVIATION) continue;
  const plies = moves.split(" ").length;
  if (plies < 2 || plies > 2 * MAX_PLAYER_MOVES) continue;
  const mate = /\bmateIn(\d)\b/.exec(themes)?.[1] ?? "0";
  candidates[tier].push([id, fen, moves, rating, mate].join(","));
}
console.log(`Read ${read - 1} puzzles; candidates per tier: ${candidates.map((c) => c.length).join(" / ")}`);

/** Every move of the solution must be legal, or the board would get stuck. */
function playable(row: string): boolean {
  const [, fen, moves] = row.split(",");
  try {
    const chess = new Chess(fen);
    for (const uci of moves.split(" ")) {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    return true;
  } catch {
    return false;
  }
}

const random = mulberry32(20261031);
const tiers = candidates.map((rows) => {
  // Sorted first so the result doesn't depend on the order the database lists puzzles in.
  rows.sort();
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.filter(playable).slice(0, PER_TIER);
});

const out = new URL("../data/puzzles.json", import.meta.url);
await mkdir(new URL(".", out), { recursive: true });
await writeFile(out, JSON.stringify(tiers, null, 0).replaceAll('","', '",\n"').replaceAll("],[", "],\n[") + "\n");
console.log(`Wrote ${tiers.map((t) => t.length).join(" / ")} puzzles to ${fileURLToPath(out)}`);
