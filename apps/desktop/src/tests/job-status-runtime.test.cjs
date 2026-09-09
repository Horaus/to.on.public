const test = require("node:test");
const assert = require("node:assert/strict");
const { createJobStatusRuntime } = require("../main/jobs/status-runtime.cjs");

function harness(job) {
  const state = { jobs: [job] };
  let saves = 0;
  let publishes = 0;
  const runtime = createJobStatusRuntime({
    getState: () => state,
    isSavedConversationUrl: () => false,
    now: () => "2026-08-20T00:00:00.000Z",
    logEvent: () => {},
    saveState: () => { saves += 1; },
    sendState: () => { publishes += 1; }
  });
  return { runtime, saves: () => saves, publishes: () => publishes };
}

test("late opening status cannot regress a provider-accepted job", () => {
  const job = { id: "job-1", status: "generating", providerAcceptedAt: "accepted" };
  const subject = harness(job);
  subject.runtime.update({ jobId: job.id, status: "opening_provider", message: "late envelope" });
  assert.equal(job.status, "generating");
  assert.equal(subject.saves(), 0);
});

test("acknowledging an already accepted job persists identity without regressing status", () => {
  const job = { id: "job-1", projectId: "project-1", status: "pending", providerAcceptedAt: "accepted" };
  const subject = harness(job);
  subject.runtime.acknowledge({ jobId: job.id, sessionId: "session-1" });
  assert.equal(job.status, "pending");
  assert.equal(job.bridgeSessionId, "session-1");
  assert.equal(subject.saves(), 1);
  assert.equal(subject.publishes(), 0);
});

test("pre-submit Flow media errors become retryable instead of hanging submitting", () => {
  const job = { id: "job-flow", projectId: "project-1", jobType: "video", providerId: "google-flow-web", status: "submitting" };
  const subject = harness(job);
  subject.runtime.update({ jobId: job.id, status: "submitting", message: "Flow SDK media selection could not resolve reference.png: message channel closed" });
  assert.equal(job.status, "failed_retryable");
  assert.equal(job.needsStrictFlowRecovery, true);
  assert.equal(job.submissionState, "pre_submit_failed");
  assert.match(job.error, /media selection could not resolve/);
  assert.equal(subject.publishes(), 1);
});

test("missing Flow picker controls cannot leave a job stuck in submitting", () => {
  const job = { id: "job-flow-picker", projectId: "project-1", jobType: "video", providerId: "google-flow-web", status: "submitting" };
  const subject = harness(job);
  subject.runtime.update({ jobId: job.id, status: "submitting", message: "Flow composer add button was not visible; refusing toolbar upload path." });
  assert.equal(job.status, "failed_retryable");
  assert.equal(job.needsStrictFlowRecovery, true);
  assert.equal(job.submissionState, "pre_submit_failed");
  assert.equal(subject.publishes(), 1);
});

test("provider acceptance advances the durable submission state", () => {
  const job = { id: "job-accepted", projectId: "project-1", status: "submitting", submissionState: "bridge_delivered" };
  const subject = harness(job);
  subject.runtime.update({ jobId: job.id, status: "generating", message: "Provider accepted generation" });
  assert.equal(job.submissionState, "provider_accepted");
  assert.ok(job.providerAcceptedAt);
});

test("generic generating status does not falsely mark Flow provider acceptance", () => {
  const job = { id: "job-unconfirmed", projectId: "project-1", status: "submitting", submissionState: "executor_submitting" };
  const subject = harness(job);
  subject.runtime.update({ jobId: job.id, status: "generating", message: "Waiting after submit click" });
  assert.equal(job.providerAcceptedAt, undefined);
  assert.equal(job.submissionState, "executor_submitting");
});
