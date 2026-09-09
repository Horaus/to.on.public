const test = require("node:test");
const assert = require("node:assert/strict");
const { failInterruptedBrowserJobs } = require("../main/state/bootstrap.cjs");

test("restart marks a durable submit intent as reconciliation-required", () => {
  const state = {
    jobs: [
      { id: "intent", providerId: "google-flow-web", jobType: "video", status: "submitting", submitIntentAt: "2026-08-31T00:00:00.000Z" },
      { id: "queued", providerId: "chatgpt-web", jobType: "image", status: "pending" }
    ]
  };
  failInterruptedBrowserJobs(state, { expectedExtensionVersion: "0.1.67", now: () => "2026-08-31T00:01:00.000Z" });
  assert.equal(state.jobs[0].status, "failed_retryable");
  assert.equal(state.jobs[0].submissionState, "reconciliation_required");
  assert.equal(state.jobs[0].reconciliationRequiredAt, "2026-08-31T00:01:00.000Z");
  assert.equal(state.jobs[1].submissionState, "interrupted");
});

test("restart preserves strict Flow reconciliation without claiming provider acceptance", () => {
  const state = {
    jobs: [{
      id: "flow-submit-window", providerId: "google-flow-web", jobType: "video", status: "generating",
      submitIntentAt: "2026-08-31T00:00:00.000Z", providerAcceptedAt: undefined
    }]
  };
  failInterruptedBrowserJobs(state, { expectedExtensionVersion: "0.1.67", now: () => "2026-08-31T00:01:00.000Z" });
  const job = state.jobs[0];
  assert.equal(job.status, "failed_retryable");
  assert.equal(job.submissionState, "reconciliation_required");
  assert.equal(job.needsStrictFlowRecovery, true);
  assert.equal(job.watchdogFailed, false);
  assert.equal(job.providerAcceptedAt, undefined);
  assert.equal(job.reconciliationRequiredAt, "2026-08-31T00:01:00.000Z");
  assert.match(job.error, /strict recovery before any new submit/i);
});
