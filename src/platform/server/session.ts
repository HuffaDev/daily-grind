import { createHmac, timingSafeEqual } from "node:crypto";

// A small signed token we hand the client after the Discord OAuth exchange.
// It records who the player is and which leaderboard they belong to, so the
// game API can trust those facts without re-asking Discord on every request.

export interface Session {
  userId: string;
  name: string;
  /** Path under cdn.discordapp.com, e.g. "avatars/<user>/<hash>.png", or null for the default avatar. */
  avatarPath: string | null;
  /** Leaderboard partition: "guild:<id>" for servers, "channel:<id>" for DMs / group DMs. */
  scope: string;
  exp: number;
}

const SESSION_TTL_SECONDS = 12 * 60 * 60;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(fields: Omit<Session, "exp">): string {
  const session: Session = { ...fields, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | null | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (session.exp < Date.now() / 1000) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionFromRequest(req: Request): Session | null {
  const header = req.headers.get("authorization");
  return verifySession(header?.startsWith("Bearer ") ? header.slice(7) : null);
}
