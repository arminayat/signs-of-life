import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "./client";
import * as t from "./schema";
import type { Delivery, Project } from "../../core/src/store";
import type { Notification } from "../../core/src/model";
type DeliveryInput = Pick<
  Delivery,
  "workspaceId" | "projectId" | "destinationId" | "key" | "notification"
> & { purpose?: string };
export async function enqueueDeliveries(db: Executor, inputs: DeliveryInput[]) {
  for (let at = 0; at < inputs.length; at += 200) {
    const inserted = await db
      .insert(t.deliveries)
      .values(inputs.slice(at, at + 200))
      .onConflictDoNothing()
      .returning({
        id: t.deliveries.id,
        workspaceId: t.deliveries.workspaceId,
      });
    if (inserted.length)
      await db
        .insert(t.jobs)
        .values(
          inserted.map((row) => ({
            workspaceId: row.workspaceId,
            key: `delivery:${row.id}`,
            payload: { kind: "deliver" as const, deliveryId: row.id },
          })),
        )
        .onConflictDoNothing();
  }
}
export async function enqueueDelivery(db: Executor, input: DeliveryInput) {
  await enqueueDeliveries(db, [input]);
}
export async function fanoutMany(
  db: Executor,
  project: Project,
  messages: { key: string; notification: Notification }[],
) {
  if (!project.enabled || !messages.length) return;
  const destinations = await db
    .select({ id: t.destinations.id })
    .from(t.projectDestinations)
    .innerJoin(
      t.destinations,
      eq(t.destinations.id, t.projectDestinations.destinationId),
    )
    .where(
      and(
        eq(t.projectDestinations.projectId, project.id),
        eq(t.projectDestinations.workspaceId, project.workspaceId),
        eq(t.destinations.enabled, true),
        eq(t.destinations.verified, true),
      ),
    );
  await enqueueDeliveries(
    db,
    messages.flatMap((message) =>
      destinations.map((destination) => ({
        workspaceId: project.workspaceId,
        projectId: project.id,
        destinationId: destination.id,
        ...message,
      })),
    ),
  );
}
export async function fanout(
  db: Executor,
  project: Project,
  key: string,
  notification: Notification,
) {
  await fanoutMany(db, project, [{ key, notification }]);
}
export async function deliveryEligibility(
  db: Executor,
  workspaceId: string,
  projectId: string,
  destinationId: string,
  key: string,
) {
  const sourceId = /^(?:account|daily|monitor):([^:]+):/.exec(key)?.[1];
  // Source identifiers come from our persisted delivery keys, but malformed keys must fail closed.
  if (sourceId && !/^[0-9a-f-]{36}$/i.test(sourceId)) return false;
  const [row] = await db
    .select({ id: t.sources.id })
    .from(t.sources)
    .innerJoin(t.connections, eq(t.connections.id, t.sources.connectionId))
    .innerJoin(t.projects, eq(t.projects.id, t.sources.projectId))
    .innerJoin(
      t.projectDestinations,
      and(
        eq(t.projectDestinations.projectId, t.projects.id),
        eq(t.projectDestinations.destinationId, destinationId),
      ),
    )
    .innerJoin(
      t.destinations,
      eq(t.destinations.id, t.projectDestinations.destinationId),
    )
    .where(
      and(
        eq(t.sources.workspaceId, workspaceId),
        eq(t.sources.projectId, projectId),
        sourceId ? eq(t.sources.id, sourceId) : undefined,
        eq(t.connections.active, true),
        eq(t.projects.enabled, true),
        eq(t.destinations.enabled, true),
        eq(t.destinations.verified, true),
      ),
    )
    .limit(1);
  return !!row;
}
export async function workspaceLock(db: Executor, workspaceId: string) {
  await db.execute(
    sql`select id from ${t.workspaces} where id = ${workspaceId} for update`,
  );
}
