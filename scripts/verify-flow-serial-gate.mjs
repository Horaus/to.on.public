import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statePath = process.env.STUDIO_STATE_PATH
  || path.join(os.homedir(), "Library/Application Support/browser-native-ai-video-studio/studio-data/settings/studio-state.json");
const jobIds = String(process.env.FLOW_SERIAL_JOB_IDS || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const expectedShots = String(process.env.FLOW_SERIAL_SHOT_IDS || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const terminal = new Set(["done", "approved", "review_required"]);

function fail(reason, extra = {}) { return { ok: false, reason, ...extra }; }

function audit(job, state) {
  if (!job) return fail("job_not_found");
  if (!terminal.has(String(job.status))) return fail("job_not_terminal", { status: job.status });
  if (Number(job.providerRunAttempts || 0) !== 1) return fail("provider_attempt_count", { attempts: job.providerRunAttempts });
  if (Number(job.bridgeDispatchAttempts || 0) !== 1) return fail("bridge_dispatch_count", { attempts: job.bridgeDispatchAttempts });
  if (!Array.isArray(job.resultAssetIds) || job.resultAssetIds.length !== 1) return fail("result_asset_count");
  const asset = (state.assets || []).find((candidate) => candidate.id === job.resultAssetIds[0]);
  if (!asset || asset.type !== "video") return fail("result_not_video");
  const metadata = asset.metadata || {};
  const required = ["providerJobId", "flowMediaId", "flowCustomToolExecutor", "startFrameValidation", "providerMetadataComplete", "durationSeconds", "width", "height"];
  const missing = required.filter((field) => metadata[field] === undefined || metadata[field] === null || metadata[field] === "");
  if (missing.length) return fail("missing_metadata", { fields: missing });
  if (metadata.startFrameValidation?.passed !== true) return fail("start_frame_not_validated");
  if (metadata.providerMetadataComplete !== true) return fail("provider_metadata_incomplete");
  if (!/^flow_/.test(String(metadata.providerJobId)) || !/^fe_id_/.test(String(metadata.flowMediaId))) return fail("provider_identity_invalid");
  if (!String(asset.filePath || "").toLowerCase().includes(".mp4")) return fail("result_not_mp4");
  if (asset.projectId !== job.projectId || asset.shotId !== job.shotId) return fail("asset_scope_mismatch");
  return { ok: true, shotId: job.shotId, jobId: job.id, assetId: asset.id, providerJobId: metadata.providerJobId, flowMediaId: metadata.flowMediaId };
}

if (!fs.existsSync(statePath)) {
  console.log(JSON.stringify({ ok: false, error: "state_not_found", statePath }, null, 2));
  process.exitCode = 1;
} else if (!jobIds.length) {
  console.log(JSON.stringify({ ok: false, error: "FLOW_SERIAL_JOB_IDS_required" }, null, 2));
  process.exitCode = 1;
} else {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const jobs = Array.isArray(state.jobs) ? state.jobs : [];
  const checks = jobIds.map((id) => audit(jobs.find((job) => job.id === id), state));
  const seenShots = checks.filter((check) => check.ok).map((check) => check.shotId);
  const duplicateShots = seenShots.filter((shot, index) => seenShots.indexOf(shot) !== index);
  const missingShots = expectedShots.filter((shot) => !seenShots.includes(shot));
  const result = { ok: checks.every((check) => check.ok) && !duplicateShots.length && !missingShots.length, statePath, jobCount: jobIds.length, checks };
  if (expectedShots.length) result.expectedShots = expectedShots;
  if (duplicateShots.length) result.duplicateShots = [...new Set(duplicateShots)];
  if (missingShots.length) result.missingShots = missingShots;
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
