import type {
  AccountSource,
  Channel,
  ReportSource,
  SecretBox,
  SourceKind,
  SupabaseTokens,
} from "../../core/src/model";
import { AppError, assert } from "../../core/src/model";
import type { Connection, MonitorStore } from "../../core/src/store";
import type { Config } from "./config";
import type { Authentication } from "../../adapters/src/auth";
import {
  exchangeSupabase,
  type SupabaseOAuthConfig,
} from "../../adapters/src/supabase-source";
export type Services = {
  http: typeof fetch;
  connectorHttp?: typeof fetch;
  store: MonitorStore;
  config: Config;
  secrets: SecretBox;
  accounts: AccountSource;
  reports: ReportSource;
  channels: Partial<Record<"telegram" | "email", Channel>>;
};
export type ApiServices = Services & { auth: Authentication };
export function supabaseOAuth(config: Config): SupabaseOAuthConfig {
  assert(
    config.SUPABASE_OAUTH_CLIENT_ID && config.SUPABASE_OAUTH_CLIENT_SECRET,
    "supabase_oauth_not_configured",
    503,
  );
  return {
    clientId: config.SUPABASE_OAUTH_CLIENT_ID,
    clientSecret: config.SUPABASE_OAUTH_CLIENT_SECRET,
    redirectUri: `${config.PUBLIC_URL}/api/connections/supabase/callback`,
  };
}
export async function connectionFor(
  services: Services,
  workspaceId: string,
  id: string,
  kind?: SourceKind,
) {
  const connection = await services.store.connection(workspaceId, id);
  assert(connection?.active, "connection_not_found_or_disconnected", 404);
  assert(!kind || connection.kind === kind, "connection_type_mismatch");
  return connection;
}
export async function supabaseAccess(
  services: Services,
  connection: Connection,
) {
  const tokens = await services.secrets.open<SupabaseTokens>(
    connection.secret,
    connection.id,
  );
  if (tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
  if (
    !(await services.store.refreshLock(
      connection.id,
      new Date(Date.now() + 60_000),
    ))
  )
    throw new AppError("token_refresh_in_progress", 409);
  try {
    const latest = await connectionFor(
      services,
      connection.workspaceId,
      connection.id,
      "supabase",
    );
    const current = await services.secrets.open<SupabaseTokens>(
      latest.secret,
      latest.id,
    );
    if (current.expires_at > Date.now() + 60_000) return current.access_token;
    const refreshed = await exchangeSupabase(
      supabaseOAuth(services.config),
      { refreshToken: current.refresh_token },
      services.http,
    );
    await services.store.updateConnection(connection.id, {
      secret: await services.secrets.seal(refreshed, connection.id),
      status: "connected",
      lastError: null,
    });
    return refreshed.access_token;
  } finally {
    await services.store.updateConnection(connection.id, {
      refreshLease: null,
    });
  }
}
