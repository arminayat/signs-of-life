import {
  boolean,
  foreignKey,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  appSchema,
  projects,
  sources,
  workspaces,
  connections,
} from "./schema";
import type {
  Checkpoint,
  DashboardView,
  EventKind,
  MetricQuery,
  MetricResult,
  Observation,
} from "../../core/src/monitoring";
const date = (name: string) => timestamp(name, { withTimezone: true });
export const monitorStates = appSchema.table("monitor_states", {
  sourceId: uuid("source_id")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  environment: text("environment").notNull(),
  notifyAfter: date("notify_after").notNull(),
  historyFrom: date("history_from").notNull(),
  historyUntil: date("history_until").notNull(),
  historyCursor: jsonb("history_cursor")
    .$type<Checkpoint>()
    .notNull()
    .default({}),
  historyDone: boolean("history_done").notNull().default(false),
  liveFrom: date("live_from").notNull(),
  liveUntil: date("live_until"),
  liveCursor: jsonb("live_cursor").$type<Checkpoint>().notNull().default({}),
  coverage: text("coverage"),
  historyError: text("history_error"),
  liveError: text("live_error"),
  notifications: jsonb("notifications")
    .$type<EventKind[]>()
    .notNull()
    .default(["signup", "payment"]),
});
export const monitorEvents = appSchema.table(
  "monitor_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    key: text("key").notNull(),
    kind: text("kind").$type<EventKind>().notNull(),
    occurredAt: date("occurred_at").notNull(),
    environment: text("environment").notNull(),
    amount: text("amount"),
    currency: text("currency"),
    anonymous: boolean("anonymous").notNull().default(false),
    notified: boolean("notified").notNull().default(false),
  },
  (t) => [
    uniqueIndex("monitor_event_identity").on(t.projectId, t.key),
    index("monitor_event_retention").on(t.occurredAt),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
  ],
);
export const monitorObservations = appSchema.table(
  "monitor_observations",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => monitorEvents.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.externalId] })],
);
export const monitorMetrics = appSchema.table(
  "monitor_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    query: jsonb("query").$type<MetricQuery>().notNull(),
    result: jsonb("result").$type<MetricResult>(),
    error: text("error"),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("monitor_metric_query").on(t.sourceId, t.key)],
);
export const monitorDashboards = appSchema.table("monitor_dashboards", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  views: jsonb("views").$type<DashboardView[]>().notNull().default([]),
});
export const providerBudgets = appSchema.table("provider_budgets", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => connections.id, { onDelete: "cascade" }),
  availableAt: date("available_at").notNull(),
});
export const monitorInbox = appSchema.table("monitor_inbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  observations: jsonb("observations").$type<Observation[]>().notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
});
export const monitorSeries = appSchema.table(
  "monitor_series",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    date: text("date").notNull(),
    series: text("series").notNull().default(""),
    value: text("value"),
    metadata: jsonb("metadata")
      .$type<
        Pick<
          MetricResult,
          "unit" | "currency" | "timezone" | "definition" | "status"
        >
      >()
      .notNull(),
    fetchedAt: date("fetched_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceId, t.key, t.date, t.series] }),
    index("monitor_series_retention").on(t.date),
  ],
);
