import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  foreignKey,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import type {
  Cursor,
  JobPayload,
  Notification,
  SourceKind,
  ChannelKind,
} from "../../core/src/model";
export const pm = pgSchema("pm");
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const users = pm.table("users", {
  id: id(),
  name: text("name").notNull(),
  createdAt: created(),
});
export const identities = pm.table(
  "identities",
  {
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issuer, t.subject] })],
);
export const workspaces = pm.table(
  "workspaces",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("one_workspace_per_owner").on(t.ownerId)],
);
const workspace = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
export const projects = pm.table(
  "projects",
  {
    id: id(),
    workspaceId: workspace(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    timezone: text("timezone").notNull().default("UTC"),
    dailyTime: text("daily_time").notNull().default("09:00"),
    createdAt: created(),
  },
  (t) => [unique("projects_tenant_id").on(t.workspaceId, t.id)],
);
export const connections = pm.table(
  "connections",
  {
    id: id(),
    workspaceId: workspace(),
    kind: text("kind").$type<SourceKind>().notNull(),
    name: text("name").notNull(),
    secret: text("secret").notNull(),
    externalId: text("external_id"),
    active: boolean("active").notNull().default(true),
    status: text("status").notNull().default("connected"),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    refreshLease: timestamp("refresh_lease", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    unique("connections_tenant_id").on(t.workspaceId, t.id),
    uniqueIndex("connections_external").on(t.workspaceId, t.kind, t.externalId),
  ],
);
export const sources = pm.table(
  "sources",
  {
    id: id(),
    workspaceId: workspace(),
    projectId: uuid("project_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    kind: text("kind").$type<SourceKind>().notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    cursor: jsonb("cursor").$type<Cursor>(),
    baseline: timestamp("baseline", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: created(),
  },
  (t) => [
    unique("sources_tenant_id").on(t.workspaceId, t.id),
    uniqueIndex("source_per_project").on(t.projectId, t.kind, t.externalId),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.workspaceId, t.connectionId],
      foreignColumns: [connections.workspaceId, connections.id],
    }).onDelete("cascade"),
  ],
);
export const destinations = pm.table(
  "destinations",
  {
    id: id(),
    workspaceId: workspace(),
    kind: text("kind").$type<ChannelKind>().notNull(),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    verified: boolean("verified").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    unsubscribeHash: text("unsubscribe_hash").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("destinations_tenant_id").on(t.workspaceId, t.id),
    uniqueIndex("unsubscribe_hash").on(t.unsubscribeHash),
  ],
);
export const projectDestinations = pm.table(
  "project_destinations",
  {
    workspaceId: workspace(),
    projectId: uuid("project_id").notNull(),
    destinationId: uuid("destination_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.destinationId] }),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.workspaceId, t.destinationId],
      foreignColumns: [destinations.workspaceId, destinations.id],
    }).onDelete("cascade"),
  ],
);
export const events = pm.table(
  "events",
  {
    id: id(),
    workspaceId: workspace(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    anonymous: boolean("anonymous").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    provider: text("provider").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("unique_account_event").on(t.sourceId, t.externalId),
    index("event_retention").on(t.createdAt),
  ],
);
export const metrics = pm.table(
  "metrics",
  {
    id: id(),
    workspaceId: workspace(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    revision: integer("revision").notNull().default(1),
    downloads: integer("downloads").notNull(),
    redownloads: integer("redownloads").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("metric_source_date").on(t.sourceId, t.date)],
);
export const reports = pm.table(
  "reports",
  {
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    status: text("status").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.date] })],
);
export const deliveries = pm.table(
  "deliveries",
  {
    id: id(),
    workspaceId: workspace(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    notification: jsonb("notification").$type<Notification>().notNull(),
    status: text("status").notNull().default("pending"),
    purpose: text("purpose").notNull().default("notification"),
    attempts: integer("attempts").notNull().default(0),
    providerId: text("provider_id"),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("delivery_idempotency").on(t.destinationId, t.key),
    index("delivery_history").on(t.workspaceId, t.createdAt),
  ],
);
export const jobs = pm.table(
  "jobs",
  {
    id: id(),
    workspaceId: workspace(),
    key: text("key").notNull(),
    payload: jsonb("payload").$type<JobPayload>().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    attempts: integer("attempts").notNull().default(0),
    status: text("status").notNull().default("pending"),
    lastError: text("last_error"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("job_key").on(t.key),
    index("due_jobs").on(t.status, t.dueAt),
  ],
);
export const challenges = pm.table("challenges", {
  hash: text("hash").primaryKey(),
  workspaceId: workspace(),
  purpose: text("purpose").notNull(),
  destinationId: uuid("destination_id").references(() => destinations.id, {
    onDelete: "cascade",
  }),
  secret: text("secret"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});
export const webhookReceipts = pm.table("webhook_receipts", {
  key: text("key").primaryKey(),
  createdAt: created(),
});
export const limits = pm.table("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
