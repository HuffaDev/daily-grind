// The small slice of the Discord API the bot uses: interaction payloads,
// request signatures, and REST calls made as the bot.

export const DISCORD_API = "https://discord.com/api/v10";

export const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3 } as const;
export const ResponseType = { PONG: 1, CHANNEL_MESSAGE: 4, LAUNCH_ACTIVITY: 12 } as const;
/** Command types: the Activity's Entry Point ("Launch") command, and who handles it. */
export const CommandType = { ENTRY_POINT: 4 } as const;
export const EntryPointHandler = { APP_HANDLER: 1 } as const;
export const MessageFlags = { EPHEMERAL: 1 << 6 } as const;
export const OptionType = { SUB_COMMAND: 1, STRING: 3, CHANNEL: 7 } as const;
export const ChannelType = { GUILD_TEXT: 0, GUILD_ANNOUNCEMENT: 5 } as const;
/** Permission bits, as Discord's API takes them (a decimal string). */
export const Permission = { MANAGE_GUILD: 1 << 5 } as const;
/** Command `contexts`: where a command can be used. */
export const InteractionContext = { GUILD: 0 } as const;
/** Command `integration_types`: installed to a server (not to a user). */
export const IntegrationType = { GUILD_INSTALL: 0 } as const;

export interface CommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: CommandOption[];
}

export interface DiscordUser {
  id: string;
  username: string;
  /** Display name, if the user set one. */
  global_name?: string | null;
}

export interface Interaction {
  /** A snowflake, so it also says when the interaction happened. */
  id: string;
  application_id: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  /** Who sent it, in a server; outside one, `user` instead. */
  member?: { nick?: string | null; user: DiscordUser };
  user?: DiscordUser;
  data?: {
    /** Slash command name. */
    name?: string;
    /** Command type; ENTRY_POINT for the Activity's "Launch" command. */
    type?: number;
    options?: CommandOption[];
    /** Button id, for message components. */
    custom_id?: string;
  };
}

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}

export interface MessageBody {
  content?: string;
  embeds?: Embed[];
  components?: unknown[];
  flags?: number;
  allowed_mentions?: { parse: string[] };
}

export type InteractionResponse =
  | { type: typeof ResponseType.PONG | typeof ResponseType.LAUNCH_ACTIVITY }
  | { type: typeof ResponseType.CHANNEL_MESSAGE; data: MessageBody };

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * Checks Discord's Ed25519 signature on an interaction request, against the
 * app's public key (DISCORD_PUBLIC_KEY). Discord rejects an endpoint that
 * accepts unsigned requests, and anyone could otherwise send fake commands.
 */
export async function verifyInteraction(req: Request, rawBody: string): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!publicKey || !signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(timestamp + rawBody));
  } catch {
    // A malformed public key; treat as unverifiable rather than crashing the endpoint.
    return false;
  }
}

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    /** Discord's JSON error code, e.g. 10003 Unknown Channel or 50001 Missing Access. */
    readonly code: number | undefined,
    message: string
  ) {
    super(message);
  }
}

/** Calls the Discord REST API as the bot (DISCORD_BOT_TOKEN). */
export async function botRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new DiscordApiError(res.status, data?.code, `Discord API ${path} failed: ${res.status} ${data?.message ?? ""}`);
  }
  return data as T;
}

export function sendMessage(channelId: string, message: MessageBody): Promise<unknown> {
  return botRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify(message) });
}

/** Escapes Discord markdown in user-chosen text such as nicknames, so it shows as typed. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>#[\]()-])/g, "\\$1");
}
