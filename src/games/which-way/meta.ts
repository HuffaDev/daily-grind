import { formatTime } from "@/platform/format";
import type { BoardEntry } from "@/platform/server/store";
import type { GameInfo } from "../types";

export interface WhichWayDetail {
  aimed: number;
  total: number;
  /** Mean error of the aims so far, in degrees. */
  averageError: number;
}

/** Bump whenever the cities or the daily selection in lib/rules.ts change. */
export const PUZZLE_VERSION = 1;

export const whichWay: GameInfo = {
  id: "which-way",
  name: "Which Way",
  tagline: "Aim a compass from one city at five others.",
  icon: "/games/which-way.png",
  emoji: "🧭",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday({ solvedTimeSeconds, detail }: BoardEntry<WhichWayDetail>) {
    if (solvedTimeSeconds !== null) return `✅ ${detail.averageError}° off · ${formatTime(solvedTimeSeconds)}`;
    return `${detail.aimed}/${detail.total} cities`;
  },
};
