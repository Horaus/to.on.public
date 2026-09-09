import type { PipelineReadiness, PipelineStepId } from "@studio/domain/pipeline-gates";
import { nextPipelineStep, structuredTaskArtifactReady } from "@studio/domain/pipeline-gates";
import type { AutomationJob, VisualReference } from "@studio/types";
import { isQuickSetupReference } from "@studio/renderer-core/reference-classification";
import { jobBlocksAutomation, jobNeedsUserAction } from "@studio/renderer-core/job-status";
import { isDeterministicStructuredImportFailure } from "@studio/workflow/studio-retry-policy";
export { isActiveJob } from "@studio/renderer-core/job-status";
export { productionTaskPresentation, taskStageLabel, taskStatusLabel } from "./core/task-presentation";

export { flowProjectTabIsReady } from "./studio-application-composition";

type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";

type PipelineJobPayload = { bridgeMessage?: { task?: string; settings?: Record<string, any> }; retryOfJobId?: string; retryAttempt?: number };
const jobRetryAttempt = (job: AutomationJob | undefined) => Math.max(0, Number((job?.input as PipelineJobPayload | undefined)?.retryAttempt || 0));

export type { PipelineReadiness } from "@studio/domain/pipeline-gates";

export type PipelineStepItem = { id: PipelineStepId; label: string; view: StudioView; ready: boolean };

export type PipelineBlockFacts = {
  step: PipelineStepId;
  supersededByNewerAttempt: boolean;
  supersededByLaterSuccess: boolean;
  outputReferenceExists: boolean;
  quickVisualAnalysisNeeded: boolean;
  structuredArtifactReady: boolean;
  allCharacterReferencesReady: boolean;
  keyframeExists: boolean;
  videoExists: boolean;
  flowTabRecovered: boolean;
  deferredFlowFailure: boolean;
  alternateVideoShotReady: boolean;
  freshFlowSubmitAllowed: boolean;
  screenplayBudgetRepaired?: boolean;
};

export function jobBridgeMessage(job: AutomationJob | undefined) {
  return (job?.input as PipelineJobPayload | undefined)?.bridgeMessage;
}

export function characterReferenceExistsForJob(job: AutomationJob, projectReferences: VisualReference[]) {
  const message = jobBridgeMessage(job);
  const settings = message?.settings;
  if (!settings || !isCharacterReferenceJob(job, message?.task, settings)) return false;
  const directUse = settings.directReferenceUse as VisualReference["referenceUse"];
  const referenceUse = (directUse || settings.referenceUse || "primary_identity") as VisualReference["referenceUse"];
  const characterSlot = String(settings.characterSlot || "");
  const role = (settings.referenceRole || "main_character") as VisualReference["role"];
  return projectReferences.some((reference) => referenceMatches(reference, characterSlot, referenceUse, role));
}

function isCharacterReferenceJob(job: AutomationJob, task: string | undefined, settings: Record<string, any> | undefined) {
  return job.jobType === "image" && task === "text_to_image" && Boolean(settings?.directReferenceUse && settings.characterSlot);
}

function referenceMatches(reference: VisualReference, characterSlot: string, referenceUse: VisualReference["referenceUse"], role: VisualReference["role"]) {
  return reference.characterSlot === characterSlot && reference.referenceUse === referenceUse && reference.role === role && !isQuickSetupReference(reference);
}

export function jobTargetKey(job: AutomationJob) {
  const message = jobBridgeMessage(job);
  const settings = (message?.settings ?? {}) as Record<string, unknown>;
  const task = message?.task || job.jobType;
  const textTarget = textJobTarget(job.jobType, task, settings);
  if (textTarget) return textTarget;
  return imageOrVideoTarget(job, task, settings) || [task, job.shotId || "", job.providerId].join(":");
}

function imageOrVideoTarget(job: AutomationJob, task: string, settings: Record<string, unknown>) {
  const isStoryboardImageJob = job.jobType === "image" && task === "text_to_image" && Boolean(settings.storyboardMode);
  if (job.jobType === "image" && task === "text_to_image") return isStoryboardImageJob ? ["storyboard", job.shotId || "", settings.sessionKey || ""].join(":") : characterJobTarget(settings);
  return job.jobType === "video" ? ["video", job.shotId || ""].join(":") : "";
}

function textJobTarget(jobType: string, task: string, settings: Record<string, unknown>) {
  if (jobType !== "text") return "";
  if (task === "quick_visual_analysis") return "intake:quick-visual-analysis";
  if (task === "story_development") return "story:development";
  if (task === "screenplay_scene") return ["screenplay-scene", settings.screenplaySceneId || settings.sessionKey || ""].join(":");
  if (task === "shot_breakdown") return ["shot-breakdown", settings.screenplaySceneId || "", settings.shotBatchIndex || settings.sessionKey || ""].join(":");
  return "";
}

function characterJobTarget(settings: Record<string, unknown>) {
  return ["character", settings.characterSlot || "", settings.directReferenceUse || settings.referenceUse || "primary_identity", settings.referenceRole || "main_character", settings.characterName || ""].join(":");
}

export function retryAttemptsForTarget(job: AutomationJob | undefined, jobs: AutomationJob[]) {
  if (!job) return 0;
  const targetKey = jobTargetKey(job);
  return Math.max(
    0,
    ...jobs
      .filter((item) => item.projectId === job.projectId && jobTargetKey(item) === targetKey)
      .map(jobRetryAttempt)
  );
}

export function jobWasSupersededByLaterSuccess(job: AutomationJob, jobs: readonly AutomationJob[]) {
  const targetKey = jobTargetKey(job);
  const jobTime = new Date(job.updatedAt || job.createdAt).getTime();
  const jobPayload = job.input as PipelineJobPayload | undefined;
  const retryRootId = jobPayload?.retryOfJobId || job.id;
  return jobs.some((candidate) =>
    candidate.id !== job.id &&
    candidate.projectId === job.projectId &&
    jobTargetKey(candidate) === targetKey &&
    ["approved", "done", "review_required"].includes(candidate.status) &&
    (
      (candidate.input as PipelineJobPayload | undefined)?.retryOfJobId === retryRootId ||
      new Date(candidate.updatedAt || candidate.createdAt).getTime() >= jobTime
    )
  );
}

export function jobWasSupersededByNewerAttempt(job: AutomationJob, jobs: readonly AutomationJob[]) {
  const targetKey = jobTargetKey(job);
  const jobTime = new Date(job.updatedAt || job.createdAt).getTime();
  return jobs.some((candidate) =>
    candidate.id !== job.id &&
    candidate.projectId === job.projectId &&
    jobTargetKey(candidate) === targetKey &&
    new Date(candidate.updatedAt || candidate.createdAt).getTime() > jobTime
  );
}

/** Keep historical failures in the ledger without treating them as current blockers. */
export function jobNeedsCurrentUserAction(job: AutomationJob, jobs: readonly AutomationJob[]) {
  // A retry creates a new durable job while preserving the old one in the
  // ledger. Only the newest attempt may surface as a current blocker; older
  // retryable failures belong to history even when the replacement is still
  // running or waiting for provider recovery.
  return jobNeedsUserAction(job) && !jobWasSupersededByNewerAttempt(job, jobs) && !jobWasSupersededByLaterSuccess(job, jobs);
}

export function isManualContractFailure(job: AutomationJob | undefined) {
  return isDeterministicStructuredImportFailure(job);
}

export function pipelineStepLabel(step: PipelineStepId) {
  const labels: Record<PipelineStepId, string> = {
    setup: "Nhập brief tối thiểu",
    foundation: "Phát triển câu chuyện hoàn chỉnh",
    architecture: "Phân tách cảnh",
    screenplay: "Kịch bản theo cảnh",
    shots: "Phân rã shot",
    character: "Khoá nhận diện",
    prompts: "Chuẩn bị storyboard",
    storyboard: "Tạo keyframe",
    video: "Xếp hàng tạo video",
    review: "Kiểm tra sequence"
  };
  return labels[step];
}

/** Render skill pipeline metadata as user-facing labels, never internal ids. */
export function formatSkillPipelineStages(stages: readonly string[]) {
  const labels: Record<string, string> = {
    setup: "Nhập brief", story: "Câu chuyện", foundation: "Câu chuyện hoàn chỉnh",
    architecture: "Phân tách cảnh", scene: "Phân tách cảnh", screenplay: "Kịch bản",
    prompt: "Prompt storyboard", shots: "Phân rã shot", keyframe: "Khung hình",
    storyboard: "Khung hình", video: "Video", review: "Kiểm tra"
  };
  return stages.map((stage) => labels[stage] || "Bước sản xuất").join(" → ");
}

/** Keep catalogue names readable in the selected UI language while IDs stay stable. */
export function formatSkillName(name: string, id = "") {
  const key = `${id} ${name}`.trim().toLowerCase().replaceAll("_", " ");
  if (key.includes("short-drama-video") || key.includes("short drama")) return "Phim ngắn kịch tính";
  if (key.includes("creative layer") || key.includes("creative-layer")) return "Lớp sáng tạo";
  return name;
}

export function formatSkillCategory(category: string) {
  return ({ prompt: "Prompt", narrative: "Nội dung", production: "Sản xuất" } as Record<string, string>)[category] || category;
}

export function formatSkillEntitlement(entitlement: string) {
  return ({ free: "Miễn phí", paid: "Cần cấp phép", locked: "Đang khóa" } as Record<string, string>)[entitlement] || entitlement;
}

export function pipelineStepView(step: PipelineStepId): StudioView {
  const views: Record<PipelineStepId, StudioView> = {
    setup: "overview",
    foundation: "story",
    architecture: "story",
    screenplay: "story",
    shots: "storyboard",
    character: "assets",
    prompts: "storyboard",
    storyboard: "storyboard",
    video: "generate",
    review: "review"
  };
  return views[step];
}

export function jobPipelineStep(job: AutomationJob): PipelineStepId | undefined {
  const bridgeMessage = jobBridgeMessage(job);
  const task = bridgeMessage?.task;
  const isStoryboardImageJob = job.jobType === "image" && task === "text_to_image" && Boolean(bridgeMessage?.settings?.storyboardMode);
  const textStep = textJobPipelineStep(job.jobType, task, bridgeMessage?.settings?.sessionKey);
  if (textStep) return textStep;
  if (job.jobType === "image" && task === "text_to_image" && !isStoryboardImageJob) return "character";
  if (isStoryboardImageJob) return "storyboard";
  if (job.jobType === "video") return "video";
  return undefined;
}

function textJobPipelineStep(jobType: string, task?: string, sessionKey?: unknown): PipelineStepId | undefined {
  if (jobType !== "text") return;
  const fixed: Record<string, PipelineStepId> = { quick_visual_analysis: "setup", story_development: "foundation", story_foundation: "foundation", story_architecture: "architecture", screenplay_scene: "screenplay", shot_breakdown: "shots" };
  if (task && fixed[task]) return fixed[task];
  if (task === "production_graph_revision" && String(sessionKey || "").includes(":flow-prompt-compaction:")) return "video";
}

export function nextPipelineStepFromReadiness(readiness: PipelineReadiness): PipelineStepId {
  return nextPipelineStep(readiness);
}

export function pipelineStepItems(readiness: PipelineReadiness): PipelineStepItem[] {
  return [
    { id: "foundation", label: "Câu chuyện hoàn chỉnh", view: "story", ready: readiness.foundationReady },
    { id: "architecture", label: "Phân tách cảnh", view: "story", ready: readiness.architectureReady },
    { id: "screenplay", label: "Kịch bản từng cảnh", view: "story", ready: readiness.screenplayReady },
    { id: "shots", label: "Phân rã shot", view: "storyboard", ready: readiness.shotBreakdownReady },
    { id: "prompts", label: "Biên soạn chỉ dẫn", view: "storyboard", ready: readiness.promptsReady },
    { id: "character", label: "Nhận diện", view: "assets", ready: readiness.characterReady },
    { id: "storyboard", label: "Khung hình", view: "storyboard", ready: readiness.keyframesReady },
    { id: "video", label: "Video", view: "generate", ready: readiness.videosReady }
  ];
}

export function pipelineStepActionLabel(step: PipelineStepId) {
  if (step === "foundation") return "Tạo câu chuyện hoàn chỉnh";
  if (step === "architecture") return "Phân tách cảnh";
  if (step === "screenplay") return "Tạo kịch bản cảnh tiếp theo";
  if (step === "shots") return "Phân rã shot tiếp theo";
  return `Chạy bước ${pipelineStepLabel(step)}`;
}

export function pipelineStepRequiresExtension(step: PipelineStepId) {
  return ["foundation", "architecture", "screenplay", "shots", "character", "storyboard", "video"].includes(step);
}

export { structuredTaskArtifactReady } from "@studio/domain/pipeline-gates";

export function jobBlocksCurrentPipeline(job: AutomationJob | undefined, facts: PipelineBlockFacts) {
  if (!job || isPipelineBypassed(job, facts)) return false;
  return jobBlockDecision(job, facts);
}

function isPipelineBypassed(job: AutomationJob, facts: PipelineBlockFacts) {
  const message = jobBridgeMessage(job);
  return !jobBlocksAutomation(job) || facts.supersededByNewerAttempt || facts.supersededByLaterSuccess || facts.outputReferenceExists || message?.settings?.preflightOnly === true;
}

function jobBlockDecision(job: AutomationJob, facts: PipelineBlockFacts) {
  const task = jobBridgeMessage(job)?.task;
  const storyboardImage = job.jobType === "image" && task === "text_to_image" && Boolean(jobBridgeMessage(job)?.settings?.storyboardMode);
  const textBlock = textJobBlock(job, task, facts);
  if (textBlock !== undefined) return textBlock;
  const imageBlock = imageJobBlock(job, task, storyboardImage, facts);
  if (imageBlock !== undefined) return imageBlock;
  if (job.jobType === "video") return videoJobBlock(facts);
  return !(storyboardImage && facts.step !== "storyboard");
}

function textJobBlock(job: AutomationJob, task: string | undefined, facts: PipelineBlockFacts) {
  if (job.jobType !== "text") return undefined;
  if (task === "quick_visual_analysis") return facts.step === "foundation" && facts.quickVisualAnalysisNeeded;
  if (task === "screenplay_scene" && facts.screenplayBudgetRepaired) return false;
  return facts.structuredArtifactReady ? false : undefined;
}

function imageJobBlock(job: AutomationJob, task: string | undefined, storyboardImage: boolean, facts: PipelineBlockFacts) {
  if (job.jobType !== "image" || task !== "text_to_image") return undefined;
  if (!storyboardImage && facts.allCharacterReferencesReady) return false;
  if (storyboardImage && facts.keyframeExists) return false;
  return undefined;
}

function videoJobBlock(facts: PipelineBlockFacts) {
  if (facts.videoExists || facts.flowTabRecovered || facts.freshFlowSubmitAllowed) return false;
  if (facts.step === "video" && facts.deferredFlowFailure && facts.alternateVideoShotReady) return false;
  return true;
}
