const ACTIVE_JOB_STATUSES = new Set(["pending", "opening_provider", "submitting", "generating", "downloading"]);
const FLOW_PRE_SUBMIT_MEDIA_FAILURE = /Failed to open provider tab: Timed out waiting for (?:storyboard media|continuity reference \d+)|Studio Shot Bridge media selection failed/i;
const FLOW_CONCLUSIVE_RECOVERY_MISS = /No recoverable Google Flow video was found|strict recovery could not (?:tie|find)|recovery could not tie a completed video/i;
const UNRESOLVED_VIDEO_STATUSES = new Set(["failed_retryable", "failed_manual", "waiting_manual_action"]);
const COMPLETED_VIDEO_STATUSES = new Set(["approved", "done", "review_required"]);

function flowFailureAllowsFreshSubmit(job, flowProjectTabReady) {
  const detail = `${job.error || ""} ${job.statusMessage || ""}`;
  return Boolean(
    flowProjectTabReady &&
    job.providerId === "google-flow-web" &&
    job.jobType === "video" &&
    job.status === "failed_retryable" &&
    (FLOW_PRE_SUBMIT_MEDIA_FAILURE.test(detail) ||
      // A missing result is not a permanent blocker: the old tile may belong
      // to another account/project or may have been deleted. Once the current
      // project tab is ready, allow a fresh generation instead of trapping the
      // shot in recovery forever. Strict recovery still runs before this state.
      FLOW_CONCLUSIVE_RECOVERY_MISS.test(detail))
  );
}

function isLaterVideoSuccess(candidate, shotId, failedAt) {
  return candidate.shotId === shotId && candidate.jobType === "video" && COMPLETED_VIDEO_STATUSES.has(candidate.status) && new Date(candidate.updatedAt).getTime() >= failedAt;
}

function isRecoverableFlowOpenFailure(job, flowProjectTabReady) {
  const detail = `${job.error || ""} ${job.statusMessage || ""}`;
  return flowProjectTabReady && /Failed to open provider tab: Open one signed-in Google Flow project tab/i.test(detail);
}

function shotHasUnresolvedVideoIssue(shotId, jobs, flowProjectTabReady) {
  return jobs.some((job) =>
    job.shotId === shotId && job.jobType === "video" &&
    UNRESOLVED_VIDEO_STATUSES.has(job.status) &&
    !isRecoverableFlowOpenFailure(job, flowProjectTabReady) &&
    !flowFailureAllowsFreshSubmit(job, flowProjectTabReady) &&
    !jobs.some((candidate) => candidate.id !== job.id && isLaterVideoSuccess(candidate, shotId, new Date(job.updatedAt).getTime()))
  );
}

function nextRenderableVideoShot(input) {
  if (input.jobs.some((job) => job.projectId === input.projectId && job.jobType === "video" && ACTIVE_JOB_STATUSES.has(job.status))) return undefined;
  const sceneOrder = new Map(input.scenes.map((scene) => [scene.id, scene.order]));
  return [...input.shots]
    .sort((left, right) => (sceneOrder.get(left.sceneId) || 0) - (sceneOrder.get(right.sceneId) || 0) || left.order - right.order)
    .find((shot) => input.hasKeyframe(shot) && !input.hasVideo(shot) && !shotHasUnresolvedVideoIssue(shot.id, input.jobs, input.flowProjectTabReady));
}

module.exports = { flowFailureAllowsFreshSubmit, nextRenderableVideoShot, shotHasUnresolvedVideoIssue };
