import type { BoardEntry } from "@/platform/server/store";
import { formatTime } from "@/platform/format";
import type { StepBoardDetail } from "@/platform/stepGame/rules";
import type { GameInfo } from "../types";

/**
 * Bump whenever the puzzle a date produces changes: adding or removing titles
 * in lib/titles.ts, or changing how lib/generator.ts deals them or lib/rules.ts strips them.
 */
export const PUZZLE_VERSION = 1;

export const vowelPlay: GameInfo = {
  id: "vowel-play",
  name: "Vowel Play",
  tagline: "Name the films and TV shows with their vowels missing.",
  icon: "/games/vowel-play.png",
  emoji: "🎬",
  puzzleVersion: PUZZLE_VERSION,
  // `done` counts titles guessed right, out of the day's ten.
  summarizeToday({ solvedTimeSeconds, detail }: BoardEntry<StepBoardDetail>) {
    if (solvedTimeSeconds !== null) return `✅ ${formatTime(solvedTimeSeconds)} · ${detail.done}/${detail.total}`;
    if (detail.gaveUp) return `🏳️ ${detail.done}/${detail.total}`;
    return `${detail.done}/${detail.total}`;
  },
};
