let path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, toStudioMediaUrl, localPathFromStudioMediaUrl, isStrictFlowVideoAssetForShot;

function createFlowRecovery(dependencies) {
  ({ path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, toStudioMediaUrl, localPathFromStudioMediaUrl, isStrictFlowVideoAssetForShot } = dependencies);
  return { recoverDownloadedFlowVideoFiles, shotHasRenderableVideo, renderableVideoAssetIdsForShot, normalizeVideoJobsForCompletedShots };
}

function recoverDownloadedFlowVideoFiles() {
  const downloadDir = path.join(app.getPath("downloads"), "AI Video Studio");
  if (!fs.existsSync(downloadDir)) return 0;
  let changed = 0;
  for (const asset of getState().assets || []) {
    if (recoverDownloadedFlowAsset(asset, downloadDir)) changed++;
  }
  return changed;
}

function recoverDownloadedFlowAsset(asset, downloadDir) {
  if (asset.type !== "video" || !asset.metadata?.flowTileId || !asset.metadata?.studioJobId) return false;
  const existingLocalPath = localPathFromStudioMediaUrl(asset.filePath);
  if (existingLocalPath && fs.existsSync(existingLocalPath)) return false;
  const prefix = `google_flow_${asset.metadata.studioJobId}_`;
  const candidate = fs.readdirSync(downloadDir)
    .filter((filename) => filename.startsWith(prefix) && /\.(mp4|webm|mov)$/i.test(filename))
    .map((filename) => path.join(downloadDir, filename))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!candidate) return false;
  const assetDir = path.join(dataRoot, "projects", asset.projectId, "videos");
  fs.mkdirSync(assetDir, { recursive: true });
  const destination = path.join(assetDir, `${id("video")}${path.extname(candidate) || ".mp4"}`);
  fs.copyFileSync(candidate, destination);
  const originalUrl = asset.metadata?.originalUrl || asset.filePath;
  asset.filePath = toStudioMediaUrl(destination);
  asset.sourceProvider = "google-flow";
  asset.metadata = { ...(asset.metadata || {}), originalUrl, storage: "download", recoveredDownloadedFileAt: now() };
  return true;
}

function shotHasRenderableVideo(shot, assetsById) {
  const jobsById = new Map((getState().jobs || []).map((job) => [job.id, job]));
  return (shot?.assetIds || []).some((assetId) => {
    const asset = assetsById.get(assetId);
    if (!asset || asset.type !== "video" || asset.metadata?.hiddenFromStoryboard) return false;
    if (asset.shotId && asset.shotId !== shot.id) return false;
    if (asset.sourceProvider === "google-flow") {
      return isStrictFlowVideoAssetForShot(asset, shot, assetsById, jobsById);
    }
    const localPath = localPathFromStudioMediaUrl(asset.filePath);
    return !localPath || fs.existsSync(localPath);
  });
}

function renderableVideoAssetIdsForShot(shot, assetsById) {
  const jobsById = new Map((getState().jobs || []).map((job) => [job.id, job]));
  return (shot?.assetIds || []).filter((assetId) => {
    const asset = assetsById.get(assetId);
    if (!asset || asset.type !== "video" || asset.metadata?.hiddenFromStoryboard) return false;
    if (asset.shotId && asset.shotId !== shot.id) return false;
    if (asset.sourceProvider === "google-flow") {
      return isStrictFlowVideoAssetForShot(asset, shot, assetsById, jobsById);
    }
    const localPath = localPathFromStudioMediaUrl(asset.filePath);
    return !localPath || fs.existsSync(localPath);
  });
}

function ownedVideoAssetIds(job, videoAssetIds, assetsById) {
  return videoAssetIds.filter((assetId) => {
    const asset = assetsById.get(assetId);
    if (!asset) return false;
    if (asset.sourceProvider === "google-flow" || asset.sourceProvider === "google-flow-web") {
      return asset.sourceJobId === job.id || asset.metadata?.studioJobId === job.id;
    }
    return asset.sourceJobId === job.id || asset.metadata?.studioJobId === job.id || (job.resultAssetIds || []).includes(assetId);
  });
}

function settleRecoveredVideoJob(job, assetIds) {
  if (assetIds.length > 0) {
    job.status = "review_required";
    job.resultAssetIds = Array.from(new Set([...(job.resultAssetIds || []), ...assetIds]));
    job.statusMessage = "Video downloaded and ready for review.";
    job.progress = 1;
  } else {
    job.status = "cancelled";
    job.statusMessage = "Superseded by a newer video result for this shot.";
    job.progress = undefined;
  }
  job.error = undefined;
  job.updatedAt = now();
}

function isRecoverableFlowVideoJob(job, recoverableStatuses) {
  return job.providerId === "google-flow-web" && job.jobType === "video"
    && Boolean(job.shotId) && recoverableStatuses.has(job.status);
}

function normalizeVideoJobsForCompletedShots() {
  const assetsById = new Map((getState().assets || []).map((asset) => [asset.id, asset]));
  const shotsById = new Map((getState().shots || []).map((shot) => [shot.id, shot]));
  const recoverableStatuses = new Set([
    "pending",
    "opening_provider",
    "submitting",
    "generating",
    "downloading",
    "waiting_manual_action",
    "failed_retryable",
    "review_required"
  ]);
  let changed = 0;

  for (const job of getState().jobs || []) {
    if (!isRecoverableFlowVideoJob(job, recoverableStatuses)) continue;
    const shot = shotsById.get(job.shotId);
    if (!shot || !shotHasRenderableVideo(shot, assetsById)) continue;
    const videoAssetIds = renderableVideoAssetIdsForShot(shot, assetsById);
    if (videoAssetIds.length === 0) continue;
    settleRecoveredVideoJob(job, ownedVideoAssetIds(job, videoAssetIds, assetsById));
    changed++;
  }
  const transitions = reconcileVideoResultState(getState(), {
    now,
    isRenderableAsset: (asset, shot) => isStrictFlowVideoAssetForShot(asset, shot, assetsById, new Map((getState().jobs || []).map((job) => [job.id, job])))
  });
  logProductionTransitions(transitions);
  return changed + transitions.length;
}

module.exports = { createFlowRecovery };
