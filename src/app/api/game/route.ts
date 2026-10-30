import { applyGameAction, GameAction, GameError } from "@/lib/server/game";
import { sessionFromRequest } from "@/lib/server/session";

const ACTIONS: GameAction[] = ["sync", "progress", "check", "reveal"];

export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    puzzleId?: string;
    action?: GameAction;
    grid?: unknown;
    elapsedSeconds?: unknown;
  };
  if (!body.action || !ACTIONS.includes(body.action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    return Response.json(await applyGameAction(session, body.puzzleId ?? "", body.action, body));
  } catch (err) {
    if (err instanceof GameError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
