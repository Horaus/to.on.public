const test = require("node:test");
const assert = require("node:assert/strict");
const { VIDEO_EDITORIAL_CHECK_KEYS, planGeneratedOutputReview, normalizeVideoEditorialReview, applyVideoEditorialReview, reconcileReviewedVideoWithSequence } = require("../main/video-editorial.cjs");

const passingChecks = () => Object.fromEntries(VIDEO_EDITORIAL_CHECK_KEYS.map((key) => [key, true]));
const frames = { first: { filePath: "/tmp/first.jpg" }, last: { filePath: "/tmp/last.jpg" } };

test("acceptance requires all checks and both boundary frames", () => {
  assert.throws(() => normalizeVideoEditorialReview({ status: "accepted", checks: passingChecks() }, { frames: {} }), /first and last frames/);
  const incomplete = passingChecks();
  incomplete.durationValid = false;
  assert.throws(() => normalizeVideoEditorialReview({ status: "accepted", checks: incomplete }, { frames }), /every editorial check/);
  assert.equal(normalizeVideoEditorialReview({ status: "accepted", checks: passingChecks() }, { frames }).status, "accepted");
});

test("rejection keeps the asset and records its reason", () => {
  assert.throws(() => normalizeVideoEditorialReview({ status: "rejected" }, { frames }), /requires a reason/);
  const asset = { id: "video_1", metadata: {} };
  const shot = { id: "shot_1", currentVideoAssetId: "video_1", status: "review" };
  const review = normalizeVideoEditorialReview({ status: "rejected", reason: "Invented prop" }, { frames, reviewedAt: "2026-01-01" });
  applyVideoEditorialReview({ asset, shot, review });
  assert.equal(asset.metadata.editorialReview.reason, "Invented prop");
  assert.equal(shot.status, "review");
  assert.equal(asset.id, "video_1");
});

test("accepted current asset approves its shot while a replacement preserves old review history", () => {
  const oldReview = normalizeVideoEditorialReview({ status: "rejected", reason: "Bad continuity" }, { frames, reviewedAt: "2026-01-01" });
  const asset = { id: "video_new", metadata: { editorialReview: oldReview } };
  const shot = { id: "shot_1", currentVideoAssetId: "video_new", status: "review" };
  const accepted = normalizeVideoEditorialReview({ status: "accepted", checks: passingChecks() }, { frames, reviewedAt: "2026-01-02" });
  applyVideoEditorialReview({ asset, shot, review: accepted });
  assert.equal(shot.status, "approved");
  assert.equal(asset.metadata.editorialReviewHistory.length, 1);
  assert.equal(asset.metadata.editorialReviewHistory[0].status, "rejected");

  const supersededAsset = { id: "video_old", metadata: {} };
  applyVideoEditorialReview({ asset: supersededAsset, shot, review: oldReview });
  assert.equal(shot.status, "approved");
  assert.equal(supersededAsset.metadata.editorialReview.status, "rejected");
});

test("accepted video becomes the persisted source of every edit segment for its shot", () => {
  const project = { editSequence: { id: "sequence_1", revision: 3, updatedAt: "old", clips: [
    { id: "clip_a", shotId: "shot_1", sourceInSec: 0, sourceOutSec: 8, timelineDurationSec: 8 },
    { id: "clip_b", shotId: "shot_1", sourceAssetId: "video_old", sourceInSec: 2, sourceOutSec: 8, timelineDurationSec: 6 },
    { id: "clip_c", shotId: "shot_2", sourceAssetId: "video_other", sourceInSec: 0, sourceOutSec: 4, timelineDurationSec: 4 }
  ] } };
  const changed = reconcileReviewedVideoWithSequence({ project, shot: { id: "shot_1", durationSec: 8 }, asset: { id: "video_new", durationSeconds: 8 }, review: { status: "accepted" }, timestamp: "new" });
  assert.equal(changed, true);
  assert.equal(project.editSequence.revision, 4);
  assert.equal(project.editSequence.updatedAt, "new");
  assert.deepEqual(project.editSequence.clips.slice(0, 2).map((clip) => clip.sourceAssetId), ["video_new", "video_new"]);
  assert.equal(project.editSequence.clips[2].sourceAssetId, "video_other");
});

test("accepted video trims its edit tail to authored active content", () => {
  const project = { editSequence: { revision: 1, clips: [{ id: "clip_1", shotId: "shot_1", sourceInSec: 0, sourceOutSec: 8, timelineDurationSec: 8 }] } };
  const changed = reconcileReviewedVideoWithSequence({
    project,
    shot: { id: "shot_1", durationSec: 8, timingContract: { estimatedActiveDurationSec: 4.6 } },
    asset: { id: "video_new", durationSeconds: 8 },
    review: { status: "accepted" },
    timestamp: "new"
  });
  assert.equal(changed, true);
  assert.equal(project.editSequence.clips[0].sourceOutSec, 4.6);
  assert.equal(project.editSequence.clips[0].timelineDurationSec, 4.6);
});

test("rejecting or removing the selected video clears the persisted source without deleting the edit", () => {
  const project = { editSequence: { revision: 1, clips: [{ id: "clip_1", shotId: "shot_1", sourceAssetId: "video_bad", sourceInSec: 0, sourceOutSec: 8, timelineDurationSec: 8 }] } };
  const changed = reconcileReviewedVideoWithSequence({ project, shot: { id: "shot_1" }, asset: { id: "video_bad" }, review: { status: "rejected" }, timestamp: "new" });
  assert.equal(changed, true);
  assert.equal(project.editSequence.revision, 2);
  assert.equal(project.editSequence.clips.length, 1);
  assert.equal(project.editSequence.clips[0].sourceAssetId, undefined);
});

test("generated-output review routes only timestamped high-confidence evidence", () => {
  assert.equal(planGeneratedOutputReview({ evidence: [] }).route, "human_review");
  assert.equal(planGeneratedOutputReview({ evidence: [{ startSec: 1, endSec: 2, issueType: "random_artifact", confidence: 0.9 }] }).route, "retry");
  assert.equal(planGeneratedOutputReview({ evidence: [{ startSec: 1, endSec: 2, issueType: "adapter_mapping", confidence: 0.9 }] }).route, "recompile");
  assert.equal(planGeneratedOutputReview({ evidence: [{ startSec: 1, endSec: 2, issueType: "overloaded_shot", confidence: 0.9 }] }).route, "split");
  assert.equal(planGeneratedOutputReview({ evidence: [{ startSec: 1, endSec: 2, issueType: "provider_limitation", confidence: 0.9 }] }).route, "change_provider");
  assert.equal(planGeneratedOutputReview({ evidence: [{ startSec: 1, endSec: 2, issueType: "random_artifact", confidence: 0.4 }] }).route, "human_review");
});
