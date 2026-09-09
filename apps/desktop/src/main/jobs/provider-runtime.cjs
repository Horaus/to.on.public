const FLOW_RECOVERY_RECENT_WINDOW_MS = 15 * 60 * 1000;

function createProviderJobRuntime(runtimeDeps) {
  // Keep every dependency and mutable view inside this runtime instance.
  // Multiple desktop windows/bridges may coexist; module-level state would let
  // the most recently-created runtime dispatch jobs through another instance.
  const deps = runtimeDeps;
  const state = new Proxy({}, { get: (_, key) => deps.getState()[key] });
  const sockets = deps.sockets;

  function commit(changed) {
    if (!changed) return changed;
    deps.saveState();
    deps.sendToRenderer("studio:state", deps.getState());
    return changed;
  }

  function dispatchPending() {
    if (sockets.size === 0) return 0;
    let dispatched = 0;
    for (const job of state.jobs || []) {
      if (job.status !== "pending") continue;
      const message = job.input?.bridgeMessage;
      if (!message || message.type !== "RUN_JOB") continue;
      const sent = deps.sendBridgeMessage(deps.encodeReferences(message));
      if (sent === 0) continue;
      job.status = "opening_provider";
      job.statusMessage = "Browser extension connected; opening provider...";
      job.progress = 0.1;
      job.bridgeDispatchAttempts = Number(job.bridgeDispatchAttempts || 0) + 1;
      job.bridgeFirstDispatchedAt ||= deps.now();
      job.providerRunStartedAt ||= deps.now();
      job.bridgeLastEnvelopeDeliveryAt = deps.now();
      job.updatedAt = deps.now();
      deps.logEvent("job_dispatched", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, providerId: job.providerId, attempt: job.bridgeDispatchAttempts, idempotencyKey: job.idempotencyKey });
      dispatched += 1;
    }
    return commit(dispatched);
  }

  function redeliverableChatGptJob(job, nowMs) {
    if (job.providerId !== "chatgpt-web" || job.status !== "opening_provider" || job.bridgeAcknowledgedAt) return false;
    const message = job.input?.bridgeMessage;
    if (!message || message.type !== "RUN_JOB") return false;
    const lastDeliveryAt = Date.parse(job.bridgeLastEnvelopeDeliveryAt || job.bridgeFirstDispatchedAt || "");
    return !(Number.isFinite(lastDeliveryAt) && nowMs - lastDeliveryAt < 4_000);
  }

  function deliverChatGptEnvelope(socket, job) {
    const message = job.input.bridgeMessage;
    if (!deps.safeSend(socket, deps.encodeReferences(message))) return 0;
    job.bridgeEnvelopeDeliveries = Number(job.bridgeEnvelopeDeliveries || 1) + 1;
    job.bridgeLastEnvelopeDeliveryAt = deps.now();
    deps.logEvent("job_envelope_redelivered_after_pong", { jobId: job.id, projectId: job.projectId, deliveries: job.bridgeEnvelopeDeliveries });
    return 1;
  }

  function deliverUnacknowledgedChatGpt(socket) {
    if (!deps.socketCanHandleProvider(socket, "chatgpt")) return 0;
    let delivered = 0;
    for (const job of state.jobs || []) {
      if (!redeliverableChatGptJob(job, deps.nowMs())) continue;
      delivered += deliverChatGptEnvelope(socket, job);
    }
    if (delivered) deps.saveState();
    return delivered;
  }

  function retryOpening() {
    // A job may be durably queued while the extension is pairing, refreshing
    // capabilities, or reconnecting. Flush pending intents on the same
    // bounded watchdog tick; otherwise they can remain pending forever even
    // though the bridge is healthy again. dispatchPending() marks a job as
    // opening_provider only after a point-to-point send succeeds, so this is
    // not a retry loop or a second provider submission.
    let changed = dispatchPending();
    for (const job of state.jobs || []) changed += retryOpeningJob(job);
    return commit(changed);
  }

  function openingRetryCutoff(job, message) {
    const isChatGptImage = job.providerId === "chatgpt-web" && ["image", "text_to_image"].includes(String(message.task || ""));
    const isChatGptStructuredText = job.providerId === "chatgpt-web" && ["story_development", "story_foundation", "story_architecture", "screenplay_scene", "shot_breakdown"].includes(String(message.task || ""));
    return job.providerId === "google-flow-web" ? 150_000 : isChatGptImage ? 120_000 : isChatGptStructuredText ? 240_000 : job.providerId === "chatgpt-web" ? 90_000 : 20_000;
  }

  function retryNonChatGptOpening(job, message) {
    const attempts = Number(job.bridgeDispatchAttempts || 1);
    if (attempts >= 3) return fail(job, "Browser extension did not acknowledge the provider job. Reload the extension and run this step again.");
    const sent = deps.sendBridgeMessage(deps.encodeReferences(message));
    if (!sent) return 0;
    job.bridgeDispatchAttempts = attempts + 1;
    job.statusMessage = `Retrying browser extension handoff (${job.bridgeDispatchAttempts}/3)...`;
    job.updatedAt = deps.now();
    return 1;
  }

  function retryOpeningJob(job) {
    if (job.status !== "opening_provider") return 0;
    const message = job.input?.bridgeMessage;
    if (!message || message.type !== "RUN_JOB") return 0;
    const updatedAt = Date.parse(job.updatedAt || job.bridgeFirstDispatchedAt || job.createdAt || "");
    if (Number.isFinite(updatedAt) && deps.nowMs() - updatedAt < openingRetryCutoff(job, message)) return 0;
    if (sockets.size === 0) return fail(job, "Browser extension disconnected while opening the provider. Reload the extension and run this step again.");
    if (job.providerId === "chatgpt-web") return retryOpeningChatGpt(job);
    // An extension ACK proves delivery, not that the provider tab advanced.
    // Once Flow has ACKed an envelope, redelivering RUN_JOB can create a
    // duplicate-envelope race while the original executor is still alive.
    // Fail closed and leave an explicit manual recovery point instead.
    if (job.providerId === "google-flow-web" && job.bridgeAcknowledgedAt) {
      deps.broadcast({ type: "CANCEL_JOB", jobId: job.id });
      return fail(job, "Flow provider did not advance after the extension ACK. The app stopped without resubmitting; inspect the Relay runtime and retry this shot manually after it is healthy.");
    }
    return retryNonChatGptOpening(job, message);
  }

  function retryOpeningChatGpt(job) {
    const attempts = Number(job.chatGptHardResetAttempts || 0);
    if (job.bridgeAcknowledgedAt && attempts < 1) {
      job.chatGptHardResetAttempts = attempts + 1;
      job.statusMessage = "ChatGPT stalled after ACK; requesting one cache-bypassing hard reset in the original tab...";
      job.updatedAt = deps.now();
      deps.broadcast({ type: "HARD_RESET_CHATGPT_DISPATCH", jobId: job.id });
      deps.logEvent("chatgpt_hard_reset_requested", { jobId: job.id, projectId: job.projectId, attempt: job.chatGptHardResetAttempts });
      return 1;
    }
    deps.broadcast({ type: "CANCEL_JOB", jobId: job.id });
    return fail(job, job.bridgeAcknowledgedAt ? "ChatGPT provider dispatch did not advance after the extension ACK. The app stopped without resubmitting." : "Browser extension did not ACK the ChatGPT job within 60 seconds. The app stopped without resubmitting.");
  }

  function retryActive() {
    if (sockets.size === 0) return 0;
    let changed = 0;
    for (const job of state.jobs || []) changed += retryActiveJob(job);
    return commit(changed);
  }

  function retryActiveJob(job) {
    if (!["submitting", "generating", "downloading"].includes(job.status) || job.watchdogFailed) return 0;
    const message = job.input?.bridgeMessage;
    if (isDetachedFlowRecovery(job, message)) return expireDetachedFlowRecovery(job);
    if (!message || message.type !== "RUN_JOB") return 0;
    const watchdog = activeWatchdog(job, message);
    if (Number.isFinite(watchdog.anchorMs) && deps.nowMs() - watchdog.anchorMs < watchdog.timeoutMs) return 0;
    if (job.providerId === "google-flow-web") return recoverOrFailFlow(job);
    return retryTimedOutProviderJob(job, message);
  }

  function activeWatchdog(job, message) {
    // Status/progress heartbeats must not extend the watchdog indefinitely.
    // Anchor each provider attempt to its dispatch time instead of mutable
    // `updatedAt`, otherwise a stalled browser can keep a job generating
    // forever by emitting hydration/status messages.
    if (!job.providerRunStartedAt) job.providerRunStartedAt = job.createdAt || job.updatedAt || deps.now();
    const bridgeTask = String(message?.task || "");
    const structuredTask = ["story_development", "story_foundation", "story_architecture", "screenplay_scene", "shot_breakdown"].includes(bridgeTask);
    if (job.providerId === "chatgpt-web" && job.status === "downloading" && structuredTask && !job.resultHandoffStartedAt) {
      job.resultHandoffStartedAt = job.updatedAt || deps.now();
    }
    const flowAcceptedAnchor = job.providerId === "google-flow-web" && job.providerAcceptedAt
      ? job.providerAcceptedAt
      : undefined;
    return {
      // Flow preparation can legitimately spend minutes on picker hydration
      // before the provider accepts a submit. Start its generation watchdog
      // from that immutable acceptance marker; status heartbeats still cannot
      // extend it because providerAcceptedAt is written only once.
      anchorMs: Date.parse(job.resultHandoffStartedAt || flowAcceptedAnchor || job.providerRunStartedAt),
      timeoutMs: activeTimeout(job, bridgeTask, structuredTask)
    };
  }

  function activeTimeout(job, bridgeTask, structuredTask) {
    // Images and structured reasoning receive larger windows only in the
    // provider phases where those operations can actually be in progress.
    const imageTimeout = job.providerId === "chatgpt-web" && ["image", "text_to_image"].includes(bridgeTask)
      ? Math.max(deps.providerActiveTimeoutMs, 240_000)
      : deps.providerActiveTimeoutMs;
    const structuredTimeout = job.providerId === "chatgpt-web" && job.status === "generating" && structuredTask
      ? Math.max(deps.providerActiveTimeoutMs, 300_000)
      : imageTimeout;
    return job.providerId === "google-flow-web" ? deps.flowActiveTimeoutMs : structuredTimeout;
  }

  function retryTimedOutProviderJob(job, message) {
    const attempts = Number(job.providerRunAttempts || job.bridgeDispatchAttempts || 1);
    const bridgeTask = String(message?.task || "");
    if (isImageHandoffTimeout(job, bridgeTask)) return failImageHandoffTimeout(job);
    if (shouldHardResetTimedOutChatGpt(job)) return hardResetTimedOutChatGpt(job);
    return submitTimedOutProviderRetry(job, message, attempts);
  }

  function isImageHandoffTimeout(job, bridgeTask) {
    return job.providerId === "chatgpt-web" && job.status === "downloading" && ["image", "text_to_image"].includes(bridgeTask);
  }

  function failImageHandoffTimeout(job) {
    // Once ChatGPT has reported a candidate, only local asset handoff remains.
    // Never resubmit the prompt and create a duplicate generation loop.
    deps.broadcast({ type: "CANCEL_JOB", jobId: job.id });
    job.watchdogFailed = true;
    return fail(job, "ChatGPT returned an image candidate, but the extension did not complete asset handoff before the watchdog deadline. The prompt was not resubmitted; retry after reloading the provider tab.");
  }

  function shouldHardResetTimedOutChatGpt(job) {
    return job.providerId === "chatgpt-web" && !Number(job.chatGptHardResetAttempts || 0);
  }

  function hardResetTimedOutChatGpt(job) {
    // Reset the original tab once before any new envelope is allowed.
    job.chatGptHardResetAttempts = 1;
    job.status = "opening_provider";
    job.statusMessage = "ChatGPT provider stalled; hard-resetting the original tab once before retrying...";
    job.updatedAt = deps.now();
    deps.broadcast({ type: "HARD_RESET_CHATGPT_DISPATCH", jobId: job.id });
    deps.logEvent("chatgpt_hard_reset_requested", { jobId: job.id, projectId: job.projectId, phase: "active-timeout" });
    return 1;
  }

  function submitTimedOutProviderRetry(job, message, attempts) {
    deps.broadcast({ type: "CANCEL_JOB", jobId: job.id });
    if (attempts >= 3) {
      job.watchdogFailed = true;
      return fail(job, `Provider job timed out after ${attempts} attempts. The app stopped retrying to avoid an infinite loop. Check the provider tab, quota/sign-in state, then run this step again.`);
    }
    if (!deps.sendBridgeMessage(deps.encodeReferences(message))) return 0;
    job.providerRunAttempts = attempts + 1;
    job.providerRunStartedAt = deps.now();
    job.status = "opening_provider";
    job.statusMessage = `Provider did not return a result in time. Retrying job (${job.providerRunAttempts}/3)...`;
    job.progress = 0.1;
    job.updatedAt = deps.now();
    return 1;
  }

  function isDetachedFlowRecovery(job, message) {
    return job.providerId === "google-flow-web" && job.status === "downloading" && (!message || message.type !== "RUN_JOB") && job.flowRecoveryAttemptedAt;
  }

  function expireDetachedFlowRecovery(job) {
    const startedAt = Date.parse(job.flowRecoveryAttemptedAt);
    if (!Number.isFinite(startedAt) || deps.nowMs() - startedAt < deps.flowRecoveryTimeoutMs) return 0;
    return fail(job, "Google Flow recovery timed out without returning a new video. Run the video step again so the app submits a fresh Flow prompt.");
  }

  function recoverOrFailFlow(job) {
    if (!job.flowRecoveryAttemptedAt) {
      recoverFlow(job, "auto");
      job.statusMessage = "Google Flow job timed out; checking the existing Flow project for a strict current-job result before any retry.";
      return 1;
    }
    const startedAt = Date.parse(job.flowRecoveryAttemptedAt);
    if (Number.isFinite(startedAt) && deps.nowMs() - startedAt < deps.flowRecoveryTimeoutMs) return 0;
    deps.broadcast({ type: "CANCEL_JOB", jobId: job.id });
    job.watchdogFailed = true;
    return fail(job, "Google Flow did not return a strictly verified result before the watchdog timeout. The app stopped instead of auto-submitting the same video prompt again; refresh the Flow tab and use Retry only after checking whether Flow already generated a matching result.");
  }

  function fail(job, error) {
    job.status = "failed_retryable";
    job.error = error;
    job.statusMessage = error;
    job.progress = undefined;
    job.updatedAt = deps.now();
    return 1;
  }

  function recoverFlow(job, reason = "manual") {
    if (sockets.size === 0) return false;
    const message = job.input?.bridgeMessage || {};
    const originalError = job.error || job.statusMessage || "";
    job.status = "downloading";
    job.error = undefined;
    job.watchdogFailed = false;
    job.needsStrictFlowRecovery = false;
    job.statusMessage = reason === "auto" ? "Auto-recovering strict current-job Google Flow video..." : "Recovering strict current-job Google Flow video...";
    job.progress = 0.9;
    job.flowRecoveryAttempts = Number(job.flowRecoveryAttempts || 0) + 1;
    job.flowRecoveryAttemptedAt = deps.now();
    job.updatedAt = deps.now();
    deps.sendBridgeMessage(deps.encodeReferences({ type: "RECOVER_FLOW_RESULT", jobId: job.id, task: message.task || "image_to_video", prompt: message.prompt || job.input?.prompt || "", settings: message.settings || {}, references: message.references || [], originalError }));
    return true;
  }

  function recoverRecentFlowFailures() {
    if (sockets.size === 0) return 0;
    let recovered = 0;
    for (const job of state.jobs || []) {
      if (isEligibleFlowRecovery(job) && recoverFlow(job, "auto")) recovered += 1;
    }
    return commit(recovered);
  }

  function isEligibleFlowRecovery(job) {
    if (job.providerId !== "google-flow-web" || job.jobType !== "video" || job.status !== "failed_retryable") return false;
    if (job.flowRecoverySuppressedAt) return false;
    // Reconnecting the bridge must not resurrect historical Flow failures
    // unless this project explicitly opted into YOLO automation. Manual Retry
    // remains available from the project UI for every failed job.
    const project = (state.projects || []).find((item) => item.id === job.projectId);
    if (project && project.intake?.yoloEnabled !== true) return false;
    // A bridge heartbeat may arrive long after a prior session ended. Only
    // recover a failure that is genuinely recent; otherwise reconnecting the
    // extension can resurrect the entire historical Flow queue and create a
    // recovery loop/CPU spike. Older failures remain available to explicit
    // user Retry from the project UI.
    const updatedAt = Date.parse(String(job.updatedAt || ""));
    if (!Number.isFinite(updatedAt) || deps.nowMs() - updatedAt > FLOW_RECOVERY_RECENT_WINDOW_MS) return false;
    if (Number(job.flowRecoveryAttempts || 0) >= 3 || !job.shotId) return false;
    return Boolean(job.needsStrictFlowRecovery || /submit click returned|waiting for google flow result|timeout waiting for google flow|crashed after submit/i.test(String(job.error || job.statusMessage || "")));
  }

  return { dispatchPending, deliverUnacknowledgedChatGpt, retryOpening, retryActive, recoverFlow, recoverRecentFlowFailures };
}

module.exports = { createProviderJobRuntime };
