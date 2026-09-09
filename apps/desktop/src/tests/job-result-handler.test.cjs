const test = require("node:test");
const assert = require("node:assert/strict");
const { createJobResultHandler } = require("../main/jobs/result-handler.cjs");

function harness(jobPatch = {}, depPatch = {}) {
  const job = {
    id: "job-1", projectId: "project-1", shotId: "shot-1", jobType: "video",
    providerId: "google-flow-web", status: "generating", resultAssetIds: [], input: {},
    ...jobPatch
  };
  const state = { jobs: [job], assets: [], shots: [], projects: [] };
  let publishes = 0;
  const noop = () => {};
  const deps = {
    getState: () => state,
    isSavedConversationUrl: () => false,
    now: () => "2026-08-20T00:00:00.000Z",
    logEvent: noop,
    saveState: () => { publishes += 1; },
    sendToRenderer: noop,
    completedAssetJobMessage: () => "complete",
    supersedeRetriedSourceJob: noop,
    normalizeShotLinkedVideoAssets: noop,
    normalizeVideoJobsForCompletedShots: noop,
    structuredTextHandlers: {},
    duplicateFlowVideoResult: () => undefined,
    localPathFromStudioMediaUrl: () => undefined,
    probeIncomingMedia: undefined,
    fs: {}, path: {}, dataRoot: "", id: () => "asset-1", toStudioMediaUrl: (value) => value,
    shotAlreadyHasVideoForJob: () => false,
    attachExistingVideoAssetToJobShot: () => false,
    resolveDuplicateFlowVideoBlockers: noop,
    flowJobStartFrameAssetId: () => undefined,
    hydrateVideoMediaTruth: noop,
    ensureImagePreview: noop,
    promoteAssetToReference: () => false,
    repairRecoverableFlowVideoAssets: noop,
    quarantineUnverifiedFlowVideoAssets: noop,
    annotateVideoDurationMismatches: noop,
    directReferenceExistsForJob: () => false,
    ...depPatch
  };
  return { job, state, deps, finish: createJobResultHandler(deps), publishes: () => publishes };
}

test("preflight completion is persisted without importing media", () => {
  const subject = harness({ input: { bridgeMessage: { settings: { preflightOnly: true } } } });
  subject.finish({ jobId: "job-1", status: "waiting_manual_action" });
  assert.equal(subject.job.status, "done");
  assert.equal(subject.job.preflightPassedAt, "2026-08-20T00:00:00.000Z");
  assert.equal(subject.publishes(), 1);
});

test("failed Flow video requests strict recovery and remains retryable", () => {
  const subject = harness();
  subject.finish({ jobId: "job-1", status: "failed_retryable", error: "provider failed" });
  assert.equal(subject.job.status, "failed_retryable");
  assert.equal(subject.job.needsStrictFlowRecovery, true);
  assert.equal(subject.job.error, "provider failed");
  assert.equal(subject.job.submissionState, "pre_submit_failed");
  assert.equal(subject.publishes(), 1);
});

test("cancelled jobs ignore late provider messages", () => {
  const subject = harness({ status: "cancelled" });
  subject.finish({ jobId: "job-1", status: "done", assets: [] });
  assert.equal(subject.job.status, "cancelled");
  assert.equal(subject.publishes(), 0);
});

test("untrusted provider media is rejected before project import", (context) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-result-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "studio-result-outside-"));
  context.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  const source = path.join(outside, "result.mp4");
  fs.writeFileSync(source, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]));
  const subject = harness({}, {
    fs,
    path,
    dataRoot: root,
    downloadsRoot: path.join(root, "Downloads"),
    localPathFromStudioMediaUrl: () => ""
  });
  subject.finish({ jobId: "job-1", status: "done", assets: [{ type: "video", filePath: source, mimeType: "video/mp4" }] });
  assert.equal(subject.job.status, "failed_retryable");
  assert.match(subject.job.error, /outside_allowed_roots/);
  assert.equal(subject.state.assets.length, 0);
});

test("atomic persistence failure stays retryable without creating an asset", (context) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-result-atomic-failure-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "result.mp4");
  fs.writeFileSync(source, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]));
  const failingFs = { ...fs, renameSync: () => { throw new Error("simulated atomic rename failure"); } };
  const subject = harness({}, {
    fs: failingFs,
    path,
    dataRoot: root,
    downloadsRoot: path.join(root, "Downloads"),
    localPathFromStudioMediaUrl: () => ""
  });
  subject.finish({ jobId: "job-1", status: "done", assets: [{ type: "video", filePath: source, mimeType: "video/mp4" }] });
  assert.equal(subject.job.status, "failed_retryable");
  assert.match(subject.job.error, /persisted atomically/);
  assert.equal(subject.state.assets.length, 0);
});

test("video result is probed before import and persists measured duration", (context) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-result-probe-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "result.mp4");
  fs.writeFileSync(source, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]));
  const subject = harness({}, {
    fs, path, dataRoot: root, downloadsRoot: root, localPathFromStudioMediaUrl: () => "",
    probeIncomingMedia: () => ({ durationSeconds: 2.5, streams: [{ type: "video" }] }),
    hydrateVideoMediaTruth: () => undefined,
    toStudioMediaUrl: (value) => value
  });
  subject.finish({ jobId: "job-1", status: "done", assets: [{ type: "video", filePath: source, mimeType: "video/mp4", metadata: { durationSeconds: 2.5 } }] });
  assert.equal(subject.state.assets.length, 1);
  assert.equal(subject.state.assets[0].durationSeconds, 2.5);
  assert.equal(subject.state.assets[0].metadata.durationSource, "ffprobe");
});

test("video result with a mismatched probe duration is rejected before import", (context) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-result-probe-mismatch-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "result.mp4");
  fs.writeFileSync(source, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]));
  const subject = harness({}, {
    fs, path, dataRoot: root, downloadsRoot: root, localPathFromStudioMediaUrl: () => "",
    probeIncomingMedia: () => ({ durationSeconds: 2, streams: [{ type: "video" }] }),
    toStudioMediaUrl: (value) => value
  });
  subject.finish({ jobId: "job-1", status: "done", assets: [{ type: "video", filePath: source, mimeType: "video/mp4", metadata: { durationSeconds: 4 } }] });
  assert.equal(subject.job.status, "failed_retryable");
  assert.match(subject.job.error, /media_duration_mismatch/);
  assert.equal(subject.state.assets.length, 0);
});
