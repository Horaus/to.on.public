type RetryJob = {
  id: string;
  projectId?: string;
  shotId?: string;
  providerId?: string;
  jobType?: string;
  status?: string;
  error?: string;
  statusMessage?: string;
  providerConversationUrl?: string;
  recoveryAttempts?: number;
  flowRecoveryAttemptedAt?: string;
  input?: unknown;
};

export const STRUCTURED_TEXT_TASKS = new Set(["story_foundation", "story_architecture", "screenplay_scene", "shot_breakdown"]);

const FRESH_TEXT_FAILURE = /schema echo|provider_output_degenerated|prompt_not_submitted|cannot import|rewrites locked|saved (?:structured|story) response is (?:still )?invalid|dispatch did not advance|recovery timed out|no valid saved chatgpt conversation|previous (?:desktop )?session ended/i;
const LATE_TEXT_FAILURE = /timeout waiting|became inactive|complete structured json/i;
const CORRECTABLE_IMPORT_FAILURE = /cannot import|rewrites locked|did not contain a complete JSON object|Source analysis requires|Narrative contract requires|Creative intent requires|Video knowledge profile requires|Story foundation requires|Allowed speaker .* missing from characters|Required character .* missing from creative dynamics|Creative dynamics references unknown character|SCREENPLAY_(?:SPEECH|RUNTIME|DEPENDENCY|UNOWNED|OWNER|NON_ATOMIC)|CAUSAL_BEAT_ORDER_INVALID|MULTIPLE_(?:VISIBLE_TRANSFORMATIONS|CAMERA_SETUPS)|NON_ATOMIC_SHOT|leaves screenplay cues uncovered|requires(?: exactly)? .*provider-feasible shots|received .*provider-feasible shots|requires shots/i;
const DETERMINISTIC_IMPORT_FAILURE = /SCREENPLAY_RUNTIME_OVERFLOW\b/i;
const FLOW_RECOVERY_SIGNAL = /timeout waiting|completed|checking|result media|warning|recovering|generated|no recoverable|previous desktop session ended|previous .*session ended/i;
const FLOW_FRESH_SUBMIT_SIGNAL = /could not be attached|not attached|no new generation tile|submit click returned|rejected/i;
const FLOW_STRICT_RECOVERY_MISS = /no recoverable google flow video|strict recovery could not (?:tie|find)|recovery could not tie a completed video/i;

function bridgeMessage(job: RetryJob | undefined) {
  const input = job?.input as { bridgeMessage?: { task?: string } } | undefined;
  return input?.bridgeMessage;
}

export function retryFailureDetail(job: RetryJob | undefined) {
  return `${job?.error || ""} ${job?.statusMessage || ""}`.trim();
}

export function canRecoverLateChatGptText(job: RetryJob | undefined) {
  if (!job || job.jobType !== "text" || Number(job.recoveryAttempts || 0) >= 1) return false;
  return typeof job.providerConversationUrl === "string" &&
    job.providerConversationUrl.startsWith("https://chatgpt.com/") &&
    LATE_TEXT_FAILURE.test(retryFailureDetail(job));
}

export function isCorrectableStructuredImportFailure(job: RetryJob | undefined) {
  const task = bridgeMessage(job)?.task;
  return Boolean(job?.status === "failed_retryable" && task && STRUCTURED_TEXT_TASKS.has(task) &&
    CORRECTABLE_IMPORT_FAILURE.test(retryFailureDetail(job)) &&
    !DETERMINISTIC_IMPORT_FAILURE.test(retryFailureDetail(job)));
}

export function isDeterministicStructuredImportFailure(job: RetryJob | undefined) {
  return DETERMINISTIC_IMPORT_FAILURE.test(retryFailureDetail(job));
}

export function classifyTextRetry(job: RetryJob | undefined) {
  const detail = retryFailureDetail(job);
  const recoverLateTextFirst = canRecoverLateChatGptText(job);
  const requiresFreshTextRequest = LATE_TEXT_FAILURE.test(detail) || FRESH_TEXT_FAILURE.test(detail);
  const validConversation = typeof job?.providerConversationUrl === "string" &&
    /^https:\/\/chatgpt\.com\/c\/(?!WEB:)[^/]+\/?$/i.test(job.providerConversationUrl);
  const canRecoverSavedChat = Boolean(
    job?.jobType === "text" &&
    (recoverLateTextFirst || !requiresFreshTextRequest) &&
    Number(job.recoveryAttempts || 0) < 1 &&
    validConversation
  );
  return { detail, recoverLateTextFirst, requiresFreshTextRequest, canRecoverSavedChat };
}

export function findActiveFlowJobForShot(job: RetryJob, jobs: RetryJob[]) {
  return jobs.find((candidate) =>
    candidate.id !== job.id &&
    candidate.providerId === "google-flow-web" &&
    candidate.jobType === "video" &&
    candidate.shotId === job.shotId &&
    ["pending", "opening_provider", "submitting", "generating", "downloading"].includes(candidate.status || "")
  );
}

export function shouldRecoverFlowOnly(job: RetryJob & { flowRecoveryAttempts?: number }) {
  const detail = retryFailureDetail(job).toLowerCase();
  const strictRecoveryAlreadyMissed = Number(job.flowRecoveryAttempts || 0) > 0 && FLOW_STRICT_RECOVERY_MISS.test(detail);
  return FLOW_RECOVERY_SIGNAL.test(detail) && !strictRecoveryAlreadyMissed && !FLOW_FRESH_SUBMIT_SIGNAL.test(detail);
}

export function shouldReuseSavedStructuredArtifact(job: RetryJob | undefined) {
  return !/PROVIDER_OUTPUT_DEGENERATED/i.test(retryFailureDetail(job));
}

export type RetryRecoveryPlan =
  | { kind: "continue-after-existing-video" }
  | { kind: "recover-chatgpt"; late: boolean }
  | { kind: "recover-active-flow"; job: RetryJob }
  | { kind: "wait-active-flow"; job: RetryJob }
  | { kind: "recover-current-flow" }
  | { kind: "create-fresh-attempt" };

function planFlowRecovery(job: RetryJob, jobs: RetryJob[]): RetryRecoveryPlan {
  const isFlowVideo = job.jobType === "video" && job.providerId === "google-flow-web";
  if (!isFlowVideo) return { kind: "create-fresh-attempt" };
  const activeJob = findActiveFlowJobForShot(job, jobs);
  if (activeJob) {
    const activeDetail = retryFailureDetail(activeJob);
    const recoveryInProgress = activeJob.status === "downloading" &&
      (Boolean(activeJob.flowRecoveryAttemptedAt) || /recover(?:ing|y|ed)|strict current-job/i.test(activeDetail));
    return recoveryInProgress ? { kind: "wait-active-flow", job: activeJob } : { kind: "recover-active-flow", job: activeJob };
  }
  return shouldRecoverFlowOnly(job) ? { kind: "recover-current-flow" } : { kind: "create-fresh-attempt" };
}

export function planRetryRecovery(job: RetryJob, jobs: RetryJob[], hasVisibleVideo: boolean): RetryRecoveryPlan {
  if (job.jobType === "video" && hasVisibleVideo) return { kind: "continue-after-existing-video" };
  const textDecision = classifyTextRetry(job);
  if (textDecision.canRecoverSavedChat) return { kind: "recover-chatgpt", late: textDecision.recoverLateTextFirst };
  return planFlowRecovery(job, jobs);
}
