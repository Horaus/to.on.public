const ACTIVE_VIDEO_JOB_STATUSES = new Set([
  "pending",
  "opening_provider",
  "submitting",
  "generating",
  "downloading",
  "waiting_manual_action",
  "failed_retryable",
  "review_required"
]);

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function assetDurationSeconds(asset) {
  const value = Number(asset?.durationSeconds ?? asset?.metadata?.durationSeconds ?? asset?.metadata?.duration);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function durationMismatchFor(shot, asset, toleranceSeconds = 0.25) {
  const plannedDurationSeconds = Number(shot?.durationSec);
  const sourceDurationSeconds = assetDurationSeconds(asset);
  if (!Number.isFinite(plannedDurationSeconds) || plannedDurationSeconds <= 0 || !sourceDurationSeconds) return null;
  const deltaSeconds = sourceDurationSeconds - plannedDurationSeconds;
  if (Math.abs(deltaSeconds) <= toleranceSeconds) return null;
  return {
    shotId: shot.id,
    assetId: asset.id,
    plannedDurationSeconds,
    sourceDurationSeconds,
    deltaSeconds
  };
}

function jobOwnsAsset(job, asset) {
  return Boolean(job && asset && (
    asset.sourceJobId === job.id ||
    asset.metadata?.studioJobId === job.id ||
    (job.resultAssetIds || []).includes(asset.id)
  ));
}

function jobsByShot(state) {
  const result = new Map();
  for (const job of state.jobs || []) {
    if (job.jobType !== "video" || !job.shotId) continue;
    // A cloned/legacy project can retain a stale pointer to a job with the
    // same shot id from another project. Keep the candidate index scoped when
    // the shot carries a project id; otherwise a provider result can be
    // reconciled into the wrong project.
    const shot = (state.shots || []).find((candidate) => candidate.id === job.shotId);
    if (shot?.projectId && job.projectId && shot.projectId !== job.projectId) continue;
    if (!result.has(job.shotId)) result.set(job.shotId, []);
    result.get(job.shotId).push(job);
  }
  return result;
}

function clearStaleCurrentVideoPointers(state, transitions) {
  const jobsById = new Map((state.jobs || []).map((job) => [job.id, job]));
  const assetsById = new Map((state.assets || []).map((asset) => [asset.id, asset]));
  for (const shot of state.shots || []) {
    const job = shot.currentVideoJobId ? jobsById.get(shot.currentVideoJobId) : undefined;
    const asset = shot.currentVideoAssetId ? assetsById.get(shot.currentVideoAssetId) : undefined;
    const jobInvalid = job && (job.shotId !== shot.id || (shot.projectId && job.projectId && job.projectId !== shot.projectId));
    const assetInvalid = asset && (asset.shotId && asset.shotId !== shot.id || (shot.projectId && asset.projectId && asset.projectId !== shot.projectId));
    if (!jobInvalid && !assetInvalid) continue;
    transitions.push({
      event: "stale_shot_video_pointer_cleared",
      shotId: shot.id,
      projectId: shot.projectId,
      previousJobId: shot.currentVideoJobId,
      previousAssetId: shot.currentVideoAssetId
    });
    delete shot.currentVideoJobId;
    delete shot.currentVideoAssetId;
  }
}

function currentVideoCandidate(state, shot, jobs, isRenderableAsset) {
  const candidates = jobs.flatMap((job) => (state.assets || [])
    .filter((asset) => jobOwnsAsset(job, asset) && isRenderableAsset(asset, shot, job))
    .map((asset) => ({ job, asset })));
  candidates.sort((left, right) =>
    timestamp(right.asset.createdAt) - timestamp(left.asset.createdAt) ||
    timestamp(right.job.updatedAt || right.job.createdAt) - timestamp(left.job.updatedAt || left.job.createdAt)
  );
  return candidates[0];
}

function selectVideoResult(shot, current, changedAt, transitions) {
  if (shot.currentVideoJobId !== current.job.id || shot.currentVideoAssetId !== current.asset.id) {
    transitions.push({ event: "shot_video_result_selected", shotId: shot.id, jobId: current.job.id, assetId: current.asset.id, previousJobId: shot.currentVideoJobId, previousAssetId: shot.currentVideoAssetId });
    shot.currentVideoJobId = current.job.id;
    shot.currentVideoAssetId = current.asset.id;
  }
  // A fresh video result resolves the revision marker for this shot. Keep the
  // human-readable note for history, but stop presenting a stale downstream
  // warning once the new media is actually linked.
  if (shot.downstreamDirty) shot.downstreamDirty = false;
  if (shot.status !== "approved" && shot.status !== "review") {
    transitions.push({ event: "shot_status_reconciled", shotId: shot.id, from: shot.status, to: "review", jobId: current.job.id, assetId: current.asset.id });
    shot.status = "review";
  }
}

function reconcileProviderProvenance(job, asset) {
  const metadata = asset?.metadata || {};
  const scalarFields = [
    "providerJobId",
    "flowMediaId",
    "flowTileId",
    "flowCustomToolId",
    "flowCustomToolExecutor",
    "flowResultUrl",
    "providerWorkspaceUrl",
    "startFrameAssetId",
    "aspectRatio"
  ];
  for (const field of scalarFields) {
    const value = metadata[field];
    if (value !== undefined && value !== null && value !== "") job[field] = value;
  }
  const durationSeconds = assetDurationSeconds(asset);
  if (durationSeconds) job.durationSeconds = durationSeconds;
  if (metadata.startFrameValidation && typeof metadata.startFrameValidation === "object") {
    job.startFrameValidation = { ...metadata.startFrameValidation };
  }
  if (metadata.providerMetadataComplete === true) job.providerMetadataComplete = true;
}

function reconcileCurrentJob(current, shot, changedAt, transitions) {
  current.job.resultAssetIds = Array.from(new Set([...(current.job.resultAssetIds || []), current.asset.id]));
  if (current.job.status !== "approved" && current.job.status !== "review_required") {
    transitions.push({ event: "job_status_reconciled", jobId: current.job.id, shotId: shot.id, from: current.job.status, to: "review_required", assetId: current.asset.id });
    current.job.status = "review_required";
  }
  current.job.error = undefined;
  current.job.statusMessage = "Video downloaded and ready for review.";
  current.job.progress = 1;
  reconcileProviderProvenance(current.job, current.asset);
  current.job.providerMediaId = String(current.asset.metadata?.flowMediaId || current.asset.metadata?.media_id || current.asset.metadata?.providerJobId || current.job.providerMediaId || "") || undefined;
  current.job.providerAcceptedAt ||= current.asset.createdAt || changedAt;
  current.job.updatedAt = changedAt;
  delete current.job.supersededByJobId;
}

function supersedeOtherJobs(jobs, current, shot, changedAt, transitions) {
  for (const job of jobs) {
    if (job.id === current.job.id || !ACTIVE_VIDEO_JOB_STATUSES.has(job.status)) continue;
    transitions.push({ event: "job_superseded", jobId: job.id, shotId: shot.id, from: job.status, to: "cancelled", supersededByJobId: current.job.id });
    if (job.status.startsWith("failed")) {
      job.supersededFromStatus = job.status;
      job.supersededError = job.error;
    }
    job.status = "cancelled";
    job.statusMessage = "Superseded by the authoritative video result for this shot.";
    job.progress = undefined;
    job.supersededByJobId = current.job.id;
    job.updatedAt = changedAt;
  }
}

function reconcileVideoResultState(state, options = {}) {
  const isRenderableAsset = options.isRenderableAsset || ((asset, shot) => Boolean(
    asset &&
    shot &&
    asset.type === "video" &&
    !asset.metadata?.hiddenFromStoryboard &&
    (!asset.shotId || asset.shotId === shot.id)
  ));
  const now = options.now || (() => new Date().toISOString());
  const jobsByShotId = jobsByShot(state);
  const transitions = [];
  clearStaleCurrentVideoPointers(state, transitions);
  for (const shot of state.shots || []) {
    const jobs = jobsByShotId.get(shot.id) || [];
    const current = currentVideoCandidate(state, shot, jobs, isRenderableAsset);
    if (!current) continue;
    const changedAt = now();
    selectVideoResult(shot, current, changedAt, transitions);
    reconcileCurrentJob(current, shot, changedAt, transitions);
    supersedeOtherJobs(jobs, current, shot, changedAt, transitions);
  }
  return transitions;
}

function collectVideoDurationMismatches(state, toleranceSeconds = 0.25) {
  const assetsById = new Map((state.assets || []).map((asset) => [asset.id, asset]));
  return (state.shots || []).flatMap((shot) => {
    const currentAsset = assetsById.get(shot.currentVideoAssetId) || (state.assets || [])
      .filter((asset) => asset.shotId === shot.id && asset.type === "video" && !asset.metadata?.hiddenFromStoryboard)
      .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))[0];
    const mismatch = durationMismatchFor(shot, currentAsset, toleranceSeconds);
    return mismatch ? [mismatch] : [];
  });
}

module.exports = {
  ACTIVE_VIDEO_JOB_STATUSES,
  assetDurationSeconds,
  collectVideoDurationMismatches,
  durationMismatchFor,
  reconcileVideoResultState
};
