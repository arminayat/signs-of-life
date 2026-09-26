import type { Connection, Job, Source } from "./store";
import type {
  DashboardView,
  EventKind,
  MetricQuery,
  MetricResult,
  MonitorState,
  Observation,
  StoredMetric,
} from "./monitoring";
export interface MonitoringStore {
  monitorState(sourceId: string): Promise<MonitorState | undefined>;
  initializeMonitor(source: Source, environment: string): Promise<void>;
  monitorError(
    sourceId: string,
    historical: boolean,
    error: string,
  ): Promise<void>;
  saveMonitorPage(
    source: Source,
    events: Observation[],
    patch: Partial<MonitorState>,
    historical: boolean,
    lease?: Pick<Job, "id" | "leaseToken">,
  ): Promise<void>;
  monitorPreferences(
    sourceId: string,
    notifications: EventKind[],
  ): Promise<void>;
  monitoringSnapshot(
    workspaceId: string,
    projectId: string,
  ): Promise<{
    states: MonitorState[];
    views: DashboardView[];
    metrics: StoredMetric[];
  }>;
  saveViews(
    workspaceId: string,
    projectId: string,
    views: DashboardView[],
  ): Promise<void>;
  requestMetric(
    source: Source,
    query: MetricQuery,
    key: string,
  ): Promise<StoredMetric>;
  metricRequest(
    workspaceId: string,
    id: string,
  ): Promise<StoredMetric | undefined>;
  saveMetric(
    id: string,
    result: MetricResult | null,
    error: string | null,
  ): Promise<void>;
  retainedSeries(
    sourceId: string,
    query: MetricQuery,
  ): Promise<MetricResult | null>;
  observedMetric(
    source: Source,
    query: MetricQuery,
    timezone: string,
  ): Promise<MetricResult>;
  resumeConnection(workspaceId: string, connectionId: string): Promise<void>;
  replaceMonitorSecret(
    connection: Connection,
    secret: string,
    lease?: Date,
  ): Promise<boolean>;
  releaseMonitorRefresh(connectionId: string, lease: Date): Promise<void>;
  providerBudget(connectionId: string, seconds: number): Promise<boolean>;
  delayProvider(connectionId: string, seconds: number): Promise<void>;
  webhookConnection(id: string): Promise<Connection | undefined>;
  acceptMonitorWebhook(
    connection: Connection,
    observations: Observation[],
  ): Promise<void>;
  monitorInbox(
    workspaceId: string,
    id: string,
  ): Promise<{ connectionId: string; observations: Observation[] } | undefined>;
  removeMonitorInbox(workspaceId: string, id: string): Promise<void>;
}
