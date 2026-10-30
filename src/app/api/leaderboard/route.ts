import { GameError, getLeaderboard } from "@/lib/server/game";
import { sessionFromRequest } from "@/lib/server/session";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const puzzleId = new URL(req.url).searchParams.get("puzzleId") ?? "";
  try {
    return Response.json({ entries: await getLeaderboard(session, puzzleId) });
  } catch (err) {
    if (err instanceof GameError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
