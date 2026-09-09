const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const policyPromise = import(pathToFileURL(path.resolve(__dirname, "../../../workflow/src/studio-retry-policy.ts")));

function job(overrides = {}) {
  return {
    id: "job_1",
    projectId: "project_1",
    providerId: "chatgpt-web",
    jobType: "text",
    status: "failed_retryable",
    input: { bridgeMessage: { task: "story_foundation" } },
    ...overrides
  };
}

test("late ChatGPT text is recovered once from a real conversation", async () => {
  const { classifyTextRetry } = await policyPromise;
  const decision = classifyTextRetry(job({
    error: "Timeout waiting for complete structured JSON",
    providerConversationUrl: "https://chatgpt.com/c/abc-123",
    recoveryAttempts: 0
  }));
  assert.equal(decision.recoverLateTextFirst, true);
  assert.equal(decision.canRecoverSavedChat, true);

  const exhausted = classifyTextRetry(job({
    error: "Timeout waiting for complete structured JSON",
    providerConversationUrl: "https://chatgpt.com/c/abc-123",
    recoveryAttempts: 1
  }));
  assert.equal(exhausted.canRecoverSavedChat, false);
});

test("invalid or importer-degenerated text requires a fresh bounded request", async () => {
  const { classifyTextRetry, isCorrectableStructuredImportFailure, isDeterministicStructuredImportFailure, shouldReuseSavedStructuredArtifact } = await policyPromise;
  const importerFailure = job({ error: "Cannot import story architecture: Narrative contract requires beats" });
  assert.equal(classifyTextRetry(importerFailure).requiresFreshTextRequest, true);
  assert.equal(isCorrectableStructuredImportFailure(importerFailure), true);
  const lockedRewrite = job({ error: "Cannot import scene screenplay: Scene screenplay rewrites locked objective." });
  assert.equal(classifyTextRetry(lockedRewrite).requiresFreshTextRequest, true);
  assert.equal(isCorrectableStructuredImportFailure(lockedRewrite), true);
  const overflow = { ...importerFailure, error: "Cannot import scene screenplay: SCREENPLAY_RUNTIME_OVERFLOW: locked cues require at least 8 shots." };
  assert.equal(isCorrectableStructuredImportFailure(overflow), false);
  assert.equal(isDeterministicStructuredImportFailure(overflow), true);

  const degenerated = job({ error: "PROVIDER_OUTPUT_DEGENERATED token loop" });
  assert.equal(shouldReuseSavedStructuredArtifact(degenerated), false);
});

test("Flow reuses one active shot job instead of creating parallel work", async () => {
  const { findActiveFlowJobForShot } = await policyPromise;
  const failed = job({ id: "failed", providerId: "google-flow-web", jobType: "video", shotId: "SH1" });
  const active = job({ id: "active", providerId: "google-flow-web", jobType: "video", shotId: "SH1", status: "generating" });
  const otherShot = job({ id: "other", providerId: "google-flow-web", jobType: "video", shotId: "SH2", status: "generating" });
  assert.equal(findActiveFlowJobForShot(failed, [failed, otherShot, active])?.id, "active");
});

test("Flow recovery never resubmits until strict recovery has conclusively missed", async () => {
  const { shouldRecoverFlowOnly } = await policyPromise;
  assert.equal(shouldRecoverFlowOnly(job({
    providerId: "google-flow-web",
    jobType: "video",
    error: "Previous desktop session ended; checking generated result",
    flowRecoveryAttempts: 0
  })), true);
  assert.equal(shouldRecoverFlowOnly(job({
    providerId: "google-flow-web",
    jobType: "video",
    error: "No recoverable Google Flow video was found",
    flowRecoveryAttempts: 1
  })), false);
  assert.equal(shouldRecoverFlowOnly(job({
    providerId: "google-flow-web",
    jobType: "video",
    error: "Video could not be attached to the shot",
    flowRecoveryAttempts: 0
  })), false);
});

test("retry recovery plan produces exactly one provider action", async () => {
  const { planRetryRecovery } = await policyPromise;
  const completedVideo = job({ providerId: "google-flow-web", jobType: "video", shotId: "SH1" });
  assert.equal(planRetryRecovery(completedVideo, [completedVideo], true).kind, "continue-after-existing-video");

  const lateText = job({
    error: "Timeout waiting for complete structured JSON",
    providerConversationUrl: "https://chatgpt.com/c/abc-123"
  });
  assert.deepEqual(planRetryRecovery(lateText, [lateText], false), { kind: "recover-chatgpt", late: true });

  const unrecoverable = job({ error: "PROMPT_NOT_SUBMITTED", providerConversationUrl: "https://chatgpt.com/c/abc-123" });
  assert.equal(planRetryRecovery(unrecoverable, [unrecoverable], false).kind, "create-fresh-attempt");

  const failedFlow = job({ id: "failed-flow", providerId: "google-flow-web", jobType: "video", shotId: "SH1", error: "No recoverable Google Flow video was found" });
  const activeRecovery = job({ id: "active-recovery", providerId: "google-flow-web", jobType: "video", shotId: "SH1", status: "downloading", statusMessage: "Recovering only strict current-job Google Flow video media...", flowRecoveryAttemptedAt: new Date().toISOString() });
  assert.equal(planRetryRecovery(failedFlow, [failedFlow, activeRecovery], false).kind, "wait-active-flow");
});
