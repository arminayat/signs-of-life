import { AppError, assert } from "../../core/src/model";
import {
  eventKinds,
  isMonitorKind,
  type CollectionInput,
  type MonitorState,
} from "../../core/src/monitoring";
import type { Job, Source } from "../../core/src/store";
import { hashToken } from "../../adapters/src/crypto";
import { adapterFor, monitoringCredentials } from "./monitoring-access";
import { connectionFor, type Services } from "./services";
import { verifiedMatches } from "./monitoring-matches";
async function access(services: Services, source: Source) {
  const connection = await connectionFor(
    services,
    source.workspaceId,
    source.connectionId,
  );
  assert(isMonitorKind(connection.kind), "connection_type_mismatch");
  if (
    !(await services.store.providerBudget(
      connection.id,
      connection.kind === "revenuecat" ? 8 : 1,
    ))
  )
    throw Object.assign(new AppError("provider_rate_budget", 429), {
      retryAfterSeconds: 10,
    });
  return {
    connection,
    adapter: adapterFor(services, connection.kind),
    credentials: await monitoringCredentials(services, connection),
  };
}
function inputFor(
  source: Source,
  state: MonitorState,
  credentials: Record<string, string>,
  historical: boolean,
): CollectionInput {
  return {
    credentials,
    resourceId: source.externalId,
    environment: state.environment,
    historical,
    from: historical ? state.historyFrom : state.liveFrom,
    until: historical
      ? state.historyUntil
      : state.liveUntil || new Date().toISOString(),
    cursor: historical ? state.historyCursor : state.liveCursor,
  };
}
async function refreshViews(
  services: Services,
  source: Source,
  history: boolean,
  credentials: Record<string, string>,
) {
  assert(isMonitorKind(source.kind), "connection_type_mismatch");
  const snapshot = await services.store.monitoringSnapshot(
    source.workspaceId,
    source.projectId,
  );
  const views = snapshot.views.filter(
    (v) => v.sourceId === source.id && !v.hidden,
  );
  if (!views.length) return;
  const to = new Date().toISOString().slice(0, 10),
    from = new Date(Date.now() - (history ? 364 : 29) * 86400_000)
      .toISOString()
      .slice(0, 10);
  for (const view of views) {
    const query = { metric: view.metric, from, to, filters: view.filters };
    await services.store.requestMetric(
      source,
      query,
      await hashToken(JSON.stringify(query)),
    );
  }
}
export async function collectMonitor(
  services: Services,
  job: Job,
  sourceId: string,
  historical: boolean,
): Promise<Date | undefined> {
  const { store } = services,
    source = await store.source(job.workspaceId, sourceId);
  if (!source) return;
  const state = await store.monitorState(source.id);
  assert(state, "source_state_missing", 409);
  if (historical && state.historyDone) return;
  const { connection, adapter, credentials } = await access(services, source);
  if (!historical && !state.liveUntil) {
    state.liveUntil = new Date().toISOString();
    state.liveFrom = new Date(
      Math.max(
        Date.parse(state.notifyAfter),
        Date.parse(state.liveFrom) - 300_000,
      ),
    ).toISOString();
    await store.saveMonitorPage(
      source,
      [],
      { liveFrom: state.liveFrom, liveUntil: state.liveUntil },
      false,
      job,
    );
  }
  const input = inputFor(source, state, credentials, historical);
  const page = adapter.collect
    ? await adapter.collect(input)
    : {
        events: [],
        cursor: {},
        done: true,
        coverage:
          "Provider-native aggregate reports; no account-level events are imported.",
      };
  // Every provider may return records outside a requested range; imports must
  // never consume live events, and delayed callbacks must never replay history.
  const events = page.events.filter(
    (e) =>
      e.occurredAt >= input.from &&
      (historical ? e.occurredAt < input.until : e.occurredAt <= input.until),
  );
  const patch = historical
    ? { historyCursor: page.cursor, historyDone: page.done }
    : {
        liveCursor: page.done ? {} : page.cursor,
        liveUntil: page.done ? null : input.until,
        liveFrom: page.done ? input.until : input.from,
      };
  await store.saveMonitorPage(
    source,
    events,
    { ...patch, ...(page.coverage ? { coverage: page.coverage } : {}) },
    historical,
    job,
  );
  await store.updateConnection(connection.id, {
    status: "connected",
    lastError: null,
    lastSuccessAt: new Date(),
  });
  if (!page.done) return new Date(Date.now() + 3000);
  await refreshViews(services, source, historical, credentials);
  if (historical) return;
  const auth = ["better-auth", "workos", "clerk", "auth0"].includes(
    source.kind,
  );
  return new Date(
    Date.now() + (auth ? 60_000 : adapter.collect ? 300_000 : 3600_000),
  );
}
export async function collectMetric(
  services: Services,
  job: Job,
  metricId: string,
) {
  const { store } = services,
    metric = await store.metricRequest(job.workspaceId, metricId);
  if (!metric) return;
  const source = await store.source(job.workspaceId, metric.sourceId);
  if (!source) return;
  const state = await store.monitorState(source.id);
  assert(state, "source_state_missing", 409);
  try {
    const { adapter, credentials } = await access(services, source);
    const definitions = await adapter.definitions(
        credentials,
        source.externalId,
      ),
      definition = definitions.find((d) => d.id === metric.query.metric);
    assert(definition, "provider_metric_unsupported", 422);
    for (const [key, value] of Object.entries(metric.query.filters)) {
      const filter = definition.filters?.find((f) => f.id === key);
      assert(
        filter && (!filter.values || filter.values.includes(value)),
        "provider_filter_unsupported",
        422,
      );
    }
    const project = await store.project(job.workspaceId, source.projectId);
    assert(project, "project_not_found", 404);
    const result = (eventKinds as readonly string[]).includes(
      metric.query.metric,
    )
      ? await store.observedMetric(source, metric.query, project.timezone)
      : await adapter.metric?.(
          inputFor(source, state, credentials, false),
          metric.query,
        );
    assert(result, "provider_metric_unsupported", 422);
    await store.saveMetric(metricId, result, null);
  } catch (error) {
    const code =
      error instanceof AppError ? error.code : "metric_collection_failed";
    await store.saveMetric(
      metricId,
      metric.result
        ? null
        : await store.retainedSeries(source.id, metric.query),
      code,
    );
    if (
      [
        "provider_metric_unsupported",
        "provider_filter_unsupported",
        "provider_permission_denied",
        "provider_http_404",
        "provider_http_400",
        "provider_http_422",
      ].includes(code)
    )
      return;
    throw error;
  }
}
export async function processMonitorWebhook(
  services: Services,
  job: Job,
  inboxId: string,
) {
  const { store } = services,
    inbox = await store.monitorInbox(job.workspaceId, inboxId);
  if (!inbox) return;
  const connection = await store.connection(
    job.workspaceId,
    inbox.connectionId,
  );
  if (connection?.active)
    for (const source of await store.connectionSources(
      job.workspaceId,
      inbox.connectionId,
    )) {
      const state = await store.monitorState(source.id);
      if (state)
        await store.saveMonitorPage(
          source,
          await verifiedMatches(
            services,
            source,
            inbox.observations.filter(
              (e) =>
                e.occurredAt >= state.notifyAfter &&
                e.resourceId === source.externalId &&
                e.environment === state.environment,
            ),
          ),
          {},
          false,
          job,
        );
    }
  await store.removeMonitorInbox(job.workspaceId, inboxId);
}
