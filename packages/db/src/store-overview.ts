import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import type { Database } from "./client";
import type { MonitorStore } from "../../core/src/store";
import { localDay } from "../../core/src/time";
import * as t from "./schema";
export function overviewStore(
  db: Database,
): Pick<MonitorStore, "projectOverview"> {
  return {
    async projectOverview(project) {
      const now = new Date();
      const today = localDay(now, project.timezone);
      const dates = Array.from({ length: 30 }, (_, index) =>
        new Date(Date.parse(`${today}T00:00:00Z`) - (29 - index) * 86400_000)
          .toISOString()
          .slice(0, 10),
      );
      const accountDate = sql<string>`to_char(${t.events.occurredAt} at time zone ${project.timezone}, 'YYYY-MM-DD')`;
      const [accounts, downloads] = await Promise.all([
        db
          .select({ date: accountDate.as("account_date"), count: count() })
          .from(t.events)
          .innerJoin(t.sources, eq(t.events.sourceId, t.sources.id))
          .where(
            and(
              eq(t.events.workspaceId, project.workspaceId),
              eq(t.sources.projectId, project.id),
              eq(t.sources.kind, "supabase"),
              eq(t.events.anonymous, false),
              gte(
                t.events.occurredAt,
                fromZonedTime(`${dates[0]}T00:00:00`, project.timezone),
              ),
              lte(t.events.occurredAt, now),
            ),
          )
          .groupBy(sql`account_date`)
          .orderBy(sql`account_date`),
        db
          .select({
            date: t.metrics.date,
            downloads: sql<number>`sum(${t.metrics.downloads})`.mapWith(Number),
            redownloads: sql<number>`sum(${t.metrics.redownloads})`.mapWith(
              Number,
            ),
            sourceCount: count(),
          })
          .from(t.metrics)
          .innerJoin(t.sources, eq(t.metrics.sourceId, t.sources.id))
          .where(
            and(
              eq(t.metrics.workspaceId, project.workspaceId),
              eq(t.sources.projectId, project.id),
              eq(t.sources.kind, "apple"),
              gte(t.metrics.date, dates[0]),
              lte(t.metrics.date, today),
            ),
          )
          .groupBy(t.metrics.date)
          .orderBy(t.metrics.date),
      ]);
      return { dates, accounts, downloads };
    },
  };
}
