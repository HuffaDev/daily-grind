import { createSession } from "@/platform/server/session";

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

interface GuildMember {
  nick: string | null;
  avatar: string | null;
}

interface ActivityInstance {
  location?: { channel_id?: string };
  users?: string[];
}

/** Returns true if `userId` is in Activity instance `instanceId` running in `channelId`, else an error message. */
async function verifyInstanceChannel(
  instanceId: string | null | undefined,
  channelId: string,
  userId: string
): Promise<true | string> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return "Leaderboards in DMs are not enabled (DISCORD_BOT_TOKEN is not set)";
  if (!instanceId) return "Missing Activity instance";
  const res = await fetch(
    `${DISCORD_API}/applications/${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}/activity-instances/${encodeURIComponent(instanceId)}`,
    { headers: { Authorization: `Bot ${botToken}` } }
  );
  if (!res.ok) return "Could not verify this Activity";
  const instance = (await res.json()) as ActivityInstance;
  if (instance.location?.channel_id !== channelId || !instance.users?.includes(userId)) {
    return "Not a participant in this Activity";
  }
  return true;
}

/**
 * Completes the Activity's OAuth handshake: exchanges the code from
 * `discordSdk.commands.authorize` for an access token (which needs the client
 * secret, so it must happen here), looks up the player, confirms they belong
 * to the server the Activity was launched in, and issues our game session.
 */
export async function POST(req: Request) {
  const { code, guildId, channelId, instanceId } = (await req.json().catch(() => ({}))) as {
    code?: string;
    guildId?: string | null;
    channelId?: string | null;
    instanceId?: string | null;
  };
  if (!code) return Response.json({ error: "Missing code" }, { status: 400 });

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "",
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!tokenRes.ok) return Response.json({ error: "Token exchange failed" }, { status: 401 });
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const auth = { headers: { Authorization: `Bearer ${access_token}` } };

  const userRes = await fetch(`${DISCORD_API}/users/@me`, auth);
  if (!userRes.ok) return Response.json({ error: "Could not load user" }, { status: 401 });
  const user = (await userRes.json()) as DiscordUser;

  let name = user.global_name ?? user.username;
  let avatarPath = user.avatar ? `avatars/${user.id}/${user.avatar}.png` : null;
  let scope: string;

  if (guildId) {
    // Fails unless the player is actually a member, so nobody can post scores to another server's board.
    const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, auth);
    if (!memberRes.ok) return Response.json({ error: "Not a member of this server" }, { status: 403 });
    const member = (await memberRes.json()) as GuildMember;
    if (member.nick) name = member.nick;
    if (member.avatar) avatarPath = `guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png`;
    scope = `guild:${guildId}`;
  } else if (channelId) {
    // DMs have no membership endpoint usable with the player's token, so ask
    // Discord (as the bot) where this Activity instance actually runs and who is in it.
    const verified = await verifyInstanceChannel(instanceId, channelId, user.id);
    if (verified !== true) return Response.json({ error: verified }, { status: 403 });
    scope = `channel:${channelId}`;
  } else {
    return Response.json({ error: "Missing guild or channel" }, { status: 400 });
  }

  const session = createSession({ userId: user.id, name, avatarPath, scope });
  return Response.json({ access_token, session, user: { id: user.id, name, avatarPath } });
}
