import { formatTime } from "@/platform/format";
import type { BoardEntry } from "@/platform/server/store";
import type { GameInfo } from "../types";
import type { CrosswordBoardDetail } from "./lib/types";

/**
 * Bump whenever the word bank, block patterns, or generator logic change.
 * The generated puzzle depends on all of them, so a change silently alters
 * the day's puzzle — the version keeps saved progress and leaderboards from
 * mixing grids from different builds.
 */
export const PUZZLE_VERSION = 1;

export const crossword: GameInfo = {
  id: "crossword",
  name: "Mini Crossword",
  tagline: "A 5×5 crossword, new every day.",
  icon: "/games/crossword.png",
  emoji: "📝",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday({ solvedTimeSeconds, detail }: BoardEntry<CrosswordBoardDetail>) {
    if (solvedTimeSeconds !== null) return `✅ ${formatTime(solvedTimeSeconds)}`;
    if (detail.revealed) return `🔎 ${detail.wordsSolved}/${detail.totalWords}`;
    return `${detail.wordsSolved}/${detail.totalWords} words`;
  },
};
