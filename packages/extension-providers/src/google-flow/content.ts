import { configureFlowComposerReferenceHelpers, composerHasReferenceSource, composerContainsMediaUrls, composerReferenceMatches, waitForPromptAttachmentIncrease, waitForComposerReference, waitForVerifiedComposerSource, isFlowRemoveButton, isDetachedFlowCancelButton, composerReferenceRemoveButtons, clearComposerReferences, composerReferenceCounts, discardFlowPromptButton, removeOneComposerReference, clearFlowDraftBeforeRetry } from "./flow-composer-reference-helpers";
import { configureFlowPickerHelpers, waitForAddToPromptMenuItem, waitForMediaPickerContent, waitForPickerReference, ensureFlowPickerInventoryCategory, waitForExactReferenceOptionInPicker, isReadyExactReferenceOption, waitForStartFrameAttachment, flowComposerComponentAddButtons, flowComponentButtonMatchesText, flowComponentButtonPlacement, flowComponentButtonShape, isFlowComponentAddButton, compareFlowComponentAddButtons, openFlowMediaPicker, openFlowMediaPickerFromButton, waitForMediaPickerDialog, waitForFlowComponentDialog, flowComponentMenuItem, openFlowLibraryUploadMenu, flowLibraryUploadButtons, isFlowLibraryUploadButton, openFlowStartFramePicker, tileSimilarity, findTileInMediaPicker, exactStartFrameOption, confirmStartFrameOption, attachReferenceThroughVisibleStartPicker, uploadReferenceThroughStartFramePicker, stageStartFramePickerUpload, waitForUploadedStartFrame, exactPickerTarget, selectedPickerTargetMatchesReference, waitForExactPickerSelection, selectExactPickerTarget, commitPickerTarget, commitSelectedPickerItem, addTileToPromptViaPicker, addTileToPromptViaStartFramePicker, addExactReferenceTile, addTileWithFallbackStrategy, addTileToPrompt } from "./flow-picker-helpers";
import { resolveProviderVideoDuration } from "@studio/domain/duration-policy";
import { type FlowTileBaseline, type FlowRuntimeHost, createFlowJobDispatcher, fingerprintDistance as compareImageFingerprints, normalizedReferenceToken, referenceRequiredLabel as getReferenceRequiredLabel, referenceSearchTokens as getReferenceSearchTokens, referenceGeometryIsScoped, createFlowDomControls, createFlowWorkspaceGates, compareStartFrameOptions, createDirectFlowBridge, createFlowComposerDom, createFlowComposerSurface, createFlowNativeInput, createFlowPromptEditor, createFlowReferenceSearch, createFlowResultTileInspector, currentTileIds, flowImageTileRoot, imageLooksLikeFlowMedia, mediaPickerReferenceOptions, tileCandidateScore, tileMediaUrls as inspectTileMediaUrls, tileStableText, flowResultTileId, flowResultTiles as getFlowResultTiles } from "./flow-runtime-boundaries";
import { createFlowComposerSettings, compactText, flowEditableText, isVisible, normalizedFlowControlText, visibleText, createFlowFrameDom } from "./flow-runtime-ui";
import { createFlowResultMedia, isFreshFlowTile, createFlowResultRecovery, flowJobRunTokens as runtimeFlowJobRunTokens, nextFlowJobRunToken as runtimeNextFlowJobRunToken, persistFlowJobBaselines as runtimePersistFlowJobBaselines, readFlowJobBaselines as runtimeReadFlowJobBaselines, runningFlowJobIds as runtimeRunningFlowJobIds, throwIfFlowJobRunStale as runtimeThrowIfFlowJobRunStale, dispatchFlowInput, findElement, findElements, humanDelay, promptCompareKey, setNativeInputValue, closestFlowResultTile as runtimeClosestFlowResultTile, flowTileLinks as runtimeFlowTileLinks, flowTilePercent as runtimeFlowTilePercent, mediaElementsIn as runtimeMediaElementsIn, flowAuthMessage, flowChromeErrorMessage, flowCrashMessage, flowSubmitRejectionMessage, flowProjectBaseUrl, flowWorkspaceMatches, bridgeCall as callFlowBridge, type FlowBridgeAction, type FlowBridgeResponse, withTimeout, flowDebugSnapshot as buildFlowDebugSnapshot, flowPageErrorText as classifyFlowPageError, createFlowReferenceLedger, referenceDataUrl, hasUsableReference, dataUrlToFile, referenceLocalFilePath, hydrateReferences, FLOW_SELECTORS } from "./flow-runtime-support";

console.log("[Studio] Google Flow adapter loaded");

const FLOW_ADAPTER_INSTANCE_ID = "2026-07-19-flow-native-add-v124";
const FLOW_ROUTE_HANDOFF_KEY = "studio.flow.route-handoff";
const FLOW_RESULT_RECOVERY_KEY = "studio.flow.result-recovery";
const FLOW_DIRECT_BRIDGE_URL = "ws://127.0.0.1:3767";
const FLOW_EXTENSION_VERSION = chrome.runtime.getManifest().version;
type FlowMessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];
const flowWindow = window as FlowRuntimeHost & {
  __studioGoogleFlowAdapterLoaded?: boolean;
  __studioGoogleFlowAdapterInstanceId?: string;
  __studioGoogleFlowAdapterListener?: FlowMessageListener;
  __studioFlowDirectBridgeSocket?: WebSocket | null;
  __studioFlowDirectBridgeReconnectTimer?: number;
  __studioFlowJobBaselines?: Record<string, FlowTileBaseline>;
  __studioFlowRunningJobIds?: Set<string>;
  __studioFlowJobRunTokens?: Record<string, number>;
};
const FLOW_JOB_BASELINES_KEY = "studio.flow.jobBaselines.v1";
let lastNativeMouseClickDiagnostic = "";
let lastStartFramePickerDiagnostic = "";
// A timed-out settings/picker promise can finish after the job has already
// reported a terminal manual/error state. Ignore those late progress events so
// the desktop UI cannot regress from waiting_manual_action/failed back to
// submitting while the old promise is still unwinding.
const flowTerminalJobIds = new Set<string>();

const flowJobBaselines = () => runtimeReadFlowJobBaselines(flowWindow, FLOW_JOB_BASELINES_KEY);
const persistFlowJobBaselines = () => runtimePersistFlowJobBaselines(flowWindow, FLOW_JOB_BASELINES_KEY);
const runningFlowJobIds = () => runtimeRunningFlowJobIds(flowWindow);
const flowJobRunTokens = () => runtimeFlowJobRunTokens(flowWindow);
const nextFlowJobRunToken = (jobId: string) => runtimeNextFlowJobRunToken(flowWindow, jobId);
const throwIfFlowJobRunStale = (jobId: string, runToken: number) => runtimeThrowIfFlowJobRunStale(flowWindow, jobId, runToken);
const mediaElementsIn = (scope: ParentNode) => runtimeMediaElementsIn(scope, SELECTORS.resultMedia);
const flowTilePercent = runtimeFlowTilePercent;
const closestFlowResultTile = runtimeClosestFlowResultTile;
const flowTileLinks = runtimeFlowTileLinks;
const flowResultMedia = createFlowResultMedia({ mediaElementsIn, flowTileLinks, visibleText });
function tileMediaUrls(tile: HTMLElement): string[] { return inspectTileMediaUrls(tile, mediaElementsIn); }
const {
  flowMediaUrl,
  flowTileEditId,
  isFlowVideoMediaElement,
  flowTileHasVideoMedia,
  flowTileHasStaticImageMedia,
  flowTileIsImageOnlyResult,
  flowImageOnlyVideoError,
  flowTileMayRevealMedia,
} = flowResultMedia;

type JobPayload = {
  jobId: string;
  prompt: string;
  task: string;
  settings?: Record<string, unknown>;
  references?: Array<{
    assetId: string;
    base64?: string;
    filePath?: string;
    mimeType?: string;
    filename?: string;
    referenceRole?: "shot_keyframe" | "character_identity" | "character_detail" | "setting" | "prop" | "style";
    referenceLabel?: string;
  }>;
};

type FlowCaptureResponse = {
  ok: boolean;
  adapter: string;
  assets?: Array<Record<string, unknown>>;
  error?: string;
};

type FlowSdkSelection = {
  jobId: string;
  reference: NonNullable<JobPayload["references"]>[number];
  // Published Relay runtimes need an identity from the workspace, not a
  // classic composer interaction. If no exact ready tile exists, prefer the
  // verified file-input upload path so a stale/absent composer cannot strand
  // the request in a picker wait.
  preferDirectUpload?: boolean;
};

// Studio Shot Bridge's iframe delegates media selection to the Flow host via
// Flow.media.select(). This queue is primed only for the active strict job;
// unrelated Flow picker requests are left to the provider's own UI.
const flowSdkSelectionQueue: FlowSdkSelection[] = [];
const flowSdkSelectionErrors = new Map<string, string>();

function flowMediaIdFromTile(tile: HTMLElement | null | undefined): string {
  if (!tile) return "";
  // Successful Flow results identify media with `fe_id_*` (the tile/edit
  // identity), so preserve that as the primary SDK value. Some Flow surfaces
  // expose a dedicated media attribute; the URL `name` remains a last-resort
  // compatibility fallback only.
  const explicit = tile.dataset.mediaId || tile.getAttribute("data-media-id") || "";
  if (/^fe_id_/i.test(explicit)) return explicit;
  const direct = tile.dataset.tileId || tile.getAttribute("data-tile-id") || "";
  if (/^fe_id_/i.test(direct)) return direct;
  const image = tile.querySelector<HTMLImageElement>("img[src]");
  if (image?.src) {
    try {
      const value = new URL(image.src, location.href).searchParams.get("name");
      if (/^fe_id_/i.test(value || "")) return String(value);
    } catch {}
  }
  return "";
}

function cancelFlowJobRun(jobId: string): void {
  nextFlowJobRunToken(jobId);
  runningFlowJobIds().delete(jobId);
  if (runningFlowJobIds().size === 0) {
    void clearAcceptedFlowDraft(jobId);
  }
}

const SELECTORS = FLOW_SELECTORS;

const flowComposerSurface = createFlowComposerSurface({ isVisible, flowEditableText, compactText, visibleText });
const { activeFlowPromptEditor, getComposerRoot, composerPanelRoot, promptAttachmentElements, promptAttachmentCount } = flowComposerSurface;
const flowDomControls = createFlowDomControls({ isVisible, visibleText, humanPause: (minMs = 650, maxMs = 1250) => new Promise<void>((resolve) => setTimeout(resolve, humanDelay(minMs, maxMs))) });
const { simulateClick, elementCenter, simulatePointerDrag, mediaPickerDialogs, mediaUploadMenus, closeMediaPickerIfOpen, findFloatingFlowCloseButtons, visibleTransientOverlays, closeOverlay } = flowDomControls;
const flowWorkspaceGates = createFlowWorkspaceGates({ isVisible, visibleText });
const { flowGateFromText, isManualGate, findFlowAccountTarget, flowGridCreateButton } = flowWorkspaceGates;

const { isFlowFrameSlot, compareFlowFrameSlots, flowStartOrEndFrameSlots, flowStartFrameSlots, flowDirectFrameAttachmentElements, flowStartFrameSlotLooksAttached, flowStartFrameAttachmentRemoveButtons, directFrameAttachmentCount, flowComposerDropTargets, tileDragSource, addTileDataToTransfer } = createFlowFrameDom({ visibleText, isVisible, getComposerRoot, activeFlowPromptEditor });

const bridgeCall = callFlowBridge;
let lastFlowValidationFailure = "";

function isVideoJob(payload: JobPayload): boolean {
  return payload.task.includes("video") || payload.settings?.resultType === "video" || payload.settings?.mode === "video";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanPause(minMs = 650, maxMs = 1250): Promise<void> {
  await sleep(humanDelay(minMs, maxMs));
}

function flowDebugSnapshot(): string {
  const pageError = flowPageErrorText();
  const visibleButtons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    .filter(isVisible)
    .slice(-18)
    .map((element) => compactText(visibleText(element), 70))
    .filter(Boolean);
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-state="open"]'))
    .filter(isVisible)
    .slice(-4)
    .map((element) => compactText(element.innerText || "", 140))
    .filter(Boolean);
  const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    .map((input) => input.getAttribute("accept") || "any")
    .slice(-8);
  const promptEditor = activeFlowPromptEditor();
  const promptRect = promptEditor?.getBoundingClientRect();
  const promptText = promptEditor ? compactText(flowEditableText(promptEditor), 120) : "";
  const promptInfo = promptEditor ? `${promptEditor.tagName}@${Math.round(promptRect?.x || 0)},${Math.round(promptRect?.y || 0)} ${Math.round(promptRect?.width || 0)}x${Math.round(promptRect?.height || 0)} "${promptText}"` : "none";
  return buildFlowDebugSnapshot({ pageError, pathname: location.pathname, title: document.title || "", promptInfo, buttons: visibleButtons, panels, fileInputs });
}

function flowPageErrorText(): string | null {
  return classifyFlowPageError({ href: location.href, title: document.title || "", bodyText: document.body?.innerText || "", crash: flowCrashMessage, chrome: flowChromeErrorMessage, auth: flowAuthMessage });
}

function reportFlowPageError(jobId: string, phase = ""): boolean {
  const pageError = flowPageErrorText();
  if (!pageError) return false;
  const phaseText = phase ? ` ${phase}` : "";
  reportResult(jobId, "failed_retryable", undefined, `${pageError}${phaseText} ${flowDebugSnapshot()}`);
  return true;
}

function flowSubmitRejectionText(): string | null {
  // The Flow project body also contains TobyFlow's historical run log. It
  // can include an old “Bạn phải cung cấp câu lệnh” entry even when the
  // current submission was accepted. Only inspect live provider feedback
  // surfaces, never the whole gallery/history body.
  const feedback = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="alert"], [aria-live="assertive"], [aria-live="polite"], .mat-mdc-snack-bar-container'
  ))
    .filter(isVisible)
    .map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  return flowSubmitRejectionMessage(feedback);
}

function reportFlowSubmitRejection(jobId: string): boolean {
  const rejection = flowSubmitRejectionText();
  if (!rejection) return false;
  reportResult(jobId, "failed_retryable", undefined, `${rejection} ${flowDebugSnapshot()}`);
  return true;
}

function verifyLockedFlowWorkspace(payload: JobPayload): boolean {
  const expected = String(payload.settings?.providerWorkspaceUrl || "");
  if (flowWorkspaceMatches(expected, location.href)) return true;
  reportResult(payload.jobId, "waiting_manual_action", undefined,
    `This job is locked to ${flowProjectBaseUrl(expected)}, but the active tab is ${flowProjectBaseUrl(location.href)}. Open the original Google Flow project/account and recover the job. The extension did not submit again.`);
  return false;
}

async function recoverFlowPageIfCrashed(payload: JobPayload): Promise<boolean> {
  const jobId = payload.jobId;
  const pageError = flowPageErrorText();
  if (!pageError) return true;
  // A crash before provider acceptance is not recoverable by reloading the
  // same composer: the picker/Slate state is lost and repeating the command
  // can create duplicate or wrong-reference generations. Stop at this
  // boundary and require a deliberate user retry after reopening the project.
  reportResult(jobId, "failed_retryable", undefined, `${pageError} Flow setup stopped before submit; reopen the exact project and retry manually. ${flowDebugSnapshot()}`);
  return false;
}

function flowTrace(jobId: string, message: string, progress?: number, status = "submitting"): void {
  console.log(`[Studio][Flow][${jobId}] ${message}`, flowDebugSnapshot());
  reportStatus(jobId, status, message, progress);
}

async function revealFlowImageLibrary(jobId: string): Promise<void> {
  await closeMediaPickerIfOpen();
  const imageTab = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [aria-label]"))
    .filter((element) => {
      if (!isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      const text = `${element.getAttribute("aria-label") || ""} ${visibleText(element)}`.trim();
      return rect.left < window.innerWidth * 0.18
        && rect.top > window.innerHeight * 0.18
        && rect.top < window.innerHeight * 0.65
        && /hình ảnh|image|xem hình ảnh/i.test(text);
    })
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
  if (imageTab) {
    flowTrace(jobId, "Returning to Flow image library before matching the uploaded keyframe.", 0.39);
    simulateClick(imageTab);
    await humanPause(650, 1100);
  }
  await waitForStableFlowTiles(2500);
  await revealReadyImageTileLabels(visibleReadyImageTiles().slice(0, 20));
}

async function closeTransientFlowOverlays(jobId: string): Promise<void> {
  const overlays = visibleTransientOverlays();
  if (overlays.length) flowTrace(jobId, `Closing ${overlays.length} transient Flow overlay(s) before continuing.`, 0.65);
  for (const overlay of overlays) await closeOverlay(overlay);
  const floatingCloseButtons = findFloatingFlowCloseButtons();
  if (!overlays.length && !floatingCloseButtons.length) return;
  if (!overlays.length && floatingCloseButtons.length) {
    flowTrace(jobId, `Closing ${floatingCloseButtons.length} floating Flow overlay control(s) before continuing.`, 0.65);
  }
  for (const button of floatingCloseButtons) {
    simulateClick(button);
    await humanPause(250, 450);
  }
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await humanPause(450, 800);
}

async function checkVisibleFlowAccountGate(jobId: string): Promise<boolean> {
  await closeTransientFlowOverlays(jobId);
  const existingGate = isManualGate();
  if (existingGate) {
    reportResult(jobId, "waiting_manual_action", undefined, existingGate);
    return true;
  }

  const accountTarget = findFlowAccountTarget();
  if (!accountTarget) return false;
  simulateClick(accountTarget as HTMLElement);
  await sleep(900);
  const openedGate = isManualGate();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(250);
  await closeTransientFlowOverlays(jobId);

  if (!openedGate) return false;
  reportResult(jobId, "waiting_manual_action", undefined, openedGate || undefined);
  return true;
}

async function ensureFlowWorkspace(jobId: string): Promise<boolean> {
  if (!/\/fx\/(?:[^/]+\/)?tools\/flow\/project\/[^/]+|^\/project\/[^/]+(?:\/edit\/[^/]+)?\/?$/i.test(location.pathname)) {
    reportResult(jobId, "waiting_manual_action", undefined, "Google Flow must be opened on a project URL like /fx/vi/tools/flow/project/... before video automation can run.");
    return false;
  }
  if (getComposerRoot() || activeFlowPromptEditor()) return true;
  // The short authenticated project route can paint the composer several
  // seconds after the initial shell. Give that route a bounded render window
  // before attempting any grid/root fallback.
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(500);
    if (getComposerRoot() || activeFlowPromptEditor()) return true;
    if (reportFlowPageError(jobId)) return false;
  }
  const gate = isManualGate();
  if (gate) {
    reportResult(jobId, "waiting_manual_action", undefined, gate);
    return false;
  }

  const hint = findElement(SELECTORS.workspaceHints);
  if (hint && getComposerRoot()) return true;
  if (/bắt đầu tạo hoặc thả nội dung nghe nhìn|start creating or drop media|cài đặt tác nhân|agent settings/i.test(document.body?.innerText || "")) {
    flowTrace(jobId, "Google Flow agent shell detected; continuing so media upload can prime the classic composer.", 0.08);
    return true;
  }
  if (await openFlowComposerFromProjectGrid(jobId)) return true;
  reportResult(jobId, "waiting_manual_action", undefined, `Google Flow project is open, but the video composer could not be opened from the project grid. ${flowDebugSnapshot()}`);
  return false;
}

async function openFlowComposerFromProjectGrid(jobId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const button = flowGridCreateButton();
    if (!button) break;
    flowTrace(jobId, `Opening Google Flow composer from project grid via ${compactText(visibleText(button), 80) || button.tagName}.`, 0.09, "opening_provider");
    simulateClick(button);
    const startedAt = Date.now();
    while (Date.now() - startedAt < 6000) {
      if (getComposerRoot() || activeFlowPromptEditor()) return true;
      if (reportFlowPageError(jobId)) return false;
      await sleep(300);
    }
    await humanPause(500, 900);
  }
  return openNewFlowProjectComposer(jobId);
}

async function openNewFlowProjectComposer(jobId: string): Promise<boolean> {
  // In this authenticated profile the Flow root redirects to /404. A valid
  // project route is safer than abandoning it; the bounded render wait in
  // ensureFlowWorkspace handles the real composer once the SPA settles.
  if (/^\/project\/[^/]+\/?$/i.test(location.pathname)) return false;
  const toolRoot = `${location.origin}/fx/vi/tools/flow`;
  if (!/^\/fx\/(?:[^/]+\/)?tools\/flow\/?$/i.test(location.pathname)) {
    flowTrace(jobId, "Flow project grid has no classic composer entrypoint; opening Flow root to create a fresh video project instead of clicking media-grid controls.", 0.09, "opening_provider");
    location.assign(toolRoot);
    await sleep(6500);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const newProjectButton = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
      .filter(isVisible)
      .find((button) => /dự án mới|new project|add_2/i.test(visibleText(button)));
    if (!newProjectButton) {
      await humanPause(500, 900);
      continue;
    }
    flowTrace(jobId, `Opening fresh Google Flow project via ${compactText(visibleText(newProjectButton), 80)}.`, 0.1, "opening_provider");
    // The Flow root renders this control as a React button; synthetic-only
    // dispatch can leave the page unchanged. Reuse the verified native click
    // path so route fallback has an observable navigation boundary.
    await clickElementNative(newProjectButton);
    const startedAt = Date.now();
    while (Date.now() - startedAt < 9000) {
      if (/\/fx\/(?:[^/]+\/)?tools\/flow\/project\/[^/]+/i.test(location.pathname) && getComposerRoot()) return true;
      if (reportFlowPageError(jobId)) return false;
      await sleep(300);
    }
  }
  return false;
}

type ClickResult = {
  ok: boolean;
  via?: string;
  text?: string;
};

async function clickVisibleText(patterns: RegExp[], scope: ParentNode = document): Promise<ClickResult> {
  const candidates = Array.from(scope.querySelectorAll("button, [role='button'], [role='tab'], [aria-haspopup], label"));
  const match = candidates.find((element) => {
    const rect = (element as HTMLElement).getBoundingClientRect();
    const text = visibleText(element);
    return rect.width > 0 && rect.height > 0 && patterns.some((pattern) => pattern.test(text));
  }) as HTMLElement | undefined;
  if (!match) return { ok: false };
  await clickElementNative(match);
  await humanPause();
  return { ok: true, via: "text", text: compactText(visibleText(match), 90) };
}

async function clickVisibleElement(element: Element): Promise<void> {
  await clickElementNative(element as HTMLElement);
  await humanPause();
}

async function acceptFlowUploadConsentIfPresent(jobId: string): Promise<boolean> {
  const scope = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [data-state="open"]'))
    .filter((element) => isVisible(element) && /thông báo|notice|rights|quyền|responsibly|trách nhiệm|tôi đồng ý|i agree/i.test(element.innerText || ""))
    .at(-1);
  if (!scope) return false;
  const accepted = await clickVisibleText([/^tôi đồng ý$/i, /^i agree$/i, /^agree$/i, /^accept$/i], scope);
  if (accepted.ok) {
    flowTrace(jobId, "Accepted Flow upload responsibility notice.", 0.39);
    await sleep(900);
    return true;
  }
  return false;
}

const flowNativeInput = createFlowNativeInput({
  SELECTORS, addTileDataToTransfer, compactText, composerHasReferenceSource, directFrameAttachmentCount,
  elementCenter, flowComposerDropTargets, flowDebugSnapshot, flowPageErrorText, flowStartOrEndFrameSlots,
  flowTrace, getComposerRoot, humanPause, isVisible, promptAttachmentCount, reportResult, simulateClick,
  simulatePointerDrag, sleep, tileDragSource, visibleText, waitForComposerReference, waitForPromptAttachmentIncrease,
});
const {
  waitForFileInput, requestNativeMouseClick, requestTobyFlowTextInsert, requestTobyFlowSubmit, runFlowMainWorldAction, clickFlowFrameSlot,
  clickElementNative, clickElementCenterNative, clickElementStrictNative, dispatchReferenceDrop,
  dragTileToComposer,
} = flowNativeInput;

const flowComposerDom = createFlowComposerDom({
  SELECTORS, activeFlowPromptEditor, clickElementNative, clickVisibleElement, clickVisibleText, runFlowMainWorldAction,
  closeMediaPickerIfOpen, closeTransientFlowOverlays, compactText, flowDebugSnapshot, flowTrace, getComposerRoot,
  humanPause, isVisible, normalizedFlowControlText, openFlowComposerFromProjectGrid,
  // flow-composer-dom uses the semantic operation name for its route fallback;
  // keep the concrete implementation alias explicit so a missing dependency
  // cannot surface only after a provider warning during live recovery.
  openNewFlowProjectComposer: openFlowComposerFromProjectGrid, reportResult,
  resolveProviderVideoDuration, simulateClick, sleep, visibleText, withTimeout,
});
const {
  getActiveSettingsPanel, getComposerSettingsMenu, getComposerSettingsButton, composerSettingsText,
  composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, isFlowAgentShellVisible,
  ensureFlowProjectRoute, openComposerSettingsMenu, ensureFlowVideoComposerMode, closeFlowSettingsPanelIfOpen,
  ensureFlowAgentModeOff, clickByIdSuffix, clickInComposerSettings, clickInComposerSettingsBounded,
} = flowComposerDom;

const flowPromptEditor = createFlowPromptEditor({
  activeFlowPromptEditor,
  flowEditableText,
  promptCompareKey,
  compactText,
  simulateClick,
  elementCenter,
  humanPause,
  setNativeInputValue,
  dispatchFlowInput,
  runFlowMainWorldAction,
  runTobyFlowTextInsert: requestTobyFlowTextInsert,
  bridgeCall,
  sleep,
});
const {
  promptTextMatches,
  clearFlowPromptEditor,
  stagePromptTextViaDom,
  stagePromptTextViaNative,
  stagePromptText,
  refreshPromptEditorState,
  waitForFlowPromptEditor,
} = flowPromptEditor;

const { aspectRatioSuffix, flowVideoSourceMode, flowComposerLooksVideoReady, waitForFlowComposerVideoReady, selectFlowVideoSourceMode, focusFlowStartFrameSlot, applyFlowAspectRatio, applyFlowDuration, applyFlowSettingsForJob } = createFlowComposerSettings({ isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, activeFlowPromptEditor, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration });
type JobReference = NonNullable<JobPayload["references"]>[number];
type PreparedReference =
  | { attachedDirectly: true; reference?: JobReference; reused: boolean }
  | { attachedDirectly: false; tile: HTMLElement; reference?: JobReference; reused: boolean };
type ReferenceUploadContext = {
  files: File[];
  jobId: string;
  pickerConfirmedAbsent: boolean;
  preflightPicker: HTMLElement | null;
  reference: JobReference;
  requireDirectFrameAttachment: boolean;
  skipReuse: boolean;
};

async function waitForReferencePicker(jobId: string) {
  let picker = await openFlowMediaPicker(jobId);
  const startedAt = Date.now();
  while (!picker && Date.now() - startedAt < 30000) {
    picker = mediaPickerDialogs().at(-1) || null;
    if (!picker) await sleep(300);
  }
  return picker;
}

function findReferenceOption(reference: NonNullable<JobPayload["references"]>[number], picker: HTMLElement) {
  return exactReferenceOptionInOpenPicker(reference)
    || Array.from(new Set([...mediaPickerDialogs(), picker])).flatMap((root) => mediaPickerReferenceOptions(root)).find((candidate) => tileMatchesReference(reference, candidate))
    || null;
}

async function disambiguatePickerReference(reference: JobReference, options: HTMLElement[]): Promise<HTMLElement | null> {
  if (options.length <= 1) return options[0] || null;
  // Flow routinely virtualizes many uploads under the same filename. Compare
  // duplicate options in bounded parallel batches so the first matching label
  // cannot silently select the wrong media identity.
  for (let offset = 0; offset < Math.min(options.length, 32); offset += 8) {
    const batch = options.slice(offset, Math.min(offset + 8, 32));
    const matches = await Promise.all(batch.map(async (option) => ({ option, matched: await tileVisuallyMatchesReference(reference, option) })));
    const match = matches.find((entry) => entry.matched)?.option;
    if (match) return match;
  }
  return null;
}

async function waitForReferenceOption(reference: JobReference, picker: HTMLElement, timeoutMs = 12000): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const exactOption = findReferenceOption(reference, picker);
    if (exactOption) return exactOption;
    await sleep(250);
  }
  return null;
}

async function findVisibleReferenceReuse(context: ReferenceUploadContext): Promise<PreparedReference | null> {
  const { jobId, reference } = context;
  const tile = await findExistingUploadedReferenceTileByVisual(jobId, reference);
  if (!tile || !(await waitForTileReady(tile, 4000))) return null;
  flowTrace(jobId, `Flow main-grid inventory found the exact existing reference (${compactText(tileSearchText(tile), 90)}); skipping picker upload preflight.`, 0.326);
  rememberFlowTileForReference(reference, tile);
  return { attachedDirectly: false, tile, reference, reused: true };
}

async function findPickerReferenceReuse(context: ReferenceUploadContext, picker: HTMLElement, knownPresent: boolean): Promise<PreparedReference | null> {
  const { jobId, reference } = context;
  await ensureFlowPickerInventoryCategory(jobId, picker, reference);
  const exactOption = await waitForReferenceOption(reference, picker);
  const matchingOptions = Array.from(new Set([...mediaPickerDialogs(), picker]))
    .flatMap((root) => mediaPickerReferenceOptions(root))
    .filter((candidate) => tileMatchesReference(reference, candidate));
  // Flow marks the option selected when the composer already has this exact
  // media attached, but virtualized picker rows can fail our geometry/token
  // resolver while the selection itself is still authoritative. Accept one
  // uniquely selected row with the exact required filename; never guess among
  // multiple selected/duplicate rows.
  const requiredFilename = (reference.filename || "").trim().toLowerCase();
  const selectedFilenameMatches = requiredFilename
    ? Array.from(new Set([...mediaPickerDialogs(), picker]))
      .flatMap((root) => mediaPickerReferenceOptions(root))
      .filter((candidate) => candidate.getAttribute("aria-selected") === "true")
      .filter((candidate) => visibleText(candidate).trim().toLowerCase().includes(requiredFilename))
    : [];
  const rawSelectedFilenameMatches = requiredFilename
    ? Array.from(new Set([...mediaPickerDialogs(), picker]))
      .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('[role="option"]')))
      .filter((candidate) => candidate.getAttribute("aria-selected") === "true")
      .filter((candidate) => (candidate.innerText || candidate.textContent || "").trim().toLowerCase().includes(requiredFilename))
    : [];
  // A direct filename match is only safe when it is unique. Flow often
  // exposes several identical labels; never let the first DOM option bypass
  // the visual disambiguation pass.
  const selectedExactOption = [...new Set([...selectedFilenameMatches, ...rawSelectedFilenameMatches])];
  const lateExactOption = selectedExactOption.length === 1
    ? selectedExactOption[0]
    : matchingOptions.length > 1
    ? await disambiguatePickerReference(reference, matchingOptions)
    : matchingOptions[0] || (matchingOptions.length === 0 ? exactOption : null);
  if (lateExactOption) {
    flowTrace(jobId, `Flow picker preflight found the exact existing reference (${compactText(tileSearchText(lateExactOption), 90)}); skipping upload.`, 0.329);
    rememberFlowTileForReference(reference, lateExactOption);
    return { attachedDirectly: false, tile: lateExactOption, reference, reused: true };
  }
  if (knownPresent) flowTrace(jobId, `Flow picker no longer exposes ledgered reference ${referenceRequiredLabel(reference)}; treating the ledger entry as stale and allowing one verified upload.`, 0.329);
  return null;
}

async function preflightReferenceReuse(context: ReferenceUploadContext): Promise<PreparedReference | null> {
  const { files, jobId, reference, requireDirectFrameAttachment, skipReuse } = context;
  if (skipReuse || requireDirectFrameAttachment) return null;
  const visibleReuse = await findVisibleReferenceReuse(context);
  if (visibleReuse) return visibleReuse;
  if (/\/edit\//i.test(location.pathname)) throw new Error(`Flow left the project base route before component preflight. Refusing any media click. ${flowDebugSnapshot()}`);
  flowTrace(jobId, "Opening the Flow component picker for exact filename preflight before any upload.", 0.327);
  const picker = await waitForReferencePicker(jobId);
  const knownPresent = flowReferenceWasUploadedInCurrentProject(reference);
  if (!picker) {
    // Some Flow composer revisions expose the image file input directly while
    // omitting the picker dialog entirely. Only use that narrow fallback when
    // the project ledger does not already claim this reference; a known
    // reference still fails closed to avoid duplicate uploads.
    const directImageInput = document.querySelector('input[type="file"][accept*="image"], input[type="file"][accept="image/*"]');
    if (!knownPresent && directImageInput) {
      flowTrace(jobId, "Flow picker is absent but the composer exposes a direct image file input; using the bounded direct-upload fallback.", 0.328);
      return null;
    }
    throw new Error(`Flow component picker did not open during reference preflight. Refusing library upload because the existing exact reference cannot be ruled out${knownPresent ? " and the project ledger explicitly blocks a duplicate upload" : ""}. ${flowDebugSnapshot()}`);
  }
  context.preflightPicker = picker;
  const pickerReuse = await findPickerReferenceReuse(context, picker, knownPresent);
  if (pickerReuse) return pickerReuse;
  if (/\/edit\//i.test(location.pathname)) {
    location.assign(`${location.origin}${location.pathname.replace(/\/edit\/.*$/i, "")}`);
    throw new Error("Flow navigated to a media edit route while opening the component picker. The adapter restored the project base page and blocked further clicks.");
  }
  flowTrace(jobId, `Flow picker preflight confirmed ${files[0]?.name || "the exact reference"} is absent; continuing to the single-upload phase.`, 0.329);
  context.pickerConfirmedAbsent = true;
  return null;
}

async function findCachedReferenceTile(context: ReferenceUploadContext): Promise<HTMLElement | null> {
  const { reference, pickerConfirmedAbsent, requireDirectFrameAttachment, skipReuse } = context;
  if (skipReuse || pickerConfirmedAbsent || requireDirectFrameAttachment) return null;
  let tile = findExistingUploadedReferenceTile(reference);
  if (!tile) {
    await revealReadyImageTileLabels(visibleReadyImageTiles().slice(0, 16));
    tile = findExistingUploadedReferenceTile(reference);
  }
  return tile;
}

async function reuseCachedReference(context: ReferenceUploadContext): Promise<PreparedReference | null> {
  const { jobId, reference, requireDirectFrameAttachment, skipReuse } = context;
  if (!skipReuse && !requireDirectFrameAttachment) flowTrace(jobId, "Flow reference inventory phase: checking visible/cached keyframe before any upload.", 0.33);
  const existingTile = await findCachedReferenceTile(context);
  if (existingTile && !requireDirectFrameAttachment) {
    const readyTile = await waitForExactReferenceTileReady(reference, 8000);
    if (!readyTile) throw new Error(`Exact keyframe is already present in Flow but is not ready after waiting. Refusing to upload a duplicate copy. ${flowDebugSnapshot()}`);
    rememberFlowTileForReference(reference, readyTile);
    return { attachedDirectly: false, tile: readyTile, reference, reused: true };
  }
  if (!skipReuse && !requireDirectFrameAttachment) flowTrace(jobId, "No exact Flow library match found; visual-only reuse is disabled before upload to prevent wrong-reference videos.", 0.34);
  return null;
}

async function openReferenceUploadTarget(context: ReferenceUploadContext): Promise<HTMLElement | Document | PreparedReference> {
  const { files, jobId, preflightPicker, reference, requireDirectFrameAttachment } = context;
  if (requireDirectFrameAttachment) {
    if (await withTimeout(dispatchReferenceDrop(jobId, files), 12_000, false)) return { attachedDirectly: true, reference, reused: false };
    throw new Error(`Direct Flow start-frame drop did not attach within 12s. Refusing file-input fallback because it can leave Flow in the project grid or crash the app. ${flowDebugSnapshot()}`);
  }
  const picker = preflightPicker || await openFlowMediaPicker(jobId);
  if (picker) {
    const pickerTile = await exactPickerReference(reference, picker);
    if (pickerTile) {
      rememberFlowTileForReference(reference, pickerTile);
      return { attachedDirectly: false, tile: pickerTile, reference, reused: true };
    }
    if (!preflightPicker) { await closeMediaPickerIfOpen(); await humanPause(350, 650); }
  }
  const uploadMenu = await openReferenceUploadMenu(jobId, preflightPicker);
  if (uploadMenu) return uploadMenu;
  const directImageInput = await waitForFileInput(jobId, 1_500, document);
  if (directImageInput) {
    flowTrace(jobId, "Flow upload menu is absent but the composer image file input is available; dispatching the single bounded upload.", 0.35);
    return document;
  }
  await revealFlowImageLibrary(jobId);
  const libraryTile = await readyLibraryReference(reference);
  if (libraryTile) {
    rememberFlowTileForReference(reference, libraryTile);
    return { attachedDirectly: false, tile: libraryTile, reference, reused: true };
  }
  throw new Error(`Flow library upload menu did not open, and no exact existing keyframe could be matched in the visible Flow library. ${flowDebugSnapshot()}`);
}

async function exactPickerReference(reference: JobReference, picker: HTMLElement) {
  const livePicker = (await waitForMediaPickerContent(picker, 6000)).picker;
  await revealReadyImageTileLabels(mediaPickerReferenceOptions(livePicker).slice(0, 20));
  const matchingOptions = mediaPickerReferenceOptions(livePicker).filter((candidate) => tileMatchesReference(reference, candidate));
  if (matchingOptions.length > 1) return disambiguatePickerReference(reference, matchingOptions);
  return matchingOptions[0] || exactReferenceOptionInOpenPicker(reference) || null;
}

async function openReferenceUploadMenu(jobId: string, preflightPicker: HTMLElement | null | undefined) {
  if (preflightPicker && mediaPickerDialogs().includes(preflightPicker)) {
    const control = Array.from(preflightPicker.querySelectorAll<HTMLElement>("button, [role='button'], [role='menuitem'], div"))
      .filter(isVisible).find((element) => /tải nội dung nghe nhìn lên|upload media|upload/i.test(visibleText(element))) || null;
    if (control) {
      await clickElementNative(control);
      await humanPause(500, 900);
      return mediaPickerDialogs().at(-1) || preflightPicker;
    }
    // The preflight picker can remain mounted after its exact-reference scan
    // completes, while the project composer is already ready underneath it.
    // Leaving that stale dialog open hides the composer add-media control and
    // makes the bounded library-upload fallback report a misleading
    // "add button was not visible" failure. Close this transient picker
    // before probing the normal upload menu.
    await closeMediaPickerIfOpen();
    await humanPause(350, 650);
  }
  return openFlowLibraryUploadMenu(jobId);
}

async function readyLibraryReference(reference: JobReference) {
  const tile = findExistingUploadedReferenceTile(reference);
  return tile && await waitForTileReady(tile, 5000) ? tile : null;
}

async function dispatchReferenceFile(context: ReferenceUploadContext, uploadRoot: HTMLElement | Document) {
  const { files, jobId, reference } = context;
  const input = await waitForFileInput(jobId, 8000, uploadRoot);
  if (!input) throw new Error(`Cannot find Google Flow upload input. ${flowDebugSnapshot()}`);
  const localFilePath = referenceLocalFilePath(reference);
  const nativeUpload = localFilePath
    ? await chrome.runtime.sendMessage({ source: "google-flow-adapter", type: "NATIVE_SET_FILE_INPUT", filePaths: [localFilePath] }).catch(() => ({ ok: false }))
    : { ok: false };
  if (!nativeUpload?.ok) {
    const transfer = new DataTransfer();
    for (const file of files.slice(0, 1)) transfer.items.add(file);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files")?.set;
    if (setter) setter.call(input, transfer.files); else input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  markFlowReferencePresent(reference, "upload-dispatched");
  await acceptFlowUploadConsentIfPresent(jobId);
}

function referenceAttachedSince(promptCount: number, frameCount: number) {
  return promptAttachmentCount() > promptCount || directFrameAttachmentCount() > frameCount || composerHasReferenceSource();
}

async function resolveDispatchedReference(context: ReferenceUploadContext, baseline: FlowTileBaseline, promptCount: number, frameCount: number): Promise<PreparedReference> {
  const { jobId, preflightPicker, reference, requireDirectFrameAttachment } = context;
  const firstWait = Date.now();
  while (Date.now() - firstWait < 6000) {
    if (referenceAttachedSince(promptCount, frameCount)) return { attachedDirectly: true, reference, reused: false };
    await sleep(250);
  }
  if (!requireDirectFrameAttachment) {
    const livePicker = mediaPickerDialogs().at(-1) || preflightPicker;
    const stable = livePicker ? await waitForExactReferenceOptionInPicker(reference, livePicker, 120000, 8) : null;
    if (stable) {
      rememberFlowTileForReference(reference, stable.option);
      return { attachedDirectly: false, tile: stable.option, reference, reused: false };
    }
  }
  const secondWait = Date.now();
  while (Date.now() - secondWait < 12000) {
    if (reportFlowPageError(jobId)) throw new Error(`Google Flow crashed while receiving the keyframe file. ${flowDebugSnapshot()}`);
    if (referenceAttachedSince(promptCount, frameCount)) return { attachedDirectly: true, reference, reused: false };
    await sleep(300);
  }
  if (requireDirectFrameAttachment) throw new Error(`Flow accepted the file picker event, but the keyframe did not attach to the video start-frame slot. ${flowDebugSnapshot()}`);
  const exactTile = await waitForExactUploadedReferenceTile(jobId, reference, baseline, 30000);
  if (exactTile) {
    rememberFlowTileForReference(reference, exactTile);
    return { attachedDirectly: false, tile: exactTile, reference, reused: false };
  }
  return resolveNewReferenceTile(context, baseline);
}

async function resolveNewReferenceTile(context: ReferenceUploadContext, baseline: FlowTileBaseline): Promise<PreparedReference> {
  const { jobId, reference } = context;
  const newTiles = await waitForNewMediaTiles(jobId, baseline, 30000);
  if (!newTiles.length) {
    await revealFlowImageLibrary(jobId);
    const fallback = findExistingUploadedReferenceTile(reference);
    if (fallback && await waitForTileReady(fallback, 5000)) {
      rememberFlowTileForReference(reference, fallback);
      return { attachedDirectly: false, tile: fallback, reference, reused: true };
    }
    throw new Error(`Flow accepted the file picker event, but no new uploaded media tile appeared. ${flowDebugSnapshot()}`);
  }
  await revealReadyImageTileLabels(newTiles);
  let tile = newTiles.find((candidate) => tileMatchesReference(reference, candidate)) || null;
  for (const candidate of tile ? [] : newTiles) {
    if (await tileVisuallyMatchesReference(reference, candidate)) { tile = candidate; break; }
  }
  if (!tile) throw new Error(`Flow uploaded ${newTiles.length} media tile(s), but none matched ${referenceRequiredLabel(reference)}. Refusing to attach an ambiguous image. ${flowDebugSnapshot()}`);
  rememberFlowTileForReference(reference, tile);
  return { attachedDirectly: false, tile, reference, reused: false };
}

async function getOrUploadReferenceTile(jobId: string, references: NonNullable<JobPayload["references"]>, requireDirectFrameAttachment = false, skipReuse = false): Promise<PreparedReference> {
  const usableReferences = references.filter(hasUsableReference);
  const files = usableReferences.map(dataUrlToFile).filter((file): file is File => Boolean(file));
  if (!files.length) throw new Error("No usable keyframe file data was available for Google Flow.");
  const context: ReferenceUploadContext = { files, jobId, pickerConfirmedAbsent: false, preflightPicker: null, reference: usableReferences[0], requireDirectFrameAttachment, skipReuse };
  if (flowReferenceWasUploadedInCurrentProject(context.reference)) flowTrace(jobId, `Reference ledger confirms ${referenceRequiredLabel(context.reference)} already exists in this Flow project; duplicate upload is locked out.`, 0.326);
  const preflight = await preflightReferenceReuse(context);
  if (preflight) return preflight;
  const cached = await reuseCachedReference(context);
  if (cached) return cached;
  const baseline = currentTileBaseline();
  const promptCount = promptAttachmentCount();
  const frameCount = directFrameAttachmentCount();
  const target = await openReferenceUploadTarget(context);
  if ("attachedDirectly" in target) return target;
  await dispatchReferenceFile(context, target);
  return resolveDispatchedReference(context, baseline, promptCount, frameCount);
}

async function primeFlowSdkMedia(jobId: string, references: NonNullable<JobPayload["references"]>): Promise<{ assetId: string }[]> {
  flowSdkSelectionQueue.splice(0, flowSdkSelectionQueue.length);
  const primed: { assetId: string }[] = [];
  for (const reference of references.filter(hasUsableReference)) {
    const selection = { jobId, reference } satisfies FlowSdkSelection;
    flowSdkSelectionQueue.push(selection);
    primed.push({ assetId: reference.assetId });
  }
  return primed;
}

async function resolveFlowSdkReference(selection: FlowSdkSelection): Promise<PreparedReference> {
  // A Studio Shot Bridge runtime is an embedded tool, not the classic Flow
  // composer. The host page can still expose a verified upload input while
  // `getComposerRoot()` may accidentally match hidden shell controls. Prefer
  // the direct upload/library path on `/tool-version/` so we never search for
  // a toolbar Add button that does not exist in the runtime surface.
  const isStudioRuntimeTool = /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+(?:\/?$)/i.test(location.pathname);
  // The Studio Shot Bridge shell is not the classic Flow composer. When its
  // host document already exposes the upload input, dispatch there first so
  // the SDK request does not wait for a picker that cannot exist in srcdoc.
  if (selection.preferDirectUpload || isStudioRuntimeTool || !getComposerRoot()) {
    await revealFlowImageLibrary(selection.jobId).catch(() => undefined);
    // Flow may rename previously uploaded media (for example, to a generated
    // asset filename), so an exact label/cache lookup can miss the same image.
    // Use the strict visual fingerprint matcher before opening an upload path;
    // this preserves the no-ambiguous-reference rule while avoiding duplicate
    // uploads and picker timeouts for an already-present keyframe.
    const visualExisting = await findExistingUploadedReferenceTileByVisual(selection.jobId, selection.reference);
    if (visualExisting && await waitForTileReady(visualExisting, 5000)) {
      return { attachedDirectly: false, tile: visualExisting, reference: selection.reference, reused: true };
    }
    const existing = findExistingUploadedReferenceTile(selection.reference);
    if (existing && await waitForTileReady(existing, 5000)) {
      return { attachedDirectly: false, tile: existing, reference: selection.reference, reused: true };
    }
  }
  if ((selection.preferDirectUpload || isStudioRuntimeTool || !getComposerRoot()) && document.querySelector('input[type="file"]')) {
    const file = dataUrlToFile(selection.reference);
    if (file) {
      const baseline = currentTileBaseline();
      const context: ReferenceUploadContext = {
        files: [file], jobId: selection.jobId, pickerConfirmedAbsent: true,
        preflightPicker: null, reference: selection.reference,
        requireDirectFrameAttachment: false, skipReuse: true
      };
      try {
        await dispatchReferenceFile(context, document);
        await revealFlowImageLibrary(selection.jobId);
        const tile = await waitForExactUploadedReferenceTile(selection.jobId, selection.reference, baseline, 30_000);
        if (tile) return { attachedDirectly: false, tile, reference: selection.reference, reused: false };
      } catch {}
    }
  }
  try {
    return await getOrUploadReferenceTile(selection.jobId, [selection.reference], false, false);
  } catch (error) {
    // Studio Shot Bridge has no classic composer picker. If that picker is
    // unavailable, the host page may still expose its verified upload input;
    // dispatch the exact file there and resolve the newly created tile.
    if (!/component picker did not open|library upload menu did not open/i.test(String(error))) throw error;
    const file = dataUrlToFile(selection.reference);
    if (!file) throw error;
    const baseline = currentTileBaseline();
    const context: ReferenceUploadContext = {
      files: [file], jobId: selection.jobId, pickerConfirmedAbsent: true,
      preflightPicker: null, reference: selection.reference,
      requireDirectFrameAttachment: false, skipReuse: true
    };
    await dispatchReferenceFile(context, document);
    const tile = await waitForExactUploadedReferenceTile(selection.jobId, selection.reference, baseline, 30_000);
    if (!tile) throw error;
    return { attachedDirectly: false, tile, reference: selection.reference, reused: false };
  }
}

async function attachComponentReferences(
  jobId: string,
  references: NonNullable<JobPayload["references"]>,
  preparedPrimary?: PreparedReference | null
): Promise<number> {
  const usableReferences = references.filter(hasUsableReference);
  if (usableReferences.length > 1) {
    throw new Error(`This Google Flow composer is stable with exactly 1 complete shot keyframe, but this job contains ${usableReferences.length} image components. Keep semantic character, location, and prop continuity in the complete keyframe and prompt.`);
  }
  let attached = 0;
  for (let index = 0; index < usableReferences.length; index++) {
    if (await attachOneComponent(jobId, usableReferences[index], index, usableReferences.length, index === 0 ? preparedPrimary : undefined)) attached += 1;
  }
  if (attached !== usableReferences.length) {
    throw new Error(`Flow attached ${attached}/${usableReferences.length} required components. Refusing partial video submission.`);
  }
  return attached;
}

async function attachOneComponent(jobId: string, reference: NonNullable<JobPayload["references"]>[number], index: number, total: number, preparedPrimary?: PreparedReference | null) {
  const prepared = index === 0 && preparedPrimary ? preparedPrimary : await getOrUploadReferenceTile(jobId, [reference], false, false);
  const label = reference.referenceLabel || referenceRequiredLabel(reference);
  if (prepared.attachedDirectly) {
    flowTrace(jobId, `Flow attached component ${index + 1}/${total} directly (${label}).`, 0.46);
    return true;
  }
  const beforeAttachmentCount = promptAttachmentCount();
  flowTrace(jobId, `Attaching component ${index + 1}/${total}: ${label}.`, 0.44);
  if (!(await addTileToPrompt(jobId, prepared.tile, beforeAttachmentCount, true, reference))) throw new Error(`Flow could not attach component ${index + 1}/${total} (${label}). Refusing to continue with an incomplete reference manifest. ${flowDebugSnapshot()}`);
  const expectedAttachmentCount = index + 1;
  if (!(await waitForComposerReference(jobId, 2500, "components")) || Math.max(promptAttachmentCount(), composerReferenceRemoveButtons().length) < expectedAttachmentCount) throw new Error(`Flow exact picker selection did not produce attachment ${expectedAttachmentCount}/${total} (${label}). ${flowDebugSnapshot()}`);
  rememberFlowTileForReference(reference, prepared.tile);
  return true;
}

async function attachExistingStartFrame(jobId: string, reference: JobReference) {
  if (await attachReferenceThroughVisibleStartPicker(jobId, reference)) {
    flowTrace(jobId, "Start frame attached through the visible Flow Bắt đầu picker.", 0.5);
    return 1;
  }
  flowTrace(jobId, `Visible start-frame picker did not expose/attach ${referenceRequiredLabel(reference)}; uploading the exact keyframe through that picker instead of using the media grid.`, 0.44);
  if (await uploadReferenceThroughStartFramePicker(jobId, reference)) {
    flowTrace(jobId, "Start frame attached after exact upload through the Flow Bắt đầu picker.", 0.5);
    return 1;
  }
  throw new Error(`Flow start-frame picker did not attach ${referenceRequiredLabel(reference)}. ${lastStartFramePickerDiagnostic ? `picker=${lastStartFramePickerDiagnostic}. ` : ""}Refusing media-grid fallback because it repeatedly creates duplicate or wrong-reference videos. ${lastNativeMouseClickDiagnostic ? `nativeClick=${lastNativeMouseClickDiagnostic}. ` : ""}${flowDebugSnapshot()}`);
}

async function attachPreparedStartFrame(jobId: string, prepared: Extract<PreparedReference, { attachedDirectly: false }>) {
  const beforeAttachmentCount = promptAttachmentCount();
  flowTrace(jobId, "Attaching the matched keyframe through Flow's start-frame picker.", 0.44);
  if (!(await addTileToPrompt(jobId, prepared.tile, beforeAttachmentCount, false, prepared.reference))) {
    throw new Error(`Matched keyframe tile appeared in Flow, but it could not be attached through the start-frame picker. Refusing upload/file-input fallback in frame mode. ${flowDebugSnapshot()}`);
  }
  rememberFlowTileForReference(prepared.reference, prepared.tile);
  return 1;
}

async function attachStartFrameReference(jobId: string, references: NonNullable<JobPayload["references"]>, preparedReferenceTile?: PreparedReference | null): Promise<number> {
  if ((promptAttachmentCount() > 0 || directFrameAttachmentCount() > 0 || composerReferenceRemoveButtons().length > 0) && !(await clearComposerReferences(jobId))) {
    throw new Error(`Flow composer already contains ${promptAttachmentCount()} prompt source attachment(s) and ${directFrameAttachmentCount()} frame attachment(s). Refusing to add a start frame on top of an existing reference. ${flowDebugSnapshot()}`);
  }
  const existingReference = references.find(hasUsableReference);
  if (flowStartFrameSlots().length === 0) {
    throw new Error(`Flow frame-mode composer is not open: no visible Bắt đầu/start-frame slot was found. Refusing to upload the keyframe into the media grid because that creates duplicate library images without a video submit path. ${flowDebugSnapshot()}`);
  }
  if (existingReference) return attachExistingStartFrame(jobId, existingReference);
  if (preparedReferenceTile?.attachedDirectly) {
    flowTrace(jobId, "Start frame is already attached directly in Flow.", 0.5);
    return 1;
  }
  if (preparedReferenceTile && !preparedReferenceTile.attachedDirectly) return attachPreparedStartFrame(jobId, preparedReferenceTile);
  throw new Error(`Flow start-frame picker did not receive a usable keyframe reference. Refusing media-grid upload fallback because it creates duplicate images without a verified video submit path. ${flowDebugSnapshot()}`);
}

const normalizedToken = normalizedReferenceToken;
const referenceSearchTokens = getReferenceSearchTokens;
const referenceRequiredLabel = getReferenceRequiredLabel;
const flowResultTiles = createFlowResultTileInspector({ flowImageTileRoot, tileCandidateScore, tileMediaUrls, imageLooksLikeFlowMedia, isVisible, visibleText });
const { tileLooksBusy, tileHasReadyMedia, isVisibleReadyImageTile, visibleReadyImageTiles, findVisibleReadyImageTile } = flowResultTiles;

const { expectedComposerMediaUrlsByReference, referenceFingerprint, markFlowReferencePresent, flowReferenceWasUploadedInCurrentProject, flowReferenceUploadEntry, rememberFlowTileForReference, readFlowReferenceCache } = createFlowReferenceLedger({ referenceDataUrl, normalizedToken, tileMediaUrls });

let flowReferenceSearch: any;
flowReferenceSearch = createFlowReferenceSearch({
  createFlowReferenceLedger,
  flowImageTileRoot,
  visibleReadyImageTiles,
  revealReadyImageTileLabels: (...args: any[]) => flowReferenceSearch?.revealReadyImageTileLabels(...args),
  compareImageFingerprints,
  flowTrace,
  mediaPickerDialogs,
  mediaPickerReferenceOptions,
  normalizedToken,
  readFlowReferenceCache,
  referenceDataUrl,
  referenceFingerprint,
  referenceGeometryIsScoped,
  referenceRequiredLabel,
  referenceSearchTokens,
  rememberFlowTileForReference,
  sleep,
  tileMediaUrls,
  visibleText,
  isVisible,
});
const {
  referenceTileGeometryLooksScoped, containsReferenceToken, referenceMediaTileCandidates,
  referenceMediaElements, isReferenceMediaCandidate, smallestReferenceCandidates,
  compareReferenceCandidates, tileMatchesReference, exactReferenceOptionInOpenPicker,
  loadComparableImage, imageFingerprint, tileVisuallyMatchesReference, tileSearchText,
  findExistingUploadedReferenceTile, findExistingUploadedReferenceTileByVisual,
  revealReadyImageTileLabels: runtimeRevealReadyImageTileLabels,
} = flowReferenceSearch;
const revealReadyImageTileLabels = runtimeRevealReadyImageTileLabels;

function currentTileBaseline(): FlowTileBaseline {
  const beforeTileTextById: Record<string, string> = {};
  const beforeTileMediaById: Record<string, string[]> = {};
  const beforeEditIds = new Set<string>();
  const beforeMediaUrls = new Set<string>();
  const beforeTileIds = Array.from(currentTileIds());
  for (const tile of getFlowResultTiles()) {
    const mediaUrls = tileMediaUrls(tile);
    const tileId = flowResultTileId(tile, mediaUrls);
    if (!tileId) continue;
    beforeTileTextById[tileId] = tileStableText(tile);
    beforeTileMediaById[tileId] = mediaUrls;
    mediaUrls.forEach((url) => beforeMediaUrls.add(url));
    const editId = flowTileEditId(tile);
    if (editId) beforeEditIds.add(editId);
  }
  return {
    beforeTileIds,
    beforeTileTextById,
    beforeTileMediaById,
    beforeEditIds: Array.from(beforeEditIds),
    beforeMediaUrls: Array.from(beforeMediaUrls),
    submittedAt: Date.now()
  };
}

async function waitForStableFlowTiles(timeoutMs = 2500): Promise<void> {
  const startedAt = Date.now();
  let previous = "";
  let stableCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const signature = getFlowResultTiles()
      .filter(isVisible)
      .map((tile) => [
        flowResultTileId(tile, tileMediaUrls(tile)),
        flowTileEditId(tile),
        tileMediaUrls(tile).join("|")
      ].join(":"))
      .sort()
      .join("\n");
    if (signature && signature === previous) {
      stableCount++;
      if (stableCount >= 2) return;
    } else {
      stableCount = 0;
      previous = signature;
    }
    await sleep(350);
  }
}

function pickerHasReadySelectedPreview(picker: HTMLElement): boolean {
  const hasAddAction = Array.from(picker.querySelectorAll<HTMLElement>("button, [role='button'], [role='option']"))
    .filter(isVisible)
    .some((element) => /^(?:thêm vào câu lệnh|add to prompt|use in prompt)$/i.test(visibleText(element)));
  if (!hasAddAction) return false;
  return Array.from(picker.querySelectorAll<HTMLElement>("img, video, canvas, [style*='background-image']"))
    .filter(isVisible)
    .some((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 160 || rect.height < 90) return false;
      if (element instanceof HTMLImageElement) {
        return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
      }
      if (element instanceof HTMLVideoElement) return element.readyState >= 1;
      return element instanceof HTMLCanvasElement
        || Boolean(element.style.backgroundImage)
        || tileHasReadyMedia(element);
    });
}

async function waitForTileReady(tile: HTMLElement, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  let stableReadyCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    if (document.contains(tile) && isVisible(tile) && !tileLooksBusy(tile) && tileHasReadyMedia(tile)) {
      stableReadyCount++;
      if (stableReadyCount >= 2) return true;
    } else {
      stableReadyCount = 0;
    }
    await sleep(350);
  }
  return false;
}

async function waitForExactReferenceTileReady(reference: JobReference, timeoutMs: number): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const freshTile = findExistingUploadedReferenceTile(reference);
    if (freshTile && isVisible(freshTile) && !tileLooksBusy(freshTile) && tileHasReadyMedia(freshTile)) return freshTile;
    await sleep(350);
  }
  return null;
}

async function waitForNewMediaTiles(jobId: string, beforeTileBaseline: FlowTileBaseline, timeoutMs: number): Promise<HTMLElement[]> {
  const startedAt = Date.now();
  const readyTiles: HTMLElement[] = [];
  let lastCandidateCount = 0;
  const beforeTileIds = new Set(beforeTileBaseline.beforeTileIds);
  const beforeMediaUrls = new Set(beforeTileBaseline.beforeMediaUrls);
  const beforeEditIds = new Set(beforeTileBaseline.beforeEditIds);
  while (Date.now() - startedAt < timeoutMs) {
    const tiles = visibleReadyImageTiles().filter((tile) => isNewMediaTile(tile, beforeTileIds, beforeMediaUrls, beforeEditIds));
    if (tiles.length > 0) {
      if (tiles.length !== lastCandidateCount) {
        flowTrace(jobId, `Flow media tile appeared; waiting until upload finishes (${tiles.length} candidate).`, 0.4);
        lastCandidateCount = tiles.length;
      }
      for (const tile of tiles) {
        if (readyTiles.includes(tile)) continue;
        if (await waitForTileReady(tile, 900)) readyTiles.push(tile);
      }
      if (readyTiles.length > 0) break;
    }
    await sleep(500);
  }
  return readyTiles;
}

function isNewMediaTile(tile: HTMLElement, beforeTileIds: Set<string>, beforeMediaUrls: Set<string>, beforeEditIds: Set<string>) {
  const tileId = tile.dataset.tileId || "";
  const editId = flowTileEditId(tile);
  const mediaUrls = tileMediaUrls(tile);
  if (tileId && beforeTileIds.has(tileId)) return false;
  if (editId && beforeEditIds.has(editId)) return false;
  if (mediaUrls.length && mediaUrls.every((url) => beforeMediaUrls.has(url))) return false;
  return Boolean(tileSearchText(tile) || mediaUrls.join("|")) && isVisible(tile);
}

async function waitForExactUploadedReferenceTile(
  jobId: string,
  reference: JobReference,
  beforeTileBaseline: FlowTileBaseline,
  timeoutMs: number
): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  const beforeTileIds = new Set(beforeTileBaseline.beforeTileIds);
  const beforeMediaUrls = new Set(beforeTileBaseline.beforeMediaUrls);
  const beforeEditIds = new Set(beforeTileBaseline.beforeEditIds);
  while (Date.now() - startedAt < timeoutMs) {
    const freshTiles = visibleReadyImageTiles().filter((tile) => isFreshUploadedTile(tile, beforeTileIds, beforeMediaUrls, beforeEditIds));
    const textMatch = freshTiles.find((tile) => tileMatchesReference(reference, tile));
    if (textMatch && await waitForTileReady(textMatch, 1200)) {
      flowTrace(jobId, `Matched freshly uploaded Flow tile by exact reference label (${referenceRequiredLabel(reference)}).`, 0.42);
      return textMatch;
    }
    for (const tile of freshTiles.slice(0, 12)) {
      if (await tileVisuallyMatchesReference(reference, tile) && await waitForTileReady(tile, 1200)) {
        flowTrace(jobId, `Matched freshly uploaded Flow tile by exact image fingerprint (${referenceRequiredLabel(reference)}).`, 0.42);
        return tile;
      }
    }
    await sleep(500);
  }
  return null;
}

function isFreshUploadedTile(tile: HTMLElement, beforeTileIds: Set<string>, beforeMediaUrls: Set<string>, beforeEditIds: Set<string>) {
  const tileId = tile.dataset.tileId || "";
  const editId = flowTileEditId(tile);
  const mediaUrls = tileMediaUrls(tile);
  return !(tileId && beforeTileIds.has(tileId))
    && !(editId && beforeEditIds.has(editId))
    && !(mediaUrls.length && mediaUrls.every((url) => beforeMediaUrls.has(url)));
}

configureFlowComposerReferenceHelpers({
  promptAttachmentElements, tileMediaUrls, referenceFingerprint, expectedComposerMediaUrlsByReference, composerPanelRoot, findExistingUploadedReferenceTile, revealReadyImageTileLabels, tileMatchesReference, tileVisuallyMatchesReference, promptAttachmentCount, sleep, directFrameAttachmentCount, flowTrace, isVisible, visibleText, getComposerRoot, flowStartFrameAttachmentRemoveButtons, clickElementStrictNative, humanPause, activeFlowPromptEditor, clearFlowPromptEditor, closeMediaPickerIfOpen, openFlowComposerFromProjectGrid
});

configureFlowPickerHelpers({
  acceptFlowUploadConsentIfPresent: acceptFlowUploadConsentIfPresent, clickElementCenterNative: clickElementCenterNative, clickElementNative: clickElementNative, clickElementStrictNative: clickElementStrictNative, clickFlowFrameSlot: clickFlowFrameSlot, closeMediaPickerIfOpen: closeMediaPickerIfOpen, compactText: compactText, compareStartFrameOptions: compareStartFrameOptions, composerPanelRoot: composerPanelRoot, dataUrlToFile: dataUrlToFile, directFrameAttachmentCount: directFrameAttachmentCount, dragTileToComposer: dragTileToComposer, exactReferenceOptionInOpenPicker: exactReferenceOptionInOpenPicker, flowDebugSnapshot: flowDebugSnapshot, flowStartFrameSlotLooksAttached: flowStartFrameSlotLooksAttached, flowStartFrameSlots: flowStartFrameSlots, flowStartFrameAttachmentRemoveButtons: flowStartFrameAttachmentRemoveButtons, flowStartOrEndFrameSlots: flowStartOrEndFrameSlots, flowTrace: flowTrace, humanPause: humanPause, isVisible: isVisible, lastNativeMouseClickDiagnostic: lastNativeMouseClickDiagnostic, lastStartFramePickerDiagnostic: lastStartFramePickerDiagnostic, mediaPickerDialogs: mediaPickerDialogs, mediaPickerReferenceOptions: mediaPickerReferenceOptions, mediaUploadMenus: mediaUploadMenus, normalizedToken: normalizedToken, pickerHasReadySelectedPreview: pickerHasReadySelectedPreview, promptAttachmentCount: promptAttachmentCount, referenceLocalFilePath: referenceLocalFilePath, referenceRequiredLabel: referenceRequiredLabel, referenceSearchTokens: referenceSearchTokens, rememberFlowTileForReference: rememberFlowTileForReference, reportFlowPageError: reportFlowPageError, revealReadyImageTileLabels: revealReadyImageTileLabels, runFlowMainWorldAction: runFlowMainWorldAction, simulateClick: simulateClick, sleep: sleep, tileHasReadyMedia: tileHasReadyMedia, tileLooksBusy: tileLooksBusy, tileMatchesReference: tileMatchesReference, tileSearchText: tileSearchText, tileVisuallyMatchesReference: tileVisuallyMatchesReference, visibleText: visibleText, waitForComposerReference: waitForComposerReference, waitForFileInput: waitForFileInput, waitForPromptAttachmentIncrease: waitForPromptAttachmentIncrease, waitForTileReady: waitForTileReady
});

function findFlowSubmitButton(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    .filter((button) => {
      if (!isVisible(button)) return false;
      const rect = button.getBoundingClientRect();
      const text = visibleText(button);
      const disabled = (button instanceof HTMLButtonElement && button.disabled) || button.getAttribute("aria-disabled") === "true";
      return !disabled
        && rect.top > window.innerHeight * 0.55
        && rect.left > window.innerWidth * 0.45
        && rect.width >= 28
        && rect.height >= 28
        && /arrow_forward|tạo|generate|create|send|gửi/i.test(text);
    })
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectB.top - rectA.top || rectB.left - rectA.left;
    })[0] || null;
}

function findDisabledFlowSubmitButton(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    .filter((button) => {
      if (!isVisible(button)) return false;
      const rect = button.getBoundingClientRect();
      const text = visibleText(button);
      const disabled = (button instanceof HTMLButtonElement && button.disabled) || button.getAttribute("aria-disabled") === "true";
      return disabled
        && rect.top > window.innerHeight * 0.55
        && rect.left > window.innerWidth * 0.45
        && rect.width >= 28
        && rect.height >= 28
        && /arrow_forward|tạo|generate|create|send|gửi/i.test(text);
    })
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectB.top - rectA.top || rectB.left - rectA.left;
    })[0] || null;
}

type FlowSubmitAttempt = {
  attempted: boolean;
  ok: boolean;
  method?: string;
  error?: string;
  target?: { text: string; disabled: boolean; ariaDisabled: string | null };
  slateTextLength: number;
  startFrameCount: number;
};

function flowSubmitState(button?: HTMLElement | null) {
  const editor = activeFlowPromptEditor();
  return {
    target: button ? {
      text: compactText(visibleText(button), 80),
      disabled: button instanceof HTMLButtonElement ? button.disabled : false,
      ariaDisabled: button.getAttribute("aria-disabled")
    } : undefined,
    slateTextLength: editor ? flowEditableText(editor).trim().length : 0,
    startFrameCount: directFrameAttachmentCount()
  };
}

async function clickFlowSubmitButton(jobId: string, timeoutMs = 8000): Promise<FlowSubmitAttempt> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (reportFlowPageError(jobId)) return { attempted: false, ok: false, error: "Flow page error", ...flowSubmitState() };
    const button = findFlowSubmitButton();
    if (button) {
      flowTrace(jobId, `Submitting Google Flow via visible composer button (${compactText(visibleText(button), 80)}).`, 0.7);
      const center = elementCenter(button);
      // Flow V2 uses ProseMirror, while TobyFlow's bridge only understands
      // the legacy Slate editor. Do not spend its timeout window on a bridge
      // that is guaranteed to return `Slate editor not found via fiber`.
      if (!document.querySelector(".ProseMirror") && await requestTobyFlowSubmit()) {
        await humanPause(900, 1500);
        return { attempted: true, ok: true, method: "tobyFlowSubmitBridge", ...flowSubmitState(button) };
      }
      // The verified manual Flow path uses a trusted browser click. The
      // main-world React bridge can report a successful handler invocation
      // while Flow ignores it (no provider POST/tile), so native UI input is
      // the only submit path here. Never issue a second synthetic/React click
      // for a single job because that can create duplicate generations or a
      // false provider acceptance.
      if (await requestNativeMouseClick(center.clientX, center.clientY, visibleText(button))) {
        await humanPause(900, 1500);
        return { attempted: true, ok: true, method: "nativeCoordinateClick", ...flowSubmitState(button) };
      }
      // A short-lived Toby/Flow debugger owner can make the first native
      // request fail even though the target remains healthy. Retry the same
      // validated coordinates once before using any page-world fallback.
      await sleep(500);
      if (await requestNativeMouseClick(center.clientX, center.clientY, "")) {
        await humanPause(900, 1500);
        return { attempted: true, ok: true, method: "nativeCoordinateClickRetry", ...flowSubmitState(button) };
      }
      flowTrace(jobId, `Trusted native submit click failed twice; falling back once (${lastNativeMouseClickDiagnostic || "no diagnostic"}).`, 0.7);
      // Flow's Angular submit surface can reject the debugger click while
      // still accepting the same exact button through its page-world event
      // handler. Allow one bounded fallback, then rely exclusively on the
      // new current-job generation tile as the acceptance proof.
      if (await runFlowMainWorldAction("submit")) {
        await humanPause(900, 1500);
        return { attempted: true, ok: true, method: "mainWorldSingleFallback", ...flowSubmitState(button) };
      }
      return {
        attempted: false,
        ok: false,
        method: "nativeCoordinateClick",
        error: `Trusted Flow submit click failed: ${lastNativeMouseClickDiagnostic || "no native diagnostic"}`,
        ...flowSubmitState(button)
      };
    }
    await sleep(300);
  }
  return { attempted: false, ok: false, error: "No enabled Flow submit button", ...flowSubmitState() };
}

// Remove existing ref images from prompt area before each job (port from TobyFlow)
async function verifyPromptReady(jobId: string, timeoutMs = 3000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const promptEditor = activeFlowPromptEditor();
    if (promptEditor) {
      const hasPlaceholder = !!promptEditor.querySelector('[data-slate-placeholder]');
      const domText = flowEditableText(promptEditor).trim();
      if (!hasPlaceholder && domText.length > 0) {
        flowTrace(jobId, `Prompt verified: ${domText.length} chars, placeholder gone.`, 0.66);
        return true;
      }
    }
    await sleep(200);
  }
  console.warn(`[Studio][Flow][${jobId}] Prompt verification timed out after ${timeoutMs}ms`);
  return false;
}

async function ensurePromptMatchesJob(jobId: string, prompt: string): Promise<boolean> {
  const promptEditor = activeFlowPromptEditor();
  if (!promptEditor) return false;
  const domText = flowEditableText(promptEditor).replace(/\s+/g, " ").trim();
  const expected = prompt.replace(/\s+/g, " ").trim();
  const domKey = promptCompareKey(domText);
  const expectedKey = promptCompareKey(expected);
  if (!domText || !expected) return false;
  if (domText === expected || domKey === expectedKey) return true;
  const sample = compactText(expected, 90);
  const sampleKey = promptCompareKey(sample);
  const repeated = sampleKey.length > 0 ? domKey.split(sampleKey).length - 1 : 0;
  if (repeated > 1 || domKey.length > expectedKey.length + 80) {
    flowTrace(jobId, `Flow prompt contains stale or repeated text (${domText.length} chars vs ${expected.length}); clearing and restaging once.`, 0.69);
    const restaged = await stagePromptText(prompt, { clearFirst: true });
    if (!restaged.ok) return false;
    await sleep(500);
    const nextEditor = activeFlowPromptEditor();
    if (!nextEditor) return false;
    const nextText = flowEditableText(nextEditor).replace(/\s+/g, " ").trim();
    const nextKey = promptCompareKey(nextText);
    return nextKey === expectedKey || (nextKey.includes(sampleKey) && nextKey.length <= expectedKey.length + 80);
  }
  return domKey.includes(sampleKey);
}

async function clearAcceptedFlowDraft(jobId: string): Promise<void> {
  flowTrace(jobId, "Flow accepted generation; clearing the composer draft so it cannot be submitted again.", 0.74, "generating");
  const editor = activeFlowPromptEditor();
  if (editor) await clearFlowPromptEditor(editor);
  await clearComposerReferences(jobId);
  await closeMediaPickerIfOpen();
}

async function reportDoneAndClearFlowDraft(jobId: string, assets: Array<Record<string, unknown>>): Promise<void> {
  await clearAcceptedFlowDraft(jobId);
  reportResult(jobId, "done", assets);
}

type FlowExecutionContext = {
  jobId: string;
  payload: JobPayload;
  preparedReference: PreparedReference | null;
  primaryReference: NonNullable<JobPayload["references"]>[number] | undefined;
  prompt: string;
  referenceCount: number;
  runToken: number;
  sourceLabel: string;
  videoSourceMode: "frames" | "components";
};

async function validateFlowExecutionInputs(jobId: string, payload: JobPayload, videoSourceMode: "frames" | "components", referenceCount: number): Promise<boolean> {
  if (isVideoJob(payload) && videoSourceMode === "frames" && !getComposerRoot() && !(await openFlowComposerFromProjectGrid(jobId))) {
    reportResult(jobId, "failed_retryable", undefined, `Google Flow frame mode needs the classic video composer, but the project grid/agent shell did not open it. Reload the Flow project tab or click Tạo once, then retry. ${flowDebugSnapshot()}`);
    return false;
  }
  if (isVideoJob(payload) && referenceCount === 0) {
    const message = payload.references?.length
      ? "Flow video job received reference metadata, but no usable scene keyframe image data URL/base64 was found."
      : "Flow video jobs need a scene keyframe image. Generate/select the scene keyframe before queueing video.";
    reportResult(jobId, "failed_retryable", undefined, message);
    return false;
  }
  return true;
}

async function prepareFlowExecution(payload: JobPayload, runToken: number): Promise<FlowExecutionContext | null> {
  const { jobId, prompt } = payload;
  if (!(await prepareFlowWorkspace(payload))) return null;
  throwIfFlowJobRunStale(jobId, runToken);
  const referenceCount = payload.references?.filter(hasUsableReference).length || 0;
  const primaryReference = payload.references?.find((reference) => hasUsableReference(reference) && reference.referenceRole === "shot_keyframe")
    || payload.references?.find(hasUsableReference);
  const videoSourceMode = isVideoJob(payload) ? flowVideoSourceMode(payload) : "components";
  const sourceLabel = videoSourceMode === "frames" ? "start frame" : "visual reference";
  if (!(await validateFlowExecutionInputs(jobId, payload, videoSourceMode, referenceCount))) return null;
  return { jobId, payload, preparedReference: null, primaryReference, prompt, referenceCount, runToken, sourceLabel, videoSourceMode };
}

async function prepareFlowWorkspace(payload: JobPayload): Promise<boolean> {
  const { jobId } = payload;
  if (!verifyLockedFlowWorkspace(payload)) return false;
  if (!(await recoverFlowPageIfCrashed(payload))) return false;
  if (!(await ensureFlowProjectRoute(jobId))) return false;
  if (!(await ensureFlowWorkspace(jobId))) return false;
  await closeFlowToolBuilderDrawerIfOpen(jobId);
  if (isVideoJob(payload) && (await checkVisibleFlowAccountGate(jobId))) return false;
  return recoverFlowPageIfCrashed(payload);
}

async function closeFlowToolBuilderDrawerIfOpen(jobId: string): Promise<void> {
  const builderHeading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, [role='heading']"))
    .filter(isVisible)
    .find((element) => /^(?:trình tạo công cụ|tool builder)$/i.test(compactText(visibleText(element), 80)));
  if (!builderHeading) return;

  const closeButton = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    .filter(isVisible)
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.right > window.innerWidth * 0.9 && rect.top < 150;
    })
    .find((button) => /(?:^|\s)(?:close|đóng)(?:\s|$)/i.test(`${button.getAttribute("aria-label") || ""} ${visibleText(button)}`));
  if (!closeButton) {
    flowTrace(jobId, "Flow Tool Builder drawer is covering the project composer, but its close control was not found.", 0.075);
    return;
  }

  flowTrace(jobId, "Closing the Flow Tool Builder drawer before configuring the project video composer.", 0.075);
  await clickElementNative(closeButton);
  await humanPause(350, 650);
  if (builderHeading.isConnected && isVisible(builderHeading)) {
    closeButton.click();
    await humanPause(350, 650);
  }
}

async function clearFlowComposerForJob(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, runToken } = context;
  await ensureFlowAgentModeOff(jobId);
  throwIfFlowJobRunStale(jobId, runToken);
  await closeFlowSettingsPanelIfOpen(jobId);
  if (!(await clearComposerReferences(jobId))) {
    reportResult(jobId, "failed_retryable", undefined, `Flow composer still contains old source attachment(s). Clear the Flow composer or reload the project tab, then retry. ${flowDebugSnapshot()}`);
    return false;
  }
  await clearPersistedFlowPrompt(jobId);
  await sleep(200);
  throwIfFlowJobRunStale(jobId, runToken);
  return true;
}

async function clearPersistedFlowPrompt(jobId: string): Promise<void> {
  let editor = activeFlowPromptEditor();
  if (editor && flowEditableText(editor).trim()) {
    // Flow exposes a trusted "Clear prompt" control for hydrated template
    // text. Use it before native Slate insertion: selection/delete events can
    // be accepted visually while Flow restores the old recommendation from
    // its internal model on the next render.
    const discard = discardFlowPromptButton();
    if (discard && await clickElementStrictNative(discard)) {
      flowTrace(jobId, "Cleared the persisted Flow prompt with the composer discard control.", 0.245);
      await humanPause(450, 750);
      editor = activeFlowPromptEditor();
    }
    // Agent suggestions are Slate-controlled and can survive a DOM-level
    // clear when the shell switches back to the classic composer. Clear the
    // trusted Slate model before falling back to visible-editor handling.
    if (editor && flowEditableText(editor).trim()) {
      const bridged = await bridgeCall("clear", undefined, 4000).catch(() => ({ ok: false }));
      if (bridged?.ok) {
        flowTrace(jobId, "Cleared the Flow Slate prompt model through the main-world bridge.", 0.247);
        await humanPause(350, 650);
        editor = activeFlowPromptEditor();
      }
    }
    if (editor && flowEditableText(editor).trim()) await stagePromptTextViaDom("", true);
  }
}

async function primeFlowReference(context: FlowExecutionContext, reason: string): Promise<PreparedReference> {
  flowTrace(context.jobId, reason, 0.31);
  // A newly uploaded Flow image can take over a minute to hydrate in the
  // component picker even after its file input has accepted the file. Keep a
  // single bounded wait long enough for that provider-side transition; this
  // does not resubmit or upload a second copy.
  const prepared = await withTimeout(getOrUploadReferenceTile(context.jobId, context.payload.references || [], false, false), 150_000, null);
  if (!prepared) throw new Error(`Timed out preparing the Google Flow component keyframe source. Reload Flow, then retry this video job. ${flowDebugSnapshot()}`);
  throwIfFlowJobRunStale(context.jobId, context.runToken);
  // Opening the component picker can make Flow rehydrate its Agent shell and
  // restore a recommendation prompt. Re-establish the classic empty composer
  // before touching Video settings; never carry that provider sample into the
  // authored shot.
  await ensureFlowAgentModeOff(context.jobId);
  await clearPersistedFlowPrompt(context.jobId);
  throwIfFlowJobRunStale(context.jobId, context.runToken);
  await closeFlowSettingsPanelIfOpen(context.jobId);
  await humanPause(900, 1500);
  return prepared;
}

function normalizeMissingFlowSettings(payload: JobPayload, missing: string[]) {
  return missing.some((item) => /timed out/i.test(item)) && flowComposerLooksVideoReady(payload) ? [] : missing;
}

async function prepareInitialComponentReference(context: FlowExecutionContext) {
  const { jobId, payload, referenceCount, videoSourceMode } = context;
  const shouldPrime = [isVideoJob(payload), videoSourceMode === "components", referenceCount > 0, !findVisibleReadyImageTile(), !flowComposerLooksVideoReady(payload)].every(Boolean);
  if (!shouldPrime) return;
  context.preparedReference = await primeFlowReference(context, "Preparing Google Flow component source by uploading/reusing the keyframe before composer settings...");
}

async function retryAgentShellSettings(context: FlowExecutionContext, missing: string[]) {
  const { jobId, payload, referenceCount, runToken } = context;
  if (![isVideoJob(payload), missing.length, referenceCount > 0, isFlowAgentShellVisible()].every(Boolean)) return missing;
  reportStatus(jobId, "submitting", "Preparing Google Flow keyframe so the classic video controls become available...");
  context.preparedReference = await primeFlowReference(context, `Flow is in the agent shell; priming the classic composer before retrying settings (${missing.join(", ")}).`);
  const retried = await withTimeout(applyFlowSettingsForJob(jobId, payload), 12_000, ["Flow settings timed out after keyframe upload/reuse"]);
  throwIfFlowJobRunStale(jobId, runToken);
  return normalizeMissingFlowSettings(payload, retried);
}

async function applyInitialFlowSettings(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, payload, runToken } = context;
  await prepareInitialComponentReference(context);
  let missing = normalizeMissingFlowSettings(payload, await withTimeout(applyFlowSettingsForJob(jobId, payload), 12_000, ["Flow settings timed out"]));
  throwIfFlowJobRunStale(jobId, runToken);
  if (isVideoJob(payload) && missing.length && await waitForFlowComposerVideoReady(payload, 5000)) missing = [];
  missing = await retryAgentShellSettings(context, missing);
  if (isVideoJob(payload) && missing.length) {
    reportResult(jobId, "failed_retryable", undefined, `Google Flow video controls were not available (${missing.join(", ")}). Refusing to submit because Flow would create image tiles instead of a video. ${flowDebugSnapshot()}`);
    return false;
  }
  return true;
}

async function stageFlowJobPrompt(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, prompt, runToken } = context;
  await closeFlowSettingsPanelIfOpen(jobId);
  // Flow's Radix composer menu can remain open after the generic panel
  // cleanup during a route/mode transition. Ask the page main world to close
  // its trusted trigger once more immediately before editor focus.
  await runFlowMainWorldAction("close-settings-menu");
  await humanPause(250, 450);
  throwIfFlowJobRunStale(jobId, runToken);
  if (!(await waitForFlowPromptEditor(15000))) {
    reportResult(jobId, "waiting_manual_action", undefined, `Google Flow composer controls appeared, but the Slate prompt editor did not hydrate within 15s. Reload the Flow project and retry this shot. ${flowDebugSnapshot()}`);
    return false;
  }
  const staged = await stagePromptText(prompt, { clearFirst: true });
  throwIfFlowJobRunStale(jobId, runToken);
  if (!staged.ok) {
    reportResult(jobId, "waiting_manual_action", undefined, `Could not find or control the Google Flow prompt editor. ${staged.error || flowDebugSnapshot()}`);
    return false;
  }
  if (!(await verifyPromptReady(jobId, 3000))) {
    await bridgeCall("insert", { text: prompt }, 4000);
    await sleep(500);
    throwIfFlowJobRunStale(jobId, runToken);
    if (!(await verifyPromptReady(jobId, 2000))) {
      reportResult(jobId, "failed_retryable", undefined, `Prompt text was inserted but Slate editor did not update. ${flowDebugSnapshot()}`);
      return false;
    }
  }
  if (await ensurePromptMatchesJob(jobId, prompt)) return true;
  reportResult(jobId, "failed_retryable", undefined, `Flow prompt editor still contains stale or duplicated text before media attachment. Refusing to submit. ${flowDebugSnapshot()}`);
  return false;
}

async function syncPromptModelWithoutClearingMedia(jobId: string, prompt: string): Promise<boolean> {
  // Selecting a Flow component can update the visible Slate DOM before the
  // internal prompt model. Re-sync the text once after attachment in the page
  // main world. The bridge clear/insert path is intentionally not used here:
  // it can append a second ProseMirror document after a component chip is
  // selected, leaving Flow with duplicated prompt paragraphs.
  flowTrace(jobId, "Syncing Flow prompt model after source attach without clearing media...", 0.64);
  if ((await stagePromptText(prompt, { clearFirst: true })).ok) {
    await humanPause(500, 850);
    if (await ensurePromptMatchesJob(jobId, prompt)) {
      flowTrace(jobId, "Flow prompt model synced through TobyFlow's content-world ProseMirror path.", 0.65);
      return true;
    }
  }
  if (await runFlowMainWorldAction("clear-prompt")) {
    await humanPause(250, 450);
    if (await stagePromptTextViaNative(prompt) && await ensurePromptMatchesJob(jobId, prompt)) {
      flowTrace(jobId, "Flow prompt model synced via page-world clear plus trusted CDP text input.", 0.65);
      return true;
    }
  }
  const domSynced = await stagePromptTextViaDom(prompt, true);
  await humanPause(700, 1100);
  return domSynced && await ensurePromptMatchesJob(jobId, prompt);
}

async function attachFlowJobReferences(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, payload, preparedReference, primaryReference, referenceCount, runToken, sourceLabel, videoSourceMode } = context;
  await closeFlowSettingsPanelIfOpen(jobId);
  throwIfFlowJobRunStale(jobId, runToken);
  if (!referenceCount) {
    reportStatus(jobId, "submitting", "Applying Google Flow video settings...");
    return true;
  }
  reportStatus(jobId, "submitting", `Checking/reusing ${referenceCount} ${sourceLabel}(s) in Google Flow before attach...`);
  let uploaded = 0;
  try {
    uploaded = videoSourceMode === "frames"
      ? await attachStartFrameReference(jobId, payload.references || [], preparedReference)
      : await attachComponentReferences(jobId, payload.references || [], preparedReference);
  } catch (error) {
    if (videoSourceMode === "frames") await clearFlowDraftBeforeRetry(jobId);
    if (videoSourceMode === "components" && flowPageErrorText()) { await recoverFlowPageIfCrashed(payload); return false; }
    reportResult(jobId, "failed_retryable", undefined, `Flow ${sourceLabel} could not be attached completely. ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
  throwIfFlowJobRunStale(jobId, runToken);
  if (!(await waitForVerifiedComposerSource(jobId, 7000, videoSourceMode, primaryReference, referenceCount))) {
    reportResult(jobId, "failed_retryable", undefined, `Flow composer ${sourceLabel} does not match ${referenceRequiredLabel(primaryReference)}. Refusing wrong-reference video. ${flowDebugSnapshot()}`);
    return false;
  }
  if (isVideoJob(payload) && referenceCount > 0 && !(await syncPromptModelWithoutClearingMedia(jobId, payload.prompt))) {
    reportResult(jobId, "failed_retryable", undefined, `Flow prompt text was visible but could not be synced into the prompt model after source attach. Refusing submit to avoid the prompt-required rejection. ${flowDebugSnapshot()}`);
    return false;
  }
  reportStatus(jobId, "submitting", `Attached ${uploaded} ${sourceLabel}(s); verifying prompt and source frame before submit...`, undefined, (payload.references || []).filter(hasUsableReference).map((reference) => reference.assetId));
  return true;
}

async function recoverDisabledFlowSubmit(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, primaryReference, prompt, referenceCount, runToken, videoSourceMode } = context;
  if (!findDisabledFlowSubmitButton() || findFlowSubmitButton()) return true;
  await refreshPromptEditorState();
  await humanPause(900, 1400);
  throwIfFlowJobRunStale(jobId, runToken);
  if (!(await ensurePromptMatchesJob(jobId, prompt))) return false;
  return !referenceCount || waitForVerifiedComposerSource(jobId, 4000, videoSourceMode, primaryReference, referenceCount);
}

async function restoreFlowSettingsBeforeSubmit(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, payload, primaryReference, prompt, referenceCount, videoSourceMode } = context;
  if (!isVideoJob(payload)) return true;
  const readyBefore = await waitForFlowComposerVideoReady(payload, 1200);
  if (readyBefore) return true;
  const missing = await applyFlowSettingsForJob(jobId, payload);
  const readyAfter = await waitForFlowComposerVideoReady(payload, 3500);
  if (missing.length || !readyAfter) {
    lastFlowValidationFailure = missing.length ? `settings-missing:${missing.join(",")}` : "settings-not-ready";
    flowTrace(jobId, `Flow settings readiness failed (readyBefore=${readyBefore}; missing=${missing.join(",") || "none"}; readyAfter=${readyAfter}; video=${composerShowsVideoMode()}; ratio=${composerShowsAspectRatio(String(payload.settings?.aspectRatio || ""))}; duration=${composerShowsDuration(Number(payload.settings?.durationSec || 0))}).`, 0.68);
    return false;
  }
  const promptReady = await ensurePromptMatchesJob(jobId, prompt);
  if (!promptReady) {
    lastFlowValidationFailure = "prompt-after-settings";
    flowTrace(jobId, "Flow settings recovery reset the prompt model before submit.", 0.68);
    return false;
  }
  const sourceReady = !referenceCount || await waitForVerifiedComposerSource(jobId, 4000, videoSourceMode, primaryReference, referenceCount);
  if (!sourceReady) {
    lastFlowValidationFailure = "source-after-settings";
    flowTrace(jobId, "Flow settings recovery reset the verified start-frame source before submit.", 0.68);
  }
  return sourceReady;
}

async function validateFlowPromptAndReference(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, payload, primaryReference, prompt, referenceCount, videoSourceMode } = context;
  if (isVideoJob(payload) && referenceCount && findDisabledFlowSubmitButton() && !findFlowSubmitButton()) {
    await refreshPromptEditorState();
    await humanPause(700, 1100);
  }
  if (!(await ensurePromptMatchesJob(jobId, prompt))) return false;
  return !referenceCount || waitForVerifiedComposerSource(jobId, 4000, videoSourceMode, primaryReference, referenceCount);
}

async function validateFlowAttachmentRecovery(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, payload, referenceCount, runToken } = context;
  if (!(await recoverDisabledFlowSubmit(context))) return false;
  if (!referenceCount) return true;
  await sleep(2500);
  if (flowPageErrorText()) { await recoverFlowPageIfCrashed(payload); return false; }
  throwIfFlowJobRunStale(jobId, runToken);
  return recoverDisabledFlowSubmit(context);
}

async function validateFlowBeforeSubmit(context: FlowExecutionContext): Promise<boolean> {
  const { jobId, payload, primaryReference, referenceCount, videoSourceMode } = context;
  lastFlowValidationFailure = "";
  // Component attachment can reopen the compact Radix menu after the initial
  // prompt staging. Close it again before validation so Slate focus and the
  // submit control are evaluated in the actual composer surface.
  await closeFlowSettingsPanelIfOpen(jobId);
  await runFlowMainWorldAction("close-settings-menu");
  await humanPause(250, 450);
  if (!(await validateFlowPromptAndReference(context))) {
    lastFlowValidationFailure = "prompt/reference";
    flowTrace(jobId, `Final gate failed: prompt/reference mismatch (${flowDebugSnapshot()}).`, 0.68);
    return false;
  }
  if (!(await validateFlowAttachmentRecovery(context))) {
    lastFlowValidationFailure = "attachment-recovery";
    flowTrace(jobId, `Final gate failed: attachment recovery (${flowDebugSnapshot()}).`, 0.68);
    return false;
  }
  if (!(await recoverFlowPageIfCrashed(payload))) {
    lastFlowValidationFailure = "page-error";
    flowTrace(jobId, `Final gate failed: provider page error (${flowDebugSnapshot()}).`, 0.68);
    return false;
  }
  await closeTransientFlowOverlays(jobId);
  if (!(await restoreFlowSettingsBeforeSubmit(context))) {
    lastFlowValidationFailure ||= "settings/source";
    flowTrace(jobId, `Final gate failed: render settings/source readiness (${flowDebugSnapshot()}).`, 0.68);
    return false;
  }
  if (findDisabledFlowSubmitButton() && !findFlowSubmitButton()) {
    lastFlowValidationFailure = "disabled-submit";
    reportResult(jobId, "failed_retryable", undefined, `Flow kept the submit button disabled after confirmed component attach; refusing submit. ${flowDebugSnapshot()}`);
    return false;
  }
  if (payload.references?.length && !(await waitForVerifiedComposerSource(jobId, 4000, videoSourceMode, primaryReference, payload.references.length))) {
    lastFlowValidationFailure = "source-reset";
    reportResult(jobId, "failed_retryable", undefined, `Flow start-frame source was reset during final submit preparation. ${flowDebugSnapshot()}`);
    return false;
  }
  // Flow can reset the compact ProseMirror document while recovering the
  // disabled-submit state after a frame is attached. Restage at the final
  // boundary, after source/settings recovery, so prompt writing is the last
  // mutating operation before the submit click.
  if (!(await ensurePromptMatchesJob(jobId, payload.prompt))) {
    const restaged = await stagePromptText(payload.prompt, { clearFirst: true });
    if (!restaged.ok || !(await verifyPromptReady(jobId, 3000)) || !(await ensurePromptMatchesJob(jobId, payload.prompt))) {
      lastFlowValidationFailure = "prompt-reset";
      reportResult(jobId, "failed_retryable", undefined, `Flow prompt was reset during final submit preparation. ${flowDebugSnapshot()}`);
      return false;
    }
    await humanPause(350, 650);
  }
  // Keep the last mutation identical to TobyFlow's verified content-world
  // path. A trusted native clear+insert here can move focus through Flow's
  // compact composer and leave the page model empty even when the DOM probe
  // briefly reports success.
  if (!(await stagePromptText(payload.prompt, { clearFirst: true })).ok || !(await ensurePromptMatchesJob(jobId, payload.prompt))) {
    lastFlowValidationFailure = "final-prompt-stage";
    reportResult(jobId, "failed_retryable", undefined, `Flow final Toby-style prompt staging did not persist before submit. ${flowDebugSnapshot()}`);
    return false;
  }
  await humanPause(350, 650);
  return true;
}

async function submitAndWaitForFlowResult(context: FlowExecutionContext): Promise<void> {
  const { jobId, payload, runToken } = context;
  await waitForStableFlowTiles();
  // The result-baseline wait can trigger one last compact-composer rerender.
  // Recheck at the literal submit boundary and restage only if Flow replaced
  // the prompt with its placeholder; no submit click is allowed with an empty
  // model-facing editor.
  if (!(await ensurePromptMatchesJob(jobId, payload.prompt))) {
    const restaged = await stagePromptText(payload.prompt, { clearFirst: true });
    if (!restaged.ok || !(await verifyPromptReady(jobId, 3000)) || !(await ensurePromptMatchesJob(jobId, payload.prompt))) {
      reportResult(jobId, "failed_retryable", undefined, `Flow prompt was reset immediately before submit. ${flowDebugSnapshot()}`);
      return;
    }
    await humanPause(350, 650);
  }
  const baseline = currentTileBaseline();
  const beforeGenerationTileIds = new Set(baseline.beforeTileIds);
  flowJobBaselines()[jobId] = baseline;
  persistFlowJobBaselines();
  const boundaryState = flowSubmitState(findFlowSubmitButton());
  flowTrace(jobId, `Final submit boundary state: promptChars=${boundaryState.slateTextLength}; startFrames=${boundaryState.startFrameCount}; submitDisabled=${boundaryState.target?.disabled ?? "missing"}.`, 0.7);
  reportStatus(jobId, "submitting", `Flow pre-submit probe: promptChars=${boundaryState.slateTextLength}; startFrames=${boundaryState.startFrameCount}; submitDisabled=${boundaryState.target?.disabled ?? "missing"}.`);
  let submitAttempt = await clickFlowSubmitButton(jobId, 8000);
  throwIfFlowJobRunStale(jobId, runToken);
  const submitDiagnostic = `method=${submitAttempt.method || "none"}; nativeClick=${lastNativeMouseClickDiagnostic || "none"}; ok=${submitAttempt.ok}; attempted=${submitAttempt.attempted}; error=${submitAttempt.error || "none"}; target=${submitAttempt.target?.text || "none"}; disabled=${submitAttempt.target?.disabled ?? "unknown"}; aria-disabled=${submitAttempt.target?.ariaDisabled ?? "missing"}; slateChars=${submitAttempt.slateTextLength}; startFrames=${submitAttempt.startFrameCount}`;
  if (!submitAttempt.attempted) {
    reportResult(jobId, "waiting_manual_action", undefined, `Prompt staged, but Flow submit failed (${submitDiagnostic}). ${flowDebugSnapshot()}`);
    return;
  }
  flowTrace(jobId, `Flow submit attempted (${submitDiagnostic}); provider acceptance remains unconfirmed until a new generation tile appears.`, 0.72);
  if (!(await waitForGenerationStart(payload, beforeGenerationTileIds, isVideoJob(payload)))) return;
  throwIfFlowJobRunStale(jobId, runToken);
  await clearAcceptedFlowDraft(jobId);
  reportStatus(jobId, "generating", "Waiting for Google Flow result...");
  await waitForResults(payload, isVideoJob(payload), beforeGenerationTileIds);
}

async function handleFlowExecutionError(payload: JobPayload, error: unknown) {
  if (error instanceof Error && error.name === "FlowJobCancelled") return;
  if (/\/tools\/flow\/project\/[^/]+\/edit\//i.test(location.pathname)) {
    const basePath = location.pathname.replace(/\/edit\/.*$/i, "");
    sessionStorage.setItem(FLOW_ROUTE_HANDOFF_KEY, JSON.stringify({ payload, savedAt: Date.now() }));
    reportStatus(payload.jobId, "opening_provider", "Google Flow opened a media item during setup; restoring the project workspace and resuming this job automatically...");
    location.assign(`${location.origin}${basePath}`);
    return;
  }
  if (flowPageErrorText()) { await recoverFlowPageIfCrashed(payload); return; }
  reportResult(payload.jobId, "failed_retryable", undefined, `Google Flow error: ${error instanceof Error ? error.message : String(error)}`);
}

async function executeJob(payload: JobPayload, runToken: number): Promise<void> {
  let hydratedPayload = payload;
  try {
    // Jobs loaded from persistence may contain only a local media URL. Hydrate
    // the execution copy before any readiness/filter checks; never persist it.
    hydratedPayload = payload.references?.length
      ? { ...payload, references: await hydrateReferences(payload.references) }
      : payload;
    const context = await prepareFlowExecution(hydratedPayload, runToken);
    if (!context || !(await clearFlowComposerForJob(context))) return;
    if (!(await applyInitialFlowSettings(context))) return;
    if (!(await stageFlowJobPrompt(context))) return;
    if (!(await attachFlowJobReferences(context))) return;
    if (!(await validateFlowBeforeSubmit(context))) {
      reportResult(context.jobId, "failed_retryable", undefined, `Flow prompt, source frame, or render settings changed before submit (${lastFlowValidationFailure || "unknown gate"}). ${flowDebugSnapshot()}`);
      return;
    }
    await submitAndWaitForFlowResult(context);
  } catch (error) {
    await handleFlowExecutionError(hydratedPayload, error);
  }
}

const flowRecovery = createFlowResultRecovery({
  flowJobBaselines,
  isVisible,
  tileMediaUrls,
  mediaElementsIn,
  flowTilePercent,
  ...flowResultMedia,
  flowTileLinks,
  closestFlowResultTile,
  visibleText,
  isManualGate,
  reportStatus,
  reportResult,
  flowDebugSnapshot,
  flowTrace,
  flowPageErrorText,
  reportFlowSubmitRejection,
  reportDoneAndClearFlowDraft,
  findElements,
  SELECTORS,
  findElement,
  compactText,
  simulateClick,
  sleep,
  FLOW_RESULT_RECOVERY_KEY,
});
const {
  newGenerationTiles,
  currentJobTiles,
  flowTileFailed,
  flowTileHasGenerationSignal,
  reloadFlowForResultRecovery,
  waitForGenerationStart,
  flowTileBlockingError,
  normalizeFlowMediaUrl,
  resultAssetsFromMedia,
  revealMediaFromFlowTile,
  resultAssetsFromCurrentJobTiles,
  isFreshTileForJob,
  captureLatestFlowResult,
  visibleFlowResultTiles,
  visibleFlowImageTiles,
  revealVisibleFlowTileLabels,
  captureRecoverableVisibleFlowResult,
  waitForResults,
  pollFlowResult,
  handleSettledFlowPoll,
  recoverSettledFlowVideo,
  shouldFailSettledVideo,
  reportLateFlowHydrationStatus,
  finishFlowResult,
  recoverLateFlowResult,
} = flowRecovery;

function reportStatus(jobId: string, status: string, message: string, progress?: number, providerReferenceAssetIds?: string[]): void {
  if (flowTerminalJobIds.has(jobId)) return;
  const data = { type: "JOB_STATUS", jobId, status, message, progress, providerWorkspaceUrl: location.href, providerReferenceAssetIds };
  try { void chrome.runtime.sendMessage({ source: "content-script", data }).catch(() => undefined); } catch {}
  sendDirectFlowBridgeMessage(data);
}

function reportResult(jobId: string, status: string, assets?: Array<Record<string, unknown>>, error?: string): void {
  if (["done", "failed", "failed_retryable", "failed_manual", "waiting_manual_action", "cancelled"].includes(status)) flowTerminalJobIds.add(jobId);
  const data = { type: "JOB_RESULT", jobId, status, assets, error };
  try { void chrome.runtime.sendMessage({ source: "content-script", data }).catch(() => undefined); } catch {}
  sendDirectFlowBridgeMessage(data);
}

const executeJobOnce = createFlowJobDispatcher({
  routeHandoffKey: FLOW_ROUTE_HANDOFF_KEY,
  runningFlowJobIds,
  flowJobRunTokens,
  nextFlowJobRunToken,
  reportStatus,
  reportResult,
  executeJob: (payload, runToken) => {
    flowTerminalJobIds.delete(payload.jobId);
    return executeJob(payload as JobPayload, runToken);
  }
});

const directFlowProviderVisibility = (): Record<string, unknown> => {
  const isFlow = /:\/\/(?:labs\.google|labs\.google\.com|flow\.google\.com)\//i.test(location.href);
  const isProject = /(?:\/tools\/flow\/(?:project\/|shared\/tool\/)|\/project\/[^/]+(?:\/edit\/[^/]+|\/tool\/[^/]+)?$)/i.test(location.pathname);
  const isCustomTool = isProject && /\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)/i.test(location.pathname);
  const isRuntimeTool = isCustomTool && /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+(?:\/?$)/i.test(location.pathname);
  return { googleFlowTabs: isFlow ? 1 : 0, googleFlowProjectTabs: isProject ? 1 : 0, googleFlowCustomToolTabs: isCustomTool ? 1 : 0, googleFlowRuntimeToolTabs: isRuntimeTool ? 1 : 0, googleFlowEditorToolTabs: isCustomTool && !isRuntimeTool ? 1 : 0, googleFlowUrls: isFlow ? [location.href] : [] };
};
const directFlowBridge = createDirectFlowBridge({
  host: flowWindow,
  bridgeUrl: FLOW_DIRECT_BRIDGE_URL,
  extensionVersion: FLOW_EXTENSION_VERSION,
  providerAdapterId: FLOW_ADAPTER_INSTANCE_ID,
  providerVisibility: directFlowProviderVisibility,
  onRunJob: (payload) => void executeJobOnce(payload as JobPayload),
  onCancelJob: cancelFlowJobRun
});
const sendDirectFlowBridgeMessage = directFlowBridge.sendMessage;

const flowSdkSelectionListener = (event: MessageEvent<Record<string, unknown>>) => {
  // Flow's srcdoc/custom-tool bridge can report the host WindowProxy (or null)
  // as MessageEvent.source even when the request originated in the visible
  // iframe. The request type and primed queue are the authoritative guards;
  // rejecting host-window sources silently leaves the runtime in blank DRAFT.
  if (event.data?.type !== "FLOW_SELECT_MEDIA" || flowSdkSelectionQueue.length === 0) return;
  if (!/image/i.test(String((event.data.payload as Record<string, unknown> | undefined)?.filter || "image"))) return;
  const selection = flowSdkSelectionQueue.shift();
  if (!selection) return;
  flowSdkSelectionErrors.delete(selection.jobId);
  flowTrace(selection.jobId, `Studio Shot Bridge requested Flow media selection (${referenceRequiredLabel(selection.reference)}); resolving through the host picker.`, 0.44);
  // Sandboxed srcdoc tools can report a null MessageEvent.source even though
  // the request came from the visible Studio Shot Bridge iframe. Fall back to
  // that iframe's WindowProxy so the response is not silently dropped.
  // In some Chromium/srcdoc combinations MessageEvent.source is null or is
  // the host WindowProxy instead of the sandbox frame. Keep the response
  // scoped to non-reCAPTCHA iframe windows and fan it out once; the Bridge
  // SDK resolves the matching request id and ignores the harmless duplicates.
  const targets = new Set<Window>();
  if (event.source && event.source !== window) targets.add(event.source as Window);
  for (const frame of Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"))) {
    if (/recaptcha/i.test(frame.src || "")) continue;
    if (frame.contentWindow && frame.contentWindow !== window) targets.add(frame.contentWindow);
  }
  if (targets.size === 0) {
    flowTrace(selection.jobId, `Flow media selection request arrived without a reachable Studio Shot Bridge target (${referenceRequiredLabel(selection.reference)}).`, 0.45);
    return;
  }
  const postResponse = (payload: Record<string, unknown>) => {
    for (const target of targets) target.postMessage({ type: "FLOW_RESPONSE", id: event.data.id, payload }, "*");
  };
  const resolvePromise = /\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)/i.test(location.pathname)
    ? resolveFlowRuntimeSelection(selection)
    : resolveFlowSdkReference(selection).then((prepared) => ({ mediaId: prepared.attachedDirectly ? "" : flowMediaIdFromTile(prepared.tile) }));
  void resolvePromise
    .then(({ mediaId }) => {
      if (!mediaId) throw new Error(`Flow uploaded/reused ${referenceRequiredLabel(selection.reference)} but did not expose a provider media id for SDK selection.`);
      postResponse({
        // The Bridge SDK prefixes the returned bytes with `data:<mime>;base64,`.
        // References from the desktop may already be data URLs, so return only
        // the raw base64 body to avoid producing a nested/invalid data URL.
        mediaId,
        base64: String(selection.reference.base64 || "").replace(/^data:[^,]+,/, ""),
        mimeType: selection.reference.mimeType || "image/png"
      });
      flowTrace(selection.jobId, `Resolved Flow SDK media selection for ${referenceRequiredLabel(selection.reference)} using provider media ${mediaId}.`, 0.48);
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      flowSdkSelectionErrors.set(selection.jobId, detail);
      flowTrace(selection.jobId, `Flow SDK media selection could not resolve ${referenceRequiredLabel(selection.reference)}: ${detail}`, 0.46);
      postResponse({ error: detail });
    });
};

function flowProjectIdFromUrl(value: string): string {
  try { return decodeURIComponent(new URL(value).pathname.match(/\/project\/([^/]+)/i)?.[1] || ""); } catch { return ""; }
}

function canonicalFlowSdkMediaId(value: unknown): string {
  const id = String(value || "");
  if (/^fe_id_[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return id;
  // projectInitialData exposes the same UUID without the SDK's `fe_id_`
  // namespace (confirmed by the live f39b7eeb media record).
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? `fe_id_${id}` : "";
}

async function referenceImageDimensions(reference: NonNullable<JobPayload["references"]>[number]): Promise<{ width: number; height: number } | null> {
  const encoded = String(reference.base64 || "").replace(/^data:[^,]+,/, "");
  if (!encoded) return null;
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => resolve(null), 3000);
    image.onload = () => { window.clearTimeout(timeout); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { window.clearTimeout(timeout); resolve(null); };
    image.src = `data:${reference.mimeType || "image/png"};base64,${encoded}`;
  });
}

async function lookupFlowProjectMediaId(reference: NonNullable<JobPayload["references"]>[number], preferLatestExactUpload = false): Promise<string> {
  const projectId = flowProjectIdFromUrl(location.href);
  if (!projectId) return "";
  const fileNames = [...new Set([reference.filename, reference.filePath, reference.referenceLabel]
    .flatMap((value) => {
      const raw = String(value || "");
      if (!raw) return [];
      const decoded = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
      return [raw, decoded]
        .map((candidate) => candidate.split(/[\\/]/).pop()?.split("?")[0] || "")
        .filter(Boolean);
    }))];
  if (!fileNames.length) return "";
  try {
    const input = encodeURIComponent(JSON.stringify({ json: { projectId } }));
    const response = await fetch(`/fx/api/trpc/flow.projectInitialData?input=${input}`, { credentials: "include", cache: "no-store" });
    if (!response.ok) return "";
    const body = await response.json() as { result?: { data?: { json?: { projectContents?: { workflows?: unknown[]; media?: unknown[] } } } } };
    const contents = body.result?.data?.json?.projectContents;
    const workflows = Array.isArray(contents?.workflows) ? contents.workflows as Array<Record<string, any>> : [];
    const media = Array.isArray(contents?.media) ? contents.media as Array<Record<string, any>> : [];
    const matchingWorkflows = workflows.filter((candidate) => {
      const displayName = String(candidate.metadata?.displayName || "");
      return fileNames.some((fileName) => displayName === fileName);
    });
    if (!matchingWorkflows.length) return "";
    const referenceDimensions = await referenceImageDimensions(reference);
    const exactUploadWorkflows = matchingWorkflows.filter((workflow) => {
      const candidate = media.find((item) => item.workflowId === workflow.name && item.image && item.projectId === projectId);
      if (!candidate) return false;
      const dimensions = candidate.image?.dimensions;
      // Flow re-encodes user PNGs during upload, so mediaBlobSize does not
      // equal the source byte length. Preserve exact source identity through
      // the ledger fingerprint and verify the provider-side geometry here.
      return Boolean(referenceDimensions && Number(dimensions?.width) === referenceDimensions.width && Number(dimensions?.height) === referenceDimensions.height);
    });
    // Retries may have uploaded the exact same local keyframe more than once.
    // Resolve that duplicate set only when filename, decoded dimensions and
    // upload timing agree and the project ledger confirms this exact
    // reference was uploaded here. Otherwise retain the fail-closed behavior.
    const ledgerEntry = flowReferenceUploadEntry(reference);
    const correlatedUploads = ledgerEntry?.source === "upload-dispatched"
      ? exactUploadWorkflows.filter((workflow) => {
          const createdAt = Date.parse(String(workflow.metadata?.createTime || ""));
          return Number.isFinite(createdAt) && Math.abs(createdAt - Number(ledgerEntry.updatedAt || 0)) <= 30_000;
        })
      : [];
    // Never let a filename-only match become a provider identity. Flow can
    // retain an older workflow with the same display name, and sending its
    // primaryMediaId produces the misleading "first frame not found/not
    // ready" or a visually wrong video. A candidate must pass the exact
    // decoded geometry gate; correlated upload timing narrows duplicates.
    const candidates = correlatedUploads.length
      ? correlatedUploads
      : exactUploadWorkflows.length === 1 ? exactUploadWorkflows
      // Direct-upload Relay requests have just created the newest exact
      // workflow. When several historical attempts share a filename, the
      // newest exact-geometry workflow is the only deterministic candidate;
      // this path is opt-in and never affects the legacy picker route.
      : preferLatestExactUpload && exactUploadWorkflows.length
        ? [ [...exactUploadWorkflows].sort((left, right) => String(right.metadata?.createTime || "").localeCompare(String(left.metadata?.createTime || "")))[0] ]
        : [];
    if (!candidates.length) return "";
    const workflow = [...candidates].sort((left, right) => String(right.metadata?.createTime || "").localeCompare(String(left.metadata?.createTime || "")))[0];
    if (!workflow?.name) return "";
    // A hydrated DOM tile identifies the workflow/edit record, not necessarily
    // the image accepted by the custom-tool SDK. Only an explicit data-media-id
    // may override projectInitialData.primaryMediaId; data-tile-id must never
    // be passed as the I2V first-frame identity.
    const editPath = `/edit/${String(workflow.name)}`;
    const rawPrimaryMediaId = String(workflow.metadata?.primaryMediaId || "");
    const findDomTile = () => Array.from(document.querySelectorAll<HTMLElement>("[data-tile-id]"))
      .find((tile) => Array.from(tile.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .some((anchor) => { try { return new URL(anchor.href, location.href).pathname.endsWith(editPath); } catch { return false; } })
        || (rawPrimaryMediaId && Array.from(tile.querySelectorAll<HTMLImageElement>("img[src]"))
          .some((image) => { try { return decodeURIComponent(image.src).includes(rawPrimaryMediaId); } catch { return image.src.includes(rawPrimaryMediaId); } })));
    let domTile = findDomTile();
    // Flow's workspace is virtualized. Immediately falling back to
    // projectInitialData.primaryMediaId can yield a raw upload identity before
    // the live tile receives its SDK `fe_id_*` identity; the Relay then reports
    // "first frame ... not found or not ready". Give the exact workflow a
    // bounded hydration window so the live tile identity wins whenever it is
    // available. This is a readiness wait, not a second upload or submit.
    if (!domTile) {
      const hydrationStartedAt = Date.now();
      while (!domTile && Date.now() - hydrationStartedAt < 15_000) {
        await sleep(500);
        domTile = findDomTile();
      }
    }
    const explicitDomMediaId = canonicalFlowSdkMediaId(domTile?.dataset.mediaId || domTile?.getAttribute("data-media-id"));
    if (explicitDomMediaId) return explicitDomMediaId;
    // A tile's data-tile-id is commonly the workflow/edit UUID, not the
    // provider media identity. For the direct-upload path, use the API media
    // record's name (the canonical UUID that Flow.generate.video accepts).
    if (preferLatestExactUpload) {
      const mediaRecord = media.find((item) => item.workflowId === workflow.name && item.projectId === projectId && item.image && item.name);
      const canonicalMediaId = canonicalFlowSdkMediaId(mediaRecord?.name);
      if (canonicalMediaId) return canonicalMediaId;
    }
    // A just-uploaded workflow commonly exposes a raw API primaryMediaId
    // before its live tile receives the SDK `fe_id_*` identity. That raw UUID
    // is recorded in projectInitialData but is rejected by the I2V provider as
    // "not found or not ready". For correlated uploads, fail closed until the
    // tile identity appears instead of submitting a known-wrong fallback.
    if (ledgerEntry?.source === "upload-dispatched") return "";
    // Direct uploads made by another browser surface may not leave our local
    // ledger entry, yet Flow still exposes a raw primaryMediaId before the
    // tile's SDK identity is ready. Treat a recently-created unique workflow
    // the same way: do not submit its raw UUID during the indexing window.
    const workflowCreatedAt = Date.parse(String(workflow.metadata?.createTime || ""));
    if (Number.isFinite(workflowCreatedAt) && Date.now() - workflowCreatedAt < 10 * 60_000) return "";
    // Virtualized Flow workspaces can omit the media record from the response
    // even though the workflow still exposes its canonical primary media id.
    // Prefer that provider identity before falling back to the expanded media
    // list; it avoids trying to open a composer that does not exist in a
    // published Studio Shot Bridge runtime.
    const primaryMediaId = canonicalFlowSdkMediaId(workflow.metadata?.primaryMediaId);
    if (primaryMediaId) return primaryMediaId;
    const matches = media.filter((candidate) => candidate.workflowId === workflow.name && candidate.name && candidate.image && candidate.projectId === projectId);
    return matches.length === 1 ? canonicalFlowSdkMediaId(matches[0].name) : "";
  } catch {
    return "";
  }
}

async function resolveFlowRuntimeSelection(selection: FlowSdkSelection): Promise<{ mediaId: string }> {
  // The runtime tool is an embedded Studio Bridge and does not own Flow's
  // project inventory. Ask the signed-in base project tab first; otherwise a
  // direct runtime picker wait can consume the whole bounded timeout while
  // no media tile can ever appear in the iframe host.
  let workspaceRelayError = "";
  try {
    const workspace = await Promise.race([
      chrome.runtime.sendMessage({
        source: "google-flow-adapter",
        type: "RESOLVE_FLOW_REFERENCE_IN_WORKSPACE",
        jobId: selection.jobId,
        projectId: flowProjectIdFromUrl(location.href),
        reference: selection.reference
      }),
      // The base Flow inventory can hydrate dozens of virtualized tiles before
      // the strict filename/fingerprint resolver returns. Keep this bounded,
      // but do not abort it before the observed 20–30s hydration window.
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Flow workspace reference relay timed out after 45 seconds.")), 45_000))
    ]);
    if (workspace?.ok && workspace.mediaId) {
      flowTrace(selection.jobId, `Flow workspace relay resolved ${referenceRequiredLabel(selection.reference)} to provider media ${String(workspace.mediaId)}.`, 0.47);
      return { mediaId: String(workspace.mediaId) };
    }
    flowTrace(selection.jobId, `Flow workspace relay returned no media id (${String(workspace?.error || "unknown response")}); using bounded runtime fallback.`, 0.455);
    workspaceRelayError = String(workspace?.error || "workspace relay returned no media id");
  } catch (error) {
    workspaceRelayError = error instanceof Error ? error.message : String(error);
    flowTrace(selection.jobId, `Flow workspace relay failed (${workspaceRelayError}); using bounded runtime fallback.`, 0.455);
  }

  // A published runtime does not own the classic Flow composer. Continuing
  // into its DOM fallback would only produce a misleading "add button"
  // timeout (and could leave a picker open); fail closed with the relay cause.
  throw new Error(`Flow workspace relay could not provide a provider media id; direct runtime reference resolution also failed${workspaceRelayError ? `: ${workspaceRelayError}` : "."}`);
}
window.addEventListener("message", flowSdkSelectionListener, true);

if (flowWindow.__studioGoogleFlowAdapterListener) {
  chrome.runtime.onMessage.removeListener(flowWindow.__studioGoogleFlowAdapterListener);
}

directFlowBridge.stop();

function handleFlowMediaConfirmation(message: Record<string, unknown>, sendResponse: (response?: unknown) => void): void {
  const filename = String(message.filename || "").split(/[\\/]/).pop()?.split("?")[0] || "";
  if (!filename) { sendResponse({ ok: false, error: "Flow media confirmation filename is missing." }); return; }
  void (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8_000) {
      const options = [...document.querySelectorAll<HTMLElement>("listboxoption, [role='option'], [role='listbox'] [role='button'], [data-testid*='media'], div")]
        .filter((item) => { const rect = item.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; })
        .filter((item) => String(item.innerText || item.textContent || "").trim() === filename)
        .sort((left, right) => String(left.innerText || left.textContent || "").length - String(right.innerText || right.textContent || "").length);
      const option = options[0];
      if (option) {
        option.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
        const add = [...document.querySelectorAll<HTMLButtonElement>("button, [role='button']")].find((item) => /^(?:Thêm nội dung nghe nhìn|Add media)$/i.test(String(item.innerText || item.getAttribute("aria-label") || "").trim()) && !item.disabled);
        if (add) { add.click(); sendResponse({ ok: true }); return; }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    sendResponse({ ok: false, error: `Flow media tile ${filename} was not available in the open picker.` });
  })();
}

function handleFlowCapture(message: Record<string, unknown>, sendResponse: (response?: unknown) => void): void {
  const job = message.job as JobPayload;
  const allowVisibleFallback = Boolean(message.allowVisibleFallback);
  const capturePromise = allowVisibleFallback
    ? captureRecoverableVisibleFlowResult(job, isVideoJob(job), true)
    : captureLatestFlowResult(job.jobId, isVideoJob(job));
  void capturePromise
    .then(async (assets) => {
      if (assets.length > 0) await clearAcceptedFlowDraft(job.jobId);
      sendResponse({ ok: assets.length > 0, adapter: FLOW_ADAPTER_INSTANCE_ID, assets, error: assets.length > 0 ? undefined : "No usable Google Flow result media was visible." } satisfies FlowCaptureResponse);
    })
    .catch((error) => sendResponse({ ok: false, adapter: FLOW_ADAPTER_INSTANCE_ID, error: error instanceof Error ? error.message : String(error) } satisfies FlowCaptureResponse));
}

const flowMessageListener: FlowMessageListener = (message, _sender, sendResponse) => {
  if (message.action === "RESOLVE_FLOW_REFERENCE") {
    const jobId = String(message.jobId || "");
    const reference = message.reference as JobReference | undefined;
    if (!jobId || !reference?.assetId) { sendResponse({ ok: false, error: "Workspace reference relay payload is incomplete." }); return true; }
    // A virtualized Flow inventory can move the exact tile out of the DOM
    // between sequential component selections. If this reference was already
    // verified in the same project, its cached `fe_id_*` is a stronger provider
    // identity than the first visible duplicate filename.
    const cachedFingerprint = referenceFingerprint(reference);
    const cachedTileId = cachedFingerprint ? String(readFlowReferenceCache()[cachedFingerprint]?.tileId || "") : "";
    // A Flow reload can replace tile identities while retaining the local
    // upload ledger. Do not return a stale cached id unless that exact tile
    // is still live in the workspace DOM.
    const cachedTileIsLive = cachedTileId && Array.from(document.querySelectorAll<HTMLElement>("[data-tile-id]"))
      .some((tile) => String(tile.dataset.tileId || tile.getAttribute("data-tile-id") || "") === cachedTileId);
    if (/^fe_id_/i.test(cachedTileId) && cachedTileIsLive && flowReferenceWasUploadedInCurrentProject(reference)) {
      sendResponse({ ok: true, mediaId: cachedTileId });
      return true;
    }
    void lookupFlowProjectMediaId(reference, Boolean(message.preferDirectUpload))
      .then((mediaId) => mediaId ? { ok: true, mediaId } : resolveFlowSdkReference({ jobId, reference, preferDirectUpload: Boolean(message.preferDirectUpload) }).then((prepared) => {
        if (prepared.attachedDirectly) throw new Error("Workspace picker attached the frame directly without exposing a media id.");
        const resolvedMediaId = flowMediaIdFromTile(prepared.tile);
        if (!resolvedMediaId) throw new Error("Workspace picker returned a tile without a provider media id.");
        return { ok: true, mediaId: resolvedMediaId };
      }))
      .then((prepared) => {
        sendResponse(prepared);
      })
      .catch(async (error) => {
        // Flow can keep the project inventory in its API while virtualized
        // tiles are absent from the DOM. Let the workspace relay recover the
        // exact project media id without weakening the visual matcher path.
        const mediaId = await lookupFlowProjectMediaId(reference, Boolean(message.preferDirectUpload));
        if (mediaId) { sendResponse({ ok: true, mediaId }); return; }
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }
  if (message.action === "PRIME_FLOW_MEDIA") {
    const jobId = String(message.jobId || "");
    const references = Array.isArray(message.references) ? message.references as NonNullable<JobPayload["references"]> : [];
    void hydrateReferences(references).then((hydrated) => primeFlowSdkMedia(jobId, hydrated))
      .then((primed) => sendResponse({ ok: true, primed }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message.action === "CONFIRM_FLOW_MEDIA") {
    handleFlowMediaConfirmation(message, sendResponse);
    return true;
  }
  if (message.action === "PING_STUDIO_ADAPTER") {
    sendResponse({ ok: true, adapter: FLOW_ADAPTER_INSTANCE_ID });
    return true;
  }
  if (message.action === "EXECUTE_JOB") {
    void executeJobOnce(message.job as JobPayload);
    sendResponse({ ok: true, adapter: FLOW_ADAPTER_INSTANCE_ID });
  }
  if (message.action === "CAPTURE_LATEST_FLOW_RESULT") {
    handleFlowCapture(message, sendResponse);
    return true;
  }
  if (message.action === "CANCEL_JOB") {
    const jobId = String(message.jobId || "");
    if (jobId) cancelFlowJobRun(jobId);
    sendResponse({ ok: true, adapter: FLOW_ADAPTER_INSTANCE_ID });
  }
  return true;
};

flowWindow.__studioGoogleFlowAdapterLoaded = true;
flowWindow.__studioGoogleFlowAdapterInstanceId = FLOW_ADAPTER_INSTANCE_ID;
flowWindow.__studioGoogleFlowAdapterListener = flowMessageListener;
chrome.runtime.onMessage.addListener(flowMessageListener);

try {
  const resultRecovery = JSON.parse(sessionStorage.getItem(FLOW_RESULT_RECOVERY_KEY) || "null") as { job?: JobPayload; savedAt?: number; attempts?: number } | null;
  sessionStorage.removeItem(FLOW_RESULT_RECOVERY_KEY);
  if (resultRecovery?.job?.jobId && Date.now() - Number(resultRecovery.savedAt || 0) < 60_000
    && /(?:\/tools\/flow\/project\/[^/]+|\/project\/[^/]+)\/?$/i.test(location.pathname)) {
    window.setTimeout(() => {
      const baseline = flowJobBaselines()[resultRecovery.job!.jobId];
      void waitForResults(resultRecovery.job as JobPayload, isVideoJob(resultRecovery.job as JobPayload), new Set(baseline?.beforeTileIds || []));
    }, 3500);
  }
} catch {
  sessionStorage.removeItem(FLOW_RESULT_RECOVERY_KEY);
}

try {
  const routeHandoff = JSON.parse(sessionStorage.getItem(FLOW_ROUTE_HANDOFF_KEY) || "null") as { payload?: JobPayload; savedAt?: number } | null;
  sessionStorage.removeItem(FLOW_ROUTE_HANDOFF_KEY);
  if (routeHandoff?.payload?.jobId && Date.now() - Number(routeHandoff.savedAt || 0) < 60_000
    && /(?:\/tools\/flow\/project\/[^/]+|\/project\/[^/]+)\/?$/i.test(location.pathname)) {
    window.setTimeout(() => void executeJobOnce(routeHandoff.payload as JobPayload), 1800);
  }
} catch {
  sessionStorage.removeItem(FLOW_ROUTE_HANDOFF_KEY);
}
directFlowBridge.connect();

export {};
