import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import * as t from "./schema";
import { cleanup } from "./store-cleanup";
import type { Job, MonitorStore } from "../../core/src/store";
export function jobStore(
  db: Database,
): Pick<
  MonitorStore,
  | "enqueue"
  | "claim"
  | "finish"
  | "dueJobs"
  | "reserveDueJobs"
  | "releaseDispatch"
  | "jobDiagnostics"
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
        .orderBy(t.jobs.dueAt, t.jobs.id)
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
      return cleanup(db);
    },
    async reserveDueJobs(limit) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: t.jobs.id })
          .from(t.jobs)
          .where(
            sql`${t.jobs.status} in ('pending','running') and ${t.jobs.dueAt} <= now()
            and (${t.jobs.leaseUntil} is null or ${t.jobs.leaseUntil} < now())
            and (${t.jobs.dispatchedAt} is null or ${t.jobs.dispatchedAt} < now() - interval '2 minutes')`,
          )
          .orderBy(t.jobs.dueAt, t.jobs.id)
          .limit(limit)
          .for("update", { skipLocked: true });
        const ids = rows.map((row) => row.id);
        if (ids.length)
          await tx
            .update(t.jobs)
            .set({ dispatchedAt: new Date() })
            .where(inArray(t.jobs.id, ids));
        return ids;
      });
    },
    async releaseDispatch(ids) {
      if (ids.length)
        await db
          .update(t.jobs)
          .set({ dispatchedAt: null })
          .where(and(inArray(t.jobs.id, ids), eq(t.jobs.status, "pending")));
    },
    async jobDiagnostics() {
      const result = await db.execute(sql`select
        min(due_at) filter (where status='pending' and due_at <= now()) as oldest_due_at,
        count(*) filter (where status='pending')::int as pending,
        count(*) filter (where status='running')::int as running,
        count(*) filter (where status='running' and lease_until < now())::int as expired_leases,
        count(*) filter (where status='failed')::int as failed,
        (select min(last_success_at) from ${t.sources}) as oldest_source_success_at
        from ${t.jobs}`);
      const row = result.rows[0];
      return {
        oldestDueAt: row.oldest_due_at
          ? new Date(row.oldest_due_at as string)
          : null,
        pending: Number(row.pending),
        running: Number(row.running),
        expiredLeases: Number(row.expired_leases),
        failed: Number(row.failed),
        oldestSourceSuccessAt: row.oldest_source_success_at
          ? new Date(row.oldest_source_success_at as string)
          : null,
      };
    },
  };
}
