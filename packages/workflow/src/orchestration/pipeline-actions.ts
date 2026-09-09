import { getWorkflowBridge } from "../workflow-bridge";
import type { Asset, AutomationJob, BrowserProviderAdapter, ProductionGraphCustomNode, Project, ProjectIntake, ReferenceRole, Scene, Shot, StoryCharacter, StudioState, VisualReference } from "@studio/types";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { shotKeyframeAssets, shotVideoAssets } from "@studio/workflow/media-asset-selectors";
import { flowFailureAllowsFreshSubmit, nextRenderableVideoShot, shotHasUnresolvedVideoIssue as videoIssueBlocksQueue } from "./video-queue";

type PipelineReadiness = { hasBrief: boolean; foundationReady: boolean; architectureReady: boolean; screenplayReady: boolean; shotBreakdownReady: boolean; promptsReady: boolean; characterReady: boolean; keyframesReady: boolean; videosReady: boolean };
type PipelineStepId = "setup" | "foundation" | "architecture" | "screenplay" | "shots" | "character" | "prompts" | "storyboard" | "video" | "review";
type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";
type DraftUpload = { file: File; dataUrl: string };
type PipelineRunState = { mode: "step" | "full"; running: boolean; currentStep?: PipelineStepId; message: string; startedAt: string };
type BridgeStatus = { connectedExtensions: number; expectedVersion: string; versions: string[]; updateRequired: boolean; identifying: boolean };
type PipelineBlockFacts = {
  step: PipelineStepId; supersededByNewerAttempt: boolean; supersededByLaterSuccess: boolean;
  outputReferenceExists: boolean; quickVisualAnalysisNeeded: boolean; structuredArtifactReady: boolean;
  allCharacterReferencesReady: boolean; keyframeExists: boolean; videoExists: boolean;
  flowTabRecovered: boolean; deferredFlowFailure: boolean; alternateVideoShotReady: boolean;
  freshFlowSubmitAllowed: boolean; screenplayBudgetRepaired: boolean;
};
type PipelineUtilities = {
  characterReferenceExistsForJob: (job: AutomationJob, references: VisualReference[]) => boolean;
  jobBlocksCurrentPipeline: (job: AutomationJob | undefined, facts: PipelineBlockFacts) => boolean;
  jobBridgeMessage: (job: AutomationJob | undefined) => { task?: string; settings?: { idempotencyKey?: string } } | undefined;
  jobPipelineStep: (job: AutomationJob) => PipelineStepId | undefined;
  jobWasSupersededByLaterSuccess: (job: AutomationJob, jobs: AutomationJob[]) => boolean;
  jobWasSupersededByNewerAttempt: (job: AutomationJob, jobs: AutomationJob[]) => boolean;
  nextPipelineStepFromReadiness: (readiness: PipelineReadiness) => PipelineStepId;
  pipelineStepLabel: (step: PipelineStepId) => string;
  pipelineStepRequiresExtension: (step: PipelineStepId) => boolean;
  pipelineStepView: (step: PipelineStepId) => StudioView;
  structuredTaskArtifactReady: (task: string | undefined, readiness: Pick<PipelineReadiness, "foundationReady" | "architectureReady" | "screenplayReady" | "shotBreakdownReady">) => boolean;
  isProjectJobBusy: (job: AutomationJob) => boolean;
};
type PipelineActionDependencies = {
  activeView: StudioView; allRequiredCharacterReferencesReady: boolean; applyStoryboardPrompts: () => void; bridgeCount: number; bridgeStatus: BridgeStatus; characterReadyForPipeline: boolean;
  completeDemoAssetsForStep: (step: "storyboard" | "video") => void; completeDemoCharacterReferences: () => void; developNextScreenplayScene: () => void; developShots: () => void; developStory: () => void;
  flowProjectTabReady: boolean; generateProductionGraphImage: (node: ProductionGraphCustomNode) => Promise<void>; goTo: (view: StudioView, options?: { auto?: boolean }) => void; intake: ProjectIntake; intakeRef: RefObject<ProjectIntake | null>;
  keyframesReadyForPipeline: boolean; lastPipelineFocusRef: RefObject<string>; needsQuickVisualAnalysis: (intake?: ProjectIntake) => boolean; nextCharacterReferenceTask?: { kind: "primary"; storyCharacter: StoryCharacter; slot: string; role: "main_character" | "supporting_character"; primaryReference?: undefined } | { kind: "detail"; storyCharacter: StoryCharacter; slot: string; role: ReferenceRole; primaryReference: VisualReference };
  nextMissingVisualRequirementNode?: ProductionGraphCustomNode; pendingAutoVideoShotRef: RefObject<string | null>; pipelineAutoFollowRef: RefObject<boolean>; pipelineReadiness: PipelineReadiness;
  project: Project; projectAssets: Asset[]; projectReferences: VisualReference[]; projectScenes: Scene[]; projectShots: Shot[]; promptsReadyForPipeline: boolean;
  queueCharacterImageDraft: (reference?: VisualReference, overrideRequest?: string, overrideSlot?: string, overrideName?: string, overrideReferenceUse?: VisualReference["referenceUse"], overrideRole?: VisualReference["role"], directReferenceUse?: VisualReference["referenceUse"]) => void;
  queueProviderJob: (provider: BrowserProviderAdapter, targetShot?: Shot, options?: { preflightOnly?: boolean; revisionInstruction?: string; startFrameAssetId?: string; outputLanguage?: string; videoQuality?: "fast" | "quality"; generateAudio?: boolean }) => void;
  queueQuickVisualAnalysisJob: (intake?: ProjectIntake) => boolean; queueVideoJob: (shot?: Shot) => boolean; quickReferenceUpload: DraftUpload | null; runMissingShotKeyframeQueue: () => void; selectedProvider: BrowserProviderAdapter;
  setAutoQueueVideoShotId: Dispatch<SetStateAction<string | undefined>>; setPipelineRun: Dispatch<SetStateAction<PipelineRunState | null>>; stageQuickVisualInputForProject: () => Promise<boolean>; state: StudioState; stateRef: MutableRefObject<StudioState>;
  screenplayReady: boolean; shotBreakdownReady: boolean; storyArchitectureReady: boolean; storyFoundationReady: boolean; updateProjectPatch: (patch: Partial<Project>) => void;
} & PipelineUtilities;
type PipelineBoundActions = {
  nextPipelineStep: () => PipelineStepId;
  shotHasVisibleVideo: (shotId?: string) => boolean;
  shotHasVisibleKeyframe: (shotId?: string) => boolean;
  isDeferredFlowProviderFailure: (job?: AutomationJob) => boolean;
  jobBlocksCurrentAutomation: (job?: AutomationJob, step?: PipelineStepId) => boolean;
  focusPipelineStep: (step: PipelineStepId, reason?: string) => void;
  runPipelineStep: (mode?: "step" | "full") => Promise<void>;
  runWorkflowTemplate: () => void;
  runBatchQueue: () => void;
  runVideoBatchQueue: () => void;
  shotHasUnresolvedVideoIssue: (shotId: string, jobs: AutomationJob[]) => boolean;
  nextMissingVideoShot: () => Shot | undefined;
  queueNextReadyVideoIfPossible: () => boolean;
  queueNextReadyVideoWithHumanDelay: (sourceState: StudioState, reason: string) => boolean;
};
type PipelineRuntime = PipelineActionDependencies & PipelineBoundActions;

function nextPipelineStep(runtime: PipelineRuntime): PipelineStepId {
  return runtime.nextPipelineStepFromReadiness(runtime.pipelineReadiness);
}

function flowTabRecovered(job: AutomationJob | undefined, flowProjectTabReady: boolean) {
  return Boolean(job?.jobType === "video" && flowProjectTabReady && /Failed to open provider tab: Open one signed-in Google Flow project tab/i.test(job.error || job.statusMessage || ""));
}

function alternateVideoShotReady(runtime: PipelineRuntime, job: AutomationJob | undefined) {
  return Boolean(job?.jobType === "video" && runtime.projectShots.some((shot) => shot.id !== job.shotId && runtime.shotHasVisibleKeyframe(shot.id) && !runtime.shotHasVisibleVideo(shot.id) && !runtime.shotHasUnresolvedVideoIssue(shot.id, runtime.state.jobs)));
}

function pipelineBlockFacts(runtime: PipelineRuntime, job: AutomationJob | undefined, step: PipelineStepId): PipelineBlockFacts {
  const { state, projectReferences, needsQuickVisualAnalysis, storyFoundationReady, storyArchitectureReady, screenplayReady, shotBreakdownReady, allRequiredCharacterReferencesReady, flowProjectTabReady } = runtime;
  // Supersession is project-local. Avoid scanning the entire durable ledger
  // (which can contain thousands of historical jobs from other projects) for
  // every pipeline render and blocker check.
  const scopedJobs = job ? state.jobs.filter((item) => item.projectId === job.projectId) : [];
  const task = runtime.jobBridgeMessage(job)?.task;
  const screenplayBudgetRepaired = Boolean(job && task === "screenplay_scene" && /SCREENPLAY_RUNTIME_OVERFLOW\b/i.test(`${job.error || ""} ${job.statusMessage || ""}`) && (() => {
    const originalDuration = Number(`${job.error || job.statusMessage || ""}`.match(/the\s+(\d+(?:\.\d+)?)s provider budget/i)?.[1] || 0);
    const currentDuration = Number(runtime.project.intake?.targetDurationSec || 0);
    return originalDuration > 0 && currentDuration > originalDuration;
  })());
  return {
    step, supersededByNewerAttempt: Boolean(job && runtime.jobWasSupersededByNewerAttempt(job, scopedJobs)), supersededByLaterSuccess: Boolean(job && runtime.jobWasSupersededByLaterSuccess(job, scopedJobs)), outputReferenceExists: Boolean(job && runtime.characterReferenceExistsForJob(job, projectReferences)), quickVisualAnalysisNeeded: needsQuickVisualAnalysis(),
    structuredArtifactReady: runtime.structuredTaskArtifactReady(task, { foundationReady: storyFoundationReady, architectureReady: storyArchitectureReady, screenplayReady, shotBreakdownReady }), allCharacterReferencesReady: allRequiredCharacterReferencesReady,
    keyframeExists: runtime.shotHasVisibleKeyframe(job?.shotId), videoExists: runtime.shotHasVisibleVideo(job?.shotId), flowTabRecovered: flowTabRecovered(job, flowProjectTabReady), deferredFlowFailure: runtime.isDeferredFlowProviderFailure(job),
    freshFlowSubmitAllowed: Boolean(job && flowFailureAllowsFreshSubmit(job, flowProjectTabReady)), screenplayBudgetRepaired,
    alternateVideoShotReady: alternateVideoShotReady(runtime, job)
  };
}

function jobBlocksCurrentAutomation(runtime: PipelineRuntime, job: AutomationJob | undefined, step = runtime.nextPipelineStep()) {
  return runtime.jobBlocksCurrentPipeline(job, pipelineBlockFacts(runtime, job, step));
}

function setStopped(runtime: PipelineRuntime, mode: "step" | "full", step: PipelineStepId, message: string) {
  runtime.setPipelineRun({ mode, running: false, currentStep: step, message, startedAt: new Date().toISOString() });
}

function sequenceBlockerMessage(project: Project, step: PipelineStepId) {
  if (step !== "shots" || project.storyDocument?.sequenceQA?.status !== "BLOCKED") return "";
  const findings = project.storyDocument.sequenceQA.findings.filter((finding) => finding.severity === "blocking");
  if (!findings.length || findings.some((finding) => finding.responsibleStage === "shot_compiler" && finding.shotIds?.length)) return "";
  return `Dừng: Sequence QA xác định lỗi upstream (${findings.map((finding) => finding.code).join(", ")}); cần tạo lại architecture/screenplay, không thể retry shot hiện tại.`;
}

function projectJobs(runtime: PipelineRuntime) {
  return runtime.state.jobs.filter((job) => job.projectId === runtime.project.id);
}

async function preparePipelineExecution(runtime: PipelineRuntime, mode: "step" | "full", step: PipelineStepId) {
const { project, setPipelineRun, pipelineAutoFollowRef, goTo, intakeRef, intake, quickReferenceUpload, stageQuickVisualInputForProject } = runtime;
  const sequenceBlocker = sequenceBlockerMessage(project, step);
  if (sequenceBlocker) { setStopped(runtime, mode, step, sequenceBlocker); return; }
  const scopedJobs = projectJobs(runtime);
  const blocked = scopedJobs.filter((job) => runtime.jobBlocksCurrentAutomation(job, step));
  if (blocked.length) { setStopped(runtime, mode, step, `Dừng: ${blocked.length} job cần xử lý trong Thông báo.`); if (pipelineAutoFollowRef.current) goTo("generate", { auto: true }); return; }
  const busy = scopedJobs.filter(runtime.isProjectJobBusy);
  if (busy.length) { const runningStep = busy.map(runtime.jobPipelineStep).find(Boolean) ?? step; runtime.focusPipelineStep(runningStep, "busy"); setPipelineRun({ mode, running: true, currentStep: runningStep, message: `Đang chờ ${busy.length} job hoàn tất.`, startedAt: new Date().toISOString() }); return; }
  let activeIntake = intakeRef.current ?? intake;
  if (quickReferenceUpload && !activeIntake.quickVisualInput?.analysisText?.trim()) {
    const staged = await stageQuickVisualInputForProject();
    activeIntake = intakeRef.current ?? activeIntake;
    if (staged) setPipelineRun({ mode, running: mode === "full", currentStep: step, message: "Đã lưu ảnh gợi ý làm input định hướng. Ảnh này không bị khóa vào library.", startedAt: new Date().toISOString() });
  }
  return activeIntake;
}

function runCharacterStage(runtime: PipelineRuntime, mode: "step" | "full", step: PipelineStepId) {
  const task = runtime.nextCharacterReferenceTask;
  if (!getWorkflowBridge()) return runtime.completeDemoCharacterReferences();
  if (runtime.nextMissingVisualRequirementNode) return void runtime.generateProductionGraphImage(runtime.nextMissingVisualRequirementNode);
  if (task?.kind === "detail" && task.primaryReference) {
    runtime.queueCharacterImageDraft(task.primaryReference, "Generate the required character detail sheet from the locked identity. Include close face detail, hands and material detail, outfit construction, expressions, body proportions, side and back views, palette, and continuity notes. Do not redesign the character.", task.slot, task.storyCharacter.name, "supporting_detail", task.role, "supporting_detail");
    return;
  }
  setStopped(runtime, mode, step, "Đã khóa đủ identity, detail, bối cảnh và props bắt buộc.");
}

function dispatchStoryStage(runtime: PipelineRuntime, mode: "step" | "full", step: PipelineStepId, activeIntake: ProjectIntake) {
  if (step === "setup") return setStopped(runtime, mode, step, "Cần nhập brief/ý tưởng trước khi tự động chạy.");
  if ((step === "foundation" || step === "architecture") && runtime.needsQuickVisualAnalysis(activeIntake)) {
    if (!runtime.queueQuickVisualAnalysisJob(activeIntake)) return setStopped(runtime, mode, step, "Dừng: ảnh gợi ý cần được ChatGPT phân tích trước khi tạo kịch bản. Không dùng fallback nội bộ.");
    runtime.setPipelineRun({ mode, running: mode === "full", currentStep: step, message: "Đang phân tích ảnh gợi ý trước khi tạo kịch bản và nhân vật.", startedAt: new Date().toISOString() }); return;
  }
  if (step === "foundation" || step === "architecture") return runtime.developStory();
  if (step === "shots") return runtime.developShots();
  if (step === "screenplay") return runtime.developNextScreenplayScene();
}

function dispatchMediaStage(runtime: PipelineRuntime, mode: "step" | "full", step: PipelineStepId) {
  if (step === "character") return runCharacterStage(runtime, mode, step);
  if (step === "prompts") { runtime.applyStoryboardPrompts(); if (mode === "step") setStopped(runtime, mode, step, "Đã dựng prompt cho storyboard."); return; }
  if (step === "storyboard") { if (!getWorkflowBridge()) return runtime.completeDemoAssetsForStep("storyboard"); if (mode === "full" && runtime.queueNextReadyVideoIfPossible()) return; return runtime.runMissingShotKeyframeQueue(); }
  if (step === "video") { if (!getWorkflowBridge()) return runtime.completeDemoAssetsForStep("video"); return runtime.runVideoBatchQueue(); }
}

function dispatchPipelineStage(runtime: PipelineRuntime, mode: "step" | "full", step: PipelineStepId, activeIntake: ProjectIntake) {
  if (getWorkflowBridge() && Number(runtime.bridgeStatus?.connectedExtensions || 0) === 0 && runtime.pipelineStepRequiresExtension(step)) return setStopped(runtime, mode, step, "Dừng: chưa kết nối browser extension. Mở Chrome debug/extension rồi chạy lại.");
  if (["setup", "foundation", "architecture", "shots", "screenplay"].includes(step)) return dispatchStoryStage(runtime, mode, step, activeIntake);
  if (["character", "prompts", "storyboard", "video"].includes(step)) return dispatchMediaStage(runtime, mode, step);
  if (runtime.pipelineAutoFollowRef.current) runtime.goTo("review", { auto: true });
  if (runtime.intake.yoloEnabled) runtime.updateProjectPatch({ intake: { ...runtime.intake, yoloEnabled: false } });
  setStopped(runtime, mode, step, "Pipeline đã đủ dữ liệu để kiểm duyệt sequence.");
}

async function runPipelineStep(runtime: PipelineRuntime, mode: "step" | "full" = "step") {
  if (runtime.activeView === "overview" && document.activeElement?.closest(".overview-yolo-panel button")) runtime.pipelineAutoFollowRef.current = true;
  const step = runtime.nextPipelineStep();
  const activeIntake = await preparePipelineExecution(runtime, mode, step);
  if (!activeIntake) return;
  if (runtime.activeView === "overview" && mode === "step") {
    runtime.pipelineAutoFollowRef.current = true;
    runtime.goTo(runtime.pipelineStepView(step), { auto: true });
  }
  runtime.focusPipelineStep(step, "run");
  runtime.setPipelineRun({ mode, running: mode === "full" && step !== "review", currentStep: step, message: `Đang chạy: ${runtime.pipelineStepLabel(step)}.`, startedAt: new Date().toISOString() });
  dispatchPipelineStage(runtime, mode, step, activeIntake);
}

function shotHasVisibleVideo(runtime: PipelineRuntime, shotId?: string) {
  const { projectShots, projectAssets, state } = runtime;
    if (!shotId) return false;
    const targetShot = projectShots.find((shot) => shot.id === shotId);
    return Boolean(targetShot && shotVideoAssets(projectAssets, targetShot, state.jobs).length > 0);
  }

function shotHasVisibleKeyframe(runtime: PipelineRuntime, shotId?: string) {
  const { projectShots, projectAssets, state } = runtime;
    if (!shotId) return false;
    const targetShot = projectShots.find((shot) => shot.id === shotId);
    return Boolean(targetShot && shotKeyframeAssets(projectAssets, targetShot, state.jobs).length > 0);
  }

function matchingDeferredFlowAttempt(runtime: PipelineRuntime, job: AutomationJob, candidate: AutomationJob, idempotencyKey: string | undefined) {
  const candidateKey = candidate.idempotencyKey ?? runtime.jobBridgeMessage(candidate)?.settings?.idempotencyKey;
  return [candidate.id !== job.id, candidate.projectId === job.projectId, candidate.providerId === "google-flow-web",
    candidate.jobType === "video", candidate.shotId === job.shotId, candidate.status === "failed_retryable", candidateKey === idempotencyKey].every(Boolean);
}

function isDeferredFlowProviderFailure(runtime: PipelineRuntime, job: AutomationJob | undefined) {
  const { state } = runtime;
    if (!job || job.providerId !== "google-flow-web" || job.jobType !== "video" || job.status !== "failed_retryable") return false;
    const message = job.error || job.statusMessage || "";
    if (/Google Flow generation failed after preflight and provider authorization|Google Flow SDK failed after authorization|\bVideo generation failed\b/i.test(message)) return true;
    if (!/No recoverable Google Flow video was found/i.test(message) || !job.shotId) return false;
    const idempotencyKey = job.idempotencyKey || runtime.jobBridgeMessage(job)?.settings?.idempotencyKey;
    return state.jobs.some((candidate) => matchingDeferredFlowAttempt(runtime, job, candidate, idempotencyKey));
  }

function focusPipelineStep(runtime: PipelineRuntime, step: PipelineStepId, reason = "manual") {
  const { activeView, goTo, lastPipelineFocusRef, pipelineAutoFollowRef, project } = runtime;
    if (!pipelineAutoFollowRef.current) return;
    const view = runtime.pipelineStepView(step);
    if (view === activeView) return;
    const focusKey = `${reason}:${project.id}:${step}:${view}`;
    lastPipelineFocusRef.current = focusKey;
    goTo(view, { auto: true });
  }

function runWorkflowTemplate(runtime: PipelineRuntime) {
  const { queueProviderJob, state } = runtime;
    const projectHasActiveJob = state.jobs.some((job) => job.projectId === runtime.project.id && runtime.isProjectJobBusy(job));
    if (projectHasActiveJob) {
      runtime.setPipelineRun({ mode: "step", running: false, currentStep: "video", message: "Đang có tác vụ của project chạy; hãy chờ hoặc hủy tác vụ trước khi chạy mẫu." , startedAt: new Date().toISOString() });
      return;
    }
    if (runtime.bridgeCount <= 0 || !runtime.flowProjectTabReady) {
      runtime.setPipelineRun({ mode: "step", running: false, currentStep: "video", message: "Chưa chạy mẫu: cần kết nối extension và một workspace Flow hợp lệ trước." , startedAt: new Date().toISOString() });
      return;
    }
    const chatProvider = state.providers.find((provider) => provider.id === "chatgpt-web");
    const flowProvider = state.providers.find((provider) => provider.id === "google-flow-web");
    if (chatProvider) queueProviderJob(chatProvider);
    if (flowProvider) window.setTimeout(() => queueProviderJob(flowProvider), 1300);
  }

function runBatchQueue(runtime: PipelineRuntime) {
  const { bridgeCount, projectAssets, projectShots, queueProviderJob, selectedProvider, state } = runtime;
    const projectHasActiveJob = state.jobs.some((job) => job.projectId === runtime.project.id && runtime.isProjectJobBusy(job));
    if (projectHasActiveJob) {
      runtime.setPipelineRun({ mode: "step", running: false, currentStep: "video", message: "Đang có tác vụ của project chạy; hãy chờ hoặc hủy tác vụ trước khi xếp hàng loạt.", startedAt: new Date().toISOString() });
      return;
    }
    if (bridgeCount <= 0 || !runtime.flowProjectTabReady) {
      runtime.setPipelineRun({ mode: "step", running: false, currentStep: "video", message: "Chưa xếp hàng: cần kết nối extension và một workspace Flow hợp lệ trước.", startedAt: new Date().toISOString() });
      return;
    }
    const batchable = projectShots.filter((shot) => {
      const hasVideo = shotVideoAssets(projectAssets, shot, state.jobs).length > 0;
      const hasKeyframe = shotKeyframeAssets(projectAssets, shot, state.jobs).length > 0;
      return !hasVideo && (hasKeyframe || shot.status === "draft" || shot.status === "failed");
    });
    batchable.slice(0, 12).forEach((shot, index) => {
      const provider = state.providers.find((item) => item.id === shot.providerId) ?? selectedProvider;
      const delayMs = bridgeCount > 0 ? index * 6500 + Math.round(Math.random() * 4500) : index * 50;
      window.setTimeout(() => queueProviderJob(provider, shot), delayMs);
    });
  }

function runVideoBatchQueue(runtime: PipelineRuntime) {
  const { characterReadyForPipeline, keyframesReadyForPipeline, projectAssets, projectShots, promptsReadyForPipeline, queueVideoJob, setPipelineRun, state } = runtime;
    if (!keyframesReadyForPipeline) {
      setPipelineRun({
        mode: "step",
        running: false,
        currentStep: promptsReadyForPipeline ? "storyboard" : characterReadyForPipeline ? "prompts" : "character",
        message: "Dừng: chưa hoàn tất đầy đủ kịch bản, nhận diện, prompt và keyframe nên chưa được queue video.",
        startedAt: new Date().toISOString()
      });
      return;
    }
    const batchable = projectShots.filter((shot) => {
      const hasVideo = shotVideoAssets(projectAssets, shot, state.jobs).length > 0;
      const hasKeyframe = shotKeyframeAssets(projectAssets, shot, state.jobs).length > 0;
      return !hasVideo && hasKeyframe && !runtime.shotHasUnresolvedVideoIssue(shot.id, state.jobs);
    });
    const nextShot = batchable[0];
    if (!nextShot) return;
    if (!queueVideoJob(nextShot)) return;
  }

function shotHasUnresolvedVideoIssue(runtime: PipelineRuntime, shotId: string, jobs: AutomationJob[]) {
  const { flowProjectTabReady } = runtime;
    return videoIssueBlocksQueue(shotId, jobs, flowProjectTabReady);
  }

function nextMissingVideoShot(runtime: PipelineRuntime) {
  const { flowProjectTabReady, project, projectAssets, projectScenes, projectShots, state } = runtime;
    return nextRenderableVideoShot({
      projectId: project.id,
      scenes: projectScenes,
      shots: projectShots,
      assets: projectAssets,
      jobs: state.jobs,
      flowProjectTabReady
    });
  }

function queueNextReadyVideoIfPossible(runtime: PipelineRuntime) {
  const { keyframesReadyForPipeline, project, queueVideoJob, state } = runtime;
    if (!getWorkflowBridge()) return false;
    if (!keyframesReadyForPipeline) return false;
    const activeVideoJob = state.jobs.some((job) => job.projectId === project.id && job.jobType === "video" && runtime.isProjectJobBusy(job));
    if (activeVideoJob) return false;
    const nextShot = runtime.nextMissingVideoShot();
    if (!nextShot) return false;
    return queueVideoJob(nextShot);
  }

function orderedProjectShots(sourceState: StudioState, projectId: string) {
  const sceneIds = new Set(sourceState.scenes.filter((scene) => scene.projectId === projectId).map((scene) => scene.id));
  const sceneOrder = new Map(sourceState.scenes.map((scene) => [scene.id, scene.order]));
  return sourceState.shots
    .filter((shot) => sceneIds.has(shot.sceneId))
    .sort((left, right) => (sceneOrder.get(left.sceneId) ?? 0) - (sceneOrder.get(right.sceneId) ?? 0) || left.order - right.order);
}

function nextVideoCandidate(runtime: PipelineRuntime, sourceState: StudioState, projectId: string) {
  return orderedProjectShots(sourceState, projectId).find((shot) => {
    const hasVideo = shotVideoAssets(sourceState.assets, shot, sourceState.jobs).length > 0;
    const hasKeyframe = shotKeyframeAssets(sourceState.assets, shot, sourceState.jobs).length > 0;
    return hasKeyframe && !hasVideo && !runtime.shotHasUnresolvedVideoIssue(shot.id, sourceState.jobs);
  });
}

function delayedVideoCandidate(runtime: PipelineRuntime, shotId: string) {
  const { project, stateRef } = runtime;
  const latestState = stateRef.current;
  const latestProject = latestState.projects.find((item) => item.id === project.id);
  const latestSceneIds = new Set(latestState.scenes.filter((item) => item.projectId === project.id).map((item) => item.id));
  const latestShot = latestState.shots.find((shot) => shot.id === shotId && latestSceneIds.has(shot.sceneId));
  if (!latestProject || !latestShot) return undefined;
  const activeVideo = latestState.jobs.some((job) => job.projectId === project.id && job.jobType === "video" && runtime.isProjectJobBusy(job));
  const hasVideo = shotVideoAssets(latestState.assets, latestShot, latestState.jobs).length > 0;
  const hasKeyframe = shotKeyframeAssets(latestState.assets, latestShot, latestState.jobs).length > 0;
  return !activeVideo && !hasVideo && hasKeyframe ? latestShot : undefined;
}

function queueNextReadyVideoWithHumanDelay(runtime: PipelineRuntime, sourceState: StudioState, reason: string) {
  const { keyframesReadyForPipeline, pendingAutoVideoShotRef, project, setAutoQueueVideoShotId, setPipelineRun } = runtime;
    if (!getWorkflowBridge()) return false;
    if (!keyframesReadyForPipeline) return false;
    const activeProject = sourceState.projects.find((item) => item.id === project.id);
    if (!activeProject) return false;
    // A pending storyboard queue can survive a renderer reload or a failed
    // provider attempt. It must not turn a manual/retry run back into an
    // automatic video dispatch after the user has disabled YOLO or cancelled
    // the project. Only an explicit persisted YOLO intent may schedule the
    // delayed next-shot handoff.
    if (activeProject.intake?.yoloEnabled !== true) return false;
    const activeVideoJob = sourceState.jobs.some((job) => job.projectId === activeProject.id && job.jobType === "video" && runtime.isProjectJobBusy(job));
    if (activeVideoJob) return false;
    const nextShot = nextVideoCandidate(runtime, sourceState, activeProject.id);
    if (!nextShot || pendingAutoVideoShotRef.current === nextShot.id) return false;
    pendingAutoVideoShotRef.current = nextShot.id;
    const delayMs = Math.round(8000 + Math.random() * 10000);
    setPipelineRun((current) => current?.running
      ? { ...current, currentStep: "video", message: `${reason}: đợi ${Math.round(delayMs / 1000)}s rồi gửi Flow cho SH${nextShot.order}.` }
      : current);
    window.setTimeout(() => {
      pendingAutoVideoShotRef.current = null;
      const latestShot = delayedVideoCandidate(runtime, nextShot.id);
      if (!latestShot) return;
      // Queue through the canonical path on the next render. This keeps manual,
      // YOLO, retry, preflight, and prompt-compaction behavior identical.
      setAutoQueueVideoShotId(latestShot.id);
    }, delayMs);
    return true;
  }

export function createPipelineActions(deps: PipelineActionDependencies) {
  const runtime = { ...deps } as PipelineRuntime;
  Object.assign(runtime, {
    nextPipelineStep: () => nextPipelineStep(runtime),
    shotHasVisibleVideo: (shotId?: string) => shotHasVisibleVideo(runtime, shotId),
    shotHasVisibleKeyframe: (shotId?: string) => shotHasVisibleKeyframe(runtime, shotId),
    isDeferredFlowProviderFailure: (job: AutomationJob | undefined) => isDeferredFlowProviderFailure(runtime, job),
    jobBlocksCurrentAutomation: (job: AutomationJob | undefined, step?: PipelineStepId) => jobBlocksCurrentAutomation(runtime, job, step),
    focusPipelineStep: (step: PipelineStepId, reason = "manual") => focusPipelineStep(runtime, step, reason),
    runPipelineStep: (mode: "step" | "full" = "step") => runPipelineStep(runtime, mode),
    runWorkflowTemplate: () => runWorkflowTemplate(runtime),
    runBatchQueue: () => runBatchQueue(runtime),
    runVideoBatchQueue: () => runVideoBatchQueue(runtime),
    shotHasUnresolvedVideoIssue: (shotId: string, jobs: AutomationJob[]) => shotHasUnresolvedVideoIssue(runtime, shotId, jobs),
    nextMissingVideoShot: () => nextMissingVideoShot(runtime),
    queueNextReadyVideoIfPossible: () => queueNextReadyVideoIfPossible(runtime),
    queueNextReadyVideoWithHumanDelay: (sourceState: StudioState, reason: string) => queueNextReadyVideoWithHumanDelay(runtime, sourceState, reason)
  });
  return { focusPipelineStep: runtime.focusPipelineStep, isDeferredFlowProviderFailure: runtime.isDeferredFlowProviderFailure, jobBlocksCurrentAutomation: runtime.jobBlocksCurrentAutomation, nextMissingVideoShot: runtime.nextMissingVideoShot, nextPipelineStep: runtime.nextPipelineStep, queueNextReadyVideoIfPossible: runtime.queueNextReadyVideoIfPossible, queueNextReadyVideoWithHumanDelay: runtime.queueNextReadyVideoWithHumanDelay, runBatchQueue: runtime.runBatchQueue, runPipelineStep: runtime.runPipelineStep, runVideoBatchQueue: runtime.runVideoBatchQueue, runWorkflowTemplate: runtime.runWorkflowTemplate, shotHasUnresolvedVideoIssue: runtime.shotHasUnresolvedVideoIssue, shotHasVisibleKeyframe: runtime.shotHasVisibleKeyframe, shotHasVisibleVideo: runtime.shotHasVisibleVideo };
}
