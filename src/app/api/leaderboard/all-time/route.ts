import { getAllTimeLeaderboard } from "@/lib/server/game";
import { sessionFromRequest } from "@/lib/server/session";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({ entries: await getAllTimeLeaderboard(session) });
}
