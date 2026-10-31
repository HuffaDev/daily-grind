import { DiscordConnection, GameApiError, postGameAction } from "@/platform/discordClient";
import { chess } from "../meta";
import type { GameAction, GameView } from "../server/game";
import { ChessPuzzle, PuzzleProgress } from "./types";

export type { GameView };

export async function fetchDailyPuzzles(puzzleId: string): Promise<ChessPuzzle[]> {
  const res = await fetch(`/api/games/chess/puzzles?${new URLSearchParams({ puzzleId })}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GameApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data.puzzles;
}

export function postChessAction(
  conn: DiscordConnection,
  body: { puzzleId: string; action: GameAction; puzzles?: PuzzleProgress[]; elapsedSeconds?: number }
): Promise<{ game: GameView | null }> {
  return postGameAction(conn, chess.id, body);
}
