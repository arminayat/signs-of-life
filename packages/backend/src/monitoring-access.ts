import { AppError, assert } from "../../core/src/model";
import type { Connection } from "../../core/src/store";
import {
  isMonitorKind,
  type Credentials,
  type MonitorKind,
} from "../../core/src/monitoring";
import { monitorAdapter } from "../../adapters/src/monitoring";
import {
  exchange,
  machineToken,
  type OAuthClient,
} from "../../adapters/src/monitoring/oauth";
import type { Config } from "./config";
import { connectionFor, type Services } from "./services";
export function monitoringOAuth(
  config: Config,
  kind: MonitorKind,
): OAuthClient | undefined {
  const prefix = (
    {
      stripe: "STRIPE",
      polar: "POLAR",
      posthog: "POSTHOG",
      ga4: "GA4",
    } as Partial<Record<MonitorKind, "STRIPE" | "POLAR" | "POSTHOG" | "GA4">>
  )[kind];
  if (!prefix) return;
  const clientId = config[`${prefix}_OAUTH_CLIENT_ID`],
    clientSecret = config[`${prefix}_OAUTH_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return;
  return {
    clientId,
    clientSecret,
    redirectUri: `${config.PUBLIC_URL}/api/monitor/connections/${kind}/callback`,
  };
}
export function adapterFor(services: Services, kind: MonitorKind) {
  return monitorAdapter(
    kind,
    kind === "better-auth"
      ? services.connectorHttp || services.http
      : services.http,
    services.config.MONITOR_ALLOWED_HOSTS,
  );
}
export async function monitoringCredentials(
  services: Services,
  connection: Connection,
): Promise<Credentials> {
  assert(isMonitorKind(connection.kind), "connection_type_mismatch");
  const kind = connection.kind,
    c = await services.secrets.open<Credentials>(
      connection.secret,
      connection.id,
    );
  const needsToken =
    c.authMethod === "oauth" ||
    kind === "auth0" ||
    (kind === "ga4" && !!c.serviceAccount);
  const lease = new Date(Date.now() + 60_000);
  if (
    !needsToken ||
    (c.accessToken && Number(c.expiresAt) > Date.now() + 60_000)
  )
    return c;
  if (!(await services.store.refreshLock(connection.id, lease)))
    throw new AppError("token_refresh_in_progress", 409);
  try {
    const latest = await connectionFor(
      services,
      connection.workspaceId,
      connection.id,
      kind,
    );
    const current = await services.secrets.open<Credentials>(
      latest.secret,
      latest.id,
    );
    if (current.accessToken && Number(current.expiresAt) > Date.now() + 60_000)
      return current;
    let refreshed: Credentials;
    if (current.authMethod === "oauth") {
      const client = monitoringOAuth(services.config, kind);
      assert(
        client && current.refreshToken,
        "provider_reconnect_required",
        409,
      );
      refreshed = await exchange(services.http, kind, current, client, {
        refresh: current.refreshToken,
      });
    } else refreshed = await machineToken(services.http, kind, current);
    assert(
      await services.store.replaceMonitorSecret(
        latest,
        await services.secrets.seal(refreshed, connection.id),
        lease,
      ),
      "connection_changed_during_refresh",
      409,
    );
    return refreshed;
  } finally {
    await services.store.releaseMonitorRefresh(connection.id, lease);
  }
}
