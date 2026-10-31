import { getUtcDateKey } from "@/platform/daily";
import { GAMES, type GameInfo } from "@/games/registry";
import { resolveActivePuzzle } from "./games";
import { AllTimeEntry, allTimeStandings, compareEntries, GlobalEntry, globalStandings } from "./standings";
import { BoardEntry, getStore } from "./store";

// Boards belong to a scope: "guild:<id>" for a server, "channel:<id>" for a DM
// (see Session.scope). The Activity passes the player's session scope; the bot
// passes the server its command came from.

/** A scope's board for one of `game`'s active puzzles, best first. */
export async function getDailyBoard(scope: string, game: GameInfo, puzzleId: string): Promise<BoardEntry[]> {
  resolveActivePuzzle(game, puzzleId);
  const entries = await getStore().getBoard(game.id, puzzleId, scope);
  return entries.sort(compareEntries);
}

export async function getAllTimeBoard(scope: string, game: GameInfo): Promise<AllTimeEntry[]> {
  return allTimeStandings(await getStore().getAllBoards(game.id, scope), getUtcDateKey());
}

/** Standings across every game on a scope. */
export async function getGlobalBoard(scope: string): Promise<GlobalEntry[]> {
  const store = getStore();
  const boards = await Promise.all(GAMES.map((game) => store.getAllBoards(game.id, scope)));
  return globalStandings(Object.fromEntries(GAMES.map((game, i) => [game.id, boards[i]])), getUtcDateKey());
}
