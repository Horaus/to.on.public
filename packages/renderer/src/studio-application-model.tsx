import { type RunJobRequest } from "@studio/types/job-request";
import type {
  Asset,
  AutomationJob,
  Character,
  ProductionGraphCustomNode,
  ProductionGraphNodeSettings,
  ProductionGraphRevision,
  Project,
  ProjectIntake,
  Scene,
  Shot,
  StudioState,
  StyleBible,
  VideoEditorialReview
} from "@studio/types";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Boxes, LayoutDashboard, LayoutGrid, Library, Loader2, MonitorCheck, Pause, Play, RefreshCcw, Sparkles, Workflow } from "lucide-react";
import { useEffect, useMemo } from "react";
import { type RunJobPayload } from "@studio/workflow/support-core";
import { useReferenceWorkspace } from "@studio/workflow/reference-workspace";
import { useProductionGraphController } from "./production-graph-controller";
import {
  characterReferenceExistsForJob, jobBlocksCurrentPipeline, jobBridgeMessage, jobPipelineStep,
  jobWasSupersededByLaterSuccess, jobWasSupersededByNewerAttempt, jobNeedsCurrentUserAction, nextPipelineStepFromReadiness,
  pipelineStepActionLabel, pipelineStepItems, pipelineStepLabel, pipelineStepRequiresExtension,
  pipelineStepView, retryAttemptsForTarget, structuredTaskArtifactReady, deriveStudioPipelineMetrics,
  activePipelineJobsForStep, buildNavigation, buildPhaseStatusByView, deriveApplicationPipelineView, filterProjectRows
} from "./studio-application-workflow";
import { createProjectCommands, createProjectStateActions, createPromptCompactionActions, createStudioMediaActions, derivePipelinePresentation, fallbackSkills, seededState, studioRuntime, useStudioKeyboardShortcuts, useStudioRuntimeState, useStudioState } from "./studio-application-runtime";
import { studioActionFactories } from "@studio/workflow/orchestration/action-factories";
import { composeStudioProviderActions } from "./studio-application-provider-composition";
import { useStudioProjectSlice } from "./studio-project-slice";
import { createStudioPipelineControls, nextStudioAction, useStudioPipelineDomain } from "./studio-pipeline-domain";
import { useStudioReferenceDomain } from "./studio-reference-domain";
import { StudioPipelineRail } from "./studio-pipeline-rail";
import { approveStudioAsset, applyStudioStoryboardPrompts, buildStudioApplicationResult, composePromptMediaActions, composeStudioStoryAndTextActions, deriveStudioPipelinePresentation, deriveStudioPipelineUi, flowProjectTabIsReady, flowProjectWorkspaceUrl, openStudioFlowDocument, recoverStudioJob, saveStudioVideoReviewFrame, updateStudioVideoReview } from "./studio-application-composition";

import type {
  BridgeStatus,
  CanvasDocument,
  ReferenceUploadPayload,
  SkillDoc,
  StudioView,
  VideoAspectRatio
} from "@studio/workflow/studio-types";

export function useStudioApplicationModel() {
  const { assetFrameAspectRatio, defaultProjectIntake, durationToSeconds, imagePreviewSrc, readFileAsDataUrl, videoFramePatch, makeId, isActiveJob, isProjectJobBusy, jobNeedsUserAction, classifyTextRetry, isCorrectableStructuredImportFailure, formatLabel, statusLabel, buildVideoGenerationPrompt, skillInstructionForStage, FLOW_PROMPT_HARD_LIMIT, FLOW_PROMPT_SAFE_BYTES, preflightIssueSummary, utf8ByteLength } = studioRuntime;
  const seededProject = seededState.projects.find((item) => item.id === seededState.activeProjectId) ?? seededState.projects[0];
  const { state, setState, stateRef, bridgeStatus, refreshBridgeStatus, setBridgeStatus, skills, setSkills } = useStudioState({
    seededState,
    fallbackSkills,
    onInitialState: (incoming: StudioState, currentSkills: SkillDoc[]) => {
      const incomingProject = incoming.projects.find((item) => item.id === incoming.activeProjectId) ?? incoming.projects[0];
      const incomingSeed = incomingProject?.sourceDraft ?? incomingProject?.description ?? "";
      setStorySeed(incomingSeed);
      setGeneratedStorySeed(incomingProject?.storyDocument ? incomingSeed : "");
      const sceneIds = new Set(incoming.scenes.filter((item) => item.projectId === incomingProject?.id).map((item) => item.id));
      setSelectedShotId(incoming.shots.find((item) => sceneIds.has(item.sceneId))?.id ?? "shot_turn");
      if (currentSkills.length > 0) setActiveSkillId(currentSkills[0].id);
    },
    onStateUpdate: (incoming: StudioState) => {
      const activeProject = incoming.projects.find((item) => item.id === incoming.activeProjectId) ?? incoming.projects[0];
      const sceneIds = new Set(incoming.scenes.filter((item) => item.projectId === activeProject.id).map((item) => item.id));
      const activeShots = incoming.shots.filter((item) => sceneIds.has(item.sceneId));
      if (!activeShots.some((shot) => shot.id === selectedShotId)) {
        setSelectedShotId(activeShots[0]?.id ?? "shot_turn");
      }
      continueStoryboardQueue(incoming);
      if (pendingStoryboardQueueRef.current?.mode === "shot_keyframes") {
        queueNextReadyVideoWithHumanDelay(incoming, "Keyframe mới đã sẵn sàng");
      }
    }
  });

  const flowProjectTabReady = flowProjectTabIsReady(bridgeStatus);
  const flowProjectUrl = flowProjectWorkspaceUrl(bridgeStatus);
  const referenceWorkspace = useReferenceWorkspace();
  const runtimeState = useStudioRuntimeState(seededProject, flowProjectTabReady, state.activeProjectId);
  const {
    activeSkillId, activeView, appManagerOpen, appManagerTab, appliedGraphRevisionJobsRef,
    autoQueueVideoShotId, autoRetryingStructuredJobIdsRef, editInsertAfterShotId, editInsertBrief,
    editInsertKind, flowFocusTarget, generatedStorySeed, intakeRef, lastPipelineFocusRef,
    newProjectName, pendingAutoVideoShotRef, pendingStoryboardQueueRef, pendingVideoDispatchShotIdsRef,
    pipelineAutoFollowRef, pipelineRun, projectManagerOpen, projectSearch, restoredYoloProjectRef,
    selectedShotId, setActiveSkillId, setActiveView, setAppManagerOpen, setAppManagerTab,
    setAutoQueueVideoShotId, setEditInsertAfterShotId, setEditInsertBrief, setEditInsertKind,
    setFlowFocusTarget, setGeneratedStorySeed, setNewProjectName, setPipelineRun,
    setProjectManagerOpen, setProjectSearch, setSelectedShotId, setStorySeed, setStoryboardStep,
    setVideoFrameMenuOpen, storyboardStep, storyRedoRef, storySeed, storyUndoRef,
    updatePendingStoryboardQueue, videoFrameMenuOpen, videoFrameMenuRef
  } = runtimeState;
  const stateActions = createProjectStateActions({
    state, setState, selectedShotId, setSelectedShotId, setStorySeed, setGeneratedStorySeed,
    setProjectManagerOpen, setAppManagerOpen, setPipelineRun, updatePendingStoryboardQueue,
    pendingAutoVideoShotRef, pipelineAutoFollowRef, lastPipelineFocusRef
  });
  const { replaceState, resetProjectWorkflowRuntime, selectProject } = stateActions;
  const {
    quickReferenceUpload, setQuickReferenceUpload, quickReferenceNote, setQuickReferenceNote,
    selectedReferenceId, setSelectedReferenceId, referenceModalPane, setReferenceModalPane,
    referenceProfileEditing, setReferenceProfileEditing, previewGeneratedAsset, setPreviewGeneratedAsset,
    previewUpload, setPreviewUpload, missingImageRequest, setMissingImageRequest,
    referenceRevisionOpen, setReferenceRevisionOpen, referenceRevisionRequest, setReferenceRevisionRequest,
    pendingReferencePaneKeys, setPendingReferencePaneKeys, previewRevisionOpen, setPreviewRevisionOpen,
    activeCharacterSlot, setActiveCharacterSlot, candidateEdit, setCandidateEdit,
    candidateCarouselIndex, setCandidateCarouselIndex, referenceCandidates, setReferenceCandidates,
    referenceDraft, setReferenceDraft, primaryUploadInputRef, detailUploadInputRef,
    quickReferenceInputRef, referenceModalUploadInputRef, autoGeneratedEmptySlotsRef
  } = referenceWorkspace;
  const projectSlice = useStudioProjectSlice({ state, bridgeStatus, storySeed, generatedStorySeed, selectedShotId, storyboardStep,
    activeSkillId, skills, selectedReferenceId, referenceModalPane, pendingReferencePaneKeys, referenceDraft,
    activeCharacterSlot, previewGeneratedAsset, intakeRef, setState, replaceState });
  useEffect(() => {
    if (!videoFrameMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!videoFrameMenuRef.current?.contains(event.target as globalThis.Node)) setVideoFrameMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [videoFrameMenuOpen]);


  const {
    project, intake, projectReferences, productionProjectReferences, lockedProjectReferences, visualRequirements,
    isCharacterDetailRequirement, referenceForRequirement, missingVisualRequirements, nextMissingVisualRequirementNode,
    projectScenes, projectSceneIds, projectShots, projectAssets, editSequenceModel, style, projectCharacters, character,
    storyCharacters, requiredStoryCharacters, currentCharacterSlot, characterGeneratedAssets, characterImageJobsActive,
    recoverableCharacterImageJobs, generatedCandidateGroups, lockedCharacterGroups, nextCharacterReferenceTask,
    allRequiredCharacterReferencesReady, storyReadyForPipeline, bridgeCount, bridgeVersionLabel, selectedShot, scene,
    storyboardScene, storyboardSceneShots, storyboardSideShot, selectedProvider, safeTextProviderId, safeImageProviderId,
    safeVideoProviderId, routedVideoPlatform, selectedShotRenderDuration, storyboardAspectRatio, productionLanguage,
    contentLanguage, contentLanguageMismatch, languageCode, t, videoSkills, selectedVideoSkill,
    selectedCreativeSkill, selectedReference, translationJobActive, selectedReferenceGroup, selectedReferencePrimary,
    selectedReferenceDetail, selectedReferenceSlot, selectedReferenceRole, selectedReferenceSupportsDetail,
    selectedReferenceName, selectedReferencePaneKey, selectedReferenceHasGenerationData, selectedReferenceMainJobActive,
    selectedReferenceDetailJobActive, selectedReferencePaneHasImage, selectedReferencePaneJobActive,
    selectedReferencePaneLatestJob, selectedReferencePaneFailedJob, previewGeneratedGroup, previewGeneratedIndex,
    storyJob, connectionJob, storyJobActive, connectionJobActive, textProvider, showStoryJobStatus, productionGraph,
    productionGraphIssues, plannedShotCount, plannedShotDurations, plannedRuntimeSec, plannedSceneCount, pipelineReadiness,
    storyFoundationReady, storyArchitectureReady, screenplayReady, shotBreakdownReady, promptsReadyForPipeline,
    characterReadyForPipeline, keyframesReadyForPipeline, projectStats, projectSummaries
  } = projectSlice;
  const commands = createProjectCommands({
    state, setState, project, intake, intakeRef, newProjectName, setNewProjectName,
    setStorySeed, setGeneratedStorySeed, setProjectManagerOpen, setAppManagerOpen,
    setActiveView, replaceState, resetProjectWorkflowRuntime
  });
  const { createProject, updateShot, updateScene, updateProjectPatch, updateIntake } = commands;
  const graphController = useProductionGraphController({
    state, project, intake, visualRequirements, isCharacterDetailRequirement, referenceForRequirement,
    replaceState, updateProjectPatch, updateIntake, updateScene, updateShot, appliedGraphRevisionJobsRef,
    textProvider, selectedVideoSkill, productionLanguage
  });
  const {
    addProductionGraphNode, updateProductionGraphNode, deleteProductionGraphNode,
    generateProductionGraphImage, generateProductionGraphRevision, restoreProductionGraphTextVersion
  } = graphController;

  const openFlowDocument = (flowDocument: CanvasDocument) => openStudioFlowDocument(flowDocument, { setFlowFocusTarget, setActiveView });

  const referenceDomain = useStudioReferenceDomain({
    activeCharacterSlot, assetFrameAspectRatio, candidateEdit, character, currentCharacterSlot, detailUploadInputRef,
    formatLabel, imagePreviewSrc, intake, intakeRef, isCharacterDetailRequirement, makeId, primaryUploadInputRef,
    productionLanguage, project, projectAssets, projectReferences, quickReferenceNote, quickReferenceUpload, readFileAsDataUrl,
    referenceCandidates, referenceDraft, replaceState, requiredStoryCharacters, setActiveCharacterSlot,
    setPreviewRevisionOpen, setPreviewUpload, setQuickReferenceUpload, setReferenceCandidates, setReferenceDraft,
    setState, state, storyCharacters, textProvider, visualRequirements,
    missingImageRequest, referenceModalPane, referenceRevisionRequest, selectedReference, selectedReferenceDetail,
    selectedReferenceGroup, selectedReferenceHasGenerationData, selectedReferenceName, selectedReferencePaneJobActive,
    selectedReferencePaneKey, selectedReferencePrimary, selectedReferenceRole, selectedReferenceSlot,
    safeImageProviderId, setMissingImageRequest, setPendingReferencePaneKeys, setReferenceRevisionOpen,
    setReferenceRevisionRequest, runDemoJob: (payload) => runDemoJob(payload),
    selectedReferencePaneHasImage, selectedReferencePaneFailedJob, selectedReferencePaneLatestJob,
    selectedReferenceDetailJobActive, selectedReferenceSupportsDetail,
    autoGeneratedEmptySlotsRef, setReferenceModalPane, previewGeneratedAsset
  });
  const {
    applyStoryCharacter, chooseStoryCharacter, clearCharacterProfile, clearDraftUpload, setDraftUploads,
    setQuickReferenceFile, stageQuickVisualInputForProject, needsQuickVisualAnalysis, queueQuickVisualAnalysisJob,
    openUploadTile, stageReferenceCandidates, confirmReferenceCandidate, confirmGeneratedAssetAsReference,
    removeGeneratedAsset, removeGeneratedAssetGroup, regenerateGeneratedAsset, generateCharacterProfileDraft,
    removeReference, renderVoiceClip, requestMissingReferenceImage, requestSelectedReferenceRevision,
    updateVoiceProfile, uploadSelectedReferenceReplacement, flagStoryCharacterChange, updateCharacter,
    queueCharacterImageDraft
  } = referenceDomain;

  const contentActions = composeStudioStoryAndTextActions({ actionFactories: studioActionFactories,
    story: { storyDevelopment: { character, intake, intakeRef, lockedProjectReferences, productionLanguage, productionProjectReferences,
      project, projectSceneIds, projectScenes, projectShots, replaceState, routedVideoPlatform, selectedVideoSkill,
      setGeneratedStorySeed, setPipelineRun, skills, state, storySeed, textProvider },
    storyDocument: { project, replaceState, setState, storyRedoRef, storyUndoRef },
    storyRevision: { character, intake, lockedProjectReferences, productionLanguage, productionProjectReferences, project,
      replaceState, selectedVideoSkill, setGeneratedStorySeed, skills, state, storySeed, textProvider }
    }, text: {
      contentLanguage, contentLanguageMismatch, intakeTextProviderId: intake.aiRouting?.textProvider,
      productionLanguage, project, projectScenes, projectShots, providers: state.providers, replaceState,
      state, storyboardAspectRatio, textProvider, translationJobActive
    }
  });
  const storyActions = contentActions.story;
  const { applyPlanner, developNextScreenplayScene, developShots, developStory, persistStoryDocument, redoStoryChange,
    undoStoryChange, updateStoryDocument, rewriteStoryWithAi } = storyActions;

  useStudioKeyboardShortcuts({ activeView, appManagerOpen, projectManagerOpen, storyJobActive, setAppManagerTab, setAppManagerOpen, setProjectManagerOpen, developStory, redoStoryChange, undoStoryChange });

  const textActions = contentActions.text;
  const { testChatGptConnection, translateProductionContext } = textActions;

  const recoverJob = (jobId: string) => recoverStudioJob(jobId, replaceState);

  const promptMediaActions = composePromptMediaActions({ createStudioMediaActions, createPromptCompactionActions,
    media: { project, projectShots, state, intake, makeId, replaceState,
      runDemoJob: (payload: any) => runDemoJob(payload),
      queueProviderJob: (provider: any, shot: any, settings: any) => videoProviderActions.queueProviderJob(provider, shot, settings),
      runStoryboardRatioRepairQueue: (items: any, kind: any) => storyboardActions.runStoryboardRatioRepairQueue(items, kind),
      retryAutomationJob: (job: any) => retryAutomationJob(job) },
    compaction: { project, state, intake, textProvider, productionLanguage, makeId, isActiveJob,
      utf8ByteLength, hardLimit: FLOW_PROMPT_HARD_LIMIT, safeBytes: FLOW_PROMPT_SAFE_BYTES,
      replaceState, setPipelineRun }
  });
  const { regenerateProductionMedia, flowPromptFingerprint, flowShotFingerprint, completedCompactedPrompt, requestFlowPromptCompaction } = promptMediaActions;

  let videoProviderActions!: ReturnType<typeof composeStudioProviderActions>;
  const queueProviderJob = (...args: Parameters<ReturnType<typeof composeStudioProviderActions>["queueProviderJob"]>) => videoProviderActions.queueProviderJob(...args);
  const queueVideoJob = (...args: Parameters<ReturnType<typeof composeStudioProviderActions>["queueVideoJob"]>) => videoProviderActions.queueVideoJob(...args);

  useEffect(() => {
    if (!autoQueueVideoShotId) return;
    const targetShot = projectShots.find((shot) => shot.id === autoQueueVideoShotId);
    setAutoQueueVideoShotId(undefined);
    if (targetShot) queueVideoJob(targetShot);
  }, [autoQueueVideoShotId, projectShots, projectAssets, state.jobs]);

  const applyStoryboardPrompts = () => applyStudioStoryboardPrompts({ projectShots, buildVideoGenerationPrompt, productionLanguage, project, intake, setState, replaceState, state });

  const demoActions = studioActionFactories.createDemoActions({
    character, currentCharacterSlot, intake, productionLanguage, project, projectAssets, projectScenes, projectShots,
    scene, selectedShot, setState, state, storyCharacters, storyboardAspectRatio, style
  });
  const { completeDemoAssetsForStep, completeDemoCharacterReferences, runDemoJob } = demoActions;
  let goTo: (view: StudioView, options?: { auto?: boolean }) => void = (view, options = {}) => {
    if (!options.auto) pipelineAutoFollowRef.current = false;
    setActiveView(view);
    document.querySelector(".content-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  };
  let cancelCurrentProjectAutomation: (message?: string) => void = () => undefined;
  let handleBlockedPipelineAction: (mode: "step" | "full") => Promise<void> = async () => undefined;
  let togglePipelineRun: () => void = () => undefined;

  videoProviderActions = composeStudioProviderActions({
    bridgeCount, character, characterReadyForPipeline, completedCompactedPrompt, flowProjectTabReady, flowProjectUrl,
    flowPromptFingerprint, flowShotFingerprint, intake, lockedProjectReferences, missingVisualRequirements,
    pendingVideoDispatchShotIdsRef, productionLanguage, project, projectAssets, projectCharacters, projectReferences,
    projectScenes, projectShots, promptsReadyForPipeline, referenceForRequirement, replaceState,
    requestFlowPromptCompaction, runDemoJob, scene, selectedProvider, selectedShot, setPipelineRun, setSelectedShotId,
    state, storyFoundationReady, storyReadyForPipeline, style, visualRequirements
  });
  const { preflightVideoJob, providerReferenceRole, runJob, semanticVideoReferencesForShot, videoPreflightForShot } = videoProviderActions;

  const storyboardActions = studioActionFactories.createStoryboardActions({
    character, characterReadyForPipeline, intake, pendingStoryboardQueueRef, productionLanguage, project, projectAssets,
    projectScenes, projectShots, promptsReadyForPipeline, replaceState, runDemoJob, scene, selectedShot, setPipelineRun,
    state, storyboardAspectRatio, style, updatePendingStoryboardQueue, updateProjectPatch, updateScene, updateShot
  });
  const { buildStoryboardScenePayload, continueStoryboardQueue, dispatchStoryboardScene, generatePrompt, runMissingShotKeyframeQueue, runSceneMissingKeyframeQueue, runStoryboardOverviewQueue, runStoryboardRatioRepairQueue, syncStoryboardBreakdownToScenes, updateStoryboardBreakdown } = storyboardActions;

  const pipelineActions = studioActionFactories.createPipelineActions({
    activeView, allRequiredCharacterReferencesReady, applyStoryboardPrompts, bridgeCount, bridgeStatus, characterReadyForPipeline,
    completeDemoAssetsForStep, completeDemoCharacterReferences, developNextScreenplayScene, developShots, developStory,
    flowProjectTabReady, generateProductionGraphImage, goTo, intake, intakeRef, keyframesReadyForPipeline, lastPipelineFocusRef,
    needsQuickVisualAnalysis, nextCharacterReferenceTask, nextMissingVisualRequirementNode, pendingAutoVideoShotRef, pipelineAutoFollowRef,
    pipelineReadiness, project, projectAssets, projectReferences, projectScenes, projectShots, promptsReadyForPipeline,
    queueCharacterImageDraft, queueProviderJob, queueQuickVisualAnalysisJob, queueVideoJob, quickReferenceUpload,
    runMissingShotKeyframeQueue, screenplayReady, selectedProvider, setAutoQueueVideoShotId, setPipelineRun, shotBreakdownReady,
    stageQuickVisualInputForProject, state, stateRef, storyArchitectureReady, storyFoundationReady, updateProjectPatch,
    characterReferenceExistsForJob, jobBlocksCurrentPipeline, jobBridgeMessage, jobPipelineStep,
    jobWasSupersededByLaterSuccess, jobWasSupersededByNewerAttempt, nextPipelineStepFromReadiness,
    pipelineStepLabel, pipelineStepRequiresExtension, pipelineStepView, structuredTaskArtifactReady, isProjectJobBusy
  });
  const { focusPipelineStep, isDeferredFlowProviderFailure, jobBlocksCurrentAutomation, nextMissingVideoShot, nextPipelineStep, queueNextReadyVideoIfPossible, queueNextReadyVideoWithHumanDelay, runBatchQueue, runPipelineStep, runVideoBatchQueue, runWorkflowTemplate, shotHasUnresolvedVideoIssue, shotHasVisibleKeyframe, shotHasVisibleVideo } = pipelineActions;

  const approveAsset = (assetId: string) => approveStudioAsset(assetId, { replaceState, setState });
  const promoteReferenceToShot = async (targetShot: Shot) => {
    const reference = projectReferences.find((item) => targetShot.assetIds.includes(item.id));
    if (!reference || !window.studioBridge?.promoteReferenceToShot) return;
    const result = await window.studioBridge.promoteReferenceToShot({ projectId: project.id, shotId: targetShot.id, referenceId: reference.id, aspectRatio: storyboardAspectRatio });
    setState(result.state);
  };
  const saveVideoReviewFrame = (payload: { assetId: string; kind: "first" | "last"; dataUrl: string; timeSeconds: number }) => saveStudioVideoReviewFrame(payload, replaceState);
  const updateVideoReview = (assetId: string, review: Omit<VideoEditorialReview, "reviewedAt">) => updateStudioVideoReview(assetId, review, replaceState);

  const pipelineView = deriveStudioPipelinePresentation({
    project, projectScenes, projectShots, projectAssets, projectReferences, lockedProjectReferences, jobs: state.jobs,
    plannedSceneCount, plannedShotCount, pipelineReadiness, nextPipelineStep, isProjectJobBusy, jobNeedsUserAction, jobNeedsCurrentUserAction,
    shotHasVisibleVideo, shotHasVisibleKeyframe, videoPreflightForShot, jobBlocksCurrentAutomation, classifyTextRetry,
    preflightIssueSummary, pipelineRun, pipelineStepLabel, deriveApplicationPipelineView
  });
  const {
    pipelineStep, pipelineComplete, projectBlockedJobs, projectResolvedFailureJobIds, projectBlockedRetryAttempt,
    projectRetryLimitReached, projectCanRecoverLateText, projectRetryableJobs, projectJobs, activeJobs, actionNeededJobs,
    approvedShotCount, recentProjectJobs, readyMediaAssetCount, sourceReadyCount, projectBusyJobs,
    projectPreflightIssues, projectRepairablePreflights, projectPreflightBlocks, videoReadyCount, keyframeReadyCount,
    pipelineStarted, planned, prompted, generated, approved, scenePlanSource, phaseStatus,
    firstPreflightBlock, hasPipelineBlock, fullPipelineRunning, pipelineIdleMessage, pipelineDisplayMessage,
    blockingJobLabel, pipelinePrimaryLabel
  } = pipelineView;
  const pipelineActionLabel = pipelineStepActionLabel(pipelineStep);
  const projectRows = useMemo(() => filterProjectRows(projectSummaries, projectSearch, project.id), [project.id, projectSearch, projectSummaries]);
  const { retryAutomationJob } = useStudioPipelineDomain({
    autoRetryingStructuredJobIdsRef, focusPipelineStep, generateProductionGraphImage, intake, intakeRef, nextPipelineStep,
    pipelineStep, productionLanguage, productionProjectReferences, project, projectAssets, projectJobs, projectReferences,
    projectScenes, projectShots, queueCharacterImageDraft, recoverJob, referenceForRequirement, replaceState, routedVideoPlatform,
    runDemoJob, runPipelineStep, selectedCreativeSkill, selectedShot, selectedVideoSkill, setPipelineRun, setSelectedShotId,
    shotHasVisibleVideo, skills, state, storySeed,
    activeView, pipelineRun, projectScenesLength: projectScenes.length, projectShotsLength: projectShots.length,
    projectAssetsLength: projectAssets.length, projectReferencesLength: projectReferences.length,
    isProjectJobBusy, jobBlocksCurrentAutomation, retryAttemptsForTarget, isCorrectableStructuredImportFailure,
    queueNextReadyVideoIfPossible
  });

  // Restore one known-safe provider-tab navigation failure directly after a
  // renderer/Electron restart. The normal pipeline effect also guards this
  // identity, so the ref makes the recovery strictly single-flight even when
  // React re-renders while the extension reconnects.
  useEffect(() => {
    if (!intake.yoloEnabled || pipelineRun?.running || !projectBlockedJobs.length) return;
    const target = projectBlockedJobs.find((job: AutomationJob) =>
      job.status === "failed_retryable" && /(?:failed to open provider tab:\s*navigation rejected|previous desktop session ended before this browser job returned)/i.test(`${job.error || ""} ${job.statusMessage || ""}`)
    );
    if (!target || autoRetryingStructuredJobIdsRef.current.has(target.id)) return;
    autoRetryingStructuredJobIdsRef.current.add(target.id);
    setPipelineRun({ mode: "full", running: true, currentStep: pipelineStep, message: "Đã khôi phục lỗi mở tab provider; hệ thống tự thử lại một lần có giới hạn.", startedAt: new Date().toISOString() });
    retryAutomationJob(target);
  }, [autoRetryingStructuredJobIdsRef, intake.yoloEnabled, pipelineRun, pipelineStep, projectBlockedJobs, retryAutomationJob, setPipelineRun]);

  const { runningPipelineStep, activePipelineJobs, latestPipelineJob, pipelinePrimaryIcon, pipelineSteps, navigation, phaseStatusByView, next, topbarNext, showPipelineRail } = deriveStudioPipelineUi({
    projectBusyJobs, jobPipelineStep, pipelineRun, pipelineStep, activePipelineJobsForStep, fullPipelineRunning, hasPipelineBlock,
    pipelineStarted, pipelineComplete, pipelineStepItems, pipelineReadiness, buildNavigation, buildPhaseStatusByView, t,
    LayoutDashboard, Workflow, BookOpen, Boxes, LayoutGrid, MonitorCheck, Library,
    Loader2, Pause, Play, RefreshCcw, Sparkles, phaseStatus, projectJobs,
    nextStudioAction, planned, prompted, generated, approved, reviewLabel: t("common.reviewGeneratedAssets"), activeView
  });

  const pipelineControls = createStudioPipelineControls({
    activeView, firstPreflightBlock, fullPipelineRunning, hasPipelineBlock, intake, isProjectJobBusy,
    lastPipelineFocusRef, pipelineAutoFollowRef, pipelineStep, project, projectBlockedJobs, replaceState, retryAutomationJob,
    runPipelineStep, setActiveView, setPipelineRun, setSelectedShotId, setState, updatePendingStoryboardQueue,
    updateProjectPatch
  });
  ({ goTo, cancelCurrentProjectAutomation, handleBlockedPipelineAction, togglePipelineRun } = pipelineControls);

  useEffect(() => {
    if (!pipelineRun?.running) return;
    if (!pipelineAutoFollowRef.current) return;
    const currentStep = projectBusyJobs.map(jobPipelineStep).find(Boolean) ?? pipelineRun.currentStep ?? pipelineStep;
    const view = pipelineStepView(currentStep);
    if (view === activeView) return;
    const focusKey = `${project.id}:${currentStep}:${projectBusyJobs.map((job: AutomationJob) => job.id).join("|")}`;
    if (lastPipelineFocusRef.current === focusKey) return;
    lastPipelineFocusRef.current = focusKey;
    goTo(view, { auto: true });
  }, [activeView, pipelineRun, project.id, projectBusyJobs, pipelineStep]);


  // Full automation is project intent, not ephemeral UI state. Restore it
  // after navigation, renderer reload, or app restart so a completed provider
  // job can deterministically enqueue the next missing shot.
  useEffect(() => {
    // Do not resurrect a phantom "running" rail from a stale project intent.
    // A project with no sources/shots and no live jobs has nothing the
    // pipeline can process; leaving YOLO running here blocks the UI forever.
    const hasRunnableWork = projectBusyJobs.length > 0 || projectScenes.length > 0 || projectShots.length > 0;
    const sequenceRepairPending = project.storyDocument?.sequenceQA?.status === "BLOCKED" && pipelineStep === "shots";
    // A provider-tab navigation rejection is a bounded transport failure: the
    // extension never submitted content, and the pipeline effect has a finite
    // retry ceiling for this exact diagnostic. Permit YOLO to restore after a
    // renderer/Electron restart so the user does not need to press Retry for a
    // tab activation race. Other retryable blockers remain explicit/manual.
    const autoResumableNavigationBlock = projectBlockedJobs.length > 0 && projectBlockedJobs.every((job: AutomationJob) =>
      job.status === "failed_retryable" && /(?:failed to open provider tab:\s*navigation rejected|previous desktop session ended before this browser job returned)/i.test(`${job.error || ""} ${job.statusMessage || ""}`)
    );
    // A persisted YOLO intent must not resurrect itself over a terminal
    // retryable blocker. That created the misleading "Running" rail and
    // repeatedly re-submitted the same invalid shot packet after reload.
    // Keep the blocker visible and require an explicit Retry/Continue action.
    const restoreKey = `${project.id}:${pipelineStep}:${projectScenes.length}:${projectShots.length}:${projectAssets.length}:${projectJobs.length}`;
    if (!intake.yoloEnabled || !hasRunnableWork || (!sequenceRepairPending && projectBlockedJobs.length > 0 && !autoResumableNavigationBlock) || pipelineRun?.running || restoredYoloProjectRef.current === restoreKey) return;
    restoredYoloProjectRef.current = restoreKey;
    pipelineAutoFollowRef.current = false;
    setPipelineRun({
      mode: "full",
      running: true,
      currentStep: pipelineStep,
      message: "Đã khôi phục YOLO; hệ thống tự tiếp tục từ bước còn thiếu.",
      startedAt: new Date().toISOString()
    });
  }, [intake.yoloEnabled, pipelineRun, pipelineStep, project.id, projectBlockedJobs.length, projectScenes.length, projectShots.length, projectAssets.length, projectJobs.length]);

  const renderPipelineRail = (title: string, includeSetup = false) => <StudioPipelineRail title={title} includeSetup={includeSetup} showStepList={activeView !== "overview"}
    showPipelineRail={Boolean(showPipelineRail)} fullPipelineRunning={Boolean(fullPipelineRunning)} projectBusyJobs={projectBusyJobs}
    hasPipelineBlock={hasPipelineBlock} projectRetryLimitReached={projectRetryLimitReached} pipelinePrimaryLabel={pipelinePrimaryLabel}
    pipelinePrimaryIcon={pipelinePrimaryIcon} handleBlockedPipelineAction={(mode) => void handleBlockedPipelineAction(mode)}
    runPipelineStep={(mode) => void runPipelineStep(mode)} togglePipelineRun={togglePipelineRun} blockingJobLabel={blockingJobLabel}
    pipelineRun={pipelineRun} cancelCurrentProjectAutomation={() => cancelCurrentProjectAutomation()} storySeed={storySeed}
    setStorySeed={setStorySeed} quickReferenceUpload={quickReferenceUpload} setQuickReferenceUpload={setQuickReferenceUpload}
    quickReferenceInputRef={quickReferenceInputRef} setQuickReferenceFile={setQuickReferenceFile} quickReferenceNote={quickReferenceNote}
    setQuickReferenceNote={setQuickReferenceNote} intake={intake} durationToSeconds={durationToSeconds} updateIntake={updateIntake}
    storyboardAspectRatio={storyboardAspectRatio} videoFramePatch={videoFramePatch} plannedShotCount={plannedShotCount}
    plannedShotDurations={plannedShotDurations} plannedRuntimeSec={plannedRuntimeSec} pipelineStepLabel={pipelineStepLabel}
    runningPipelineStep={runningPipelineStep} pipelineDisplayMessage={pipelineDisplayMessage} state={state}
    latestPipelineJob={latestPipelineJob} formatLabel={formatLabel} statusLabel={statusLabel} activePipelineJobs={activePipelineJobs}
    goTo={goTo} pipelineSteps={pipelineSteps} jobPipelineStep={jobPipelineStep} firstPreflightBlock={firstPreflightBlock}
    preflightIssueSummary={preflightIssueSummary} projectBlockedJobs={projectBlockedJobs} projectBlockedRetryAttempt={projectBlockedRetryAttempt} />;

  const application = buildStudioApplicationResult({
    runtime: runtimeState, stateActions, project: projectSlice, commands, workspace: referenceWorkspace,
    referenceDomain, story: storyActions, text: textActions, media: promptMediaActions, demo: demoActions,
    videoProvider: videoProviderActions, storyboard: storyboardActions, pipelineActions, pipelineView, graph: graphController,
    promoteReferenceToShot,
    ui: { actionNeededJobs, activeJobs, activeView, addProductionGraphNode, appManagerOpen, appManagerTab, applyPlanner, approvedShotCount, bridgeCount, bridgeStatus, bridgeVersionLabel, cancelCurrentProjectAutomation, candidateCarouselIndex, candidateEdit, character, characterGeneratedAssets, characterImageJobsActive, chooseStoryCharacter, clearCharacterProfile, clearDraftUpload, confirmGeneratedAssetAsReference, confirmReferenceCandidate, connectionJob, connectionJobActive, contentLanguage, contentLanguageMismatch, createProject, deleteProductionGraphNode, detailUploadInputRef, editInsertAfterShotId, editInsertBrief, editInsertKind, editSequenceModel, flowFocusTarget, generateCharacterProfileDraft, generateProductionGraphImage, generateProductionGraphRevision, generatePrompt, generatedCandidateGroups, goTo, intake, languageCode, lockedCharacterGroups, lockedProjectReferences, missingImageRequest, name, navigation, newProjectName, openFlowDocument, openUploadTile, phaseStatusByView, pipelineActionLabel, pipelineComplete, pipelinePrimaryLabel, pipelineStarted, pipelineStep, pipelineSteps, preflightVideoJob, previewGeneratedAsset, previewGeneratedGroup, previewGeneratedIndex, previewRevisionOpen, previewUpload, primaryUploadInputRef, productionGraph, productionGraphIssues, productionLanguage, productionProjectReferences, project, projectAssets, projectBlockedJobs, projectBusyJobs, projectCharacters, projectJobs, projectManagerOpen, projectReferences, projectResolvedFailureJobIds, projectRows, projectScenes, projectSearch, projectShots, projectStats, queueCharacterImageDraft, queueVideoJob, recentProjectJobs, recoverJob, recoverableCharacterImageJobs, referenceCandidates, referenceDraft, referenceModalPane, referenceModalUploadInputRef, referenceProfileEditing, referenceRevisionOpen, referenceRevisionRequest, regenerateGeneratedAsset, regenerateProductionMedia, removeGeneratedAssetGroup, removeReference, renderPipelineRail, renderVoiceClip, replaceState, requestMissingReferenceImage, requestSelectedReferenceRevision, restoreProductionGraphTextVersion, retryAutomationJob, rewriteStoryWithAi, runBatchQueue, runJob, runPipelineStep, runSceneMissingKeyframeQueue, runStoryboardOverviewQueue, runStoryboardRatioRepairQueue, runWorkflowTemplate, safeImageProviderId, safeTextProviderId, safeVideoProviderId, saveVideoReviewFrame, scenePlanSource, selectProject, selectedCreativeSkill, selectedReference, selectedReferenceDetail, selectedReferenceDetailJobActive, selectedReferenceHasGenerationData, selectedReferenceMainJobActive, selectedReferencePaneFailedJob, selectedReferencePaneHasImage, selectedReferencePaneJobActive, selectedReferencePrimary, selectedReferenceSupportsDetail, selectedShot, selectedShotRenderDuration, selectedVideoSkill, setActiveSkillId, setAppManagerOpen, setAppManagerTab, setCandidateCarouselIndex, setCandidateEdit, setDraftUploads, setEditInsertAfterShotId, setEditInsertBrief, setEditInsertKind, setMissingImageRequest, setNewProjectName, setPreviewGeneratedAsset, setPreviewRevisionOpen, setPreviewUpload, setProjectManagerOpen, setProjectSearch, setReferenceCandidates, setReferenceDraft, setReferenceModalPane, setReferenceProfileEditing, setReferenceRevisionRequest, setSelectedReferenceId, setSelectedShotId, setState, setStorySeed, setStoryboardStep, setVideoFrameMenuOpen, shotHasVisibleVideo, showPipelineRail, showStoryJobStatus, sourceReadyCount, stageReferenceCandidates, state, storyCharacters, storyJob, storyJobActive, storySeed, storyboardAspectRatio, storyboardScene, storyboardSceneShots, storyboardSideShot, storyboardStep, syncStoryboardBreakdownToScenes, t, testChatGptConnection, textProvider, togglePipelineRun, topbarNext, translateProductionContext, translationJobActive, updateCharacter, updateIntake, updateProductionGraphNode, updateProjectPatch, updateScene, updateShot, updateStoryDocument, updateStoryboardBreakdown, updateVideoReview, updateVoiceProfile, uploadSelectedReferenceReplacement, videoFrameMenuOpen, videoFrameMenuRef, videoPreflightForShot }
  });
  application.refreshBridgeStatus = refreshBridgeStatus;
  return application;
}

export { StudioApplicationContext, useStudioApplicationContext } from "./studio-application-context";
export type { StudioApplicationModel } from "./studio-application-context";
