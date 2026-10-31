import { after } from "next/server";
import { reportPresence } from "@/bot/playingCard";
import { sessionFromRequest, verifySession } from "@/platform/server/session";

/**
 * The Activity reports here when it opens, when players join or leave, and as
 * it closes, so the bot can keep the channel's "playing" card current. The
 * closing report is a beacon, which can't set headers, so its session comes in
 * the body.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    channelId?: string;
    instanceId?: string;
    leaving?: boolean;
    session?: string;
  };
  const session = sessionFromRequest(req) ?? verifySession(body.session);
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { channelId, instanceId } = body;
  if (typeof channelId !== "string" || typeof instanceId !== "string") {
    return Response.json({ error: "Missing channel or instance" }, { status: 400 });
  }
  after(() => reportPresence(session, channelId, instanceId, body.leaving === true));
  return new Response(null, { status: 204 });
}
