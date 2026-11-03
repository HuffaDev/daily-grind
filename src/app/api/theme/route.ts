import { sessionFromRequest } from "@/platform/server/session";
import { getStore } from "@/platform/server/store";

/** The player's saved light/dark choice, so it follows them between Activity launches. */
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({ theme: await getStore().getTheme(session.userId) });
}

export async function PUT(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { theme } = (await req.json().catch(() => ({}))) as { theme?: unknown };
  if (theme !== "light" && theme !== "dark") {
    return Response.json({ error: "Theme must be light or dark" }, { status: 400 });
  }
  await getStore().setTheme(session.userId, theme);
  return new Response(null, { status: 204 });
}
