import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { Identity } from "../../core/src/model";
import type { Config } from "../../backend/src/config";
import type { Database } from "../../db/src/client";
import * as authSchema from "../../db/src/auth-schema";
export interface Authentication {
  enabled: boolean;
  identity(request: Request, headers: Headers): Promise<Identity | null>;
  login(request: Request): Promise<Response>;
  logout(request: Request): Promise<Response>;
  handle(request: Request): Promise<Response>;
}
export function betterAuthentication(
  config: Config,
  db: Database,
): Authentication {
  const enabled = !!(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
  const auth = betterAuth({
    appName: "Product Monitor",
    baseURL: config.PUBLIC_URL,
    basePath: "/api/auth",
    secret: config.AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    socialProviders: enabled
      ? {
          github: {
            clientId: config.GITHUB_CLIENT_ID!,
            clientSecret: config.GITHUB_CLIENT_SECRET!,
          },
        }
      : {},
    advanced: { cookiePrefix: `pm-${config.AUTH_SESSION_VERSION}` },
    trustedOrigins: [config.PUBLIC_URL],
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database" },
    logger: { disabled: true },
  });
  return {
    enabled,
    async identity(request) {
      const session = await auth.api.getSession({ headers: request.headers });
      return session
        ? {
            issuer: "better-auth",
            subject: session.user.id,
            name: session.user.name,
            email: session.user.email,
          }
        : null;
    },
    async login(request) {
      if (!enabled)
        return Response.json(
          { error: "github_login_not_configured" },
          { status: 503 },
        );
      return auth.api.signInSocial({
        body: {
          provider: "github",
          callbackURL: config.PUBLIC_URL,
          disableRedirect: true,
        },
        headers: request.headers,
        asResponse: true,
      });
    },
    logout(request) {
      return auth.api.signOut({ headers: request.headers, asResponse: true });
    },
    handle(request) {
      return auth.handler(request);
    },
  };
}
export function supabaseAuthentication(
  config: Config,
  http: typeof fetch = fetch,
): Authentication {
  function client(request: Request, headers: Headers) {
    return createServerClient(
      config.SUPABASE_AUTH_URL!,
      config.SUPABASE_AUTH_KEY!,
      {
        global: { fetch: http },
        cookieOptions: {
          name: `pm-supabase-${config.AUTH_SESSION_VERSION}`,
          path: "/",
          sameSite: "lax",
          secure: config.PUBLIC_URL.startsWith("https:"),
          httpOnly: true,
        },
        cookies: {
          getAll() {
            return parseCookieHeader(request.headers.get("cookie") ?? "").map(
              (cookie) => ({ name: cookie.name, value: cookie.value ?? "" }),
            );
          },
          setAll(cookies) {
            for (const cookie of cookies)
              headers.append(
                "Set-Cookie",
                serializeCookieHeader(
                  cookie.name,
                  cookie.value,
                  cookie.options,
                ),
              );
          },
        },
      },
    );
  }
  return {
    enabled: true,
    async identity(request, headers) {
      const { data, error } = await client(request, headers).auth.getUser();
      if (error || !data.user) return null;
      return {
        issuer: config.SUPABASE_AUTH_URL!,
        subject: data.user.id,
        name: data.user.user_metadata?.name ?? "Member",
        email: data.user.email,
      };
    },
    async login(request) {
      const headers = new Headers();
      const { data, error } = await client(
        request,
        headers,
      ).auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${config.PUBLIC_URL}/api/auth/callback`,
          skipBrowserRedirect: true,
        },
      });
      return Response.json(
        error ? { error: "login_failed" } : { url: data.url },
        { status: error ? 502 : 200, headers },
      );
    },
    async logout(request) {
      const headers = new Headers();
      await client(request, headers).auth.signOut({ scope: "local" });
      return Response.json({ success: true }, { headers });
    },
    async handle(request) {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      if (url.pathname !== "/api/auth/callback" || !code)
        return Response.json({ error: "invalid_callback" }, { status: 400 });
      const headers = new Headers();
      const { error } = await client(
        request,
        headers,
      ).auth.exchangeCodeForSession(code);
      headers.set(
        "Location",
        `${config.PUBLIC_URL}/${error ? "?error=login_failed" : ""}`,
      );
      return new Response(null, { status: 303, headers });
    },
  };
}
