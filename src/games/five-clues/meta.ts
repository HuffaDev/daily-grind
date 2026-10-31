import { formatTime } from "@/platform/format";
import type { BoardEntry } from "@/platform/server/store";
import type { GameInfo } from "../types";

export interface FiveCluesDetail {
  /** Puzzles finished so far. */
  played: number;
  found: number;
  total: number;
  /** Clues used on the finished puzzles. */
  clues: number;
}

/** Bump whenever the puzzles or the daily selection in lib/ change. */
export const PUZZLE_VERSION = 1;

export const fiveClues: GameInfo = {
  id: "five-clues",
  name: "Five Clues",
  tagline: "A person, a country and an animal. Guess each in as few clues as you can.",
  icon: "/games/five-clues.png",
  emoji: "🔎",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday({ solvedTimeSeconds, detail }: BoardEntry<FiveCluesDetail>) {
    if (solvedTimeSeconds !== null) return `✅ ${detail.clues} clues · ${formatTime(solvedTimeSeconds)}`;
    return `${detail.found}/${detail.total} found · ${detail.clues} clues`;
  },
};
