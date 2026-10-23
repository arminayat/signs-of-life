import type { StoredMetric } from "../../../packages/core/src/monitoring";

// Results are refreshed hourly by the jobs pipeline. Keep unfinished requests
// responsive without continuously refetching completed reports in every card.
export function metricPollInterval(
  metric: Pick<StoredMetric, "result" | "error"> | undefined,
) {
  return metric?.result || metric?.error ? 300_000 : 15_000;
}
