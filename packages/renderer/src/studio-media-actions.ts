import type { RunJobRequest } from "@studio/types/job-request";
import type { RunJobPayload } from "@studio/workflow/support-core";
import type { Asset, AutomationJob, Project, ProjectIntake, ProductionGraphNodeSettings, Shot, StudioState } from "@studio/types";
import { getWorkflowBridge } from "@studio/workflow/workflow-bridge";

type MediaActionDependencies = {
  project: Project;
  projectShots: Shot[];
  state: StudioState;
  intake: ProjectIntake;
  makeId: (prefix: string) => string;
  replaceState: (state: StudioState) => void;
  runDemoJob: (payload: RunJobPayload) => void;
  queueProviderJob: (provider: StudioState["providers"][number], shot: Shot, settings: Record<string, unknown>) => void;
  runStoryboardRatioRepairQueue: (items: Array<{ shotId: string }>, kind: "scene_frames" | "shot_keyframes") => void;
  retryAutomationJob: (job: AutomationJob) => boolean;
};

function regeneratePlaceholderMedia(deps: MediaActionDependencies, placeholderKind: unknown, shotId: string, settings: ProductionGraphNodeSettings) {
  const targetShot = deps.projectShots.find((shot) => shot.id === shotId);
  if (!targetShot) return false;
  if (placeholderKind === "video") {
    const provider = deps.state.providers.find((candidate) => candidate.id === (settings.providerId || deps.intake.aiRouting?.videoProvider) && candidate.capabilities.includes("video"))
      ?? deps.state.providers.find((candidate) => candidate.capabilities.includes("video"));
    if (!provider) return false;
    deps.queueProviderJob(provider, targetShot, { outputLanguage: settings.outputLanguage, videoQuality: settings.videoQuality, generateAudio: settings.generateAudio });
    return true;
  }
  deps.runStoryboardRatioRepairQueue([{ shotId: targetShot.id }], placeholderKind === "shot-image" ? "shot_keyframes" : "scene_frames");
  return true;
}

function regenerateVideoAsset(deps: MediaActionDependencies, asset: Asset, instruction: string, settings: ProductionGraphNodeSettings) {
  const sourceJob = deps.state.jobs.find((job) => job.id === asset.sourceJobId || job.resultAssetIds.includes(asset.id));
  const targetShotId = (asset as Asset & { shotId?: string }).shotId || sourceJob?.shotId;
  const targetShot = deps.projectShots.find((shot) => shot.id === targetShotId);
  const providerToken = settings.providerId || deps.intake.aiRouting?.videoProvider || sourceJob?.providerId;
  const provider = deps.state.providers.find((candidate) => (candidate.id === providerToken || candidate.platform === providerToken) && candidate.capabilities.includes("video"))
    ?? deps.state.providers.find((candidate) => candidate.capabilities.includes("video"));
  if (!targetShot || !provider) return false;
  deps.queueProviderJob(provider, targetShot, { revisionInstruction: instruction.trim() || undefined, startFrameAssetId: deps.project.productionGraphNodeSettings?.[`output:${targetShot.id}:image`]?.selectedAssetId, outputLanguage: settings.outputLanguage, videoQuality: settings.videoQuality, generateAudio: settings.generateAudio });
  return true;
}

function regenerateStandaloneReference(deps: MediaActionDependencies, asset: Asset, instruction: string, settings: ProductionGraphNodeSettings) {
  if (!asset.metadata?.generatedReference) return false;
  const provider = findImageProvider(deps, settings, asset);
  if (!provider) return false;
  const jobId = deps.makeId("reference_revision");
  const sourcePrompt = String(asset.metadata?.prompt || "Regenerate this locked visual reference while preserving its identity and composition.");
  const request = instruction.trim();
  const prompt = request ? `${sourcePrompt}\n\nREVISION REQUEST:\n${request}\nPreserve every visible detail that this request does not explicitly change.` : sourcePrompt;
  const bridgeMessage = buildStandaloneReferenceMessage(deps, asset, settings, provider.platform, jobId, prompt);
  const payload: RunJobPayload = { jobId, projectId: deps.project.id, providerId: provider.id, jobType: "image", prompt, bridgeMessage };
  if (getWorkflowBridge()) getWorkflowBridge().runJob(payload).then(deps.replaceState); else deps.runDemoJob(payload);
  return true;
}

function findImageProvider(deps: MediaActionDependencies, settings: ProductionGraphNodeSettings, asset: Asset) {
  const providerToken = settings.providerId || asset.sourceProvider || deps.intake.aiRouting?.imageProvider;
  return deps.state.providers.find((candidate) => (candidate.id === providerToken || candidate.platform === providerToken) && candidate.capabilities.includes("image"))
    ?? deps.state.providers.find((candidate) => candidate.capabilities.includes("image"));
}

function buildStandaloneReferenceMessage(deps: MediaActionDependencies, asset: Asset, settings: ProductionGraphNodeSettings, provider: RunJobRequest["provider"], jobId: string, prompt: string): RunJobRequest {
  return {
    type: "RUN_JOB", jobId, provider, task: "text_to_image", prompt,
    references: [{ assetId: asset.id, filePath: asset.filePath, referenceRole: "character_identity", referenceLabel: String(asset.metadata?.characterSlot || asset.id) }],
    settings: { aspectRatio: settings.aspectRatio || deps.intake.videoFrame?.aspectRatio || "9:16", durationSec: 4, quality: "balanced", newConversation: true, sessionKey: `${deps.project.id}:reference:${asset.id}`, outputLanguage: settings.outputLanguage || deps.intake.outputLanguage },
    download: { auto: true, targetFolder: `/data/projects/${deps.project.id}/references`, filenameTemplate: `${asset.id}-revision` }
  };
}

function regenerateExistingImage(deps: MediaActionDependencies, sourceJob: AutomationJob, oldPayload: RunJobPayload, oldBridgeMessage: RunJobRequest, instruction: string, settings: ProductionGraphNodeSettings) {
  const request = instruction.trim();
  if (!request && !settings.providerId && !settings.aspectRatio && !settings.outputLanguage) return deps.retryAutomationJob(sourceJob);
  const jobId = deps.makeId("image_revision");
  const prompt = request ? `${oldBridgeMessage.prompt}\n\nREVISION REQUEST:\n${request}\nPreserve every visible detail that this request does not explicitly change.` : oldBridgeMessage.prompt;
  const bridgeMessage: RunJobRequest = { ...oldBridgeMessage, jobId, prompt, conversationUrl: sourceJob.providerConversationUrl || oldBridgeMessage.conversationUrl, settings: { ...oldBridgeMessage.settings, aspectRatio: settings.aspectRatio || oldBridgeMessage.settings.aspectRatio, outputLanguage: settings.outputLanguage || oldBridgeMessage.settings.outputLanguage, newConversation: false } };
  const payload: RunJobPayload = { ...oldPayload, providerId: settings.providerId || oldPayload.providerId, jobId, prompt, bridgeMessage, retryOfJobId: oldPayload.retryOfJobId || sourceJob.id, retryAttempt: Math.max(1, Number(oldPayload.retryAttempt || 0) + 1) };
  if (getWorkflowBridge()) { getWorkflowBridge().runJob(payload).then(deps.replaceState); return true; }
  deps.runDemoJob(payload);
  return true;
}

function regenerateImageAsset(deps: MediaActionDependencies, asset: Asset, instruction: string, settings: ProductionGraphNodeSettings) {
  const sourceJob = deps.state.jobs.find((job) => job.id === asset.sourceJobId || job.resultAssetIds.includes(asset.id));
  const oldPayload = sourceJob?.input as RunJobPayload | undefined;
  const oldBridgeMessage = oldPayload?.bridgeMessage;
  if (!sourceJob || !oldPayload || oldBridgeMessage?.type !== "RUN_JOB") return regenerateStandaloneReference(deps, asset, instruction, settings);
  return regenerateExistingImage(deps, sourceJob, oldPayload, oldBridgeMessage, instruction, settings);
}

function regenerateProductionMedia(deps: MediaActionDependencies, asset: Asset, instruction = "", settings: ProductionGraphNodeSettings = {}) {
  const placeholderKind = asset.metadata?.placeholderKind;
  const placeholderShotId = typeof asset.metadata?.shotId === "string" ? asset.metadata.shotId : undefined;
  if (placeholderKind && placeholderShotId) return regeneratePlaceholderMedia(deps, placeholderKind, placeholderShotId, settings);
  return asset.type === "video" ? regenerateVideoAsset(deps, asset, instruction, settings) : regenerateImageAsset(deps, asset, instruction, settings);
}

export function createStudioMediaActions(deps: MediaActionDependencies) {
  return { regenerateProductionMedia: (asset: Asset, instruction = "", settings: ProductionGraphNodeSettings = {}) => regenerateProductionMedia(deps, asset, instruction, settings) };
}
