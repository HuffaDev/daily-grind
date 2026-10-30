/**
 * Serves Discord avatars from our own origin. The Activity sandbox blocks
 * cdn.discordapp.com, and going through this route avoids needing a separate
 * URL mapping for it. Only avatar paths are allowed, so it can't be used as an
 * open proxy.
 */
const AVATAR_PATH =
  /^(avatars\/\d+\/(a_)?[0-9a-f]+\.png|guilds\/\d+\/users\/\d+\/avatars\/(a_)?[0-9a-f]+\.png|embed\/avatars\/[0-5]\.png)$/;

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!AVATAR_PATH.test(path)) return new Response("Invalid avatar path", { status: 400 });

  const res = await fetch(`https://cdn.discordapp.com/${path}?size=64`);
  if (!res.ok) return new Response("Avatar not found", { status: res.status === 404 ? 404 : 502 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      // The avatar hash is part of the path, so a given URL never changes.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
