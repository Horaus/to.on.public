const assert = require("node:assert/strict");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const modulePromise = import(pathToFileURL(path.resolve(__dirname, "../core/queue-presentation.ts")));

function job(id, status, updatedAt, overrides = {}) {
  return { id, projectId: "project-1", jobType: "text", providerId: "chatgpt-web", status, updatedAt, resultAssetIds: [], ...overrides };
}

test("queue presentation keeps durable history separate from current attention", async () => {
  const { deriveQueueSummary } = await modulePromise;
  const summary = deriveQueueSummary([
    job("done-1", "done", "2026-08-27T10:00:00Z"),
    job("fail-1", "failed_retryable", "2026-08-27T10:01:00Z", { error: "provider failed" }),
    job("active-1", "generating", "2026-08-27T10:02:00Z")
  ]);

  assert.equal(summary.activeCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.deepEqual(summary.visibleJobs.map((item) => item.id), ["active-1", "fail-1"]);
  assert.deepEqual(summary.historyJobs.map((item) => item.id), ["done-1"]);
});

test("resolved failure stays in history and does not reappear as current alert", async () => {
  const { deriveQueueSummary } = await modulePromise;
  const summary = deriveQueueSummary([
    job("failed-video", "failed_retryable", "2026-08-27T10:01:00Z", { jobType: "video", shotId: "shot-1" }),
    job("video-done", "done", "2026-08-27T10:02:00Z", { jobType: "video", shotId: "shot-1", resultAssetIds: ["asset-1"] })
  ], ["shot-1"]);

  assert.equal(summary.failedCount, 0);
  assert.deepEqual(summary.visibleJobs.map((item) => item.id), []);
  assert.deepEqual(summary.historyJobs.map((item) => item.id), ["video-done", "failed-video"]);
});

test("queue and pipeline share one current-work status contract", async () => {
  const [{ deriveQueueSummary }, status] = await Promise.all([
    modulePromise,
    import(pathToFileURL(path.resolve(__dirname, "../core/job-status.ts")))
  ]);
  const statuses = ["pending", "opening_provider", "submitting", "generating", "downloading", "queued", "running", "awaiting_user", "recoverable"];
  for (const value of statuses) {
    const item = job(`current-${value}`, value, "2026-08-27T10:03:00Z");
    const summary = deriveQueueSummary([item]);
    assert.equal(summary.isCurrentWork(item), status.isActiveJob(item) || status.isCurrentWorkStatus(value), value);
    assert.equal(status.isProjectJobBusy(item), summary.isCurrentWork(item), value);
  }
});
