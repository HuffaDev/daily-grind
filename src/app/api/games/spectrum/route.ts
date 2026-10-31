import { applySpectrumAction, GameAction } from "@/games/spectrum/server/game";
import { gameErrorResponse } from "@/platform/server/games";
import { sessionFromRequest } from "@/platform/server/session";

const ACTIONS: GameAction[] = ["sync", "submit"];

export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    puzzleId?: string;
    action?: GameAction;
    marks?: unknown;
    elapsedSeconds?: unknown;
  };
  if (!body.action || !ACTIONS.includes(body.action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    return Response.json(await applySpectrumAction(session, body.puzzleId ?? "", body.action, body));
  } catch (err) {
    return gameErrorResponse(err);
  }
}
