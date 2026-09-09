import { getWorkflowBridge } from "@studio/workflow/workflow-bridge";
import { flowConnectionsForTopology } from "./core/flow-connection-identity";

/** Dependency-injected composition helpers. Provider actions use the injectable bridge. */
export function composeStoryActions(deps: any) {
  const story = deps.actionFactories.createStoryDevelopmentActions(deps.storyDevelopment);
  const document = deps.actionFactories.createStoryDocumentActions(deps.storyDocument);
  const rewriteStoryWithAi = deps.actionFactories.createStoryRevisionAction(deps.storyRevision);
  return { ...story, ...document, rewriteStoryWithAi };
}

/**
 * Composition boundary for narrative and text-tool action families. The
 * application model supplies state/callbacks; this boundary keeps the hook
 * from becoming the owner of every action factory branch.
 */
export function composeStudioStoryAndTextActions(deps: any) {
  const story = composeStoryActions({ ...deps.story, actionFactories: deps.actionFactories });
  const text = deps.actionFactories.createTextUtilityActions(deps.text);
  return { story, text };
}

export function composePromptMediaActions(deps: any) {
  const media = deps.createStudioMediaActions(deps.media);
  const compaction = deps.createPromptCompactionActions(deps.compaction);
  return { ...media, ...compaction };
}

export function openStudioFlowDocument(flowDocument: any, deps: any) {
  const target = flowDocument.kind === "image" || flowDocument.kind === "video" || flowDocument.kind === "reference-note"
    ? "assets" : flowDocument.kind === "scene" || flowDocument.kind === "shot" ? "storyboard" : "story";
  const focusTarget = flowDocument.kind === "profile" ? "profile" : target === "assets" ? "references" : "source";
  deps.setFlowFocusTarget(focusTarget); deps.setActiveView(target);
  window.setTimeout(() => {
    const element = document.querySelector<HTMLElement>(`[data-flow-target='${focusTarget}']`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" }); element?.focus({ preventScroll: true });
    window.setTimeout(() => deps.setFlowFocusTarget(null), 1600);
  }, 80);
}

export function recoverStudioJob(jobId: string, replaceState: (state: any) => void) {
  getWorkflowBridge()?.recoverJob(jobId).then(replaceState);
}

export function applyStudioStoryboardPrompts(deps: any) {
  const patches = deps.projectShots.map((shot: any) => ({ id: shot.id, prompt: shot.prompt || deps.buildVideoGenerationPrompt({ shot, outputLanguage: deps.productionLanguage, sourceMode: deps.project.intake?.flowVideoMode ?? deps.intake.flowVideoMode ?? "components" }) }));
  deps.setState((current: any) => ({ ...current, shots: current.shots.map((shot: any) => { const patch = patches.find((item: any) => item.id === shot.id); return patch ? { ...shot, prompt: patch.prompt } : shot; }) }));
  if (getWorkflowBridge()) void Promise.all(patches.map((patch: any) => getWorkflowBridge().updateShot(patch))).then((results) => deps.replaceState(results.at(-1) ?? deps.state));
}

export function approveStudioAsset(assetId: string, deps: any) {
  if (getWorkflowBridge()) { getWorkflowBridge().approveAsset(assetId).then(deps.replaceState); return; }
  deps.setState((current: any) => ({ ...current, jobs: current.jobs.map((job: any) => job.resultAssetIds.includes(assetId) ? { ...job, status: "approved" } : job), shots: current.shots.map((shot: any) => shot.assetIds.includes(assetId) ? { ...shot, status: "approved" } : shot) }));
}

export async function saveStudioVideoReviewFrame(payload: any, replaceState: (state: any) => void) {
  if (!getWorkflowBridge()) throw new Error("Desktop bridge is unavailable.");
  replaceState(await getWorkflowBridge().saveVideoReviewFrame(payload));
}

export async function updateStudioVideoReview(assetId: string, review: any, replaceState: (state: any) => void) {
  if (!getWorkflowBridge()) throw new Error("Desktop bridge is unavailable.");
  replaceState(await getWorkflowBridge().updateVideoReview({ assetId, review }));
}

export function deriveStudioPipelinePresentation(deps: any) {
  const sequenceQaMessage = deps.project.storyDocument?.sequenceQA?.status === "BLOCKED"
    ? `Sequence QA chặn: ${deps.project.storyDocument.sequenceQA.findings.filter((finding: any) => finding.severity === "blocking").map((finding: any) => finding.code).join(", ")}. Sửa tại ${deps.project.storyDocument.sequenceQA.revisionTargets.join(", ")}.`
    : undefined;
  return deps.deriveApplicationPipelineView({ ...deps, sequenceQaMessage });
}

export function deriveStudioPipelineUi(deps: any) {
  const runningJobStep = deps.projectBusyJobs.map(deps.jobPipelineStep).find(Boolean);
  const runningPipelineStep = runningJobStep ?? deps.pipelineRun?.currentStep ?? deps.pipelineStep;
  const activePipelineJobs = deps.activePipelineJobsForStep(deps.projectBusyJobs, runningPipelineStep, deps.jobPipelineStep);
  const latestPipelineJob = activePipelineJobs[0] ?? deps.projectBusyJobs[0];
  const pipelinePrimaryIcon = deps.fullPipelineRunning ? deps.Pause : deps.projectBusyJobs.length ? deps.Loader2 : deps.hasPipelineBlock ? deps.RefreshCcw : deps.pipelineStarted && !deps.pipelineComplete ? deps.Play : deps.Sparkles;
  const pipelineSteps = deps.pipelineStepItems(deps.pipelineReadiness);
  const navigation = deps.buildNavigation(deps.t, { overview: deps.LayoutDashboard, flow: deps.Workflow, story: deps.BookOpen, assets: deps.Boxes, storyboard: deps.LayoutGrid, review: deps.MonitorCheck, source: deps.Library, generate: deps.Sparkles });
  const phaseStatusByView = deps.buildPhaseStatusByView(deps.phaseStatus, deps.projectJobs, deps.project);
  const next = deps.nextStudioAction(deps.planned, deps.prompted, deps.generated, deps.approved, deps.reviewLabel);
  return { runningPipelineStep, activePipelineJobs, latestPipelineJob, pipelinePrimaryIcon, pipelineSteps, navigation, phaseStatusByView, next, topbarNext: deps.activeView !== "overview" && next.view !== deps.activeView ? next : null, showPipelineRail: deps.activeView !== "overview" && (deps.pipelineRun?.mode === "full" || deps.projectBusyJobs.length > 0) };
}

export function flowProjectTabIsReady(bridgeStatus: any) {
  const summary = flowConnectionSummary(bridgeStatus);
  // A published `/tool-version/` route is itself a valid project context and
  // is classified by Flow as both a project and custom-tool tab. In that
  // topology the derived base-workspace count is zero, so requiring a
  // separate workspace would incorrectly block a valid runtime-only setup.
  const hasWorkspaceAndRuntime = summary.flowWorkspaceTabCount === 1
    && summary.flowCustomToolTabCount === 1
    && summary.flowRuntimeToolTabCount === 1;
  const hasRuntimeOnly = summary.flowWorkspaceTabCount === 0
    && summary.flowCustomToolTabCount === 1
    && summary.flowRuntimeToolTabCount === 1;
  // UI-direct Flow execution only needs the signed-in workspace tab. A
  // runtime/custom-tool tab is optional for this route; requiring one here
  // made the renderer report "not ready" while the extension verifier had a
  // healthy single workspace available.
  const hasWorkspaceDirect = summary.flowWorkspaceTabCount === 1
    && summary.flowCustomToolTabCount === 0
    && summary.flowRuntimeToolTabCount === 0;
  return (hasWorkspaceAndRuntime || hasRuntimeOnly || hasWorkspaceDirect)
    && !summary.flowEditorToolOpen
    && !summary.flowHasDuplicateTabs;
}

/** Return the canonical signed-in Flow workspace route advertised by the
 * selected extension connection. This route is copied into new video jobs so
 * the extension never has to guess which open project should receive them. */
export function flowProjectWorkspaceUrl(bridgeStatus: any): string | undefined {
  const connections = flowConnectionsForTopology(bridgeStatus);
  const candidates = connections.filter((connection: any) => {
    const visibility = connection?.providerVisibility || {};
    const projectTabs = Number(visibility.googleFlowProjectTabs || 0);
    const customToolTabs = Number(visibility.googleFlowCustomToolTabs || 0);
    const workspaceTabs = Math.max(0, projectTabs - customToolTabs);
    const runtimeTabs = Number(visibility.googleFlowRuntimeToolTabs || 0);
    const editorTabs = Number(visibility.googleFlowEditorToolTabs || 0);
    // A published runtime is accompanied by its base workspace in the same
    // extension connection (projectTabs includes both). Keep the direct
    // workspace-only mode for UI-direct jobs, but never select an arbitrary
    // connection when two installations advertise Flow.
    return editorTabs === 0 && ((runtimeTabs === 1 && workspaceTabs >= 1) || (runtimeTabs === 0 && workspaceTabs === 1));
  });
  if (candidates.length !== 1) return undefined;
  const candidate = candidates[0];
  const raw = (candidate?.providerVisibility?.googleFlowUrls || []).find((value: unknown) => /\/tools\/flow\/project\/[^/]+(?:\/|$)/i.test(String(value)));
  if (!raw) return undefined;
  try {
    const url = new URL(String(raw));
    url.pathname = url.pathname.replace(/\/tool-version\/[^/]+\/?$/i, "").replace(/\/tool\/[^/]+\/?$/i, "").replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return /\/project\/[^/]+$/i.test(url.pathname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function flowConnectionSummary(bridgeStatus: any) {
  const connections = flowConnectionsForTopology(bridgeStatus);
  const count = (key: string) => connections.reduce((total: number, connection: any) => total + Number((connection.providerVisibility as Record<string, unknown> | undefined)?.[key] || 0), 0);
  const flowProjectTabCount = count("googleFlowProjectTabs");
  const flowCustomToolTabCount = count("googleFlowCustomToolTabs");
  const flowWorkspaceTabCount = Math.max(0, flowProjectTabCount - flowCustomToolTabCount);
  const flowRuntimeToolTabCount = count("googleFlowRuntimeToolTabs");
  const flowEditorToolTabCount = count("googleFlowEditorToolTabs");
  return {
    flowProjectTabCount, flowCustomToolTabCount, flowWorkspaceTabCount, flowRuntimeToolTabCount, flowEditorToolTabCount,
    flowRuntimeToolCount: flowRuntimeToolTabCount, flowEditorToolCount: flowEditorToolTabCount,
    flowProjectOpen: flowWorkspaceTabCount > 0 || flowRuntimeToolTabCount > 0, flowRuntimeToolOpen: flowRuntimeToolTabCount > 0, flowEditorToolOpen: flowEditorToolTabCount > 0,
    flowHasDuplicateTabs: flowWorkspaceTabCount > 1 || flowCustomToolTabCount > 1 || flowRuntimeToolTabCount > 1 || flowEditorToolTabCount > 1
  };
}

export function buildStudioApplicationResult(groups: any) {
  return Object.assign({}, groups.runtime, groups.stateActions, groups.project, groups.commands, groups.workspace,
    groups.referenceDomain, groups.story, groups.text, groups.media, groups.demo, groups.videoProvider,
    groups.storyboard, groups.pipelineActions, groups.pipelineView, groups.graph,
    { hasDesktopBridge: typeof globalThis !== "undefined" && Boolean((globalThis as any).studioBridge) }, groups.ui);
}
