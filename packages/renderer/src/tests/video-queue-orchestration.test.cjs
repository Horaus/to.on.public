const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("video queue orchestration is isolated from React and preserves serial dispatch rules", async () => {
  const source = require("../../../workflow/src/orchestration/video-queue.cjs");
  const scene = { id: "scene-1", order: 1 };
  const shot = { id: "shot-1", sceneId: scene.id, order: 1, assetIds: ["keyframe-1"] };
  const secondShot = { id: "shot-2", sceneId: scene.id, order: 2, assetIds: ["keyframe-2"] };
  const selectors = { hasKeyframe: () => true, hasVideo: () => false };
  assert.equal(source.nextRenderableVideoShot({ projectId: "project-1", scenes: [scene], shots: [shot], jobs: [], flowProjectTabReady: true, ...selectors })?.id, shot.id);
  const activeJob = { id: "job-active", projectId: "project-1", shotId: shot.id, jobType: "video", status: "generating", updatedAt: new Date().toISOString() };
  assert.equal(source.nextRenderableVideoShot({ projectId: "project-1", scenes: [scene], shots: [shot], jobs: [activeJob], flowProjectTabReady: true, ...selectors }), undefined);
  // The continuation pump must never dispatch shot 2 while shot 1 is active.
  assert.equal(source.nextRenderableVideoShot({ projectId: "project-1", scenes: [scene], shots: [shot, secondShot], jobs: [activeJob], flowProjectTabReady: true, ...selectors }), undefined);
  const completedFirst = { ...activeJob, status: "review_required", resultAssetIds: ["video-1"], updatedAt: new Date().toISOString() };
  const next = source.nextRenderableVideoShot({ projectId: "project-1", scenes: [scene], shots: [shot, secondShot], jobs: [completedFirst], flowProjectTabReady: true, hasKeyframe: () => true, hasVideo: (candidate) => candidate.id === shot.id });
  assert.equal(next?.id, secondShot.id);
});

test("a later successful video result supersedes historical failure without erasing it", async () => {
  const { shotHasUnresolvedVideoIssue } = require("../../../workflow/src/orchestration/video-queue.cjs");
  const failed = { id: "old", shotId: "shot-1", jobType: "video", status: "failed_retryable", error: "provider failed", updatedAt: "2026-01-01T00:00:00.000Z" };
  const success = { id: "new", shotId: "shot-1", jobType: "video", status: "review_required", updatedAt: "2026-01-01T00:01:00.000Z" };
  assert.equal(shotHasUnresolvedVideoIssue("shot-1", [failed], false), true);
  assert.equal(shotHasUnresolvedVideoIssue("shot-1", [failed, success], false), false);
});

test("a known pre-submit Flow media timeout allows a fresh submit once the project tab is ready", () => {
  const { flowFailureAllowsFreshSubmit, shotHasUnresolvedVideoIssue } = require("../../../workflow/src/orchestration/video-queue.cjs");
  const failed = {
    id: "old-media-timeout",
    providerId: "google-flow-web",
    shotId: "shot-1",
    jobType: "video",
    status: "failed_retryable",
    error: "Failed to open provider tab: Timed out waiting for continuity reference 2.",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  assert.equal(flowFailureAllowsFreshSubmit(failed, false), false);
  assert.equal(flowFailureAllowsFreshSubmit(failed, true), true);
  assert.equal(shotHasUnresolvedVideoIssue("shot-1", [failed], true), false);
});

test("a conclusive strict recovery miss permits one fresh YOLO attempt", () => {
  const { flowFailureAllowsFreshSubmit, shotHasUnresolvedVideoIssue } = require("../../../workflow/src/orchestration/video-queue.cjs");
  const failed = {
    id: "strict-miss",
    providerId: "google-flow-web",
    shotId: "shot-1",
    jobType: "video",
    status: "failed_retryable",
    error: "Flow reloaded after submit, but strict recovery could not tie a completed video to this job.",
    flowRecoveryAttempts: 1,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  assert.equal(flowFailureAllowsFreshSubmit({ ...failed, flowRecoveryAttempts: 0 }, true), true);
  assert.equal(flowFailureAllowsFreshSubmit(failed, true), true);
  assert.equal(shotHasUnresolvedVideoIssue("shot-1", [failed], true), false);
});

test("Flow recovery decisions inspect error and status message together", () => {
  const { flowFailureAllowsFreshSubmit, shotHasUnresolvedVideoIssue } = require("../../../workflow/src/orchestration/video-queue.cjs");
  const failed = {
    id: "split-diagnostic",
    providerId: "google-flow-web",
    shotId: "shot-1",
    jobType: "video",
    status: "failed_retryable",
    error: "Provider request ended without a downloadable result.",
    statusMessage: "No recoverable Google Flow video was found in the current project tab.",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  assert.equal(flowFailureAllowsFreshSubmit(failed, true), true);
  assert.equal(shotHasUnresolvedVideoIssue("shot-1", [failed], true), false);
});

test("workflow and batch templates guard against overlapping or unready Flow jobs", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../workflow/src/orchestration/pipeline-actions.ts"), "utf8");
  const workflowStart = source.indexOf("function runWorkflowTemplate");
  const batchStart = source.indexOf("function runBatchQueue");
  const videoStart = source.indexOf("function runVideoBatchQueue");
  const workflowTemplate = workflowStart >= 0 && batchStart > workflowStart ? source.slice(workflowStart, batchStart) : "";
  const batchQueue = batchStart >= 0 && videoStart > batchStart ? source.slice(batchStart, videoStart) : "";
  for (const block of [workflowTemplate, batchQueue]) {
    assert.match(block, /isProjectJobBusy/);
    assert.match(block, /flowProjectTabReady/);
    assert.match(block, /setPipelineRun/);
  }
});
