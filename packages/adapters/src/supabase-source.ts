import { z } from "zod";
import type {
  AccountSource,
  Cursor,
  SupabaseTokens,
} from "../../core/src/model";
import { AppError } from "../../core/src/model";
import { jsonResponse, type Http } from "./http";
const api = "https://api.supabase.com/v1";
const rowSchema = z.array(
  z.object({
    id: z.uuid(),
    created_at: z.string(),
    provider: z.string().nullable(),
    is_anonymous: z.boolean().nullable(),
  }),
);
export function supabaseSource(http: Http = fetch): AccountSource {
  return {
    async collect(accessToken, projectRef, cursor, until) {
      const query = `select id::text, created_at::text, left(coalesce(raw_app_meta_data->>'provider', 'unknown'), 40) as provider, is_anonymous from auth.users where (created_at, id) > ($1::timestamptz, $2::uuid) and created_at <= $3::timestamptz order by created_at, id limit 500`;
      const response = await http(
        `${api}/projects/${encodeURIComponent(projectRef)}/database/query/read-only`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            parameters: [cursor.at, cursor.id, until],
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      const rows = rowSchema.parse(await jsonResponse(response));
      // Preserve anonymous rows so the collector remembers them without notifying.
      return rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        provider: (row.provider ?? "unknown").replace(/[\r\n]/g, ""),
        anonymous: row.is_anonymous === true,
      }));
    },
  };
}
export type RemoteProject = { id: string; name: string; region?: string };
export async function listSupabaseProjects(token: string, http: Http = fetch) {
  const data = await jsonResponse<unknown>(
    await http(`${api}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }),
  );
  return z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        region: z.string().optional(),
      }),
    )
    .parse(data);
}
export type SupabaseOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};
export function authorizeSupabase(
  config: SupabaseOAuthConfig,
  state: string,
  challenge: string,
) {
  const url = new URL(`${api}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
export async function exchangeSupabase(
  config: SupabaseOAuthConfig,
  grant: { code: string; verifier: string } | { refreshToken: string },
  http: Http = fetch,
): Promise<SupabaseTokens> {
  const params: Record<string, string> =
    "code" in grant
      ? {
          grant_type: "authorization_code",
          code: grant.code,
          code_verifier: grant.verifier,
          redirect_uri: config.redirectUri,
        }
      : { grant_type: "refresh_token", refresh_token: grant.refreshToken };
  const response = await http(`${api}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 400 || response.status === 401) {
    await response.body?.cancel();
    throw new AppError("supabase_reconnect_required", 409);
  }
  const tokens = z
    .object({
      access_token: z.string(),
      refresh_token: z.string(),
      expires_in: z.number(),
    })
    .parse(await jsonResponse(response));
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}
export const emptyCursor = (at: string): Cursor => ({
  at,
  id: "00000000-0000-0000-0000-000000000000",
});
