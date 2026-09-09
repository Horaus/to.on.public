import { getWorkflowBridge } from "../workflow-bridge";
import type { RunJobRequest } from "@studio/types/job-request";
import type { Asset, AutomationJob, Character, Project, ProjectIntake, Scene, Shot, StudioState, StyleBible, VisualReference } from "@studio/types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { shotKeyframeAssets } from "@studio/workflow/media-asset-selectors";
import { makeId } from "@studio/domain/identifiers";
import { buildCleanShotKeyframePrompt, buildStoryboardScenePrompt, resolvedSceneContinuity } from "@studio/workflow/storyboard-prompts";
import type { PendingStoryboardQueue, PipelineRunState, VideoAspectRatio } from "@studio/workflow/studio-types";
import { buildPrompt } from "@studio/workflow/video-prompt-legacy";

type StoryboardActionDependencies = {
  character: Character; characterReadyForPipeline: boolean; intake: ProjectIntake; pendingStoryboardQueueRef: RefObject<PendingStoryboardQueue | null>; productionLanguage: string; project: Project; projectAssets: Asset[]; projectScenes: Scene[]; projectShots: Shot[]; promptsReadyForPipeline: boolean; scene: Scene;
  replaceState: (state: StudioState) => void; runDemoJob: (payload: RunJobPayload) => void; selectedShot: Shot; setPipelineRun: Dispatch<SetStateAction<PipelineRunState | null>>; state: StudioState; storyboardAspectRatio: VideoAspectRatio; style: StyleBible;
  updatePendingStoryboardQueue: (queue: PendingStoryboardQueue | null, projectId: string) => void; updateProjectPatch: (patch: Partial<Project>) => void; updateScene: (patch: Partial<Scene> & { id: string }) => void; updateShot: (patch: Partial<Shot> & { id: string }) => void;
};

type RunJobPayload = {
  jobId: string; projectId: string; shotId?: string; providerId: string;
  jobType: AutomationJob["jobType"]; prompt: string; bridgeMessage: RunJobRequest;
};

function jobMessage(job: AutomationJob) {
  return (job.input as RunJobPayload | undefined)?.bridgeMessage;
}

function latestConversationForSession(jobs: AutomationJob[], projectId: string, providerId: string, sessionKey: string) {
  return jobs.filter((job) => job.projectId === projectId && job.providerId === providerId && job.providerConversationUrl?.startsWith("https://chatgpt.com/c/") && jobMessage(job)?.settings?.sessionKey === sessionKey)
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0]?.providerConversationUrl;
}

function referencesMissingFromConversation<T extends { assetId: string }>(references: T[], conversationUrl: string | undefined, jobs: AutomationJob[], assets: Asset[], visualReferences: VisualReference[]) {
  if (!conversationUrl) return references;
  return references.filter(({ assetId }) =>
    !visualReferences.some((reference) => reference.id === assetId && reference.providerConversationUrl === conversationUrl) &&
    !assets.some((asset) => asset.id === assetId && asset.metadata?.conversationUrl === conversationUrl) &&
    !jobs.some((job) => job.providerConversationUrl === conversationUrl && job.providerReferenceAssetIds?.includes(assetId))
  );
}

let runtime: StoryboardActionDependencies;

type StoryboardQueueItem = PendingStoryboardQueue["items"][number];

function uniqueLockedReferences(references: VisualReference[]) {
  return Array.from(new Map([...references].reverse().map((item) => [
    `${item.characterSlot || item.name}:${item.role}:${item.referenceUse || "supporting_detail"}`,
    item
  ])).values());
}

function referencesForStoryboardItem(
  project: Project,
  item: StoryboardQueueItem,
  lockedReferences: VisualReference[]
) {
  const requirements = project.storyDocument?.visualRequirements ?? [];
  const requirementIds = item.shot.referenceRequirementIds?.length
    ? item.shot.referenceRequirementIds
    : item.scene.referenceRequirementIds ?? [];
  return requirementIds.map((requirementId) => {
    const requirement = requirements.find((candidate) => candidate.id === requirementId);
    if (!requirement) return undefined;
    return lockedReferences.find((reference) =>
      (reference.characterSlot === requirement.id || (reference.role === requirement.role && reference.name === requirement.name)) &&
      (requirement.role === "location" || requirement.role === "prop" || reference.referenceUse === "primary_identity")
    );
  }).filter((reference): reference is VisualReference => Boolean(reference));
}

function requestedStoryboardReferences(
  item: StoryboardQueueItem,
  references: VisualReference[],
  sourceAsset?: Asset
) {
  return [
    ...references.map((reference) => ({
      assetId: reference.id,
      filePath: reference.filePath,
      referenceRole: reference.role === "location" ? "setting" as const : reference.role === "prop" ? "prop" as const : reference.referenceUse === "primary_identity" ? "character_identity" as const : "character_detail" as const,
      referenceLabel: reference.name
    })),
    ...(sourceAsset ? [{
      assetId: sourceAsset.id,
      filePath: sourceAsset.filePath,
      referenceRole: "shot_keyframe" as const,
      referenceLabel: `${item.scene.title} source frame`
    }] : [])
  ];
}

function storyboardDownloadSettings(
  project: Project,
  item: StoryboardQueueItem,
  queue: PendingStoryboardQueue,
  providerPlatform: RunJobRequest["provider"]
) {
  return {
    auto: true,
    targetFolder: `/data/projects/${project.id}/storyboard/scene-${item.scene.order}`,
    filenameTemplate: queue.mode === "shot_keyframes"
      ? `KEYFRAME_SC${String(item.scene.order).padStart(2, "0")}_SH${String(item.shot.order).padStart(2, "0")}_${providerPlatform}_[index]`
      : `STORYBOARD_SC${String(item.scene.order).padStart(2, "0")}_${providerPlatform}_[index]`
  };
}

function storyboardPrompt(
  queue: PendingStoryboardQueue,
  item: StoryboardQueueItem,
  project: Project,
  style: StyleBible,
  character: Character,
  references: VisualReference[],
  aspectRatio: VideoAspectRatio,
  sourceShot: Shot | undefined,
  continuityText: string,
  isFirstScene: boolean
) {
  return queue.mode === "shot_keyframes"
    ? buildCleanShotKeyframePrompt({ project, style, character, scene: item.scene, shot: item.shot, references, aspectRatio, sourceShot, continuityText })
    : buildStoryboardScenePrompt({ project, style, character, scene: item.scene, shot: item.shot, references, sceneCount: queue.items.length, aspectRatio, isFirstScene, repairAspectRatio: queue.repairAspectRatio, continuityText });
}

function generatePrompt() {
    const { style, character, scene, selectedShot, storyboardAspectRatio, productionLanguage, updateShot } = runtime;
    updateShot({ id: selectedShot.id, prompt: buildPrompt(style, character, scene, selectedShot, storyboardAspectRatio, productionLanguage) });
  }

function updateStoryboardBreakdown(text: string) {
    const { project, updateProjectPatch } = runtime;
    updateProjectPatch({
      storyDocument: {
        ...(project.storyDocument ?? { logline: "", story: "", sceneBreakdown: "", generatedAt: new Date().toISOString() }),
        sceneBreakdown: text,
        manuallyEdited: true
      }
    });
  }

function syncStoryboardBreakdownToScenes() {
    const { project, projectScenes, updateScene } = runtime;
    const source = project.storyDocument?.sceneBreakdown || project.sourceDraft || "";
    const blocks = source
      .split(/\n\s*(?:---+|#{2,}|SCENE\s+\d+|C[ẢA]NH\s+\d+)\s*/i)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!blocks.length) return;
    const orderedScenes = [...projectScenes].sort((a, b) => a.order - b.order);
    orderedScenes.forEach((item, index) => {
      const block = blocks[index];
      if (!block) return;
      const [titleLine, ...rest] = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const summary = (rest.join(" ") || titleLine).slice(0, 420);
      updateScene({ id: item.id, summary });
    });
  }

function buildStoryboardScenePayload(sourceState: StudioState, queue: PendingStoryboardQueue, index: number, conversationUrl?: string): RunJobPayload | null {
    const activeProject = sourceState.projects.find((item) => item.id === queue.projectId);
    const provider = sourceState.providers.find((item) => item.id === queue.providerId);
    if (!activeProject || !provider) return null;
    const activeStyle = sourceState.styleBibles.find((item) => item.id === activeProject.styleBibleId) ?? sourceState.styleBibles[0];
    const activeCharacter = sourceState.characters.find((item) => item.projectId === activeProject.id) ?? sourceState.characters[0];
    const activeReferences = sourceState.visualReferences.filter((item) => item.projectId === activeProject.id);
    const lockedReferences = uniqueLockedReferences(activeReferences);
    const item = queue.items[index];
    if (!item || !activeStyle || !activeCharacter) return null;
    const sceneReferences = referencesForStoryboardItem(activeProject, item, lockedReferences);
    const isFirstScene = index === 0;
    const aspectRatio = activeProject.intake?.videoFrame?.aspectRatio ?? "9:16";
    const sourceAsset = item.sourceAssetId ? sourceState.assets.find((asset) => asset.id === item.sourceAssetId) : undefined;
    const sourceShot = sourceAsset ? sourceState.shots.find((shot) => shot.assetIds.includes(sourceAsset.id)) : undefined;
    const activeScenes = sourceState.scenes.filter((scene) => scene.projectId === activeProject.id);
    const continuityText = resolvedSceneContinuity(item.scene, activeScenes);
    const promptText = storyboardPrompt(queue, item, activeProject, activeStyle, activeCharacter, sceneReferences, aspectRatio, sourceShot, continuityText, isFirstScene);
    const jobId = makeId("storyboard");
    const requestedReferences = requestedStoryboardReferences(item, sceneReferences, sourceAsset);
    const pendingReferences = referencesMissingFromConversation(
      requestedReferences,
      conversationUrl,
      sourceState.jobs,
      sourceState.assets,
      sourceState.visualReferences
    );
    const bridgeMessage: RunJobRequest = {
      type: "RUN_JOB",
      jobId,
      provider: provider.platform,
      task: "text_to_image",
      prompt: promptText,
      conversationUrl,
      references: pendingReferences,
      settings: {
        aspectRatio,
        durationSec: item.shot.durationSec,
        quality: "balanced",
        newConversation: isFirstScene && !conversationUrl,
        sessionKey: queue.sessionKey,
        reusePreviousContext: !isFirstScene,
        storyboardSceneOrder: item.scene.order,
        storyboardSceneCount: queue.items.length,
        storyboardSequenceId: queue.sequenceId,
        storyboardMode: queue.mode || "scene_frames",
        repairAspectRatio: queue.repairAspectRatio,
        sourceAssetId: sourceAsset?.id
      },
      download: storyboardDownloadSettings(activeProject, item, queue, provider.platform)
    };
    return {
      jobId,
      projectId: activeProject.id,
      shotId: item.shot.id,
      providerId: provider.id,
      jobType: "image",
      prompt: promptText,
      bridgeMessage
    };
  }

function dispatchStoryboardScene(sourceState: StudioState, queue: PendingStoryboardQueue, index: number, conversationUrl?: string) {
    const { replaceState, runDemoJob, updatePendingStoryboardQueue } = runtime;
    const payload = buildStoryboardScenePayload(sourceState, queue, index, conversationUrl);
    if (!payload) return;
    queue.previousJobId = payload.jobId;
    queue.nextIndex = index + 1;
    updatePendingStoryboardQueue(queue, queue.projectId);
    if (getWorkflowBridge()) {
      getWorkflowBridge().runJob(payload).then(replaceState);
      return;
    }
    runDemoJob(payload);
  }

function continueStoryboardQueue(sourceState: StudioState) {
    const { pendingStoryboardQueueRef, updatePendingStoryboardQueue } = runtime;
    const queue = pendingStoryboardQueueRef.current;
    if (!queue) return;
    if (queue.nextIndex >= queue.items.length) {
      updatePendingStoryboardQueue(null, queue.projectId);
      return;
    }
    if (!queue.previousJobId) return;
    const previousJob = sourceState.jobs.find((job) => job.id === queue.previousJobId);
    if (!previousJob) return;
    const finished = ["review_required", "approved", "done"].includes(previousJob.status);
    if (!finished) return;
    const conversationUrl = previousJob.providerConversationUrl;
    if (!conversationUrl?.startsWith("https://chatgpt.com/")) return;
    dispatchStoryboardScene(sourceState, queue, queue.nextIndex, conversationUrl);
  }

function runStoryboardOverviewQueue() {
const { characterReadyForPipeline, promptsReadyForPipeline, setPipelineRun, state, intake, projectScenes, projectShots, projectAssets, project } = runtime;
    if (!characterReadyForPipeline || !promptsReadyForPipeline) {
      setPipelineRun({
        mode: "step",
        running: false,
        currentStep: characterReadyForPipeline ? "prompts" : "character",
        message: characterReadyForPipeline
          ? "Dừng: chưa dựng prompt storyboard đầy đủ nên chưa được tạo keyframe."
          : "Dừng: chưa khóa đủ nhận diện nhân vật/phong cách nên chưa được tạo keyframe.",
        startedAt: new Date().toISOString()
      });
      return;
    }
    const provider = state.providers.find((item) => item.id === intake.aiRouting?.imageProvider) ??
      state.providers.find((item) => item.id === "chatgpt-web") ??
      state.providers[0];
    if (!provider) return;
    const orderedScenes = [...projectScenes].sort((a, b) => a.order - b.order);
    const items = orderedScenes
      .map((item) => ({ scene: item, shot: projectShots.find((shot) => shot.sceneId === item.id) }))
      .filter((item) => item.shot ? shotKeyframeAssets(projectAssets, item.shot, state.jobs).length === 0 : true)
      .filter((item): item is { scene: Scene; shot: Shot } => Boolean(item.shot));
    if (!items.length) return;
    const queue: PendingStoryboardQueue = {
      sequenceId: makeId("storyboard_sequence"),
      projectId: project.id,
      providerId: provider.id,
      sessionKey: `${project.id}:storyboard-overview`,
      items,
      nextIndex: 0
    };
    dispatchStoryboardScene(state, queue, 0);
  }

function runMissingShotKeyframeQueue() {
    const { characterReadyForPipeline, promptsReadyForPipeline, setPipelineRun, state, intake, projectScenes, projectShots, projectAssets, project } = runtime;
    if (!characterReadyForPipeline || !promptsReadyForPipeline) {
      setPipelineRun({
        mode: "step",
        running: false,
        currentStep: characterReadyForPipeline ? "prompts" : "character",
        message: characterReadyForPipeline
          ? "Dừng: chưa dựng prompt storyboard đầy đủ nên chưa được tạo keyframe."
          : "Dừng: chưa khóa đủ nhận diện nhân vật/phong cách nên chưa được tạo keyframe.",
        startedAt: new Date().toISOString()
      });
      return;
    }
    const provider = state.providers.find((item) => item.id === intake.aiRouting?.imageProvider) ??
      state.providers.find((item) => item.id === "chatgpt-web") ??
      state.providers[0];
    if (!provider) return;
    const items = [...projectScenes]
      .sort((a, b) => a.order - b.order)
      .flatMap((sceneItem) => projectShots
        .filter((shot) => shot.sceneId === sceneItem.id)
        .sort((a, b) => a.order - b.order)
        .filter((shot) => shotKeyframeAssets(projectAssets, shot, state.jobs).length === 0)
        .map((shot) => ({ scene: sceneItem, shot })));
    if (!items.length) return;
    const queue: PendingStoryboardQueue = {
      sequenceId: makeId("shot_keyframes"),
      projectId: project.id,
      providerId: provider.id,
      sessionKey: `${project.id}:all-shot-keyframes`,
      items,
      nextIndex: 0,
      mode: "shot_keyframes"
    };
    dispatchStoryboardScene(state, queue, 0);
  }

function runStoryboardRatioRepairQueue(
    targets: Array<{ shotId: string; sourceAssetId?: string }>,
    mode: NonNullable<PendingStoryboardQueue["mode"]> = "scene_frames"
  ) {
const { characterReadyForPipeline, promptsReadyForPipeline, setPipelineRun, state, intake, project, projectScenes, projectShots, storyboardAspectRatio } = runtime;
    if (!characterReadyForPipeline || !promptsReadyForPipeline) {
      setPipelineRun({
        mode: "step",
        running: false,
        currentStep: characterReadyForPipeline ? "prompts" : "character",
        message: "Dừng: chưa đủ dữ liệu bắt buộc nên chưa được repair keyframe.",
        startedAt: new Date().toISOString()
      });
      return;
    }
    const provider = state.providers.find((item) => item.id === intake.aiRouting?.imageProvider) ??
      state.providers.find((item) => item.id === "chatgpt-web") ??
      state.providers[0];
    if (!provider) return;
    const targetMap = new Map(targets.map((item) => [item.shotId, item.sourceAssetId]));
    const items = [...projectScenes]
      .sort((a, b) => a.order - b.order)
      .flatMap((sceneItem) => projectShots
        .filter((shot) => shot.sceneId === sceneItem.id && targetMap.has(shot.id))
        .map((shot) => ({ scene: sceneItem, shot, sourceAssetId: targetMap.get(shot.id) })));
    if (!items.length) return;
    const sessionKey = `${project.id}:manual:${mode}:${storyboardAspectRatio}`;
    const queue: PendingStoryboardQueue = {
      sequenceId: makeId("storyboard_ratio"),
      projectId: project.id,
      providerId: provider.id,
      sessionKey,
      items,
      nextIndex: 0,
      repairAspectRatio: storyboardAspectRatio,
      mode
    };
    const sourceConversation = latestConversationForSession(state.jobs, project.id, provider.id, sessionKey);
    dispatchStoryboardScene(state, queue, 0, sourceConversation);
  }

function runSceneMissingKeyframeQueue(sceneId: string) {
    const { characterReadyForPipeline, promptsReadyForPipeline, setPipelineRun, state, intake, projectScenes, projectShots, projectAssets, project } = runtime;
    if (!characterReadyForPipeline || !promptsReadyForPipeline) {
      setPipelineRun({
        mode: "step",
        running: false,
        currentStep: characterReadyForPipeline ? "prompts" : "character",
        message: characterReadyForPipeline
          ? "Dừng: chưa dựng prompt storyboard đầy đủ nên chưa được tạo keyframe."
          : "Dừng: chưa khóa đủ nhận diện nhân vật/phong cách nên chưa được tạo keyframe.",
        startedAt: new Date().toISOString()
      });
      return;
    }
    const provider = state.providers.find((item) => item.id === intake.aiRouting?.imageProvider) ??
      state.providers.find((item) => item.id === "chatgpt-web") ??
      state.providers[0];
    if (!provider) return;
    const sceneItem = projectScenes.find((item) => item.id === sceneId);
    if (!sceneItem) return;
    const sceneShots = projectShots
      .filter((shot) => shot.sceneId === sceneId)
      .sort((a, b) => a.order - b.order);
    // A scene with one shot still needs an explicit keyframe queue. The old
    // guard made the single-shot path silently impossible and forced the UI
    // to mislabel the action as a video repair.
    if (sceneShots.length === 0) return;
    const keyframeForShot = (shot: Shot) => shotKeyframeAssets(projectAssets, shot, state.jobs)[0];
    const items = sceneShots
      .filter((shot) => !keyframeForShot(shot))
      .map((shot) => {
        const previousSource = [...sceneShots]
          .filter((candidate) => candidate.order < shot.order)
          .reverse()
          .map(keyframeForShot)
          .find(Boolean);
        return { scene: sceneItem, shot, sourceAssetId: previousSource?.id };
      });
    if (!items.length) return;
    const queue: PendingStoryboardQueue = {
      sequenceId: makeId("shot_keyframes"),
      projectId: project.id,
      providerId: provider.id,
      sessionKey: `${project.id}:shot-keyframes:${sceneId}`,
      items,
      nextIndex: 0,
      mode: "shot_keyframes"
    };
    dispatchStoryboardScene(state, queue, 0);
  }
export function createStoryboardActions(deps: StoryboardActionDependencies) {
  runtime = deps;
  return { buildStoryboardScenePayload, continueStoryboardQueue, dispatchStoryboardScene, generatePrompt, runMissingShotKeyframeQueue, runSceneMissingKeyframeQueue, runStoryboardOverviewQueue, runStoryboardRatioRepairQueue, syncStoryboardBreakdownToScenes, updateStoryboardBreakdown };
}
