import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "./client";
import type { Job } from "../../core/src/store";
import { assert } from "../../core/src/model";
import * as t from "./schema";

// Hold the claim until commit, so another worker cannot replace it mid-write.
export async function lockJob(
  tx: Transaction,
  job: Job,
  workspaceId = job.workspaceId,
) {
  assert(
    job.leaseToken && job.workspaceId === workspaceId,
    "job_lease_lost",
    409,
  );
  // Lock the parent before children: workspace deletion cascades through jobs
  // and source data, so taking this lock later could create a lock inversion.
  const [workspace] = await tx
    .select({ id: t.workspaces.id })
    .from(t.workspaces)
    .where(eq(t.workspaces.id, workspaceId))
    .for("share");
  assert(workspace, "job_lease_lost", 409);
  const [current] = await tx
    .select({ id: t.jobs.id })
    .from(t.jobs)
    .where(
      and(
        eq(t.jobs.id, job.id),
        eq(t.jobs.workspaceId, workspaceId),
        eq(t.jobs.leaseToken, job.leaseToken),
        eq(t.jobs.status, "running"),
        sql`${t.jobs.leaseUntil} > now()`,
      ),
    )
    .for("share");
  assert(current, "job_lease_lost", 409);
}
export async function lockConnection(
  tx: Transaction,
  id: string,
  workspaceId: string,
  mode: "share" | "update" = "share",
) {
  const [connection] = await tx
    .select()
    .from(t.connections)
    .where(
      and(
        eq(t.connections.id, id),
        eq(t.connections.workspaceId, workspaceId),
        eq(t.connections.active, true),
      ),
    )
    .for(mode);
  return connection;
}
export async function lockSource(
  tx: Transaction,
  id: string,
  workspaceId: string,
) {
  const [source] = await tx
    .select()
    .from(t.sources)
    .where(and(eq(t.sources.id, id), eq(t.sources.workspaceId, workspaceId)));
  if (!source) return;
  const [project] = await tx
    .select({ id: t.projects.id })
    .from(t.projects)
    .where(
      and(
        eq(t.projects.id, source.projectId),
        eq(t.projects.workspaceId, workspaceId),
      ),
    )
    .for("share");
  if (!project || !(await lockConnection(tx, source.connectionId, workspaceId)))
    return;
  return (
    await tx.select().from(t.sources).where(eq(t.sources.id, id)).for("update")
  )[0];
}
