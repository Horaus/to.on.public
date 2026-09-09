const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function moduleUnderTest() {
  return import(`${pathToFileURL(path.resolve(__dirname, "../core/edit-sequence.ts")).href}?test=${Date.now()}`);
}

function sequence(clip) {
  return { id: "sequence_project", projectId: "project", revision: 1, clips: [clip], createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}

const oldAsset = { id: "video_old", projectId: "project", shotId: "shot", type: "video", filePath: "old.mp4", durationSeconds: 4, createdAt: "2026-01-01", metadata: {} };
const currentAsset = { id: "video_current", projectId: "project", shotId: "shot", type: "video", filePath: "current.mp4", durationSeconds: 6, createdAt: "2026-01-02", metadata: {} };
const shot = { id: "shot", sceneId: "scene", order: 1, description: "Shot", camera: "locked", motion: "rise", dominantAction: "rise", durationSec: 6, prompt: "animate", providerId: "google-flow-web", status: "review", assetIds: [oldAsset.id, currentAsset.id], currentVideoAssetId: currentAsset.id };

test("an untrimmed clip follows the newly selected full-length video", async () => {
  const { normalizeEditSequence } = await moduleUnderTest();
  const result = normalizeEditSequence(sequence({ id: "clip", shotId: shot.id, sourceAssetId: oldAsset.id, order: 0, sourceInSec: 0, sourceOutSec: 4, timelineDurationSec: 4, segment: 1 }), [shot], [oldAsset, currentAsset]);
  assert.deepEqual(result.clips[0], { id: "clip", shotId: shot.id, sourceAssetId: currentAsset.id, order: 0, sourceInSec: 0, sourceOutSec: 6, timelineDurationSec: 6, segment: 1 });
});

test("an intentional trim keeps its range when the selected video changes", async () => {
  const { normalizeEditSequence } = await moduleUnderTest();
  const result = normalizeEditSequence(sequence({ id: "clip", shotId: shot.id, sourceAssetId: oldAsset.id, order: 0, sourceInSec: 0.5, sourceOutSec: 3.5, timelineDurationSec: 3, segment: 1 }), [shot], [oldAsset, currentAsset]);
  assert.equal(result.clips[0].sourceAssetId, currentAsset.id);
  assert.equal(result.clips[0].sourceInSec, 0.5);
  assert.equal(result.clips[0].sourceOutSec, 3.5);
  assert.equal(result.clips[0].timelineDurationSec, 3);
});

test("a split clip is never expanded back to the full source", async () => {
  const { normalizeEditSequence } = await moduleUnderTest();
  const result = normalizeEditSequence(sequence({ id: "clip:a", splitFromClipId: "clip", shotId: shot.id, sourceAssetId: oldAsset.id, order: 0, sourceInSec: 0, sourceOutSec: 2, timelineDurationSec: 2, segment: 1 }), [shot], [oldAsset, currentAsset]);
  assert.equal(result.clips[0].sourceAssetId, currentAsset.id);
  assert.equal(result.clips[0].sourceOutSec, 2);
  assert.equal(result.clips[0].timelineDurationSec, 2);
});
