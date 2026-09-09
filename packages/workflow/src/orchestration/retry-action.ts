import { getWorkflowBridge } from "../workflow-bridge";
import type { RunJobRequest } from "@studio/types/job-request";
import type { PipelineStepId } from "@studio/domain/pipeline-gates";
import { resolveProviderVideoDuration } from "@studio/domain/duration-policy";
import type { Asset, AutomationJob, Project, ProjectIntake, ProviderPlatform, Scene, Shot, SkillPack, StudioState, VisualReference } from "@studio/types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { shotKeyframeAssets } from "@studio/workflow/media-asset-selectors";
import { makeId } from "@studio/domain/identifiers";
import { buildCompactScreenplaySceneRetryPrompt, buildScreenplayScenePrompt } from "@studio/workflow/story-scene-prompts";
import { buildCompactStoryArchitectureRetryPrompt, buildCompactStoryFoundationRetryPrompt } from "@studio/workflow/story-foundation-prompts";
import { STRUCTURED_TEXT_TASKS, classifyTextRetry, isCorrectableStructuredImportFailure, planRetryRecovery, shouldReuseSavedStructuredArtifact } from "@studio/workflow/studio-retry-policy";
import type { PipelineRunState } from "@studio/workflow/support-core";
import { statusLabel } from "@studio/domain/labels";
import { preflightIssueSummary, validateVideoPreflight } from "@studio/workflow/video-preflight";

type SkillDoc = SkillPack;
type RunJobPayload = {
  jobId: string; projectId: string; shotId?: string; providerId: string; jobType: AutomationJob["jobType"];
  prompt: string; bridgeMessage: RunJobRequest; retryOfJobId?: string; retryAttempt?: number;
};

function jobBridgeMessage(job: AutomationJob | undefined) {
  return (job?.input as RunJobPayload | undefined)?.bridgeMessage;
}

function jobPipelineStep(job: AutomationJob): PipelineStepId | undefined {
  const message = jobBridgeMessage(job);
  const task = message?.task;
  const storyboard = job.jobType === "image" && task === "text_to_image" && Boolean(message?.settings?.storyboardMode);
  const textStep = retryTextPipelineStep(job.jobType, task, message?.settings?.sessionKey);
  if (textStep) return textStep;
  if (job.jobType === "image" && task === "text_to_image") return storyboard ? "storyboard" : "character";
  if (job.jobType === "video") return "video";
}

function retryTextPipelineStep(jobType: string, task?: string, sessionKey?: unknown): PipelineStepId | undefined {
  if (jobType !== "text") return undefined;
  const fixed: Partial<Record<string, PipelineStepId>> = { quick_visual_analysis: "setup", story_development: "foundation", story_foundation: "foundation", story_architecture: "architecture", screenplay_scene: "screenplay", shot_breakdown: "shots" };
  if (task && fixed[task]) return fixed[task];
  return task === "production_graph_revision" && String(sessionKey || "").includes(":flow-prompt-compaction:") ? "video" : undefined;
}

function retryTarget(job: AutomationJob) {
  const message = jobBridgeMessage(job);
  const settings = (message?.settings ?? {}) as Record<string, unknown>;
  const task = message?.task || job.jobType;
  if (job.jobType === "text") return textRetryTarget(task, settings);
  if (job.jobType === "image" && task === "text_to_image") return imageRetryTarget(settings, job.shotId);
  return [job.jobType, job.shotId || "", job.providerId].join(":");
}

function textRetryTarget(task: string, settings: Record<string, unknown>): string {
  return [task, settings.screenplaySceneId || "", settings.shotBatchIndex || settings.sessionKey || ""].join(":");
}

function imageRetryTarget(settings: Record<string, unknown>, shotId?: string): string {
  return [settings.storyboardMode ? "storyboard" : "character", shotId || "", settings.characterSlot || "", settings.directReferenceUse || settings.referenceUse || ""].join(":");
}

function retryAttemptsForTarget(job: AutomationJob, jobs: AutomationJob[]) {
  const target = retryTarget(job);
  return Math.max(0, ...jobs.filter((item) => item.projectId === job.projectId && retryTarget(item) === target).map((item) => Number((item.input as RunJobPayload | undefined)?.retryAttempt || 0)));
}

type RetryActionDependencies = {
  autoRetryingStructuredJobIdsRef: RefObject<Set<string>>; focusPipelineStep: (step: PipelineStepId, reason?: string) => void; generateProductionGraphImage: (node: NonNullable<Project["productionGraphCustomNodes"]>[number]) => Promise<void>;
  intake: ProjectIntake; intakeRef: RefObject<ProjectIntake | null>; nextPipelineStep: () => PipelineStepId; pipelineStep: PipelineStepId; productionLanguage: string; productionProjectReferences: VisualReference[];
  project: Project; projectAssets: Asset[]; projectJobs: AutomationJob[]; projectReferences: VisualReference[]; projectScenes: Scene[]; projectShots: Shot[];
  queueCharacterImageDraft: (reference?: VisualReference, overrideRequest?: string, overrideSlot?: string, overrideName?: string, overrideReferenceUse?: VisualReference["referenceUse"], overrideRole?: VisualReference["role"], directReferenceUse?: VisualReference["referenceUse"]) => void;
  recoverJob: (jobId: string) => void; referenceForRequirement: (requirementId: string) => VisualReference | undefined; replaceState: (state: StudioState) => void; routedVideoPlatform: ProviderPlatform;
  runDemoJob: (payload: RunJobPayload) => void; runPipelineStep: (mode?: "step" | "full") => Promise<void>; selectedCreativeSkill?: SkillDoc; selectedShot: Shot; selectedVideoSkill?: SkillDoc;
  setPipelineRun: Dispatch<SetStateAction<PipelineRunState | null>>; setSelectedShotId: Dispatch<SetStateAction<string>>; shotHasVisibleVideo: (shotId?: string) => boolean; skills: SkillDoc[]; state: StudioState; storySeed: string;
};

let runtime: RetryActionDependencies;

function showRetryProgress(step: PipelineStepId, message: string) {
  const { setPipelineRun } = runtime;
  setPipelineRun((current) => ({ mode: current?.mode ?? "full", running: true, currentStep: step, message, startedAt: current?.startedAt ?? new Date().toISOString() }));
}

function trySavedStructuredArtifact(job: AutomationJob, oldPayload: RunJobPayload, oldBridgeMessage: RunJobRequest, retryRootId: string) {
  const { autoRetryingStructuredJobIdsRef, focusPipelineStep, pipelineStep, project, projectJobs, replaceState, runPipelineStep } = runtime;
  if (!shouldReuseSavedStructuredArtifact(job) || !STRUCTURED_TEXT_TASKS.has(oldBridgeMessage.task)) return false;
  if (oldBridgeMessage.task === "screenplay_scene" && project.storyDocument?.screenplayScenes?.some((scene) => scene.id === oldBridgeMessage.settings?.screenplaySceneId)) return false;
  const savedJob = findSavedStructuredArtifact(projectJobs, retryRootId, oldBridgeMessage.task);
  if (!savedJob) return false;
  const step = jobPipelineStep(job) ?? pipelineStep;
  showRetryProgress(step, "Đang nhập lại kết quả có sẵn trước khi gọi provider lần nữa.");
  focusPipelineStep(step, "recover");
  recoverSavedStructuredArtifact(savedJob, job, { autoRetryingStructuredJobIdsRef, replaceState, runPipelineStep });
  return true;
}

function findSavedStructuredArtifact(projectJobs: AutomationJob[], retryRootId: string, task: string) {
  return projectJobs.filter((candidate) => {
    const payload = candidate.input as RunJobPayload | undefined;
    return (candidate.id === retryRootId || payload?.retryOfJobId === retryRootId) && payload?.bridgeMessage?.task === task && Boolean(candidate.outputText?.trim()) && !/^Saved (?:structured|story) response is (?:still )?invalid:/i.test(String(candidate.error || ""));
  }).sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0];
}

function recoverSavedStructuredArtifact(savedJob: AutomationJob, originalJob: AutomationJob, deps: Pick<RetryActionDependencies, "autoRetryingStructuredJobIdsRef" | "replaceState" | "runPipelineStep">) {
  getWorkflowBridge()?.recoverJob(savedJob.id).then((nextState) => {
    deps.replaceState(nextState);
    const recovered = nextState.jobs.find((candidate) => candidate.id === savedJob.id);
    deps.autoRetryingStructuredJobIdsRef.current.delete(savedJob.id);
    if (recovered?.status === "approved") window.setTimeout(() => void deps.runPipelineStep("full"), 0);
    else window.setTimeout(() => void retryAutomationJob(recovered ?? originalJob), 0);
  });
}

function recoveryStep(job: AutomationJob, fallback: PipelineStepId, preferred?: AutomationJob) {
  return (preferred && jobPipelineStep(preferred)) ?? jobPipelineStep(job) ?? fallback;
}

function continueAfterExistingVideo() {
  const { nextPipelineStep, runPipelineStep } = runtime;
  showRetryProgress(nextPipelineStep(), "Video hợp lệ đã có trên shot; bỏ qua lỗi cũ và tiếp tục YOLO.");
  window.setTimeout(() => void runPipelineStep("full"), 0);
  return true;
}

function recoverChatGptJob(job: AutomationJob, late: boolean) {
  const { focusPipelineStep, pipelineStep, recoverJob } = runtime;
  const step = recoveryStep(job, pipelineStep);
  showRetryProgress(step, `${late ? "Đang thu hồi kết quả ChatGPT đến muộn" : "Đang kiểm tra lại kết quả ChatGPT đã có"}: ${job.error || job.statusMessage || statusLabel(job.status)}`);
  focusPipelineStep(step, "recover");
  recoverJob(job.id);
  return true;
}

function recoverActiveFlowJob(job: AutomationJob, activeJob: AutomationJob) {
  const { focusPipelineStep, pipelineStep, recoverJob } = runtime;
  const step = recoveryStep(job, pipelineStep, activeJob);
  showRetryProgress(step, `Đang kiểm tra job Google Flow đang chạy cho shot này thay vì tạo job mới: ${activeJob.statusMessage || statusLabel(activeJob.status)}`);
  focusPipelineStep(step, "recover");
  recoverJob(activeJob.id);
  return true;
}

function waitForActiveFlowJob(job: AutomationJob, activeJob: AutomationJob) {
  const { focusPipelineStep, pipelineStep } = runtime;
  const step = recoveryStep(job, pipelineStep, activeJob);
  showRetryProgress(step, `Đang chờ recovery Flow hiện tại của shot này hoàn tất; không tạo thêm job song song (${activeJob.statusMessage || statusLabel(activeJob.status || "downloading")}).`);
  focusPipelineStep(step, "recover");
  return true;
}

function recoverCurrentFlowJob(job: AutomationJob) {
  const { focusPipelineStep, pipelineStep, recoverJob } = runtime;
  const step = recoveryStep(job, pipelineStep);
  showRetryProgress(step, `Đang kiểm tra video Google Flow đã gen trước khi tạo job mới: ${job.error || job.statusMessage || statusLabel(job.status)}`);
  focusPipelineStep(step, "recover");
  recoverJob(job.id);
  return true;
}

function tryPlannedRecovery(job: AutomationJob, linkedShotId: string | undefined) {
  const { projectJobs, shotHasVisibleVideo } = runtime;
  const plan = planRetryRecovery(job, projectJobs, job.jobType === "video" && shotHasVisibleVideo(linkedShotId));
  switch (plan.kind) {
    case "continue-after-existing-video": return continueAfterExistingVideo();
    case "recover-chatgpt": return recoverChatGptJob(job, plan.late);
    case "recover-active-flow": return recoverActiveFlowJob(job, plan.job as AutomationJob);
    case "wait-active-flow": return waitForActiveFlowJob(job, plan.job as AutomationJob);
    case "recover-current-flow": return recoverCurrentFlowJob(job);
    default: return false;
  }
}

function tryCharacterReferenceRetry(job: AutomationJob, oldSettings: RunJobRequest["settings"], nextAttempt: number) {
  const { focusPipelineStep, generateProductionGraphImage, project, projectReferences, queueCharacterImageDraft } = runtime;
  if (typeof oldSettings?.characterSlot !== "string") return false;
  const node = typeof oldSettings.referenceRequirementId === "string" ? (project.productionGraphCustomNodes ?? []).find((item) => item.referenceRequirementId === oldSettings.referenceRequirementId) : undefined;
  if (node) {
    showRetryProgress("character", `Đang retry visual requirement bằng cấu hình hiện tại: ${node.title}`);
    focusPipelineStep("character", "retry"); void generateProductionGraphImage(node); return true;
  }
  const primary = oldSettings.referenceUse === "supporting_detail" ? projectReferences.find((reference) => reference.characterSlot === oldSettings.characterSlot && reference.referenceUse === "primary_identity") : undefined;
  showRetryProgress("character", nextAttempt > 3 ? `Đang retry thủ công sau giới hạn 3 lần: ${job.error || job.statusMessage || statusLabel(job.status)}` : `Đang retry lỗi lần ${nextAttempt}/3 bằng prompt mới: ${job.error || job.statusMessage || statusLabel(job.status)}`);
  focusPipelineStep("character", "retry");
  queueCharacterImageDraft(primary, undefined, oldSettings.characterSlot, typeof oldSettings.characterName === "string" ? oldSettings.characterName : undefined, typeof oldSettings.referenceUse === "string" ? oldSettings.referenceUse as VisualReference["referenceUse"] : undefined, typeof oldSettings.referenceRole === "string" ? oldSettings.referenceRole as VisualReference["role"] : undefined, typeof oldSettings.directReferenceUse === "string" ? oldSettings.directReferenceUse as VisualReference["referenceUse"] : undefined);
  return true;
}

function retryMediaPlan(job: AutomationJob, oldBridgeMessage: RunJobRequest, linkedShotId?: string) {
  const { intake, productionLanguage, project, projectAssets, projectScenes, projectShots, state } = runtime;
  const retryShot = linkedShotId ? projectShots.find((shot) => shot.id === linkedShotId) : undefined;
  const retryScene = retryShot ? projectScenes.find((item) => item.id === retryShot.sceneId) : undefined;
  const retryKeyframes = retryShot ? shotKeyframeAssets(projectAssets, retryShot, state.jobs) : [];
  const flowMode = job.jobType === "video" && oldBridgeMessage.provider === "google-flow" ? "frames" as const : undefined;
  const restartImageConversation = job.jobType === "image" && /did not acknowledge|no new image|generation stopped|new_conversation_not_confirmed/i.test(job.error || job.statusMessage || "");
  const settings: RunJobRequest["settings"] = flowMode ? {
    ...(oldBridgeMessage.settings || {}),
    aspectRatio: project.intake?.videoFrame?.aspectRatio ?? intake.videoFrame?.aspectRatio ?? oldBridgeMessage.settings?.aspectRatio ?? "9:16",
    durationSec: resolveProviderVideoDuration(oldBridgeMessage.provider, retryShot?.durationSec ?? oldBridgeMessage.settings?.timelineDurationSec ?? oldBridgeMessage.settings?.durationSec ?? 6),
    timelineDurationSec: retryShot?.durationSec ?? oldBridgeMessage.settings?.timelineDurationSec ?? oldBridgeMessage.settings?.durationSec,
    flowVideoMode: flowMode, sourceMode: flowMode, resultType: "video", mode: "video", providerMode: "video", flowResultType: "video",
    startFrameAssetId: retryKeyframes[0]?.id ?? oldBridgeMessage.settings?.startFrameAssetId,
    projectId: project.id, shotId: retryShot?.id ?? linkedShotId, outputLanguage: productionLanguage
  } : restartImageConversation ? { ...(oldBridgeMessage.settings || {}), newConversation: true, reusePreviousContext: false } : oldBridgeMessage.settings;
  return { flowMode, restartImageConversation, retryScene, retryShot, settings };
}

function latestStructuredArtifact(task: string, screenplaySceneId?: unknown) {
  return runtime.projectJobs.filter((candidate) => {
    const payload = candidate.input as RunJobPayload | undefined;
    return payload?.bridgeMessage?.task === task && payload.bridgeMessage.settings?.screenplaySceneId === screenplaySceneId && Boolean(candidate.outputText?.trim());
  }).sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0]?.outputText?.trim();
}

function rootImporterFailure(rootId: string) {
  return runtime.projectJobs.filter((candidate) => {
    const payload = candidate.input as RunJobPayload | undefined;
    return (candidate.id === rootId || payload?.retryOfJobId === rootId) && !/PROVIDER_OUTPUT_DEGENERATED/i.test(String(candidate.error || candidate.statusMessage || ""));
  }).sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0];
}

function rebuiltStructuredPrompt(job: AutomationJob, message: RunJobRequest, rebuild: boolean) {
const { intake, intakeRef, productionProjectReferences, project, projectScenes, routedVideoPlatform, selectedCreativeSkill, selectedVideoSkill, skills, storySeed } = runtime;
  if (!rebuild) return message.prompt;
  if (message.task === "story_foundation") return buildCompactStoryFoundationRetryPrompt(project.sourceDraft || storySeed, intakeRef.current ?? intake);
  if (message.task === "story_architecture") return buildCompactStoryArchitectureRetryPrompt(project, productionProjectReferences, selectedVideoSkill, selectedCreativeSkill);
  const scene = message.task === "screenplay_scene" ? projectScenes.find((item) => item.screenplaySceneId === message.settings?.screenplaySceneId) : undefined;
  return scene ? buildCompactScreenplaySceneRetryPrompt(project, scene, routedVideoPlatform) : message.prompt;
}

function retryImporterCorrection(job: AutomationJob, correctable: boolean) {
  return correctable ? `\n\nCORRECTION REQUIRED BY THE APP IMPORTER:\n${String(job.error || job.statusMessage || "Structured output failed validation.").slice(0, 1200)}\nReturn exactly one complete valid JSON object after correcting only this validation failure. Keep sourceAnalysis, adaptationDecisions, logline, story, narrativeContract (including voiceContinuity and beats), creativeIntent, videoKnowledgeProfile, and characters inside the same top-level object. Preserve every locked fact, speaker, cue identity, causal dependency and verbatim source line. Do not append JavaScript-like tokens, explanation, markdown, omitted schema fields, or a rejection object.` : "";
}

function retryFoundationDirective(task: string, incompleteJson: boolean) {
  return task === "story_foundation" && incompleteJson
    ? `\n\nFOUNDATION_RETRY_CONTRACT_YAML:
reason: previous_json_was_truncated
strategy: rebuild_from_source
reuse_partial_artifact: false
output:
  format: minified_json
  max_utf8_bytes: 6000
  complete_before_submit: true
limits:
  beats: 3
  obligations_per_beat: 2
  required_facts: 6
  forbidden_contradictions: 4
  adaptation_decisions: 2
  active_modules: 4
rules:
  - Preserve all source-locked facts, speakers, causal choice and outcome.
  - Use concise values and no duplicated prose.
  - Return every required top-level field and finish with the closing brace.
  - Never continue, quote or repair the incomplete prior response.`
    : "";
}

function retryShotDirectives(task: string, failureDetail: string) {
  if (task !== "shot_breakdown") return "";
  const transformation = /MULTIPLE_VISIBLE_TRANSFORMATIONS|NON_ATOMIC_SHOT|MULTIPLE_CAMERA_SETUPS|requires exactly .*provider-feasible shots|received .*provider-feasible shots|must cover .*screenplay cue|screenplay cue/i.test(failureDetail);
  const cueContract = /must cover .*screenplay cue|screenplay cue|shot-scoped visual reference subset/i.test(failureDetail);
  const incomplete = /complete JSON object|complete structured JSON|did not contain/i.test(failureDetail);
  const timing = /TIMING_ACTION_STRETCH/i.test(failureDetail);
  const compact = `\n- Keep every prose value concise and finish the complete JSON response within 4,500 characters; return no explanation, markdown, or provider prompt text.`;
  return `${transformation ? `\n\nSHOT BREAKDOWN REPAIR RULES (MANDATORY):\n- Return one complete JSON object only; preserve every locked cue ID, exact dialogue line, speaker and duration inventory.\n- The importer error names the offending operations. Treat those names as mutually exclusive: choose exactly one material transformation for each shot and remove every other named operation from that shot's dominantAction, action beats, and visibleResult. Do not merely rename or paraphrase the second operation.\n- Split the offending shot into separate shots only when the locked cue inventory explicitly permits another shot; otherwise keep the extra operation as a later consequence/state handoff, never as a second physical action in this shot.\n- Each shot must have exactly one dominant visible action, at most one transformation kind, and exactly one camera setup; never combine open/close, attach/install, extract/rescue, lift/transfer or other independent operations.\n- Obey the importer count literally: return exactly the requested number of shots and use the supplied duration inventory exactly once.\n- Do not invent a setup/reaction beat just to fill time, do not rewrite the screenplay, and do not add technical fields.\n- Cover each batch cue exactly once and finish the JSON within the requested schema.` : ""}${cueContract ? `\n- Every returned shot must explicitly reference at least one supplied screenplay cue. Use the exact arrays screenplayActionCueIds, screenplayDialogueCueIds, or screenplaySoundCueIds (not cueIds, references, or prose); never return an unassigned setup or reaction shot.\n- Cover every supplied batch cue exactly once; do not invent cue IDs or leave all three cue arrays empty.\n- Every returned shot must include referenceRequirementIds containing only the smallest visible subset of the supplied scene reference requirement IDs; never omit the field, invent IDs, or copy the entire scene list into every shot.` : ""}${compact}${incomplete ? `\n- Return a compact JSON object only and finish it with the closing brace. Keep descriptions, camera and motion concise; never include markdown, commentary, or an incomplete/truncated object.` : ""}${timing ? `\n- TIMING_ACTION_STRETCH is a hard constraint: the repaired shot's primary action beat and active action duration must be at most 3.5 seconds. Shorten only the named shot while preserving its exact cue IDs, dialogue and continuity; do not leave a long hold or repeated motion.` : ""}`;
}

function retryStructuredDirectives(job: AutomationJob, message: RunJobRequest, textFailureDetail: string, failure: string, correctable: boolean, incompleteJson: boolean) {
  const failureDetail = `${textFailureDetail} ${failure}`;
  const architecture = message.task === "story_architecture" && /Story architecture requires exactly|Scene architecture must progress/i.test(failureDetail)
    ? `\n\nARCHITECTURE REPAIR RULES (MANDATORY):\n- Return exactly 2 scenes because this project is under 20 seconds; never return 3 scenes, even if the foundation contains more beats.\n- Assign every locked contract beat exactly once across those 2 scenes.\n- Set motifFunction to exactly ["setup", "payoff"] in scene order; do not use a third scene or any other motif value.\n- Preserve the existing visual requirements and all locked foundation facts; correct only scene count and motif ordering.\n- Return one complete JSON object only, with no explanation or markdown.` : "";
  const screenplayBudget = message.task === "screenplay_scene" && /SCREENPLAY_RUNTIME_OVERFLOW/i.test(failureDetail)
    ? `\n\nSCREENPLAY BUDGET REPAIR RULES (MANDATORY):\n- The importer allows exactly 1 atomic cue group for this scene. Return one action cue only, or one compatible action + dialogue + sound cluster sharing the same causal sequence; never create a second action/dialogue group.\n- Cover all locked visible obligations inside that single readable action and its resulting state; do not add setup, reaction, explanation or duplicate cues.\n- Keep the existing scene contract and ownerBeatIds; return one compact complete JSON object only.` : "";
  const degeneration = /PROVIDER_OUTPUT_DEGENERATED/i.test(textFailureDetail) && ["story_foundation", "story_architecture", "screenplay_scene"].includes(message.task)
    ? `\n\nRETRY OUTPUT STABILITY RULES:\n- Return one compact JSON object only; no prose, markdown, or repeated keys.\n- Keep dialogue and required scene cues, but use concise values and arrays.\n- Finish the JSON within 4,500 characters; stop after the closing brace.` : "";
  const speech = message.task === "screenplay_scene" && /SCREENPLAY_SPEECH_DURATION_OVERFLOW/i.test(failureDetail)
    ? `\n\nSPEECH BUDGET REPAIR (MANDATORY):\n- Shorten only the offending dialogue line(s) so every line fits its assigned duration slot.\n- Preserve the same speaker, tactic, causal function and meaning; do not add a new cue or move the line.\n- Count words before returning. Any line that still exceeds its slot will be rejected again.` : "";
  return `${retryImporterCorrection(job, correctable)}${retryFoundationDirective(message.task, incompleteJson)}${architecture}${screenplayBudget}${degeneration}${speech}${retryShotDirectives(message.task, failureDetail)}`;
}

function structuredRetryPrompt(job: AutomationJob, oldPayload: RunJobPayload, oldBridgeMessage: RunJobRequest, textFailureDetail: string) {
  const correctable = isCorrectableStructuredImportFailure(job);
  const rebuild = ["story_foundation", "story_architecture", "screenplay_scene"].includes(oldBridgeMessage.task) && (classifyTextRetry(job).requiresFreshTextRequest || correctable);
  const latestArtifact = latestStructuredArtifact(oldBridgeMessage.task, oldBridgeMessage.settings?.screenplaySceneId);
  const rootId = oldPayload.retryOfJobId || job.id;
  const importerFailure = rootImporterFailure(rootId);
  const failure = String(importerFailure?.error || importerFailure?.statusMessage || job.error || job.statusMessage || "Structured output failed validation.");
  const incompleteJson = /did not contain a complete JSON object|incomplete structured JSON|truncated/i.test(`${textFailureDetail} ${failure}`);
  // A truncated object is not a repairable artifact: its missing tail can hold
  // locked facts and speakers. Rebuild from the source contract instead of
  // asking the provider to guess what the partial object omitted.
  const repair = /PROVIDER_OUTPUT_DEGENERATED/i.test(textFailureDetail) && !incompleteJson && latestArtifact
    ? `Repair this existing structured JSON artifact. Return exactly one complete valid JSON object and nothing else.\n\nIMPORT ERROR TO FIX:\n${failure.slice(0, 900)}\n\nRULES:\n- Preserve every existing locked field, ID, speaker, exact line, dependency, and scene fact.\n- Correct only the stated importer failure.\n- Do not expand prose, repeat tokens, add markdown, or rewrite the scene.\n- Keep the response under 5,000 characters.\n\nEXISTING ARTIFACT:\n${latestArtifact.slice(0, 4_000)}`
    : undefined;
  const rebuilt = rebuiltStructuredPrompt(job, oldBridgeMessage, rebuild);
  const base = repair || rebuilt;
  return { prompt: repair ? base : `${base}${retryStructuredDirectives(job, oldBridgeMessage, textFailureDetail, failure, correctable, incompleteJson)}`, repair, rootId };
}

function retryDeliveryReferences(job: AutomationJob, oldBridgeMessage: RunJobRequest, rootId: string, flowMode: "components" | "frames" | undefined, restartImageConversation: boolean, retryShot?: Shot, retryScene?: Scene) {
  const { projectJobs, referenceForRequirement } = runtime;
  const rootJob = projectJobs.find((candidate) => candidate.id === rootId);
  const rootMessage = (rootJob?.input as RunJobPayload | undefined)?.bridgeMessage;
  const latestConversationUrl = projectJobs.filter((candidate) => {
    const payload = candidate.input as RunJobPayload | undefined;
    return candidate.id === rootId || payload?.retryOfJobId === rootId;
  }).filter((candidate) => String(candidate.providerConversationUrl || "").startsWith("https://chatgpt.com/c/"))
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0]?.providerConversationUrl;
  const flowReferences = flowMode
    ? ((rootMessage?.references?.length || 0) > (oldBridgeMessage.references?.length || 0) ? rootMessage?.references : oldBridgeMessage.references)?.filter((reference) => reference.referenceRole !== "character_detail")
    : oldBridgeMessage.references;
  const imageReferences = restartImageConversation && retryShot
    ? (retryShot.referenceRequirementIds || retryScene?.referenceRequirementIds || []).map(referenceForRequirement).filter((reference): reference is VisualReference => Boolean(reference?.filePath)).map((reference) => ({
      assetId: reference.id, filePath: reference.filePath,
      referenceRole: reference.role === "location" ? "setting" as const : reference.role === "prop" ? "prop" as const : "character_identity" as const,
      referenceLabel: reference.name
    }))
    : undefined;
  return { flowReferences, imageReferences, latestConversationUrl, rootJob, rootMessage };
}

function shouldStartFreshChat(job: AutomationJob, message: RunJobRequest) {
  return message.provider === "chatgpt" && freshChatGptSessionFailure(job) && !job.providerConversationUrl && !message.conversationUrl;
}

function hasDegeneratedChatOutput(job: AutomationJob, message: RunJobRequest) {
  return message.provider === "chatgpt" && /PROVIDER_OUTPUT_DEGENERATED/i.test(`${job.error || ""} ${job.statusMessage || ""}`);
}

function validateRetryPreflight(job: AutomationJob, message: RunJobRequest, prompt: string, settings: RunJobRequest["settings"], references: NonNullable<RunJobRequest["references"]>, retryShot?: Shot) {
  const { intake, projectAssets, projectShots, state } = runtime;
  if (!retryShot || job.jobType !== "video" || message.provider !== "google-flow") return undefined;
  return validateVideoPreflight({
    shot: retryShot,
    previousShot: projectShots[projectShots.findIndex((candidate) => candidate.id === retryShot.id) - 1],
    prompt, references, assets: projectAssets, jobs: state.jobs.filter((candidate) => candidate.id !== job.id), provider: message.provider,
    aspectRatio: String(settings?.aspectRatio || intake.videoFrame?.aspectRatio || "9:16"),
    providerRoute: job.providerWorkspaceUrl || state.providers.find((candidate) => candidate.id === job.providerId)?.targetUrl || "Studio Shot Bridge"
  });
}

function chatRetryConversationUrl(job: AutomationJob, message: RunJobRequest, repair: string | undefined, delivery: ReturnType<typeof retryDeliveryReferences>) {
  // A desktop restart can leave a ChatGPT job without a recoverable
  // conversation URL.  Reusing the visible tab is safer than sending an
  // invalid/stale URL: the extension will start a clean conversation there.
  if (shouldStartFreshChat(job, message)) return undefined;
  // A repeated-token/provider-degeneration failure is stateful: returning to
  // the same ChatGPT conversation commonly reproduces the loop. Force a clean
  // conversation for this failure class instead of retrying the poisoned turn.
  if (hasDegeneratedChatOutput(job, message)) return undefined;
  if (repair && message.provider === "chatgpt") return delivery.rootJob?.providerConversationUrl || delivery.rootMessage?.conversationUrl || job.providerConversationUrl;
  if (message.provider === "chatgpt") return job.providerConversationUrl || message.conversationUrl || delivery.latestConversationUrl || delivery.rootJob?.providerConversationUrl || delivery.rootMessage?.conversationUrl;
  return message.conversationUrl;
}

function retryConversationUrl(job: AutomationJob, message: RunJobRequest, flowMode: "components" | "frames" | undefined, repair: string | undefined, delivery: ReturnType<typeof retryDeliveryReferences>) {
  if (flowMode) {
    // A missing result is not proof that the old Flow workspace still exists:
    // the user may have switched accounts, the project may have been deleted,
    // or the provider may have expired its tile.  Let the extension submit in
    // the currently signed-in Flow tab instead of reopening a stale workspace
    // URL and trapping YOLO in an unrecoverable retry loop.
    if (/No recoverable Google Flow video was found|strict recovery could not (?:tie|find)|recovery could not tie a completed video/i.test(`${job.error || ""} ${job.statusMessage || ""}`)) return undefined;
    return job.providerWorkspaceUrl;
  }
  return chatRetryConversationUrl(job, message, repair, delivery);
}

function acceptRetryPreflight(job: AutomationJob, retryShot: Shot | undefined, settings: RunJobRequest["settings"], preflight: ReturnType<typeof validateRetryPreflight>) {
  const { selectedShot, setPipelineRun, setSelectedShotId } = runtime;
  if (preflight && !preflight.valid) {
    setSelectedShotId(retryShot?.id ?? selectedShot.id);
    setPipelineRun({ mode: "step", running: false, currentStep: "video", message: `Preflight chặn retry: ${preflightIssueSummary(preflight)}`, startedAt: new Date().toISOString() });
    return false;
  }
  if (preflight && settings) {
    settings.idempotencyKey = preflight.idempotencyKey;
    settings.preflightValidation = preflight;
  }
  return true;
}

function submitRetryPayload(job: AutomationJob, payload: RunJobPayload, nextAttempt: number) {
  const { focusPipelineStep, pipelineStep, replaceState, runDemoJob, setPipelineRun } = runtime;
  setPipelineRun((current) => ({
    mode: current?.mode ?? "step", running: current?.mode === "full", currentStep: jobPipelineStep(job) ?? pipelineStep,
    message: nextAttempt > 3 ? `Đang retry thủ công sau giới hạn 3 lần: ${job.error || job.statusMessage || statusLabel(job.status)}` : `Đang retry lỗi lần ${nextAttempt}/3: ${job.error || job.statusMessage || statusLabel(job.status)}`,
    startedAt: current?.startedAt ?? new Date().toISOString()
  }));
  focusPipelineStep(jobPipelineStep(job) ?? pipelineStep, "retry");
  if (getWorkflowBridge()) getWorkflowBridge().runJob(payload).then(replaceState);
  else runDemoJob(payload);
  return true;
}

function buildRetryBridgeMessage(job: AutomationJob, oldBridgeMessage: RunJobRequest, retryPrompt: string, repair: string | undefined, delivery: ReturnType<typeof retryDeliveryReferences>, flowMode: "components" | "frames" | undefined, retrySettings: RunJobRequest["settings"], preservedFlowReferences: NonNullable<RunJobRequest["references"]>): RunJobRequest {
  const freshChatGptConversation = oldBridgeMessage.provider === "chatgpt" && /PROVIDER_OUTPUT_DEGENERATED/i.test(`${job.error || ""} ${job.statusMessage || ""}`);
  const recoveredFromLostDesktopSession = oldBridgeMessage.provider === "chatgpt" && freshChatGptSessionFailure(job) && !job.providerConversationUrl && !oldBridgeMessage.conversationUrl;
  return {
    ...oldBridgeMessage,
    jobId: makeId("retry_job"),
    conversationUrl: retryConversationUrl(job, oldBridgeMessage, flowMode, repair, delivery),
    prompt: retryPrompt,
    references: delivery.imageReferences ?? preservedFlowReferences,
    settings: freshChatGptConversation || recoveredFromLostDesktopSession
      ? { ...retrySettings, newConversation: true, reusePreviousContext: false }
      : repair ? { ...retrySettings, newConversation: false, reusePreviousContext: true } : retrySettings
  };
}

function freshChatGptSessionFailure(job: AutomationJob) {
  return /(?:previous desktop session ended before this browser job returned|waiting for the saved ChatGPT conversation messages to load|timed out waiting for provider tab to finish loading)/i.test(`${job.error || ""} ${job.statusMessage || ""}`);
}

function buildRetryPayload(job: AutomationJob, oldPayload: RunJobPayload, bridgeMessage: RunJobRequest, retryShot: Shot | undefined, linkedShotId: string | undefined, retryPrompt: string, nextAttempt: number): RunJobPayload {
  return {
    ...oldPayload,
    jobId: bridgeMessage.jobId,
    projectId: runtime.project.id,
    shotId: retryShot?.id ?? linkedShotId,
    prompt: retryPrompt,
    bridgeMessage,
    retryOfJobId: oldPayload.retryOfJobId || job.id,
    retryAttempt: nextAttempt
  };
}

function retryAutomationJob(candidate: AutomationJob | undefined) {
    const context = retryContext(candidate);
    if (!context) return false;
    const { job, oldPayload, oldBridgeMessage, retryRootId, state } = context;
    const currentFailureDetail = `${job.error || ""} ${job.statusMessage || ""}`;
    if (trySavedStructuredArtifact(job, oldPayload, oldBridgeMessage, retryRootId)) return true;
    const linkedShotId = job.shotId || (typeof oldBridgeMessage.settings?.shotId === "string" ? oldBridgeMessage.settings.shotId : undefined);
    if (tryPlannedRecovery(job, linkedShotId)) return true;
    const nextAttempt = retryAttemptsForTarget(job, state.jobs) + 1;
    const oldSettings = oldBridgeMessage.settings;
    const textFailureDetail = currentFailureDetail;
    if (oldBridgeMessage.task === "text_to_image" && tryCharacterReferenceRetry(job, oldSettings, nextAttempt)) return true;
    const { flowMode: latestFlowVideoMode, restartImageConversation, retryScene, retryShot, settings: retrySettings } = retryMediaPlan(job, oldBridgeMessage, linkedShotId);
    const { prompt: retryPrompt, repair: boundedArtifactRepairPrompt, rootId: rootRetryJobId } = structuredRetryPrompt(job, oldPayload, oldBridgeMessage, textFailureDetail);
    const delivery = retryDeliveryReferences(job, oldBridgeMessage, rootRetryJobId, latestFlowVideoMode, restartImageConversation, retryShot, retryScene);
    const preservedFlowReferences = delivery.flowReferences ?? [];
    const retryPreflight = validateRetryPreflight(job, oldBridgeMessage, retryPrompt, retrySettings, preservedFlowReferences, retryShot);
    if (!acceptRetryPreflight(job, retryShot, retrySettings, retryPreflight)) return true;
    const bridgeMessage = buildRetryBridgeMessage(job, oldBridgeMessage, retryPrompt, boundedArtifactRepairPrompt, delivery, latestFlowVideoMode, retrySettings, preservedFlowReferences);
    const payload = buildRetryPayload(job, oldPayload, bridgeMessage, retryShot, linkedShotId, retryPrompt, nextAttempt);
    return submitRetryPayload(job, payload, nextAttempt);
}

function retryContext(job: AutomationJob | undefined) {
  const state = runtime.state;
  const oldPayload = job?.input as RunJobPayload | undefined;
  const oldBridgeMessage = oldPayload?.bridgeMessage;
  if (!job || !oldPayload || oldBridgeMessage?.type !== "RUN_JOB") return undefined;
  return { job, oldPayload, oldBridgeMessage, retryRootId: oldPayload.retryOfJobId || job.id, state };
}

export function createRetryAction(deps: RetryActionDependencies) {
  runtime = deps;
  return retryAutomationJob;
}
