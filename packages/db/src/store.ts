import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import * as t from "./schema";
import type { MonitorStore } from "../../core/src/store";
import { assert } from "../../core/src/model";
import { jobStore } from "./store-jobs";
import { collectionStore } from "./store-collection";
import { enqueueDelivery, fanout, workspaceLock } from "./store-delivery";
export function postgresStore(db: Database): MonitorStore {
  return {
    ...jobStore(db),
    ...collectionStore(db),
    async health() {
      await db.execute(sql`select 1`);
    },
    async resolveIdentity(identity) {
      return db.transaction(async (tx) => {
        const lookup = async () => {
          const [found] = await tx
            .select({
              userId: t.users.id,
              name: t.users.name,
              workspaceId: t.workspaces.id,
            })
            .from(t.identities)
            .innerJoin(t.users, eq(t.users.id, t.identities.userId))
            .innerJoin(t.workspaces, eq(t.workspaces.ownerId, t.users.id))
            .where(
              and(
                eq(t.identities.issuer, identity.issuer),
                eq(t.identities.subject, identity.subject),
              ),
            );
          return found;
        };
        const existing = await lookup();
        if (existing) return existing;
        const [user] = await tx
          .insert(t.users)
          .values({ name: identity.name })
          .returning();
        const [created] = await tx
          .insert(t.identities)
          .values({
            issuer: identity.issuer,
            subject: identity.subject,
            userId: user.id,
          })
          .onConflictDoNothing()
          .returning({ userId: t.identities.userId });
        if (!created) {
          await tx.delete(t.users).where(eq(t.users.id, user.id));
          const winner = await lookup();
          if (!winner) throw new Error("Identity was removed during creation");
          return winner;
        }
        const [workspace] = await tx
          .insert(t.workspaces)
          .values({ ownerId: user.id })
          .returning();
        return { userId: user.id, workspaceId: workspace.id, name: user.name };
      });
    },
    async snapshot(workspaceId) {
      const [
        projects,
        connections,
        sources,
        destinations,
        deliveries,
        metrics,
        projectDestinations,
        events,
      ] = await Promise.all([
        db
          .select()
          .from(t.projects)
          .where(eq(t.projects.workspaceId, workspaceId))
          .orderBy(desc(t.projects.createdAt)),
        db
          .select()
          .from(t.connections)
          .where(eq(t.connections.workspaceId, workspaceId)),
        db
          .select()
          .from(t.sources)
          .where(eq(t.sources.workspaceId, workspaceId)),
        db
          .select()
          .from(t.destinations)
          .where(eq(t.destinations.workspaceId, workspaceId)),
        db
          .select()
          .from(t.deliveries)
          .where(eq(t.deliveries.workspaceId, workspaceId))
          .orderBy(desc(t.deliveries.createdAt))
          .limit(100),
        db
          .select()
          .from(t.metrics)
          .where(eq(t.metrics.workspaceId, workspaceId))
          .orderBy(desc(t.metrics.date))
          .limit(900),
        db
          .select({
            projectId: t.projectDestinations.projectId,
            destinationId: t.projectDestinations.destinationId,
          })
          .from(t.projectDestinations)
          .where(eq(t.projectDestinations.workspaceId, workspaceId)),
        db
          .select({
            id: t.events.id,
            sourceId: t.events.sourceId,
            occurredAt: t.events.occurredAt,
            provider: t.events.provider,
          })
          .from(t.events)
          .where(
            and(
              eq(t.events.workspaceId, workspaceId),
              eq(t.events.anonymous, false),
              gt(t.events.createdAt, new Date(Date.now() - 30 * 86400_000)),
            ),
          )
          .orderBy(desc(t.events.occurredAt))
          .limit(100),
      ]);
      return {
        projects,
        connections: connections.map(
          ({ secret: _, refreshLease: __, ...safe }) => safe,
        ),
        sources,
        destinations: destinations.map(
          ({ unsubscribeHash: _, ...safe }) => safe,
        ),
        deliveries: deliveries.map((d) =>
          d.purpose === "verification"
            ? {
                ...d,
                notification: {
                  title: "Verify email destination",
                  text: "Verification email",
                },
              }
            : d,
        ),
        metrics,
        projectDestinations,
        events,
      };
    },
    async createProject(workspaceId, input, limit) {
      return db.transaction(async (tx) => {
        await workspaceLock(tx, workspaceId);
        const [total] = await tx
          .select({ count: count() })
          .from(t.projects)
          .where(eq(t.projects.workspaceId, workspaceId));
        assert(total.count < limit, "project_limit_reached");
        const [project] = await tx
          .insert(t.projects)
          .values({ workspaceId, ...input })
          .returning();
        await tx.insert(t.jobs).values({
          workspaceId,
          key: `daily:${project.id}`,
          payload: { kind: "daily", projectId: project.id },
        });
        return project;
      });
    },
    async project(workspaceId, id) {
      return (
        await db
          .select()
          .from(t.projects)
          .where(
            and(eq(t.projects.workspaceId, workspaceId), eq(t.projects.id, id)),
          )
      )[0];
    },
    async updateProject(workspaceId, id, patch, destinations) {
      await db.transaction(async (tx) => {
        const [project] = await tx
          .select()
          .from(t.projects)
          .where(
            and(eq(t.projects.workspaceId, workspaceId), eq(t.projects.id, id)),
          )
          .for("update");
        assert(project, "project_not_found", 404);
        if (Object.keys(patch).length)
          await tx.update(t.projects).set(patch).where(eq(t.projects.id, id));
        if (destinations) {
          const ids = [...new Set(destinations)];
          const owned = ids.length
            ? await tx
                .select()
                .from(t.destinations)
                .where(
                  and(
                    eq(t.destinations.workspaceId, workspaceId),
                    inArray(t.destinations.id, ids),
                  ),
                )
            : [];
          assert(owned.length === ids.length, "destination_not_found", 404);
          await tx
            .delete(t.projectDestinations)
            .where(eq(t.projectDestinations.projectId, id));
          if (ids.length)
            await tx.insert(t.projectDestinations).values(
              ids.map((destinationId) => ({
                workspaceId,
                projectId: id,
                destinationId,
              })),
            );
        }
      });
    },
    async deleteProject(workspaceId, id) {
      await db
        .delete(t.projects)
        .where(
          and(eq(t.projects.workspaceId, workspaceId), eq(t.projects.id, id)),
        );
    },
    async connection(workspaceId, id) {
      return (
        await db
          .select()
          .from(t.connections)
          .where(
            and(
              eq(t.connections.workspaceId, workspaceId),
              eq(t.connections.id, id),
            ),
          )
      )[0];
    },
    async saveConnection(input) {
      await db
        .insert(t.connections)
        .values(input)
        .onConflictDoUpdate({
          target: t.connections.id,
          set: {
            secret: input.secret,
            name: input.name,
            status: "connected",
            active: true,
            lastError: null,
          },
          setWhere: eq(t.connections.workspaceId, input.workspaceId),
        });
    },
    async disconnect(workspaceId, id) {
      await db
        .update(t.connections)
        .set({
          active: false,
          secret: "",
          status: "disconnected",
          refreshLease: null,
        })
        .where(
          and(
            eq(t.connections.workspaceId, workspaceId),
            eq(t.connections.id, id),
          ),
        );
    },
    async createSource(input, limit) {
      return db.transaction(async (tx) => {
        await workspaceLock(tx, input.workspaceId);
        const [total] = await tx
          .select({ count: count() })
          .from(t.sources)
          .where(eq(t.sources.workspaceId, input.workspaceId));
        assert(total.count < limit, "source_limit_reached");
        const [source] = await tx.insert(t.sources).values(input).returning();
        if (source.kind === "supabase")
          await tx.insert(t.jobs).values({
            workspaceId: input.workspaceId,
            key: `supabase:${source.id}`,
            payload: { kind: "supabase.collect", sourceId: source.id },
          });
        if (source.kind === "apple")
          await tx
            .insert(t.jobs)
            .values({
              workspaceId: input.workspaceId,
              key: `apple:${source.connectionId}`,
              payload: {
                kind: "apple.collect",
                connectionId: source.connectionId,
              },
            })
            .onConflictDoUpdate({
              target: t.jobs.key,
              set: { dueAt: new Date(), status: "pending" },
              setWhere: sql`${t.jobs.status} != 'running'`,
            });
        return source;
      });
    },
    async source(workspaceId, id) {
      return (
        await db
          .select()
          .from(t.sources)
          .where(
            and(eq(t.sources.workspaceId, workspaceId), eq(t.sources.id, id)),
          )
      )[0];
    },
    async connectionSources(workspaceId, connectionId) {
      return db
        .select()
        .from(t.sources)
        .where(
          and(
            eq(t.sources.workspaceId, workspaceId),
            eq(t.sources.connectionId, connectionId),
          ),
        );
    },
    async deleteSource(workspaceId, id) {
      await db
        .delete(t.sources)
        .where(
          and(eq(t.sources.workspaceId, workspaceId), eq(t.sources.id, id)),
        );
    },
    async createDestination(input, limit) {
      await db.transaction(async (tx) => {
        await workspaceLock(tx, input.workspaceId);
        const [total] = await tx
          .select({ count: count() })
          .from(t.destinations)
          .where(eq(t.destinations.workspaceId, input.workspaceId));
        assert(total.count < limit, "destination_limit_reached");
        await tx.insert(t.destinations).values(input);
      });
    },
    async destination(workspaceId, id) {
      return (
        await db
          .select()
          .from(t.destinations)
          .where(
            and(
              eq(t.destinations.workspaceId, workspaceId),
              eq(t.destinations.id, id),
            ),
          )
      )[0];
    },
    async updateDestination(workspaceId, id, patch) {
      await db
        .update(t.destinations)
        .set(patch)
        .where(
          and(
            eq(t.destinations.workspaceId, workspaceId),
            eq(t.destinations.id, id),
          ),
        );
    },
    async deleteDestination(workspaceId, id) {
      await db
        .delete(t.destinations)
        .where(
          and(
            eq(t.destinations.workspaceId, workspaceId),
            eq(t.destinations.id, id),
          ),
        );
    },
    async unsubscribe(hash) {
      await db
        .update(t.destinations)
        .set({ enabled: false })
        .where(eq(t.destinations.unsubscribeHash, hash));
    },
    async challenge(input) {
      await db.insert(t.challenges).values(input);
    },
    async useChallenge(hash, purpose, workspaceId) {
      return (
        await db
          .delete(t.challenges)
          .where(
            and(
              eq(t.challenges.hash, hash),
              eq(t.challenges.purpose, purpose),
              gt(t.challenges.expiresAt, new Date()),
              workspaceId
                ? eq(t.challenges.workspaceId, workspaceId)
                : undefined,
            ),
          )
          .returning()
      )[0];
    },
    async rateLimit(key, limit, seconds) {
      const [row] = await db
        .insert(t.limits)
        .values({ key, resetAt: new Date(Date.now() + seconds * 1000) })
        .onConflictDoUpdate({
          target: t.limits.key,
          set: {
            count: sql`case when ${t.limits.resetAt} < now() then 1 else ${t.limits.count} + 1 end`,
            resetAt: sql`case when ${t.limits.resetAt} < now() then now() + ${seconds} * interval '1 second' else ${t.limits.resetAt} end`,
          },
        })
        .returning();
      return row.count <= limit;
    },
    async fanout(project, key, notification) {
      await db.transaction((tx) => fanout(tx, project, key, notification));
    },
    async enqueueDelivery(input) {
      await db.transaction((tx) => enqueueDelivery(tx, input));
    },
    async delivery(workspaceId, id) {
      return (
        await db
          .select()
          .from(t.deliveries)
          .where(
            and(
              eq(t.deliveries.workspaceId, workspaceId),
              eq(t.deliveries.id, id),
            ),
          )
      )[0];
    },
    async updateDelivery(id, patch) {
      await db
        .update(t.deliveries)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(t.deliveries.id, id));
    },
    async disableBounced(providerId) {
      await db.transaction(async (tx) => {
        const rows = await tx
          .update(t.deliveries)
          .set({ status: "failed", lastError: "email_bounced_or_complained" })
          .where(eq(t.deliveries.providerId, providerId))
          .returning();
        for (const row of rows)
          await tx
            .update(t.destinations)
            .set({ enabled: false })
            .where(eq(t.destinations.id, row.destinationId));
      });
    },
    async deleteWorkspace(workspaceId) {
      await db.transaction(async (tx) => {
        const [workspace] = await tx
          .select()
          .from(t.workspaces)
          .where(eq(t.workspaces.id, workspaceId));
        if (workspace)
          await tx.delete(t.users).where(eq(t.users.id, workspace.ownerId));
      });
    },
  };
}
