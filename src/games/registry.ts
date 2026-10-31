import { chess } from "./chess/meta";
import { anagramChain } from "./anagram-chain/meta";
import { crossword } from "./crossword/meta";
import { heist } from "./heist/meta";
import { ladder } from "./ladder/meta";
import { pictureLogic } from "./picture-logic/meta";
import { spectrum } from "./spectrum/meta";
import { sudoku } from "./sudoku/meta";
import { vowelPlay } from "./vowel-play/meta";
import type { GameInfo } from "./types";

export type { GameInfo };

/** Every game, in the order the hub lists them. Adding a game? See "Adding a game" in the README. */
export const GAMES: readonly GameInfo[] = [crossword, chess, sudoku, pictureLogic, ladder, anagramChain, spectrum, heist, vowelPlay];

export function getGame(id: unknown): GameInfo | null {
  return GAMES.find((game) => game.id === id) ?? null;
}
