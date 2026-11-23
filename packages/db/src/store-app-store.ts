import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Database, Transaction } from "./client";
import * as t from "./schema";
import type { MonitorStore, Source } from "../../core/src/store";
import type { DownloadMetric } from "../../core/src/model";
import {
  emptySales,
  type AppStoreSales,
  type AppStoreSubscriptions,
  type AppSubscriptionReport,
} from "../../core/src/app-store";
import { lockConnectionSources, lockJob } from "./store-guards";
/** The app's sales breakdown; zeros when the vendor report lists only other apps. */
export function appSales(
  metrics: DownloadMetric[] | null,
  appId: string,
): AppStoreSales | null {
  if (!metrics) return null;
  const metric = metrics.find((metric) => metric.appId === appId);
  return (
    metric?.sales ?? {
      ...emptySales(),
      downloads: metric?.downloads ?? 0,
      redownloads: metric?.redownloads ?? 0,
    }
  );
}
export function appSubscriptions(
  reports: AppSubscriptionReport[] | null | undefined,
  appId: string,
): AppStoreSubscriptions | null {
  return (
    reports?.find((report) => report.appId === appId)?.subscriptions ?? null
  );
}
/** Upserts one source date. A null report keeps what an earlier fetch stored. */
export async function saveAppStoreDay(
  tx: Transaction,
  source: Pick<Source, "id" | "workspaceId">,
  date: string,
  sales: AppStoreSales | null,
  subscriptions: AppStoreSubscriptions | null,
) {
  const merged = {
    sales: sql`coalesce(excluded.sales, ${t.appStoreDays.sales})`,
    subscriptions: sql`coalesce(excluded.subscriptions, ${t.appStoreDays.subscriptions})`,
  };
  await tx
    .insert(t.appStoreDays)
    .values({
      workspaceId: source.workspaceId,
      sourceId: source.id,
      date,
      sales,
      subscriptions,
    })
    .onConflictDoUpdate({
      target: [t.appStoreDays.sourceId, t.appStoreDays.date],
      set: { ...merged, updatedAt: new Date() },
      setWhere: sql`${merged.sales} is distinct from ${t.appStoreDays.sales} or ${merged.subscriptions} is distinct from ${t.appStoreDays.subscriptions}`,
    });
}
export function appStoreStore(
  db: Database,
): Pick<MonitorStore, "appStoreDays" | "saveSubscriptions"> {
  return {
    async saveSubscriptions(connection, date, subscriptions, job) {
      if (!subscriptions) return;
      await db.transaction(async (tx) => {
        await lockJob(tx, job, connection.workspaceId);
        const sources = await lockConnectionSources(tx, connection);
        for (const source of sources ?? []) {
          const subs = appSubscriptions(subscriptions, source.externalId);
          if (subs) await saveAppStoreDay(tx, source, date, null, subs);
        }
      });
    },
    async appStoreDays(workspaceId, sourceId, from, to) {
      return db
        .select({
          date: t.appStoreDays.date,
          sales: t.appStoreDays.sales,
          subscriptions: t.appStoreDays.subscriptions,
        })
        .from(t.appStoreDays)
        .where(
          and(
            eq(t.appStoreDays.workspaceId, workspaceId),
            eq(t.appStoreDays.sourceId, sourceId),
            gte(t.appStoreDays.date, from),
            lte(t.appStoreDays.date, to),
          ),
        )
        .orderBy(t.appStoreDays.date);
    },
  };
}
