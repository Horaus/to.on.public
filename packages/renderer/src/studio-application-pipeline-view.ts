import type { PipelineStepId, PipelineReadiness } from "@studio/domain/pipeline-gates";
import type { VideoPreflightValidation } from "@studio/domain/preflight-contract";
import type { AutomationJob, Asset, Project, Scene, Shot, VisualReference } from "@studio/types";
import { deriveStudioPipelineMetrics } from "./studio-pipeline-metrics";
import { derivePipelinePresentation } from "./studio-pipeline-presentation";
import { isManualContractFailure } from "./studio-pipeline";

export type ApplicationPipelineViewInput = {
  project: Project; projectScenes: Scene[]; projectShots: Shot[]; projectAssets: Asset[];
  projectReferences: VisualReference[]; lockedProjectReferences: VisualReference[]; jobs: AutomationJob[];
  plannedSceneCount: number; plannedShotCount: number; pipelineReadiness: PipelineReadiness;
  nextPipelineStep: () => PipelineStepId; isProjectJobBusy: (job: AutomationJob) => boolean;
  jobNeedsUserAction: (job: AutomationJob) => boolean; jobNeedsCurrentUserAction: (job: AutomationJob, jobs: readonly AutomationJob[]) => boolean; shotHasVisibleVideo: (shotId?: string) => boolean;
  shotHasVisibleKeyframe: (shotId?: string) => boolean; videoPreflightForShot: (shot: Shot) => VideoPreflightValidation;
  jobBlocksCurrentAutomation: (job: AutomationJob, step: PipelineStepId) => boolean;
  classifyTextRetry: (job?: AutomationJob) => { recoverLateTextFirst: boolean };
  preflightIssueSummary: (validation: VideoPreflightValidation) => string;
  pipelineRun: { mode?: string; running?: boolean; message?: string; currentStep?: PipelineStepId } | null;
  pipelineStepLabel: (step: PipelineStepId) => string; sequenceQaMessage?: string;
};

export function deriveApplicationPipelineView(input: ApplicationPipelineViewInput) {
  const pipelineStep = input.nextPipelineStep();
  const metrics = deriveStudioPipelineMetrics({
    project: input.project, projectScenes: input.projectScenes, projectShots: input.projectShots,
    projectAssets: input.projectAssets, projectReferences: input.projectReferences,
    lockedProjectReferences: input.lockedProjectReferences, jobs: input.jobs,
    plannedSceneCount: input.plannedSceneCount, plannedShotCount: input.plannedShotCount,
    pipelineStep, isProjectJobBusy: input.isProjectJobBusy, jobNeedsUserAction: input.jobNeedsUserAction, jobNeedsCurrentUserAction: input.jobNeedsCurrentUserAction,
    shotHasVisibleVideo: input.shotHasVisibleVideo, shotHasVisibleKeyframe: input.shotHasVisibleKeyframe,
    videoPreflightForShot: input.videoPreflightForShot
  });
  // Retry actions must target the newest failure for the current pipeline
  // step. Persistence order is not causal order; index zero can be an old
  // foundation failure while shot breakdown is the actual blocked stage.
  const projectBlockedJobs = metrics.projectJobs
    .filter((job) => input.jobBlocksCurrentAutomation(job, pipelineStep))
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt));
  const projectResolvedFailureJobIds = metrics.projectJobs.filter((job) => input.jobNeedsUserAction(job) && !input.jobNeedsCurrentUserAction(job, metrics.projectJobs)).map((job) => job.id);
  const projectBlockedRetryAttempt = Math.max(0, ...input.jobs.filter((job) => projectBlockedJobs.some((blocked) => blocked.id === job.id)).map((job) => Number((job.input as { retryAttempt?: number } | undefined)?.retryAttempt || 0)));
  const projectRetryLimitReached = projectBlockedRetryAttempt >= 3;
  const projectCanRecoverLateText = input.classifyTextRetry(projectBlockedJobs[0]).recoverLateTextFirst;
  const projectRetryableJobs = metrics.projectJobs.filter((job) => job.status === "failed_retryable" && !isManualContractFailure(job) && input.jobNeedsCurrentUserAction(job, metrics.projectJobs) && !(job.jobType === "video" && input.shotHasVisibleVideo(job.shotId)));
  const pipelineComplete = pipelineStep === "review";
  const presentation = derivePipelinePresentation({
    project: input.project, projectShots: input.projectShots, pipelineStep, pipelineRun: input.pipelineRun,
    projectBusyJobs: metrics.projectBusyJobs, projectBlockedJobs, projectPreflightBlocks: metrics.projectPreflightBlocks,
    projectRepairablePreflights: metrics.projectRepairablePreflights, projectRetryableJobs,
    videoReadyCount: metrics.videoReadyCount, keyframeReadyCount: metrics.keyframeReadyCount,
    projectBlockedRetryAttempt, projectCanRecoverLateText, projectRetryLimitReached,
    pipelineStarted: metrics.pipelineStarted, pipelineComplete, pipelineStepLabel: input.pipelineStepLabel,
    preflightIssueSummary: input.preflightIssueSummary, sequenceQaMessage: input.sequenceQaMessage
  });
  return { pipelineStep, pipelineComplete, projectBlockedJobs, projectResolvedFailureJobIds, projectBlockedRetryAttempt, projectRetryLimitReached, projectCanRecoverLateText, projectRetryableJobs, ...metrics, ...presentation };
}
