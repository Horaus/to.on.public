const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBridgeReferenceStorage } = require("../main/bridge/reference-storage.cjs");

test("bridge references cross the provider boundary as bytes but persist as local paths", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-bridge-ref-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source image.png");
  fs.writeFileSync(source, Buffer.from("reference"));
  const state = { visualReferences: [], jobs: [] };
  const storage = createBridgeReferenceStorage({ dataRoot: root, mediaPort: 3768, getState: () => state, toMediaUrl: (value) => `media:${value}` });

  const encoded = storage.encode({ references: [{ assetId: "face", filePath: source }] });
  assert.equal(encoded.references[0].base64, Buffer.from("reference").toString("base64"));
  assert.equal(encoded.references[0].filename, "source image.png");

  const withPreview = storage.encode({ references: [{ assetId: "face", filePath: source, dataUrl: "data:image/png;base64,duplicate", previewDataUrl: "data:image/png;base64,duplicate" }] });
  assert.equal("dataUrl" in withPreview.references[0], false);
  assert.equal("previewDataUrl" in withPreview.references[0], false);

  const normalized = storage.normalize("p1", { jobId: "j1", references: encoded.references });
  assert.equal("base64" in normalized.references[0], false);
  assert.ok(fs.existsSync(normalized.references[0].filePath));
  assert.match(normalized.references[0].filePath, /projects\/p1\/job-references\/j1_face\.png$/);
});

test("embedded state media is sanitized once without changing plain references", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-state-ref-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const state = {
    visualReferences: [{ id: "r1", projectId: "p1", filePath: `data:image/png;base64,${Buffer.from("image").toString("base64")}`, previewDataUrl: "data:image/png;base64,old" }],
    jobs: []
  };
  const storage = createBridgeReferenceStorage({ dataRoot: root, mediaPort: 3768, getState: () => state, toMediaUrl: (value) => `media:${value}` });
  assert.equal(storage.sanitizeState(), true);
  assert.equal(state.visualReferences[0].filePath.startsWith("data:"), false);
  assert.equal(state.visualReferences[0].previewDataUrl.startsWith("media:"), true);
  assert.equal(storage.sanitizeState(), false);
});

test("Flow Studio Shot Bridge receives inline reference bytes", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-flow-ref-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "keyframe.png");
  fs.writeFileSync(source, Buffer.alloc(1024, 7));
  const storage = createBridgeReferenceStorage({ dataRoot: root, mediaPort: 3768, getState: () => ({ visualReferences: [], jobs: [] }), toMediaUrl: (value) => `media:${value}` });

  const encoded = storage.encode({ provider: "google-flow", settings: { flowExecutor: "custom-tool-v1" }, references: [{ assetId: "frame", filePath: source }] });
  assert.equal(encoded.references[0].base64, Buffer.alloc(1024, 7).toString("base64"));
  assert.equal(encoded.references[0].filePath, source);

  const direct = storage.encode({ provider: "google-flow", settings: { flowExecutor: "flow-ui-direct-v2" }, references: [{ assetId: "frame", filePath: source }] });
  assert.equal(direct.references[0].base64, Buffer.alloc(1024, 7).toString("base64"));
});

test("ChatGPT references stay as native file paths to avoid oversized envelopes", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-chatgpt-ref-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "large-reference.png");
  fs.writeFileSync(source, Buffer.alloc(1024, 7));
  const storage = createBridgeReferenceStorage({ dataRoot: root, mediaPort: 3768, getState: () => ({ visualReferences: [], jobs: [] }), toMediaUrl: (value) => `media:${value}` });

  const encoded = storage.encode({ provider: "chatgpt", references: [{ assetId: "face", filePath: source, base64: "should-not-cross", dataUrl: "data:image/png;base64:duplicate" }] });
  assert.equal(encoded.references[0].filePath, source);
  assert.equal("base64" in encoded.references[0], false);
  assert.equal("dataUrl" in encoded.references[0], false);
});
