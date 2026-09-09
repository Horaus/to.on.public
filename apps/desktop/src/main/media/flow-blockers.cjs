let path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, localPathFromStudioMediaUrl, flowJobStartFrameAssetId, isStrictFlowVideoAssetForShot;

function createFlowBlockers(dependencies) {
  ({ path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, localPathFromStudioMediaUrl, flowJobStartFrameAssetId, isStrictFlowVideoAssetForShot } = dependencies);
  return { shotAlreadyHasVideoForJob, attachExistingVideoAssetToJobShot, resolveDuplicateFlowVideoBlockers, normalizeShotLinkedVideoAssets, repairRecoverableFlowVideoAssets };
}

function shotAlreadyHasVideoForJob(job, duplicateAsset) {
  if (!job?.shotId) return false;
  if (duplicateAsset?.shotId && duplicateAsset.shotId !== job.shotId) return false;
  const projectSceneIds = new Set((getState().scenes || [])
    .filter((scene) => scene.projectId === job.projectId)
    .map((scene) => scene.id));
  const targetShot = (getState().shots || []).find((shot) =>
    shot.id === job.shotId &&
    (!shot.sceneId || projectSceneIds.has(shot.sceneId))
  );
  if (!targetShot) return false;
  const shotAssetIds = Array.isArray(targetShot.assetIds) ? targetShot.assetIds : [];
  if (duplicateAsset?.id && shotAssetIds.includes(duplicateAsset.id)) return true;
  return shotAssetIds.some((assetId) => {
    const asset = (getState().assets || []).find((item) => item.id === assetId);
    return isUsableShotVideo(asset, job.shotId);
  });
}

function isUsableShotVideo(asset, shotId) {
  if (!asset || asset.type !== "video" || asset.metadata?.hiddenFromStoryboard) return false;
  if (asset.shotId && asset.shotId !== shotId) return false;
  if (asset.sourceProvider !== "google-flow") return true;
  return Boolean(asset.metadata?.currentJobOnly && asset.metadata?.studioJobId);
}

function attachExistingVideoAssetToJobShot(job, asset) {
  if (!job?.shotId || !asset?.id || asset.type !== "video") return false;
  const targetShot = findProjectJobShot(job);
  if (!targetShot || !mayAttachAssetToShot(job, asset, targetShot)) return false;
  attachAssetToShot(job, asset, targetShot);
  return true;
}

function findProjectJobShot(job) {
  const projectSceneIds = new Set((getState().scenes || [])
    .filter((scene) => scene.projectId === job.projectId)
    .map((scene) => scene.id));
  return (getState().shots || []).find((shot) =>
    shot.id === job.shotId &&
    (!shot.sceneId || projectSceneIds.has(shot.sceneId))
  );
}

function mayAttachAssetToShot(job, asset, targetShot) {
  if (asset.sourceProvider !== "google-flow") return true;
  return assetBelongsToTargetShot(asset, targetShot) && assetBelongsToCurrentJob(job, asset) && assetRecoveryIsCurrent(asset);
}

function assetBelongsToTargetShot(asset, targetShot) {
  const existingReferences = (getState().shots || [])
    .filter((shot) => (shot.assetIds || []).includes(asset.id))
    .map((shot) => shot.id);
  return !(asset.shotId && asset.shotId !== targetShot.id) && !existingReferences.some((shotId) => shotId !== targetShot.id);
}

function assetBelongsToCurrentJob(job, asset) {
  return Boolean(asset.metadata?.currentJobOnly && asset.metadata?.studioJobId)
    && asset.sourceJobId === job.id
    && asset.metadata.studioJobId === job.id;
}

function assetRecoveryIsCurrent(asset) {
  if (asset.metadata?.recoveredFromAdjacentOlderBaseline) return false;
  const recovered = asset.metadata?.recoveredAfterFlowCrash || asset.metadata?.recoveredAfterFlowWarning;
  return !recovered || Boolean(asset.metadata?.flowStrictCurrentJobRecovery);
}

function attachAssetToShot(job, asset, targetShot) {
  targetShot.assetIds = Array.from(new Set([...(targetShot.assetIds || []), asset.id]));
  targetShot.status = "review";
  asset.projectId = job.projectId || asset.projectId;
  asset.sceneId = targetShot.sceneId || asset.sceneId;
  asset.shotId = targetShot.id || asset.shotId;
  asset.metadata = {
    ...(asset.metadata || {}),
    attachedFromDuplicateFlowRecovery: true,
    attachedToShotAt: now()
  };
  delete asset.metadata.hiddenFromStoryboard;
  delete asset.metadata.legacyUnownedFlowVideo;
  delete asset.metadata.unavailableReason;
}

function resolveDuplicateFlowVideoBlockers(assetScope = null) {
  let changed = 0;
  for (const job of getState().jobs || []) {
    changed += resolveDuplicateFlowJob(job, assetScope);
  }
  return changed;
}

function duplicateFlowAssetId(job, assetScope) {
  if (job.providerId !== "google-flow-web" || job.jobType !== "video" || job.status !== "failed_retryable") return undefined;
  const match = `${job.error || ""} ${job.statusMessage || ""}`.match(/already imported as (asset_[a-z0-9]+)/i);
  return match && (!assetScope?.id || match[1] === assetScope.id) ? match[1] : undefined;
}

function markDuplicateFlowJobRecovered(job, duplicateAsset, shotAlreadyLinked) {
  job.status = "review_required";
  job.resultAssetIds = Array.from(new Set([...(job.resultAssetIds || []), duplicateAsset.id]));
  job.error = undefined;
  job.statusMessage = shotAlreadyLinked ? "Google Flow video was already imported for this shot." : "Reused an already imported Google Flow video for this shot.";
  job.progress = 1;
  job.updatedAt = now();
}

function resolveDuplicateFlowJob(job, assetScope) {
  const assetId = duplicateFlowAssetId(job, assetScope);
  if (!assetId) return 0;
  const duplicateAsset = (getState().assets || []).find((asset) => asset.id === assetId && asset.projectId === job.projectId && asset.type === "video");
  if (!duplicateAsset) return 0;
  const shotAlreadyLinked = shotAlreadyHasVideoForJob(job, duplicateAsset);
  if (!shotAlreadyLinked && !attachExistingVideoAssetToJobShot(job, duplicateAsset)) return 0;
  markDuplicateFlowJobRecovered(job, duplicateAsset, shotAlreadyLinked);
  return 1;
}

function normalizeShotLinkedVideoAssets() {
  const assetsById = new Map((getState().assets || []).map((asset) => [asset.id, asset]));
  const referencesByAssetId = collectShotReferences();
  const shotsById = new Map((getState().shots || []).map((shot) => [shot.id, shot]));
  let changed = 0;
  for (const [assetId, references] of referencesByAssetId.entries()) {
    changed += normalizeShotLinkedVideoAsset(assetsById.get(assetId), references, shotsById);
  }
  return changed;
}

function collectShotReferences() {
  const referencesByAssetId = new Map();
  for (const shot of getState().shots || []) {
    for (const assetId of shot.assetIds || []) {
      if (!referencesByAssetId.has(assetId)) referencesByAssetId.set(assetId, []);
      referencesByAssetId.get(assetId).push({ shotId: shot.id, sceneId: shot.sceneId });
    }
  }
  return referencesByAssetId;
}

function normalizeShotLinkedVideoAsset(asset, references, shotsById) {
  if (!asset || asset.type !== "video") return 0;
  const localPath = localPathFromStudioMediaUrl(asset.filePath);
  if (asset.sourceProvider === "google-flow" && (!localPath || !fs.existsSync(localPath))) return 0;
  let changed = 0;
  if (asset.sourceProvider === "google-flow" && references.length > 1) {
    const ownership = normalizeFlowAssetOwnership(asset, references, shotsById);
    changed += ownership.changed;
    if (!ownership.hasOwner) return changed;
  }
  changed += inferSingleShotOwnership(asset, references);
  changed += restoreVisibleShotAsset(asset);
  return changed;
}

function normalizeFlowAssetOwnership(asset, references, shotsById) {
  const ownerShotId = asset.shotId && references.some((reference) => reference.shotId === asset.shotId)
    ? asset.shotId
    : undefined;
  let changed = 0;
  for (const reference of references) {
    if (ownerShotId && reference.shotId === ownerShotId) continue;
    const shot = shotsById.get(reference.shotId);
    if (!shot) continue;
    const nextAssetIds = (shot.assetIds || []).filter((assetId) => assetId !== asset.id);
    if (nextAssetIds.length === (shot.assetIds || []).length) continue;
    shot.assetIds = nextAssetIds;
    changed++;
  }
  if (ownerShotId) return { changed, hasOwner: true };
  asset.metadata = {
    ...(asset.metadata || {}),
    hiddenFromStoryboard: true,
    unavailableReason: "Google Flow video was linked to multiple shots without a single owner; requeue the shot video."
  };
  return { changed: changed + 1, hasOwner: false };
}

function inferSingleShotOwnership(asset, references) {
  if (references.length !== 1) return 0;
  const reference = references[0];
  let changed = 0;
  if (!asset.shotId) {
    asset.shotId = reference.shotId;
    changed++;
  }
  if (!asset.sceneId && reference.sceneId) {
    asset.sceneId = reference.sceneId;
    changed++;
  }
  return changed;
}

function restoreVisibleShotAsset(asset) {
  const hidden = asset.metadata?.hiddenFromStoryboard || asset.metadata?.legacyUnownedFlowVideo || asset.metadata?.unavailableReason;
  if (!hidden || (asset.sourceProvider === "google-flow" && asset.metadata?.unverifiedFlowVideo)) return 0;
  asset.metadata = { ...(asset.metadata || {}) };
  delete asset.metadata.hiddenFromStoryboard;
  delete asset.metadata.legacyUnownedFlowVideo;
  delete asset.metadata.unavailableReason;
  asset.metadata.restoredFromShotLinkAt = asset.metadata.restoredFromShotLinkAt || now();
  return 1;
}

function repairRecoverableFlowVideoAssets() {
  const jobsById = new Map((getState().jobs || []).map((job) => [job.id, job]));
  const shotsById = new Map((getState().shots || []).map((shot) => [shot.id, shot]));
  const assetsById = new Map((getState().assets || []).map((asset) => [asset.id, asset]));
  let changed = 0;

  for (const asset of getState().assets || []) {
    if (asset.type !== "video" || asset.sourceProvider !== "google-flow") continue;
    const metadata = asset.metadata || {};
    changed += hydrateVideoDimensions(asset, metadata);
    const context = recoverableFlowContext(asset, metadata, jobsById, shotsById, assetsById);
    if (!context) continue;
    changed += repairFlowAsset(asset, metadata, context, assetsById, jobsById);
  }

  return changed;
}

function hydrateVideoDimensions(asset, metadata) {
  const values = [
    ["width", Number(metadata.width)],
    ["height", Number(metadata.height)],
    ["durationSeconds", Number(metadata.durationSeconds ?? metadata.duration)]
  ];
  let changed = 0;
  for (const [field, value] of values) {
    if (value <= 0 || asset[field] === value) continue;
    asset[field] = value;
    changed++;
  }
  return changed;
}

function recoverableFlowContext(asset, metadata, jobsById, shotsById, assetsById) {
  const job = jobsById.get(String(metadata.studioJobId || asset.sourceJobId || ""));
  if (!isRecoverableFlowJob(job)) return null;
  const shot = shotsById.get(job.shotId);
  if (!hasRecoverableLocalAsset(asset, shot)) return null;
  const startFrameAssetId = metadata.startFrameAssetId || flowJobStartFrameAssetId(job);
  if (!hasRecoverableStartFrame(shot, startFrameAssetId, assetsById)) return null;
  if (hasHistoricalRecoveryFlag(metadata) && !metadata.flowStrictCurrentJobRecovery) return null;
  return { job, shot, startFrameAssetId };
}

function isRecoverableFlowJob(job) {
  return Boolean(job && job.providerId === "google-flow-web" && job.jobType === "video" && job.shotId);
}

function hasRecoverableLocalAsset(asset, shot) {
  const localPath = localPathFromStudioMediaUrl(asset.filePath);
  return Boolean(shot && localPath && fs.existsSync(localPath));
}

function hasRecoverableStartFrame(shot, startFrameAssetId, assetsById) {
  const startFrameAsset = assetsById.get(startFrameAssetId);
  return Boolean(startFrameAssetId && (shot.assetIds || []).includes(startFrameAssetId) && startFrameAsset?.type === "image");
}

function hasHistoricalRecoveryFlag(metadata) {
  return Boolean(metadata.recoveredAfterFlowCrash || metadata.recoveredAfterFlowWarning);
}

function repairFlowAsset(asset, metadata, context, assetsById, jobsById) {
  const { job, shot, startFrameAssetId } = context;
  let changed = 0;
  asset.projectId = job.projectId || asset.projectId;
  if (asset.shotId !== shot.id) {
    asset.shotId = shot.id;
    changed++;
  }
  if (shot.sceneId && asset.sceneId !== shot.sceneId) {
    asset.sceneId = shot.sceneId;
    changed++;
  }
  asset.metadata = { ...metadata, studioJobId: job.id, currentJobOnly: true, startFrameAssetId };
  if (asset.metadata.recoveredAfterFlowCrash && asset.metadata.recoveredFromAdjacentOlderBaseline) {
    delete asset.metadata.recoveredFromAdjacentOlderBaseline;
    changed++;
  }
  clearRecoveredAssetFlags(asset.metadata);
  changed += linkRecoveredAsset(asset, job, shot);
  if (isStrictFlowVideoAssetForShot(asset, shot, assetsById, jobsById)) {
    markRecoveredJobReady(job);
    changed++;
  }
  return changed;
}

function clearRecoveredAssetFlags(metadata) {
  delete metadata.hiddenFromStoryboard;
  delete metadata.unverifiedFlowVideo;
  delete metadata.unavailableReason;
  delete metadata.legacyUnownedFlowVideo;
}

function linkRecoveredAsset(asset, job, shot) {
  let changed = 0;
  if (!(shot.assetIds || []).includes(asset.id)) {
    shot.assetIds = Array.from(new Set([...(shot.assetIds || []), asset.id]));
    shot.status = "review";
    changed++;
  }
  if (!(job.resultAssetIds || []).includes(asset.id)) {
    job.resultAssetIds = Array.from(new Set([...(job.resultAssetIds || []), asset.id]));
    changed++;
  }
  return changed;
}

function markRecoveredJobReady(job) {
  job.status = "review_required";
  job.error = undefined;
  job.statusMessage = "Video downloaded and ready for review.";
  job.progress = 1;
  job.updatedAt = now();
}

module.exports = { createFlowBlockers };
