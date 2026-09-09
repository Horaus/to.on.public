import { planProviderShotDurations, planProviderShotDurationsByWeights, recommendedProviderShotCount } from "@studio/domain/duration-policy";
import type { Asset, AutomationJob, Project, ProjectIntake, ProviderPlatform, Scene, Shot } from "@studio/types";
import { shotKeyframeAssets, shotVideoAssets } from "@studio/workflow/media-asset-selectors";
import type { ScreenplayScene } from "@studio/types";

type PlannedCue = { id: string; kind: "action" | "dialogue" | "sound"; sequenceOrder: number; sourceIndex: number; dependsOnCueIds: string[] };
type SceneShotCuePacket = { index: number; cueIds: string[] };

function sceneCues(scene: ScreenplayScene): PlannedCue[] {
  return [...scene.actionCues.map((cue) => ({ ...cue, kind: "action" as const })), ...scene.dialogueCues.map((cue) => ({ ...cue, kind: "dialogue" as const })), ...scene.soundCues.map((cue) => ({ ...cue, kind: "sound" as const }))]
    .map((cue, sourceIndex) => ({ id: cue.id, kind: cue.kind, sequenceOrder: Number(cue.sequenceOrder || sourceIndex + 1), sourceIndex, dependsOnCueIds: [...(cue.dependsOnCueIds || []), ...(cue.viewerRequiresCueIds || [])] }));
}

function orderCueIds(scene: ScreenplayScene): string[] {
  const cues = sceneCues(scene);
  const { byId, indegree, outgoing } = buildCueGraph(cues);
  const compare = (left: PlannedCue, right: PlannedCue) => left.sequenceOrder - right.sequenceOrder || left.sourceIndex - right.sourceIndex;
  const ready = cues.filter((cue) => indegree.get(cue.id) === 0).sort(compare); const ordered: string[] = [];
  while (ready.length) drainReadyCue(ready, ordered, byId, indegree, outgoing, compare);
  if (ordered.length !== cues.length) throw new Error(`SCREENPLAY_DEPENDENCY_CONFLICT: scene ${scene.id} contains a causal dependency cycle.`);
  return ordered;
}

function buildCueGraph(cues: PlannedCue[]) {
  const byId = new Map(cues.map((cue) => [cue.id, cue]));
  const indegree = new Map(cues.map((cue) => [cue.id, 0]));
  const outgoing = new Map(cues.map((cue) => [cue.id, [] as string[]]));
  for (const cue of cues) for (const dependencyId of new Set(cue.dependsOnCueIds)) {
    if (!byId.has(dependencyId) || dependencyId === cue.id) continue;
    outgoing.get(dependencyId)?.push(cue.id); indegree.set(cue.id, (indegree.get(cue.id) || 0) + 1);
  }
  return { byId, indegree, outgoing };
}

function drainReadyCue(ready: PlannedCue[], ordered: string[], byId: Map<string, PlannedCue>, indegree: Map<string, number>, outgoing: Map<string, string[]>, compare: (left: PlannedCue, right: PlannedCue) => number) {
  const cue = ready.shift()!; ordered.push(cue.id);
  for (const nextId of outgoing.get(cue.id) || []) {
    indegree.set(nextId, (indegree.get(nextId) || 0) - 1);
    if (indegree.get(nextId) === 0) { ready.push(byId.get(nextId)!); ready.sort(compare); }
  }
}

function atomicCueGroups(scene: ScreenplayScene): string[][] {
  const cues = new Map(sceneCues(scene).map((cue) => [cue.id, cue])); const groups: string[][] = [];
  for (const cueId of orderCueIds(scene)) { const cue = cues.get(cueId)!; const current = groups.at(-1); const sameKind = current?.some((id) => { const kind = cues.get(id)?.kind; return kind === cue.kind && (kind === "action" || kind === "dialogue"); }); if (!current || sameKind) groups.push([cueId]); else current.push(cueId); }
  return groups;
}

function allocateSceneShotCounts(scenes: ScreenplayScene[], preferredTotal: number): number[] {
  if (!scenes.length) return []; const counts = scenes.map((scene) => atomicCueGroups(scene).length); const maximums = scenes.map((scene) => orderCueIds(scene).length); const total = () => counts.reduce((sum, count) => sum + count, 0); const target = Math.min(Math.max(preferredTotal, total()), maximums.reduce((sum, count) => sum + count, 0));
  while (total() < target) { const index = scenes.reduce((best, scene, candidate) => { if (counts[candidate] >= maximums[candidate]) return best; if (best < 0) return candidate; const cueCount = scene.actionCues.length + scene.dialogueCues.length + scene.soundCues.length; const bestCueCount = scenes[best].actionCues.length + scenes[best].dialogueCues.length + scenes[best].soundCues.length; return cueCount / counts[candidate] > bestCueCount / counts[best] ? candidate : best; }, -1); if (index < 0) break; counts[index]++; }
  return counts;
}

function planSceneShotCuePackets(scene: ScreenplayScene, shotCount: number): SceneShotCuePacket[] {
  const ordered = orderCueIds(scene); if (!Number.isInteger(shotCount) || shotCount < 1) throw new Error("Shot count must be a positive integer."); const groups = atomicCueGroups(scene);
  if (ordered.length < shotCount || groups.length > shotCount) throw new Error(`SHOT_PACKET_UNDERFLOW: scene ${scene.id} cannot satisfy ${shotCount} non-empty causal packets.`);
  while (groups.length < shotCount) { const index = groups.reduce((best, group, i) => group.length > groups[best].length ? i : best, 0); const group = groups[index]; if (group.length < 2) throw new Error(`SHOT_PACKET_UNDERFLOW: scene ${scene.id} cannot produce ${shotCount} non-empty packets.`); const midpoint = Math.ceil(group.length / 2); groups.splice(index, 1, group.slice(0, midpoint), group.slice(midpoint)); }
  return groups.map((cueIds, index) => ({ index, cueIds }));
}

const ROLE_DURATION_WEIGHT: Record<string, number> = { initiation: .8, question: .8, proposal: .9, pressure: .75, refusal: .75, answer: .85, interruption: .65, reaction: .65, revelation: 1.15, confirmation: .75, consequence: 1.05, command: .75, warning: .85, permission: .9, decision: .95, discovery: 1.05, verification: .9, commitment: 1, resolution: 1.25 };
function sceneShotPacketWeights(scene: ScreenplayScene, packets: SceneShotCuePacket[]): number[] { const cues = new Map([...scene.actionCues, ...scene.dialogueCues, ...scene.soundCues].map((cue) => [cue.id, cue])); const dialogue = new Map(scene.dialogueCues.map((cue) => [cue.id, cue])); return packets.map((packet) => { const role = Math.max(...packet.cueIds.map((id) => ROLE_DURATION_WEIGHT[cues.get(id)?.semanticRole || ""] || .8)); const tokens = packet.cueIds.reduce((sum, id) => sum + String(dialogue.get(id)?.line || "").trim().split(/\s+/).filter(Boolean).length, 0); return Math.max(role, tokens ? (tokens + 1) / 2 : 0); }); }
function sceneShotPacketSpeechMinimums(scene: ScreenplayScene, packets: SceneShotCuePacket[]): number[] { const dialogue = new Map(scene.dialogueCues.map((cue) => [cue.id, cue])); return packets.map((packet) => { const words = packet.cueIds.reduce((sum, id) => sum + String(dialogue.get(id)?.line || "").trim().split(/\s+/).filter(Boolean).length, 0); return words ? (words + 1) / 2 : 0; }); }

export type PipelinePlanInput={
  project: Project;
  intake: ProjectIntake;
  projectScenes: Scene[];
  projectShots: Shot[];
  projectAssets: Asset[];
  jobs: AutomationJob[];
  plannedVideoPlatform: ProviderPlatform;
  storySeed: string;
  visualRequirementCount: number;
  missingVisualRequirementCount: number;
  allRequiredCharacterReferencesReady: boolean;
};

export function derivePipelinePlan(input: PipelinePlanInput) {
  const { project,intake,projectScenes,projectShots,projectAssets,jobs,plannedVideoPlatform,storySeed,visualRequirementCount,missingVisualRequirementCount,allRequiredCharacterReferencesReady }=input;
  const preferredShotCount=recommendedProviderShotCount(plannedVideoPlatform,intake.targetDurationSec||30);
  const plannedScreenplays=[...(project.storyDocument?.screenplayScenes||[])].sort((left,right)=>left.sceneOrder-right.sceneOrder);
  const atomicSceneCounts=deriveSceneCounts(plannedScreenplays,projectScenes.length,preferredShotCount);
  const plannedShotCount=atomicSceneCounts.length?atomicSceneCounts.reduce((sum,count)=>sum+count,0):preferredShotCount;
  const plannedShotDurations=derivePlannedDurations(plannedVideoPlatform,intake.targetDurationSec||30,plannedScreenplays,atomicSceneCounts,plannedShotCount);
  const plannedRuntimeSec=plannedShotDurations.reduce((sum,duration)=>sum+duration,0);
  const plannedSceneCount=Math.min(3,plannedShotCount);
  const pipelineReadiness=deriveReadiness({ project,projectScenes,projectShots,projectAssets,jobs,storySeed,plannedSceneCount,plannedShotCount,visualRequirementCount,missingVisualRequirementCount,allRequiredCharacterReferencesReady });
  return { plannedShotCount,plannedShotDurations,plannedRuntimeSec,plannedSceneCount,pipelineReadiness };
}

function deriveReadiness(input: Omit<PipelinePlanInput,"intake"|"plannedVideoPlatform">&{ plannedSceneCount: number;plannedShotCount: number }) {
  const { project,projectScenes,projectShots,projectAssets,jobs,storySeed,plannedSceneCount,plannedShotCount,visualRequirementCount,missingVisualRequirementCount,allRequiredCharacterReferencesReady }=input;
  const storyFoundationReady=isFoundationReady(project);
  const storyArchitectureReady=isArchitectureReady(project,storyFoundationReady,projectScenes.length,plannedSceneCount);
  const screenplayReady=isScreenplayReady(project,storyArchitectureReady,projectScenes.length);
  const shotBreakdownReady=isShotBreakdownReady(project,screenplayReady,projectShots.length,plannedShotCount);
  const visualAssetsReady=hasAllVisualAssets(visualRequirementCount,missingVisualRequirementCount);
  const promptsReady=hasAllPrompts(shotBreakdownReady,projectShots);
  const keyframesReady=hasAllKeyframes(promptsReady,projectShots,projectAssets,jobs);
  const videosReady=hasAllVideos(keyframesReady,projectShots,projectAssets,jobs);
  return {
    hasBrief: Boolean(storySeed.trim() || project.sourceDraft?.trim() || project.description?.trim()),foundationReady: storyFoundationReady,architectureReady: storyArchitectureReady,
    screenplayReady,shotBreakdownReady,promptsReady,characterReady: shotBreakdownReady&&visualAssetsReady&&allRequiredCharacterReferencesReady,
    keyframesReady,videosReady
  };
}

function isFoundationReady(project: Project) {
  return Boolean(project.storyDocument?.story?.trim()&&project.storyDocument.foundationApprovedAt);
}

function isArchitectureReady(project: Project,foundationReady: boolean,sceneCount: number,plannedSceneCount: number) {
  const document=project.storyDocument;
  return Boolean(foundationReady&&document?.sceneBreakdown?.trim()&&document.architectureApprovedAt&&sceneCount>=plannedSceneCount);
}

function isScreenplayReady(project: Project,architectureReady: boolean,sceneCount: number) {
  const document=project.storyDocument;
  return Boolean(architectureReady&&document?.screenplayApprovedAt&&document.screenplayScenes?.length===sceneCount);
}

function isShotBreakdownReady(project: Project,screenplayReady: boolean,shotCount: number,plannedShotCount: number) {
  return Boolean(screenplayReady&&project.storyDocument?.shotBreakdownApprovedAt&&shotCount>=plannedShotCount);
}

function hasAllVisualAssets(requirementCount: number,missingRequirementCount: number) {
  return requirementCount>0&&missingRequirementCount===0;
}

function hasAllPrompts(shotBreakdownReady: boolean,shots: Shot[]) {
  return shotBreakdownReady&&shots.length>0&&shots.every((shot)=>Boolean(shot.prompt));
}

function hasAllKeyframes(promptsReady: boolean,shots: Shot[],assets: Asset[],jobs: AutomationJob[]) {
  return promptsReady&&shots.every((shot)=>shotKeyframeAssets(assets,shot,jobs).length>0);
}

function hasAllVideos(keyframesReady: boolean,shots: Shot[],assets: Asset[],jobs: AutomationJob[]) {
  return keyframesReady&&shots.every((shot)=>shotVideoAssets(assets,shot,jobs).length>0);
}

function deriveSceneCounts(screenplays: NonNullable<NonNullable<Project["storyDocument"]>["screenplayScenes"]>,sceneCount: number,preferredShotCount: number) {
  return screenplays.length===sceneCount?allocateSceneShotCounts(screenplays,preferredShotCount):[];
}

function derivePlannedDurations(platform: ProviderPlatform,targetDurationSec: number,screenplays: NonNullable<NonNullable<Project["storyDocument"]>["screenplayScenes"]>,sceneCounts: number[],shotCount: number) {
  if (!sceneCounts.length) return planProviderShotDurations(platform,targetDurationSec,shotCount);
  return planProviderShotDurationsByWeights(
    platform,targetDurationSec,
    screenplays.flatMap((screenplay,index)=>sceneShotPacketWeights(screenplay,planSceneShotCuePackets(screenplay,sceneCounts[index]))),
    screenplays.flatMap((screenplay,index)=>sceneShotPacketSpeechMinimums(screenplay,planSceneShotCuePackets(screenplay,sceneCounts[index])))
  );
}
