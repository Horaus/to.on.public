import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createMediaHttpServer } from "../apps/desktop/src/main/media/http-server.cjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectId = process.env.STUDIO_PLAYBACK_PROJECT_ID || process.argv[2] || "";
const statePath = process.env.STUDIO_STATE_PATH || path.join(os.homedir(), "Library/Application Support/browser-native-ai-video-studio/studio-data/settings/studio-state.json");
const mediaPort = Number(process.env.STUDIO_MEDIA_SERVER_PORT || 3768);
const requestTimeoutMs = 10_000;

function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function mediaMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4" || extension === ".m4v") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

function cacheControlForMedia() {
  return "no-store";
}

function localPathFromMediaUrl(value) {
  if (typeof value !== "string") return "";
  const prefix = `http://127.0.0.1:${mediaPort}/media/`;
  if (value.startsWith(prefix)) return decodeURIComponent(new URL(value).pathname.slice("/media/".length));
  if (value.startsWith("studio-media://")) return decodeURIComponent(new URL(value).pathname);
  if (value.startsWith("file://")) return decodeURIComponent(new URL(value).pathname);
  return value;
}

function readVideoFixture() {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const project = projectId ? state.projects.find((item) => item.id === projectId) : state.projects.find((item) => item.id === state.activeProjectId);
  if (!project) throw new Error(`Project ${projectId || state.activeProjectId || "active"} was not found.`);
  const asset = state.assets.find((item) => item.projectId === project.id && item.type === "video" && item.filePath);
  if (!asset) throw new Error(`Project ${project.id} has no video asset fixture.`);
  const filePath = localPathFromMediaUrl(asset.filePath);
  if (!path.isAbsolute(filePath) || !fs.existsSync(filePath)) throw new Error(`Video fixture for ${asset.id} is not a readable local file.`);
  return { projectId: project.id, assetId: asset.id, filePath, expectedDurationSeconds: Number(asset.durationSeconds) };
}

function startIsolatedServer(filePath) {
  const dataRoot = path.dirname(filePath);
  const child = spawn(process.execPath, [scriptPath, "--serve", filePath, dataRoot], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, FORCE_COLOR: "0" }
  });
  let buffer = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for isolated media server.")), requestTimeoutMs);
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      const line = buffer.split(/\r?\n/).find((item) => item.trim());
      if (!line) return;
      try {
        const payload = JSON.parse(line);
        if (!Number.isInteger(payload.port) || payload.port <= 0) return;
        clearTimeout(timer);
        resolve(payload.port);
      } catch {
        // Ignore partial stdout until the JSON ready line is complete.
      }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      if (code !== null && code !== 0) { clearTimeout(timer); reject(new Error(`Isolated media server exited with code ${code}.`)); }
    });
  });
  return { child, ready };
}

async function inspectPlayback(port, filePath) {
  const url = `http://127.0.0.1:${port}/media/${encodeURIComponent(filePath)}`;
  const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(requestTimeoutMs) });
  const range = await fetch(url, { headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(requestTimeoutMs) });
  const contentLength = Number(head.headers.get("content-length"));
  const rangeLength = Number(range.headers.get("content-length"));
  const contentRange = range.headers.get("content-range") || "";
  const valid = head.status === 200
    && head.headers.get("content-type") === "video/mp4"
    && head.headers.get("accept-ranges") === "bytes"
    && Number.isInteger(contentLength) && contentLength > 0
    && range.status === 206
    && range.headers.get("content-type") === "video/mp4"
    && rangeLength === Math.min(1024, contentLength)
    && contentRange === `bytes 0-${Math.min(1023, contentLength - 1)}/${contentLength}`
    && (await range.arrayBuffer()).byteLength === rangeLength;
  return { valid, headStatus: head.status, rangeStatus: range.status, contentLength, rangeLength, contentRange };
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 1_000).unref();
  });
}

async function serveChild() {
  const filePath = path.resolve(process.argv[3]);
  const dataRoot = path.resolve(process.argv[4]);
  const server = createMediaHttpServer({
    port: 0,
    fs,
    path,
    dataRoot,
    downloadsRoot: dataRoot,
    isPathInside,
    cacheControlForMedia,
    mediaMimeType
  });
  server.once("listening", () => process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`));
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
  process.stdin.resume();
  void filePath;
}

if (process.argv[2] === "--serve") {
  await serveChild();
} else {
  const fixture = readVideoFixture();
  const passes = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const isolated = startIsolatedServer(fixture.filePath);
    const port = await isolated.ready;
    try {
      const playback = await inspectPlayback(port, fixture.filePath);
      passes.push({ attempt, ...playback });
      if (!playback.valid) throw new Error(`Media playback contract failed on server attempt ${attempt}.`);
    } finally {
      await stopServer(isolated.child);
    }
  }
  const result = {
    passed: passes.length === 2 && passes.every((item) => item.valid),
    projectId: fixture.projectId,
    assetId: fixture.assetId,
    expectedDurationSeconds: fixture.expectedDurationSeconds,
    serverRestartRead: true,
    passes
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
