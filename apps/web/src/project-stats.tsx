import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@heroui/react";
import {
  Coins,
  Download,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Smartphone,
  Users,
} from "lucide-react";
import type {
  AppStoreStats,
  Counts,
} from "../../../packages/core/src/app-store";
import { calendarRange } from "../../../packages/core/src/time";
import { api, type Dashboard, type Project } from "./data";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  Notice,
  PageHeader,
  SelectField,
} from "./ui";
import { ProjectChart } from "./project-chart";
import { AppStoreListingCard } from "./app-store-listing";
import { countryName, deviceName, money, moneyList } from "./app-store-format";
import "./monitoring.css";
type Day = AppStoreStats["days"][number];
export function ProjectStats({
  project,
  data,
}: {
  project: Project;
  data: Dashboard;
}) {
  const apps = data.sources.filter(
    (source) => source.projectId === project.id && source.kind === "apple",
  );
  const [sourceId, setSourceId] = useState(apps[0]?.id);
  const [days, setDays] = useState("30");
  const source = apps.find((app) => app.id === sourceId) ?? apps[0];
  const header = (
    <PageHeader
      title="Stats"
      description="App Store Connect statistics: downloads, updates, purchases, proceeds, subscriptions, ratings and reviews."
    />
  );
  if (!source)
    return (
      <>
        {header}
        <EmptyState
          icon={<Smartphone />}
          title="No App Store app yet"
          description="Add an App Store source to see its downloads, revenue, subscriptions and reviews. A year of history is imported automatically."
          action={
            <Link className="text-link" to={`/projects/${project.id}/sources`}>
              Add a source →
            </Link>
          }
        />
      </>
    );
  return (
    <>
      {header}
      <div className="monitor-toolbar">
        {apps.length > 1 && (
          <SelectField
            name="app"
            label="App"
            value={source.id}
            onChange={setSourceId}
          >
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField
          name="range"
          label="Date range"
          value={days}
          onChange={setDays}
        >
          {[7, 30, 90, 365].map((n) => (
            <option key={n} value={n}>
              Last {n} days
            </option>
          ))}
        </SelectField>
      </div>
      <AppStats
        key={source.id}
        sourceId={source.id}
        range={calendarRange(new Date(), project.timezone, Number(days))}
      />
    </>
  );
}
function AppStats({
  sourceId,
  range,
}: {
  sourceId: string;
  range: { from: string; to: string };
}) {
  const query = useQuery({
    queryKey: ["app-store", sourceId, range],
    queryFn: () =>
      api<AppStoreStats>(
        `/sources/${sourceId}/app-store?from=${range.from}&to=${range.to}`,
      ),
    staleTime: 300_000,
    refetchInterval: 900_000,
  });
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  const stats = query.data;
  const { totals, subscriptions } = stats;
  const currencies = ranked(totals.proceeds);
  const main = currencies[0]?.label;
  const weekly = stats.dates.length > 45;
  const period = weekly ? "week" : "day";
  const series = (
    pick: (day: Day) => number | null,
    combine: (values: (number | null)[]) => number | null = sum,
  ) =>
    buckets(stats.days, weekly).map((bucket) => ({
      date: bucket.date,
      value: combine(bucket.days.map(pick)),
    }));
  const unit = weekly ? "Weekly totals" : "Apple reporting dates";
  const noData = stats.reportDays ? null : "—";
  const tiles = [
    {
      label: "New downloads",
      value: noData ?? totals.downloads.toLocaleString(),
      foot: "First-time downloads",
      icon: Download,
    },
    {
      label: "Redownloads",
      value: noData ?? totals.redownloads.toLocaleString(),
      foot: "Downloads by returning users",
      icon: RotateCcw,
    },
    {
      label: "Updates",
      value: noData ?? totals.updates.toLocaleString(),
      foot: ranked(stats.versions)[0]
        ? `Most to version ${ranked(stats.versions)[0].label}`
        : "App updates installed",
      icon: RefreshCw,
    },
    {
      label: "In-app purchases",
      value: noData ?? totals.purchases.toLocaleString(),
      foot: `${totals.renewals.toLocaleString()} renewals · ${totals.refunds.toLocaleString()} refunds`,
      icon: ShoppingBag,
    },
    {
      label: "Proceeds",
      value: noData ?? (main ? money(totals.proceeds[main], main) : "0"),
      foot:
        currencies.length > 1
          ? `Also ${moneyList(Object.fromEntries(currencies.slice(1).map((c) => [c.label, c.value])))}`
          : "After Apple's commission, not converted",
      icon: Coins,
    },
    {
      label: "Active subscriptions",
      value: subscriptions
        ? (subscriptions.active + subscriptions.offers).toLocaleString()
        : "—",
      foot: subscriptions
        ? `${subscriptions.trials.toLocaleString()} in free trial · ${subscriptions.date}`
        : "No subscription reports in this range",
      icon: Users,
    },
  ];
  return (
    <>
      <p className="muted text-xs mb-5">
        {range.from} – {range.to} · {stats.reportDays} of {stats.dates.length}{" "}
        days have an App Store report. Apple publishes each day's report the
        next day.
      </p>
      {!stats.reportDays && (
        <Notice>
          No App Store reports in this range yet. After you add an app, its year
          of history is imported in the background; this can take up to an hour.
        </Notice>
      )}
      <div className="stat-grid">
        {tiles.map(({ label, value, foot, icon: Icon }) => (
          <Card className="stat" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={15} />
            </div>
            <span className="stat-value">{value}</span>
            <p className="stat-foot">{foot}</p>
          </Card>
        ))}
      </div>
      <div className="project-charts">
        <ProjectChart
          title="New downloads"
          description={`${unit}. Blank ${weekly ? "weeks" : "dates"} have no report.`}
          period={period}
          points={series((day) => day.downloads)}
          empty="No App Store reports in this range."
        />
        <ProjectChart
          title="Updates"
          description={`${unit}. Installs of a new version by existing users.`}
          period={period}
          points={series((day) => day.updates)}
          empty="No App Store reports in this range."
        />
        {(totals.purchases > 0 || stats.products.length > 0) && (
          <ProjectChart
            title="In-app purchases"
            description={`${unit}. Purchases and subscription renewals.`}
            period={period}
            points={series((day) => day.purchases)}
            empty="No App Store reports in this range."
          />
        )}
        {main && (
          <ProjectChart
            title={`Proceeds (${main})`}
            description={`${unit}. Developer proceeds in ${main}; other currencies are not converted.`}
            period={period}
            format={(value) => money(value, main)}
            points={series((day) =>
              day.proceeds ? (day.proceeds[main] ?? 0) : null,
            )}
            empty="No proceeds in this range."
          />
        )}
        {stats.days.some((day) => day.active !== null) && (
          <ProjectChart
            title="Active subscriptions"
            description={`${weekly ? "Last day of each week" : "Apple reporting dates"}. Paid subscriptions, including introductory offers.`}
            period={period}
            points={series((day) => day.active, last)}
            empty="No subscription reports in this range."
          />
        )}
      </div>
      <div className="section-heading">
        <h2>Breakdown</h2>
      </div>
      <div className="stats-breakdowns">
        <Breakdown
          title="Countries"
          description="New downloads by App Store country."
          rows={ranked(stats.countries).map((row) => ({
            ...row,
            label: countryName(row.label),
          }))}
          empty="No downloads in this range."
        />
        <Breakdown
          title="Devices"
          description="New downloads by device."
          rows={ranked(stats.devices).map((row) => ({
            ...row,
            label: deviceName(row.label),
          }))}
          empty="No downloads in this range."
        />
        <Breakdown
          title="Versions"
          description="Updates by app version."
          rows={ranked(stats.versions)}
          empty="No updates in this range."
        />
        <Breakdown
          title="In-app products"
          description="Units sold and proceeds by product."
          rows={stats.products.map((product) => ({
            label: product.name,
            value: product.units,
            detail: moneyList(product.proceeds),
          }))}
          empty="No in-app purchases in this range."
        />
        {(subscriptions || Object.keys(stats.events).length > 0) && (
          <>
            <Breakdown
              title="Subscription plans"
              description={
                subscriptions
                  ? `Active subscriptions by plan on ${subscriptions.date}, trials included.`
                  : "Active subscriptions by plan."
              }
              rows={ranked(subscriptions?.plans ?? {})}
              empty="No active subscriptions."
            />
            <Breakdown
              title="Subscription events"
              description="Renewals, trials, cancellations and refunds in this range."
              rows={ranked(stats.events)}
              empty="No subscription events in this range."
            />
          </>
        )}
      </div>
      <AppStoreListingCard
        sourceId={sourceId}
        countries={ranked(stats.countries)
          .slice(0, 10)
          .map((row) => row.label)}
      />
    </>
  );
}
function Breakdown({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: { label: string; value: number; detail?: string }[];
  empty: string;
}) {
  const top = rows.slice(0, 8);
  const max = Math.max(1, ...top.map((row) => row.value));
  return (
    <Card className="stats-breakdown">
      <div>
        <h2>{title}</h2>
        <p className="muted text-xs mt-1">{description}</p>
      </div>
      {top.length ? (
        <ul>
          {top.map((row) => (
            <li key={row.label}>
              <div className="breakdown-row">
                <span className="breakdown-label">{row.label}</span>
                <span className="breakdown-value">
                  {row.value.toLocaleString()}
                  {row.detail && <span className="muted"> · {row.detail}</span>}
                </span>
              </div>
              <div className="breakdown-bar" aria-hidden="true">
                <span style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">{empty}</p>
      )}
      {rows.length > top.length && (
        <p className="muted text-xs">
          +{rows.length - top.length} more, totalling{" "}
          {rows
            .slice(top.length)
            .reduce((total, row) => total + row.value, 0)
            .toLocaleString()}
        </p>
      )}
    </Card>
  );
}
function ranked(counts: Counts) {
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}
function sum(values: (number | null)[]) {
  return values.every((value) => value === null)
    ? null
    : Math.round(values.reduce<number>((a, v) => a + (v ?? 0), 0) * 100) / 100;
}
function last(values: (number | null)[]) {
  return values.filter((value) => value !== null).at(-1) ?? null;
}
/** Groups days into Monday-based weeks (labelled by their first day) when weekly. */
function buckets(days: Day[], weekly: boolean) {
  if (!weekly) return days.map((day) => ({ date: day.date, days: [day] }));
  const weeks = new Map<string, Day[]>();
  for (const day of days) {
    const at = new Date(`${day.date}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
    const key = at.toISOString().slice(0, 10);
    weeks.set(key, [...(weeks.get(key) ?? []), day]);
  }
  return [...weeks].map(([date, days]) => ({ date, days }));
}
