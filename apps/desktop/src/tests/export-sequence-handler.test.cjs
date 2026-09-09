const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { createExportSequenceHandler, prepareExportRequest } = require("../main/export-sequence-handler.cjs");
const { prepareMasterExportClips } = require("../main/master-export.cjs");

test("FFmpeg export lifecycle registers a measured master asset", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-export-test-"));
  const sourceA = path.join(dataRoot, "source-a.mp4");
  const sourceB = path.join(dataRoot, "source-b.mp4");
  fs.writeFileSync(sourceA, "source-a");
  fs.writeFileSync(sourceB, "source-b");
  const now = () => "2026-08-31T00:00:00.000Z";
  const state = {
    projects: [{ id: "fixture", editSequence: { id: "sequence", revision: 2, clips: [
      { id: "clip-a", shotId: "shot-a", sourceAssetId: "asset-a", order: 0, sourceInSec: 0, sourceOutSec: 1, timelineDurationSec: 1 },
      { id: "clip-b", shotId: "shot-b", sourceAssetId: "asset-b", order: 1, sourceInSec: 0, sourceOutSec: 1, timelineDurationSec: 1 }
    ], audioClips: [] } }],
    shots: [{ id: "shot-a", projectId: "fixture" }, { id: "shot-b", projectId: "fixture" }],
    assets: [
      { id: "asset-a", projectId: "fixture", type: "video", filePath: sourceA },
      { id: "asset-b", projectId: "fixture", type: "video", filePath: sourceB }
    ],
    jobs: []
  };
  const exportProcesses = new Map();
  const fakeSpawn = (_binary, args) => {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout = new EventEmitter();
    queueMicrotask(() => {
      const outputPath = args.at(-1);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, "fake-master");
      child.stderr.emit("data", "out_time_ms=1000000\nprogress=continue\nout_time_ms=2000000\nprogress=end\n");
      child.emit("close", 0);
    });
    return child;
  };
  const deps = {
    getState: () => state,
    mutateState: (mutator) => { mutator(state); return state; },
    prepareMasterExportClips,
    localPathFromStudioMediaUrl: (value) => value,
    getFFmpegToolchain: () => ({ available: true, ffmpeg: { path: "/opt/ffmpeg" } }),
    probeMedia: () => ({ streams: [{ type: "video" }] }),
    buildFfmpegConcatArgs: (_clips, options) => ["-i", sourceA, options.outputPath],
    fs, crypto, dataRoot, path, now, spawn: fakeSpawn, exportProcesses,
    saveState: () => {}, sendToRenderer: () => {}, toStudioMediaUrl: (value) => value,
    logEvent: () => {}, __dirname: path.resolve(__dirname, "../main")
  };

  createExportSequenceHandler(deps)(null, { projectId: "fixture", draft: false, width: 320, height: 180, frameRate: 24 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const job = state.jobs[0];
  const master = state.assets.find((asset) => asset.metadata?.masterExport);
  assert.equal(job.providerId, "local-ffmpeg");
  assert.equal(job.status, "approved");
  assert.equal(job.progress, 1);
  assert.equal(master?.durationSeconds, 2);
  assert.equal(master?.metadata?.audioCodec, "aac");
  assert.equal(fs.existsSync(master.filePath), true);
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

test("QA BLOCKED prevents final export at the desktop boundary while draft export remains available", () => {
  const source = path.join(os.tmpdir(), `qa-blocked-${Date.now()}.mp4`);
  fs.writeFileSync(source, "source");
  const state = {
    projects: [{ id: "blocked", storyDocument: { sequenceQA: { status: "BLOCKED" } }, editSequence: { id: "sequence", revision: 1, clips: [{ id: "clip", shotId: "shot", sourceAssetId: "asset", order: 0, sourceInSec: 0, sourceOutSec: 1, timelineDurationSec: 1 }] } }],
    shots: [{ id: "shot", projectId: "blocked" }],
    assets: [{ id: "asset", projectId: "blocked", type: "video", filePath: source }]
  };
  const deps = { prepareMasterExportClips, localPathFromStudioMediaUrl: (value) => value, fs, getFFmpegToolchain: () => undefined };
  assert.throws(() => prepareExportRequest({ projectId: "blocked", draft: false }, state, deps), /QA đang chặn/);
  const draft = prepareExportRequest({ projectId: "blocked", draft: true }, state, deps);
  assert.equal(draft.draft, true);
  fs.rmSync(source, { force: true });
});
