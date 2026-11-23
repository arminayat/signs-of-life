import { importPKCS8, SignJWT } from "jose";
import type {
  AppleCredentials,
  DownloadMetric,
  ReportSource,
} from "../../core/src/model";
import { AppError } from "../../core/src/model";
import {
  addCount,
  emptySales,
  emptySubscriptions,
  type AppStoreListing,
  type AppStoreSales,
  type AppStoreSubscriptions,
  type AppSubscriptionReport,
} from "../../core/src/app-store";
import { boundedText, type Http } from "./http";
const initial = new Set(["1", "1E", "1EP", "1EU", "1F", "1T", "F1"]);
const redownload = new Set(["3", "3F"]);
const update = new Set(["7", "7F", "7T", "F7"]);
const inApp = (type: string) => /^(IA|FI)/.test(type);
type Table = { columns: Record<string, number>; rows: string[][] };
function table(report: string, required: string[]): Table {
  const lines = report.replace(/^﻿/, "").split(/\r?\n/);
  const names = lines.shift()?.split("\t") ?? [];
  const columns = Object.fromEntries(
    names.map((name, index) => [name.trim(), index]),
  );
  for (const column of required)
    if (!(column in columns))
      throw new AppError("apple_report_format_changed", 502);
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    if (fields.length !== names.length)
      throw new AppError("apple_report_row_invalid", 502);
    rows.push(fields.map((field) => field.trim()));
  }
  return { columns, rows };
}
function reader({ columns }: Table, row: string[]) {
  const text = (name: string) => (name in columns ? row[columns[name]] : "");
  const number = (name: string) => {
    const value = Number(text(name) || 0);
    if (!Number.isFinite(value))
      throw new AppError("apple_report_row_invalid", 502);
    return value;
  };
  return { text, number };
}
type Parent = { appId: string; title: string } | null;
/**
 * Splits Apple's daily Sales summary by app. App rows carry the Apple ID; in-app
 * rows name their app by SKU (Parent Identifier), resolved from the report's own
 * app rows or `parents`. SKUs found in neither are returned as unresolved.
 */
export function summarizeSalesReport(
  report: string,
  parents: Record<string, Parent> = {},
): { metrics: DownloadMetric[]; unresolved: string[] } {
  const data = table(report, [
    "Apple Identifier",
    "Title",
    "Product Type Identifier",
    "Units",
  ]);
  const skus = new Map<string, Parent>(Object.entries(parents));
  for (const row of data.rows) {
    const { text } = reader(data, row);
    const appId = text("Apple Identifier");
    if (
      !inApp(text("Product Type Identifier")) &&
      text("SKU") &&
      /^\d+$/.test(appId)
    )
      skus.set(text("SKU"), { appId, title: text("Title") });
  }
  const apps = new Map<string, DownloadMetric & { sales: AppStoreSales }>();
  const entry = (appId: string, title: string) => {
    const app = apps.get(appId) ?? {
      appId,
      title: title.slice(0, 120),
      downloads: 0,
      redownloads: 0,
      sales: emptySales(),
    };
    apps.set(appId, app);
    return app;
  };
  const unresolved = new Set<string>();
  for (const row of data.rows) {
    const { text, number } = reader(data, row);
    const type = text("Product Type Identifier");
    const units = Number(text("Units"));
    if (!Number.isSafeInteger(units))
      throw new AppError("apple_report_row_invalid", 502);
    const known =
      initial.has(type) ||
      redownload.has(type) ||
      update.has(type) ||
      inApp(type);
    if (!known) continue;
    let app;
    if (inApp(type)) {
      const parent = skus.get(text("Parent Identifier"));
      if (!parent) {
        if (!skus.has(text("Parent Identifier")))
          unresolved.add(text("Parent Identifier"));
        continue;
      }
      app = entry(parent.appId, parent.title);
    } else {
      if (!/^\d+$/.test(text("Apple Identifier")))
        throw new AppError("apple_report_row_invalid", 502);
      app = entry(text("Apple Identifier"), text("Title"));
    }
    const sales = app.sales;
    const currency = text("Currency of Proceeds");
    const proceeds = units * number("Developer Proceeds");
    if (currency) addCount(sales.proceeds, currency, proceeds);
    if (inApp(type)) {
      const product = (sales.products[text("Title").slice(0, 120)] ??= {
        units: 0,
        proceeds: {},
      });
      if (units > 0) product.units += units;
      if (currency) addCount(product.proceeds, currency, proceeds);
    }
    if (units < 0) {
      sales.refunds -= units;
      continue;
    }
    if (initial.has(type)) {
      app.downloads += units;
      sales.downloads += units;
      if (text("Country Code"))
        addCount(sales.countries, text("Country Code"), units);
      if (text("Device")) addCount(sales.devices, text("Device"), units);
    } else if (redownload.has(type)) {
      app.redownloads += units;
      sales.redownloads += units;
    } else if (update.has(type)) {
      sales.updates += units;
      addCount(sales.versions, text("Version") || "Unknown", units);
    } else {
      sales.purchases += units;
      if (text("Subscription") === "Renewal") sales.renewals += units;
    }
  }
  return {
    metrics: [...apps.values()],
    unresolved: [...unresolved].filter(Boolean),
  };
}
export function parseSalesReport(
  report: string,
  parents: Record<string, Parent> = {},
): DownloadMetric[] {
  return summarizeSalesReport(report, parents).metrics;
}
/** Splits Apple's daily Subscription and Subscription Event reports by app. */
export function parseSubscriptionReports(
  summary: string | null,
  events: string | null,
): AppSubscriptionReport[] {
  const apps = new Map<string, AppStoreSubscriptions>();
  const entry = (appId: string) => {
    if (!/^\d+$/.test(appId))
      throw new AppError("apple_report_row_invalid", 502);
    const app = apps.get(appId) ?? emptySubscriptions();
    apps.set(appId, app);
    return app;
  };
  if (summary) {
    const data = table(summary, [
      "App Apple ID",
      "Subscription Name",
      "Active Standard Price Subscriptions",
    ]);
    const names = Object.keys(data.columns);
    const trialColumns = names.filter((n) => /^(Active )?Free Trial /.test(n));
    const offerColumns = names.filter((n) =>
      /^(Active )?Pay (Up Front|As You Go) /.test(n),
    );
    for (const row of data.rows) {
      const { text, number } = reader(data, row);
      const app = entry(text("App Apple ID"));
      const active = number("Active Standard Price Subscriptions");
      const trials = trialColumns.reduce((sum, n) => sum + number(n), 0);
      const offers = offerColumns.reduce((sum, n) => sum + number(n), 0);
      app.active += active;
      app.trials += trials;
      app.offers += offers;
      app.billingRetry += number("Billing Retry");
      app.gracePeriod += number("Grace Period");
      addCount(
        app.plans,
        text("Subscription Name").slice(0, 120),
        active + trials + offers,
      );
    }
  }
  if (events) {
    const data = table(events, ["App Apple ID", "Event", "Quantity"]);
    for (const row of data.rows) {
      const { text, number } = reader(data, row);
      addCount(
        entry(text("App Apple ID")).events,
        text("Event").slice(0, 80),
        number("Quantity"),
      );
    }
  }
  return [...apps].map(([appId, subscriptions]) => ({ appId, subscriptions }));
}
async function bearer(credentials: AppleCredentials) {
  const key = await importPKCS8(credentials.privateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: credentials.keyId, typ: "JWT" })
    .setIssuer(credentials.issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}
export function appleSource(http: Http = fetch): ReportSource {
  // In-app rows name their app by SKU. Lookups are cached per Apple team,
  // because SKUs are only unique within one account.
  const parents = new Map<string, Record<string, Parent>>();
  async function call(
    credentials: AppleCredentials,
    path: string,
    accept = "application/json",
  ) {
    return http(new URL(path, "https://api.appstoreconnect.apple.com"), {
      headers: {
        Authorization: `Bearer ${await bearer(credentials)}`,
        Accept: accept,
      },
      signal: AbortSignal.timeout(30_000),
    });
  }
  async function json<T>(
    credentials: AppleCredentials,
    path: string,
  ): Promise<T | null> {
    const response = await call(credentials, path);
    // The key's role may not allow this resource; the stats page says so.
    if ([401, 403, 404].includes(response.status)) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(`apple_http_${response.status}`, 502);
    }
    return JSON.parse(await boundedText(response)) as T;
  }
  async function download(
    credentials: AppleCredentials,
    date: string,
    reportType: string,
    version: string,
    optional = false,
  ): Promise<string | null> {
    const response = await call(
      credentials,
      `/v1/salesReports?${new URLSearchParams({
        "filter[frequency]": "DAILY",
        "filter[reportDate]": date,
        "filter[reportSubType]": "SUMMARY",
        "filter[reportType]": reportType,
        "filter[vendorNumber]": credentials.vendorNumber,
        "filter[version]": version,
      })}`,
      "application/a-gzip",
    );
    // 404: no report for that date (for example, no sales). 410: older than
    // Apple's one-year retention. Both mean the report is unavailable. Optional
    // reports are also unavailable when the key's role cannot read them.
    if (
      response.status === 404 ||
      response.status === 410 ||
      (optional && response.status === 403)
    ) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(`apple_http_${response.status}`, 502);
    }
    if (!response.body) throw new AppError("apple_empty_report", 502);
    // Sales report payloads are gzip files, independent of HTTP content encoding.
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    return boundedText(new Response(stream), 32_000_000);
  }
  return {
    async report(credentials, date) {
      const report = await download(credentials, date, "SALES", "1_0");
      if (report === null) return null;
      const team = `${credentials.issuerId}:${credentials.vendorNumber}`;
      const known = parents.get(team) ?? {};
      parents.set(team, known);
      const result = summarizeSalesReport(report, known);
      if (!result.unresolved.length) return result.metrics;
      for (const sku of result.unresolved) {
        const body = await json<{
          data?: { id: string; attributes?: { name?: string } }[];
        }>(
          credentials,
          `/v1/apps?${new URLSearchParams({ "filter[sku]": sku, "fields[apps]": "name", limit: "1" })}`,
        );
        const app = body?.data?.[0];
        known[sku] =
          app && /^\d+$/.test(app.id)
            ? { appId: app.id, title: app.attributes?.name ?? "" }
            : null;
      }
      return summarizeSalesReport(report, known).metrics;
    },
    async subscriptions(credentials, date) {
      const [summary, events] = await Promise.all([
        download(credentials, date, "SUBSCRIPTION", "1_4", true),
        download(credentials, date, "SUBSCRIPTION_EVENT", "1_4", true),
      ]);
      if (summary === null && events === null) return null;
      return parseSubscriptionReports(summary, events);
    },
    async listing(credentials, appId, countries) {
      if (!/^\d+$/.test(appId)) throw new AppError("invalid_apple_app_id", 400);
      const [versions, reviews, ratings] = await Promise.all([
        json<{
          data: {
            attributes: {
              versionString: string;
              appStoreState: string;
              platform: string;
              createdDate: string;
            };
          }[];
        }>(
          credentials,
          `/v1/apps/${appId}/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appStoreState,platform,createdDate`,
        ),
        json<{
          data: {
            attributes: {
              rating: number;
              title?: string;
              body?: string;
              territory: string;
              createdDate: string;
            };
          }[];
          meta?: { paging?: { total?: number } };
        }>(
          credentials,
          // Reviewer nicknames are deliberately not requested.
          `/v1/apps/${appId}/customerReviews?limit=200&sort=-createdDate&fields[customerReviews]=rating,title,body,territory,createdDate`,
        ),
        // Public storefront lookups include star-only ratings, unlike reviews.
        Promise.all(
          countries.slice(0, 10).map(async (country) => {
            try {
              const response = await http(
                `https://itunes.apple.com/lookup?id=${appId}&country=${country.toLowerCase()}`,
                { signal: AbortSignal.timeout(10_000) },
              );
              if (!response.ok) {
                await response.body?.cancel();
                return null;
              }
              const result = (
                JSON.parse(await boundedText(response, 500_000)) as {
                  results?: {
                    averageUserRating?: number;
                    userRatingCount?: number;
                    trackViewUrl?: string;
                  }[];
                }
              ).results?.[0];
              return result ? { country, ...result } : null;
            } catch {
              return null;
            }
          }),
        ),
      ]);
      const found = ratings.filter((rating) => rating !== null);
      const url = found.find((r) => r.trackViewUrl)?.trackViewUrl;
      const rated = reviews?.data.map((review) => review.attributes) ?? [];
      return {
        storeUrl: url?.startsWith("https://apps.apple.com/")
          ? url.split("?")[0]
          : null,
        versions:
          versions?.data.map(({ attributes }) => ({
            version: attributes.versionString,
            state: attributes.appStoreState,
            platform: attributes.platform,
            created: attributes.createdDate,
          })) ?? null,
        reviews: reviews && {
          total: reviews.meta?.paging?.total ?? rated.length,
          average: rated.length
            ? Math.round(
                (rated.reduce((sum, r) => sum + r.rating, 0) / rated.length) *
                  100,
              ) / 100
            : null,
          latest: rated.slice(0, 10).map((review) => ({
            rating: review.rating,
            title: (review.title ?? "").slice(0, 200),
            body: (review.body ?? "").slice(0, 1000),
            territory: review.territory,
            created: review.createdDate,
          })),
        },
        ratings: found
          .filter((r) => (r.userRatingCount ?? 0) > 0)
          .map((r) => ({
            country: r.country,
            average: Math.round((r.averageUserRating ?? 0) * 100) / 100,
            count: r.userRatingCount ?? 0,
          }))
          .sort((a, b) => b.count - a.count),
      } satisfies AppStoreListing;
    },
  };
}
