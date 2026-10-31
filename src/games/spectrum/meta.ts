import type { BoardEntry } from "@/platform/server/store";
import type { GameInfo } from "../types";

/** Bump whenever lib/rounds.ts changes the rounds a date gets. */
export const PUZZLE_VERSION = 1;

export const spectrum: GameInfo = {
  id: "spectrum",
  name: "Spectrum",
  tagline: "Place three things on a scale. Score by matching your server.",
  icon: "/games/spectrum.png",
  emoji: "🎚️",
  puzzleVersion: PUZZLE_VERSION,
  summarizeToday: ({ detail }: BoardEntry<{ averageMiss: number }>) => `🎯 off by ${detail.averageMiss}`,
};
