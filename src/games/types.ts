import type { BoardEntry } from "@/platform/server/store";

/**
 * What the hub, the API, the bot and the leaderboards need to know about a
 * game. Keep it light: the hub page and every API route import the registry.
 */
export interface GameInfo {
  /** URL segment and storage namespace, e.g. "crossword" → /crossword. Never change it once released. */
  id: string;
  name: string;
  /** One line for the hub's game card. */
  tagline: string;
  emoji: string;
  /**
   * Bump whenever the puzzle a given date produces changes. Puzzle ids embed
   * it (see getPuzzleId), so saved games and boards from the old version are
   * set aside instead of mixing with the new puzzle.
   */
  puzzleVersion: number;
  /**
   * A player's stats on today's board besides their points, from the game's
   * own `detail`, e.g. "✅ 1:23" or "3/10 words". Shown in the Activity and by the bot.
   */
  summarizeToday(entry: BoardEntry): string;
}
