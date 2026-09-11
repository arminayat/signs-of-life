import { AppError } from "../../core/src/model";
import type { Job } from "../../core/src/store";
import { hashToken } from "../../adapters/src/crypto";
import type { Services } from "./services";
import { collectAccounts, collectApple, dailySummary } from "./collectors";
async function deliver(
  services: Services,
  job: Job,
  deliveryId: string,
): Promise<Date | undefined> {
  const { store } = services;
  const delivery = await store.delivery(job.workspaceId, deliveryId);
  if (
    !delivery ||
    ["accepted", "failed", "uncertain", "cancelled"].includes(delivery.status)
  )
    return;
  const destination = await store.destination(
    job.workspaceId,
    delivery.destinationId,
  );
  const project = delivery.projectId
    ? await store.project(job.workspaceId, delivery.projectId)
    : null;
  if (
    !destination?.enabled ||
    (!destination.verified && delivery.purpose !== "verification") ||
    (delivery.projectId && !project?.enabled)
  ) {
    await store.updateDelivery(delivery.id, { status: "cancelled" });
    return;
  }
  if (project) {
    const snapshot = await store.snapshot(job.workspaceId);
    const stillLinked = snapshot.projectDestinations.some(
      (link) =>
        link.projectId === project.id && link.destinationId === destination.id,
    );
    const sourceId = /^(?:account|daily):([^:]+):/.exec(delivery.key)?.[1];
    const sourcesActive = snapshot.sources
      .filter(
        (source) =>
          source.projectId === project.id &&
          (!sourceId || source.id === sourceId),
      )
      .some((source) =>
        snapshot.connections.some(
          (connection) =>
            connection.id === source.connectionId && connection.active,
        ),
      );
    if (!stillLinked || !sourcesActive) {
      await store.updateDelivery(delivery.id, { status: "cancelled" });
      return;
    }
  }
  const channel = services.channels[destination.kind];
  if (!channel) {
    await store.updateDelivery(delivery.id, {
      status: "failed",
      lastError: "channel_not_configured",
    });
    return;
  }
  // A crash after a non-idempotent send may already have delivered the message.
  if (
    delivery.status === "sending" &&
    !(
      destination.kind === "email" &&
      services.config.EMAIL_PROVIDER === "resend"
    )
  ) {
    await store.updateDelivery(delivery.id, {
      status: "uncertain",
      lastError: "worker_interrupted_during_send",
    });
    return;
  }
  if (
    delivery.status === "sending" &&
    Date.now() - delivery.createdAt.getTime() > 23 * 3600_000
  ) {
    await store.updateDelivery(delivery.id, {
      status: "uncertain",
      lastError: "provider_idempotency_window_expired",
    });
    return;
  }
  await store.updateDelivery(delivery.id, {
    status: "sending",
    startedAt: new Date(),
    attempts: delivery.attempts + 1,
  });
  // The opaque unsubscribe capability is derived from an operator secret, never the email.
  const unsubscribeToken = await hashToken(
    `${services.config.AUTH_SECRET}:unsubscribe:${destination.id}`,
  );
  const result = await channel.send(
    destination.address,
    delivery.notification,
    delivery.id,
    delivery.purpose === "verification"
      ? undefined
      : `${services.config.PUBLIC_URL}/api/unsubscribe/${unsubscribeToken}`,
  );
  if (result.status === "retry" && job.attempts < 8) {
    await store.updateDelivery(delivery.id, {
      status: "pending",
      lastError: result.code,
    });
    return new Date(Date.now() + result.afterSeconds * 1000);
  }
  await store.updateDelivery(delivery.id, {
    status: result.status === "retry" ? "failed" : result.status,
    lastError: result.status === "accepted" ? null : result.code,
    providerId:
      result.status === "accepted" ? (result.providerId ?? null) : null,
  });
}
export async function runOne(
  services: Services,
  id?: string,
): Promise<boolean> {
  const job = await services.store.claim(id);
  if (!job) return false;
  try {
    let next: Date | undefined;
    const payload = job.payload;
    switch (payload.kind) {
      case "supabase.collect":
        next = await collectAccounts(services, job, payload.sourceId);
        break;
      case "apple.collect":
        next = await collectApple(services, job, payload.connectionId);
        break;
      case "daily":
        next = await dailySummary(services, job, payload.projectId);
        break;
      case "deliver":
        next = await deliver(services, job, payload.deliveryId);
        break;
    }
    await services.store.finish(job, next);
  } catch (error) {
    const code =
      error instanceof AppError ? error.code : "job_execution_failed";
    const payload = job.payload;
    if (payload.kind === "supabase.collect")
      await services.store.sourceError(payload.sourceId, code);
    if (payload.kind === "apple.collect")
      await services.store.updateConnection(payload.connectionId, {
        status: "error",
        lastError: code,
      });
    const recurring = payload.kind !== "deliver";
    const terminal = code === "connection_not_found_or_disconnected";
    const next =
      !terminal && (recurring || job.attempts < 8)
        ? new Date(
            Date.now() +
              Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)) * 1000,
          )
        : undefined;
    await services.store.finish(job, next, code);
    console.warn(
      JSON.stringify({
        event: "job_failed",
        jobId: job.id,
        kind: payload.kind,
        code,
      }),
    );
  }
  return true;
}
