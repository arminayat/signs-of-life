import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import * as t from "./schema";
import type { Job, MonitorStore } from "../../core/src/store";
export function jobStore(
  db: Database,
): Pick<
  MonitorStore,
  | "enqueue"
  | "claim"
  | "finish"
  | "dueJobs"
  | "markDispatched"
  | "cleanup"
  | "receipt"
> {
  return {
    async enqueue(workspaceId, key, payload, dueAt = new Date()) {
      await db
        .insert(t.jobs)
        .values({ workspaceId, key, payload, dueAt })
        .onConflictDoUpdate({
          target: t.jobs.key,
          set: {
            status: "pending",
            dueAt,
            lastError: null,
            attempts: 0,
            leaseToken: null,
            leaseUntil: null,
            dispatchedAt: null,
          },
          setWhere: sql`${t.jobs.status} in ('completed', 'failed')`,
        });
    },
    async dueJobs(limit) {
      const rows = await db
        .select({ id: t.jobs.id })
        .from(t.jobs)
        .where(
          sql`${t.jobs.status} in ('pending','running') and ${t.jobs.dueAt} <= now() and (${t.jobs.leaseUntil} is null or ${t.jobs.leaseUntil} < now()) and (${t.jobs.dispatchedAt} is null or ${t.jobs.dispatchedAt} < now() - interval '2 minutes')`,
        )
        .limit(limit);
      return rows.map((row) => row.id);
    },
    async markDispatched(id) {
      await db
        .update(t.jobs)
        .set({ dispatchedAt: new Date() })
        .where(eq(t.jobs.id, id));
    },
    async claim(id) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(t.jobs)
          .where(
            and(
              id ? eq(t.jobs.id, id) : undefined,
              sql`${t.jobs.status} in ('pending','running') and ${t.jobs.dueAt} <= now() and (${t.jobs.leaseUntil} is null or ${t.jobs.leaseUntil} < now())`,
            ),
          )
          .orderBy(t.jobs.dueAt)
          .limit(1)
          .for("update", { skipLocked: true });
        if (!row) return undefined;
        const [claimed] = await tx
          .update(t.jobs)
          .set({
            status: "running",
            leaseToken: crypto.randomUUID(),
            leaseUntil: new Date(Date.now() + 300_000),
            attempts: sql`${t.jobs.attempts} + 1`,
          })
          .where(eq(t.jobs.id, row.id))
          .returning();
        return claimed;
      });
    },
    async finish(job: Job, next, error) {
      if (!job.leaseToken) return;
      await db
        .update(t.jobs)
        .set({
          status: next ? "pending" : error ? "failed" : "completed",
          dueAt: next ?? new Date(),
          lastError: error ?? null,
          leaseToken: null,
          leaseUntil: null,
          dispatchedAt: null,
          attempts: next && !error ? 0 : job.attempts,
        })
        .where(
          and(eq(t.jobs.id, job.id), eq(t.jobs.leaseToken, job.leaseToken)),
        );
    },
    async receipt(key) {
      return (
        (
          await db
            .insert(t.webhookReceipts)
            .values({ key })
            .onConflictDoNothing()
            .returning()
        ).length > 0
      );
    },
    async cleanup() {
      await db
        .delete(t.challenges)
        .where(lt(t.challenges.expiresAt, new Date()));
      await db.delete(t.limits).where(lt(t.limits.resetAt, new Date()));
      const history = new Date(Date.now() - 30 * 86400_000);
      await db
        .delete(t.events)
        .where(
          and(
            lt(t.events.createdAt, history),
            sql`exists(select 1 from ${t.sources} where ${t.sources.id} = ${t.events.sourceId} and (${t.sources.cursor}->>'at')::timestamptz > ${t.events.occurredAt} + interval '5 minutes')`,
          ),
        );
      await db
        .delete(t.deliveries)
        .where(
          and(
            lt(t.deliveries.updatedAt, history),
            sql`${t.deliveries.status} in ('accepted','failed','uncertain','cancelled')`,
          ),
        );
      await db
        .delete(t.jobs)
        .where(
          and(
            sql`${t.jobs.status} in ('completed', 'failed')`,
            lt(t.jobs.createdAt, history),
          ),
        );
      await db
        .delete(t.webhookReceipts)
        .where(lt(t.webhookReceipts.createdAt, history));
      const metricDate = new Date(Date.now() - 90 * 86400_000)
        .toISOString()
        .slice(0, 10);
      await db.delete(t.metrics).where(lt(t.metrics.date, metricDate));
      await db.delete(t.reports).where(lt(t.reports.date, metricDate));
    },
  };
}
