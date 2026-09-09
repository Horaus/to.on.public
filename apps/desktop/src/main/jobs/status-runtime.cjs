function publish(deps) {
  deps.saveState();
  deps.sendState(deps.getState());
}

function mergeReferenceIds(job, message) {
  if (!Array.isArray(message.providerReferenceAssetIds)) return;
  job.providerReferenceAssetIds = Array.from(new Set([...(job.providerReferenceAssetIds || []), ...message.providerReferenceAssetIds.map(String)]));
}

function retainTerminalConversation(deps, job, message) {
  if (!deps.isSavedConversationUrl(message.providerConversationUrl) || job.providerConversationUrl) return;
  job.providerConversationUrl = message.providerConversationUrl;
  publish(deps);
}

function isTerminalJob(job) {
  return ["approved", "done", "review_required", "failed_manual", "failed_retryable"].includes(job.status);
}

function markProviderAccepted(deps, job, message) {
  if (job.providerAcceptedAt) return;
  if (/authoriz|provider accepted|submit accepted|generation tile detected/i.test(String(message.message || ""))) {
    job.providerAcceptedAt = deps.now();
    job.submissionState = "provider_accepted";
  }
}

function isPreSubmitFlowFailure(job, message) {
  if (job.providerId !== "google-flow-web" || job.jobType !== "video") return false;
  if (!['submitting', 'opening_provider'].includes(String(message.status || ""))) return false;
  return /Flow SDK media selection could not resolve|workspace relay could not provide|Flow composer (?:add button|component picker) was not visible|Flow component picker did not open|message channel closed|receiving end does not exist|timed out waiting for (?:storyboard media|continuity reference)/i.test(String(message.message || ""));
}

function update(deps, message) {
  const job = deps.getState().jobs.find((item) => item.id === message.jobId);
  if (!job || job.status === "cancelled" || job.watchdogFailed) return;
  mergeReferenceIds(job, message);
  if (isTerminalJob(job)) return retainTerminalConversation(deps, job, message);
  if (job.providerAcceptedAt && message.status === "opening_provider") return;
  const previousStatus = job.status;
  if (isPreSubmitFlowFailure(job, message)) {
    job.status = "failed_retryable";
    job.error = String(message.message || "Google Flow media selection failed before submit.");
    job.statusMessage = job.error;
    job.needsStrictFlowRecovery = true;
    job.progress = undefined;
    job.submissionState = "pre_submit_failed";
  } else {
    job.status = message.status; job.statusMessage = message.message; job.progress = message.progress;
    if (message.status === "submitting" && !job.providerAcceptedAt) job.submissionState = "executor_submitting";
  }
  if (deps.isSavedConversationUrl(message.providerConversationUrl)) job.providerConversationUrl = message.providerConversationUrl;
  if (typeof message.providerWorkspaceUrl === "string") job.providerWorkspaceUrl = message.providerWorkspaceUrl;
  markProviderAccepted(deps, job, message);
  job.updatedAt = deps.now();
  deps.logEvent("job_status_transition", { jobId: job.id, projectId: job.projectId, shotId: job.shotId, from: previousStatus, to: job.status, progress: job.progress, providerWorkspaceUrl: job.providerWorkspaceUrl });
  publish(deps);
}

function acknowledge(deps, message) {
  const job = deps.getState().jobs.find((item) => item.id === message.jobId);
  if (!job || !["pending", "opening_provider"].includes(job.status)) return;
  job.bridgeAcknowledgedAt = deps.now(); job.bridgeSessionId = String(message.sessionId || "");
  if (!job.providerAcceptedAt) job.submissionState = "bridge_acknowledged";
  if (job.providerAcceptedAt) return deps.saveState();
  job.status = "opening_provider"; job.statusMessage = "Browser extension acknowledged the job envelope; waiting for provider dispatch..."; job.progress = Math.max(Number(job.progress || 0), 0.1); job.updatedAt = deps.now();
  deps.logEvent("job_bridge_acknowledged", { jobId: job.id, projectId: job.projectId, sessionId: job.bridgeSessionId });
  publish(deps);
}

function createJobStatusRuntime(deps) {
  return { update: (message) => update(deps, message), acknowledge: (message) => acknowledge(deps, message) };
}

module.exports = { createJobStatusRuntime };
