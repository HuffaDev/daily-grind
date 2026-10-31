import { getGlobalBoard } from "@/platform/server/leaderboard";
import { sessionFromRequest } from "@/platform/server/session";

/** Standings across every game on the player's server. */
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({ entries: await getGlobalBoard(session.scope) });
}
