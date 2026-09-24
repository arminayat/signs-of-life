import type {
  AccountEvent,
  ChannelKind,
  Cursor,
  DownloadMetric,
  Identity,
  JobPayload,
  Notification,
  SourceKind,
} from "./model";
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  enabled: boolean;
  timezone: string;
  dailyTime: string;
  createdAt: Date;
};
export type Connection = {
  projectId: string | null;
  id: string;
  workspaceId: string;
  kind: SourceKind;
  name: string;
  secret: string;
  externalId: string | null;
  active: boolean;
  status: string;
  lastSuccessAt: Date | null;
  lastError: string | null;
  refreshLease: Date | null;
  createdAt: Date;
};
export type Source = {
  id: string;
  workspaceId: string;
  projectId: string;
  connectionId: string;
  kind: SourceKind;
  externalId: string;
  name: string;
  cursor: Cursor | null;
  baseline: Date;
  lastSuccessAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};
export type Destination = {
  id: string;
  workspaceId: string;
  kind: ChannelKind;
  name: string;
  address: string;
  verified: boolean;
  enabled: boolean;
  unsubscribeHash: string;
  createdAt: Date;
};
export type Delivery = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  destinationId: string;
  key: string;
  notification: Notification;
  status: string;
  purpose: string;
  attempts: number;
  providerId: string | null;
  lastError: string | null;
  startedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type Job = {
  id: string;
  workspaceId: string;
  key: string;
  payload: JobPayload;
  attempts: number;
  leaseToken: string | null;
  createdAt: Date;
};
export type Metric = {
  id: string;
  workspaceId: string;
  sourceId: string;
  date: string;
  revision: number;
  downloads: number;
  redownloads: number;
  updatedAt: Date;
};
export type Challenge = {
  hash: string;
  workspaceId: string;
  purpose: string;
  destinationId: string | null;
  secret: string | null;
  expiresAt: Date;
  createdAt: Date;
};
export type Snapshot = {
  projects: Project[];
  connections: Omit<Connection, "secret" | "refreshLease">[];
  sources: Source[];
  destinations: Omit<Destination, "unsubscribeHash">[];
  deliveries: Delivery[];
  metrics: Metric[];
  projectDestinations: { projectId: string; destinationId: string }[];
  events: {
    id: string;
    sourceId: string;
    occurredAt: Date;
    provider: string;
  }[];
};
export type ProjectOverview = {
  dates: string[];
  accounts: { date: string; count: number }[];
  downloads: {
    date: string;
    downloads: number;
    redownloads: number;
    sourceCount: number;
  }[];
};
export interface MonitorStore {
  health(): Promise<void>;
  resolveIdentity(
    identity: Identity,
  ): Promise<{ userId: string; workspaceId: string; name: string }>;
  snapshot(workspaceId: string, projectId?: string): Promise<Snapshot>;
  projectOverview(project: Project): Promise<ProjectOverview>;
  createProject(
    workspaceId: string,
    input: Pick<Project, "name" | "description" | "timezone">,
    limit: number,
  ): Promise<Project>;
  project(workspaceId: string, id: string): Promise<Project | undefined>;
  updateProject(
    workspaceId: string,
    id: string,
    patch: Partial<
      Pick<
        Project,
        "name" | "description" | "enabled" | "timezone" | "dailyTime"
      >
    >,
    destinations?: string[],
  ): Promise<void>;
  deleteProject(workspaceId: string, id: string): Promise<void>;
  connection(workspaceId: string, id: string): Promise<Connection | undefined>;
  saveConnection(
    input: Pick<
      Connection,
      "id" | "workspaceId" | "kind" | "name" | "secret" | "externalId"
    > & { projectId?: string | null },
  ): Promise<void>;
  disconnect(workspaceId: string, id: string): Promise<void>;
  updateConnection(
    id: string,
    patch: Partial<
      Pick<
        Connection,
        "secret" | "status" | "lastError" | "lastSuccessAt" | "refreshLease"
      >
    >,
  ): Promise<void>;
  refreshLock(id: string, until: Date): Promise<boolean>;
  createSource(
    input: Pick<
      Source,
      | "workspaceId"
      | "projectId"
      | "connectionId"
      | "kind"
      | "externalId"
      | "name"
    >,
    limit: number,
  ): Promise<Source>;
  source(workspaceId: string, id: string): Promise<Source | undefined>;
  connectionSources(
    workspaceId: string,
    connectionId: string,
  ): Promise<Source[]>;
  deleteSource(workspaceId: string, id: string): Promise<void>;
  sourceError(id: string, error: string): Promise<void>;
  recordAccounts(
    source: Source,
    events: AccountEvent[],
    cursor: Cursor,
  ): Promise<void>;
  saveReport(
    connection: Connection,
    date: string,
    metrics: DownloadMetric[] | null,
  ): Promise<void>;
  reportDeliveryKeys(
    workspaceId: string,
    projectId: string,
    dates: string[],
  ): Promise<string[]>;
  projectMetrics(
    workspaceId: string,
    projectId: string,
    dates: string[],
  ): Promise<(Metric & { name: string })[]>;
  createDestination(
    input: Pick<
      Destination,
      "id" | "workspaceId" | "name" | "kind" | "address" | "unsubscribeHash"
    >,
    limit: number,
  ): Promise<void>;
  destination(
    workspaceId: string,
    id: string,
  ): Promise<Destination | undefined>;
  updateDestination(
    workspaceId: string,
    id: string,
    patch: Partial<
      Pick<Destination, "enabled" | "verified" | "address" | "name">
    >,
  ): Promise<void>;
  deleteDestination(workspaceId: string, id: string): Promise<void>;
  unsubscribe(hash: string): Promise<void>;
  challenge(input: Omit<Challenge, "createdAt">): Promise<void>;
  useChallenge(
    hash: string,
    purpose: string,
    workspaceId?: string,
  ): Promise<Challenge | undefined>;
  rateLimit(key: string, limit: number, seconds: number): Promise<boolean>;
  fanout(
    project: Project,
    key: string,
    notification: Notification,
  ): Promise<void>;
  enqueueDelivery(
    input: Pick<
      Delivery,
      "workspaceId" | "projectId" | "destinationId" | "key" | "notification"
    > & { purpose?: string },
  ): Promise<void>;
  delivery(workspaceId: string, id: string): Promise<Delivery | undefined>;
  updateDelivery(
    id: string,
    patch: Partial<
      Pick<
        Delivery,
        "status" | "attempts" | "providerId" | "lastError" | "startedAt"
      >
    >,
  ): Promise<void>;
  disableBounced(providerId: string): Promise<void>;
  enqueue(
    workspaceId: string,
    key: string,
    payload: JobPayload,
    dueAt?: Date,
  ): Promise<void>;
  dueJobs(limit: number): Promise<string[]>;
  markDispatched(id: string): Promise<void>;
  claim(id?: string): Promise<Job | undefined>;
  finish(job: Job, next?: Date, error?: string): Promise<void>;
  receipt(key: string): Promise<boolean>;
  cleanup(): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
}
