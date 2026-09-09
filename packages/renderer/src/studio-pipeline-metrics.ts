import type { Asset, AutomationJob, Project, Shot } from "@studio/types";
import type { VideoPreflightValidation } from "@studio/domain/preflight-contract";

type JobPredicate = (job: AutomationJob) => boolean;
type ShotPredicate = (shotId: string) => boolean;
type ShotPreflight = (shot: Shot) => VideoPreflightValidation;

export function deriveStudioPipelineMetrics(input: {
  project: Project;
  projectScenes: readonly { id: string }[];
  projectShots: readonly Shot[];
  projectAssets: readonly Asset[];
  projectReferences: readonly unknown[];
  lockedProjectReferences: readonly unknown[];
  jobs: readonly AutomationJob[];
  plannedSceneCount: number;
  plannedShotCount: number;
  pipelineStep: string;
  isProjectJobBusy: JobPredicate;
  jobNeedsUserAction: JobPredicate;
  jobNeedsCurrentUserAction: (job: AutomationJob, jobs: readonly AutomationJob[]) => boolean;
  shotHasVisibleVideo: ShotPredicate;
  shotHasVisibleKeyframe: ShotPredicate;
  videoPreflightForShot: ShotPreflight;
}) {
  const { project, projectScenes, projectShots, projectAssets, projectReferences, lockedProjectReferences, jobs } = input;
  const planned = projectScenes.length >= input.plannedSceneCount && projectShots.length >= input.plannedShotCount;
  const prompted = projectShots.some((shot) => Boolean(shot.prompt));
  const generated = projectAssets.length > 0;
  const approved = projectShots.some((shot) => shot.status === "approved");
  // Navigation marks represent durable production gates, not merely the
  // existence of downstream rows. Keep each mark tied to the artifact the
  // corresponding screen actually presents.
  const storyReady = Boolean(project.storyDocument?.story?.trim());
  const referencesReady = lockedProjectReferences.length > 0;
  const keyframesReady = projectShots.length > 0 && projectShots.every((shot) => input.shotHasVisibleKeyframe(shot.id));
  const projectJobs = jobs.filter((job) => job.projectId === project.id);
  const activeJobs = projectJobs.filter((job) => ["queued", "running", "awaiting_user", "recoverable"].includes(job.status));
  const actionNeededJobs = projectJobs.filter((job) => input.jobNeedsCurrentUserAction(job, projectJobs));
  const projectBusyJobs = projectJobs.filter(input.isProjectJobBusy);
  const projectPreflightIssues = input.pipelineStep === "video"
    ? projectShots
      .filter((shot) => !input.shotHasVisibleVideo(shot.id) && input.shotHasVisibleKeyframe(shot.id))
      .map((shot) => ({ shot, validation: input.videoPreflightForShot(shot) }))
      .filter(({ validation }) => !validation.valid)
    : [];
  const projectRepairablePreflights = projectPreflightIssues.filter(({ validation }) =>
    validation.issues.filter((issue) => issue.severity === "error").every((issue) => issue.code === "FLOW_PROMPT_LIMIT_EXCEEDED")
  );
  const projectPreflightBlocks = projectPreflightIssues.filter((candidate) => !projectRepairablePreflights.includes(candidate));
  const videoReadyCount = projectShots.filter((shot) => input.shotHasVisibleVideo(shot.id)).length;
  const keyframeReadyCount = projectShots.filter((shot) => input.shotHasVisibleKeyframe(shot.id)).length;
  return {
    planned,
    prompted,
    generated,
    approved,
    scenePlanSource: projectScenes.every((item) => item.id.startsWith("scene_plan_")) ? "Local draft template" : "AI scene package",
    phaseStatus: [storyReady, referencesReady, keyframesReady, generated, approved],
    projectJobs,
    activeJobs,
    actionNeededJobs,
    approvedShotCount: projectShots.filter((shot) => shot.status === "approved").length,
    recentProjectJobs: [...projectJobs].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 4),
    readyMediaAssetCount: projectAssets.filter((asset) => Boolean(asset.filePath && !asset.filePath.startsWith("data:"))).length,
    sourceReadyCount: projectAssets.filter((asset) => Boolean(asset.filePath && !asset.filePath.startsWith("data:"))).length + lockedProjectReferences.length,
    projectBusyJobs,
    projectPreflightIssues,
    projectRepairablePreflights,
    projectPreflightBlocks,
    videoReadyCount,
    keyframeReadyCount,
    pipelineStarted: planned || projectReferences.length > 0 || projectShots.some((shot) => Boolean(shot.prompt) || shot.assetIds.length > 0) || projectAssets.length > 0 || projectJobs.length > 0
  };
}
