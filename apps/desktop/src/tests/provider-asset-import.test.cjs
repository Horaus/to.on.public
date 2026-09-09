const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { inferIncomingAssetType, persistIncomingAssetFile, validateIncomingMediaSource } = require("../main/provider-asset-import.cjs");

test("incoming asset type is inferred from mime, filename, then requested job type", () => {
  assert.equal(inferIncomingAssetType({ mimeType: "video/mp4" }, "image"), "video");
  assert.equal(inferIncomingAssetType({ filename: "frame.webp" }, "video"), "image");
  assert.equal(inferIncomingAssetType({}, "video"), "video");
});

test("downloaded provider media is copied into immutable project storage", () => {
  const writes = [];
  const fs = {
    existsSync: () => true,
    mkdirSync: (value) => writes.push(["mkdir", value]),
    copyFileSync: (source, destination) => writes.push(["copy", source, destination])
  };
  const result = persistIncomingAssetFile({
    incoming: { filePath: "file:///tmp/result.mp4" },
    incomingType: "video",
    projectId: "project_1",
    dataRoot: "/studio",
    fs,
    path,
    makeId: () => "video_1",
    toMediaUrl: (value) => `studio-media://${value}`
  });
  assert.equal(result, "studio-media:///studio/projects/project_1/videos/video_1.mp4");
  assert.ok(writes.some(([kind]) => kind === "copy"));
});

test("data URLs are decoded once and never retained in persisted state", () => {
  let saved;
  const fs = {
    mkdirSync: () => {},
    writeFileSync: (destination, buffer) => { saved = { destination, text: buffer.toString("utf8") }; }
  };
  const result = persistIncomingAssetFile({
    incoming: { filePath: `data:image/png;base64,${Buffer.from("image-bytes").toString("base64")}` },
    incomingType: "image",
    projectId: "project_1",
    dataRoot: "/studio",
    fs,
    path,
    makeId: () => "asset_1",
    toMediaUrl: (value) => `studio-media://${value}`
  });
  assert.equal(saved.text, "image-bytes");
  assert.match(saved.destination, /asset_1\.png$/);
  assert.equal(result, "studio-media:///studio/projects/project_1/images/asset_1.png");
});

test("provider media validation rejects a declared MIME/type mismatch before reading", () => {
  let read = false;
  const fakeFs = {
    existsSync: () => { read = true; return true; },
    realpathSync: (value) => value,
    statSync: () => ({ size: 8, isFile: true }),
    readFileSync: () => { read = true; return Buffer.alloc(8); }
  };
  assert.deepEqual(validateIncomingMediaSource({
    incoming: { filePath: "/studio/result.mp4", mimeType: "image/png" },
    incomingType: "video",
    dataRoot: "/studio",
    downloadsRoot: "",
    fs: fakeFs,
    path,
    localPathFromStudioMediaUrl: () => ""
  }), { ok: false, code: "media_type_mismatch" });
  assert.equal(read, false);
  assert.deepEqual(validateIncomingMediaSource({
    incoming: { filePath: "data:image/png;base64,AA==" },
    incomingType: "video",
    dataRoot: "/studio",
    downloadsRoot: "",
    fs: fakeFs,
    path,
    localPathFromStudioMediaUrl: () => ""
  }), { ok: false, code: "media_type_mismatch" });
});

test("provider media persistence renames a temporary file into place", (context) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-media-atomic-"));
  const source = path.join(root, "source.mp4");
  const dataRoot = path.join(root, "data");
  fs.writeFileSync(source, Buffer.from("complete-provider-result"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = persistIncomingAssetFile({
    incoming: { filePath: source },
    incomingType: "video",
    projectId: "project_1",
    dataRoot,
    fs,
    path,
    makeId: () => "video_atomic",
    toMediaUrl: (value) => value
  });
  assert.equal(fs.readFileSync(result, "utf8"), "complete-provider-result");
  assert.deepEqual(fs.readdirSync(path.dirname(result)).filter((name) => name.includes(".tmp-")), []);
});

test("provider media validation rejects remote and outside-root sources", (context) => {
  const root = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "studio-media-root-"));
  const outside = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "studio-media-outside-"));
  context.after(() => {
    require("node:fs").rmSync(root, { recursive: true, force: true });
    require("node:fs").rmSync(outside, { recursive: true, force: true });
  });
  const external = require("node:path").join(outside, "result.mp4");
  require("node:fs").writeFileSync(external, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]));
  const options = { incomingType: "video", dataRoot: root, downloadsRoot: "", fs: require("node:fs"), path, localPathFromStudioMediaUrl: () => "" };
  assert.deepEqual(validateIncomingMediaSource({ ...options, incoming: { filePath: external } }), { ok: false, code: "outside_allowed_roots" });
  assert.deepEqual(validateIncomingMediaSource({ ...options, incoming: { filePath: "https://provider.invalid/video.mp4" } }), { ok: false, code: "untrusted_media_scheme" });
  const symlink = require("node:path").join(root, "linked.mp4");
  try {
    require("node:fs").symlinkSync(external, symlink);
    assert.deepEqual(validateIncomingMediaSource({ ...options, incoming: { filePath: symlink } }), { ok: false, code: "outside_allowed_roots" });
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EEXIST") throw error;
  }
});

test("provider media validation checks magic bytes for data and local files", (context) => {
  const root = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "studio-media-signature-"));
  context.after(() => require("node:fs").rmSync(root, { recursive: true, force: true }));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const imagePath = require("node:path").join(root, "frame.png");
  const fakePath = require("node:path").join(root, "fake.png");
  require("node:fs").writeFileSync(imagePath, png);
  require("node:fs").writeFileSync(fakePath, Buffer.from("not-an-image"));
  const options = { incomingType: "image", dataRoot: root, downloadsRoot: "", fs: require("node:fs"), path, localPathFromStudioMediaUrl: () => "" };
  assert.equal(validateIncomingMediaSource({ ...options, incoming: { filePath: imagePath } }).ok, true);
  assert.deepEqual(validateIncomingMediaSource({ ...options, incoming: { filePath: fakePath } }), { ok: false, code: "invalid_media_signature" });
  assert.equal(validateIncomingMediaSource({ ...options, incoming: { filePath: `data:image/png;base64,${png.toString("base64")}` } }).ok, true);
});

test("provider media validation enforces a bounded file size before reading bytes", () => {
  const fakeFs = {
    existsSync: () => true,
    realpathSync: (value) => value,
    statSync: () => ({ size: 26 * 1024 * 1024, isFile: true }),
    readFileSync: () => { throw new Error("must not read oversized media"); }
  };
  assert.deepEqual(validateIncomingMediaSource({
    incoming: { filePath: "/studio/frame.png" },
    incomingType: "image",
    dataRoot: "/studio",
    downloadsRoot: "",
    fs: fakeFs,
    path,
    localPathFromStudioMediaUrl: () => ""
  }), { ok: false, code: "media_too_large" });
});

test("provider media validation rejects invalid declared duration before reading bytes", () => {
  let read = false;
  const fakeFs = {
    existsSync: () => { read = true; return true; },
    realpathSync: (value) => value,
    statSync: () => ({ size: 8, isFile: true }),
    readFileSync: () => { read = true; return Buffer.alloc(8); }
  };
  const options = { incomingType: "video", dataRoot: "/studio", downloadsRoot: "", fs: fakeFs, path, localPathFromStudioMediaUrl: () => "" };
  assert.deepEqual(validateIncomingMediaSource({ ...options, incoming: { filePath: "/studio/result.mp4", metadata: { durationSeconds: 0 } } }), { ok: false, code: "invalid_media_duration" });
  assert.deepEqual(validateIncomingMediaSource({ ...options, incoming: { filePath: "/studio/result.mp4", metadata: { duration: "not-a-number" } } }), { ok: false, code: "invalid_media_duration" });
  assert.deepEqual(validateIncomingMediaSource({ ...options, incoming: { filePath: "/studio/result.mp4", metadata: { durationSeconds: 3601 } } }), { ok: false, code: "invalid_media_duration" });
  assert.equal(read, false);
});
