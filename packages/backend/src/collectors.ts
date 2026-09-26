import { monitoringSummary } from "./monitoring-summary";
import type { AppleCredentials } from "../../core/src/model";
import type { Job } from "../../core/src/store";
import type { Services } from "./services";
import { connectionFor, supabaseAccess } from "./services";
import { emptyCursor } from "../../adapters/src/supabase-source";
import { reportingDates, dailyReady, localDay } from "../../core/src/time";
export async function collectAccounts(
  services: Services,
  job: Job,
  sourceId: string,
): Promise<Date | undefined> {
  const { store } = services;
  const source = await store.source(job.workspaceId, sourceId);
  if (!source) return;
  const connection = await connectionFor(
    services,
    job.workspaceId,
    source.connectionId,
    "supabase",
  );
  const token = await supabaseAccess(services, connection);
  const until = new Date().toISOString();
  let cursor = source.cursor ?? emptyCursor(source.baseline.toISOString());
  // Re-read five minutes to catch late transactions. Unique event keys prevent repeats.
  if (!cursor.catchup)
    cursor = emptyCursor(
      new Date(
        Math.max(
          source.baseline.getTime(),
          new Date(cursor.at).getTime() - 300_000,
        ),
      ).toISOString(),
    );
  const deadline = Date.now() + 150_000;
  for (let page = 0; page < 20 && Date.now() < deadline; page++) {
    const rows = await services.accounts.collect(
      token,
      source.externalId,
      cursor,
      until,
    );
    const last = rows.at(-1);
    const next = last
      ? { at: last.createdAt, id: last.id, catchup: rows.length === 500 }
      : cursor;
    await store.recordAccounts(
      source,
      rows.filter((row) => new Date(row.createdAt) >= source.baseline),
      next,
    );
    cursor = next;
    if (rows.length < 500) {
      await store.recordAccounts(source, [], emptyCursor(until));
      await store.updateConnection(connection.id, {
        lastSuccessAt: new Date(),
        lastError: null,
        status: "connected",
      });
      return new Date(Date.now() + 60_000);
    }
  }
  return new Date(Date.now() + 1000);
}
export async function collectApple(
  services: Services,
  job: Job,
  connectionId: string,
): Promise<Date | undefined> {
  const connection = await connectionFor(
    services,
    job.workspaceId,
    connectionId,
    "apple",
  );
  const sources = await services.store.connectionSources(
    job.workspaceId,
    connectionId,
  );
  if (!sources.length) return;
  const credentials = await services.secrets.open<AppleCredentials>(
    connection.secret,
    connection.id,
  );
  for (const date of reportingDates(new Date()))
    await services.store.saveReport(
      connection,
      date,
      await services.reports.report(credentials, date),
    );
  await services.store.updateConnection(connection.id, {
    status: "connected",
    lastError: null,
    lastSuccessAt: new Date(),
  });
  return new Date(Date.now() + 3600_000);
}
export async function dailySummary(
  services: Services,
  job: Job,
  projectId: string,
  now = new Date(),
): Promise<Date | undefined> {
  const { store } = services;
  const project = await store.project(job.workspaceId, projectId);
  if (!project) return;
  const next = new Date(now.getTime() + 60_000);
  if (!project.enabled || !dailyReady(now, project.timezone, project.dailyTime))
    return next;
  await monitoringSummary(services, project, now);
  const snapshot = await store.snapshot(job.workspaceId);
  const sources = snapshot.sources.filter(
    (source) =>
      source.projectId === projectId &&
      source.kind === "apple" &&
      snapshot.connections.some(
        (connection) =>
          connection.id === source.connectionId && connection.active,
      ),
  );
  if (!sources.length) return next;
  const dates = reportingDates(now);
  const deliveryKeys = await store.reportDeliveryKeys(
    job.workspaceId,
    projectId,
    dates,
  );
  const metrics = await store.projectMetrics(job.workspaceId, projectId, dates);
  for (const source of sources) {
    for (const date of dates) {
      const metric = metrics.find(
        (metric) => metric.sourceId === source.id && metric.date === date,
      );
      const prefix = `daily:${source.id}:${date}:`;
      const previous = deliveryKeys.filter((key) => key.startsWith(prefix));
      if (!metric) {
        if (date === dates[0])
          await store.fanout(project, `${prefix}pending`, {
            title: `Report pending · ${project.name}`,
            text: `Apple has not published the ${date} Sales and Trends report for ${source.name}. We'll send the totals when it arrives.`,
          });
        continue;
      }
      // Older history is imported silently; only revise dates that have been announced.
      if (date !== dates[0] && !previous.length) continue;
      const totals = `${metric.downloads}:${metric.redownloads}`;
      const corrected = previous.some(
        (key) =>
          !key.endsWith(":pending") &&
          key !== `${prefix}r${metric.revision}:${totals}`,
      );
      await store.fanout(project, `${prefix}r${metric.revision}:${totals}`, {
        title: `${corrected ? "Corrected downloads" : "Daily downloads"} · ${project.name}`,
        text: `${source.name} · ${date}\n${metric.downloads} initial downloads\n${metric.redownloads} redownloads\nSource: Apple Sales and Trends (Apple reporting date).`,
      });
    }
  }
  return next;
}
