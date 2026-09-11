import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
import * as authTables from "../packages/db/src/auth-schema";
import {
  betterAuthentication,
  supabaseAuthentication,
} from "../packages/adapters/src/auth";
import { configuration } from "../packages/backend/src/config";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
describe("authentication adapters", () => {
  it("validates Better Auth sessions through Drizzle and rejects tampered cookies", async () => {
    const f = await fixture();
    cleanups.push(f.close);
    const id = crypto.randomUUID(),
      token = crypto.randomUUID();
    await f.db
      .insert(authTables.user)
      .values({
        id,
        name: "Auth test",
        email: `${id}@example.test`,
        emailVerified: true,
      });
    cleanups.push(async () => {
      await f.db.delete(authTables.user).where(eq(authTables.user.id, id));
    });
    await f.db
      .insert(authTables.session)
      .values({
        id: crypto.randomUUID(),
        userId: id,
        token,
        expiresAt: new Date(Date.now() + 3600_000),
      });
    const auth = betterAuthentication(f.services.config, f.db);
    const signed = encodeURIComponent(
      `${token}.${createHmac("sha256", f.services.config.AUTH_SECRET).update(token).digest("base64")}`,
    );
    const request = new Request("http://localhost:5173/api/session", {
      headers: { cookie: `pm-1.session_token=${signed}` },
    });
    expect(await auth.identity(request, new Headers())).toMatchObject({
      issuer: "better-auth",
      subject: id,
      name: "Auth test",
    });
    const bad = new Request(request.url, {
      headers: { cookie: `pm-1.session_token=${signed}tampered` },
    });
    expect(await auth.identity(bad, new Headers())).toBeNull();
    const rotated = betterAuthentication(
      { ...f.services.config, AUTH_SESSION_VERSION: "2" },
      f.db,
    );
    expect(await rotated.identity(request, new Headers())).toBeNull();
  });
  it("uses Supabase PKCE cookies, verifies the user with the auth provider, and preserves issuer identity", async () => {
    const f = await fixture();
    cleanups.push(f.close);
    const config = {
      ...f.services.config,
      AUTH_PROVIDER: "supabase" as const,
      SUPABASE_AUTH_URL: "https://auth.example.test",
      SUPABASE_AUTH_KEY: "test-publishable-key",
    };
    const id = crypto.randomUUID();
    const user = {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: "test@example.test",
      app_metadata: { provider: "github" },
      user_metadata: { name: "Supabase test" },
      created_at: new Date().toISOString(),
    };
    const http = vi.fn<typeof fetch>().mockResolvedValue(Response.json(user));
    const auth = supabaseAuthentication(config, http);
    const value =
      "base64-" +
      Buffer.from(
        JSON.stringify({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ).toString("base64url");
    const request = new Request("http://localhost:5173/api/session", {
      headers: { cookie: `pm-supabase-1=${value}` },
    });
    expect(await auth.identity(request, new Headers())).toMatchObject({
      issuer: config.SUPABASE_AUTH_URL,
      subject: id,
      name: "Supabase test",
    });
    expect(String(http.mock.calls[0][0])).toContain("/auth/v1/user");
    const login = await auth.login(
      new Request("http://localhost:5173/api/session/login"),
    );
    const data = (await login.json()) as { url: string };
    expect(data.url).toContain("provider=github");
    expect(data.url).toContain("code_challenge=");
    expect(login.headers.getSetCookie().join("")).toContain("HttpOnly");
    const rotated = supabaseAuthentication(
      { ...config, AUTH_SESSION_VERSION: "2" },
      http,
    );
    expect(await rotated.identity(request, new Headers())).toBeNull();
  });
  it("rejects SMTP configuration on Cloudflare and invalid encryption keys", async () => {
    const f = await fixture();
    cleanups.push(f.close);
    const input = {
      ...f.services.config,
      ENCRYPTION_KEYS: JSON.stringify(f.services.config.ENCRYPTION_KEYS),
      EMAIL_PROVIDER: "smtp",
      SMTP_URL: "smtp://localhost:1025",
    };
    expect(() => configuration(input, "cloudflare")).toThrow(/SMTP/);
    expect(() =>
      configuration({ ...input, ENCRYPTION_KEYS: "{}" }, "node"),
    ).toThrow(/encryption key/);
  });
});
