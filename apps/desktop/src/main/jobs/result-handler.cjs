const { completeStructuredTextJob, normalizeCompletedAssetJob } = require("../job-lifecycle.cjs");
const { inferIncomingAssetType, persistIncomingAssetFile, validateIncomingMediaSource } = require("../provider-asset-import.cjs");
const { normalizeVideoEditorialReview, applyVideoEditorialReview, reconcileReviewedVideoWithSequence } = require("../video-editorial.cjs");

const MEDIA_DURATION_TOLERANCE_SECONDS = 0.25;

function mutateRuntimeState(deps, mutator, metadata = {}) {
  if (typeof deps.mutateState === "function") return deps.mutateState(mutator, metadata);
  const state = deps.getState();
  mutator(state);
  return state;
}

function createJobResultHandler(deps) {
  return (message) => finishJob(deps, message);
}

function hasUsableExistingResult(state, job) {
  const assets = (job.resultAssetIds || []).map((assetId) => state.assets.find((asset) => asset.id === assetId)).filter(Boolean);
  return assets.length > 0 && assets.every((asset) => Boolean(asset.filePath));
}

function shouldNormalizeExistingResult(state, job, message) {
  if (!hasUsableExistingResult(state, job)) return false;
  if (message.status !== "done") return true;
  return !Array.isArray(message.assets) || message.assets.length === 0;
}

function completeSuccessfulResult(job, message, deps) {
  if (completeTextResult(job, message, deps)) {
    if (["approved", "done", "review_required"].includes(job.status)) deps.supersedeRetriedSourceJob(job);
    return;
  }
  importResultAssets(job, message.assets || [], deps);
  finalizeImportedResult(job, deps);
}

function finishJob(deps, message) {
  const state = deps.getState();
  const job = state.jobs.find((item) => item.id === message.jobId);
  if (!job || job.status === "cancelled") return;
  if (deps.isSavedConversationUrl(message.providerConversationUrl)) job.providerConversationUrl = message.providerConversationUrl;
  // An extension hard-reset can fail after the envelope ACK but before
  // ChatGPT creates a conversation URL. In that narrow state no provider
  // submission is recoverable and the original prompt is still safe to send
  // once more. Keep the job in the pipeline instead of converting it into a
  // dead retry button; the bounded attempt counter prevents a loop.
  if (retryAfterFailedChatGptReset(job, message, deps)) return publish(deps);
  if (job.watchdogFailed && message.status !== "done") return;
  applyResultOutcome(state, job, message, deps);
  publish(deps);
}

function retryAfterFailedChatGptReset(job, message, deps) {
  if (!eligibleForFreshChatGptDispatch(job, message, deps)) return false;
  const sent = deps.sendBridgeMessage(deps.encodeBridgeReferences(job.input.bridgeMessage));
  if (sent <= 0) return false;
  applyFreshChatGptDispatch(job, deps);
  return true;
}

function eligibleForFreshChatGptDispatch(job, message, deps) {
  return message.status === "failed_retryable" && job.providerId === "chatgpt-web" && !job.providerConversationUrl && !job.providerAcceptedAt
    && /hard reset could not recover|hard reset failed/i.test(String(message.error || ""))
    && Number(job.chatGptFreshDispatchAttempts || 0) < 1 && Boolean(deps.sendBridgeMessage) && Boolean(job.input?.bridgeMessage);
}

function applyFreshChatGptDispatch(job, deps) {
  job.chatGptFreshDispatchAttempts = Number(job.chatGptFreshDispatchAttempts || 0) + 1;
  job.status = "opening_provider";
  job.error = undefined;
  job.statusMessage = "ChatGPT hard reset failed before a conversation existed; resuming the original job once.";
  job.progress = 0.1;
  job.providerRunStartedAt = deps.now();
  job.updatedAt = deps.now();
  deps.logEvent("chatgpt_fresh_dispatch_after_reset", { jobId: job.id, projectId: job.projectId });
}

function applyResultOutcome(state, job, message, deps) {
  if (completePreflight(job, message, deps)) return;
  if (shouldNormalizeExistingResult(state, job, message)) return normalizeExistingResult(job, deps);
  job.status = message.status === "done" ? "review_required" : message.status;
  job.updatedAt = deps.now();
  if (message.status === "done") completeSuccessfulResult(job, message, deps);
  else handleFailedResult(job, message, deps);
}

function completePreflight(job, message, deps) {
  if (job.input?.bridgeMessage?.settings?.preflightOnly !== true || message.status !== "waiting_manual_action") return false;
  job.status = "done";
  job.error = undefined;
  job.statusMessage = message.error || "Provider preflight passed without submitting or spending credit.";
  job.progress = 1;
  job.preflightPassedAt = deps.now();
  job.needsStrictFlowRecovery = false;
  job.updatedAt = deps.now();
  delete job.providerAcceptedAt;
  deps.logEvent("job_preflight_passed", {
    jobId: job.id, projectId: job.projectId, shotId: job.shotId,
    idempotencyKey: job.idempotencyKey, providerWorkspaceUrl: job.providerWorkspaceUrl
  });
  return true;
}

function normalizeExistingResult(job, deps) {
  normalizeCompletedAssetJob(job, deps.now(), deps.completedAssetJobMessage(job));
  deps.supersedeRetriedSourceJob(job);
  deps.normalizeShotLinkedVideoAssets();
  deps.normalizeVideoJobsForCompletedShots();
}

function completeTextResult(job, message, deps) {
  return completeStructuredTextJob({
    job,
    message,
    timestamp: deps.now(),
    handlers: deps.structuredTextHandlers
  });
}

function importIncomingAsset(job, incoming, deps) {
  if (belongsToAnotherJob(job, incoming)) return false;
  const incomingProvider = incoming.provider || (job.providerId === "google-flow-web" ? "google-flow" : undefined);
  const incomingType = inferIncomingAssetType(incoming, job.jobType);
  if (wrongAssetTypeForJob(job, incomingType)) return false;
  const sourceValidation = validateIncomingMediaSource({
    incoming,
    incomingType,
    dataRoot: deps.dataRoot,
    downloadsRoot: deps.downloadsRoot,
    fs: deps.fs,
    path: deps.path,
    localPathFromStudioMediaUrl: deps.localPathFromStudioMediaUrl
  });
  if (!sourceValidation.ok) {
    failRetryable(job, `Provider media rejected before import (${sourceValidation.code}). The file was not written to project storage.`, deps);
    deps.logEvent("result_media_rejected", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, assetType: incomingType, reason: sourceValidation.code });
    return true;
  }
  const probe = verifyIncomingVideoProbe(incoming, incomingType, sourceValidation, deps);
  if (!probe.ok) {
    failRetryable(job, `Provider media rejected before import (${probe.code}). The file was not written to project storage.`, deps);
    deps.logEvent("result_media_rejected", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, assetType: incomingType, reason: probe.code });
    return true;
  }
  const duplicate = deps.duplicateFlowVideoResult(job, incoming, incomingType);
  if (duplicate) {
    handleDuplicateFlowAsset(job, duplicate, incoming, incomingProvider, deps);
    return true;
  }
  const asset = createIncomingAsset(job, incoming, incomingType, incomingProvider, deps);
  if (!asset) {
    failRetryable(job, "Provider media could not be persisted atomically; no project asset was created.", deps);
    deps.logEvent("result_media_persist_failed", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, assetType: incomingType });
    return true;
  }
  if (probe.value) {
    asset.durationSeconds = probe.value.durationSeconds;
    asset.metadata = { ...(asset.metadata || {}), durationSeconds: probe.value.durationSeconds, durationSource: "ffprobe", videoStreamCount: probe.value.videoStreamCount };
  }
  job.providerMediaId = String(incoming.metadata?.flowMediaId || incoming.metadata?.media_id || incoming.metadata?.providerJobId || job.providerMediaId || "") || undefined;
  deps.hydrateVideoMediaTruth(asset);
  deps.ensureImagePreview(asset);
  if (!deps.promoteAssetToReference(job, incoming, asset)) attachAsset(job, asset, incoming, deps);
  return false;
}

function verifyIncomingVideoProbe(incoming, incomingType, sourceValidation, deps) {
  if (incomingType !== "video" || typeof deps.probeIncomingMedia !== "function" || String(sourceValidation.source || "").startsWith("data:")) return { ok: true };
  let probe;
  try {
    probe = deps.probeIncomingMedia(sourceValidation.source);
  } catch {
    return { ok: false, code: "media_probe_failed" };
  }
  const durationSeconds = Number(probe?.durationSeconds);
  const videoStreamCount = Array.isArray(probe?.streams) ? probe.streams.filter((stream) => stream?.type === "video").length : 0;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || videoStreamCount < 1) return { ok: false, code: "media_probe_missing_video" };
  const declaredDuration = Number(incoming?.metadata?.durationSeconds ?? incoming?.metadata?.duration);
  if (Number.isFinite(declaredDuration) && declaredDuration > 0 && Math.abs(declaredDuration - durationSeconds) > MEDIA_DURATION_TOLERANCE_SECONDS) return { ok: false, code: "media_duration_mismatch" };
  return { ok: true, value: { durationSeconds, videoStreamCount } };
}

function belongsToAnotherJob(job, incoming) {
  return Boolean(incoming.metadata?.studioJobId && incoming.metadata.studioJobId !== job.id);
}

function wrongAssetTypeForJob(job, incomingType) {
  return job.jobType === "video" && incomingType !== "video";
}

function importResultAssets(job, incomingAssets, deps) {
  for (const incoming of incomingAssets) if (importIncomingAsset(job, incoming, deps)) break;
}

function handleDuplicateFlowAsset(job, asset, incoming, incomingProvider, deps) {
  recoverDuplicateFile(asset, incoming, job, deps);
  if (!asset.sourceProvider && incomingProvider) asset.sourceProvider = incomingProvider;
  if (asset.sourceProvider === "google-flow" && asset.shotId && asset.shotId !== job.shotId) {
    return failRetryable(job, `Google Flow recovery found an already imported video for another shot (${asset.id}). No new generation was submitted; refresh Flow and recover again only after the matching shot video is visible.`, deps);
  }
  const alreadyLinked = deps.shotAlreadyHasVideoForJob(job, asset);
  if (alreadyLinked || deps.attachExistingVideoAssetToJobShot(job, asset)) {
    job.status = "review_required";
    job.resultAssetIds = Array.from(new Set([...(job.resultAssetIds || []), asset.id]));
    job.error = undefined;
    job.statusMessage = alreadyLinked ? "Google Flow video was already imported for this shot." : "Reused an already imported Google Flow video for this shot.";
    job.progress = 1;
    job.updatedAt = deps.now();
    deps.resolveDuplicateFlowVideoBlockers(asset);
    deps.normalizeShotLinkedVideoAssets();
    deps.normalizeVideoJobsForCompletedShots();
    return;
  }
  failRetryable(job, `Google Flow returned a video already imported as ${asset.id}. Retry after the new Flow tile exposes its own video.`, deps);
}

function recoverDuplicateFile(asset, incoming, job, deps) {
  const recoveredFilePath = incoming.filePath || incoming.downloadPath;
  const recoveredRawPath = localRecoveryPath(recoveredFilePath);
  const existingLocalPath = deps.localPathFromStudioMediaUrl(asset.filePath);
  if (canCopyRecoveredFile(recoveredRawPath, existingLocalPath, deps)) {
    const assetDir = deps.path.join(deps.dataRoot, "projects", job.projectId, "videos");
    deps.fs.mkdirSync(assetDir, { recursive: true });
    const destination = deps.path.join(assetDir, `${deps.id("video")}${deps.path.extname(recoveredRawPath) || ".mp4"}`);
    deps.fs.copyFileSync(recoveredRawPath, destination);
    asset.filePath = deps.toStudioMediaUrl(destination);
    asset.metadata = { ...(asset.metadata || {}), ...(incoming.metadata || {}), storage: incoming.metadata?.storage || "download", originalUrl: incoming.metadata?.originalUrl || asset.metadata?.originalUrl };
  } else if (!asset.filePath && recoveredFilePath) {
    asset.filePath = recoveredFilePath;
  }
}

function localRecoveryPath(filePath) {
  return filePath?.startsWith("file://") ? filePath.slice(7) : filePath;
}

function canCopyRecoveredFile(recoveredPath, existingPath, deps) {
  return Boolean(recoveredPath && deps.fs.existsSync(recoveredPath)
    && (!existingPath || !deps.fs.existsSync(existingPath)));
}

function createIncomingAsset(job, incoming, incomingType, incomingProvider, deps) {
  const state = deps.getState();
  const filePath = persistIncomingAssetFile({
    incoming, incomingType, projectId: job.projectId, dataRoot: deps.dataRoot,
    fs: deps.fs, path: deps.path, makeId: deps.id, toMediaUrl: deps.toStudioMediaUrl,
    warn: (message) => console.warn(`[Studio] ${message}`)
  });
  if (!filePath) return undefined;
  return {
    id: deps.id("asset"), projectId: job.projectId,
    sceneId: state.shots.find((item) => item.id === job.shotId)?.sceneId,
    shotId: job.shotId, type: incomingType, filePath,
    sourceProvider: incomingProvider, sourceJobId: job.id,
    prompt: String(job.input.prompt ?? ""),
    width: Number(incoming.metadata?.width) || undefined,
    height: Number(incoming.metadata?.height) || undefined,
    durationSeconds: Number(incoming.metadata?.durationSeconds ?? incoming.metadata?.duration) || undefined,
    metadata: {
      ...incoming.metadata,
      startFrameAssetId: incoming.metadata?.startFrameAssetId || deps.flowJobStartFrameAssetId(job),
      aspectRatio: incoming.metadata?.aspectRatio || job.input?.bridgeMessage?.settings?.aspectRatio
    },
    createdAt: deps.now()
  };
}

function attachAsset(job, asset, incoming, deps) {
  const state = mutateRuntimeState(deps, (draft) => {
    draft.assets.push(asset);
    const currentJob = draft.jobs.find((item) => item.id === job.id) || job;
    currentJob.resultAssetIds.push(asset.id);
    const shot = draft.shots.find((item) => item.id === currentJob.shotId);
    if (shot) {
      shot.assetIds.push(asset.id);
      shot.status = "review";
    }
  }, { reason: "attach-result-asset", jobId: job.id, assetId: asset.id });
  deps.logEvent("result_asset_imported", {
    jobId: job.id, projectId: job.projectId, shotId: job.shotId, assetId: asset.id,
    assetType: asset.type, durationSeconds: asset.durationSeconds, providerMediaId: job.providerMediaId
  });
  const shot = state.shots.find((item) => item.id === job.shotId);
  if (asset.type !== "video" || incoming.metadata?.startFrameValidation?.passed !== false) return;
  const review = normalizeVideoEditorialReview({
    status: "rejected", checks: { durationValid: Boolean(asset.durationSeconds) },
    reviewer: "Automated start-frame gate",
    reason: `Generated video frame zero does not match the locked keyframe (${JSON.stringify(incoming.metadata.startFrameValidation)}).`,
    evidence: [String(incoming.metadata?.flowMediaId || incoming.metadata?.providerJobId || asset.id)]
  }, { promptVersion: job.idempotencyKey || job.id, reviewedAt: deps.now() });
  applyVideoEditorialReview({ asset, shot, review });
  reconcileReviewedVideoWithSequence({ project: state.projects.find((item) => item.id === asset.projectId), shot, asset, review, timestamp: deps.now() });
  job.statusMessage = "Video imported but automatically rejected because frame zero does not match the locked keyframe.";
}

function finalizeImportedResult(job, deps) {
  if (job.resultAssetIds.length > 0 && job.status === "review_required") {
    deps.repairRecoverableFlowVideoAssets();
    normalizeCompletedAssetJob(job, deps.now(), deps.completedAssetJobMessage(job));
    if (job.resultAssetIds.some((assetId) => deps.getState().assets.find((asset) => asset.id === assetId)?.metadata?.startFrameValidation?.passed === false)) {
      job.statusMessage = "Video imported but automatically rejected because frame zero does not match the locked keyframe.";
    }
    deps.supersedeRetriedSourceJob(job);
    deps.normalizeShotLinkedVideoAssets();
    deps.quarantineUnverifiedFlowVideoAssets();
    deps.normalizeVideoJobsForCompletedShots();
    deps.annotateVideoDurationMismatches();
  } else {
    deps.quarantineUnverifiedFlowVideoAssets();
  }
}

function handleFailedResult(job, message, deps) {
  if (deps.directReferenceExistsForJob(job)) {
    job.status = "approved";
    job.statusMessage = "Reference saved directly into the locked library.";
    job.error = undefined;
    job.progress = 1;
    job.updatedAt = deps.now();
    return;
  }
  job.error = message.error;
  if (message.error) job.statusMessage = message.error;
  job.progress = undefined;
  if (job.providerId === "google-flow-web" && job.jobType === "video" && job.shotId) {
    job.needsStrictFlowRecovery = true;
    job.flowRecoveryAttemptedAt = undefined;
  }
  if (!job.providerAcceptedAt) job.submissionState = "pre_submit_failed";
}

function failRetryable(job, message, deps) {
  job.status = "failed_retryable";
  job.error = message;
  job.statusMessage = message;
  job.progress = undefined;
  if (!job.providerAcceptedAt) job.submissionState = "pre_submit_failed";
  job.updatedAt = deps.now();
}

function publish(deps) {
  deps.saveState();
  deps.sendToRenderer("studio:state", deps.getState());
}

module.exports = { createJobResultHandler };
