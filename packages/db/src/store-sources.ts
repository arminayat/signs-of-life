import { and, count, eq, sql } from "drizzle-orm";
import { assert } from "../../core/src/model";
import { isMonitorKind } from "../../core/src/monitoring";
import type { MonitorStore } from "../../core/src/store";
import type { Database } from "./client";
import { workspaceLock } from "./store-delivery";
import * as t from "./schema";
import * as m from "./schema-monitoring";
export function sourceStore(
  db: Database,
): Pick<
  MonitorStore,
  "createSource" | "source" | "connectionSources" | "deleteSource"
> {
  return {
    async createSource(input, limit) {
      return db.transaction(async (tx) => {
        await workspaceLock(tx, input.workspaceId);
        const [total] = await tx
          .select({ count: count() })
          .from(t.sources)
          .where(eq(t.sources.workspaceId, input.workspaceId));
        assert(total.count < limit, "source_limit_reached");
        const { environment, ...values } = input;
        const [source] = await tx
          .insert(t.sources)
          .values({ ...values, environment: environment || "production" })
          .returning();
        if (isMonitorKind(source.kind)) {
          assert(environment, "source_environment_required");
          await tx
            .insert(m.monitorStates)
            .values({
              sourceId: source.id,
              environment,
              notifyAfter: source.baseline,
              historyFrom: new Date(
                source.baseline.getTime() - 365 * 86400_000,
              ),
              historyUntil: source.baseline,
              liveFrom: source.baseline,
            });
          for (const historical of [true, false])
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
              });
        }
        if (source.kind === "supabase")
          await tx.insert(t.jobs).values({
            workspaceId: input.workspaceId,
            key: `supabase:${source.id}`,
            payload: { kind: "supabase.collect", sourceId: source.id },
          });
        if (source.kind === "apple")
          await tx
            .insert(t.jobs)
            .values({
              workspaceId: input.workspaceId,
              key: `apple:${source.connectionId}`,
              payload: {
                kind: "apple.collect",
                connectionId: source.connectionId,
              },
            })
            .onConflictDoUpdate({
              target: t.jobs.key,
              set: { dueAt: new Date(), status: "pending" },
              setWhere: sql`${t.jobs.status} != 'running'`,
            });
        return source;
      });
    },
    async source(workspaceId, id) {
      return (
        await db
          .select()
          .from(t.sources)
          .where(
            and(eq(t.sources.workspaceId, workspaceId), eq(t.sources.id, id)),
          )
      )[0];
    },
    async connectionSources(workspaceId, connectionId) {
      return db
        .select()
        .from(t.sources)
        .where(
          and(
            eq(t.sources.workspaceId, workspaceId),
            eq(t.sources.connectionId, connectionId),
          ),
        );
    },
    async deleteSource(workspaceId, id) {
      await db
        .delete(t.sources)
        .where(
          and(eq(t.sources.workspaceId, workspaceId), eq(t.sources.id, id)),
        );
    },
  };
}
