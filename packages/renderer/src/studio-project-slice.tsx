import { resolveProviderVideoDuration } from "@studio/domain/duration-policy";
import * as productionGraph from "@studio/production-graph";
import type { Asset, AutomationJob, BridgeStatus, Character, Project, ProjectIntake, Scene, Shot, SkillPack, StoryCharacter, StudioState, VisualReference, VisualRequirement } from "@studio/workflow/renderer-contracts";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useMemo } from "react";
import { inferStoryCharacters, isVisualProductionCharacter } from "@studio/workflow/character-utils";
import { normalizeSlotName } from "@studio/renderer-core/entity-key";
import { createTranslator, languageCodeFromPromptName, uiLanguageFromPromptName } from "@studio/renderer-core/i18n";
import { defaultProjectIntake } from "@studio/renderer-core/production-ui-support";
import { safeRoutingValue } from "@studio/renderer-core/provider-routing";
import { isQuickSetupReference } from "@studio/renderer-core/reference-classification";
import { isActiveJob, jobNeedsUserAction } from "@studio/renderer-core/job-status";
import { shotVideoAssets } from "@studio/workflow/media-asset-selectors";
import { deriveEditSequence, summarizeProject } from "@studio/workflow/studio-project-model";
import { derivePipelinePlan } from "@studio/workflow/studio-pipeline-plan";
import { buildPrompt } from "@studio/workflow/video-prompt-legacy";
import { createDefaultEditSequence, normalizeEditSequence } from "@studio/renderer-core/edit-sequence";

type CharacterJobInput = { bridgeMessage?: { task?: string; settings?: { characterSlot?: string; referenceRole?: string; characterName?: string; directReferenceUse?: string; referenceUse?: string } } };
type ProjectRunJobPayload = { bridgeMessage: { task?: string; settings: Record<string, any> } };
type CharacterReferencePlan = {
  nextCharacterReferenceTask:
    | { kind: "primary"; storyCharacter: StoryCharacter; slot: string; role: "main_character" | "supporting_character" }
    | { kind: "detail"; storyCharacter: StoryCharacter; slot: string; role: VisualReference["role"]; primaryReference: VisualReference }
    | undefined;
  allRequiredCharacterReferencesReady: boolean;
};

function characterJobMessage(job: AutomationJob) {
  return (job.input as CharacterJobInput | undefined)?.bridgeMessage;
}

function characterImageJobs(projectId: string, jobs: AutomationJob[]) {
  const latest = new Map<string, AutomationJob>();
  for (const job of jobs) {
    const message = characterJobMessage(job);
    const settings = message?.settings;
    if (job.projectId !== projectId || message?.task !== "text_to_image" || !Boolean(settings?.characterSlot || settings?.referenceRole || settings?.characterName) || settings?.directReferenceUse || settings?.referenceUse === "supporting_detail") continue;
    const slot = settings?.characterSlot || job.id;
    if (!latest.has(slot)) latest.set(slot, job);
  }
  return Array.from(latest.values());
}

function characterJobState(projectId: string, jobs: AutomationJob[]) {
  const terminal = new Set(["approved", "done", "review_required", "failed_manual", "failed_retryable"]);
  const actionable = new Set(["waiting_login", "waiting_manual_action"]);
  const stale = (job: AutomationJob) => !terminal.has(job.status) && Date.now() - new Date(job.updatedAt).getTime() > 60000;
  const rows = characterImageJobs(projectId, jobs);
  return {
    characterImageJobsActive: rows.filter((job) => !stale(job) && !actionable.has(job.status) && !terminal.has(job.status)),
    recoverableCharacterImageJobs: rows.filter((job) => Boolean((stale(job) || actionable.has(job.status) || ["failed_manual", "failed_retryable"].includes(job.status)) && job.providerConversationUrl))
  };
}

function characterReferenceSlot(character: StoryCharacter, index: number, visualRequirements: NonNullable<Project["storyDocument"]>["visualRequirements"]) {
  return visualRequirements?.find((requirement) => (requirement.role === "main_character" || requirement.role === "supporting_character") &&
    (requirement.name.trim().toLowerCase() === character.name.trim().toLowerCase() || (index === 0 && requirement.role === "main_character")))?.id || normalizeSlotName(character.name);
}

function nextCharacterReferenceTask(storyCharacter: StoryCharacter, index: number, slot: string, primary: VisualReference[], detail: VisualReference[]) {
  const primaryReference = primary.find((ref) => (ref.characterSlot || normalizeSlotName(ref.name)) === slot);
  if (!primaryReference) return { kind: "primary" as const, storyCharacter, slot, role: index === 0 ? "main_character" as const : "supporting_character" as const };
  const detailReference = detail.find((ref) => (ref.characterSlot || normalizeSlotName(ref.name)) === slot);
  return detailReference ? undefined : { kind: "detail" as const, storyCharacter, slot, role: primaryReference.role, primaryReference };
}

function characterReferencePlan(projectReferences: VisualReference[], visualRequirements: NonNullable<Project["storyDocument"]>["visualRequirements"], requiredStoryCharacters: StoryCharacter[]): CharacterReferencePlan {
  const primary = projectReferences.filter((ref) => ref.referenceUse === "primary_identity");
  const detail = projectReferences.filter((ref) => ref.referenceUse === "supporting_detail");
  const slots = requiredStoryCharacters.map((character, index) => characterReferenceSlot(character, index, visualRequirements));
  const primarySlots = new Set(primary.map((ref) => ref.characterSlot || normalizeSlotName(ref.name)));
  const detailSlots = new Set(detail.map((ref) => ref.characterSlot || normalizeSlotName(ref.name)));
  const nextTask = requiredStoryCharacters.map((character, index) => nextCharacterReferenceTask(character, index, slots[index], primary, detail)).find(Boolean);
  // Detail sheets are optional continuity evidence; the locked primary
  // identity is the minimum required before storyboard/keyframe generation.
  // The assets screen mirrors this contract and asks for detail only when a
  // shot actually needs a body, expression, outfit, or material variant.
  const allReady = slots.length > 0 && slots.every((slot) => primarySlots.has(slot));
  return { nextCharacterReferenceTask: nextTask, allRequiredCharacterReferencesReady: allReady };
}

type ProjectSliceArgs = {
  state: StudioState; bridgeStatus: BridgeStatus; storySeed: string; generatedStorySeed: string;
  selectedShotId: string; storyboardStep: number; activeSkillId: string; skills: SkillPack[];
  selectedReferenceId: string | null; referenceModalPane: "main" | "detail"; pendingReferencePaneKeys: Set<string>;
  referenceDraft: { characterSlot: string }; activeCharacterSlot: string; previewGeneratedAsset: Asset | null;
  intakeRef: RefObject<ProjectIntake | null>; setState: Dispatch<SetStateAction<StudioState>>;
  replaceState: (state: StudioState) => void;
};

function isCharacterDetailRequirement(requirement: VisualRequirement) {
  return (requirement.role === "main_character" || requirement.role === "supporting_character") && /detail|chi ti[eế]t/i.test(`${requirement.id} ${requirement.name}`);
}

function resolveReferenceForRequirement(requirementId: string, visualRequirements: VisualRequirement[], lockedProjectReferences: VisualReference[]) {
  const requirement = visualRequirements.find((item) => item.id === requirementId);
  if (!requirement) return undefined;
  const matches = lockedProjectReferences.filter((reference) => reference.characterSlot === requirement.id ||
    (reference.role === requirement.role && reference.name.trim().toLowerCase() === requirement.name.trim().toLowerCase()));
  if (requirement.role !== "main_character" && requirement.role !== "supporting_character") return matches.find((reference) => reference.referenceUse !== "supporting_detail") || matches[0];
  const expectedUse: VisualReference["referenceUse"] = isCharacterDetailRequirement(requirement) ? "supporting_detail" : "primary_identity";
  const exact = matches.find((reference) => reference.referenceUse === expectedUse);
  if (exact) return exact;
  const identityRequirementsForRole = visualRequirements.filter((item) => item.role === requirement.role && !isCharacterDetailRequirement(item));
  return identityRequirementsForRole.length === 1 ? lockedProjectReferences.find((reference) => reference.role === requirement.role && reference.referenceUse === expectedUse) : undefined;
}

function referenceCoverage(project: Project, projectReferences: VisualReference[]) {
  const productionProjectReferences = projectReferences.filter((item) => !isQuickSetupReference(item));
  const lockedProjectReferences = Array.from(new Map([...productionProjectReferences].reverse().map((item) => [
    `${item.characterSlot || item.name}:${item.role}:${item.referenceUse || "supporting_detail"}`, item
  ])).values());
  const visualRequirements = project.storyDocument?.visualRequirements ?? [];
  const referenceForRequirement = (requirementId: string) => resolveReferenceForRequirement(requirementId, visualRequirements, lockedProjectReferences);
  const missingVisualRequirements = visualRequirements.filter((requirement) => !referenceForRequirement(requirement.id));
  const nextMissingVisualRequirementNode = (project.productionGraphCustomNodes ?? []).find((node) =>
    node.systemGenerated === "visual-requirement" && missingVisualRequirements.some((item) => item.id === node.referenceRequirementId));
  return { productionProjectReferences, lockedProjectReferences, visualRequirements, isCharacterDetailRequirement, referenceForRequirement, missingVisualRequirements, nextMissingVisualRequirementNode };
}

function useProjectCore(args: ProjectSliceArgs) {
  const { state, intakeRef, replaceState, setState, storySeed } = args;
  const project = useMemo(() => state.projects.find((item) => item.id === state.activeProjectId) ?? state.projects[0], [state.activeProjectId, state.projects]);
  const { graph: projectGraph, issues: productionGraphIssues } = useMemo(() => {
    const graph = productionGraph.projectStudioStateToProductionGraph(state, project.id);
    return { graph, issues: productionGraph.validateProductionGraph(graph) };
  }, [project.id, state]);
  const intake = project.intake ?? defaultProjectIntake();
  if (!intakeRef.current) intakeRef.current = intake;
  const projectReferences = useMemo(() => state.visualReferences.filter((item) => item.projectId === project.id), [project.id, state.visualReferences]);
  const coverage = referenceCoverage(project, projectReferences);
  const projectScenes = useMemo(() => state.scenes.filter((item) => item.projectId === project.id), [project.id, state.scenes]);
  const projectSceneIds = useMemo(() => new Set(projectScenes.map((item) => item.id)), [projectScenes]);
  const projectShots = useMemo(() => state.shots.filter((item) => projectSceneIds.has(item.sceneId)), [projectSceneIds, state.shots]);
  const projectAssets = useMemo(() => state.assets.filter((item) => item.projectId === project.id && !item.metadata?.hiddenFromStoryboard), [project.id, state.assets]);
  const editSequenceModel = useMemo(() => deriveEditSequence(project, state, shotVideoAssets, createDefaultEditSequence, normalizeEditSequence), [project, state]);
  const projectSummaries = useMemo(() => state.projects.map((item) => summarizeProject(item, state, isQuickSetupReference, isActiveJob, jobNeedsUserAction)), [state]);
  const projectStats = projectSummaries.find((item) => item.project.id === project.id) ?? summarizeProject(project, state, isQuickSetupReference, isActiveJob, jobNeedsUserAction);
  useEffect(() => {
    if (!window.studioBridge) return;
    if (!project.editSequence && projectShots.length > 0) void window.studioBridge.updateProject(project.id, { editSequence: editSequenceModel }).then(replaceState);
    else if (project.editSequence && JSON.stringify(project.editSequence.clips) !== JSON.stringify(editSequenceModel.clips)) {
      void window.studioBridge.updateProject(project.id, { editSequence: { ...editSequenceModel, revision: project.editSequence.revision + 1, updatedAt: new Date().toISOString() } }).then(replaceState);
    }
  }, [editSequenceModel, project.editSequence, project.id, projectShots.length]);
  useEffect(() => { intakeRef.current = intake; }, [project.id, project.intake]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, projects: current.projects.map((item) => item.id === project.id ? { ...item, sourceDraft: storySeed } : item) }));
      void window.studioBridge?.updateProject(project.id, { sourceDraft: storySeed });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project.id, storySeed]);
  return { project, intake, projectReferences, ...coverage, projectScenes, projectSceneIds, projectShots, projectAssets, editSequenceModel, projectSummaries, projectStats, productionGraph: projectGraph, productionGraphIssues };
}

function generatedCharacterAssets(assets: Asset[], jobs: AutomationJob[]) {
  return assets.filter((asset) => {
    const sourceJob = jobs.find((job) => job.id === asset.sourceJobId);
    const message = (sourceJob?.input as ProjectRunJobPayload | undefined)?.bridgeMessage;
    const settings = message?.settings;
    return message?.task === "text_to_image" && Boolean(settings?.characterSlot || settings?.referenceRole || settings?.characterName) &&
      !settings?.directReferenceUse && settings?.referenceUse !== "supporting_detail";
  }).filter((asset, index, list) => {
    const fingerprint = String(asset.metadata?.originalUrl || asset.filePath);
    return list.findIndex((candidate) => String(candidate.metadata?.originalUrl || candidate.filePath) === fingerprint) === index;
  });
}

function deriveCharacterState(args: ProjectSliceArgs, core: ReturnType<typeof useProjectCore>) {
  const { project, projectAssets } = core;
  const style = args.state.styleBibles.find((item) => item.id === project.styleBibleId) ?? args.state.styleBibles[0];
  const projectCharacters = args.state.characters.filter((item) => item.projectId === project.id);
  const authored = project.storyDocument?.characters?.[0];
  const character: Character = projectCharacters[0] ?? {
    id: "empty_character", projectId: project.id, name: authored?.name || "Nhân vật chính", role: authored?.role || "main_character",
    visualDescription: authored?.visualBrief || "", outfit: "",
    face: "", referenceAssetIds: [], negativeTraits: "Không dùng reference từ project khác.",
    consistencyNotes: ""
  };
  const storyCharacters = inferStoryCharacters(project.storyDocument, character);
  const requiredStoryCharacters = storyCharacters.filter(isVisualProductionCharacter);
  const currentCharacterSlot = args.referenceDraft.characterSlot || args.activeCharacterSlot || normalizeSlotName(character.name || storyCharacters[0]?.name || "main-character");
  const characterGeneratedAssets = generatedCharacterAssets(projectAssets, args.state.jobs);
  return { style, projectCharacters, character, storyCharacters, requiredStoryCharacters, currentCharacterSlot, characterGeneratedAssets, ...characterJobState(project.id, args.state.jobs) };
}

function generatedGroups(assets: Asset[], jobs: AutomationJob[], characters: StoryCharacter[]) {
  const groups = new Map<string, { key: string; name: string; slot: string; role: VisualReference["role"]; referenceUse: VisualReference["referenceUse"]; assets: Asset[] }>();
  for (const asset of assets) {
    const settings = (jobs.find((job) => job.id === asset.sourceJobId)?.input as ProjectRunJobPayload | undefined)?.bridgeMessage.settings;
    const slot = settings?.characterSlot || normalizeSlotName(settings?.characterName || "unmapped-character-candidate");
    const inferredRole: VisualReference["role"] = characters.find((item) => normalizeSlotName(item.name) === slot)?.role === "Main presenter" ? "main_character" : "supporting_character";
    const role = (settings?.referenceRole as VisualReference["role"]) || inferredRole;
    const referenceUse = (settings?.referenceUse as VisualReference["referenceUse"]) || "primary_identity";
    const key = `${slot}:${role}:${referenceUse}`;
    const existing = groups.get(key);
    if (existing) existing.assets.push(asset);
    else groups.set(key, { key, name: settings?.characterName || "Nhân vật tạm", slot, role, referenceUse, assets: [asset] });
  }
  return Array.from(groups.values());
}

function lockedGroups(references: VisualReference[]) {
  const groups = new Map<string, { key: string; slot: string; role: VisualReference["role"]; name: string; primary?: VisualReference; detail?: VisualReference; references: VisualReference[] }>();
  for (const reference of references) {
    const slot = reference.characterSlot || normalizeSlotName(reference.name);
    const key = `${slot}:${reference.role}`;
    const existing = groups.get(key) ?? { key, slot, role: reference.role, name: reference.name.replace(/\s+AI candidate$/i, ""), references: [] };
    existing.references.push(reference);
    if (reference.referenceUse === "primary_identity" && !existing.primary) existing.primary = reference;
    if (reference.referenceUse === "supporting_detail" && !existing.detail) existing.detail = reference;
    if (!existing.primary && !existing.detail) existing.primary = reference;
    groups.set(key, existing);
  }
  return Array.from(groups.values());
}

function pipelineSelection(args: ProjectSliceArgs, core: ReturnType<typeof useProjectCore>, characters: ReturnType<typeof deriveCharacterState>, referencePlan: CharacterReferencePlan) {
  const plannedPlatform = args.state.providers.find((provider) => provider.id === safeRoutingValue("video", core.intake.aiRouting?.videoProvider))?.platform ?? "google-flow";
  const plan = derivePipelinePlan({ project: core.project, intake: core.intake, projectScenes: core.projectScenes, projectShots: core.projectShots, projectAssets: core.projectAssets,
    jobs: args.state.jobs, plannedVideoPlatform: plannedPlatform, storySeed: args.storySeed, visualRequirementCount: core.visualRequirements.length,
    missingVisualRequirementCount: core.missingVisualRequirements.length, allRequiredCharacterReferencesReady: referencePlan.allRequiredCharacterReferencesReady });
  const selectedShot = core.projectShots.find((shot) => shot.id === args.selectedShotId) ?? core.projectShots[0] ?? emptyShot(core.project, core.intake);
  const scene = core.projectScenes.find((item) => item.id === selectedShot.sceneId) ?? core.projectScenes[0] ?? emptyScene(core.project);
  const storyboardScene = args.storyboardStep > 0 ? core.projectScenes.find((item) => item.order === args.storyboardStep) ?? scene : scene;
  const storyboardSceneShots = core.projectShots.filter((shot) => shot.sceneId === storyboardScene.id).sort((a, b) => a.order - b.order);
  const storyboardSideShot = storyboardSceneShots.find((shot) => shot.id === selectedShot.id) ?? storyboardSceneShots[0] ?? selectedShot;
  const safeTextProviderId = safeRoutingValue("text", core.intake.aiRouting?.textProvider);
  const safeImageProviderId = safeRoutingValue("image", core.intake.aiRouting?.imageProvider);
  const safeVideoProviderId = safeRoutingValue("video", core.intake.aiRouting?.videoProvider);
  const routedVideoPlatform = args.state.providers.find((provider) => provider.id === safeVideoProviderId)?.platform ?? "google-flow";
  const productionLanguage = core.intake.outputLanguage || "Vietnamese";
  const contentLanguage = core.intake.contentLanguage || productionLanguage;
  const storyboardAspectRatio = core.intake.videoFrame?.aspectRatio ?? "9:16";
  return { ...plan, storyFoundationReady: plan.pipelineReadiness.foundationReady, storyArchitectureReady: plan.pipelineReadiness.architectureReady,
    screenplayReady: plan.pipelineReadiness.screenplayReady, shotBreakdownReady: plan.pipelineReadiness.shotBreakdownReady,
    promptsReadyForPipeline: plan.pipelineReadiness.promptsReady, characterReadyForPipeline: plan.pipelineReadiness.characterReady,
    keyframesReadyForPipeline: plan.pipelineReadiness.keyframesReady, storyReadyForPipeline: plan.pipelineReadiness.shotBreakdownReady,
    bridgeCount: args.bridgeStatus.connectedExtensions, bridgeVersionLabel: args.bridgeStatus.versions.join(", ") || "detecting", selectedShot, scene,
    storyboardScene, storyboardSceneShots, storyboardSideShot, selectedProvider: args.state.providers.find((provider) => provider.id === selectedShot.providerId) ?? args.state.providers[0],
    safeTextProviderId, safeImageProviderId, safeVideoProviderId, routedVideoPlatform, selectedShotRenderDuration: resolveProviderVideoDuration(routedVideoPlatform, storyboardSideShot.durationSec),
    storyboardAspectRatio, productionLanguage, contentLanguage, contentLanguageMismatch: contentLanguage !== productionLanguage,
    languageCode: languageCodeFromPromptName(productionLanguage), t: createTranslator(uiLanguageFromPromptName(productionLanguage)),
    prompt: selectedShot.prompt || buildPrompt(characters.style, characters.character, scene, selectedShot, storyboardAspectRatio, productionLanguage),
    selectedAssets: core.projectAssets.filter((asset) => selectedShot.assetIds.includes(asset.id)), videoSkills: args.skills.filter((skill) => skill.category === "video-type") };
}

function emptyScene(project: Project): Scene {
  return { id: "empty_scene", projectId: project.id, title: "Chưa có scene", summary: "Nhập brief ở sidebar phải rồi chạy bước kịch bản để tạo scene và shot.", location: "Chưa xác định", timeOfDay: "Chưa xác định", emotionalTone: "Draft", order: 0 };
}
function emptyShot(project: Project, intake: ProjectIntake): Shot {
  const scene = emptyScene(project);
  return { id: "empty_shot", sceneId: scene.id, order: 0, description: "Chưa có shot. Hãy chạy bước Kịch bản trước.", camera: "Chưa xác định", motion: "Chưa xác định", durationSec: intake.targetDurationSec || 30, prompt: "", providerId: safeRoutingValue("image", intake.aiRouting?.imageProvider), status: "draft", assetIds: [] };
}

const terminalReferenceStatuses = new Set(["approved", "done", "failed_manual", "failed_retryable"]);

function latestReferenceJob(jobs: AutomationJob[], projectId: string, slot: string, use: "primary_identity" | "supporting_detail") {
  return jobs.filter((job) => {
    const message = (job.input as ProjectRunJobPayload | undefined)?.bridgeMessage;
    return job.projectId === projectId && message?.task === "text_to_image" && message.settings?.directReferenceUse === use && message.settings?.characterSlot === slot;
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

function referenceJobActive(job: AutomationJob | undefined) {
  return Boolean(job && !terminalReferenceStatuses.has(job.status));
}

function selectedReferenceIdentity(selectedReference: VisualReference | null, group: ReturnType<typeof lockedGroups>[number] | undefined, characters: ReturnType<typeof deriveCharacterState>) {
  return {
    selectedReferencePrimary: group?.primary ?? selectedReference ?? undefined,
    selectedReferenceDetail: group?.detail,
    selectedReferenceSlot: group?.slot ?? selectedReference?.characterSlot ?? "",
    selectedReferenceRole: group?.role ?? selectedReference?.role ?? "main_character",
    selectedReferenceName: group?.name ?? selectedReference?.name ?? characters.character.name ?? "Nhân vật"
  };
}

function referencePaneState(args: ProjectSliceArgs, mainJob: AutomationJob | undefined, detailJob: AutomationJob | undefined, mainKey: string, detailKey: string, primary: VisualReference | undefined, detail: VisualReference | undefined) {
  const detailPane = args.referenceModalPane === "detail";
  const latest = detailPane ? detailJob : mainJob;
  return {
    selectedReferencePaneKey: detailPane ? detailKey : mainKey,
    selectedReferenceMainJobActive: referenceJobActive(mainJob) || args.pendingReferencePaneKeys.has(mainKey),
    selectedReferenceDetailJobActive: referenceJobActive(detailJob) || args.pendingReferencePaneKeys.has(detailKey),
    selectedReferencePaneHasImage: Boolean(detailPane ? detail : primary),
    selectedReferencePaneJobActive: referenceJobActive(latest),
    selectedReferencePaneLatestJob: latest,
    selectedReferencePaneFailedJob: latest && ["failed_manual", "failed_retryable"].includes(latest.status) ? latest : undefined
  };
}

function selectedReferenceState(args: ProjectSliceArgs, core: ReturnType<typeof useProjectCore>, characters: ReturnType<typeof deriveCharacterState>, groups: ReturnType<typeof lockedGroups>) {
  const selectedReference = core.projectReferences.find((item) => item.id === args.selectedReferenceId) ?? null;
  const selectedReferenceGroup = selectedReference ? groups.find((group) => group.references.some((reference) => reference.id === selectedReference.id)) : undefined;
  const identity = selectedReferenceIdentity(selectedReference, selectedReferenceGroup, characters);
  const { selectedReferencePrimary, selectedReferenceDetail, selectedReferenceSlot, selectedReferenceRole } = identity;
  const mainKey = `${core.project.id}:${selectedReferenceSlot}:primary_identity`;
  const detailKey = `${core.project.id}:${selectedReferenceSlot}:supporting_detail`;
  const mainJob = latestReferenceJob(args.state.jobs, core.project.id, selectedReferenceSlot, "primary_identity");
  const detailJob = latestReferenceJob(args.state.jobs, core.project.id, selectedReferenceSlot, "supporting_detail");
  return { selectedReference, selectedReferenceGroup, selectedReferencePrimary, selectedReferenceDetail, selectedReferenceSlot, selectedReferenceRole,
    selectedReferenceSupportsDetail: ["main_character", "supporting_character"].includes(selectedReferenceRole), selectedReferenceName: identity.selectedReferenceName,
    selectedReferenceHasGenerationData: Boolean(selectedReferencePrimary || characters.character.visualDescription || characters.character.outfit || characters.character.personality || selectedReferenceSlot),
    ...referencePaneState(args, mainJob, detailJob, mainKey, detailKey, selectedReferencePrimary, selectedReferenceDetail) };
}

function providerJobs(args: ProjectSliceArgs, core: ReturnType<typeof useProjectCore>) {
  const task = (job: AutomationJob) => (job.input as ProjectRunJobPayload | undefined)?.bridgeMessage?.task;
  // Retries remain in the append-only list; surface the newest story attempt
  // instead of whichever historical attempt happens to appear first.
  const storyJob = args.state.jobs
    .filter((job) => job.projectId === core.project.id && ["story_foundation", "story_architecture", "story_development"].includes(task(job) || ""))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const connectionJob = args.state.jobs.find((job) => job.projectId === core.project.id && task(job) === "connection_test");
  const done = ["approved", "done", "failed_manual", "failed_retryable"];
  return { storyJob, connectionJob, storyJobActive: Boolean(storyJob && !done.includes(storyJob.status)), connectionJobActive: Boolean(connectionJob && !done.includes(connectionJob.status)),
    translationJobActive: args.state.jobs.some((job) => job.projectId === core.project.id && job.jobType === "text" && task(job) === "translation" && !done.includes(job.status)),
    textProvider: args.state.providers.find((item) => item.id === core.intake.aiRouting?.textProvider) ?? args.state.providers.find((item) => item.id === "chatgpt-web") ?? args.state.providers[0],
    showStoryJobStatus: Boolean(storyJob && args.generatedStorySeed === args.storySeed) };
}

export function useStudioProjectSlice(args: ProjectSliceArgs) {
  const core = useProjectCore(args);
  const characters = deriveCharacterState(args, core);
  const generatedCandidateGroups = useMemo(() => generatedGroups(characters.characterGeneratedAssets, args.state.jobs, characters.storyCharacters), [characters.characterGeneratedAssets, args.state.jobs, characters.storyCharacters]);
  const lockedCharacterGroups = useMemo(() => lockedGroups(core.lockedProjectReferences), [core.lockedProjectReferences]);
  const referencePlan = characterReferencePlan(core.projectReferences.filter((reference) => !isQuickSetupReference(reference)), core.visualRequirements, characters.requiredStoryCharacters);
  const selection = pipelineSelection(args, core, characters, referencePlan);
  const selectedReference = selectedReferenceState(args, core, characters, lockedCharacterGroups);
  const previewGeneratedGroup = args.previewGeneratedAsset ? generatedCandidateGroups.find((group) => group.assets.some((asset) => asset.id === args.previewGeneratedAsset?.id)) : undefined;
  const previewGeneratedIndex = previewGeneratedGroup && args.previewGeneratedAsset ? Math.max(0, previewGeneratedGroup.assets.findIndex((asset) => asset.id === args.previewGeneratedAsset?.id)) : 0;
  const selectedVideoSkill = selection.videoSkills.find((skill) => skill.id === core.intake.videoSkillId) ?? selection.videoSkills.find((skill) => skill.entitlement === "free") ?? args.skills[0];
  const selectedCreativeSkill = args.skills.find((skill) => skill.id === "narrative-performance");
  return { ...core, ...characters, generatedCandidateGroups, lockedCharacterGroups, ...referencePlan, ...selection, selectedVideoSkill, selectedCreativeSkill,
    ...selectedReference, previewGeneratedGroup, previewGeneratedIndex, ...providerJobs(args, core) };
}
