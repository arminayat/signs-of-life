import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
import * as t from "../packages/db/src/schema";
import { runOne } from "../packages/backend/src/runner";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const workspaceId = f.member!.workspaceId;
  const destinationId = crypto.randomUUID();
  await f.store.createDestination(
    {
      id: destinationId,
      workspaceId,
      kind: "email",
      name: "Inbox",
      address: "retry@example.test",
      unsubscribeHash: crypto.randomUUID(),
    },
    3,
  );
  await f.store.updateDestination(workspaceId, destinationId, {
    verified: true,
  });
  await f.store.enqueueDelivery({
    workspaceId,
    projectId: null,
    destinationId,
    key: "retry-test",
    notification: { title: "Test", text: "Message" },
  });
  const delivery = (await f.store.snapshot(workspaceId)).deliveries[0];
  const [job] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `delivery:${delivery.id}`));
  f.services.config.EMAIL_PROVIDER = "resend";
  return { ...f, workspaceId, delivery, job };
}
describe("notification retry boundaries", () => {
  it("preserves an ambiguous send outcome when later retries are rejected", async () => {
    const f = await setup();
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        status: "retry",
        afterSeconds: 5,
        code: "timeout",
        mayHaveDelivered: true,
      })
      .mockResolvedValue({
        status: "retry",
        afterSeconds: 5,
        code: "rate_limited",
      });
    f.services.channels.email = { send };
    for (let attempt = 0; attempt < 8; attempt++) {
      await f.db
        .update(t.jobs)
        .set({ dueAt: new Date(Date.now() - 1000) })
        .where(eq(t.jobs.id, f.job.id));
      await runOne(f.services, f.job.id);
    }
    expect(send).toHaveBeenCalledTimes(8);
    expect(await f.store.delivery(f.workspaceId, f.delivery.id)).toMatchObject({
      status: "uncertain",
      attempts: 8,
    });
  });
  it("stops after eight provider attempts even when each retry reschedules successfully", async () => {
    const f = await setup();
    const send = vi.fn().mockResolvedValue({
      status: "retry",
      afterSeconds: 5,
      code: "provider_busy",
    });
    f.services.channels.email = { send };
    for (let attempt = 0; attempt < 10; attempt++) {
      await f.db
        .update(t.jobs)
        .set({ dueAt: new Date(Date.now() - 1000) })
        .where(eq(t.jobs.id, f.job.id));
      await runOne(f.services, f.job.id);
    }
    expect(send).toHaveBeenCalledTimes(8);
    expect(await f.store.delivery(f.workspaceId, f.delivery.id)).toMatchObject({
      status: "failed",
      attempts: 8,
    });
  });
  it("does not repeat a pending Resend send after its idempotency window", async () => {
    const f = await setup();
    const send = vi.fn();
    f.services.channels.email = { send };
    await f.store.updateDelivery(f.delivery.id, {
      status: "pending",
      attempts: 1,
      startedAt: new Date(Date.now() - 24 * 3600_000),
    });
    await runOne(f.services, f.job.id);
    expect(send).not.toHaveBeenCalled();
    expect(await f.store.delivery(f.workspaceId, f.delivery.id)).toMatchObject({
      status: "uncertain",
      lastError: "provider_idempotency_window_expired",
    });
  });
});
