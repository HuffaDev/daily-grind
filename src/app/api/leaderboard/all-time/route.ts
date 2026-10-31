import { getGame } from "@/games/registry";
import { getAllTimeBoard } from "@/platform/server/leaderboard";
import { sessionFromRequest } from "@/platform/server/session";

/** A game's all-time standings on the player's server: ?game=<id>. */
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const game = getGame(new URL(req.url).searchParams.get("game"));
  if (!game) return Response.json({ error: "Unknown game" }, { status: 404 });
  return Response.json({ entries: await getAllTimeBoard(session.scope, game) });
}
