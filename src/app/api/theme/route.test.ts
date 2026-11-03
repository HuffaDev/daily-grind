import { describe, expect, it } from "bun:test";
import { createSession } from "@/platform/server/session";
import { GET, PUT } from "./route";

const signedIn = (userId: string, init?: RequestInit) =>
  new Request("http://test/api/theme", {
    ...init,
    headers: {
      Authorization: `Bearer ${createSession({ userId, name: "Player", avatarPath: null, scope: "guild:1" })}`,
    },
  });
const put = (userId: string, theme: unknown) => signedIn(userId, { method: "PUT", body: JSON.stringify({ theme }) });
const themeOf = async (userId: string) => (await (await GET(signedIn(userId))).json()).theme;

describe("/api/theme", () => {
  it("has no theme until the player picks one", async () => {
    expect(await themeOf("never-picked")).toBeNull();
  });

  it("returns the player's latest choice, and only to that player", async () => {
    expect((await PUT(put("a", "light"))).status).toBe(204);
    expect(await themeOf("a")).toBe("light");
    expect(await themeOf("b")).toBeNull();

    await PUT(put("a", "dark"));
    expect(await themeOf("a")).toBe("dark");
  });

  it("rejects anything but light or dark", async () => {
    await PUT(put("c", "light"));
    expect((await PUT(put("c", "blue"))).status).toBe(400);
    expect(await themeOf("c")).toBe("light");
  });

  it("requires a session", async () => {
    const anonymous = new Request("http://test/api/theme", { method: "PUT", body: '{"theme":"dark"}' });
    expect((await GET(anonymous)).status).toBe(401);
    expect((await PUT(anonymous)).status).toBe(401);
  });
});
