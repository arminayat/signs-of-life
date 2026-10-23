import { and, eq, inArray, sql, or, like } from "drizzle-orm";
import type { Database } from "./client";
import * as t from "./schema";
import type { MonitorStore } from "../../core/src/store";
import { fanoutMany } from "./store-delivery";
import { lockJob, lockConnection, lockSource } from "./store-guards";
import { shortAccount } from "../../core/src/time";
export function collectionStore(
  db: Database,
): Pick<
  MonitorStore,
  | "reportDeliveryKeys"
  | "recordAccounts"
  | "saveReport"
  | "projectMetrics"
  | "sourceError"
  | "updateConnectionHealth"
  | "updateConnection"
  | "refreshLock"
> {
  return {
    async recordAccounts(source, events, cursor, job) {
      await db.transaction(async (tx) => {
        await lockJob(tx, job, source.workspaceId);
        if (!(await lockSource(tx, source.id, source.workspaceId))) return;
        const [project] = await tx
          .select()
          .from(t.projects)
          .where(eq(t.projects.id, source.projectId));
        if (!project) return;
        const notifications = [];
        for (let at = 0; at < events.length; at += 200) {
          const inserted = await tx
            .insert(t.events)
            .values(
              events.slice(at, at + 200).map((event) => ({
                workspaceId: source.workspaceId,
                sourceId: source.id,
                externalId: event.id,
                anonymous: event.anonymous ?? false,
                occurredAt: new Date(event.createdAt),
                provider: event.provider,
              })),
            )
            .onConflictDoNothing()
            .returning();
          notifications.push(
            ...inserted
              .filter((event) => !event.anonymous)
              .map((event) => ({
                key: `account:${source.id}:${event.externalId}`,
                notification: {
                  title: `New account · ${project.name}`,
                  text: `${event.provider} account ${shortAccount(event.externalId)} joined ${project.name}.\n${event.occurredAt.toISOString()}`,
                },
              })),
          );
        }
        await fanoutMany(tx, project, notifications);
        await tx
          .update(t.sources)
          .set({ cursor, lastSuccessAt: new Date(), lastError: null })
          .where(eq(t.sources.id, source.id));
      });
    },
    async saveReport(connection, date, metrics, job) {
      await db.transaction(async (tx) => {
        await lockJob(tx, job, connection.workspaceId);
        // Legacy connections can span projects. Lock their parents before the
        // connection/source children so project deletion cannot invert order.
        const parents = await tx
          .select({ id: t.sources.projectId })
          .from(t.sources)
          .where(
            and(
              eq(t.sources.connectionId, connection.id),
              eq(t.sources.workspaceId, connection.workspaceId),
            ),
          );
        const projectIds = [
          ...new Set([
            ...parents.map((row) => row.id),
            ...(connection.projectId ? [connection.projectId] : []),
          ]),
        ].sort();
        if (projectIds.length)
          await tx
            .select({ id: t.projects.id })
            .from(t.projects)
            .where(
              and(
                eq(t.projects.workspaceId, connection.workspaceId),
                inArray(t.projects.id, projectIds),
              ),
            )
            .orderBy(t.projects.id)
            .for("share");
        if (!(await lockConnection(tx, connection.id, connection.workspaceId)))
          return;
        await tx
          .insert(t.reports)
          .values({
            connectionId: connection.id,
            date,
            status: metrics ? "available" : "pending",
          })
          .onConflictDoUpdate({
            target: [t.reports.connectionId, t.reports.date],
            set: {
              status: metrics ? "available" : "pending",
              checkedAt: new Date(),
            },
          });
        if (!metrics) return;
        const sources = await tx
          .select()
          .from(t.sources)
          .where(
            and(
              eq(t.sources.connectionId, connection.id),
              eq(t.sources.workspaceId, connection.workspaceId),
            ),
          )
          .orderBy(t.sources.id)
          .for("update");
        for (const source of sources) {
          const metric = metrics.find(
            (metric) => metric.appId === source.externalId,
          ) ?? { downloads: 0, redownloads: 0 };
          await tx
            .insert(t.metrics)
            .values({
              workspaceId: source.workspaceId,
              sourceId: source.id,
              date,
              downloads: metric.downloads,
              redownloads: metric.redownloads,
            })
            .onConflictDoUpdate({
              target: [t.metrics.sourceId, t.metrics.date],
              set: {
                downloads: metric.downloads,
                redownloads: metric.redownloads,
                revision: sql`${t.metrics.revision} + 1`,
                updatedAt: new Date(),
              },
              setWhere: sql`${t.metrics.downloads} != ${metric.downloads} or ${t.metrics.redownloads} != ${metric.redownloads}`,
            });
          await tx
            .update(t.sources)
            .set({ lastSuccessAt: new Date(), lastError: null })
            .where(eq(t.sources.id, source.id));
        }
      });
    },
    async reportDeliveryKeys(workspaceId, projectId, dates) {
      if (!dates.length) return [];
      return (
        await db
          .select({ key: t.deliveries.key })
          .from(t.deliveries)
          .where(
            and(
              eq(t.deliveries.workspaceId, workspaceId),
              eq(t.deliveries.projectId, projectId),
              or(
                ...dates.flatMap((date) => [
                  like(t.deliveries.key, `daily:%:${date}:%`),
                  like(t.deliveries.key, `monitor:%:daily:${date}:%`),
                ]),
              ),
            ),
          )
      ).map((row) => row.key);
    },
    async projectMetrics(workspaceId, projectId, dates) {
      if (!dates.length) return [];
      const rows = await db
        .select({ metric: t.metrics, name: t.sources.name })
        .from(t.metrics)
        .innerJoin(t.sources, eq(t.sources.id, t.metrics.sourceId))
        .where(
          and(
            eq(t.sources.workspaceId, workspaceId),
            eq(t.sources.projectId, projectId),
            inArray(t.metrics.date, dates),
          ),
        );
      return rows.map(({ metric, name }) => ({ ...metric, name }));
    },
    async sourceError(id, error, job) {
      await db.transaction(async (tx) => {
        await lockJob(tx, job);
        if (!(await lockSource(tx, id, job.workspaceId))) return;
        await tx
          .update(t.sources)
          .set({ lastError: error })
          .where(eq(t.sources.id, id));
      });
    },
    async updateConnectionHealth(id, patch, job) {
      await db.transaction(async (tx) => {
        await lockJob(tx, job);
        if (!(await lockConnection(tx, id, job.workspaceId, "update"))) return;
        await tx
          .update(t.connections)
          .set(patch)
          .where(eq(t.connections.id, id));
      });
    },
    async updateConnection(id, patch) {
      await db
        .update(t.connections)
        .set(patch)
        .where(and(eq(t.connections.id, id), eq(t.connections.active, true)));
    },
    async refreshLock(id, until) {
      return (
        (
          await db
            .update(t.connections)
            .set({ refreshLease: until })
            .where(
              and(
                eq(t.connections.id, id),
                eq(t.connections.active, true),
                sql`(${t.connections.refreshLease} is null or ${t.connections.refreshLease} < now())`,
              ),
            )
            .returning({ id: t.connections.id })
        ).length > 0
      );
    },
  };
}
