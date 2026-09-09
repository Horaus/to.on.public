let path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, localPathFromStudioMediaUrl, isLikelyEphemeralMediaPath;

function createFlowOwnership(dependencies) {
  ({ path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, localPathFromStudioMediaUrl, isLikelyEphemeralMediaPath } = dependencies);
  return { isOwnedFlowVideoAsset, flowJobStartFrameAssetId, isStrictFlowVideoAssetForShot, quarantineUnverifiedFlowVideoAssets, hideUnavailableVideoAsset, quarantineDuplicateRecoveredFlowVideos };
}

function isOwnedFlowVideoAsset(asset) {
  if (!asset || asset.type !== "video") return true;
  if (asset.sourceProvider !== "google-flow") return true;
  return Boolean(asset.metadata?.studioJobId && asset.metadata?.currentJobOnly);
}

function flowJobStartFrameAssetId(job) {
  const settings = job?.input?.bridgeMessage?.settings || {};
  const references = Array.isArray(job?.input?.bridgeMessage?.references)
    ? job.input.bridgeMessage.references
    : [];
  return settings.startFrameAssetId || references[0]?.assetId;
}

function flowVideoOwnershipJob(asset, shot, jobsById) {
  if (asset.metadata?.hiddenFromStoryboard || asset.shotId !== shot.id) return null;
  if (!flowVideoMetadataIsOwned(asset)) return null;
  const job = jobsById?.get(String(asset.metadata.studioJobId || asset.sourceJobId || ""));
  return job?.jobType === "video" && job.shotId === shot.id ? job : null;
}

function flowVideoMetadataIsOwned(asset) {
  const visibleRecovery = Boolean(asset.metadata?.recoveredFromVisibleFlowProject);
  if ((!asset.metadata?.currentJobOnly && !visibleRecovery) || !asset.metadata?.studioJobId) return false;
  if (asset.metadata?.recoveredFromAdjacentOlderBaseline || asset.metadata?.attachedFromDuplicateFlowRecovery) return false;
  return !(asset.metadata?.recoveredAfterFlowCrash || asset.metadata?.recoveredAfterFlowWarning) || Boolean(asset.metadata?.flowStrictCurrentJobRecovery);
}

function verifiedFlowStartFrame(asset, shot, job, assetsById) {
  const expectedId = flowJobStartFrameAssetId(job);
  const actualId = asset.metadata?.startFrameAssetId;
  if (!expectedId || !actualId || expectedId !== actualId || !(shot.assetIds || []).includes(actualId)) return false;
  const startFrame = assetsById?.get(actualId);
  return Boolean(startFrame && startFrame.type === "image" && startFrame.projectId === asset.projectId);
}

function isStrictFlowVideoAssetForShot(asset, shot, assetsById, jobsById) {
  if (!asset || !shot || asset.type !== "video") return false;
  if (asset.sourceProvider !== "google-flow") return true;
  const localPath = localPathFromStudioMediaUrl(asset.filePath);
  if (!localPath || !fs.existsSync(localPath)) return false;
  const job = flowVideoOwnershipJob(asset, shot, jobsById);
  return Boolean(job && verifiedFlowStartFrame(asset, shot, job, assetsById));
}

function unlinkQuarantinedAssets(hiddenIds) {
  let changed = 0;
  for (const shot of getState().shots || []) {
    const next = (shot.assetIds || []).filter((assetId) => !hiddenIds.has(assetId));
    if (next.length !== (shot.assetIds || []).length) { shot.assetIds = next; changed++; }
  }
  return changed;
}

function quarantineAffectedJobs(hiddenIds) {
  let changed = 0;
  for (const job of getState().jobs || []) {
    if (job.providerId !== "google-flow-web" || job.jobType !== "video") continue;
    const next = (job.resultAssetIds || []).filter((assetId) => !hiddenIds.has(assetId));
    if (next.length === (job.resultAssetIds || []).length) continue;
    job.resultAssetIds = next;
    if (job.status === "review_required" && next.length === 0) {
      job.status = "failed_retryable";
      job.error = "Google Flow video was quarantined because it was not verified against the exact shot keyframe. Retry this shot after clearing or reloading Flow.";
      job.statusMessage = job.error;
      job.progress = undefined;
    }
    job.updatedAt = now();
    changed++;
  }
  return changed;
}

function quarantineUnverifiedFlowVideoAssets() {
  const assetsById = new Map((getState().assets || []).map((asset) => [asset.id, asset]));
  const jobsById = new Map((getState().jobs || []).map((job) => [job.id, job]));
  const shotsById = new Map((getState().shots || []).map((shot) => [shot.id, shot]));
  const hiddenIds = new Set();
  let changed = 0;
  for (const asset of getState().assets || []) {
    if (asset.type !== "video" || asset.sourceProvider !== "google-flow") continue;
    const shot = shotsById.get(asset.shotId);
    if (isStrictFlowVideoAssetForShot(asset, shot, assetsById, jobsById)) continue;
    asset.metadata = {
      ...(asset.metadata || {}),
      hiddenFromStoryboard: true,
      unverifiedFlowVideo: true,
      unavailableReason: asset.metadata?.recoveredFromAdjacentOlderBaseline
        ? "Recovered Flow video came from an adjacent older baseline and is not verified against this shot start frame."
        : "Flow video is missing exact shot/start-frame verification."
    };
    hiddenIds.add(asset.id);
    changed++;
  }
  if (hiddenIds.size === 0) return changed;
  changed += unlinkQuarantinedAssets(hiddenIds) + quarantineAffectedJobs(hiddenIds);
  return changed;
}

function hideUnavailableVideoAsset(asset) {
  if (!asset || asset.type !== "video") return false;
  const localPath = localPathFromStudioMediaUrl(asset.filePath);
  if (!localPath || (!isLikelyEphemeralMediaPath(asset.filePath) && fs.existsSync(localPath))) return false;
  asset.metadata = {
    ...(asset.metadata || {}),
    hiddenFromStoryboard: true,
    unavailableReason: isLikelyEphemeralMediaPath(asset.filePath) ? "temporary_media_path" : "missing_local_file",
    unavailableCheckedAt: now()
  };
  return true;
}

function duplicateRecoveredGroups() {
  const groups = new Map();
  for (const asset of getState().assets || []) {
    if (
      asset.type !== "video" ||
      asset.sourceProvider !== "google-flow" ||
      !asset.metadata?.recoveredAfterFlowWarning ||
      !asset.metadata?.flowTileId
    ) continue;
    const key = `${asset.metadata.flowTileId}:${asset.metadata.originalUrl || asset.filePath || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  return groups;
}

function markDuplicateRecoveredVideos(groups) {
  const hiddenIds = new Set();
  for (const assets of groups.values()) {
    if (assets.length <= 1) continue;
    assets
      .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
      .slice(1)
      .forEach((asset) => {
        asset.metadata = {
          ...(asset.metadata || {}),
          duplicateRecoveredFlowVideo: true,
          hiddenFromStoryboard: true
        };
        hiddenIds.add(asset.id);
      });
  }
  return hiddenIds;
}

function removeDuplicateResults(hiddenIds) {
  for (const shot of getState().shots || []) {
    shot.assetIds = (shot.assetIds || []).filter((assetId) => !hiddenIds.has(assetId));
  }
  for (const job of getState().jobs || []) {
    const previousResultIds = job.resultAssetIds || [];
    const nextResultIds = previousResultIds.filter((assetId) => !hiddenIds.has(assetId));
    if (nextResultIds.length !== previousResultIds.length) {
      job.resultAssetIds = nextResultIds;
      if (job.status === "review_required" && nextResultIds.length === 0) {
        job.status = "failed_retryable";
        job.error = "Google Flow returned a recovered video that matched an older imported result. Retry after the new Flow tile exposes its own video.";
        job.statusMessage = job.error;
        job.progress = undefined;
        job.updatedAt = now();
      }
    }
  }
}

function invalidateEmptyRecoveredJobs() {
  for (const job of getState().jobs || []) {
    if (
      job.providerId === "google-flow-web" &&
      job.jobType === "video" &&
      job.status === "review_required" &&
      (job.resultAssetIds || []).length === 0
    ) {
      job.status = "failed_retryable";
      job.error = "Google Flow result was quarantined because it matched an older imported video. Retry after the new Flow tile exposes its own video.";
      job.statusMessage = job.error;
      job.progress = undefined;
      job.updatedAt = now();
    }
  }
}

function quarantineDuplicateRecoveredFlowVideos() {
  const hiddenIds = markDuplicateRecoveredVideos(duplicateRecoveredGroups());
  if (hiddenIds.size === 0) return;
  removeDuplicateResults(hiddenIds);
  invalidateEmptyRecoveredJobs();
}

module.exports = { createFlowOwnership };
