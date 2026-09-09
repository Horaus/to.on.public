const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promoteReferenceToShot } = require("../main/media/reference-keyframe.cjs");

test("promotes a project visual reference into a shot-scoped keyframe asset", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-keyframe-"));
  const source = path.join(root, "reference.png");
  fs.writeFileSync(source, Buffer.from("png-bytes"));
  const state = {
    projects: [{ id: "project-a" }],
    scenes: [{ id: "scene-a", projectId: "project-a", order: 1 }],
    shots: [{ id: "shot-a", sceneId: "scene-a", order: 1, assetIds: [], status: "draft" }],
    visualReferences: [{ id: "reference-a", projectId: "project-a", filePath: source, sourceProvider: "imagegen", sourceDescription: "lantern" }],
    assets: []
  };
  let saved = 0;
  const result = promoteReferenceToShot({ projectId: "project-a", shotId: "shot-a", referenceId: "reference-a", aspectRatio: "9:16" }, {
    fs, path, dataRoot: root, getState: () => state,
    mutateState: (mutator) => mutator(state), saveState: () => { saved += 1; }, id: () => "asset-keyframe-a", now: () => "2026-09-02T00:00:00.000Z", toStudioMediaUrl: (value) => `studio-media://${value}`
  });
  assert.equal(result.ok, true);
  assert.equal(result.assetId, "asset-keyframe-a");
  assert.equal(saved, 1);
  assert.deepEqual(state.shots[0].assetIds, ["asset-keyframe-a"]);
  assert.equal(state.assets[0].metadata.sourceVisualReferenceId, "reference-a");
  assert.equal(state.assets[0].metadata.referenceRole, "shot_keyframe");
  assert.deepEqual({ width: state.assets[0].metadata.width, height: state.assets[0].metadata.height }, { width: 720, height: 1280 });
  assert.equal(fs.existsSync(path.join(root, "projects/project-a/assets/scene-1/shot-1/asset-keyframe-a.png")), true);
  const reused = promoteReferenceToShot({ projectId: "project-a", shotId: "shot-a", referenceId: "reference-a" }, {
    fs, path, dataRoot: root, getState: () => state, mutateState: (mutator) => mutator(state), saveState: () => {}, id: () => "different", now: () => "later", toStudioMediaUrl: (value) => value
  });
  assert.equal(reused.reused, true);
});
