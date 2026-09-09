const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createMediaPersistence } = require("../main/media/media-persistence.cjs");

test("video hydration trusts persisted provider duration before probing macOS files", () => {
  let probes = 0;
  const service = createMediaPersistence({
    fs: { existsSync: () => true },
    execFileSync: () => { probes += 1; throw new Error("probe should not run"); },
    localPathFromStudioMediaUrl: (value) => value,
    path,
    app: {}, nativeImage: {}, Readable: {}, dataRoot: "", MEDIA_SERVER_PORT: 0,
    getState: () => ({}), collectVideoDurationMismatches: () => [], reconcileVideoResultState: () => {},
    logProductionTransitions: () => {}, now: () => new Date().toISOString(), id: () => "id",
    mediaMimeType: () => "video/mp4", toStudioMediaUrl: (value) => value
  });
  const asset = { type: "video", filePath: "/slow/indexed/video.mp4", metadata: { durationSeconds: 4 } };
  assert.equal(service.hydrateVideoMediaTruth(asset), true);
  assert.equal(asset.durationSeconds, 4);
  assert.equal(asset.metadata.durationSource, "provider_metadata");
  assert.equal(probes, 0);
});
