import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "./client";
import * as t from "./schema";
import type { Delivery, Project } from "../../core/src/store";
import type { Notification } from "../../core/src/model";
export async function enqueueDelivery(
  db: Executor,
  input: Pick<
    Delivery,
    "workspaceId" | "projectId" | "destinationId" | "key" | "notification"
  > & { purpose?: string },
) {
  const [delivery] = await db
    .insert(t.deliveries)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (delivery)
    await db
      .insert(t.jobs)
      .values({
        workspaceId: input.workspaceId,
        key: `delivery:${delivery.id}`,
        payload: { kind: "deliver", deliveryId: delivery.id },
      })
      .onConflictDoNothing();
}
export async function fanout(
  db: Executor,
  project: Project,
  key: string,
  notification: Notification,
) {
  if (!project.enabled) return;
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
  for (const destination of destinations)
    await enqueueDelivery(db, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      destinationId: destination.id,
      key,
      notification,
    });
}
export async function workspaceLock(db: Executor, workspaceId: string) {
  await db.execute(
    sql`select id from ${t.workspaces} where id = ${workspaceId} for update`,
  );
}
