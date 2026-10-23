import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  Snapshot,
  Project as ProjectRecord,
} from "../../../packages/core/src/store";
type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
export type Dashboard = Json<Snapshot>;
export type Project = Json<ProjectRecord>;
export type AppConfig = {
  authProvider: string;
  loginEnabled: boolean;
  sourceUrl: string;
  revision: string;
  sources: { supabase: boolean; apple: boolean };
  monitoring: Partial<
    Record<
      import("../../../packages/core/src/monitoring").MonitorKind,
      { credentials: boolean; oauth: boolean }
    >
  >;
  channels: Record<
    import("../../../packages/core/src/model").ChannelKind,
    boolean
  >;
  limits: { projects: number; sources: number; destinations: number };
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new ApiError(data.error ?? "request_failed", response.status);
  return data as T;
}
export function useDashboard(projectId?: string) {
  return useQuery({
    queryKey: ["dashboard", projectId ?? "workspace"],
    queryFn: () =>
      api<Dashboard>(
        projectId ? `/projects/${projectId}/dashboard` : "/dashboard",
      ),
    refetchInterval: 15_000,
  });
}
export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api<AppConfig>("/config"),
    staleTime: 60_000,
  });
}
export async function invalidateActionQueries(
  client: QueryClient,
  result: Record<string, unknown>,
  action: { path: string; body?: unknown },
) {
  const body = action.body as { connectionId?: unknown } | undefined;
  const connectionId =
    typeof result.id === "string"
      ? result.id
      : typeof body?.connectionId === "string"
        ? body.connectionId
        : action.path.match(/^\/(?:monitor\/)?connections\/([^/]+)$/)?.[1];
  if (action.path.includes("/connections/") && connectionId) {
    // Remove data from the prior grant even if its catalog is not currently
    // mounted. An invalidated-but-cached catalog can still render old resources.
    await client.resetQueries({ queryKey: ["catalog", connectionId] });
  }
  await client.invalidateQueries({ queryKey: ["dashboard"] });
}
export function useAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body = {},
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => api<Record<string, unknown>>(path, method, body),
    onSuccess: (result, action) =>
      invalidateActionQueries(client, result, action),
  });
}
const messages: Record<string, string> = {
  authentication_required: "Please sign in to continue.",
  github_login_not_configured:
    "GitHub login hasn’t been configured for this installation yet.",
  project_limit_reached: "This workspace has reached its project limit.",
  source_limit_reached: "This workspace has reached its source limit.",
  destination_limit_reached:
    "This workspace has reached its destination limit.",
  connection_project_mismatch:
    "This connection belongs to another project. Add a connection in this project’s Sources view.",
  already_exists: "This connection or source already exists.",
  invalid_input: "Check the fields and try again.",
  invalid_webhook_url:
    "Use a Slack incoming webhook URL or a Discord channel webhook URL for the selected channel.",
  verification_code_expired_or_invalid:
    "This code is incorrect, expired or already used. Check the channel or request a new code.",
  verification_link_expired_or_used:
    "This link has expired or has already been used. Request another verification email in Destinations.",
  supabase_reconnect_required: "Reconnect Supabase to resume collection.",
  rate_limited: "Too many requests. Please try again later.",
  internal_error: "Something went wrong. Please try again.",
  provider_http_403:
    "The provider denied access. Check the connection’s permissions.",
  channel_not_configured:
    "This channel hasn’t been configured by the installation operator yet.",
};
export function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "internal_error";
  return messages[message] ?? message.replaceAll("_", " ");
}
export function when(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not collected yet";
}
