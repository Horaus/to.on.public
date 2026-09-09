import type { AutomationJob } from "@studio/types";

const ACTIVE_JOB_STATUSES = new Set<AutomationJob["status"]>([
  "pending", "opening_provider", "submitting", "generating", "downloading"
]);

export function isActiveJob(job: AutomationJob) {
  return ACTIVE_JOB_STATUSES.has(job.status);
}

export function isProjectJobBusy(job: AutomationJob) {
  return isActiveJob(job) || isCurrentWorkStatus(job.status);
}

/** Statuses that still represent work owned by the current pipeline run.
 * Keep this list beside the active/action classifiers so every view derives
 * current work and history from the same contract.
 */
export function isCurrentWorkStatus(status: AutomationJob["status"] | string) {
  return ["queued", "running", "awaiting_user", "recoverable"].includes(status);
}

export function jobNeedsUserAction(job: AutomationJob | undefined) {
  return Boolean(job && ["waiting_login", "waiting_manual_action", "failed_manual", "failed_retryable"].includes(job.status));
}

export function jobBlocksAutomation(job: AutomationJob | undefined) {
  return jobNeedsUserAction(job);
}

export function latestActiveJobForShot(jobs: AutomationJob[], shotId: string | undefined, jobType?: AutomationJob["jobType"]) {
  if (!shotId) return undefined;
  return jobs.find((job) => job.shotId === shotId && (!jobType || job.jobType === jobType) && isActiveJob(job));
}
