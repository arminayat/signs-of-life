import { isMonitorKind } from "../../core/src/monitoring";
import type { Project } from "../../core/src/store";
import { localDay } from "../../core/src/time";
import { hashToken } from "../../adapters/src/crypto";
import type { Services } from "./services";
export async function monitoringSummary(
  services: Services,
  project: Project,
  now: Date,
) {
  const today = localDay(now, project.timezone);
  const date = new Date(Date.parse(`${today}T00:00:00Z`) - 86400_000)
    .toISOString()
    .slice(0, 10);
  const [monitoring, snapshot] = await Promise.all([
    services.store.monitoringSnapshot(project.workspaceId, project.id),
    services.store.snapshot(project.workspaceId, project.id),
  ]);
  for (const view of monitoring.views.filter((v) => !v.hidden)) {
    const source = snapshot.sources.find((s) => s.id === view.sourceId),
      state = monitoring.states.find((s) => s.sourceId === view.sourceId);
    if (
      !source ||
      !state ||
      !isMonitorKind(source.kind) ||
      date <= localDay(new Date(state.notifyAfter), project.timezone) ||
      !snapshot.connections.some(
        (c) => c.id === source.connectionId && c.active,
      )
    )
      continue;
    const query = {
      metric: view.metric,
      from: date,
      to: date,
      filters: view.filters,
    };
    const metric = await services.store.requestMetric(
      source,
      query,
      await hashToken(JSON.stringify(query)),
    );
    if (
      !metric.result ||
      metric.error ||
      !["available", "partial"].includes(metric.result.status)
    )
      continue;
    const result = metric.result;
    const values =
      result.summary != null
        ? `${result.summary} ${result.currency || result.unit}`
        : result.points.length
          ? result.points
              .slice(0, 12)
              .map(
                (p) =>
                  `${p.label}: ${p.value ?? "unavailable"} ${result.currency || result.unit}`,
              )
              .join("\n")
          : undefined;
    if (!values) continue;
    await services.store.fanout(
      project,
      `monitor:${source.id}:daily:${date}:${view.id}`,
      {
        title: `Daily ${source.name} · ${project.name}`,
        text: `${view.metric} · ${date}\n${values}\n${result.timezone}${result.status === "partial" ? " · Partial coverage" : ""}\n${result.definition}`,
      },
    );
  }
}
