import { sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Database } from "./client";
import * as t from "./schema";
import * as m from "./schema-monitoring";

// One bounded batch per table. Callers schedule another maintenance pass when
// a full batch indicates a backlog; job consumption never waits for it to drain.
export async function cleanup(db: Database): Promise<boolean> {
  const batch = 1000;
  let pending = false;
  async function remove(table: PgTable, condition: SQL) {
    const result = await db.execute(sql`delete from ${table} where ctid in
      (select ctid from ${table} where ${condition} limit ${batch})`);
    pending ||= (result.rowCount ?? 0) === batch;
  }
  const history = new Date(Date.now() - 30 * 86400_000);
  const retained = new Date(Date.now() - 365 * 86400_000);
  const metricDate = retained.toISOString().slice(0, 10);
  await remove(t.challenges, sql`${t.challenges.expiresAt} < now()`);
  await remove(t.limits, sql`${t.limits.resetAt} < now()`);
  await remove(
    t.events,
    sql`${t.events.createdAt} < ${retained} and exists
    (select 1 from ${t.sources} where ${t.sources.id} = ${t.events.sourceId}
      and (${t.sources.cursor}->>'at')::timestamptz > ${t.events.occurredAt} + interval '5 minutes')`,
  );
  await remove(
    t.deliveries,
    sql`${t.deliveries.updatedAt} < ${history}
    and ${t.deliveries.status} in ('accepted','failed','uncertain','cancelled')`,
  );
  await remove(
    t.jobs,
    sql`${t.jobs.status} in ('completed','failed') and ${t.jobs.createdAt} < ${history}`,
  );
  await remove(
    t.webhookReceipts,
    sql`${t.webhookReceipts.createdAt} < ${history}`,
  );
  await remove(
    m.monitorEvents,
    sql`${m.monitorEvents.occurredAt} < ${retained} and not exists
    (select 1 from ${m.monitorStates} s join ${t.sources} src on src.id=s.source_id
      where src.project_id=${m.monitorEvents.projectId} and
      (s.history_done=false or s.live_from <= ${m.monitorEvents.occurredAt} + interval '5 minutes'))`,
  );
  await remove(
    m.monitorMetrics,
    sql`(${m.monitorMetrics.query}->>'from') < ${metricDate}`,
  );
  await remove(m.monitorSeries, sql`${m.monitorSeries.date} < ${metricDate}`);
  const pruned =
    await db.execute(sql`update ${m.monitorEvents} set amount=null,currency=null where ctid in
    (select ctid from ${m.monitorEvents} where ${m.monitorEvents.occurredAt} < ${history}
      and (${m.monitorEvents.amount} is not null or ${m.monitorEvents.currency} is not null) limit ${batch})`);
  pending ||= (pruned.rowCount ?? 0) === batch;
  await remove(
    m.monitorInbox,
    sql`${m.monitorInbox.createdAt} < ${history} and not exists
    (select 1 from ${t.jobs} j where j.payload->>'inboxId' = ${m.monitorInbox.id}::text
      and j.status in ('pending','running'))`,
  );
  await remove(t.metrics, sql`${t.metrics.date} < ${metricDate}`);
  await remove(t.reports, sql`${t.reports.date} < ${metricDate}`);
  return pending;
}
