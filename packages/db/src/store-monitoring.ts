import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "./client";
import type { MonitoringStore } from "../../core/src/monitor-store";
import type { MonitorState } from "../../core/src/monitoring";
import { assert } from "../../core/src/model";
import { monitoringLifecycleStore } from "./store-monitoring-lifecycle";
import * as m from "./schema-monitoring";
import * as t from "./schema";
import { fanout } from "./store-delivery";
import { jobStore } from "./store-jobs";
import { localDay } from "../../core/src/time";
import { monitoringSeriesStore } from "./store-monitoring-series";
function state(row: typeof m.monitorStates.$inferSelect): MonitorState {
  return {
    ...row,
    notifyAfter: row.notifyAfter.toISOString(),
    historyFrom: row.historyFrom.toISOString(),
    historyUntil: row.historyUntil.toISOString(),
    liveFrom: row.liveFrom.toISOString(),
    liveUntil: row.liveUntil?.toISOString() ?? null,
  };
}
export function monitoringStore(db: Database): MonitoringStore {
  const jobs = jobStore(db);
  return {
    ...monitoringLifecycleStore(db),
    ...monitoringSeriesStore(db),
    async monitorState(sourceId) {
      const [row] = await db
        .select()
        .from(m.monitorStates)
        .where(eq(m.monitorStates.sourceId, sourceId));
      return row && state(row);
    },
    async monitorError(sourceId, historical, error) {
      await db
        .update(m.monitorStates)
        .set(historical ? { historyError: error } : { liveError: error })
        .where(eq(m.monitorStates.sourceId, sourceId));
    },
    async initializeMonitor(source, environment) {
      const now = source.baseline;
      await db.transaction(async (tx) => {
        await tx
          .insert(m.monitorStates)
          .values({
            sourceId: source.id,
            environment,
            notifyAfter: now,
            historyFrom: new Date(now.getTime() - 365 * 86400_000),
            historyUntil: now,
            liveFrom: now,
          })
          .onConflictDoNothing();
        for (const historical of [false, true])
          await tx
            .insert(t.jobs)
            .values({
              workspaceId: source.workspaceId,
              key: `monitor:${source.id}:${historical}`,
              payload: {
                kind: "monitor.collect",
                sourceId: source.id,
                historical,
              },
            })
            .onConflictDoNothing();
      });
    },
    async saveMonitorPage(source, observations, patch, historical, lease) {
      await db.transaction(async (tx) => {
        if (lease) {
          assert(lease.leaseToken, "job_lease_lost", 409);
          const [currentJob] = await tx
            .select()
            .from(t.jobs)
            .where(
              and(
                eq(t.jobs.id, lease.id),
                eq(t.jobs.workspaceId, source.workspaceId),
                eq(t.jobs.leaseToken, lease.leaseToken || ""),
                sql`${t.jobs.leaseUntil} > now()`,
              ),
            )
            .for("share");
          assert(currentJob, "job_lease_lost", 409);
        }
        const [connection] = await tx
          .select()
          .from(t.connections)
          .where(
            and(
              eq(t.connections.id, source.connectionId),
              eq(t.connections.active, true),
            ),
          )
          .for("share");
        if (!connection) return;
        const [current] = await tx
          .select()
          .from(m.monitorStates)
          .where(eq(m.monitorStates.sourceId, source.id))
          .for("update");
        const [project] = await tx
          .select()
          .from(t.projects)
          .where(
            and(
              eq(t.projects.id, source.projectId),
              eq(t.projects.workspaceId, source.workspaceId),
            ),
          );
        if (!current || !project) return;
        for (const event of observations) {
          if (
            event.resourceId !== source.externalId ||
            event.environment !== current.environment
          )
            continue;
          const [observed] = await tx
            .select({ id: m.monitorObservations.eventId })
            .from(m.monitorObservations)
            .where(
              and(
                eq(m.monitorObservations.sourceId, source.id),
                eq(m.monitorObservations.externalId, event.id),
              ),
            );
          if (observed) continue;
          const ref = event.reference;
          const key = JSON.stringify(
            ref
              ? [
                  event.environment,
                  ref.provider,
                  ref.account,
                  ref.object,
                  ref.action,
                ]
              : [
                  event.environment,
                  source.kind,
                  connection.id,
                  source.externalId,
                  event.id,
                ],
          );
          const [inserted] = await tx
            .insert(m.monitorEvents)
            .values({
              workspaceId: source.workspaceId,
              projectId: source.projectId,
              key,
              kind: event.kind,
              occurredAt: new Date(event.occurredAt),
              environment: event.environment,
              amount: event.amount,
              currency: event.currency,
              anonymous: event.anonymous ?? false,
            })
            .onConflictDoNothing()
            .returning();
          const canonical =
            inserted ??
            (
              await tx
                .select()
                .from(m.monitorEvents)
                .where(
                  and(
                    eq(m.monitorEvents.projectId, source.projectId),
                    eq(m.monitorEvents.key, key),
                  ),
                )
            )[0];
          if (!canonical) continue;
          await tx
            .insert(m.monitorObservations)
            .values({
              sourceId: source.id,
              externalId: event.id,
              eventId: canonical.id,
            })
            .onConflictDoNothing();
          if (
            !historical &&
            !event.anonymous &&
            new Date(event.occurredAt) >= current.notifyAfter &&
            current.notifications.includes(event.kind)
          ) {
            const [claimed] = await tx
              .update(m.monitorEvents)
              .set({ notified: true })
              .where(
                and(
                  eq(m.monitorEvents.id, canonical.id),
                  eq(m.monitorEvents.notified, false),
                ),
              )
              .returning({ id: m.monitorEvents.id });
            if (claimed)
              await fanout(
                tx,
                project,
                `monitor:${source.id}:${canonical.id}`,
                {
                  title: `${event.kind.replaceAll("_", " ")} · ${project.name}`,
                  text: `${source.name}\n${event.kind.replaceAll("_", " ")}${event.amount !== undefined ? ` · ${event.amount} ${event.currency ?? ""}` : ""}\n${event.occurredAt}`,
                },
              );
          }
        }
        const {
          sourceId: ignored,
          notifyAfter,
          historyFrom,
          historyUntil,
          liveFrom,
          liveUntil,
          ...rest
        } = patch;
        if (Object.keys(patch).length)
          await tx
            .update(m.monitorStates)
            .set({
              ...rest,
              ...(historical ? { historyError: null } : { liveError: null }),
              ...(notifyAfter ? { notifyAfter: new Date(notifyAfter) } : {}),
              ...(historyFrom ? { historyFrom: new Date(historyFrom) } : {}),
              ...(historyUntil ? { historyUntil: new Date(historyUntil) } : {}),
              ...(liveFrom ? { liveFrom: new Date(liveFrom) } : {}),
              ...(liveUntil !== undefined
                ? { liveUntil: liveUntil ? new Date(liveUntil) : null }
                : {}),
            })
            .where(eq(m.monitorStates.sourceId, source.id));
        await tx
          .update(t.sources)
          .set({ lastSuccessAt: new Date(), lastError: null })
          .where(eq(t.sources.id, source.id));
      });
    },
    async monitorPreferences(sourceId, notifications) {
      await db
        .update(m.monitorStates)
        .set({ notifications })
        .where(eq(m.monitorStates.sourceId, sourceId));
    },
    async monitoringSnapshot(workspaceId, projectId) {
      const condition = and(
        eq(t.sources.workspaceId, workspaceId),
        eq(t.sources.projectId, projectId),
      );
      const states = await db
        .select({ state: m.monitorStates })
        .from(m.monitorStates)
        .innerJoin(t.sources, eq(t.sources.id, m.monitorStates.sourceId))
        .where(condition);
      const metrics = await db
        .select({ metric: m.monitorMetrics })
        .from(m.monitorMetrics)
        .innerJoin(t.sources, eq(t.sources.id, m.monitorMetrics.sourceId))
        .where(condition)
        .orderBy(desc(m.monitorMetrics.updatedAt))
        .limit(200);
      const [dashboard] = await db
        .select()
        .from(m.monitorDashboards)
        .innerJoin(t.projects, eq(t.projects.id, m.monitorDashboards.projectId))
        .where(
          and(
            eq(t.projects.id, projectId),
            eq(t.projects.workspaceId, workspaceId),
          ),
        );
      return {
        states: states.map(({ state: row }) => state(row)),
        metrics: metrics.map(({ metric }) => metric),
        views: dashboard?.monitor_dashboards.views ?? [],
      };
    },
    async saveViews(workspaceId, projectId, views) {
      await db.transaction(async (tx) => {
        const [project] = await tx
          .select()
          .from(t.projects)
          .where(
            and(
              eq(t.projects.id, projectId),
              eq(t.projects.workspaceId, workspaceId),
            ),
          )
          .for("update");
        assert(project, "project_not_found", 404);
        const sources = await tx
          .select({ id: t.sources.id })
          .from(t.sources)
          .where(
            and(
              eq(t.sources.projectId, projectId),
              eq(t.sources.workspaceId, workspaceId),
            ),
          );
        assert(
          views.every((view) =>
            sources.some((source) => source.id === view.sourceId),
          ),
          "source_not_found",
          404,
        );
        await tx
          .insert(m.monitorDashboards)
          .values({ projectId, views })
          .onConflictDoUpdate({
            target: m.monitorDashboards.projectId,
            set: { views },
          });
      });
    },
    async requestMetric(source, query, key) {
      const [row] = await db
        .insert(m.monitorMetrics)
        .values({ sourceId: source.id, key, query })
        .onConflictDoUpdate({
          target: [m.monitorMetrics.sourceId, m.monitorMetrics.key],
          set: { query },
        })
        .returning();
      if (
        (!row.result && !row.error) ||
        row.updatedAt.getTime() < Date.now() - 3600_000
      )
        await jobs.enqueue(source.workspaceId, `metric:${row.id}`, {
          kind: "monitor.metric",
          metricId: row.id,
        });
      return row;
    },
    async metricRequest(workspaceId, id) {
      const [row] = await db
        .select({ metric: m.monitorMetrics })
        .from(m.monitorMetrics)
        .innerJoin(t.sources, eq(t.sources.id, m.monitorMetrics.sourceId))
        .where(
          and(
            eq(m.monitorMetrics.id, id),
            eq(t.sources.workspaceId, workspaceId),
          ),
        );
      return row?.metric;
    },
    async observedMetric(source, query, timezone) {
      const date = sql<string>`to_char(${m.monitorEvents.occurredAt} at time zone ${timezone}, 'YYYY-MM-DD')`;
      const rows = await db
        .select({
          label: date,
          value: sql<string>`count(distinct ${m.monitorEvents.id})::text`,
        })
        .from(m.monitorObservations)
        .innerJoin(
          m.monitorEvents,
          eq(m.monitorEvents.id, m.monitorObservations.eventId),
        )
        .where(
          and(
            eq(m.monitorObservations.sourceId, source.id),
            eq(m.monitorEvents.kind, query.metric as "signup"),
            eq(m.monitorEvents.anonymous, false),
            gte(date, query.from),
            lte(date, query.to),
          ),
        )
        .groupBy(date)
        .orderBy(date);
      const [coverage] = await db
        .select()
        .from(m.monitorStates)
        .where(eq(m.monitorStates.sourceId, source.id));
      const counts = new Map(rows.map((row) => [row.label, row.value]));
      const points: { label: string; value: string | null }[] = [];
      const first = coverage && localDay(coverage.historyFrom, timezone);
      const baseline = coverage && localDay(coverage.notifyAfter, timezone);
      const liveThrough = coverage && localDay(coverage.liveFrom, timezone);
      for (
        let at = Date.parse(`${query.from}T00:00:00Z`);
        at <= Date.parse(`${query.to}T00:00:00Z`);
        at += 86400_000
      ) {
        const label = new Date(at).toISOString().slice(0, 10);
        const collected = !!(
          coverage &&
          first &&
          baseline &&
          liveThrough &&
          label > first &&
          ((source.kind !== "revenuecat" &&
            coverage.historyDone &&
            label < baseline) ||
            (label >= baseline && label < liveThrough))
        );
        points.push({
          label,
          value: counts.get(label) ?? (collected ? "0" : null),
        });
      }
      return {
        shape: "series",
        unit: "count",
        timezone,
        definition:
          "Observed events for this source. Historical account records may exclude deleted users.",
        status:
          !coverage?.historyDone ||
          !!coverage.coverage ||
          points.some((p) => p.value === null)
            ? "partial"
            : "available",
        reason: coverage?.coverage ?? undefined,
        points,
        summary: rows.reduce((n, row) => n + BigInt(row.value), 0n).toString(),
        fetchedAt: new Date().toISOString(),
      };
    },
  };
}
