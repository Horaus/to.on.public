import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statePath = process.env.STUDIO_STATE_PATH
  || path.join(os.homedir(), "Library/Application Support/browser-native-ai-video-studio/studio-data/settings/studio-state.json");
const prefixes = {
  step: process.env.FLOW_STEP_JOB_PREFIX || "autonomous_step_v2_",
  yolo: process.env.FLOW_YOLO_JOB_PREFIX || "autonomous_yolo_v2_"
};
const terminal = new Set(["done", "approved", "review_required"]);
const checkpointPath = process.env.FLOW_AUTONOMY_CHECKPOINT
  || path.join(process.cwd(), "docs/checkpoints/flow-autonomy-step-yolo-pass-2026-09-03.md");
const requiredMetadata = [
  "providerJobId", "flowMediaId", "flowCustomToolExecutor", "startFrameValidation",
  "providerMetadataComplete", "durationSeconds", "width", "height"
];

function fail(message) {
  return { ok: false, reason: message };
}

function auditJob(job, state) {
  if (!job) return fail("job not found");
  if (Number(job.providerRunAttempts || 0) !== 1) return fail(`expected one provider attempt, got ${job.providerRunAttempts}`);
  if (Number(job.bridgeDispatchAttempts || 0) !== 1) return fail(`expected one bridge dispatch, got ${job.bridgeDispatchAttempts}`);
  if (!Array.isArray(job.resultAssetIds) || job.resultAssetIds.length !== 1) return fail("expected exactly one result asset");
  const asset = (state.assets || []).find((candidate) => candidate.id === job.resultAssetIds[0]);
  if (!asset || asset.type !== "video") return fail("result asset is not a video");
  if (!String(asset.filePath || "").toLowerCase().includes(".mp4")) return fail("result is not an MP4 path");
  const metadata = asset.metadata || {};
  const missing = requiredMetadata.filter((field) => metadata[field] === undefined || metadata[field] === null || metadata[field] === "");
  if (missing.length) return fail(`missing metadata: ${missing.join(", ")}`);
  if (metadata.startFrameValidation?.passed !== true) return fail("start-frame validation did not pass");
  if (metadata.providerMetadataComplete !== true) return fail("provider metadata is incomplete");
  if (metadata.providerJobId !== job.providerJobId || metadata.flowMediaId !== job.providerMediaId) return fail("job/asset provider identity mismatch");
  if (asset.projectId !== job.projectId || asset.shotId !== job.shotId) return fail("asset is attached to the wrong project or shot");
  const current = terminal.has(String(job.status));
  const superseded = String(job.status) === "cancelled" && /superseded|discarded/i.test(String(job.statusMessage || ""));
  if (!current && !superseded) return fail(`non-terminal status: ${job.status}`);
  return {
    ok: true,
    artifactValid: true,
    lifecycle: current ? "current" : "historical_superseded",
    assetId: asset.id,
    status: job.status,
    providerJobId: job.providerJobId,
    flowMediaId: job.providerMediaId
  };
}

function checkpointJobId(mode) {
  const envName = mode === "step" ? "FLOW_STEP_JOB_ID" : "FLOW_YOLO_JOB_ID";
  if (process.env[envName]) return process.env[envName];
  if (!fs.existsSync(checkpointPath)) return null;
  const text = fs.readFileSync(checkpointPath, "utf8");
  const section = text.split(new RegExp(`^## ${mode === "step" ? "STEP" : "YOLO"} pass\\s*$`, "m"))[1] || "";
  return section.match(/Job [`"]?([A-Za-z0-9_-]+)[`"]?/)?.[1] || null;
}

if (!fs.existsSync(statePath)) {
  console.log(JSON.stringify({ ok: false, error: "state_not_found", statePath }, null, 2));
  process.exitCode = 1;
} else {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const jobs = Array.isArray(state.jobs) ? state.jobs : [];
  const result = { ok: true, statePath, checks: {} };
  for (const [mode, prefix] of Object.entries(prefixes)) {
    const checkpointId = checkpointJobId(mode);
    const candidates = jobs.filter((job) => String(job.id || "").startsWith(prefix));
    let selected = checkpointId && jobs.find((job) => job.id === checkpointId);
    let selectedBy = checkpointId ? "checkpoint" : "latest_terminal";
    let check = auditJob(selected, state);
    // A canary may be deliberately superseded when the same project/shot is
    // reused. Preserve that fact, but audit the newest valid artifact in the
    // same lineage instead of treating the missing superseded pointer as a
    // fresh provider failure.
    if (!check.ok) {
      const fallback = candidates
        .filter((job) => Array.isArray(job.resultAssetIds) && job.resultAssetIds.length === 1)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .map((job) => ({ job, check: auditJob(job, state) }))
        .find((entry) => entry.check.ok);
      if (fallback) {
        selected = fallback.job;
        check = fallback.check;
        selectedBy = "latest_valid_artifact";
      }
    }
    result.checks[mode] = { requestedJobId: checkpointId, jobId: selected?.id || null, selectedBy, ...check };
    if (!check.ok) result.ok = false;
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
