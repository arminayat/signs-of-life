import type {
  AccountSource,
  Channel,
  ChannelKind,
  ReportSource,
  SecretBox,
  SourceKind,
  SupabaseTokens,
} from "../../core/src/model";
import { AppError, assert } from "../../core/src/model";
import type { Connection, MonitorStore } from "../../core/src/store";
import type { Config } from "./config";
import type { Authentication } from "../../core/src/authentication";
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
  channels: Partial<Record<ChannelKind, Channel>>;
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
  const lease = new Date(Date.now() + 60_000);
  if (!(await services.store.refreshLock(connection.id, lease)))
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
    assert(
      await services.store.replaceMonitorSecret(
        latest,
        await services.secrets.seal(refreshed, connection.id),
        lease,
      ),
      "connection_changed_during_refresh",
      409,
    );
    return refreshed.access_token;
  } finally {
    await services.store.releaseMonitorRefresh(connection.id, lease);
  }
}
