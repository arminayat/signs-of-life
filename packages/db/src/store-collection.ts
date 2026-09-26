import { and, eq, inArray, sql, or, like } from "drizzle-orm";
import type { Database } from "./client";
import * as t from "./schema";
import type { MonitorStore } from "../../core/src/store";
import { fanout } from "./store-delivery";
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
  | "updateConnection"
  | "refreshLock"
> {
  return {
    async recordAccounts(source, events, cursor) {
      await db.transaction(async (tx) => {
        const [project] = await tx
          .select()
          .from(t.projects)
          .where(eq(t.projects.id, source.projectId));
        if (!project) return;
        for (const event of events) {
          const [inserted] = await tx
            .insert(t.events)
            .values({
              workspaceId: source.workspaceId,
              sourceId: source.id,
              externalId: event.id,
              anonymous: event.anonymous ?? false,
              occurredAt: new Date(event.createdAt),
              provider: event.provider,
            })
            .onConflictDoNothing()
            .returning();
          if (inserted && !event.anonymous)
            await fanout(tx, project, `account:${source.id}:${event.id}`, {
              title: `New account · ${project.name}`,
              text: `${event.provider} account ${shortAccount(event.id)} joined ${project.name}.\n${event.createdAt}`,
            });
        }
        await tx
          .update(t.sources)
          .set({ cursor, lastSuccessAt: new Date(), lastError: null })
          .where(eq(t.sources.id, source.id));
      });
    },
    async saveReport(connection, date, metrics) {
      await db.transaction(async (tx) => {
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
          );
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
                ...dates.map((date) =>
                  like(t.deliveries.key, `daily:%:${date}:%`),
                ),
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
    async sourceError(id, error) {
      await db
        .update(t.sources)
        .set({ lastError: error })
        .where(eq(t.sources.id, id));
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
