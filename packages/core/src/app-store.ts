/** Totals keyed by a label such as a country code, device, version or currency. */
export type Counts = Record<string, number>;
/** One app's share of Apple's daily Sales summary report. */
export type AppStoreSales = {
  downloads: number;
  redownloads: number;
  updates: number;
  /** In-app purchase and subscription units, renewals included. */
  purchases: number;
  renewals: number;
  /** Units returned (negative units of any product type). */
  refunds: number;
  /** Developer proceeds per proceeds currency; never converted. */
  proceeds: Counts;
  /** Initial downloads by App Store country code. */
  countries: Counts;
  /** Initial downloads by device. */
  devices: Counts;
  /** Updates by app version. */
  versions: Counts;
  /** In-app purchases and subscriptions by product name. */
  products: Record<string, { units: number; proceeds: Counts }>;
};
/** One app's share of Apple's daily Subscription and Subscription Event reports. */
export type AppStoreSubscriptions = {
  /** Active subscriptions at the standard price. */
  active: number;
  /** Active paid introductory, promotional, offer-code and win-back offers. */
  offers: number;
  /** Active free trials of any offer kind. */
  trials: number;
  billingRetry: number;
  gracePeriod: number;
  /** Active subscriptions (paid, offers and trials) by subscription name. */
  plans: Counts;
  /** Subscription events (for example Renew, Cancel, Refund) by name. */
  events: Counts;
};
export type AppSubscriptionReport = {
  appId: string;
  subscriptions: AppStoreSubscriptions;
};
/** Stored per App Store source and Apple reporting date; null means no report. */
export type AppStoreDay = {
  date: string;
  sales: AppStoreSales | null;
  subscriptions: AppStoreSubscriptions | null;
};
export type AppStoreStats = {
  dates: string[];
  days: {
    date: string;
    downloads: number | null;
    redownloads: number | null;
    updates: number | null;
    purchases: number | null;
    proceeds: Counts | null;
    active: number | null;
    trials: number | null;
  }[];
  /** Dates in range with a Sales report (others had no report). */
  reportDays: number;
  totals: Omit<
    AppStoreSales,
    "countries" | "devices" | "versions" | "products"
  >;
  countries: Counts;
  devices: Counts;
  versions: Counts;
  products: { name: string; units: number; proceeds: Counts }[];
  /** Newest subscription snapshot in range. */
  subscriptions: (AppStoreSubscriptions & { date: string }) | null;
  /** Subscription events summed over the range. */
  events: Counts;
};
/** Live App Store details, read on request and never stored. */
export type AppStoreListing = {
  storeUrl: string | null;
  versions:
    | { version: string; state: string; platform: string; created: string }[]
    | null;
  reviews: {
    total: number;
    average: number | null;
    latest: {
      rating: number;
      title: string;
      body: string;
      territory: string;
      created: string;
    }[];
  } | null;
  ratings: { country: string; average: number; count: number }[];
};
export function emptySales(): AppStoreSales {
  return {
    downloads: 0,
    redownloads: 0,
    updates: 0,
    purchases: 0,
    renewals: 0,
    refunds: 0,
    proceeds: {},
    countries: {},
    devices: {},
    versions: {},
    products: {},
  };
}
export function emptySubscriptions(): AppStoreSubscriptions {
  return {
    active: 0,
    offers: 0,
    trials: 0,
    billingRetry: 0,
    gracePeriod: 0,
    plans: {},
    events: {},
  };
}
export function addCount(counts: Counts, key: string, value: number) {
  if (!value) return;
  counts[key] = round((counts[key] ?? 0) + value);
}
function addAll(target: Counts, source: Counts) {
  for (const [key, value] of Object.entries(source))
    addCount(target, key, value);
}
/** Money and unit sums stay exact to the cent despite binary floating point. */
export function round(value: number) {
  return Math.round(value * 100) / 100;
}
/** Aggregates stored days for `dates` (ascending); missing reports stay null. */
export function summarizeAppStore(
  dates: string[],
  rows: AppStoreDay[],
): AppStoreStats {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const totals = emptySales();
  const products = new Map<string, { units: number; proceeds: Counts }>();
  const events: Counts = {};
  let reportDays = 0;
  let subscriptions: AppStoreStats["subscriptions"] = null;
  const days = dates.map((date) => {
    const { sales = null, subscriptions: subs = null } = byDate.get(date) ?? {};
    if (sales) {
      reportDays++;
      for (const key of [
        "downloads",
        "redownloads",
        "updates",
        "purchases",
        "renewals",
        "refunds",
      ] as const)
        totals[key] += sales[key];
      for (const key of [
        "proceeds",
        "countries",
        "devices",
        "versions",
      ] as const)
        addAll(totals[key], sales[key]);
      for (const [name, product] of Object.entries(sales.products)) {
        const item = products.get(name) ?? { units: 0, proceeds: {} };
        item.units += product.units;
        addAll(item.proceeds, product.proceeds);
        products.set(name, item);
      }
    }
    if (subs) {
      addAll(events, subs.events);
      subscriptions = { ...subs, date };
    }
    return {
      date,
      downloads: sales?.downloads ?? null,
      redownloads: sales?.redownloads ?? null,
      updates: sales?.updates ?? null,
      purchases: sales?.purchases ?? null,
      proceeds: sales?.proceeds ?? null,
      active: subs?.active ?? null,
      trials: subs?.trials ?? null,
    };
  });
  const { countries, devices, versions } = totals;
  return {
    dates,
    days,
    reportDays,
    totals: {
      downloads: totals.downloads,
      redownloads: totals.redownloads,
      updates: totals.updates,
      purchases: totals.purchases,
      renewals: totals.renewals,
      refunds: totals.refunds,
      proceeds: totals.proceeds,
    },
    countries,
    devices,
    versions,
    products: [...products]
      .map(([name, product]) => ({ name, ...product }))
      .sort((a, b) => b.units - a.units),
    subscriptions,
    events,
  };
}
/** Every date from `from` to `to` inclusive (YYYY-MM-DD, ascending). */
export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (
    let at = Date.parse(`${from}T00:00:00Z`);
    at <= Date.parse(`${to}T00:00:00Z`) && dates.length <= 400;
    at += 86400_000
  )
    dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
}
