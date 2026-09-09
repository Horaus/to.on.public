import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createExportSequenceHandler } = require("../apps/desktop/src/main/export-sequence-handler.cjs");
const { prepareMasterExportClips } = require("../apps/desktop/src/main/master-export.cjs");
const { discoverFFmpeg, probeMedia, buildFfmpegConcatArgs } = require("../apps/desktop/src/main/ffmpeg-edit-engine.cjs");

const projectId = process.env.STUDIO_EXPORT_PROJECT_ID || process.argv[2] || "project_65ebde57";
const statePath = process.env.STUDIO_STATE_PATH || path.join(os.homedir(), "Library/Application Support/browser-native-ai-video-studio/studio-data/settings/studio-state.json");
const mediaPort = Number(process.env.STUDIO_MEDIA_SERVER_PORT || 3768);
const timeoutMs = Number(process.env.STUDIO_EXPORT_TIMEOUT_MS || 120_000);

function localPathFromStudioMediaUrl(value) {
  if (typeof value !== "string") return "";
  const prefix = `http://127.0.0.1:${mediaPort}/media/`;
  if (value.startsWith(prefix)) return decodeURIComponent(new URL(value).pathname.slice("/media/".length));
  if (value.startsWith("file://")) return decodeURIComponent(new URL(value).pathname);
  return value;
}

function waitForTerminalJob(state, jobId) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const job = state.jobs.find((item) => item.id === jobId);
      if (job && ["approved", "failed_manual"].includes(job.status)) return resolve(job);
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for export job ${jobId}.`));
      setTimeout(poll, 100);
    };
    poll();
  });
}

function readAfterRestart(persistedPath, assetId, jobId) {
  const childCode = `
    const fs = require("node:fs");
    const crypto = require("node:crypto");
    const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const asset = state.assets.find((item) => item.id === process.argv[2]);
    const job = state.jobs.find((item) => item.id === process.argv[3]);
    const exists = Boolean(asset?.metadata?.outputPath && fs.existsSync(asset.metadata.outputPath));
    const checksum = exists ? crypto.createHash("sha256").update(fs.readFileSync(asset.metadata.outputPath)).digest("hex") : "";
    if (!asset || !job || job.status !== "approved" || !exists || checksum !== asset.metadata.checksumSha256) process.exit(1);
    process.stdout.write(JSON.stringify({ assetId: asset.id, status: job.status, durationSeconds: asset.durationSeconds, outputExists: exists, checksumMatches: true }));
  `;
  return spawnSync(process.execPath, ["-e", childCode, persistedPath, assetId, jobId], { encoding: "utf8" });
}

const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const project = state.projects.find((item) => item.id === projectId);
if (!project) throw new Error(`Project ${projectId} was not found in ${statePath}.`);

const toolchain = discoverFFmpeg({ resourcesPath: path.resolve("dist") });
if (!toolchain.available) throw new Error(toolchain.reason);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-export-runtime-"));
const persistedPath = path.join(tempRoot, "studio-state.json");
const events = [];
const deps = {
  getState: () => state,
  mutateState: (mutator) => { mutator(state); return state; },
  prepareMasterExportClips,
  localPathFromStudioMediaUrl,
  getFFmpegToolchain: () => toolchain,
  probeMedia,
  buildFfmpegConcatArgs,
  fs,
  crypto,
  dataRoot: tempRoot,
  path,
  now: () => new Date().toISOString(),
  saveState: () => fs.writeFileSync(persistedPath, JSON.stringify(state), "utf8"),
  sendToRenderer: () => {},
  spawn,
  exportProcesses: new Map(),
  toStudioMediaUrl: (filePath) => `studio-media://${filePath}`,
  logEvent: (event, data) => events.push({ event, data })
};

try {
  const beforeProjectCount = state.projects.length;
  const handler = createExportSequenceHandler(deps);
  const initialState = handler(null, { projectId, draft: false, width: 320, height: 180, frameRate: 24 });
  const job = initialState.jobs.at(-1);
  const terminalJob = await waitForTerminalJob(state, job.id);
  const asset = terminalJob.resultAssetIds?.map((id) => state.assets.find((item) => item.id === id)).find(Boolean);
  const outputPath = asset?.metadata?.outputPath;
  const outputExists = Boolean(outputPath && fs.existsSync(outputPath));
  const checksumSha256 = outputExists ? crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex") : "";
  const probed = outputExists ? probeMedia(outputPath, toolchain) : undefined;
  const restart = asset ? readAfterRestart(persistedPath, asset.id, terminalJob.id) : { status: 1, stdout: "" };
  const result = {
    projectId,
    jobId: terminalJob.id,
    status: terminalJob.status,
    assetId: asset?.id,
    outputBytes: outputExists ? fs.statSync(outputPath).size : 0,
    outputExists,
    durationSeconds: asset?.durationSeconds,
    probed,
    checksumMatches: outputExists && checksumSha256 === asset?.metadata?.checksumSha256,
    restartRead: restart.status === 0 ? JSON.parse(restart.stdout) : { status: restart.status, stderr: restart.stderr.trim() },
    projectCountUnchanged: state.projects.length === beforeProjectCount,
    events
  };
  console.log(JSON.stringify(result, null, 2));
  const durationMatches = outputExists && probed && Math.abs(Number(asset?.durationSeconds) - Number(probed.durationSeconds)) < 0.1;
  const passed = terminalJob.status === "approved" && outputExists && result.checksumMatches && durationMatches && restart.status === 0 && result.projectCountUnchanged;
  process.exitCode = passed ? 0 : 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
