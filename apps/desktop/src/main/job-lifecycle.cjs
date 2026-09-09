const IMPORT_TASK_POLICIES = Object.freeze({
  story_foundation: {
    handler: "storyFoundation",
    successMessage: "Source analysis, adaptation decisions, narrative contract and beats imported. Scene architecture remains a separate gate.",
    failureMessage: "Could not import the narrative foundation response."
  },
  story_architecture: {
    handler: "storyArchitecture",
    successMessage: "Scene architecture and visual requirements imported from the locked narrative foundation. Per-scene screenplay remains separate.",
    failurePrefix: "Cannot import story architecture: "
  },
  screenplay_scene: {
    handler: "screenplayScene",
    successMessage: (job) => `Locked screenplay cues imported for scene ${job.input?.bridgeMessage?.settings?.screenplaySceneId}.`,
    failurePrefix: "Cannot import scene screenplay: "
  },
  shot_breakdown: {
    handler: "shotBreakdown",
    successMessage: "Locked screenplay cues were mapped into provider-neutral shots without rewriting story or dialogue.",
    failurePrefix: "Cannot import shot breakdown: "
  },
  story_development: {
    handler: "storyDevelopment",
    successMessage: "Story, scene breakdown, scenes, and shots imported from the selected AI.",
    failurePrefix: "Cannot import story response: "
  },
  quick_visual_analysis: {
    handler: "quickVisualAnalysis",
    successMessage: "Quick visual input analyzed and saved into project intake.",
    failurePrefix: "Cannot import quick visual analysis: "
  },
  translation: {
    handler: "translation",
    successMessage: "Script, scene, shot, and dialogue language updated.",
    failurePrefix: "Cannot import translation response: "
  }
});

const DIRECT_TEXT_TASK_POLICIES = Object.freeze({
  production_graph_revision: {
    successMessage: "Production graph revision received from the routed text provider.",
    failureMessage: "Text provider returned no production graph revision."
  },
  connection_test: {
    successMessage: "UTF-8 text received directly from ChatGPT.",
    failureMessage: "ChatGPT returned no direct text output."
  }
});

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

// Contract validation failures are deterministic for the current payload.
// Marking them retryable invites the UI/YOLO recovery path to submit the same
// invalid scene again, which can never improve the result and may create a
// retry loop. Provider/runtime failures remain retryable as before.
function isDeterministicImportFailure(detail) {
  return /SCREENPLAY_RUNTIME_OVERFLOW\b/.test(String(detail || ""));
}

function retryRootId(job) {
  return job?.input?.retryOfJobId || job?.retryOfJobId || job?.id;
}

function supersedeRetriedSourceJob(jobs, completedJob, timestamp) {
  const sourceJobId = retryRootId(completedJob);
  const hasMediaResult = (completedJob?.resultAssetIds || []).length > 0;
  const hasTextResult = completedJob?.jobType === "text" && Boolean(String(completedJob?.outputText || "").trim());
  if (!sourceJobId || sourceJobId === completedJob?.id || (!hasMediaResult && !hasTextResult)) return false;
  const sourceJob = (jobs || []).find((item) =>
    item.id === sourceJobId &&
    item.projectId === completedJob.projectId &&
    item.status === "failed_retryable"
  );
  if (!sourceJob) return false;
  sourceJob.supersededFromStatus = sourceJob.status;
  sourceJob.supersededError = sourceJob.error;
  sourceJob.status = "cancelled";
  sourceJob.statusMessage = "Superseded by a successful retry result.";
  sourceJob.progress = undefined;
  sourceJob.supersededByJobId = completedJob.id;
  sourceJob.updatedAt = timestamp;
  return true;
}

function normalizeCompletedAssetJob(job, timestamp, statusMessage) {
  job.status = "review_required";
  job.error = undefined;
  job.watchdogFailed = false;
  job.needsStrictFlowRecovery = false;
  job.statusMessage = statusMessage;
  job.progress = 1;
  job.updatedAt = timestamp;
}

function completeStructuredTextJob({ job, message, handlers, timestamp }) {
  const task = job?.input?.bridgeMessage?.task;
  const directPolicy = DIRECT_TEXT_TASK_POLICIES[task];
  if (directPolicy) {
    const text = message?.output?.text || message?.assets?.[0]?.metadata?.text;
    if (typeof text === "string" && text.trim()) {
      job.status = "approved";
      job.error = undefined;
      job.outputText = text.trim();
      job.statusMessage = directPolicy.successMessage;
      job.progress = 1;
    } else {
      job.status = "failed_retryable";
      job.error = directPolicy.failureMessage;
      job.statusMessage = directPolicy.failureMessage;
      job.progress = undefined;
    }
    job.updatedAt = timestamp;
    return true;
  }

  const importPolicy = IMPORT_TASK_POLICIES[task];
  if (!importPolicy) return false;
  try {
    const handler = handlers?.[importPolicy.handler];
    if (typeof handler !== "function") throw new Error(`Missing structured result handler: ${importPolicy.handler}`);
    handler(job, message);
    job.status = "approved";
    job.error = undefined;
    job.statusMessage = typeof importPolicy.successMessage === "function"
      ? importPolicy.successMessage(job)
      : importPolicy.successMessage;
    job.progress = 1;
  } catch (error) {
    const detail = errorText(error);
    job.status = isDeterministicImportFailure(detail) ? "failed_manual" : "failed_retryable";
    job.error = importPolicy.failurePrefix ? `${importPolicy.failurePrefix}${detail}` : detail;
    job.statusMessage = importPolicy.failureMessage || job.error;
    job.progress = undefined;
  }
  job.updatedAt = timestamp;
  return true;
}

module.exports = {
  completeStructuredTextJob,
  normalizeCompletedAssetJob,
  retryRootId,
  supersedeRetriedSourceJob
};
