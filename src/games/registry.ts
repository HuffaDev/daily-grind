import { chess } from "./chess/meta";
import { crossword } from "./crossword/meta";
import type { GameInfo } from "./types";

export type { GameInfo };

/** Every game, in the order the hub lists them. Adding a game? See "Adding a game" in the README. */
export const GAMES: readonly GameInfo[] = [crossword, chess];

export function getGame(id: unknown): GameInfo | null {
  return GAMES.find((game) => game.id === id) ?? null;
}
