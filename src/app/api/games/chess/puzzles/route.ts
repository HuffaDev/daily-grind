import { activePuzzles } from "@/games/chess/server/game";
import { gameErrorResponse } from "@/platform/server/games";

/** The day's chess puzzles: ?puzzleId=<id>. No sign-in needed, so the game also works outside Discord. */
export async function GET(req: Request) {
  try {
    return Response.json({ puzzles: activePuzzles(new URL(req.url).searchParams.get("puzzleId")) });
  } catch (err) {
    return gameErrorResponse(err);
  }
}
