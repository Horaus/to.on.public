const test = require("node:test");
const assert = require("node:assert/strict");
const {
  collectVideoDurationMismatches,
  reconcileVideoResultState
} = require("../main/production-state.cjs");

function fixture() {
  return {
    shots: [{ id: "shot_1", sceneId: "scene_1", durationSec: 4, status: "queued", assetIds: ["frame_1", "video_old", "video_new"] }],
    assets: [
      { id: "frame_1", shotId: "shot_1", type: "image", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "video_old", shotId: "shot_1", type: "video", sourceJobId: "job_old", durationSeconds: 4, createdAt: "2026-01-01T00:01:00.000Z" },
      { id: "video_new", shotId: "shot_1", type: "video", sourceJobId: "job_new", durationSeconds: 8, createdAt: "2026-01-01T00:02:00.000Z", metadata: {
        providerJobId: "flow_relay_fe_id_result",
        flowMediaId: "fe_id_result",
        flowCustomToolExecutor: "flow-relay-v1",
        startFrameAssetId: "frame_1",
        startFrameValidation: { passed: true, mode: "relay-runtime" },
        aspectRatio: "9:16",
        providerMetadataComplete: true
      } }
    ],
    jobs: [
      { id: "job_old", shotId: "shot_1", jobType: "video", status: "review_required", resultAssetIds: ["video_old"], createdAt: "2026-01-01T00:00:30.000Z", updatedAt: "2026-01-01T00:01:00.000Z" },
      { id: "job_new", shotId: "shot_1", jobType: "video", status: "failed_retryable", resultAssetIds: ["video_new"], createdAt: "2026-01-01T00:01:30.000Z", updatedAt: "2026-01-01T00:02:00.000Z" }
    ]
  };
}

test("media-backed result reconciles queued shot and preserves superseded lineage", () => {
  const state = fixture();
  const transitions = reconcileVideoResultState(state, { now: () => "2026-01-01T00:03:00.000Z" });
  assert.equal(state.shots[0].status, "review");
  assert.equal(state.shots[0].currentVideoJobId, "job_new");
  assert.equal(state.shots[0].currentVideoAssetId, "video_new");
  assert.equal(state.jobs[1].status, "review_required");
  assert.equal(state.jobs[0].status, "cancelled");
  assert.equal(state.jobs[0].supersededByJobId, "job_new");
  assert.deepEqual(state.jobs[0].resultAssetIds, ["video_old"]);
  assert.equal(state.jobs[1].providerJobId, "flow_relay_fe_id_result");
  assert.equal(state.jobs[1].flowMediaId, "fe_id_result");
  assert.equal(state.jobs[1].flowCustomToolExecutor, "flow-relay-v1");
  assert.equal(state.jobs[1].startFrameAssetId, "frame_1");
  assert.deepEqual(state.jobs[1].startFrameValidation, { passed: true, mode: "relay-runtime" });
  assert.equal(state.jobs[1].aspectRatio, "9:16");
  assert.equal(state.jobs[1].durationSeconds, 8);
  assert.equal(state.jobs[1].providerMetadataComplete, true);
  assert.ok(transitions.some((transition) => transition.event === "shot_status_reconciled"));
});

test("stale failure cannot regress a newer successful shot result", () => {
  const state = fixture();
  reconcileVideoResultState(state);
  state.jobs[0].status = "failed_retryable";
  state.shots[0].status = "failed";
  reconcileVideoResultState(state);
  assert.equal(state.shots[0].status, "review");
  assert.equal(state.shots[0].currentVideoJobId, "job_new");
  assert.equal(state.jobs[0].status, "cancelled");
  assert.equal(state.jobs[1].status, "review_required");
});

test("planned and measured source duration mismatch is explicit", () => {
  const state = fixture();
  reconcileVideoResultState(state);
  assert.deepEqual(collectVideoDurationMismatches(state), [{
    shotId: "shot_1",
    assetId: "video_new",
    plannedDurationSeconds: 4,
    sourceDurationSeconds: 8,
    deltaSeconds: 4
  }]);
});

test("cross-project current video pointers are cleared before reconciliation", () => {
  const state = {
    shots: [{ id: "shot-a", projectId: "project-a", durationSec: 4, status: "queued", assetIds: [] }],
    jobs: [{ id: "job-b", projectId: "project-b", shotId: "shot-b", jobType: "video", status: "review_required", resultAssetIds: ["video-b"] }],
    assets: [{ id: "video-b", projectId: "project-b", shotId: "shot-b", type: "video", createdAt: "2026-01-01T00:00:00.000Z" }]
  };
  state.shots[0].currentVideoJobId = "job-b";
  state.shots[0].currentVideoAssetId = "video-b";
  const transitions = reconcileVideoResultState(state);
  assert.equal(state.shots[0].currentVideoJobId, undefined);
  assert.equal(state.shots[0].currentVideoAssetId, undefined);
  assert.ok(transitions.some((item) => item.event === "stale_shot_video_pointer_cleared"));
});
