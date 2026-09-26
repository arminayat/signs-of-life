import { SignJWT, importPKCS8 } from "jose";
import { assert } from "../../../core/src/model";
import type { Credentials, MonitorKind } from "../../../core/src/monitoring";
import type { Http } from "../http";
import { auth0Host, object, posthogHost, request, string } from "./http";
export type OAuthClient = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};
function expiry(value: unknown) {
  const seconds = Number(value ?? 3600);
  assert(
    Number.isFinite(seconds) && seconds > 0 && seconds <= 366 * 86400,
    "provider_token_expiry_invalid",
    502,
  );
  return String(Date.now() + seconds * 1000);
}
export function oauthEndpoints(kind: MonitorKind, credentials: Credentials) {
  switch (kind) {
    case "stripe":
      return {
        authorize: "https://marketplace.stripe.com/oauth/v2/authorize",
        token: "https://api.stripe.com/v1/oauth/token",
        scope: "",
      };
    case "polar":
      return {
        authorize: "https://polar.sh/oauth2/authorize",
        token: "https://api.polar.sh/v1/oauth2/token",
        scope:
          "organizations:read orders:read refunds:read subscriptions:read metrics:read",
      };
    case "posthog":
      return {
        authorize: `${posthogHost(credentials)}/oauth/authorize/`,
        token: `${posthogHost(credentials)}/oauth/token/`,
        scope: "organization:read project:read insight:read query:read",
      };
    case "ga4":
      return {
        authorize: "https://accounts.google.com/o/oauth2/v2/auth",
        token: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/analytics.readonly",
      };
    default:
      throw new Error("OAuth is not supported for this provider");
  }
}
export function authorizationUrl(
  kind: MonitorKind,
  credentials: Credentials,
  client: OAuthClient,
  state: string,
  challenge: string,
) {
  const endpoints = oauthEndpoints(kind, credentials);
  const target = new URL(endpoints.authorize);
  for (const [key, value] of Object.entries({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    state,
    ...(endpoints.scope ? { scope: endpoints.scope } : {}),
  }))
    target.searchParams.set(key, value);
  if (kind !== "stripe") {
    target.searchParams.set("code_challenge", challenge);
    target.searchParams.set("code_challenge_method", "S256");
  }
  if (kind === "ga4") {
    target.searchParams.set("access_type", "offline");
    target.searchParams.set("prompt", "consent");
  }
  return target.toString();
}
export async function exchange(
  http: Http,
  kind: MonitorKind,
  credentials: Credentials,
  client: OAuthClient,
  input: { code?: string; verifier?: string; refresh?: string },
): Promise<Credentials> {
  const params = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: input.refresh ? "refresh_token" : "authorization_code",
    ...(input.refresh
      ? { refresh_token: input.refresh }
      : {
          code: input.code!,
          redirect_uri: client.redirectUri,
          ...(kind !== "stripe" ? { code_verifier: input.verifier! } : {}),
        }),
  });
  if (kind === "stripe") {
    params.delete("client_id");
    params.delete("client_secret");
  }
  const result = object(
    await request(http, oauthEndpoints(kind, credentials).token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(kind === "stripe"
          ? { Authorization: `Basic ${btoa(`${client.clientSecret}:`)}` }
          : {}),
      },
      body: params,
    }),
  );
  const refresh = result.refresh_token ?? input.refresh;
  return {
    ...credentials,
    authMethod: "oauth",
    accessToken: string(result.access_token),
    ...(refresh ? { refreshToken: string(refresh) } : {}),
    expiresAt: expiry(result.expires_in),
    ...(kind === "stripe" && typeof result.livemode === "boolean"
      ? { environment: result.livemode ? "production" : "sandbox" }
      : {}),
    ...(typeof result.stripe_user_id === "string"
      ? { accountId: result.stripe_user_id }
      : {}),
  };
}
export async function machineToken(
  http: Http,
  kind: MonitorKind,
  c: Credentials,
): Promise<Credentials> {
  if (c.accessToken && Number(c.expiresAt) > Date.now() + 60_000) return c;
  if (kind === "auth0") {
    const host = auth0Host(c);
    const result = object(
      await request(http, `${host}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: c.clientId,
          client_secret: c.clientSecret,
          audience: `${host}/api/v2/`,
        }),
      }),
    );
    return {
      ...c,
      accessToken: string(result.access_token),
      expiresAt: expiry(result.expires_in),
    };
  }
  if (kind === "ga4" && c.serviceAccount) {
    const account = object(JSON.parse(c.serviceAccount));
    assert(account.type === "service_account", "invalid_service_account");
    assert(
      typeof account.private_key === "string" &&
        account.private_key.length <= 16_000,
      "invalid_service_account",
    );
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/analytics.readonly",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(string(account.client_email))
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(await importPKCS8(account.private_key, "RS256"));
    const result = object(
      await request(http, "https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      }),
    );
    return {
      ...c,
      accessToken: string(result.access_token),
      expiresAt: expiry(result.expires_in),
    };
  }
  return c;
}
