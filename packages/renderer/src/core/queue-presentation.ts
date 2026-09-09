import type { AutomationJob } from "@studio/types";
import { isActiveJob, isCurrentWorkStatus, jobNeedsUserAction } from "./job-status.ts";
const isFailureOrAction = (job: AutomationJob) => job.status.startsWith("failed") || jobNeedsUserAction(job);
const jobKey = (job: AutomationJob) => `${job.jobType}:${job.shotId || job.id}`;
const newestFirst = (a: AutomationJob, b: AutomationJob) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
const isCompletedStatus = (status: string) => ["done", "review_required", "approved"].includes(status);
const dedupeByJobKey = (job: AutomationJob, index: number, list: AutomationJob[]) =>
  list.findIndex((candidate) => jobKey(candidate) === jobKey(job)) === index;

function deriveCurrentAlerts(
  jobs: AutomationJob[],
  isCurrentWork: (job: AutomationJob) => boolean,
  isResolved: (job: AutomationJob) => boolean
) {
  const activeKeys = new Set(jobs.filter(isCurrentWork).map(jobKey));
  return jobs
    .filter((job) => !isCurrentWork(job) && !isResolved(job) && isFailureOrAction(job))
    .sort(newestFirst)
    .filter((job, index, list) => !activeKeys.has(jobKey(job)) && dedupeByJobKey(job, index, list));
}

function completedTargetCount(jobs: AutomationJob[]) {
  return new Set(
    jobs
      .filter((job) => isCompletedStatus(job.status))
      .map((job) => [job.jobType, job.shotId || job.id, job.resultAssetIds.join(",") || job.id].join(":"))
  ).size;
}

export type QueueSummary = {
  visibleJobs: AutomationJob[];
  historyJobs: AutomationJob[];
  orderedJobs: AutomationJob[];
  activeCount: number;
  failedCount: number;
  completedCount: number;
  isCurrentWork: (job: AutomationJob) => boolean;
  isResolved: (job: AutomationJob) => boolean;
};

/** Derive current attention items without deleting the durable job ledger. */
export function deriveQueueSummary(jobs: AutomationJob[], resolvedVideoShotIds: string[] = [], resolvedJobIds: string[] = []): QueueSummary {
  const resolvedVideoShots = new Set(resolvedVideoShotIds);
  const resolvedJobs = new Set(resolvedJobIds);
  const isCurrentWork = (job: AutomationJob) => isActiveJob(job) || isCurrentWorkStatus(job.status);
  const isResolved = (job: AutomationJob) => resolvedJobs.has(job.id) || (job.jobType === "video" && isFailureOrAction(job) && Boolean(job.shotId && resolvedVideoShots.has(job.shotId)));
  const orderedJobs = [...jobs].sort((a, b) => Number(isActiveJob(b)) - Number(isActiveJob(a)) || newestFirst(a, b));
  const activeJobs = jobs.filter(isActiveJob);
  const currentWork = jobs.filter(isCurrentWork);
  const currentAlerts = deriveCurrentAlerts(jobs, isCurrentWork, isResolved);
  const visibleJobs = [...currentWork, ...currentAlerts].sort((a, b) => Number(isCurrentWork(b)) - Number(isCurrentWork(a)) || newestFirst(a, b));
  const visibleIds = new Set(visibleJobs.map((job) => job.id));
  const historyJobs = orderedJobs.filter((job) => !visibleIds.has(job.id));
  return { visibleJobs, historyJobs, orderedJobs, activeCount: activeJobs.length, failedCount: currentAlerts.length, completedCount: completedTargetCount(jobs), isCurrentWork, isResolved };
}
