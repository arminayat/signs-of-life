import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@heroui/react";
import type {
  DashboardView,
  MonitorState,
  StoredMetric,
} from "../../../packages/core/src/monitoring";
import { isMonitorKind } from "../../../packages/core/src/monitoring";
import { providerDefinition } from "../../../packages/core/src/provider-registry";
import { api, useAction, type Dashboard } from "./data";
import { ErrorNotice } from "./ui";
export type Monitoring = {
  states: MonitorState[];
  views: DashboardView[];
  metrics: Omit<StoredMetric, "updatedAt">[];
};
export function useMonitoring(projectId: string) {
  return useQuery({
    queryKey: ["dashboard", projectId, "monitoring"],
    queryFn: () => api<Monitoring>(`/projects/${projectId}/monitoring`),
    refetchInterval: 10_000,
  });
}
export function MonitorSourceHealth({
  projectId,
  sourceId,
  lastError,
}: {
  projectId: string;
  sourceId: string;
  lastError: string | null;
}) {
  const data = useMonitoring(projectId),
    state = data.data?.states.find((s) => s.sourceId === sourceId);
  if (!state) return <p className="muted text-xs">Import status pending</p>;
  return (
    <div className="muted text-xs mt-2">
      <p>
        Resource access:{" "}
        {lastError === "provider_permission_denied"
          ? "permission required"
          : lastError
            ? "check collection error"
            : "validated at setup"}{" "}
        · History:{" "}
        {state.historyError
          ? `paused (${state.historyError})`
          : state.historyDone
            ? "import finished"
            : "importing"}{" "}
        · {state.environment}
      </p>
      <p>
        Live collection:{" "}
        {state.liveError
          ? state.liveError
          : state.liveFrom === state.notifyAfter
            ? "waiting for the first collection"
            : `collected through ${new Date(state.liveFrom).toLocaleString()}`}
      </p>
      <p>
        Alerts begin {new Date(state.notifyAfter).toLocaleString()}. Imported
        history is silent.
      </p>
      {state.coverage && <p>{state.coverage}</p>}
    </div>
  );
}
export function MonitorPreferences({
  projectId,
  data,
}: {
  projectId: string;
  data: Dashboard;
}) {
  const query = useMonitoring(projectId),
    action = useAction();
  const sources = data.sources.filter(
    (s) => s.projectId === projectId && isMonitorKind(s.kind),
  );
  return (
    <>
      {sources.length > 0 && (
        <div className="section-heading">
          <h2>Source alerts</h2>
        </div>
      )}
      <ErrorNotice error={query.error || action.error} />
      {sources.map((source) => {
        if (!isMonitorKind(source.kind)) return null;
        const state = query.data?.states.find((s) => s.sourceId === source.id),
          provider = providerDefinition(source.kind);
        if (!state || !provider.events.length) return null;
        return (
          <fieldset key={source.id} className="monitor-preferences">
            <legend>
              {source.name} · {provider.name}
            </legend>
            {provider.events.map((event) => (
              <Checkbox
                key={event}
                isSelected={state.notifications.includes(event)}
                isDisabled={action.isPending}
                onChange={(selected) =>
                  action.mutate({
                    path: `/sources/${source.id}/notifications`,
                    method: "PATCH",
                    body: {
                      events: selected
                        ? [...state.notifications, event]
                        : state.notifications.filter((e) => e !== event),
                    },
                  })
                }
              >
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>
                  {event.replaceAll("_", " ")}
                </Checkbox.Content>
              </Checkbox>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}
