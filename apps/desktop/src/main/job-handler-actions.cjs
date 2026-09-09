const characterVoicePayloadError = (projectId, shot, characterVoice) => {
  if (!shot || shot.speechType === "silent" || !String(shot.dialogue || "").trim()) return "";
  return "Nhà cung cấp video không giữ được giọng nhân vật giữa các shot. Video sẽ tạo không có thoại; phần âm thanh thoại được xử lý ở bước âm thanh riêng.";
};

function mutateRuntimeState(runtime, mutator, metadata = {}) {
  if (typeof runtime.mutateState === "function") return runtime.mutateState(mutator, metadata);
  const state = runtime.getState();
  mutator(state);
  return state;
}


function rejectInvalidRunJob(runtime, storedPayload, bridgeMessage, idempotencyKey, preflightValidation, requestedShot) {
  const { now, saveState, sendToRenderer, logEvent } = runtime;
  const voicePayloadError = bridgeMessage?.settings?.generateAudio === true
    ? characterVoicePayloadError(storedPayload.projectId, requestedShot, bridgeMessage?.settings?.characterVoice)
    : "";
  if (storedPayload.jobType === "video" && storedPayload.providerId === "google-flow-web" && voicePayloadError) {
    const rejectedJob = createRejectedJob(storedPayload, idempotencyKey, now(), "Character voice mapping was rejected before provider dispatch.", voicePayloadError);
    const state = mutateRuntimeState(runtime, (draft) => draft.jobs.unshift(rejectedJob), { reason: "reject-character-voice-mapping", jobId: rejectedJob.id });
    logEvent("character_voice_mapping_rejected", { jobId: rejectedJob.id, projectId: rejectedJob.projectId, shotId: rejectedJob.shotId, error: voicePayloadError });
    saveState();
    sendToRenderer("studio:state", state);
    return state;
  }
  const invalidPreflight = storedPayload.jobType === "video" && storedPayload.providerId === "google-flow-web" && (
    !preflightValidation?.valid ||
    preflightValidation.shotId !== storedPayload.shotId ||
    preflightValidation.idempotencyKey !== idempotencyKey ||
    Number(preflightValidation.estimatedSubmits) !== 1
  );
  if (invalidPreflight) {
    const error = preflightValidation?.issues?.map((issue) => `${issue.code}: ${issue.message}`).join(" Â· ") || "Missing signed video preflight validation.";
    const rejectedJob = createRejectedJob(storedPayload, idempotencyKey, now(), "Video preflight rejected this payload before provider dispatch.", error);
    const state = mutateRuntimeState(runtime, (draft) => draft.jobs.unshift(rejectedJob), { reason: "reject-video-preflight", jobId: rejectedJob.id });
    logEvent("job_preflight_rejected", { jobId: rejectedJob.id, projectId: rejectedJob.projectId, shotId: rejectedJob.shotId, idempotencyKey, issues: preflightValidation?.issues || [{ code: "PREFLIGHT_MISSING" }] });
    saveState();
    sendToRenderer("studio:state", state);
    return state;
  }
  return null;
}

function createRejectedJob(payload, idempotencyKey, timestamp, statusMessage, error) {
  return {
    id: payload.jobId, projectId: payload.projectId, shotId: payload.shotId, providerId: payload.providerId,
    jobType: payload.jobType, input: payload, status: "failed_manual", statusMessage, error,
    progress: undefined, idempotencyKey, resultAssetIds: [], createdAt: timestamp, updatedAt: timestamp
  };
}

function findActiveRunJob(runtime, payload, payloadTask, idempotencyKey, activeStatuses) {
  const state = runtime.getState();
  return state.jobs.find((job) => {
    // Idempotency is the strongest invariant. A renderer retry can arrive
    // while a previous job is being cancelled and its transient metadata may
    // differ; the same project/key must never open a second provider task.
    if (job.projectId === payload.projectId && job.idempotencyKey === idempotencyKey && activeStatuses.has(job.status)) return true;
    if (!sameRunJobScope(job, payload)) return false;
    if (job.idempotencyKey && job.idempotencyKey === idempotencyKey && activeStatuses.has(job.status)) return true;
    if (payload.shotId) return job.shotId === payload.shotId && activeStatuses.has(job.status);
    return activeStatuses.has(job.status) && !job.shotId && job.input?.bridgeMessage?.task === payloadTask;
  });
}

function sameRunJobScope(job, payload) {
  return job.projectId === payload.projectId && job.providerId === payload.providerId && job.jobType === payload.jobType;
}

function finishExistingRunJob(runtime, existingJob) {
  const { now, saveState, dispatchPendingJobs, sendToRenderer } = runtime;
  const state = mutateRuntimeState(runtime, (draft) => {
    const current = draft.jobs.find((job) => job.id === existingJob.id);
    if (!current) return;
    current.statusMessage = current.statusMessage || "This browser job is already running.";
    current.updatedAt = now();
  }, { reason: "reuse-active-run-job", jobId: existingJob.id });
  saveState();
  if (existingJob.status === "pending") dispatchPendingJobs();
  sendToRenderer("studio:state", state);
  return state;
}

function createAndDispatchRunJob(runtime, payload, bridgeMessage, idempotencyKey) {
  const { now, logEvent, shotHasRenderableVideo, sockets, sendBridgeMessage, encodeBridgeReferences, saveState } = runtime;
  const job = {
    id: payload.jobId, projectId: payload.projectId, shotId: payload.shotId, providerId: payload.providerId,
    jobType: payload.jobType, input: payload, status: "pending", statusMessage: "Waiting for the browser extension...",
    progress: 0, providerRunAttempts: 1, idempotencyKey, resultAssetIds: [], submissionState: "queued", createdAt: now(), updatedAt: now()
  };
  logEvent("job_queued", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, providerId: job.providerId, idempotencyKey: job.idempotencyKey });
  // Persist the pending job before sending the envelope. The extension can
  // reject a pre-submit request immediately; if the job is not durable yet,
  // that status event can race the mutation and be rendered against stale
  // state from another shot.
  let state = mutateRuntimeState(runtime, (draft) => {
    draft.jobs.unshift(job);
    const shot = draft.shots.find((item) => item.id === payload.shotId);
    if (shot) {
      const assetsById = new Map((draft.assets || []).map((asset) => [asset.id, asset]));
      if (!shotHasRenderableVideo(shot, assetsById)) shot.status = "queued";
      if (payload.jobType === "video") { shot.prompt = payload.prompt; shot.providerId = payload.providerId; }
    }
  }, { reason: "create-run-job", jobId: job.id, projectId: job.projectId, shotId: job.shotId });
  saveState();
  // Persist the intent separately from delivery. A crash after this write but
  // before the socket send is reconciled as an unfinished attempt; it is not
  // evidence that the provider accepted or generated anything.
  job.submitIntentAt = now();
  job.submissionState = "intent_recorded";
  job.updatedAt = now();
  saveState();
  logEvent("job_submit_intent", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, providerId: job.providerId, idempotencyKey: job.idempotencyKey });
  let dispatch;
  if (sockets.size > 0) {
    const sent = sendBridgeMessage(encodeBridgeReferences(bridgeMessage));
    if (sent > 0) {
      dispatch = { status: "opening_provider", statusMessage: "Sent to browser extension; opening provider...", progress: 0.1, bridgeDispatchAttempts: 1, submissionState: "bridge_delivered", submitDeliveredAt: now(), providerRunStartedAt: now(), updatedAt: now() };
      state = mutateRuntimeState(runtime, (draft) => {
        const current = draft.jobs.find((item) => item.id === job.id);
        if (current) Object.assign(current, dispatch);
      }, { reason: "mark-run-job-dispatched", jobId: job.id });
      saveState();
      logEvent("job_dispatched", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, providerId: job.providerId, attempt: dispatch.bridgeDispatchAttempts, idempotencyKey: job.idempotencyKey });
    }
  }
  return state;
}

function registerRunJobHandler(runtime) {
  const { ipcMain, crypto, normalizeBridgeMessageForStorage, now, saveStateBackup, getState } = runtime;
  // The YOLO continuation effect can re-enter while the renderer is waiting
  // for the first IPC response. Keep a short-lived process-local guard so the
  // same logical dispatch cannot create repeated backups or provider envelopes
  // before the durable job state is visible to the next render.
  const recentDispatches = new Map();
  ipcMain.handle("studio:run-job", (_, payload) => {
    const state = getState();
    const bridgeMessage = normalizeBridgeMessageForStorage(payload.projectId, payload.bridgeMessage);
    const logicalIdempotencyKey = runJobIdempotencyKey(crypto, payload, bridgeMessage);
    // The preflight fingerprint describes logical content equality. Provider
    // dispatch identity must additionally name the concrete job so a later
    // user-authorized attempt cannot be deduplicated against a finished job
    // that happened to carry the same prompt and start frame.
    const idempotencyKey = `${payload.jobId}:${logicalIdempotencyKey}`;
    if (bridgeMessage?.settings) {
      bridgeMessage.settings.idempotencyKey = idempotencyKey;
      // The preflight signature covers the concrete dispatch identity. The
      // handler prefixes the renderer's logical key with the job id, so keep
      // the nested validation record in lockstep or every valid video job is
      // rejected before the extension can receive it.
      if (bridgeMessage.settings.preflightValidation && typeof bridgeMessage.settings.preflightValidation === "object") {
        bridgeMessage.settings.preflightValidation = {
          ...bridgeMessage.settings.preflightValidation,
          idempotencyKey
        };
      }
    }
    const storedPayload = { ...payload, bridgeMessage };
    const activeStatuses = new Set(["pending", "opening_provider", "submitting", "generating", "downloading"]);
    const payloadTask = bridgeMessage?.task;
    const preflightValidation = bridgeMessage?.settings?.preflightValidation;
    const requestedShot = state.shots.find((shot) => shot.id === storedPayload.shotId);
    const rejectionState = rejectInvalidRunJob(runtime, storedPayload, bridgeMessage, idempotencyKey, preflightValidation, requestedShot);
    if (rejectionState) return rejectionState;
    const dispatchKey = `${storedPayload.projectId}:${storedPayload.providerId}:${storedPayload.jobType}:${idempotencyKey}`;
    const previousDispatchAt = recentDispatches.get(dispatchKey) || 0;
    if (Date.now() - previousDispatchAt < 5000) return state;
    const existingJob = findActiveRunJob(runtime, payload, payloadTask, idempotencyKey, activeStatuses);
    if (existingJob) return finishExistingRunJob(runtime, existingJob);
    recentDispatches.set(dispatchKey, Date.now());
    if (["story_development", "story_foundation", "story_architecture", "screenplay_scene", "shot_breakdown"].includes(payloadTask)) saveStateBackup(payloadTask);
    return createAndDispatchRunJob(runtime, storedPayload, bridgeMessage, idempotencyKey);
  });
}

function runJobIdempotencyKey(crypto, payload, bridgeMessage) {
  if (bridgeMessage?.settings?.idempotencyKey) return bridgeMessage.settings.idempotencyKey;
  return crypto.createHash("sha256").update([
    payload.providerId, payload.projectId, payload.shotId || "project", payload.prompt || "",
    bridgeMessage?.settings?.startFrameAssetId || bridgeMessage?.references?.[0]?.assetId || "no-reference",
    bridgeMessage?.settings?.characterVoice?.voiceId || "no-character-voice",
    bridgeMessage?.settings?.providerWorkspaceUrl || payload.providerWorkspaceUrl || "default-workspace"
  ].join("|")).digest("hex");
}

function registerRecoverJobHandler(runtime) {
  const { ipcMain, crypto, normalizeBridgeMessageForStorage, now, saveState, sendToRenderer, logEvent, saveStateBackup, dispatchPendingJobs, shotHasRenderableVideo, sockets, sendBridgeMessage, encodeBridgeReferences, applyStoryResult, applyStoryFoundationResult, applyStoryArchitectureResult, applyScreenplaySceneResult, applyShotBreakdownResult, recoverFlowJob, isSavedChatGptConversationUrl, broadcast, getState } = runtime;
ipcMain.handle("studio:recover-job", (_, jobId) => {
    const state = getState();
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) return state;
    recoverSavedJob(runtime, job);
    return state;
  });
}

function recoverSavedJob(runtime, job) {
  const { state, now, saveState, sendToRenderer, applyStoryResult, applyStoryFoundationResult,
    applyStoryArchitectureResult, applyScreenplaySceneResult, applyShotBreakdownResult,
    recoverFlowJob, isSavedChatGptConversationUrl, broadcast } = runtime;
  const task = job.input?.bridgeMessage?.task;
  const structuredAppliers = {
    story_foundation: applyStoryFoundationResult,
    story_architecture: applyStoryArchitectureResult,
    screenplay_scene: applyScreenplaySceneResult,
    shot_breakdown: applyShotBreakdownResult
  };
  if (job.outputText?.trim() && (task === "story_development" || structuredAppliers[task])) {
    try {
      (task === "story_development" ? applyStoryResult : structuredAppliers[task])(job, { output: { text: job.outputText } });
      job.status = "approved";
      job.error = undefined;
      job.statusMessage = task === "story_development"
        ? "Recovered and imported the saved provider story response."
        : `Recovered and imported the saved ${task.replaceAll("_", " ")} response.`;
      job.progress = 1;
      job.updatedAt = now();
      saveState();
      sendToRenderer("studio:state", state);
      return true;
    } catch (error) {
      job.status = "failed_retryable";
      job.error = `Saved ${task === "story_development" ? "story" : "structured"} response is invalid: ${error instanceof Error ? error.message : String(error)}`;
      job.statusMessage = task === "story_development"
        ? "Saved story response is invalid; rescanning the provider conversation for a corrected response..."
        : "Saved response failed strict import validation. Retry can request a corrected provider response.";
      job.updatedAt = now();
      if (task === "story_development") return false;
      saveState();
      sendToRenderer("studio:state", state);
      return true;
    }
  }
  if (job.providerId === "google-flow-web") {
    // Manual recovery is an explicit opt-in after a prior cancellation.
    job.flowRecoverySuppressedAt = undefined;
    recoverFlowJob(job);
    saveState();
    return true;
  }
  if (!isSavedChatGptConversationUrl(job.providerConversationUrl)) {
    job.status = "failed_retryable";
    job.error = "This job has no valid saved ChatGPT conversation URL.";
    saveState();
    return true;
  }
  job.status = "opening_provider";
  job.recoveryAttempts = Number(job.recoveryAttempts || 0) + 1;
  job.error = undefined;
  job.statusMessage = "Opening the saved ChatGPT conversation...";
  job.progress = 0.1;
  saveState();
  broadcast({ type: "RECOVER_JOB", jobId: job.id, task, resultType: job.jobType, conversationUrl: job.providerConversationUrl });
  return true;
}

function registerCancelProjectJobsHandler(runtime) {
  const { ipcMain, now, saveState, sendToRenderer, broadcast, getState } = runtime;
  ipcMain.handle("studio:cancel-project-jobs", (_, projectId) => {
    const cancellableStatuses = new Set(["pending", "opening_provider", "submitting", "generating", "downloading", "queued", "running", "awaiting_user", "recoverable"]);
    let changed = 0;
    const state = mutateRuntimeState(runtime, (draft) => {
      // Stop the persisted automation intent in the same state transaction as
      // the job cancellation.  Sending a separate updateProject IPC from the
      // renderer races this response and can restore a stale yoloEnabled=true
      // snapshot, which lets the continuation effect enqueue the same shot
      // again after the user has explicitly stopped it.
      const project = (draft.projects || []).find((item) => item.id === projectId);
      if (project?.intake?.yoloEnabled) {
        project.intake = { ...project.intake, yoloEnabled: false };
        changed++;
      }
      for (const job of draft.jobs) {
        if (job.projectId !== projectId) continue;
        // A failed Flow job may still be eligible for the desktop's automatic
        // strict-result recovery when the extension reconnects. Cancellation
        // must suppress that recovery without erasing the historical failure;
        // otherwise merely reloading the extension can start the old job again.
        if (job.providerId === "google-flow-web" && job.jobType === "video" && job.status === "failed_retryable" && job.needsStrictFlowRecovery) {
          job.needsStrictFlowRecovery = false;
          job.flowRecoverySuppressedAt = now();
          job.statusMessage = "Đã tạm dừng tự khôi phục Flow theo yêu cầu; bấm Thử lại khi sẵn sàng.";
          job.updatedAt = now();
          changed++;
          continue;
        }
        if (!cancellableStatuses.has(job.status)) continue;
        job.status = "cancelled";
        job.error = undefined;
        job.statusMessage = "Cancelled by the user from the desktop app.";
        job.progress = undefined;
        job.updatedAt = now();
        broadcast({ type: "CANCEL_JOB", jobId: job.id });
        changed++;
      }
    }, { reason: "cancel-project-jobs", projectId });
    if (changed > 0) {
      saveState();
      sendToRenderer("studio:state", state);
    }
    return state;
  });
}

module.exports = { registerRunJobHandler, registerRecoverJobHandler, registerCancelProjectJobsHandler };
