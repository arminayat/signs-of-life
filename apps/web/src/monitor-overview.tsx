import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import {
  isMonitorKind,
  type DashboardView,
  type StoredMetric,
} from "../../../packages/core/src/monitoring";
import { providerDefinition } from "../../../packages/core/src/provider-registry";
import { api, type Dashboard, type Project } from "./data";
import { ErrorNotice, Notice, PageHeader, SelectField, Status } from "./ui";
import { useMonitoring } from "./monitor-status";
import { ViewEditor } from "./monitor-views";
import { MonitorChart } from "./monitor-chart";
import { LegacyOverview } from "./project-overview";
import "./monitoring.css";
export type Range = { from: string; to: string };
export function ProjectOverview({
  project,
  data,
}: {
  project: Project;
  data: Dashboard;
}) {
  const today = new Date().toISOString().slice(0, 10),
    oldest = new Date(Date.now() - 364 * 86400_000).toISOString().slice(0, 10);
  const [days, setDays] = useState("30"),
    [customFrom, setCustomFrom] = useState(today),
    [customTo, setCustomTo] = useState(today),
    [edit, setEdit] = useState(false);
  const range = {
    from:
      days === "custom"
        ? customFrom
        : new Date(Date.now() - (Number(days) - 1) * 86400_000)
            .toISOString()
            .slice(0, 10),
    to: days === "custom" ? customTo : today,
  };
  const valid =
    range.from >= oldest && range.from <= range.to && range.to <= today;
  const query = useMonitoring(project.id),
    sources = data.sources.filter((s) => s.projectId === project.id);
  return (
    <>
      <PageHeader
        title="Overview"
        description="Growth, revenue and usage from your connected sources."
        action={
          <Link className="text-link" to={`/projects/${project.id}/sources`}>
            Manage sources →
          </Link>
        }
      />
      <div className="monitor-toolbar">
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
          <option value="custom">Custom range</option>
        </SelectField>
        {days === "custom" && (
          <>
            <label>
              From
              <input
                className="native-select"
                type="date"
                value={customFrom}
                min={oldest}
                max={today}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                className="native-select"
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        )}
        <Button variant="secondary" onPress={() => setEdit(true)}>
          Configure views
        </Button>
      </div>
      {!valid && (
        <Notice>Choose a valid range within the last 12 months.</Notice>
      )}
      <ErrorNotice error={query.error} />
      {valid &&
        ["growth", "revenue", "usage"].map((group) => {
          const views =
            query.data?.views.filter((v) => {
              const source = sources.find((s) => s.id === v.sourceId);
              return (
                !v.hidden &&
                source &&
                isMonitorKind(source.kind) &&
                providerDefinition(source.kind).group === group
              );
            }) || [];
          return (
            <section className="monitor-section" key={group}>
              <div className="section-heading">
                <h2>{group[0].toUpperCase() + group.slice(1)}</h2>
              </div>
              {group === "growth" &&
                sources.some((s) => ["supabase", "apple"].includes(s.kind)) && (
                  <LegacyOverview project={project} data={data} range={range} />
                )}
              <div className="monitor-grid">
                {views.map((view) => (
                  <MetricCard
                    key={view.id}
                    view={view}
                    source={sources.find((s) => s.id === view.sourceId)!}
                    range={range}
                  />
                ))}
              </div>
              {!views.length &&
                !(
                  group === "growth" &&
                  sources.some((s) => ["supabase", "apple"].includes(s.kind))
                ) && (
                  <p className="muted text-sm">
                    Choose a source metric or supported report in Configure
                    views.
                  </p>
                )}
            </section>
          );
        })}
      <p className="muted text-xs mt-5">
        Provider metrics stay source-specific. Missing data is not zero.
        Currencies are not combined; history depends on provider coverage.
      </p>
      {edit && (
        <ViewEditor
          projectId={project.id}
          data={data}
          initial={query.data?.views || []}
          onClose={() => setEdit(false)}
        />
      )}
    </>
  );
}
function MetricCard({
  view,
  source,
  range,
}: {
  view: DashboardView;
  source: Dashboard["sources"][number];
  range: Range;
}) {
  const query = useQuery({
    queryKey: ["metric-query", view.sourceId, view.metric, range, view.filters],
    queryFn: () =>
      api<StoredMetric>(`/sources/${view.sourceId}/metric-queries`, "POST", {
        metric: view.metric,
        ...range,
        filters: view.filters,
      }),
    staleTime: 3600_000,
    refetchInterval: 3600_000,
  });
  const resultQuery = useQuery({
    queryKey: ["metric-result", query.data?.id],
    queryFn: () => api<StoredMetric>(`/monitor/metrics/${query.data!.id}`),
    enabled: !!query.data?.id,
    refetchInterval: 15_000,
  });
  const metric = resultQuery.data || query.data,
    result = metric?.result;
  return (
    <Card className="monitor-metric">
      <div className="flex justify-between gap-3">
        <div>
          <h3>
            {view.metric.replace(/^native:|^insight:/, "").replaceAll("_", " ")}
          </h3>
          <p className="muted text-xs">
            {source.name} ·{" "}
            {isMonitorKind(source.kind)
              ? providerDefinition(source.kind).name
              : source.kind}
          </p>
        </div>
        <Status value={metric?.error ? "error" : result?.status || "pending"} />
      </div>
      <ErrorNotice
        error={
          query.error ||
          resultQuery.error ||
          (metric?.error ? new Error(metric.error) : null)
        }
      />
      {result ? (
        <>
          {result.summary != null && (
            <p className="stat-value">
              {result.summary}{" "}
              <span className="text-sm">{result.currency || result.unit}</span>
            </p>
          )}
          <p className="muted text-xs">{result.definition}</p>
          {result.reason && <Notice>{result.reason}</Notice>}
          <MonitorChart result={result} />
          <p className="muted text-xs">
            {result.timezone} · Updated{" "}
            {new Date(result.fetchedAt).toLocaleString()}
            {metric?.error ? " · Showing the last available result" : ""}
          </p>
        </>
      ) : (
        <p className="muted text-sm">
          {metric?.error
            ? "This report is unavailable. Check source permissions and provider plan access."
            : "Waiting for the provider report…"}
        </p>
      )}
    </Card>
  );
}
