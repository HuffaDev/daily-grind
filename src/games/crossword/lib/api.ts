import { DiscordConnection, postGameAction } from "@/platform/discordClient";
import { crossword } from "../meta";
import type { GameAction, GameView } from "../server/game";

export type { GameView };

export function postCrosswordAction(
  conn: DiscordConnection,
  body: { puzzleId: string; action: GameAction; grid?: string[][]; elapsedSeconds?: number; cells?: string[] }
): Promise<{ game: GameView | null; wrongCells?: string[] }> {
  return postGameAction(conn, crossword.id, body);
}
