import { formatTime } from "@/platform/format";
import type { BoardEntry } from "@/platform/server/store";
import type { GameInfo } from "../types";
import type { ChessBoardDetail } from "./lib/types";

/**
 * Bump whenever data/puzzles.json, the tiers, or the daily selection in
 * lib/puzzles.ts change: any of them changes which puzzles a date gets, and the
 * version keeps saved progress and leaderboards from mixing the two.
 */
export const PUZZLE_VERSION = 1;

export const chess: GameInfo = {
  id: "chess",
  name: "Daily Chess",
  tagline: "Three chess puzzles a day, easy to hard.",
  icon: "/games/chess.png",
  emoji: "♟️",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday({ solvedTimeSeconds, detail }: BoardEntry<ChessBoardDetail>) {
    const mistakes = detail.mistakes > 0 ? ` · ${detail.mistakes}✗` : "";
    if (solvedTimeSeconds !== null) return `✅ ${formatTime(solvedTimeSeconds)}${mistakes}`;
    if (detail.revealed > 0) return `🔎 ${detail.solved}/${detail.total}${mistakes}`;
    return `${detail.solved}/${detail.total} puzzles${mistakes}`;
  },
};
