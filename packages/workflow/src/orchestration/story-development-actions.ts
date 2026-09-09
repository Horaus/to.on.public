import { getWorkflowBridge } from "../workflow-bridge";
import type { RunJobRequest } from "@studio/types/job-request";
import { planProviderShotDurationsByWeights, recommendedProviderShotCount } from "@studio/domain/duration-policy";
import type { AutomationJob, Character, Project, ProjectIntake, ProviderPlatform, Scene, Shot, SkillPack, StudioState, VisualReference } from "@studio/types";
import type { BrowserProviderAdapter } from "@studio/types";
import type React from "react";
import { derivePlan } from "@studio/workflow/plan-derivation";
import { makeId } from "@studio/domain/identifiers";
import { buildScreenplayScenePrompt, buildShotBreakdownPrompt, screenplaySceneBudgetStatus } from "@studio/workflow/story-scene-prompts";
import { buildStoryArchitecturePrompt, buildStoryFoundationPrompt } from "@studio/workflow/story-foundation-prompts";
import { allocateSceneShotCounts, planSceneShotCuePackets, sceneShotPacketSpeechMinimums, sceneShotPacketWeights } from "@studio/workflow/studio-shot-planning";
import { isActiveJob, isProjectJobBusy } from "@studio/workflow/support-core";
import type { PipelineRunState } from "@studio/workflow/studio-types";

type RunJobPayload = {
  jobId: string; projectId: string; shotId?: string; providerId: string;
  jobType: AutomationJob["jobType"]; prompt: string; bridgeMessage: RunJobRequest;
  retryOfJobId?: string; retryAttempt?: number;
};

type StoryDevelopmentDependencies = {
  character: Character;
  intake: ProjectIntake;
  intakeRef: React.RefObject<ProjectIntake | null>;
  lockedProjectReferences: VisualReference[];
  productionLanguage: string;
  productionProjectReferences: VisualReference[];
  project: Project;
  projectSceneIds: Set<string>;
  projectScenes: Scene[];
  projectShots: Shot[];
  replaceState: (nextState: StudioState) => void;
  routedVideoPlatform: ProviderPlatform;
  selectedVideoSkill: SkillPack;
  setGeneratedStorySeed: React.Dispatch<React.SetStateAction<string>>;
  setPipelineRun: React.Dispatch<React.SetStateAction<PipelineRunState | null>>;
  skills: SkillPack[];
  state: StudioState;
  storySeed: string;
  textProvider: BrowserProviderAdapter;
};

let runtime: StoryDevelopmentDependencies;

function applyPlanner() {
  const { character, intake, productionLanguage, project, projectSceneIds, replaceState, routedVideoPlatform, setPipelineRun, state, storySeed } = runtime;
    const payload = derivePlan(project.id, storySeed, intake.targetDurationSec, routedVideoPlatform, productionLanguage);
    const stamp = new Date().toISOString();
    const nextStoryDocument = {
      logline: storySeed.split(/[.!?]/)[0] || storySeed || "Local draft story",
      story: `${storySeed || "Local draft story"}\n\nThe protagonist enters the situation with a clear need, encounters an escalating obstacle, discovers the hidden cause, and makes a decisive choice that resolves the immediate conflict while preserving a final emotional image.`,
      sceneBreakdown: payload.scenes.map((item) => `${item.order}. ${item.title}\n${item.summary}`).join("\n\n"),
      characters: [{
        name: character.name || "Main character",
        role: character.role || "main",
        // Keep narrative responsibility in the story document, but never copy it
        // into the editable character personality field or invent visual facts.
        storyFunction: "",
        visualBrief: character.visualDescription || "",
        required: true
      }],
      comments: [],
      manuallyEdited: false,
      generatedAt: stamp
      // A local draft is an editable convenience only. No durable stage is
      // approved here; foundation must still pass the provider contract before
      // architecture, screenplay, shot breakdown or media generation.
    };
    const plannerRun: PipelineRunState = {
      mode: "step",
      running: false,
      currentStep: "character",
      message: "Đã dựng nháp kịch bản. Tiếp theo cần khóa nhận diện nhân vật/phong cách.",
      startedAt: new Date().toISOString()
    };
    if (getWorkflowBridge()) {
      // The bridge apply-plan handler owns scene/shot persistence, while the
      // authored narrative artifact belongs to the project record. Persist
      // both in one chained handoff so a local draft cannot appear complete in
      // the editor while remaining blocked at story readiness after reload.
      getWorkflowBridge().applyPlan(payload)
        .then((incoming) => getWorkflowBridge()!.updateProject(project.id, {
          sourceDraft: storySeed,
          storyDocument: nextStoryDocument
        }).then((updated) => updated || incoming))
        .then((incoming) => {
          replaceState(incoming);
          setPipelineRun(plannerRun);
        });
      return;
    }
    replaceState({
      ...state,
      projects: state.projects.map((item) => item.id === project.id ? {
        ...item,
        sourceDraft: storySeed,
        intake: { ...(item.intake ?? intake), contentLanguage: productionLanguage },
        storyDocument: nextStoryDocument
      } : item),
      scenes: [...state.scenes.filter((item) => item.projectId !== project.id), ...payload.scenes],
      shots: [...state.shots.filter((item) => !projectSceneIds.has(item.sceneId)), ...payload.shots]
    });
    setPipelineRun(plannerRun);
}

function developStory() {
    const { project, replaceState, setGeneratedStorySeed, setPipelineRun, state, storySeed, textProvider } = runtime;
    setGeneratedStorySeed(storySeed);
    const { payload, storyTask, activeIntake } = createStoryJobPayload();
    if (getWorkflowBridge()) {
      const existingStoryJob = state.jobs.find((job) =>
        job.projectId === project.id &&
        job.providerId === textProvider.id &&
        job.jobType === "text" &&
        (job.input as RunJobPayload | undefined)?.bridgeMessage?.task === storyTask &&
        isActiveJob(job)
      );
      if (existingStoryJob) {
        const waiting = isProjectJobBusy(existingStoryJob);
        setPipelineRun((current) => current ? {
          ...current,
          running: waiting,
          message: waiting ? "Đang chờ ChatGPT trả kịch bản." : "Kịch bản đã được import. Chạy tiếp bước nhận diện."
        } : current);
        return;
      }
      getWorkflowBridge().updateProject(project.id, { sourceDraft: storySeed, intake: activeIntake }).then(() => getWorkflowBridge()!.runJob(payload)).then(replaceState);
      return;
    }
    applyLocalStoryDemo(payload);
}

function createStoryJobPayload() {
    const { intake, intakeRef, lockedProjectReferences, productionLanguage, productionProjectReferences, project, selectedVideoSkill, skills, storySeed, textProvider } = runtime;
    const activeIntake = intakeRef.current ?? intake;
    const storyTask = project.storyDocument?.foundationApprovedAt ? "story_architecture" as const : "story_foundation" as const;
    const prompt = storyTask === "story_architecture"
      ? buildStoryArchitecturePrompt(project, productionProjectReferences, selectedVideoSkill, skills.find((skill) => skill.id === "narrative-performance"))
      : buildStoryFoundationPrompt(storySeed, activeIntake, productionProjectReferences, selectedVideoSkill, skills.find((skill) => skill.id === "script-adaptation"), skills.find((skill) => skill.id === "narrative-performance"));
    const jobId = makeId("story");
    const bridgeMessage: RunJobRequest = {
      type: "RUN_JOB", jobId, provider: textProvider.platform, task: storyTask, prompt,
      references: lockedProjectReferences.map((item) => ({ assetId: item.id, filePath: item.filePath })),
      settings: {
        aspectRatio: activeIntake.videoFrame?.aspectRatio || "16:9", durationSec: 4, quality: "balanced",
        newConversation: true, sessionKey: `${project.id}:${storyTask}`, outputLanguage: productionLanguage,
        screenplaySchemaVersion: 3
      },
      download: { auto: false, targetFolder: `/data/projects/${project.id}/story`, filenameTemplate: storyTask }
    };
    const payload: RunJobPayload = { jobId, projectId: project.id, providerId: textProvider.id, jobType: "text", prompt, bridgeMessage };
    return { payload, storyTask, activeIntake };
}

function applyLocalStoryDemo(payload: RunJobPayload) {
    const { character, intake, productionLanguage, project, projectSceneIds, replaceState, state, storySeed, textProvider } = runtime;
    const demo = derivePlan(project.id, storySeed);
    const stamp = new Date().toISOString();
    replaceState({
      ...state,
      projects: state.projects.map((item) => item.id === project.id ? {
        ...item,
        sourceDraft: storySeed,
        intake: { ...(item.intake ?? intake), contentLanguage: productionLanguage },
        storyDocument: {
          logline: storySeed.split(/[.!?]/)[0] || storySeed,
          story: `${storySeed}\n\nThe protagonist enters the situation with a clear need, encounters an escalating obstacle, discovers the hidden cause, and makes a decisive choice that resolves the immediate conflict while preserving a final emotional image.`,
          sceneBreakdown: demo.scenes.map((item) => `${item.order}. ${item.title}\n${item.summary}`).join("\n\n"),
          characters: [{
            name: character.name || "Main character",
            role: character.role || "main",
            storyFunction: "",
            visualBrief: character.visualDescription || "",
            required: true
          }],
          comments: [],
          manuallyEdited: false,
          generatedAt: stamp
        }
      } : item),
      scenes: [...state.scenes.filter((item) => item.projectId !== project.id), ...demo.scenes],
      shots: [...state.shots.filter((item) => !projectSceneIds.has(item.sceneId)), ...demo.shots],
      jobs: [{
        id: payload.jobId,
        projectId: project.id,
        providerId: textProvider.id,
        jobType: "text",
        input: payload,
        status: "approved",
        resultAssetIds: [],
        createdAt: stamp,
        updatedAt: stamp
      }, ...state.jobs]
    });
}

function developShots() {
    const { intake, productionLanguage, project, projectScenes, replaceState, routedVideoPlatform, selectedVideoSkill, state, textProvider } = runtime;
    const budget = buildProjectShotBudget();
    if (!budget) return;
    const batch = selectNextShotBatch(budget.sceneCounts, budget.projectDurations);
    if (!batch) return;
    const { targetScene, sceneShotCount, completedInScene, shotOrderStart, sceneDurations, batchCueIds, sequenceQaRepairFinding } = batch;
    const batchIndex = completedInScene + 1;
    const batchCount = sceneShotCount;
    const sequenceQaCorrection = sequenceQaRepairFinding
      ? `\n\nSEQUENCE QA REPAIR REQUIRED:\n${sequenceQaRepairFinding.code}: ${sequenceQaRepairFinding.message}\nReplace only shot order ${shotOrderStart}. ${shotRepairGuidance(sequenceQaRepairFinding.code)}`
      : "";
    const prompt = `${buildShotBreakdownPrompt(project, projectScenes, selectedVideoSkill, routedVideoPlatform, targetScene, sceneDurations, shotOrderStart, batchCueIds)}${sequenceQaCorrection}`;
    const jobId = makeId("shots");
    const bridgeMessage: RunJobRequest = {
      type: "RUN_JOB",
      jobId,
      provider: textProvider.platform,
      task: "shot_breakdown",
      prompt,
      references: [],
      settings: {
        aspectRatio: intake.videoFrame?.aspectRatio || "16:9",
        durationSec: 4,
        quality: "balanced",
        newConversation: true,
        sessionKey: `${project.id}:shot-breakdown:${targetScene.screenplaySceneId}:batch-${batchIndex}${sequenceQaRepairFinding ? `:qa-${sequenceQaRepairFinding.code}` : ""}`,
        outputLanguage: productionLanguage,
        screenplaySchemaVersion: 4,
        screenplaySceneId: targetScene.screenplaySceneId,
        screenplayCueIds: batchCueIds,
        shotDurationsSec: sceneDurations,
        shotOrderStart,
        shotBatchIndex: batchIndex,
        shotBatchCount: batchCount,
        projectShotCount: budget.sceneCounts.reduce((sum, count) => sum + count, 0),
        projectRuntimeSec: budget.projectDurations.reduce((sum, duration) => sum + duration, 0)
      },
      download: { auto: false, targetFolder: `/data/projects/${project.id}/shots`, filenameTemplate: `shot-breakdown-${targetScene.order}-${batchIndex}` }
    };
    const payload: RunJobPayload = { jobId, projectId: project.id, providerId: textProvider.id, jobType: "text", prompt, bridgeMessage };
    if (getWorkflowBridge()) {
      const activeJob = state.jobs.find((job) => job.projectId === project.id &&
        (job.input as RunJobPayload | undefined)?.bridgeMessage?.task === "shot_breakdown" && isActiveJob(job));
      if (!activeJob) getWorkflowBridge().runJob(payload).then(replaceState);
      return;
    }
}

function buildProjectShotBudget() {
  const { intake, project, projectScenes, routedVideoPlatform } = runtime;
  const screenplays = project.storyDocument?.screenplayScenes || [];
  const ordered = projectScenes.map((scene) => screenplays.find((item) => item.id === scene.screenplaySceneId));
  if (ordered.some((screenplay) => !screenplay)) return null;
  const count = recommendedProviderShotCount(routedVideoPlatform, intake.targetDurationSec || 30);
  const sceneCounts = allocateSceneShotCounts(ordered as NonNullable<typeof ordered[number]>[], count);
  const packets = projectScenes.map((scene, index) => {
    const screenplay = screenplays.find((item) => item.id === scene.screenplaySceneId);
    return screenplay ? { screenplay, packets: planSceneShotCuePackets(screenplay, sceneCounts[index]) } : null;
  });
  const weights = packets.flatMap((entry, index) => entry
    ? sceneShotPacketWeights(entry.screenplay, entry.packets)
    : Array.from({ length: sceneCounts[index] }, () => 1));
  const speechMinimums = packets.flatMap((entry, index) => entry
    ? sceneShotPacketSpeechMinimums(entry.screenplay, entry.packets)
    : Array.from({ length: sceneCounts[index] }, () => 0));
  const projectDurations = planProviderShotDurationsByWeights(routedVideoPlatform, intake.targetDurationSec || 30, weights, speechMinimums);
  return { sceneCounts, projectDurations };
}

function selectNextShotBatch(sceneCounts: number[], projectDurations: number[]) {
  const { project, projectScenes, projectShots } = runtime;
  const finding = project.storyDocument?.sequenceQA?.status === "BLOCKED"
    ? project.storyDocument.sequenceQA.findings.find((item) => item.severity === "blocking" && item.responsibleStage === "shot_compiler" && item.shotIds?.length)
    : undefined;
  const repairShot = finding ? projectShots.find((shot) => finding.shotIds?.includes(shot.id)) : undefined;
  const sceneIndex = repairShot
    ? projectScenes.findIndex((scene) => scene.id === repairShot.sceneId)
    : projectScenes.findIndex((scene, index) => projectShots.filter((shot) => shot.sceneId === scene.id).length < sceneCounts[index]);
  const targetScene = projectScenes[sceneIndex];
  if (sceneIndex < 0 || !targetScene?.screenplaySceneId) return null;
  const sceneShotCount = sceneCounts[sceneIndex];
  const sceneOrderStart = sceneCounts.slice(0, sceneIndex).reduce((sum, count) => sum + count, 0) + 1;
  const completedInScene = repairShot
    ? Math.max(0, repairShot.order - sceneOrderStart)
    : projectShots.filter((shot) => shot.sceneId === targetScene.id).length;
  const shotOrderStart = sceneOrderStart + completedInScene;
  const screenplay = project.storyDocument?.screenplayScenes?.find((item) => item.id === targetScene.screenplaySceneId);
  if (!screenplay) return null;
  return {
    targetScene, sceneShotCount, completedInScene, shotOrderStart,
    sceneDurations: projectDurations.slice(shotOrderStart - 1, shotOrderStart),
    batchCueIds: planSceneShotCuePackets(screenplay, sceneShotCount)[completedInScene]?.cueIds || [],
    sequenceQaRepairFinding: finding
  };
}

function shotRepairGuidance(code: string) {
  if (code === "ESCALATION_COVERAGE_FLAT") return "Change only the coverage strategy so this dramatic increase has stronger visual pressure than its neighbors. Keep one continuous camera setup and at most one motivated move; do not add a cut, angle change, action, line, or consequence.";
  if (code === "TIMING_SHOT_UNDERFILLED") return "Keep the active action/dialogue compact and identify a clean editorial exit. Do not slow, repeat, or invent content merely to fill the provider slot.";
  return "Repair only the named invariant. Preserve the assigned cues, exact dialogue, duration inventory, causal order and continuity; do not broaden the shot.";
}

function developNextScreenplayScene() {
    const { intake, productionLanguage, project, projectScenes, replaceState, routedVideoPlatform, selectedVideoSkill, skills, textProvider } = runtime;
    const completedIds = new Set((project.storyDocument?.screenplayScenes || []).map((item) => item.id));
    const targetScene = projectScenes.find((item) => item.screenplaySceneId && !completedIds.has(item.screenplaySceneId));
    if (!targetScene?.screenplaySceneId) {
      runtime.setPipelineRun({
        mode: "step",
        running: false,
        currentStep: "architecture",
        message: "Chưa có scene screenplay để phát triển. Hãy chạy lại bước Phân tách cảnh từ câu chuyện đã duyệt trước khi tạo kịch bản cảnh.",
        startedAt: new Date().toISOString()
      });
      return;
    }
    const provider = textProvider;
    const budget = screenplaySceneBudgetStatus(project, targetScene, routedVideoPlatform);
    if (budget.minimumRequiredAtomicCueGroups > budget.maximumShots) {
      runtime.setPipelineRun({
        mode: "step",
        running: false,
        currentStep: "screenplay",
        message: `Dừng trước khi gọi provider: các scene đã khóa dùng ${budget.priorAtomicCueGroups} nhóm shot nguyên tử, trong khi project ${project.intake?.targetDurationSec || 30}s chỉ cho phép tối đa ${budget.maximumShots}. Hãy tăng thời lượng project hoặc rút gọn contract trước khi viết ${targetScene.title}.`,
        startedAt: new Date().toISOString()
      });
      return;
    }
    const prompt = buildScreenplayScenePrompt(project, targetScene, selectedVideoSkill, routedVideoPlatform, skills.find((skill) => skill.id === "narrative-performance"));
    const jobId = makeId("screenplay");
    const bridgeMessage: RunJobRequest = {
      type: "RUN_JOB", jobId, provider: provider.platform, task: "screenplay_scene", prompt, references: [],
      settings: { aspectRatio: intake.videoFrame?.aspectRatio || "16:9", durationSec: 4, quality: "balanced", newConversation: true, sessionKey: `${project.id}:screenplay:${targetScene.screenplaySceneId}`, outputLanguage: productionLanguage, screenplaySceneId: targetScene.screenplaySceneId },
      download: { auto: false, targetFolder: `/data/projects/${project.id}/screenplay`, filenameTemplate: targetScene.screenplaySceneId }
    };
    const payload: RunJobPayload = { jobId, projectId: project.id, providerId: provider.id, jobType: "text", prompt, bridgeMessage };
    if (getWorkflowBridge()) getWorkflowBridge().runJob(payload).then(replaceState);
}

export function createStoryDevelopmentActions(deps: StoryDevelopmentDependencies) {
  runtime = deps;
  return { applyPlanner, developNextScreenplayScene, developShots, developStory };
}
