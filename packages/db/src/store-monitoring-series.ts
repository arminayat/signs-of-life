import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "./client";
import type { MonitoringStore } from "../../core/src/monitor-store";
import type { MetricQuery } from "../../core/src/monitoring";
import * as m from "./schema-monitoring";
function key(query: MetricQuery) {
  return JSON.stringify([
    query.metric,
    Object.entries(query.filters).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
export function monitoringSeriesStore(
  db: Database,
): Pick<MonitoringStore, "saveMetric" | "retainedSeries"> {
  return {
    async saveMetric(id, result, error) {
      await db.transaction(async (tx) => {
        const [request] = await tx
          .update(m.monitorMetrics)
          .set({ ...(result ? { result } : {}), error, updatedAt: new Date() })
          .where(eq(m.monitorMetrics.id, id))
          .returning();
        if (
          !request ||
          error ||
          !result ||
          result.shape !== "series" ||
          !["available", "partial"].includes(result.status)
        )
          return;
        const { unit, currency, timezone, definition, status } = result;
        const unique = new Map(
          result.points
            .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.label))
            .map((p) => [JSON.stringify([p.label, p.series || ""]), p]),
        );
        const values = [...unique.values()].map((p) => ({
          sourceId: request.sourceId,
          key: key(request.query),
          date: p.label,
          series: p.series || "",
          value: p.value,
          metadata: { unit, currency, timezone, definition, status },
          fetchedAt: new Date(result.fetchedAt),
        }));
        for (let i = 0; i < values.length; i += 200)
          await tx
            .insert(m.monitorSeries)
            .values(values.slice(i, i + 200))
            .onConflictDoUpdate({
              target: [
                m.monitorSeries.sourceId,
                m.monitorSeries.key,
                m.monitorSeries.date,
                m.monitorSeries.series,
              ],
              set: {
                value: sql`excluded.value`,
                metadata: sql`excluded.metadata`,
                fetchedAt: sql`excluded.fetched_at`,
              },
              setWhere: sql`${m.monitorSeries.fetchedAt} <= excluded.fetched_at`,
            });
      });
    },
    async retainedSeries(sourceId, query) {
      const rows = await db
        .select()
        .from(m.monitorSeries)
        .where(
          and(
            eq(m.monitorSeries.sourceId, sourceId),
            eq(m.monitorSeries.key, key(query)),
            gte(m.monitorSeries.date, query.from),
            lte(m.monitorSeries.date, query.to),
          ),
        )
        .orderBy(desc(m.monitorSeries.fetchedAt));
      if (!rows.length) return null;
      const newest = rows[0];
      // Never combine a changed reporting currency, unit or timezone.
      const basis = (row: typeof newest) =>
        JSON.stringify([
          row.metadata.currency,
          row.metadata.unit,
          row.metadata.timezone,
        ]);
      const matching = rows
        .filter((row) => basis(row) === basis(newest))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.series.localeCompare(b.series),
        );
      return {
        ...newest.metadata,
        shape: "series",
        status: "partial",
        reason:
          "Provider request failed. Previously collected daily values are shown; missing dates and period totals are unavailable.",
        points: matching.map((row) => ({
          label: row.date,
          value: row.value,
          ...(row.series ? { series: row.series } : {}),
        })),
        fetchedAt: new Date(
          Math.min(...matching.map((row) => row.fetchedAt.getTime())),
        ).toISOString(),
      };
    },
  };
}
