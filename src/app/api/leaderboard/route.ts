import { getGame } from "@/games/registry";
import { gameErrorResponse } from "@/platform/server/games";
import { getDailyBoard } from "@/platform/server/leaderboard";
import { sessionFromRequest } from "@/platform/server/session";

/** A game's board for one puzzle on the player's server: ?game=<id>&puzzleId=<id>. */
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const game = getGame(params.get("game"));
  if (!game) return Response.json({ error: "Unknown game" }, { status: 404 });
  try {
    return Response.json({ entries: await getDailyBoard(session.scope, game, params.get("puzzleId") ?? "") });
  } catch (err) {
    return gameErrorResponse(err);
  }
}
