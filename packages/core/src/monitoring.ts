import type { AppError } from "./model";

export const monitorKinds = [
  "stripe",
  "polar",
  "paddle",
  "revenuecat",
  "posthog",
  "ga4",
  "better-auth",
  "workos",
  "clerk",
  "auth0",
] as const;
export type MonitorKind = (typeof monitorKinds)[number];
export function isMonitorKind(value: string): value is MonitorKind {
  return (monitorKinds as readonly string[]).includes(value);
}
export const eventKinds = [
  "signup",
  "payment",
  "renewal",
  "refund",
  "cancellation",
  "payment_failed",
] as const;
export type EventKind = (typeof eventKinds)[number];
export type Credentials = Record<string, string>;
export type Checkpoint = Record<string, string>;
export type Resource = {
  id: string;
  name: string;
  organizationName?: string;
  environment: string;
};
export type Observation = {
  id: string;
  resourceId: string;
  kind: EventKind;
  occurredAt: string;
  environment: string;
  amount?: string;
  currency?: string;
  anonymous?: boolean;
  // A provider-supplied object ID is a candidate, not proof of account ownership.
  candidate?: { provider: "stripe"; object: string };
  // Only adapters may produce verified aliases; never accept these from clients.
  reference?: {
    provider: string;
    account: string;
    object: string;
    action: string;
  };
};
export type CollectionInput = {
  credentials: Credentials;
  resourceId: string;
  environment: string;
  from: string;
  until: string;
  cursor: Checkpoint;
  historical: boolean;
};
export type CollectionPage = {
  events: Observation[];
  cursor: Checkpoint;
  done: boolean;
  coverage?: string;
};
export type MetricDefinition = {
  id: string;
  label: string;
  group: "growth" | "revenue" | "usage";
  shape: "series" | "funnel" | "cohort";
  definition: string;
  filters?: { id: string; label: string; values?: string[] }[];
};
export type MetricQuery = {
  metric: string;
  from: string;
  to: string;
  filters: Record<string, string>;
};
export type MetricResult = {
  shape: MetricDefinition["shape"];
  unit: string;
  currency?: string;
  timezone: string;
  definition: string;
  status: "available" | "partial" | "unavailable" | "unsupported";
  reason?: string;
  // Decimal strings avoid introducing binary rounding into provider amounts.
  summary?: string;
  points: { label: string; value: string | null; series?: string }[];
  columns?: string[];
  rows?: { label: string; values: (string | null)[] }[];
  fetchedAt: string;
};
export type ProviderAdapter = {
  catalog(credentials: Credentials): Promise<Resource[]>;
  collect?(input: CollectionInput): Promise<CollectionPage>;
  definitions(
    credentials: Credentials,
    resourceId: string,
  ): Promise<MetricDefinition[]>;
  metric?(input: CollectionInput, query: MetricQuery): Promise<MetricResult>;
  webhook?(
    credentials: Credentials,
    raw: string,
    headers: Headers,
  ): Promise<Observation[]>;
  lookup?(credentials: Credentials, objectId: string): Promise<Observation[]>;
};
export type MonitorState = {
  sourceId: string;
  environment: string;
  notifyAfter: string;
  historyFrom: string;
  historyUntil: string;
  historyCursor: Checkpoint;
  historyDone: boolean;
  liveFrom: string;
  liveUntil: string | null;
  liveCursor: Checkpoint;
  coverage: string | null;
  historyError: string | null;
  liveError: string | null;
  notifications: EventKind[];
};
export type DashboardView = {
  id: string;
  sourceId: string;
  metric: string;
  hidden: boolean;
  filters: Record<string, string>;
};
export type StoredMetric = {
  id: string;
  sourceId: string;
  query: MetricQuery;
  result: MetricResult | null;
  error: string | null;
  updatedAt: Date;
};
export type ProviderFailure = AppError & { retryAfterSeconds?: number };
