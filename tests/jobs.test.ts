import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
import * as t from "../packages/db/src/schema";
import { runOne } from "../packages/backend/src/runner";
import type { AccountEvent } from "../packages/core/src/model";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const workspaceId = f.member!.workspaceId;
  const project = await f.store.createProject(
    workspaceId,
    { name: "Product", description: "", timezone: "UTC" },
    5,
  );
  const connectionId = crypto.randomUUID();
  await f.store.saveConnection({
    id: connectionId,
    workspaceId,
    kind: "supabase",
    name: "Supabase",
    secret: await f.services.secrets.seal(
      {
        access_token: "fixture",
        refresh_token: "fixture",
        expires_at: Date.now() + 86400_000,
      },
      connectionId,
    ),
    externalId: null,
  });
  const source = await f.store.createSource(
    {
      workspaceId,
      projectId: project.id,
      connectionId,
      kind: "supabase",
      name: "Product",
      externalId: "example",
    },
    10,
  );
  const destinationId = crypto.randomUUID();
  await f.store.createDestination(
    {
      id: destinationId,
      workspaceId,
      kind: "telegram",
      name: "Telegram",
      address: "123",
      unsubscribeHash: crypto.randomUUID(),
    },
    3,
  );
  await f.store.updateDestination(workspaceId, destinationId, {
    verified: true,
  });
  await f.store.updateProject(workspaceId, project.id, {}, [destinationId]);
  return { ...f, workspaceId, project, source, destinationId, connectionId };
}
describe("durable collection and delivery", () => {
  it("commits events, cursor and fan-out atomically and deduplicates overlapping reads", async () => {
    const f = await setup();
    const event = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      provider: "email",
    };
    await f.store.recordAccounts(f.source, [event], {
      at: event.createdAt,
      id: event.id,
    });
    await f.store.recordAccounts(f.source, [event], {
      at: event.createdAt,
      id: event.id,
    });
    const snapshot = await f.store.snapshot(f.workspaceId);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.deliveries).toHaveLength(1);
    expect(snapshot.deliveries[0].notification.text).toContain(
      event.id.slice(0, 8),
    );
    expect(snapshot.deliveries[0].notification.text).not.toContain(event.id);
    expect((await f.store.source(f.workspaceId, f.source.id))?.cursor?.id).toBe(
      event.id,
    );
  });
  it("filters anonymous accounts and excludes baseline history", async () => {
    const f = await setup();
    const at = new Date(Date.now() + 1).toISOString();
    f.services.accounts.collect = vi.fn().mockResolvedValue([
      {
        id: crypto.randomUUID(),
        createdAt: at,
        provider: "unknown",
        anonymous: true,
      },
      { id: crypto.randomUUID(), createdAt: at, provider: "github" },
      {
        id: crypto.randomUUID(),
        createdAt: "2020-01-01T00:00:00Z",
        provider: "email",
      },
    ]);
    const [job] = await f.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.key, `supabase:${f.source.id}`));
    await runOne(f.services, job.id);
    const snapshot = await f.store.snapshot(f.workspaceId);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0].provider).toBe("github");
  });
  it("does not alert when a previously observed anonymous account becomes permanent", async () => {
    const f = await setup();
    const event = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      provider: "unknown",
      anonymous: true,
    };
    const cursor = { at: event.createdAt, id: event.id };
    await f.store.recordAccounts(f.source, [event], cursor);
    await f.store.recordAccounts(
      f.source,
      [{ ...event, anonymous: false, provider: "email" }],
      cursor,
    );
    const snapshot = await f.store.snapshot(f.workspaceId);
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.deliveries).toHaveLength(0);
  });
  it("only one worker claims a due job and an expired lease is recovered", async () => {
    const f = await setup();
    const [row] = await f.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.key, `supabase:${f.source.id}`));
    const claims = await Promise.all([
      f.store.claim(row.id),
      f.store.claim(row.id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    await f.db
      .update(t.jobs)
      .set({ leaseUntil: new Date(Date.now() - 1000) })
      .where(eq(t.jobs.id, row.id));
    const second = await f.store.claim(row.id);
    expect(second).toBeDefined();
    expect(second?.leaseToken).not.toBe(first.leaseToken);
    await f.store.finish(first);
    expect(
      (await f.db.select().from(t.jobs).where(eq(t.jobs.id, row.id)))[0].status,
    ).toBe("running");
    await f.store.finish(second!);
  });
  it("does not send queued notifications after a project is paused or a source disconnected", async () => {
    const f = await setup();
    const send = vi.fn().mockResolvedValue({ status: "accepted" });
    f.services.channels.telegram = { send };
    const event = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      provider: "email",
    };
    await f.store.recordAccounts(f.source, [event], {
      at: event.createdAt,
      id: event.id,
    });
    await f.store.disconnect(f.workspaceId, f.connectionId);
    const delivery = (await f.store.snapshot(f.workspaceId)).deliveries[0];
    const [job] = await f.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.key, `delivery:${delivery.id}`));
    await runOne(f.services, job.id);
    expect(send).not.toHaveBeenCalled();
    expect((await f.store.delivery(f.workspaceId, delivery.id))?.status).toBe(
      "cancelled",
    );
  });
  it("marks an interrupted Telegram send uncertain and does not repeat its external side effect", async () => {
    const f = await setup();
    const send = vi.fn();
    f.services.channels.telegram = { send };
    await f.store.enqueueDelivery({
      workspaceId: f.workspaceId,
      projectId: null,
      destinationId: f.destinationId,
      key: "test",
      notification: { title: "Test", text: "Message" },
    });
    const delivery = (await f.store.snapshot(f.workspaceId)).deliveries[0];
    await f.store.updateDelivery(delivery.id, {
      status: "sending",
      startedAt: new Date(),
    });
    const [job] = await f.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.key, `delivery:${delivery.id}`));
    await runOne(f.services, job.id);
    expect(send).not.toHaveBeenCalled();
    expect((await f.store.delivery(f.workspaceId, delivery.id))?.status).toBe(
      "uncertain",
    );
  });
  it("fans out independently so one channel can fail without blocking another", async () => {
    const f = await setup();
    const emailId = crypto.randomUUID();
    await f.store.createDestination(
      {
        id: emailId,
        workspaceId: f.workspaceId,
        kind: "email",
        name: "Inbox",
        address: "a@example.test",
        unsubscribeHash: crypto.randomUUID(),
      },
      3,
    );
    await f.store.updateDestination(f.workspaceId, emailId, { verified: true });
    await f.store.updateProject(f.workspaceId, f.project.id, {}, [
      emailId,
      f.destinationId,
    ]);
    f.services.channels.telegram = {
      send: async () => ({ status: "failed", code: "blocked" }),
    };
    await f.store.fanout(f.project, "test-fanout", {
      title: "Hello",
      text: "World",
    });
    for (const delivery of (await f.store.snapshot(f.workspaceId)).deliveries) {
      const [job] = await f.db
        .select()
        .from(t.jobs)
        .where(eq(t.jobs.key, `delivery:${delivery.id}`));
      await runOne(f.services, job.id);
    }
    expect(
      (await f.store.snapshot(f.workspaceId)).deliveries
        .map((d) => d.status)
        .sort(),
    ).toEqual(["accepted", "failed"]);
  });
  it("reconnect can reactivate a terminated collector without resetting its cursor", async () => {
    const f = await setup();
    const key = `supabase:${f.source.id}`;
    const [row] = await f.db.select().from(t.jobs).where(eq(t.jobs.key, key));
    await f.db
      .update(t.jobs)
      .set({ status: "failed" })
      .where(eq(t.jobs.id, row.id));
    await f.store.enqueue(f.workspaceId, key, {
      kind: "supabase.collect",
      sourceId: f.source.id,
    });
    expect(
      (await f.db.select().from(t.jobs).where(eq(t.jobs.id, row.id)))[0].status,
    ).toBe("pending");
  });
});
