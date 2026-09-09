import { getWorkflowBridge } from "../workflow-bridge";
/** Composition boundary for the application model.
 * The model owns state and dependency values; this module owns wiring the
 * independent action families. It is intentionally not a barrel for callers.
 */
import { createPipelineActions } from "./pipeline-actions";
import { createStoryDevelopmentActions } from "./story-development-actions";
import { createStoryDocumentActions } from "./story-document-actions";
import { createStoryRevisionAction } from "./story-revision-action";
import { createStoryboardActions } from "./storyboard-actions";
import type { Asset, AutomationJob, BrowserProviderAdapter, Character, Project, ProjectIntake, Scene, Shot, StoryCharacter, StudioState, StyleBible, VisualReference } from "@studio/types";
import type { Dispatch, SetStateAction } from "react";
import { normalizeSlotName } from "@studio/domain/identifiers";
import type { RunJobPayload } from "@studio/workflow/support-core";
import { makeId } from "@studio/domain/identifiers";
import type { VideoAspectRatio } from "@studio/workflow/support-core";
import { buildTranslationPrompt } from "@studio/workflow/translation-prompt";
import { shotKeyframeAssets, shotVideoAssets } from "@studio/workflow/media-asset-selectors";
import { buildPrompt } from "@studio/workflow/video-prompt-legacy";
import { buildVideoGenerationPrompt } from "@studio/workflow/video-generation";
export { createRetryAction } from "./retry-action";

type TextUtilityDependencies = { contentLanguage: string; contentLanguageMismatch: boolean; intakeTextProviderId?: string; productionLanguage: string; project: Project; projectScenes: Scene[]; projectShots: Shot[]; providers: BrowserProviderAdapter[]; replaceState: (state: StudioState) => void; state: StudioState; storyboardAspectRatio: VideoAspectRatio; textProvider: BrowserProviderAdapter; translationJobActive: boolean };

function createTextUtilityActions(deps: TextUtilityDependencies) {
  function runTextUtility(provider: BrowserProviderAdapter, task: "connection_test" | "translation", prompt: string, settings: RunJobPayload["bridgeMessage"]["settings"]) {
    const jobId = makeId(task === "translation" ? "translate" : "connection");
    const payload: RunJobPayload = { jobId, projectId: deps.project.id, providerId: provider.id, jobType: "text", prompt, bridgeMessage: { type: "RUN_JOB", jobId, provider: provider.platform, task, prompt, references: [], settings, download: { auto: false, targetFolder: task === "translation" ? `/data/projects/${deps.project.id}/translations` : "", filenameTemplate: task === "translation" ? `translate-${normalizeSlotName(deps.productionLanguage)}` : "connection-test" } } };
    if (getWorkflowBridge()) return void getWorkflowBridge().runJob(payload).then(deps.replaceState);
    if (task !== "connection_test") return;
    const stamp = new Date().toISOString();
    deps.replaceState({ ...deps.state, jobs: [{ id: jobId, projectId: deps.project.id, providerId: provider.id, jobType: "text", input: payload, status: "approved", statusMessage: "UTF-8 text received directly from ChatGPT.", outputText: "Xin chào từ ChatGPT.", resultAssetIds: [], createdAt: stamp, updatedAt: stamp }, ...deps.state.jobs] });
  }
  function testChatGptConnection(): undefined {
    const provider = deps.providers.find((item) => item.id === deps.intakeTextProviderId) ?? deps.providers.find((item) => item.id === "chatgpt-web") ?? deps.providers[0];
    if (!provider) return undefined;
    runTextUtility(provider, "connection_test", "Hãy trả lời chính xác một câu ngắn bằng tiếng Việt: Xin chào từ ChatGPT. Không thêm nội dung nào khác.", { aspectRatio: "9:16", durationSec: 2, quality: "fast", newConversation: true });
    return undefined;
  }
  function translateProductionContext(): undefined {
    if (!deps.contentLanguageMismatch || deps.translationJobActive) return undefined;
    runTextUtility(deps.textProvider, "translation", buildTranslationPrompt(deps.project, deps.projectScenes, deps.projectShots, deps.contentLanguage, deps.productionLanguage), { aspectRatio: deps.storyboardAspectRatio, durationSec: 2, quality: "balanced", newConversation: true, sourceLanguage: deps.contentLanguage, targetLanguage: deps.productionLanguage, outputLanguage: deps.productionLanguage });
    return undefined;
  }
  return { testChatGptConnection, translateProductionContext };
}

type DemoActionDependencies = {
  character: Character; currentCharacterSlot: string; intake: ProjectIntake; productionLanguage: string; project: Project; projectAssets: Asset[]; projectScenes: Scene[]; projectShots: Shot[];
  scene: Scene; selectedShot: Shot; setState: Dispatch<SetStateAction<StudioState>>; state: StudioState; storyCharacters: StoryCharacter[]; storyboardAspectRatio: VideoAspectRatio; style: StyleBible;
};

export function createDemoActions(deps: DemoActionDependencies) {
  const runtime = deps;
  function completeDemoCharacterReferences() {
    const { character, currentCharacterSlot, project, setState, storyCharacters } = runtime;
    const stamp = new Date().toISOString();
    const slot = currentCharacterSlot || normalizeSlotName(character.name || "main-character");
    const baseReference: VisualReference = { id: makeId("reference"), projectId: project.id, name: `${storyCharacters[0]?.name || character.name || "Character"} AI reference`, role: "main_character", referenceUse: "primary_identity", characterSlot: slot, filePath: "/demo/project/references/character-primary.png", previewDataUrl: "/demo/project/references/character-primary.png", sourceDescription: "Demo locked full-body character identity reference.", transformationRequest: "Preserve this identity across storyboard keyframes.", createdAt: stamp };
    const detailReference: VisualReference = { ...baseReference, id: makeId("reference"), name: `${storyCharacters[0]?.name || character.name || "Character"} detail sheet`, referenceUse: "supporting_detail", filePath: "/demo/project/references/character-detail.png", previewDataUrl: "/demo/project/references/character-detail.png", sourceDescription: "Demo locked detail sheet with turnarounds, expressions, outfit, palette, and continuity notes.", transformationRequest: "Use as the detail continuity guide for shot generation." };
    setState((current) => ({ ...current, visualReferences: [...current.visualReferences, baseReference, detailReference] }));
  }
  function completeDemoAssetsForStep(step: "storyboard" | "video") {
    const { projectAssets, projectScenes, projectShots, scene, setState, state } = runtime;
    const stamp = new Date().toISOString();
    const targets = projectShots.filter((shot) => step === "storyboard" ? shotKeyframeAssets(projectAssets, shot, state.jobs).length === 0 : shotKeyframeAssets(projectAssets, shot, state.jobs).length > 0 && shotVideoAssets(projectAssets, shot, state.jobs).length === 0);
    if (!targets.length) return;
    const nextJobs: AutomationJob[] = []; const nextAssets: Asset[] = []; const shotAssetIds = new Map<string, string[]>();
    for (const shot of targets) { const targetScene = projectScenes.find((item) => item.id === shot.sceneId) ?? scene; const { asset, job } = createDemoResult(shot, targetScene, stamp, step); nextAssets.push(asset); nextJobs.push(job); shotAssetIds.set(shot.id, [asset.id]); }
    setState((current) => ({ ...current, assets: [...nextAssets, ...current.assets], jobs: [...nextJobs, ...current.jobs], shots: current.shots.map((shot) => { const ids = shotAssetIds.get(shot.id); return ids ? { ...shot, status: "review", assetIds: [...shot.assetIds, ...ids] } : shot; }) }));
  }
  function createDemoResult(shot: Shot, targetScene: Scene, stamp: string, step: "storyboard" | "video") {
    const { character, intake, productionLanguage, project, storyboardAspectRatio, style } = runtime; const isVideo = step === "video"; const jobId = makeId(isVideo ? "demo_video" : "demo_keyframe"); const assetId = makeId("asset"); const sourceMode = project.intake?.flowVideoMode ?? intake.flowVideoMode ?? "frames";
    const prompt = isVideo ? buildVideoGenerationPrompt({ shot, outputLanguage: productionLanguage, sourceMode }) : shot.prompt || buildPrompt(style, character, targetScene, shot, storyboardAspectRatio, productionLanguage); const providerId = isVideo ? "demo-video" : "demo-keyframe"; const jobType = isVideo ? "video" : "image"; const task = isVideo ? "image_to_video" : "text_to_image";
    const asset: Asset = { id: assetId, projectId: project.id, type: jobType, filePath: `/demo/project/assets/${assetId}.${isVideo ? "mp4" : "png"}`, sourceProvider: providerId, sourceJobId: jobId, prompt, metadata: { demo: true, durationSec: shot.durationSec, resolution: "1080x1920", aspectRatio: intake.videoFrame?.aspectRatio ?? "9:16", task }, createdAt: stamp };
    const input: RunJobPayload = { jobId, projectId: project.id, shotId: shot.id, providerId, jobType, prompt, bridgeMessage: { type: "RUN_JOB", jobId, provider: isVideo ? "flow" : "chatgpt", task, prompt, settings: { aspectRatio: intake.videoFrame?.aspectRatio ?? "9:16", durationSec: shot.durationSec, quality: "balanced" }, references: [], download: { auto: false, targetFolder: "/demo/project/assets", filenameTemplate: assetId } } };
    return { asset, job: { id: jobId, projectId: project.id, shotId: shot.id, providerId, jobType, input, status: "review_required", resultAssetIds: [assetId], createdAt: stamp, updatedAt: stamp, statusMessage: isVideo ? "Demo video placeholder generated." : "Demo keyframe placeholder generated." } as AutomationJob };
  }
  function runDemoJob(payload: RunJobPayload) {
    const { selectedShot, setState } = runtime; const stamp = new Date().toISOString(); const job: AutomationJob = { id: payload.jobId, projectId: payload.projectId, shotId: payload.shotId, providerId: payload.providerId, jobType: payload.jobType, input: payload, status: "generating", resultAssetIds: [], createdAt: stamp, updatedAt: stamp };
    setState((current) => ({ ...current, jobs: [job, ...current.jobs], shots: current.shots.map((shot) => shot.id === payload.shotId ? { ...shot, status: "running", prompt: payload.prompt } : shot) }));
    window.setTimeout(() => { const asset: Asset = { id: makeId("asset"), projectId: payload.projectId, type: payload.jobType === "video" ? "video" : "image", filePath: `/demo/project/assets/${payload.jobId}.${payload.jobType === "video" ? "mp4" : "png"}`, sourceProvider: payload.providerId, sourceJobId: payload.jobId, prompt: payload.prompt, metadata: { demo: true, durationSec: selectedShot.durationSec, resolution: "1080x1920", aspectRatio: payload.bridgeMessage.settings.aspectRatio, task: payload.bridgeMessage.task }, createdAt: new Date().toISOString() }; setState((current) => ({ ...current, assets: [asset, ...current.assets], jobs: current.jobs.map((item) => item.id === payload.jobId ? { ...item, status: "review_required", resultAssetIds: [asset.id], updatedAt: new Date().toISOString() } : item), shots: current.shots.map((shot) => shot.id === payload.shotId ? { ...shot, status: "review", assetIds: [...shot.assetIds, asset.id] } : shot) })); }, 1200);
  }
  return { completeDemoAssetsForStep, completeDemoCharacterReferences, runDemoJob };
}

export const studioActionFactories = {
  createDemoActions,
  createPipelineActions,
  createStoryDevelopmentActions,
  createStoryDocumentActions,
  createStoryRevisionAction,
  createStoryboardActions,
  createTextUtilityActions,
};
