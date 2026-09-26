import { Hono } from "hono";
import { z } from "zod";
import { assert } from "../../core/src/model";
import {
  eventKinds,
  isMonitorKind,
  monitorKinds,
  type Credentials,
  type MonitorKind,
} from "../../core/src/monitoring";
import { providerDefinition } from "../../core/src/provider-registry";
import { hashToken, randomToken } from "../../adapters/src/crypto";
import {
  authorizationUrl,
  exchange,
  machineToken,
} from "../../adapters/src/monitoring/oauth";
import { idSchema, textName, type ApiEnv } from "./api";
import { connectionFor, type Services } from "./services";
import {
  adapterFor,
  monitoringCredentials,
  monitoringOAuth,
} from "./monitoring-access";
const providerSchema = z.enum(monitorKinds);
const filtersSchema = z
  .record(z.string().max(60), z.string().max(120))
  .refine((v) => Object.keys(v).length <= 10);
const dateSchema = z.iso.date();
export const metricQuerySchema = z
  .object({
    metric: z.string().min(1).max(120),
    from: dateSchema,
    to: dateSchema,
    filters: filtersSchema.default({}),
  })
  .refine(
    (q) =>
      q.from <= q.to &&
      Date.parse(q.from) >= Date.now() - 366 * 86400_000 &&
      Date.parse(q.to) <= Date.now(),
    "Choose a range within the last 12 months.",
  );
export async function sourceFor(
  services: Services,
  workspace: string,
  id: string,
) {
  const source = await services.store.source(workspace, id);
  assert(source && isMonitorKind(source.kind), "monitor_source_not_found", 404);
  return source;
}
export function monitoringRoutes(services: Services) {
  const app = new Hono<ApiEnv>(),
    { store, config, secrets } = services;
  async function validate(
    workspaceId: string,
    projectId: string,
    kind: MonitorKind,
    connectionId?: string,
  ) {
    assert(
      await store.project(workspaceId, projectId),
      "project_not_found",
      404,
    );
    if (connectionId) {
      const c = await store.connection(workspaceId, connectionId);
      assert(
        c && c.projectId === projectId && c.kind === kind,
        "connection_not_found",
        404,
      );
    }
    assert(
      await store.rateLimit(`monitor-setup:${workspaceId}`, 30, 3600),
      "rate_limited",
      429,
    );
  }
  async function save(
    workspaceId: string,
    projectId: string,
    kind: MonitorKind,
    credentials: Credentials,
    id: string,
    name: string,
  ) {
    const catalog = await adapterFor(services, kind).catalog(credentials);
    assert(catalog.length, "provider_no_accessible_resources", 403);
    const existing = await store.connection(workspaceId, id);
    // Reconnect credentials must still address the selected resources, not silently
    // replace an account while preserving its historical measurements.
    for (const source of existing
      ? await store.connectionSources(workspaceId, id)
      : []) {
      const state = await store.monitorState(source.id);
      assert(
        catalog.some(
          (r) =>
            r.id === source.externalId && r.environment === state?.environment,
        ),
        "reconnect_selected_resource_not_accessible",
        403,
      );
    }
    await store.saveConnection({
      id,
      projectId,
      workspaceId,
      kind,
      name,
      secret: await secrets.seal(credentials, id),
      externalId:
        catalog.length === 1
          ? `${catalog[0].environment}:${catalog[0].id}`
          : null,
    });
    await store.resumeConnection(workspaceId, id);
    return { id };
  }
  app.post("/monitor/connections/:provider/credentials", async (c) => {
    const kind = providerSchema.parse(c.req.param("provider"));
    const input = z
      .object({
        projectId: idSchema,
        connectionId: idSchema.optional(),
        name: textName.optional(),
        credentials: z.record(z.string().max(40), z.string().max(16_000)),
      })
      .parse(await c.req.json());
    await validate(
      c.get("workspaceId"),
      input.projectId,
      kind,
      input.connectionId,
    );
    const definition = providerDefinition(kind),
      credentials: Credentials = {};
    // Allowlisted setup fields only: callers cannot inject tokens or match aliases.
    for (const field of definition.fields) {
      const value = input.credentials[field.id]?.trim();
      assert(field.optional || value, `credential_${field.id}_required`);
      if (value) credentials[field.id] = value;
    }
    if (["paddle", "revenuecat"].includes(kind))
      assert(
        ["production", "sandbox"].includes(credentials.environment),
        "invalid_provider_environment",
      );
    const ready = await machineToken(services.http, kind, credentials);
    return c.json(
      await save(
        c.get("workspaceId"),
        input.projectId,
        kind,
        ready,
        input.connectionId || crypto.randomUUID(),
        input.name || definition.name,
      ),
      201,
    );
  });
  app.post("/monitor/connections/:provider/start", async (c) => {
    const kind = providerSchema.parse(c.req.param("provider"));
    const input = z
      .object({
        projectId: idSchema,
        connectionId: idSchema.optional(),
        region: z.enum(["us", "eu"]).default("us"),
      })
      .parse(await c.req.json());
    await validate(
      c.get("workspaceId"),
      input.projectId,
      kind,
      input.connectionId,
    );
    const client = monitoringOAuth(config, kind);
    assert(client, "provider_oauth_not_configured", 503);
    const state = randomToken(),
      hash = await hashToken(state),
      verifier = randomToken();
    await store.challenge({
      hash,
      workspaceId: c.get("workspaceId"),
      purpose: `oauth:${kind}`,
      destinationId: null,
      secret: await secrets.seal(
        {
          verifier,
          projectId: input.projectId,
          connectionId: input.connectionId,
          region: input.region,
          userId: c.get("userId"),
        },
        hash,
      ),
      expiresAt: new Date(Date.now() + 600_000),
    });
    return c.json({
      url: authorizationUrl(
        kind,
        { region: input.region },
        client,
        state,
        await hashToken(verifier),
      ),
    });
  });
  app.get("/monitor/connections/:provider/callback", async (c) => {
    const kind = providerSchema.parse(c.req.param("provider")),
      hash = await hashToken(
        z.string().min(20).max(200).parse(c.req.query("state")),
      );
    const challenge = await store.useChallenge(
      hash,
      `oauth:${kind}`,
      c.get("workspaceId"),
    );
    assert(challenge?.secret, "oauth_state_invalid_or_expired");
    const state = await secrets.open<{
      verifier: string;
      projectId: string;
      connectionId?: string;
      region: string;
      userId: string;
    }>(challenge.secret, hash);
    assert(state.userId === c.get("userId"), "oauth_state_invalid_or_expired");
    await validate(
      c.get("workspaceId"),
      state.projectId,
      kind,
      state.connectionId,
    );
    const client = monitoringOAuth(config, kind);
    assert(client, "provider_oauth_not_configured", 503);
    let credentials: Credentials = { region: state.region };
    if (
      state.connectionId &&
      (await store.connection(c.get("workspaceId"), state.connectionId))?.secret
    )
      credentials = {
        ...(await secrets.open<Credentials>(
          (await store.connection(c.get("workspaceId"), state.connectionId))!
            .secret,
          state.connectionId,
        )),
        region: state.region,
      };
    credentials = await exchange(services.http, kind, credentials, client, {
      code: z.string().min(1).max(8000).parse(c.req.query("code")),
      verifier: state.verifier,
    });
    const { id } = await save(
      c.get("workspaceId"),
      state.projectId,
      kind,
      credentials,
      state.connectionId || crypto.randomUUID(),
      providerDefinition(kind).name,
    );
    return c.redirect(
      `${config.PUBLIC_URL}/projects/${state.projectId}/sources?connected=${id}`,
      303,
    );
  });
  app.patch("/monitor/connections/:id/webhook", async (c) => {
    const connection = await connectionFor(
      services,
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    assert(
      isMonitorKind(connection.kind) &&
        adapterFor(services, connection.kind).webhook,
      "webhook_not_supported",
    );
    const { secret } = z
      .object({ secret: z.string().min(16).max(1000) })
      .parse(await c.req.json());
    const credentials = await secrets.open<Credentials>(
      connection.secret,
      connection.id,
    );
    assert(
      await store.replaceMonitorSecret(
        connection,
        await secrets.seal(
          { ...credentials, webhookSecret: secret },
          connection.id,
        ),
      ),
      "connection_changed_during_update",
      409,
    );
    return c.json({ success: true });
  });
  app.get("/projects/:id/monitoring", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    assert(
      await store.project(c.get("workspaceId"), id),
      "project_not_found",
      404,
    );
    return c.json(await store.monitoringSnapshot(c.get("workspaceId"), id));
  });
  app.put("/projects/:id/views", async (c) => {
    const views = z
      .array(
        z.object({
          id: idSchema,
          sourceId: idSchema,
          metric: z.string().min(1).max(120),
          hidden: z.boolean(),
          filters: filtersSchema,
        }),
      )
      .max(50)
      .parse(await c.req.json());
    assert(
      new Set(views.map((v) => v.id)).size === views.length,
      "duplicate_view_id",
    );
    await store.saveViews(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
      views,
    );
    return c.json({ success: true });
  });
  app.get("/sources/:id/metrics", async (c) => {
    const source = await sourceFor(
      services,
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    const connection = await connectionFor(
      services,
      c.get("workspaceId"),
      source.connectionId,
    );
    assert(isMonitorKind(connection.kind), "connection_type_mismatch");
    return c.json({
      items: await adapterFor(services, connection.kind).definitions(
        await monitoringCredentials(services, connection),
        source.externalId,
      ),
    });
  });
  app.get("/monitor/metrics/:id", async (c) => {
    const metric = await store.metricRequest(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    assert(metric, "metric_not_found", 404);
    return c.json(metric);
  });
  app.post("/sources/:id/metric-queries", async (c) => {
    const source = await sourceFor(
      services,
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    assert(
      await store.rateLimit(`metrics:${c.get("workspaceId")}`, 300, 3600),
      "rate_limited",
      429,
    );
    const query = metricQuerySchema.parse(await c.req.json());
    query.filters = Object.fromEntries(
      Object.entries(query.filters).sort(([a], [b]) => a.localeCompare(b)),
    );
    return c.json(
      await store.requestMetric(
        source,
        query,
        await hashToken(JSON.stringify(query)),
      ),
      202,
    );
  });
  app.patch("/sources/:id/notifications", async (c) => {
    const source = await sourceFor(
      services,
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    const { events } = z
      .object({ events: z.array(z.enum(eventKinds)).max(eventKinds.length) })
      .parse(await c.req.json());
    assert(
      isMonitorKind(source.kind) &&
        events.every((e) =>
          providerDefinition(source.kind as MonitorKind).events.includes(e),
        ),
      "notification_event_unsupported",
    );
    await store.monitorPreferences(source.id, [...new Set(events)]);
    return c.json({ success: true });
  });
  return app;
}
