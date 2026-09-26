import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import type { MonitoringStore } from "../../core/src/monitor-store";
import { isMonitorKind } from "../../core/src/monitoring";
import * as m from "./schema-monitoring";
import * as t from "./schema";
import { jobStore } from "./store-jobs";
export function monitoringLifecycleStore(
  db: Database,
): Pick<
  MonitoringStore,
  | "resumeConnection"
  | "providerBudget"
  | "delayProvider"
  | "webhookConnection"
  | "acceptMonitorWebhook"
  | "monitorInbox"
  | "removeMonitorInbox"
  | "replaceMonitorSecret"
  | "releaseMonitorRefresh"
> {
  const jobs = jobStore(db);
  return {
    async replaceMonitorSecret(connection, secret, lease) {
      const rows = await db
        .update(t.connections)
        .set({ secret, status: "connected", lastError: null })
        .where(
          and(
            eq(t.connections.id, connection.id),
            eq(t.connections.workspaceId, connection.workspaceId),
            eq(t.connections.active, true),
            eq(t.connections.secret, connection.secret),
            lease ? eq(t.connections.refreshLease, lease) : undefined,
          ),
        )
        .returning({ id: t.connections.id });
      return rows.length === 1;
    },
    async releaseMonitorRefresh(id, lease) {
      await db
        .update(t.connections)
        .set({ refreshLease: null })
        .where(
          and(eq(t.connections.id, id), eq(t.connections.refreshLease, lease)),
        );
    },
    async resumeConnection(workspaceId, connectionId) {
      const sources = await db
        .select()
        .from(t.sources)
        .where(
          and(
            eq(t.sources.workspaceId, workspaceId),
            eq(t.sources.connectionId, connectionId),
          ),
        );
      for (const source of sources) {
        if (source.kind === "apple")
          await jobs.enqueue(workspaceId, `apple:${connectionId}`, {
            kind: "apple.collect",
            connectionId,
          });
        else if (source.kind === "supabase")
          await jobs.enqueue(workspaceId, `supabase:${source.id}`, {
            kind: "supabase.collect",
            sourceId: source.id,
          });
        else if (isMonitorKind(source.kind)) {
          const [row] = await db
            .select()
            .from(m.monitorStates)
            .where(eq(m.monitorStates.sourceId, source.id));
          for (const historical of row?.historyDone ? [false] : [false, true])
            await jobs.enqueue(
              workspaceId,
              `monitor:${source.id}:${historical}`,
              { kind: "monitor.collect", sourceId: source.id, historical },
            );
        }
      }
    },
    async providerBudget(connectionId, seconds) {
      const rows = await db
        .insert(m.providerBudgets)
        .values({
          connectionId,
          availableAt: new Date(Date.now() + seconds * 1000),
        })
        .onConflictDoUpdate({
          target: m.providerBudgets.connectionId,
          set: { availableAt: new Date(Date.now() + seconds * 1000) },
          setWhere: sql`${m.providerBudgets.availableAt} <= now()`,
        })
        .returning();
      return rows.length > 0;
    },
    async delayProvider(connectionId, seconds) {
      const availableAt = new Date(Date.now() + seconds * 1000);
      await db
        .insert(m.providerBudgets)
        .values({ connectionId, availableAt })
        .onConflictDoUpdate({
          target: m.providerBudgets.connectionId,
          set: { availableAt },
          setWhere: sql`${m.providerBudgets.availableAt} < ${availableAt}`,
        });
    },
    async webhookConnection(id) {
      return (
        await db
          .select()
          .from(t.connections)
          .where(and(eq(t.connections.id, id), eq(t.connections.active, true)))
      )[0];
    },
    async acceptMonitorWebhook(connection, observations) {
      if (!observations.length) return;
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select()
          .from(t.connections)
          .where(
            and(
              eq(t.connections.id, connection.id),
              eq(t.connections.workspaceId, connection.workspaceId),
              eq(t.connections.active, true),
            ),
          )
          .for("share");
        if (!active) return;
        const [inbox] = await tx
          .insert(m.monitorInbox)
          .values({
            workspaceId: connection.workspaceId,
            connectionId: connection.id,
            observations,
          })
          .returning();
        await tx.insert(t.jobs).values({
          workspaceId: connection.workspaceId,
          key: `webhook:${inbox.id}`,
          payload: { kind: "monitor.webhook", inboxId: inbox.id },
        });
      });
    },
    async monitorInbox(workspaceId, id) {
      return (
        await db
          .select()
          .from(m.monitorInbox)
          .where(
            and(
              eq(m.monitorInbox.workspaceId, workspaceId),
              eq(m.monitorInbox.id, id),
            ),
          )
      )[0];
    },
    async removeMonitorInbox(workspaceId, id) {
      await db
        .delete(m.monitorInbox)
        .where(
          and(
            eq(m.monitorInbox.workspaceId, workspaceId),
            eq(m.monitorInbox.id, id),
          ),
        );
    },
  };
}
