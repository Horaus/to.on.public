const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareMasterExportClips } = require("../main/master-export.cjs");

const sequence = { clips: [{ id: "clip_1", sourceAssetId: "video_1", order: 0, sourceInSec: 1, sourceOutSec: 3 }] };
const asset = (status) => ({ id: "video_1", type: "video", filePath: "/tmp/video.mp4", metadata: { editorialReview: { status } } });
const options = { sequence, localPathFromAsset: (item) => item.filePath, fileExists: () => true };

test("final master does not require an editorial approval step", () => {
  assert.deepEqual(prepareMasterExportClips({ ...options, assets: [asset("rejected")], draft: false })[0], { id: "clip_1", assetId: "video_1", filePath: "/tmp/video.mp4", sourceInSec: 1, sourceOutSec: 3 });
});

test("draft permits unaccepted sources but never missing media or invalid ranges", () => {
  assert.equal(prepareMasterExportClips({ ...options, assets: [asset("rejected")], draft: true }).length, 1);
  assert.throws(() => prepareMasterExportClips({ ...options, assets: [], draft: true }), /Missing source video/);
  assert.throws(() => prepareMasterExportClips({ ...options, sequence: { clips: [{ ...sequence.clips[0], sourceOutSec: 1 }] }, assets: [asset("accepted")], draft: true }), /Invalid source range/);
});

test("final export rejects an accepted review attached to a non-video asset", () => {
  const image = { id: "video_1", type: "image", filePath: "/tmp/frame.png", metadata: { editorialReview: { status: "accepted" } } };
  assert.throws(() => prepareMasterExportClips({ ...options, assets: [image], draft: false }), /Missing source video/);
});

test("final export resolves reviewed legacy clips through their shot id", () => {
  const legacySequence = { clips: [{ id: "clip_legacy", shotId: "shot_1", order: 0, sourceInSec: 0, sourceOutSec: 4 }] };
  const reviewedVideo = { id: "video_legacy", shotId: "shot_1", type: "video", filePath: "/tmp/legacy.mp4", createdAt: "2026-01-01T00:00:00.000Z", metadata: { editorialReview: { status: "accepted" } } };
  const result = prepareMasterExportClips({ sequence: legacySequence, assets: [reviewedVideo], draft: false, localPathFromAsset: (item) => item.filePath, fileExists: () => true });
  assert.deepEqual(result[0], { id: "clip_legacy", assetId: "video_legacy", filePath: "/tmp/legacy.mp4", sourceInSec: 0, sourceOutSec: 4 });
});

test("final export falls back when a legacy clip points at a non-video asset", () => {
  const staleSequence = { clips: [{ id: "clip_stale", shotId: "shot_2", sourceAssetId: "image_old", order: 0, sourceInSec: 0, sourceOutSec: 4 }] };
  const image = { id: "image_old", shotId: "shot_2", type: "image", filePath: "/tmp/old.png" };
  const reviewedVideo = { id: "video_current", shotId: "shot_2", type: "video", filePath: "/tmp/current.mp4", createdAt: "2026-01-02T00:00:00.000Z", metadata: { editorialReview: { status: "accepted" } } };
  const result = prepareMasterExportClips({ sequence: staleSequence, assets: [image, reviewedVideo], draft: false, localPathFromAsset: (item) => item.filePath, fileExists: () => true });
  assert.equal(result[0].assetId, "video_current");
});
