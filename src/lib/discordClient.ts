import type { DiscordSDK } from "@discord/embedded-app-sdk";
import type { GameAction, GameView } from "./server/game";
import type { AllTimeEntry } from "./server/allTime";
import type { BoardEntry } from "./server/store";

export type { AllTimeEntry, BoardEntry, GameView };

export interface DiscordUserInfo {
  id: string;
  name: string;
  avatarPath: string | null;
}

export interface DiscordConnection {
  sdk: DiscordSDK;
  /** Signed game session from /api/token, sent as a bearer token to the game API. Replaced when it expires. */
  session: string;
  user: DiscordUserInfo;
}

/** Discord launches Activities with these query params; their absence means a plain browser visit. */
export function isInDiscord(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("frame_id");
}

let connecting: Promise<DiscordConnection> | null = null;

/** Runs the SDK handshake and OAuth exchange once per page load; later callers share the result. */
export function connectDiscord(): Promise<DiscordConnection> {
  connecting ??= (async () => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    if (!clientId) throw new Error("NEXT_PUBLIC_DISCORD_CLIENT_ID is not set");

    // Imported lazily: the SDK touches window at load and is dead weight outside Discord.
    const { DiscordSDK } = await import("@discord/embedded-app-sdk");
    const sdk = new DiscordSDK(clientId);
    await sdk.ready();

    const data = await signIn(sdk, clientId);
    await sdk.commands.authenticate({ access_token: data.access_token });
    return { sdk, session: data.session, user: data.user };
  })();
  connecting.catch(() => {
    connecting = null;
  });
  return connecting;
}

/** Gets an OAuth code from Discord and trades it for our game session. */
async function signIn(sdk: DiscordSDK, clientId: string) {
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    // No consent screen once the player has approved the app.
    prompt: "none",
    scope: ["identify", "guilds.members.read"],
  });
  const res = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, guildId: sdk.guildId, channelId: sdk.channelId, instanceId: sdk.instanceId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Sign-in failed (${res.status})`);
  return data as { access_token: string; session: string; user: DiscordUserInfo };
}

let renewing: Promise<void> | null = null;

/** Replaces an expired game session; concurrent callers share one renewal. */
function renewSession(conn: DiscordConnection): Promise<void> {
  renewing ??= signIn(conn.sdk, conn.sdk.clientId)
    .then((data) => {
      conn.session = data.session;
    })
    .finally(() => {
      renewing = null;
    });
  return renewing;
}

export class GameApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(conn: DiscordConnection, path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${conn.session}`, ...init?.headers },
  });
  // Sessions expire (see SESSION_TTL_SECONDS); renew once and retry rather than failing silently.
  if (res.status === 401 && !retried) {
    await renewSession(conn);
    return request(conn, path, init, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GameApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export function postGameAction(
  conn: DiscordConnection,
  body: { puzzleId: string; action: GameAction; grid?: string[][]; elapsedSeconds?: number; cells?: string[] }
): Promise<{ game: GameView | null; wrongCells?: string[] }> {
  return request(conn, "/api/game", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchLeaderboard(conn: DiscordConnection, puzzleId: string): Promise<BoardEntry[]> {
  const data = await request<{ entries: BoardEntry[] }>(
    conn,
    `/api/leaderboard?puzzleId=${encodeURIComponent(puzzleId)}`
  );
  return data.entries;
}

export async function fetchAllTimeLeaderboard(conn: DiscordConnection): Promise<AllTimeEntry[]> {
  const data = await request<{ entries: AllTimeEntry[] }>(conn, "/api/leaderboard/all-time");
  return data.entries;
}

/**
 * Avatar images live on cdn.discordapp.com, which the Activity sandbox can't
 * reach directly, so they are fetched through our own /api/avatar route.
 */
export function avatarUrl(userId: string, avatarPath: string | null): string {
  const defaultIndex = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
  const path = avatarPath ?? `embed/avatars/${defaultIndex}.png`;
  return `/api/avatar?path=${encodeURIComponent(path)}`;
}
