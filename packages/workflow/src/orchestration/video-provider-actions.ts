import { getWorkflowBridge } from "../workflow-bridge";
import type { RunJobRequest } from "@studio/types/job-request";
import { resolveProviderVideoDuration } from "@studio/domain/duration-policy";
import type { Asset, BrowserProviderAdapter, Character, Project, ProjectIntake, Scene, Shot, StudioState, StyleBible, VisualReference, VisualRequirement } from "@studio/types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { normalizeSlotName } from "@studio/domain/identifiers";
import type { RunJobPayload } from "@studio/workflow/support-core";
import { isActiveJob } from "@studio/workflow/support-core";
import { shotKeyframeAssets } from "@studio/workflow/media-asset-selectors";
import { makeId } from "@studio/domain/identifiers";
import type { PipelineRunState, VideoAspectRatio } from "@studio/workflow/support-core";
import { buildVideoGenerationPrompt } from "@studio/workflow/video-generation";
import { preflightIssueSummary, utf8ByteLength, validateVideoPreflight } from "@studio/workflow/video-preflight";
import type { VideoPreflightValidation } from "@studio/domain/preflight-contract";
import { buildPrompt, buildReferencePromptBlock } from "@studio/workflow/video-prompt-legacy";
import { buildShotGenerationSpec, compileVideoProviderRequest } from "@studio/workflow/video-provider-adapter";

type VideoProviderActionDependencies = {
  bridgeCount: number; character: Character; characterReadyForPipeline: boolean; completedCompactedPrompt: (shotId: string, sourcePromptHash: string, sourceShotHash: string, sourcePromptBytes: number) => string | undefined; flowProjectTabReady: boolean; flowProjectUrl?: string;
  flowPromptFingerprint: (value: string) => string; flowShotFingerprint: (shot: Shot) => string; intake: ProjectIntake; lockedProjectReferences: VisualReference[]; missingVisualRequirements: VisualRequirement[]; pendingVideoDispatchShotIdsRef: RefObject<Set<string>>;
  productionLanguage: string; project: Project; projectAssets: Asset[]; projectCharacters: Character[]; projectReferences: VisualReference[]; projectScenes: Scene[]; projectShots: Shot[]; promptsReadyForPipeline: boolean;
  referenceForRequirement: (requirementId: string) => VisualReference | undefined; replaceState: (state: StudioState) => void; requestFlowPromptCompaction: (shot: Shot, prompt: string, promptHash: string, shotHash: string) => Promise<void>;
  runDemoJob: (payload: RunJobPayload) => void; scene: Scene; selectedProvider: BrowserProviderAdapter; selectedShot: Shot; setPipelineRun: Dispatch<SetStateAction<PipelineRunState | null>>; setSelectedShotId: Dispatch<SetStateAction<string>>;
  state: StudioState; storyFoundationReady: boolean; storyReadyForPipeline: boolean; style: StyleBible; visualRequirements: VisualRequirement[];
};

let runtime: VideoProviderActionDependencies;
type QueueProviderOptions = { preflightOnly?: boolean; revisionInstruction?: string; startFrameAssetId?: string; outputLanguage?: string; videoQuality?: "fast" | "quality"; generateAudio?: boolean };

function providerMediaFilename(filePath: unknown): string | undefined {
  let value = String(filePath || "");
  try { value = new URL(value).pathname; } catch {}
  try { value = decodeURIComponent(value); } catch {}
  return value.split(/[\\/]/).pop()?.split("?")[0] || undefined;
}

export function providerBridgeIsAvailable(bridgeCount: number, workflowBridge: unknown): boolean {
  return bridgeCount > 0 && Boolean(workflowBridge);
}

function blockVideoDispatch(step: PipelineRunState["currentStep"], message: string) {
  runtime.setPipelineRun({ mode: "step", running: false, currentStep: step, message, startedAt: new Date().toISOString() });
  return true;
}

function flowSpeechDispatchBlocked(shot: Shot, shotHasSpeech: boolean, selectedGenerateAudio: boolean, speakerCharacter?: Character, executableVoice?: NonNullable<Character["voiceProfile"]>) {
  if (shotHasSpeech && (!shot.speakerCharacterId || !speakerCharacter || !executableVoice)) {
    const message = !shot.speakerCharacterId
      ? "Dừng: shot có thoại nhưng chưa gán speakerCharacterId. Hãy chọn đúng nhân vật trước khi gen."
      : `Dừng: ${speakerCharacter?.name || shot.speaker || "nhân vật"} chưa có voice audio-pass executable.`;
    return blockVideoDispatch("video", message);
  }
  return selectedGenerateAudio && shotHasSpeech
    ? blockVideoDispatch("video", "Dừng: giọng nhân vật được xử lý ở bước âm thanh riêng để giữ nhất quán giữa các shot.")
    : false;
}

function videoDispatchReadinessBlocked({ hasProviderBridge, isFlowVideoProvider, isVideoProvider, missingRequirements, promptsReady, selectedGenerateAudio, shot, shotHasSpeech, speakerCharacter, executableVoice, targetAssets }: {
  hasProviderBridge: boolean; isFlowVideoProvider: boolean; isVideoProvider: boolean; missingRequirements: VisualRequirement[];
  promptsReady: boolean; selectedGenerateAudio: boolean; shot: Shot; shotHasSpeech: boolean; speakerCharacter?: Character;
  executableVoice?: NonNullable<Character["voiceProfile"]>; targetAssets: Asset[];
}) {
  const { characterReadyForPipeline, missingVisualRequirements, storyFoundationReady, storyReadyForPipeline } = runtime;
  if (!hasProviderBridge) return false;
  if (isVideoProvider && shot.planningWarnings?.length) return blockVideoDispatch("prompts", `Dừng trước khi gửi provider: ${shot.planningWarnings.join(" · ")}`);
  if (isFlowVideoProvider && flowSpeechDispatchBlocked(shot, shotHasSpeech, selectedGenerateAudio, speakerCharacter, executableVoice)) return true;
  // A user-targeted Flow one-shot is self-contained once its authored prompt,
  // exact shot-scoped keyframe, and required references exist. Do not force a
  // diagnostic/regeneration shot back through unrelated project-wide story
  // and character gates; those gates still apply to batch/pipeline dispatch.
  const selfContainedFlowShot = isFlowVideoProvider && Boolean(shot.prompt?.trim()) && targetAssets.length > 0 && missingRequirements.length === 0;
  if (selfContainedFlowShot) return false;
  return pipelineReadinessBlock({ isVideoProvider, missingRequirements, promptsReady, targetAssets, storyFoundationReady, storyReadyForPipeline, characterReadyForPipeline, missingVisualRequirements });
}

function pipelineReadinessBlock({ isVideoProvider, missingRequirements, promptsReady, targetAssets, storyFoundationReady, storyReadyForPipeline, characterReadyForPipeline, missingVisualRequirements }: {
  isVideoProvider: boolean; missingRequirements: VisualRequirement[]; promptsReady: boolean; targetAssets: Asset[];
  storyFoundationReady: boolean; storyReadyForPipeline: boolean; characterReadyForPipeline: boolean; missingVisualRequirements: VisualRequirement[];
}) {
  if (!storyReadyForPipeline) return blockVideoDispatch(storyFoundationReady ? "architecture" : "foundation", "Dừng: chưa có kịch bản AI hoàn chỉnh nên chưa được queue prompt/keyframe/video.");
  if (!characterReadyForPipeline) return blockVideoDispatch("character", `Dừng: còn thiếu ${missingVisualRequirements.length} ảnh bắt buộc cho nhân vật, bối cảnh hoặc props nên chưa được queue keyframe/video.`);
  if (missingRequirements.length) return blockVideoDispatch("character", `Dừng: scene còn thiếu ảnh ${missingRequirements.map((requirement) => requirement.name).join(", ")}.`);
  if (isVideoProvider && !promptsReady) return blockVideoDispatch("prompts", "Dừng: chưa dựng prompt storyboard đầy đủ nên chưa được gửi Flow.");
  if (isVideoProvider && targetAssets.length === 0) return blockVideoDispatch("storyboard", "Dừng: shot này chưa có keyframe nên chưa thể gửi Flow.");
  return false;
}

function prepareProviderPrompt(provider: BrowserProviderAdapter, targetShot: Shot, targetScene: Scene, targetAspectRatio: VideoAspectRatio, selectedOutputLanguage: string, selectedVideoQuality: "fast" | "quality", selectedGenerateAudio: boolean, options: QueueProviderOptions) {
const { character, completedCompactedPrompt, flowPromptFingerprint, flowShotFingerprint, intake, project, projectReferences, requestFlowPromptCompaction, setPipelineRun, setSelectedShotId, style } = runtime;
  const isVideoProvider = provider.capabilities.includes("video");
  const sourceMode: NonNullable<ProjectIntake["flowVideoMode"]> = provider.platform === "google-flow"
    ? "frames"
    : project.intake?.flowVideoMode ?? intake.flowVideoMode ?? "frames";
  const generatedPrompt = isVideoProvider
    ? buildVideoGenerationPrompt({ shot: targetShot, outputLanguage: selectedOutputLanguage, sourceMode })
    : buildPrompt(style, character, targetScene, targetShot, targetAspectRatio, selectedOutputLanguage);
  const compilation = isVideoProvider ? compileVideoProviderRequest({ platform: provider.platform, neutralPrompt: generatedPrompt, shot: targetShot, aspectRatio: targetAspectRatio, sourceMode, quality: selectedVideoQuality, generateAudio: selectedGenerateAudio, outputLanguage: selectedOutputLanguage }) : undefined;
  const basePrompt = isVideoProvider ? compilation!.prompt : (targetShot.prompt || generatedPrompt) + buildReferencePromptBlock(projectReferences);
  const rawPrompt = options.revisionInstruction
    ? `${basePrompt}\n\nREVISION REQUEST:\n${options.revisionInstruction}\nKeep the current upstream shot keyframe as the only visual start frame. Do not reuse the start frame from an older video version.`
    : basePrompt;
  const sourcePromptHash = flowPromptFingerprint(rawPrompt);
  const sourceShotHash = flowShotFingerprint(targetShot);
  const compactedPrompt = compilation?.profile.maxPromptUtf8Bytes ? completedCompactedPrompt(targetShot.id, sourcePromptHash, sourceShotHash, utf8ByteLength(rawPrompt)) : undefined;
  if (compilation?.profile.maxPromptUtf8Bytes && !compactedPrompt && ([...rawPrompt].length > compilation.profile.maxPromptUtf8Bytes || utf8ByteLength(rawPrompt) > compilation.profile.maxPromptUtf8Bytes)) {
    setSelectedShotId(targetShot.id);
    void requestFlowPromptCompaction(targetShot, rawPrompt, sourcePromptHash, sourceShotHash).catch((error) => setPipelineRun({ mode: "step", running: false, currentStep: "video", message: `Không thể tạo text node rút gọn prompt SH${targetShot.order}: ${error instanceof Error ? error.message : String(error)}`, startedAt: new Date().toISOString() }));
    return null;
  }
  return { compilation, isVideoProvider, prompt: compactedPrompt || rawPrompt };
}

function providerJobReferences(isVideoProvider: boolean, targetShot: Shot, targetScene: Scene, targetAssets: Asset[], selectedStartFrame: Asset | undefined, speakerCharacter?: Character) {
  const { lockedProjectReferences } = runtime;
  const startFrameFilename = selectedStartFrame
    ? providerMediaFilename(selectedStartFrame.metadata?.flowMediaFilename || selectedStartFrame.metadata?.providerFilename || selectedStartFrame.filePath)
    : undefined;
  const semanticReferences = semanticVideoReferencesForShot(targetShot, speakerCharacter, Boolean(selectedStartFrame));
  const references = isVideoProvider ? [
    ...(selectedStartFrame ? [{
      assetId: selectedStartFrame.id,
      filePath: selectedStartFrame.filePath,
      // The local keyframe basename is the authored media identity. The
      // metadata.startFrameAssetId field points to an upstream source asset,
      // not the generated keyframe filename, so never use it as a Flow label.
      filename: startFrameFilename,
      referenceRole: "shot_keyframe" as const,
      referenceLabel: `${targetScene.title} SH${targetShot.order} keyframe`
    }] : [])
  ] : [
    ...lockedProjectReferences.map((item) => ({ assetId: item.id, filePath: item.filePath })),
    ...targetAssets.map((asset) => ({ assetId: asset.id, filePath: asset.filePath }))
  ];
  return { references, semanticReferences };
}

function dispatchProviderPayload(provider: BrowserProviderAdapter, targetShot: Shot, targetScene: Scene, prompt: string, references: NonNullable<RunJobRequest["references"]>, settings: RunJobRequest["settings"], jobId: string, isVideoProvider: boolean) {
  const { flowProjectUrl, project, replaceState, runDemoJob } = runtime;
  const routeSettings = isVideoProvider && provider.platform === "google-flow" && flowProjectUrl
    ? { ...settings, flowProjectUrl, providerWorkspaceUrl: flowProjectUrl }
    : settings;
  const bridgeMessage: RunJobRequest = {
    type: "RUN_JOB", jobId, provider: provider.platform, task: isVideoProvider ? "image_to_video" : "prompt_enhance", prompt, references, settings: routeSettings,
    download: { auto: true, targetFolder: `/data/projects/${project.id}/assets/scene-${targetScene.order}/shot-${targetShot.order}`, filenameTemplate: `S${String(targetScene.order).padStart(2, "0")}_SH${String(targetShot.order).padStart(2, "0")}_${provider.platform}_[index]` }
  };
  const payload: RunJobPayload = { jobId, projectId: project.id, shotId: targetShot.id, providerId: provider.id, jobType: isVideoProvider ? "video" : "prompt-enhance", prompt, bridgeMessage };
  if (getWorkflowBridge()) getWorkflowBridge().runJob(payload).then(replaceState);
  else runDemoJob(payload);
}

function providerTargetContext(provider: BrowserProviderAdapter, targetShot: Shot, options: QueueProviderOptions) {
const { intake, productionLanguage, project, projectAssets, projectCharacters, projectScenes, referenceForRequirement, scene, state, visualRequirements } = runtime;
  const targetScene = projectScenes.find((item) => item.id === targetShot.sceneId) ?? scene;
  const requirementIds = Array.from(new Set(targetShot.referenceRequirementIds?.length ? targetShot.referenceRequirementIds : targetScene.referenceRequirementIds ?? []));
  const requirements = requirementIds.map((id) => visualRequirements.find((item) => item.id === id)).filter((item): item is VisualRequirement => Boolean(item));
  const missingRequirements = requirements.filter((requirement) => !referenceForRequirement(requirement.id));
  const targetAssets = shotKeyframeAssets(projectAssets, targetShot, state.jobs);
  const videoSettings = project.productionGraphNodeSettings?.[`output:${targetShot.id}:video`];
  const selectedImageId = project.productionGraphNodeSettings?.[`output:${targetShot.id}:image`]?.selectedAssetId;
  const selectedStartFrame = targetAssets.find((asset) => asset.id === (options.startFrameAssetId || selectedImageId)) ?? targetAssets[0];
  const selectedVideoQuality = options.videoQuality ?? videoSettings?.videoQuality ?? "fast";
  const selectedGenerateAudio = options.generateAudio ?? videoSettings?.generateAudio ?? false;
  const selectedOutputLanguage = options.outputLanguage ?? videoSettings?.outputLanguage ?? productionLanguage;
  const targetAspectRatio = intake.videoFrame?.aspectRatio ?? "9:16";
  const isVideoProvider = provider.capabilities.includes("video");
  const isFlowVideoProvider = isVideoProvider && provider.platform === "google-flow";
  const shotHasSpeech = targetShot.speechType !== "silent" && Boolean(targetShot.dialogue?.trim());
  const speakerCharacter = targetShot.speakerCharacterId ? projectCharacters.find((candidate) => candidate.id === targetShot.speakerCharacterId) : undefined;
  const executableVoice = speakerCharacter?.voiceProfile?.provider !== "google-flow" && speakerCharacter?.voiceProfile?.locked && speakerCharacter.voiceProfile.voiceId ? speakerCharacter.voiceProfile : undefined;
  return { executableVoice, isFlowVideoProvider, isVideoProvider, missingRequirements, selectedGenerateAudio, selectedOutputLanguage, selectedStartFrame, selectedVideoQuality, shotHasSpeech, speakerCharacter, targetAspectRatio, targetAssets, targetScene };
}

const providerReferenceRole = (reference: VisualReference): NonNullable<RunJobRequest["references"]>[number]["referenceRole"] =>
    reference.role === "main_character" || reference.role === "supporting_character"
      ? reference.referenceUse === "supporting_detail" ? "character_detail" : "character_identity"
      : reference.role === "location" ? "setting"
        : reference.role === "prop" ? "prop" : "style";

function semanticVideoReferencesForShot(targetShot: Shot, speakerCharacter?: Character, hasStartFrame = true) {
    const { projectScenes, scene, referenceForRequirement } = runtime;
    const targetScene = projectScenes.find((item) => item.id === targetShot.sceneId) ?? scene;
    const requirementIds = Array.from(new Set(
      targetShot.referenceRequirementIds?.length
        ? targetShot.referenceRequirementIds
        : (targetScene.referenceRequirementIds ?? [])
    ));
    return requirementIds
      .map((requirementId) => referenceForRequirement(requirementId))
      .filter((reference): reference is VisualReference => Boolean(reference))
      .sort((left, right) => {
        const speakerPriority = (reference: VisualReference) =>
          speakerCharacter && reference.name.trim().toLowerCase() === speakerCharacter.name.trim().toLowerCase() ? -1 : 0;
        const priority = (reference: VisualReference) => reference.role === "main_character"
          ? 0
          : reference.role === "supporting_character"
            ? 1
            : reference.role === "location"
              ? 2
              : 3;
        return speakerPriority(left) - speakerPriority(right) || priority(left) - priority(right) || Date.parse(right.createdAt) - Date.parse(left.createdAt);
      })
      .filter((reference, index, list) =>
        list.findIndex((candidate) =>
          (candidate.characterSlot || normalizeSlotName(candidate.name)) === (reference.characterSlot || normalizeSlotName(reference.name)) &&
          candidate.referenceUse === reference.referenceUse
        ) === index
      )
      .slice(0, hasStartFrame ? 7 : 8);
  }

function requireProviderBridge(provider: BrowserProviderAdapter, targetShot: Shot): boolean {
  const { bridgeCount, setSelectedShotId } = runtime;
  const workflowBridge = getWorkflowBridge();
  // Contract: provider.platform === "google-flow" && Boolean(getWorkflowBridge())
  // permits a targeted Flow queue while the renderer count catches up.
  // A live websocket without an extension still creates a ghost job. Flow
  // admission may lag the count briefly, so a Flow bridge object is enough for
  // targeted jobs while other providers remain fail-closed.
  const available = providerBridgeIsAvailable(bridgeCount, workflowBridge)
    || (provider.platform === "google-flow" && Boolean(workflowBridge));
  if (available) return true;
  setSelectedShotId(targetShot.id);
  blockVideoDispatch("video", "Dừng: chưa kết nối tiện ích trình duyệt. Mở Chrome, nạp Browser-Native extension rồi kết nối lại trước khi tạo video.");
  return false;
}

function queueProviderJob(provider: BrowserProviderAdapter, targetShot = runtime.selectedShot, options: QueueProviderOptions = {}) {
    const { bridgeCount, project, projectAssets, projectShots, setPipelineRun, setSelectedShotId, state, promptsReadyForPipeline } = runtime;
    if (!projectShots.some((shot) => shot.id === targetShot.id)) return;
    const hasProviderBridge = requireProviderBridge(provider, targetShot);
    if (!hasProviderBridge) return;
    const pendingSameShotJob = state.jobs.find((job) =>
      job.shotId === targetShot.id &&
      job.providerId === provider.id &&
      isActiveJob(job)
    );
    if (pendingSameShotJob) return;
    const jobId = makeId("job");
    const target = providerTargetContext(provider, targetShot, options);
    const { executableVoice, isFlowVideoProvider, isVideoProvider, missingRequirements, selectedGenerateAudio, selectedOutputLanguage, selectedStartFrame, selectedVideoQuality, shotHasSpeech, speakerCharacter, targetAspectRatio, targetAssets, targetScene } = target;
    if (videoDispatchReadinessBlocked({ hasProviderBridge, isFlowVideoProvider, isVideoProvider, missingRequirements, promptsReady: promptsReadyForPipeline, selectedGenerateAudio, shot: targetShot, shotHasSpeech, speakerCharacter, executableVoice, targetAssets })) return;
    const promptPlan = prepareProviderPrompt(provider, targetShot, targetScene, targetAspectRatio, selectedOutputLanguage, selectedVideoQuality, selectedGenerateAudio, options);
    if (!promptPlan) return;
    const { compilation: providerCompilation, prompt: targetPrompt } = promptPlan;
    const { references: videoReferences, semanticReferences: semanticVideoReferences } = providerJobReferences(isVideoProvider, targetShot, targetScene, targetAssets, selectedStartFrame, speakerCharacter);
    const preflightReferences = isVideoProvider ? [
      ...videoReferences,
      ...semanticVideoReferences.map((reference) => ({
        assetId: reference.id,
        filePath: reference.filePath,
        referenceRole: providerReferenceRole(reference),
        referenceLabel: reference.name
      }))
    ] : videoReferences;
    const preflightValidation = isVideoProvider ? validateVideoPreflight({
      shot: targetShot,
      previousShot: projectShots[projectShots.findIndex((candidate) => candidate.id === targetShot.id) - 1],
      prompt: targetPrompt,
      references: preflightReferences,
      assets: projectAssets,
      jobs: state.jobs,
      provider: provider.platform,
      aspectRatio: targetAspectRatio,
      providerRoute: provider.targetUrl
    }) : undefined;
    if (bridgeCount > 0 && preflightValidation && !preflightValidation.valid) {
      setSelectedShotId(targetShot.id);
      setPipelineRun({
        mode: "step",
        running: false,
        currentStep: "video",
        message: `Preflight chặn SH${targetShot.order}: ${preflightIssueSummary(preflightValidation)}`,
        startedAt: new Date().toISOString()
      });
      return;
    }
    const jobSettings: RunJobRequest["settings"] = providerCompilation?.settings ?? {
      aspectRatio: targetAspectRatio,
      durationSec: resolveProviderVideoDuration(provider.platform, targetShot.durationSec),
      timelineDurationSec: targetShot.durationSec,
      quality: selectedVideoQuality === "quality" ? "high" : "fast"
    };
    if (isVideoProvider) {
      jobSettings.startFrameAssetId = selectedStartFrame?.id;
      jobSettings.projectId = project.id;
      jobSettings.shotId = targetShot.id;
      jobSettings.identityReferenceAssetIds = semanticVideoReferences
        .filter((reference) => reference.role === "main_character" || reference.role === "supporting_character")
        .map((reference) => reference.id);
      jobSettings.outputLanguage = selectedOutputLanguage;
      jobSettings.shotSpec = buildShotGenerationSpec(targetShot);
      jobSettings.idempotencyKey = preflightValidation?.idempotencyKey;
      jobSettings.preflightValidation = preflightValidation;
      jobSettings.preflightOnly = Boolean(options.preflightOnly);
    }
    dispatchProviderPayload(provider, targetShot, targetScene, targetPrompt, videoReferences, jobSettings, jobId, isVideoProvider);
  }

function videoPreflightForShot(targetShot: Shot): VideoPreflightValidation {
    const { intake, projectAssets, projectCharacters, projectScenes, projectShots, scene, state, selectedProvider, productionLanguage, completedCompactedPrompt, flowPromptFingerprint, flowShotFingerprint } = runtime;
    const provider = state.providers.find((candidate) => candidate.id === intake.aiRouting?.videoProvider && candidate.capabilities.includes("video")) ??
      state.providers.find((candidate) => candidate.capabilities.includes("video")) ?? selectedProvider;
    const targetScene = projectScenes.find((item) => item.id === targetShot.sceneId) ?? scene;
    const keyframes = shotKeyframeAssets(projectAssets, targetShot, state.jobs);
    const targetAspectRatio = intake.videoFrame?.aspectRatio ?? "9:16";
    const generatedPrompt = buildVideoGenerationPrompt({
      shot: targetShot,
      outputLanguage: productionLanguage,
      sourceMode: "frames"
    });
    const rawPrompt = compileVideoProviderRequest({
      platform: provider.platform,
      neutralPrompt: generatedPrompt,
      shot: targetShot,
      aspectRatio: targetAspectRatio,
      sourceMode: "frames",
      quality: "fast",
      outputLanguage: productionLanguage
    }).prompt;
    const prompt = completedCompactedPrompt(targetShot.id, flowPromptFingerprint(rawPrompt), flowShotFingerprint(targetShot), utf8ByteLength(rawPrompt)) || rawPrompt;
    const startFrame = keyframes[0];
    const speakerCharacter = targetShot.speakerCharacterId
      ? projectCharacters.find((candidate) => candidate.id === targetShot.speakerCharacterId)
      : undefined;
    const references = [
      ...(startFrame ? [{
        assetId: startFrame.id,
        filePath: startFrame.filePath,
        referenceRole: "shot_keyframe" as const,
        referenceLabel: `${targetScene.title} SH${targetShot.order} keyframe`
      }] : []),
      ...semanticVideoReferencesForShot(targetShot, speakerCharacter, Boolean(startFrame)).map((reference) => ({
        assetId: reference.id,
        filePath: reference.filePath,
        referenceRole: providerReferenceRole(reference),
        referenceLabel: reference.name
      }))
    ];
    return validateVideoPreflight({
      shot: targetShot,
      previousShot: projectShots[projectShots.findIndex((candidate) => candidate.id === targetShot.id) - 1],
      prompt,
      references,
      assets: projectAssets,
      jobs: state.jobs,
      provider: provider.platform,
      aspectRatio: targetAspectRatio,
      providerRoute: provider.targetUrl
    });
  }

function runJob() {
    queueProviderJob(runtime.selectedProvider);
  }

function queueVideoJob(targetShot = runtime.selectedShot) {
    const { intake, selectedProvider, setPipelineRun, state, pendingVideoDispatchShotIdsRef, projectAssets } = runtime;
    if (pendingVideoDispatchShotIdsRef.current.has(targetShot.id)) return false;
    pendingVideoDispatchShotIdsRef.current.add(targetShot.id);
    window.setTimeout(() => pendingVideoDispatchShotIdsRef.current.delete(targetShot.id), 5_000);
    const targetShotHasKeyframe = shotKeyframeAssets(projectAssets, targetShot, state.jobs).length > 0;
    // A targeted regeneration already has an authored keyframe and shot
    // direction. Do not re-apply the project-wide character gate here: that
    // gate is for the initial pipeline, while Flow can safely rebuild the
    // provider prompt from the existing shot fields.
    if (getWorkflowBridge() && !targetShotHasKeyframe) {
      const missingStep = "storyboard";
      setPipelineRun({
        mode: "step",
        running: false,
        currentStep: missingStep,
        message: "Dừng: shot này chưa có đủ nhận diện, prompt và keyframe nên chưa được gửi Flow.",
        startedAt: new Date().toISOString()
      });
      return false;
    }
    const videoProvider = state.providers.find((provider) => provider.id === intake.aiRouting?.videoProvider && provider.capabilities.includes("video")) ??
      state.providers.find((provider) => provider.capabilities.includes("video")) ??
      selectedProvider;
    queueProviderJob(videoProvider, targetShot);
    return true;
  }

function preflightVideoJob(targetShot = runtime.selectedShot) {
    const { state, intake, selectedProvider } = runtime;
    const videoProvider = state.providers.find((provider) => provider.id === intake.aiRouting?.videoProvider && provider.capabilities.includes("video")) ??
      state.providers.find((provider) => provider.capabilities.includes("video")) ?? selectedProvider;
    queueProviderJob(videoProvider, targetShot, { preflightOnly: true });
  }
export function createVideoProviderActions(deps: VideoProviderActionDependencies) {
  runtime = deps;
  return { preflightVideoJob, providerReferenceRole, queueProviderJob, queueVideoJob, runJob, semanticVideoReferencesForShot, videoPreflightForShot };
}
