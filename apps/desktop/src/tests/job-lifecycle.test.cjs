const test = require("node:test");
const assert = require("node:assert/strict");
const {
  completeStructuredTextJob,
  normalizeCompletedAssetJob,
  retryRootId,
  supersedeRetriedSourceJob
} = require("../main/job-lifecycle.cjs");

const timestamp = "2026-08-15T10:00:00.000Z";

function jobFor(task, overrides = {}) {
  return {
    id: "retry_2",
    projectId: "project_1",
    status: "generating",
    resultAssetIds: [],
    input: { bridgeMessage: { task, settings: {} } },
    ...overrides
  };
}

test("direct text completion approves non-empty output and rejects empty output", () => {
  const success = jobFor("connection_test");
  assert.equal(completeStructuredTextJob({ job: success, message: { output: { text: "  chào  " } }, timestamp }), true);
  assert.equal(success.status, "approved");
  assert.equal(success.outputText, "chào");
  assert.equal(success.updatedAt, timestamp);

  const failure = jobFor("production_graph_revision");
  completeStructuredTextJob({ job: failure, message: {}, timestamp });
  assert.equal(failure.status, "failed_retryable");
  assert.match(failure.error, /no production graph revision/i);
});

test("structured importer policy preserves task-specific success and failure context", () => {
  const success = jobFor("screenplay_scene", {
    input: { bridgeMessage: { task: "screenplay_scene", settings: { screenplaySceneId: "SC02" } } }
  });
  completeStructuredTextJob({
    job: success,
    message: { output: { text: "{}" } },
    handlers: { screenplayScene: () => {} },
    timestamp
  });
  assert.equal(success.status, "approved");
  assert.match(success.statusMessage, /SC02/);

  const failure = jobFor("shot_breakdown");
  completeStructuredTextJob({
    job: failure,
    message: {},
    handlers: { shotBreakdown: () => { throw new Error("schema mismatch"); } },
    timestamp
  });
  assert.equal(failure.status, "failed_retryable");
  assert.equal(failure.error, "Cannot import shot breakdown: schema mismatch");
  assert.equal(failure.progress, undefined);
});

test("deterministic screenplay runtime overflow requires manual contract changes", () => {
  const failure = jobFor("screenplay_scene");
  completeStructuredTextJob({
    job: failure,
    message: {},
    handlers: { screenplayScene: () => { throw new Error("SCREENPLAY_RUNTIME_OVERFLOW: locked cues require at least 8 atomic shots"); } },
    timestamp
  });
  assert.equal(failure.status, "failed_manual");
  assert.match(failure.error, /SCREENPLAY_RUNTIME_OVERFLOW/);
});

test("unknown task is left to the asset completion path", () => {
  const job = jobFor("text_to_image");
  assert.equal(completeStructuredTextJob({ job, message: {}, handlers: {}, timestamp }), false);
  assert.equal(job.status, "generating");
});

test("successful retry cancels but never deletes or overwrites source history", () => {
  const source = {
    id: "root_1",
    projectId: "project_1",
    status: "failed_retryable",
    error: "provider timeout",
    resultAssetIds: []
  };
  const retry = jobFor("text_to_video", {
    input: { retryOfJobId: "root_1", bridgeMessage: { task: "text_to_video" } },
    resultAssetIds: ["video_1"]
  });
  assert.equal(retryRootId(retry), "root_1");
  assert.equal(supersedeRetriedSourceJob([source, retry], retry, timestamp), true);
  assert.equal(source.status, "cancelled");
  assert.equal(source.supersededFromStatus, "failed_retryable");
  assert.equal(source.supersededError, "provider timeout");
  assert.equal(source.supersededByJobId, retry.id);
  assert.deepEqual(source.resultAssetIds, []);
  assert.equal(source.updatedAt, timestamp);
});

test("asset completion clears transient watchdog and recovery state", () => {
  const job = jobFor("text_to_video", { watchdogFailed: true, needsStrictFlowRecovery: true, error: "late failure" });
  normalizeCompletedAssetJob(job, timestamp, "Video ready.");
  assert.equal(job.status, "review_required");
  assert.equal(job.watchdogFailed, false);
  assert.equal(job.needsStrictFlowRecovery, false);
  assert.equal(job.error, undefined);
  assert.equal(job.progress, 1);
});
