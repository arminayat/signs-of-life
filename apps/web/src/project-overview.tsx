import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@heroui/react";
import { Download, RotateCcw, Users } from "lucide-react";
import type { ProjectOverview as Overview } from "../../../packages/core/src/store";
import { localDay } from "../../../packages/core/src/time";
import { api, type Dashboard, type Project } from "./data";
import { ErrorNotice, Loading, Notice, PageHeader } from "./ui";
import { ProjectChart } from "./project-chart";
export function ProjectOverview({
  project,
  data,
}: {
  project: Project;
  data: Dashboard;
}) {
  const query = useQuery({
    queryKey: ["dashboard", project.id, "overview", project.timezone],
    queryFn: () => api<Overview>(`/projects/${project.id}/overview`),
    refetchInterval: 15_000,
  });
  const sources = data.sources.filter(
    (source) => source.projectId === project.id,
  );
  const accounts = sources.filter((source) => source.kind === "supabase");
  const apple = sources.filter((source) => source.kind === "apple");
  const collected = accounts.filter((source) => source.lastSuccessAt);
  const baseline = collected
    .map((source) => localDay(new Date(source.baseline), project.timezone))
    .sort()[0];
  const lastCollection = collected
    .map((source) =>
      localDay(new Date(source.lastSuccessAt!), project.timezone),
    )
    .sort()
    .at(-1);
  const summary = query.data;
  const totalAccounts =
    summary?.accounts.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const totalDownloads =
    summary?.downloads.reduce((sum, day) => sum + day.downloads, 0) ?? 0;
  const totalRedownloads =
    summary?.downloads.reduce((sum, day) => sum + day.redownloads, 0) ?? 0;
  return (
    <>
      <PageHeader
        title="Overview"
        description="A daily picture of new accounts and App Store downloads."
        action={
          <Link className="text-link" to={`/projects/${project.id}/sources`}>
            Manage sources →
          </Link>
        }
      />
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        summary && (
          <>
            <p className="muted text-xs mb-5">
              Last 30 days · {summary.dates[0]} – {summary.dates.at(-1)}
            </p>
            <div className="stat-grid">
              {[
                {
                  label: "New accounts",
                  value:
                    collected.length || totalAccounts ? totalAccounts : null,
                  foot: "Observed Supabase accounts",
                  icon: Users,
                },
                {
                  label: "Initial downloads",
                  value: summary.downloads.length ? totalDownloads : null,
                  foot: "Available App Store reports",
                  icon: Download,
                },
                {
                  label: "Redownloads",
                  value: summary.downloads.length ? totalRedownloads : null,
                  foot: "Available App Store reports",
                  icon: RotateCcw,
                },
              ].map(({ label, value, foot, icon: Icon }) => (
                <Card className="stat" key={label}>
                  <div className="stat-label">
                    {label}
                    <Icon size={15} />
                  </div>
                  <span className="stat-value">
                    {value?.toLocaleString() ?? "—"}
                  </span>
                  <p className="stat-foot">{foot}</p>
                </Card>
              ))}
            </div>
            {!sources.length && (
              <Notice>
                <Link
                  to={`/projects/${project.id}/sources`}
                  className="underline"
                >
                  Add a source
                </Link>{" "}
                to start seeing your product’s activity.
              </Notice>
            )}
            {sources.some(
              (source) =>
                source.lastError ||
                !data.connections.find(
                  (connection) => connection.id === source.connectionId,
                )?.active,
            ) && (
              <Notice>
                Some sources need attention. These totals may be incomplete.{" "}
                <Link
                  className="underline"
                  to={`/projects/${project.id}/sources`}
                >
                  View sources
                </Link>
              </Notice>
            )}
            <div className="project-charts">
              <ProjectChart
                title="New accounts"
                description={`Observed accounts by day · ${project.timezone}. Collection begins when a source is connected; today is still in progress.`}
                points={summary.dates.map((date) => ({
                  date,
                  value:
                    summary.accounts.find((day) => day.date === date)?.count ??
                    (baseline &&
                    lastCollection &&
                    date >= baseline &&
                    date <= lastCollection
                      ? 0
                      : null),
                }))}
                empty={
                  accounts.length
                    ? "Waiting for the first Supabase collection."
                    : "Connect Supabase to see new accounts over time."
                }
              />
              <ProjectChart
                title="Initial downloads"
                description="Apple reporting dates. Missing reports are blank; lighter bars contain reports from only some sources."
                points={summary.dates.map((date) => {
                  const day = summary.downloads.find(
                    (day) => day.date === date,
                  );
                  return {
                    date,
                    value: day?.downloads ?? null,
                    partial: !!day && day.sourceCount < apple.length,
                  };
                })}
                empty={
                  apple.length
                    ? "Waiting for App Store reports. Reports can arrive later."
                    : "Connect App Store Connect to see daily downloads."
                }
              />
              <ProjectChart
                title="Redownloads"
                description="Apple reporting dates. Totals include available reports and may change as reports arrive or are corrected."
                points={summary.dates.map((date) => {
                  const day = summary.downloads.find(
                    (day) => day.date === date,
                  );
                  return {
                    date,
                    value: day?.redownloads ?? null,
                    partial: !!day && day.sourceCount < apple.length,
                  };
                })}
                empty={
                  apple.length
                    ? "Waiting for App Store reports. Reports can arrive later."
                    : "Connect App Store Connect to see daily redownloads."
                }
              />
            </div>
          </>
        )
      )}
    </>
  );
}
