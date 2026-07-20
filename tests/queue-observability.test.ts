import test from "node:test";
import assert from "node:assert/strict";
import { jobQueue } from "../server/queue";

test("queue accepts jobs and tracks state", async () => {
  const job = jobQueue.enqueue("test-job", async () => ({ ok: true }), { sample: true });
  assert.equal(job.status, "queued");

  await new Promise(resolve => setTimeout(resolve, 50));
  const stored = jobQueue.getJob(job.id);
  assert.ok(stored);
  assert.equal(stored?.status, "completed");
});

test("queue passes payload into handlers", async () => {
  const job = jobQueue.enqueue("payload-job", async (payload?: { value: string }) => ({ ok: true, value: payload?.value }), { value: "queued" });

  await new Promise(resolve => setTimeout(resolve, 50));
  const stored = jobQueue.getJob(job.id);
  assert.ok(stored);
  assert.equal(stored?.status, "completed");
  assert.deepEqual(stored?.result, { ok: true, value: "queued" });
});

test("queue retries transient failures before succeeding", async () => {
  let attempts = 0;
  const job = jobQueue.enqueue(
    "retry-job",
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("transient");
      return { ok: true, attempts };
    },
    undefined,
    { maxAttempts: 3, retryDelayMs: 10 },
  );

  await new Promise(resolve => setTimeout(resolve, 150));
  const stored = jobQueue.getJob(job.id);
  assert.ok(stored);
  assert.equal(stored?.status, "completed");
  assert.deepEqual(stored?.result, { ok: true, attempts: 3 });
  assert.equal(attempts, 3);
});
