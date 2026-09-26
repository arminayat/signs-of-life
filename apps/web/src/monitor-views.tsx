import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Checkbox } from "@heroui/react";
import type {
  DashboardView,
  MetricDefinition,
} from "../../../packages/core/src/monitoring";
import { isMonitorKind } from "../../../packages/core/src/monitoring";
import { api, useAction, type Dashboard } from "./data";
import { Dialog, ErrorNotice, SelectField } from "./ui";
export function ViewEditor({
  projectId,
  data,
  initial,
  onClose,
}: {
  projectId: string;
  data: Dashboard;
  initial: DashboardView[];
  onClose: () => void;
}) {
  const sources = data.sources.filter(
    (s) => s.projectId === projectId && isMonitorKind(s.kind),
  );
  const [views, setViews] = useState(initial),
    [sourceId, setSourceId] = useState(sources[0]?.id || ""),
    [metric, setMetric] = useState(""),
    [filters, setFilters] = useState<Record<string, string>>({});
  const definitions = useQuery({
    queryKey: ["metric-definitions", sourceId],
    queryFn: () =>
      api<{ items: MetricDefinition[] }>(`/sources/${sourceId}/metrics`),
    enabled: !!sourceId,
  });
  const selected = definitions.data?.items.find((d) => d.id === metric),
    action = useAction();
  function move(index: number, offset: number) {
    const next = [...views];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setViews(next);
  }
  return (
    <Dialog
      title="Dashboard views"
      description="Choose provider metrics and saved reports. Each source keeps its own definitions and reporting basis."
      open
      onClose={onClose}
    >
      <div className="form-stack">
        <SelectField
          name="view-source"
          label="Source"
          value={sourceId}
          onChange={(value) => {
            setSourceId(value);
            setMetric("");
            setFilters({});
          }}
        >
          {sources.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name} · {s.kind}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="view-metric"
          label="Metric or report"
          value={metric}
          onChange={(v) => {
            setMetric(v);
            setFilters({});
          }}
        >
          <option value="">Choose a metric</option>
          {definitions.data?.items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </SelectField>
        {selected && <p className="muted text-xs">{selected.definition}</p>}
        {selected?.filters?.map((filter) => (
          <SelectField
            key={filter.id}
            name={filter.id}
            label={filter.label}
            required={false}
            value={filters[filter.id] || ""}
            onChange={(value) =>
              setFilters(
                Object.fromEntries(
                  Object.entries({ ...filters, [filter.id]: value }).filter(
                    ([, v]) => v,
                  ),
                ),
              )
            }
          >
            <option value="">All</option>
            {filter.values?.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </SelectField>
        ))}
        <Button
          variant="secondary"
          isDisabled={!selected || views.length >= 50}
          onPress={() => {
            setViews([
              ...views,
              {
                id: crypto.randomUUID(),
                sourceId,
                metric,
                hidden: false,
                filters,
              },
            ]);
            setMetric("");
            setFilters({});
          }}
        >
          Add view
        </Button>
        <ErrorNotice error={definitions.error || action.error} />
        <ol className="monitor-view-list">
          {views.map((view, i) => (
            <li key={view.id}>
              <Checkbox
                isSelected={!view.hidden}
                onChange={(visible) =>
                  setViews(
                    views.map((v) =>
                      v.id === view.id ? { ...v, hidden: !visible } : v,
                    ),
                  )
                }
              >
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>
                  {sources.find((s) => s.id === view.sourceId)?.name} ·{" "}
                  {view.metric}
                </Checkbox.Content>
              </Checkbox>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move view up"
                  isDisabled={i === 0}
                  onPress={() => move(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move view down"
                  isDisabled={i === views.length - 1}
                  onPress={() => move(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    setViews(views.filter((v) => v.id !== view.id))
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div className="form-actions">
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button
            isPending={action.isPending}
            onPress={() =>
              action.mutate(
                {
                  path: `/projects/${projectId}/views`,
                  method: "PUT",
                  body: views,
                },
                { onSuccess: onClose },
              )
            }
          >
            Save views
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
