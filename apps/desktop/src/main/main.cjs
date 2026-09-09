const { app, BrowserWindow, dialog, ipcMain, protocol, nativeImage, shell, screen, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const { Readable } = require("node:stream");
const { collectVideoDurationMismatches, reconcileVideoResultState } = require("./production-state.cjs");
const { normalizeVideoEditorialReview, applyVideoEditorialReview, reconcileReviewedVideoWithSequence } = require("./video-editorial.cjs");
const { prepareMasterExportClips } = require("./master-export.cjs");
const { locateSpeechOnSequence, validateVoiceRender } = require("./voice-audio.cjs");
const { discoverFFmpeg, probeMedia, buildFfmpegConcatArgs } = require("./ffmpeg-edit-engine.cjs");
const { validateSequenceContracts } = require("./sequence-qa.cjs");
const { estimateShotTiming, hasMultipleCameraSetups, normalizeImportedActionBeats } = require("./shot-timing.cjs");
const { parseMacosVoiceCatalog, autoCastMacosVoice, speechTextForMacos, upgradeAutoCastMacosProfile } = require("./voice-casting.cjs");
const { supersedeRetriedSourceJob: supersedeRetrySource } = require("./job-lifecycle.cjs");
const { validateNarrativePackage, validateScenePackage, validateScreenplayShot, validateShotReferences, assertContractCoverage, resolveVisualVariants, readableVisualChange } = require("./story-shot-validation.cjs");
const { classifyImportedShotTransformations, classifyIndependentActionOperations } = require("../../../../packages/domain/src/shot-classification.cjs");
const { materializeStoryCharacters } = require("./story-character-materialization.cjs");
const { formatSceneBreakdown, storyWordRange } = require("./story-artifacts.cjs");
const { createStore } = require("./state/store.cjs");
const { createStateBootstrap } = require("./state/bootstrap.cjs");
const { createSeedState: buildSeedState } = require("./state/seed.cjs");
const { CURRENT_SCHEMA_VERSION, applySqliteMigrations, migrateState } = require("./state/migrations.cjs");
const { createFoundationPipeline } = require("./story-pipeline/foundation.cjs");
const { createArchitecturePipeline } = require("./story-pipeline/architecture.cjs");
const { createScreenplayPipeline } = require("./story-pipeline/screenplay.cjs");
const { createShotBreakdownPipeline } = require("./story-pipeline/shot-breakdown.cjs");
const { createStoryPolicies, assertShotAuthoredLanguage, explicitGlobalVoiceDirection, minimumAtomicCueGroupCount } = require("./story-pipeline/policies.cjs");
const { createMediaAssetService } = require("./media/asset-service.cjs");
const { createSqliteProjection } = require("./state/sqlite-projection.cjs");
const { createPersistenceWriter } = require("./state/persistence-writer.cjs");
const { createBridgeConnectionManager } = require("./bridge/connection-manager.cjs");
const { dispatchDesktopNativeClick, evaluateFlowCustomTool } = require("./bridge/cdp-tools.cjs");
const { createExtensionBridgeServer } = require("./bridge/server.cjs");
const { loadOrCreateInstanceId } = require("./bridge/instance-identity.cjs");
const { loadOrCreatePairingSecret } = require("./bridge/pairing-secret.cjs");
const { createPairingSessions } = require("./bridge/pairing-session.cjs");
const { createBridgeReferenceStorage } = require("./bridge/reference-storage.cjs");
const { createProviderJobRuntime } = require("./jobs/provider-runtime.cjs");
const { createJobResultHandler } = require("./jobs/result-handler.cjs");
const { createJobStatusRuntime } = require("./jobs/status-runtime.cjs");
const { extractJson, extractLatestStoryJson } = require("./story-pipeline/response-parser.cjs");
const { createRendererTransport } = require("./renderer-transport.cjs");
const { providerCatalog, sanitizeProjectRouting } = require("./providers/catalog.cjs");
const { createAuxiliaryResultHandlers } = require("./story-pipeline/auxiliary-results.cjs");
const { createLegacyStoryResultHandler } = require("./story-pipeline/legacy-story-result.cjs");
const { completedAssetJobMessage } = require("./jobs/completion-message.cjs");
const { createMediaHttpServer } = require("./media/http-server.cjs");
const { createReferencePromotion } = require("./media/reference-promotion.cjs");
const { promoteReferenceToShot } = require("./media/reference-keyframe.cjs");
const { loadSkillRegistry } = require("./skills/registry.cjs");
const { WINDOW_MODES, boundsForWindowMode, normalizeWindowMode, windowModeSnapshot } = require("./window-mode.cjs");
const { createCharacterMaterializer, createShotBreakdownReconciler, isSavedChatGptConversationUrl } = require("./runtime-utils.cjs");
const { registerJobHandlers } = require("./job-handlers.cjs");
const { registerAudioHandlers } = require("./audio-handlers.cjs");
const { createExportSequenceHandler } = require("./export-sequence-handler.cjs");
const { createSaveAssetHandler } = require("./save-asset-handler.cjs");
const { importVerifiedFlowVideo } = require("./verified-flow-import.cjs");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// A single desktop instance owns the renderer, bridge and media ports. Without
// this guard, repeated restarts leave stale Electron windows competing for the
// same ports and the visible app can become a detached/chrome-error page.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  return;
}
app.on("second-instance", () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

const isDev = process.env.NODE_ENV !== "production";
const dataRoot = path.join(app.getPath("userData"), "studio-data");
const statePath = path.join(dataRoot, "settings", "studio-state.json");
const desktopInstanceIdPath = path.join(dataRoot, "settings", "desktop-instance-id");
const pairingSecretPath = path.join(dataRoot, "settings", "bridge-pairing-secret");
const windowStatePath = path.join(dataRoot, "settings", "window-state.json");
const activeProjectPath = path.join(dataRoot, "settings", "active-project.json");
const sqlitePath = path.join(dataRoot, "settings", "studio.sqlite");
let win;
let windowMode = WINDOW_MODES.COMPACT;
let windowModeListenersAttached = false;
let applyingWindowMode = false;
let sockets = new Set();
let extensionConnections = new Map();
let mediaServer;
let state;
let desktopInstanceId = "";
let pairingSecret = "";
let bridgeServer;
let pairingSessions;
const stateStore = createStore();
const mutateState = (mutator, metadata = {}) => {
  stateStore.mutate(() => mutator(state), metadata);
  state = stateStore.get();
  return state;
};
const exportProcesses = new Map();
const EXPECTED_EXTENSION_VERSION = "0.2.1";
const MEDIA_SERVER_PORT = 3768;
const PROVIDER_ACTIVE_JOB_TIMEOUT_MS = Number(process.env.STUDIO_PROVIDER_ACTIVE_JOB_TIMEOUT_MS || 120_000);
// Flow can expose the native tile several minutes before its playable video
// URL hydrates. Keep the wait bounded, but long enough for a real provider
// generation instead of converting a late result into a retryable failure.
const FLOW_ACTIVE_JOB_TIMEOUT_MS = Number(process.env.STUDIO_FLOW_ACTIVE_JOB_TIMEOUT_MS || 900_000);
const FLOW_RECOVERY_TIMEOUT_MS = Number(process.env.STUDIO_FLOW_RECOVERY_TIMEOUT_MS || 900_000);
const logPath = path.join(dataRoot, "logs", "state-events.jsonl");
const LOG_MAX_BYTES = 2 * 1024 * 1024; // 2MB max log size
let ffmpegToolchain;
const sqliteProjection = createSqliteProjection({
  sqlitePath,
  schemaPath: path.join(__dirname, "../db/schema.sql"),
  applyMigrations: applySqliteMigrations,
  getState: () => state
});
const bridgeConnections = createBridgeConnectionManager({
  sockets,
  connections: extensionConnections,
  expectedVersion: EXPECTED_EXTENSION_VERSION,
  sendToRenderer: (channel, payload) => sendToRenderer(channel, payload),
  randomId: () => crypto.randomUUID()
});

function getFFmpegToolchain() {
  if (!ffmpegToolchain) {
    ffmpegToolchain = discoverFFmpeg({ resourcesPath: process.resourcesPath });
  }
  return ffmpegToolchain;
}

function logEvent(event, data = {}) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    // Rotate when log exceeds max size
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > LOG_MAX_BYTES) {
        fs.renameSync(logPath, `${logPath}.old`);
      }
    } catch { /* file may not exist yet */ }
    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + "\n";
    fs.appendFileSync(logPath, line);
  } catch { /* log must never crash the app */ }
}

function logProductionTransitions(transitions) {
  for (const transition of transitions || []) logEvent(transition.event, transition);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "studio-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const rendererTransport = createRendererTransport({ getWindow: () => win, logEvent });
const rendererStateSnapshot = rendererTransport.snapshot;
const flushRendererState = rendererTransport.flush;
const sendToRenderer = rendererTransport.send;
state = stateStore.replace(buildSeedState({ now, providers: providerCatalog }), { reason: "bootstrap" });

function now() {
  return new Date().toISOString();
}

const storyPolicies = createStoryPolicies({ providerCatalog });
const projectVideoDurationPolicy = storyPolicies.projectVideoDurationPolicy;
const normalizeProjectShotDuration = storyPolicies.normalizeProjectShotDuration;
const recommendedProjectShotCount = storyPolicies.recommendedProjectShotCount;

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

const { mediaMimeType, cacheControlForMedia, isPathInside, serveStudioMedia, toStudioMediaUrl, localPathFromStudioMediaUrl, probeLocalVideoDurationSeconds, probeLocalAudioDurationSeconds, hydrateVideoMediaTruth, annotateVideoDurationMismatches, isLikelyEphemeralMediaPath, normalizeStoredMediaUrl, persistDataUrlAsset, ensureImagePreview, migrateImageAssetOutOfVideoFolder, isOwnedFlowVideoAsset, flowJobStartFrameAssetId, isStrictFlowVideoAssetForShot, quarantineUnverifiedFlowVideoAssets, hideUnavailableVideoAsset, quarantineDuplicateRecoveredFlowVideos, normalizePersistedReviewJobs, normalizeSuccessfulRetryJobs, normalizePassedPreflightJobs, normalizeLegacyStateVariantPrompts, normalizeShotSpeechDelivery, duplicateFlowVideoResult, shotAlreadyHasVideoForJob, attachExistingVideoAssetToJobShot, resolveDuplicateFlowVideoBlockers, normalizeShotLinkedVideoAssets, repairRecoverableFlowVideoAssets, recoverDownloadedFlowVideoFiles, shotHasRenderableVideo, renderableVideoAssetIdsForShot, normalizeVideoJobsForCompletedShots } = createMediaAssetService({
  path, fs, app, nativeImage, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState: () => state,
  collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, supersedeRetriedSourceJob, now, id
});

const upsertProjectCharactersFromStory = createCharacterMaterializer({
  getState: () => state,
  execFileSync,
  parseMacosVoiceCatalog,
  autoCastMacosVoice,
  upgradeAutoCastMacosProfile,
  now,
  id
});
const reconcileCompletedShotBreakdown = createShotBreakdownReconciler({ getState: () => state, validateSequenceContracts, logEvent, now });

const bridgeReferenceStorage = createBridgeReferenceStorage({ dataRoot, mediaPort: MEDIA_SERVER_PORT, getState: () => state, toMediaUrl: toStudioMediaUrl });
const bridgeReferenceLocalPath = bridgeReferenceStorage.localPath;
const encodeBridgeReferences = bridgeReferenceStorage.encode;
const persistBase64Reference = bridgeReferenceStorage.persist;
const normalizeBridgeMessageForStorage = bridgeReferenceStorage.normalize;
const sanitizeEmbeddedStateMedia = bridgeReferenceStorage.sanitizeState;

const ensureDataFiles = createStateBootstrap({
  fs, path, statePath, dataRoot, sqlitePath,
  openSqliteDb: () => sqliteProjection.open(),
  getState: () => state,
  setState: (nextState) => { state = nextState; },
  stateStore, migrateState, providerCatalog, activeProjectPath,
  saveActiveProject: () => persistenceWriter.saveActiveProject(),
  persistDataUrlAsset, normalizeStoredMediaUrl, hydrateVideoMediaTruth,
  migrateImageAssetOutOfVideoFolder, ensureImagePreview, hideUnavailableVideoAsset,
  isOwnedFlowVideoAsset, localPathFromStudioMediaUrl, toStudioMediaUrl, quarantineDuplicateRecoveredFlowVideos,
  now, normalizePersistedReviewJobs, normalizeSuccessfulRetryJobs, normalizePassedPreflightJobs,
  normalizeLegacyStateVariantPrompts, normalizeShotSpeechDelivery, resolveDuplicateFlowVideoBlockers,
  normalizeShotLinkedVideoAssets, recoverDownloadedFlowVideoFiles, repairRecoverableFlowVideoAssets,
  quarantineUnverifiedFlowVideoAssets, normalizeVideoJobsForCompletedShots, annotateVideoDurationMismatches,
  sanitizeEmbeddedStateMedia, upsertProjectCharactersFromStory, sanitizeProjectRouting,
  reconcileCompletedShotBreakdown, id, expectedExtensionVersion: EXPECTED_EXTENSION_VERSION,
  saveState: () => persistenceWriter.request()
});

const openSqliteDb = sqliteProjection.open;
const syncStateToSqlite = sqliteProjection.sync;
const persistenceWriter = createPersistenceWriter({
  statePath,
  activeProjectPath,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  getState: () => state,
  touchState: (metadata) => stateStore.touch(metadata),
  syncProjection: syncStateToSqlite,
  logEvent
});
const saveStateBackup = persistenceWriter.backup;
const flushStateSave = persistenceWriter.flush;
const saveState = persistenceWriter.request;
const saveActiveProject = persistenceWriter.saveActiveProject;
const writeJsonAtomic = persistenceWriter.writeJsonAtomic;

const loadSkillDocs = () => loadSkillRegistry({ skillsDir: path.join(__dirname, "../../../../packages/skills"), fs, path, isPathInside });

const broadcast = bridgeConnections.broadcast;
const dropBridgeSocket = bridgeConnections.drop;
const safeSendBridgeSocket = bridgeConnections.safeSend;
const socketCanHandleProvider = bridgeConnections.canHandle;
const shouldIgnoreDirectFlowMessage = bridgeConnections.ignoreDirectFlowMessage;
const sendBridgeMessage = bridgeConnections.send;
const releaseJobTarget = bridgeConnections.releaseJobTarget;
const isJobTargetCurrent = bridgeConnections.isJobTargetCurrent;
const bridgeStatus = bridgeConnections.status;
const publishBridgeStatus = bridgeConnections.publishStatus;
const heartbeatBridgeConnections = bridgeConnections.heartbeat;

const jobStatusRuntime = createJobStatusRuntime({
  getState: () => state,
  isSavedConversationUrl: isSavedChatGptConversationUrl,
  now,
  logEvent,
  saveState,
  sendState: (nextState) => sendToRenderer("studio:state", nextState)
});
const updateJobStatus = jobStatusRuntime.update;
const acknowledgeJobDispatch = jobStatusRuntime.acknowledge;

const { applyStoryFoundationResult } = createFoundationPipeline({
  extractJson, getState: () => state, storyWordRange, explicitGlobalVoiceDirection, now, upsertProjectCharactersFromStory
});

const { applyStoryArchitectureResult } = createArchitecturePipeline({
  extractJson, getState: () => state, recommendedProjectShotCount, formatSceneBreakdown, id, now, upsertProjectCharactersFromStory
});

const { normalizeScreenplayCueBuckets, applyScreenplaySceneResult } = createScreenplayPipeline({
  extractJson, getState: () => state, now, crypto, projectVideoDurationPolicy, minimumAtomicCueGroupCount, classifyIndependentActionOperations
});

const { applyShotBreakdownResult } = createShotBreakdownPipeline({
  extractJson, getState: () => state, mutateState, now, recommendedProjectShotCount, normalizeProjectShotDuration, validateSequenceContracts, assertShotAuthoredLanguage, id, classifyImportedShotTransformations, classifyIndependentActionOperations, hasMultipleCameraSetups, normalizeImportedActionBeats, estimateShotTiming, reconcileCompletedShotBreakdown, ensureProjectVoices: upsertProjectCharactersFromStory
});

const applyStoryResult = createLegacyStoryResultHandler({ getState: () => state, mutateState, extractLatestStoryJson, id, now, recommendedProjectShotCount, normalizeProjectShotDuration, upsertProjectCharactersFromStory });

const auxiliaryResultHandlers = createAuxiliaryResultHandlers({ getState: () => state, extractJson, now });
const applyQuickVisualAnalysisResult = auxiliaryResultHandlers.applyQuickVisualAnalysis;
const applyTranslationResult = auxiliaryResultHandlers.applyTranslation;

const promoteAssetToReference = createReferencePromotion({ fs, path, nativeImage, dataRoot, getState: () => state, localPathFromStudioMediaUrl, toStudioMediaUrl, id, now });

function directReferenceExistsForJob(job) {
  const settings = job.input?.bridgeMessage?.settings || {};
  if (!directReferenceJob(job, settings)) return false;
  const referenceUse = String(settings.directReferenceUse || settings.referenceUse || "primary_identity");
  const role = String(settings.referenceRole || "main_character");
  return (state.visualReferences || []).some((reference) => directReferenceIsUsable(reference, job, referenceUse, role, settings.characterSlot));
}

function directReferenceIsUsable(reference, job, referenceUse, role, characterSlot) {
  if (!directReferenceMatches(reference, job.projectId, characterSlot, referenceUse, role)) return false;
  // A pre-existing reference must not make a new failed provider attempt
  // look successful. Only accept a reference created by this job and backed
  // by a real imported image asset.
  if (reference.sourceJobId && reference.sourceJobId !== job.id) return false;
  if (!reference.sourceAssetId) return false;
  const asset = state.assets.find((item) => item.id === reference.sourceAssetId);
  return Boolean(asset && asset.type === "image" && asset.filePath);
}

function directReferenceJob(job, settings) {
  return job.jobType === "image" && job.input?.bridgeMessage?.task === "text_to_image" && Boolean(settings.directReferenceUse && settings.characterSlot);
}

function directReferenceMatches(reference, projectId, characterSlot, referenceUse, role) {
  return reference.projectId === projectId && reference.characterSlot === String(characterSlot) && reference.referenceUse === referenceUse && reference.role === role;
}

function supersedeRetriedSourceJob(job) {
  return supersedeRetrySource(state.jobs, job, now());
}

const finishJob = createJobResultHandler({
  getState: () => state,
  mutateState,
  isSavedConversationUrl: isSavedChatGptConversationUrl,
  sendBridgeMessage,
  encodeBridgeReferences,
  now,
  logEvent,
  saveState,
  sendToRenderer,
  completedAssetJobMessage,
  supersedeRetriedSourceJob,
  normalizeShotLinkedVideoAssets,
  normalizeVideoJobsForCompletedShots,
  structuredTextHandlers: {
    storyFoundation: applyStoryFoundationResult,
    storyArchitecture: applyStoryArchitectureResult,
    screenplayScene: applyScreenplaySceneResult,
    shotBreakdown: applyShotBreakdownResult,
    storyDevelopment: applyStoryResult,
    quickVisualAnalysis: applyQuickVisualAnalysisResult,
    translation: applyTranslationResult
  },
  duplicateFlowVideoResult,
  localPathFromStudioMediaUrl,
  probeIncomingMedia: (source) => probeMedia(source, getFFmpegToolchain()),
  fs,
  path,
  dataRoot,
  downloadsRoot: app.getPath("downloads"),
  id,
  toStudioMediaUrl,
  shotAlreadyHasVideoForJob,
  attachExistingVideoAssetToJobShot,
  resolveDuplicateFlowVideoBlockers,
  flowJobStartFrameAssetId,
  hydrateVideoMediaTruth,
  ensureImagePreview,
  promoteAssetToReference,
  repairRecoverableFlowVideoAssets,
  quarantineUnverifiedFlowVideoAssets,
  annotateVideoDurationMismatches,
  directReferenceExistsForJob
});

const providerJobRuntime = createProviderJobRuntime({ getState: () => state, sockets, saveState, sendToRenderer, sendBridgeMessage, encodeReferences: encodeBridgeReferences, socketCanHandleProvider, safeSend: safeSendBridgeSocket, broadcast, now, nowMs: Date.now, logEvent, providerActiveTimeoutMs: PROVIDER_ACTIVE_JOB_TIMEOUT_MS, flowActiveTimeoutMs: FLOW_ACTIVE_JOB_TIMEOUT_MS, flowRecoveryTimeoutMs: FLOW_RECOVERY_TIMEOUT_MS });
const dispatchPendingJobs = providerJobRuntime.dispatchPending;
const deliverUnacknowledgedChatGptJobs = providerJobRuntime.deliverUnacknowledgedChatGpt;
const retryStuckOpeningJobs = providerJobRuntime.retryOpening;
const retryStuckActiveProviderJobs = providerJobRuntime.retryActive;
const recoverFlowJob = providerJobRuntime.recoverFlow;
const recoverRecentFailedFlowJobs = providerJobRuntime.recoverRecentFlowFailures;

function createBridgeServer() {
  pairingSessions = createPairingSessions({ secret: pairingSecret, nowMs: Date.now });
  bridgeServer = createExtensionBridgeServer({
    sockets,
    extensionConnections,
    publishBridgeStatus,
    deliverUnacknowledgedChatGptJobs,
    dispatchPendingJobs,
    recoverRecentFailedFlowJobs,
    dropBridgeSocket,
    releaseJobTarget,
    isJobTargetCurrent,
    acknowledgeJobDispatch,
    dispatchDesktopNativeClick,
    evaluateFlowCustomTool,
    shouldIgnoreDirectFlowMessage,
    updateJobStatus,
    finishJob,
    desktopInstanceId,
    pairingSecret,
    pairingSessions,
    shouldRetainJobTarget: (message) => {
      const job = state.jobs.find((item) => item.id === message.jobId);
      return ["pending", "opening_provider", "submitting", "generating", "downloading"].includes(job?.status);
    }
  });
  return bridgeServer;
}

function createMediaServer() {
  mediaServer = createMediaHttpServer({
    port: MEDIA_SERVER_PORT,
    fs,
    path,
    dataRoot,
    downloadsRoot: app.getPath("downloads"),
    isPathInside,
    cacheControlForMedia,
    mediaMimeType
  });
  return mediaServer;
}

function rendererTargetUrl() {
  if (!isDev) return undefined;
  return process.env.STUDIO_DEV_SERVER_URL || `http://127.0.0.1:${process.env.STUDIO_DEV_PORT || "5273"}`;
}

function createRendererLoadRuntime(browserWindow, targetUrl) {
  return { browserWindow, targetUrl, attempts: 0, crashRecoveries: 0, timer: undefined };
}

function loadRenderer(runtime) {
  const { browserWindow, targetUrl } = runtime;
  if (!browserWindow || browserWindow.isDestroyed()) return;
  runtime.attempts += 1;
  const load = targetUrl
    ? browserWindow.loadURL(targetUrl)
    : browserWindow.loadFile(path.join(__dirname, "../../../../dist/renderer/index.html"));
  load.catch((error) => {
    logEvent("renderer_load_failed", {
      attempt: runtime.attempts,
      targetUrl: targetUrl || "dist/renderer/index.html",
      error: error?.message || String(error)
    });
    scheduleRendererReload(runtime);
  });
}

function scheduleRendererReload(runtime) {
  const { browserWindow } = runtime;
  if (runtime.attempts >= 3 || runtime.timer || !browserWindow || browserWindow.isDestroyed()) return;
  runtime.timer = setTimeout(() => {
    runtime.timer = undefined;
    loadRenderer(runtime);
  }, 750 * runtime.attempts);
}

function attachRendererLifecycle(runtime) {
  const { browserWindow, targetUrl } = runtime;
  browserWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return;
    logEvent("renderer_load_failed", { attempt: runtime.attempts, targetUrl: validatedUrl || targetUrl, errorCode, errorDescription });
    scheduleRendererReload(runtime);
  });
  browserWindow.webContents.on("did-finish-load", () => {
    const loadedUrl = browserWindow.webContents.getURL();
    if (!loadedUrl || loadedUrl === "about:blank") return scheduleRendererReload(runtime);
    logEvent("renderer_load_ready", { attempt: runtime.attempts, loadedUrl });
    // Loading the renderer must not activate Electron over the user's work.
    browserWindow.showInactive();
  });
  browserWindow.on("unresponsive", () => logEvent("renderer_unresponsive", { loadedUrl: browserWindow.webContents.getURL() }));
  browserWindow.webContents.on("render-process-gone", (_event, details) => {
    logEvent("renderer_process_gone", details);
    if (browserWindow.isDestroyed() || runtime.crashRecoveries >= 2) return;
    runtime.crashRecoveries += 1;
    runtime.attempts = 0;
    setTimeout(() => loadRenderer(runtime), 1_000);
  });
  browserWindow.on("closed", () => {
    if (runtime.timer) clearTimeout(runtime.timer);
    win = null;
  });
}

function readPersistedWindowMode() {
  try {
    const value = JSON.parse(fs.readFileSync(windowStatePath, "utf8"));
    return normalizeWindowMode(value?.mode);
  } catch {
    return WINDOW_MODES.COMPACT;
  }
}

function persistWindowMode(mode) {
  try {
    fs.mkdirSync(path.dirname(windowStatePath), { recursive: true });
    const temporaryPath = `${windowStatePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, mode: normalizeWindowMode(mode) })}\n`, "utf8");
    fs.renameSync(temporaryPath, windowStatePath);
  } catch (error) {
    logEvent("window_mode_persist_failed", { error: error?.message || String(error) });
  }
}

function displayForWindow() {
  if (!win || win.isDestroyed()) return screen.getPrimaryDisplay();
  try { return screen.getDisplayMatching(win.getBounds()); } catch { return screen.getPrimaryDisplay(); }
}

function windowModeState() {
  const bounds = win && !win.isDestroyed() ? win.getBounds() : { x: 0, y: 0, width: 1200, height: 920 };
  return windowModeSnapshot(windowMode, bounds, displayForWindow()?.id);
}

function applyWindowMode(requestedMode, { persist = true } = {}) {
  windowMode = normalizeWindowMode(requestedMode);
  if (!win || win.isDestroyed()) return windowModeState();
  const display = displayForWindow();
  // The app intentionally exposes two product layout modes. Native window
  // resizing is disabled so an intermediate geometry cannot create an
  // untested renderer layout; display tiling/overrides are still handled by
  // reapplying the selected mode against the current work area.
  if (typeof win.setResizable === "function") win.setResizable(false);
  if (typeof win.setMaximizable === "function") win.setMaximizable(false);
  if (typeof win.setFullScreenable === "function") win.setFullScreenable(false);
  applyingWindowMode = true;
  try {
    const bounds = boundsForWindowMode(windowMode, display.workArea);
    // On macOS a non-resizable BrowserWindow can update its native frame via
    // setBounds while leaving the Chromium content viewport at the previous
    // width. That makes a compact surface render the maximized layout and
    // clip the right rail. Set the content size explicitly when available,
    // then position the frame; retain setBounds for older Electron runtimes.
    if (typeof win.setContentSize === "function") {
      win.setContentSize(bounds.width, bounds.height, false);
      if (typeof win.setPosition === "function") win.setPosition(bounds.x, bounds.y, false);
    } else {
      win.setBounds(bounds, false);
    }
  } finally {
    applyingWindowMode = false;
  }
  if (persist) persistWindowMode(windowMode);
  return windowModeState();
}

function attachWindowModeListeners() {
  if (windowModeListenersAttached) return;
  windowModeListenersAttached = true;
  const reapply = () => {
    if (applyingWindowMode || !win || win.isDestroyed()) return;
    applyWindowMode(windowMode, { persist: false });
  };
  win.on("resize", reapply);
  screen.on("display-metrics-changed", reapply);
  screen.on("display-added", reapply);
  screen.on("display-removed", reapply);
}

function createWindow() {
  windowMode = readPersistedWindowMode();
  const display = screen.getPrimaryDisplay();
  const initialBounds = boundsForWindowMode(windowMode, display.workArea);
  win = new BrowserWindow({
    // Keep the native surface aligned with the renderer viewport. A wider
    // default window leaves an unstyled native strip visible beside the app
    // on macOS when the content view is constrained to 1200 CSS pixels.
    ...initialBounds,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 9 },
    backgroundColor: "#eef0f3",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  applyWindowMode(windowMode);
  attachWindowModeListeners();
  const rendererRuntime = createRendererLoadRuntime(win, rendererTargetUrl());
  attachRendererLifecycle(rendererRuntime);
  loadRenderer(rendererRuntime);
}

const registerIpcHandler = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => registerIpcHandler(channel, async (...args) => {
  const result = await listener(...args);
  return result === state ? rendererStateSnapshot(state) : result;
});

ipcMain.handle("studio:get-state", () => rendererStateSnapshot(state));
ipcMain.handle("edit:probe-media", (_, payload) => {
  const assetId = String(payload?.assetId || "");
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || !["video", "audio"].includes(asset.type)) throw new Error("A project media asset is required.");
  const filePath = localPathFromStudioMediaUrl(asset.filePath);
  if (!filePath || !isPathInside(path.resolve(filePath), dataRoot)) throw new Error("Media probing is limited to the project data folder.");
  return probeMedia(filePath, getFFmpegToolchain());
});
ipcMain.handle("studio:get-skills", () => loadSkillDocs());
ipcMain.handle("studio:save-video-poster", (_, payload) => {
  const assetId = String(payload?.assetId || "");
  const dataUrl = String(payload?.dataUrl || "");
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.type !== "video") return state;
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!match) return state;
  const ext = match[1].toLowerCase().startsWith("jp") ? "jpg" : match[1].toLowerCase();
  const posterDir = path.join(dataRoot, "projects", asset.projectId, "videos", "posters");
  fs.mkdirSync(posterDir, { recursive: true });
  const posterPath = path.join(posterDir, `${asset.id}.${ext}`);
  fs.writeFileSync(posterPath, Buffer.from(match[2], "base64"));
  mutateState((draft) => {
    const current = draft.assets.find((item) => item.id === assetId);
    if (current) current.metadata = { ...(current.metadata || {}), posterFilePath: posterPath, posterUrl: toStudioMediaUrl(posterPath), posterGeneratedAt: now() };
  }, { reason: "save-video-poster", assetId });
  saveState();
  sendToRenderer("studio:state", state);
  return state;
});
ipcMain.handle("studio:save-video-review-frame", (_, payload) => {
  const assetId = String(payload?.assetId || "");
  const kind = payload?.kind === "last" ? "last" : "first";
  const dataUrl = String(payload?.dataUrl || "");
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.type !== "video") return state;
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!match) return state;
  const ext = match[1].toLowerCase().startsWith("jp") ? "jpg" : match[1].toLowerCase();
  const frameDir = path.join(dataRoot, "projects", asset.projectId, "videos", "review-frames");
  fs.mkdirSync(frameDir, { recursive: true });
  const framePath = path.join(frameDir, `${asset.id}-${kind}.${ext}`);
  fs.writeFileSync(framePath, Buffer.from(match[2], "base64"));
  mutateState((draft) => {
    const current = draft.assets.find((item) => item.id === assetId);
    if (current) current.metadata = { ...(current.metadata || {}), reviewFrames: { ...(current.metadata?.reviewFrames || {}), [kind]: { filePath: framePath, url: toStudioMediaUrl(framePath), timeSeconds: Number(payload?.timeSeconds || 0), capturedAt: now() } } };
  }, { reason: "save-video-review-frame", assetId, kind });
  logEvent("video_review_frame_saved", { assetId, shotId: asset.shotId, kind, timeSeconds: Number(payload?.timeSeconds || 0) });
  saveState();
  sendToRenderer("studio:state", state);
  return state;
});
ipcMain.handle("studio:update-video-review", (_, payload) => {
  const assetId = String(payload?.assetId || "");
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.type !== "video") return state;
  const frames = asset.metadata?.reviewFrames || {};
  const job = state.jobs.find((item) => item.id === asset.sourceJobId || item.resultAssetIds.includes(asset.id));
  const nextReview = normalizeVideoEditorialReview(payload?.review, { frames, promptVersion: job?.idempotencyKey || job?.id || asset.sourceJobId, reviewedAt: now() });
  const shot = state.shots.find((item) => item.id === asset.shotId || item.assetIds.includes(asset.id));
  mutateState((draft) => {
    const currentAsset = draft.assets.find((item) => item.id === assetId);
    const currentShot = draft.shots.find((item) => item.id === asset.shotId || item.assetIds.includes(asset.id));
    if (!currentAsset) return;
    applyVideoEditorialReview({ asset: currentAsset, shot: currentShot, review: nextReview });
    reconcileReviewedVideoWithSequence({ project: draft.projects.find((item) => item.id === asset.projectId), shot: currentShot, asset: currentAsset, review: nextReview, timestamp: now() });
  }, { reason: "update-video-review", assetId });
  logEvent("video_editorial_reviewed", { assetId, shotId: asset.shotId, jobId: job?.id, status: nextReview.status, reviewer: nextReview.reviewer, promptVersion: nextReview.promptVersion, reason: nextReview.reason });
  saveState();
  sendToRenderer("studio:state", state);
  return state;
});
const exportSequenceHandler = createExportSequenceHandler({ getState: () => state, mutateState, prepareMasterExportClips, localPathFromStudioMediaUrl, getFFmpegToolchain, probeMedia, buildFfmpegConcatArgs, fs, crypto, dataRoot, path, now, saveState, sendToRenderer, spawn, __dirname, exportProcesses, toStudioMediaUrl, logEvent });
ipcMain.handle("studio:export-sequence", exportSequenceHandler);
ipcMain.handle("studio:cancel-export", (_, jobId) => {
  const job = state.jobs.find((item) => item.id === jobId && item.jobType === "export");
  if (!job) return state;
  const child = exportProcesses.get(jobId);
  if (child) child.kill("SIGTERM");
  mutateState((draft) => {
    const current = draft.jobs.find((item) => item.id === jobId && item.jobType === "export");
    if (!current) return;
    current.status = "cancelled";
    current.statusMessage = "Export cancelled; source media remains unchanged.";
    current.updatedAt = now();
  }, { reason: "cancel-export", jobId });
  saveState();
  sendToRenderer("studio:state", state);
  return state;
});
registerAudioHandlers({ ipcMain, getState: () => state, mutateState, locateSpeechOnSequence, validateVoiceRender, crypto, path, dataRoot, now, saveState, sendToRenderer, spawn, fs, speechTextForMacos, execFileSync, probeLocalAudioDurationSeconds, toStudioMediaUrl, logEvent, __dirname });
registerJobHandlers({ getState: () => state, mutateState, crypto, ipcMain, normalizeBridgeMessageForStorage, now, saveState, sendToRenderer, logEvent, saveStateBackup, dispatchPendingJobs, shotHasRenderableVideo, sockets, sendBridgeMessage, encodeBridgeReferences, applyStoryResult, applyStoryFoundationResult, applyStoryArchitectureResult, applyScreenplaySceneResult, applyShotBreakdownResult, recoverFlowJob, isSavedChatGptConversationUrl, broadcast });
ipcMain.handle("studio:apply-plan", (_, payload) => {
  saveStateBackup("apply-plan");
  mutateState((draft) => {
    const previousSceneIds = new Set(draft.scenes.filter((scene) => scene.projectId === payload.projectId).map((scene) => scene.id));
    draft.shots = draft.shots.filter((shot) => !previousSceneIds.has(shot.sceneId));
    draft.scenes = draft.scenes.filter((scene) => scene.projectId !== payload.projectId);
    draft.scenes.push(...payload.scenes);
    draft.shots.push(...payload.shots);
    if (Array.isArray(payload.characters)) {
      draft.characters = draft.characters.filter((character) => character.projectId !== payload.projectId);
      draft.characters.push(...payload.characters.map((character) => ({ ...character, projectId: payload.projectId })));
    }
    draft.projects = draft.projects.map((project) =>
      project.id === payload.projectId ? { ...project, sourceDraft: payload.storySeed, updatedAt: now() } : project
    );
  }, { reason: "apply-plan", projectId: payload.projectId });
  logEvent("apply_plan", { projectId: payload.projectId, sceneCount: payload.scenes?.length, shotCount: payload.shots?.length });
  saveState();
  return state;
});
ipcMain.handle("studio:update-shot", (_, patch) => {
  const revisionFields = ["description", "camera", "motion", "dominantAction", "dialogue", "durationSec", "prompt", "actionBeats"];
  mutateState((draft) => {
    const shot = draft.shots.find((item) => item.id === patch.id);
    if (!shot) return;
    Object.assign(shot, patch);
    if (revisionFields.some((field) => Object.prototype.hasOwnProperty.call(patch, field))) {
      const revisionAt = now();
      Object.assign(shot, { revisionAt, downstreamDirty: true, revisionNote: `Đã chỉnh sửa SH${shot.order} (bản A/B). Các shot phía sau có thể cần tạo lại.` });
      const sceneOrder = draft.scenes.find((item) => item.id === shot.sceneId)?.order ?? 0;
      draft.shots.forEach((candidate) => {
        const candidateSceneOrder = draft.scenes.find((item) => item.id === candidate.sceneId)?.order ?? 0;
        if (candidate.id === shot.id || candidateSceneOrder > sceneOrder || (candidateSceneOrder === sceneOrder && candidate.order > shot.order)) {
          if (candidate.id !== shot.id) Object.assign(candidate, { downstreamDirty: true, revisionNote: `Đứng sau SH${shot.order} đã chỉnh sửa (bản A/B). Có thể tạo lại shot này.` });
        }
      });
    }
  }, { reason: "update-shot", shotId: patch.id });
  saveState();
  return state;
});
ipcMain.handle("studio:update-scene", (_, patch) => {
  mutateState((draft) => {
    const scene = draft.scenes.find((item) => item.id === patch.id);
    if (!scene) return;
    Object.assign(scene, patch);
    const revisionAt = now();
    Object.assign(scene, { revisionAt, downstreamDirty: true, revisionNote: `Đã chỉnh sửa cảnh ${scene.order} (bản A/B). Các shot trong và sau cảnh này có thể cần tạo lại.` });
    draft.shots.forEach((candidate) => {
      const candidateSceneOrder = draft.scenes.find((item) => item.id === candidate.sceneId)?.order ?? 0;
      if (candidateSceneOrder >= scene.order) Object.assign(candidate, { downstreamDirty: true, revisionNote: `Cảnh ${scene.order} đã chỉnh sửa (bản A/B). Có thể tạo lại shot này.` });
    });
  }, { reason: "update-scene", sceneId: patch.id });
  saveState();
  return state;
});
ipcMain.handle("studio:update-character", (_, patch) => {
  mutateState((draft) => {
    draft.characters = draft.characters.map((character) =>
      character.id === patch.id ? { ...character, ...patch } : character
    );
  }, { reason: "update-character", characterId: patch.id });
  saveState();
  return state;
});
ipcMain.handle("studio:update-project", (_, projectId, patch) => {
  mutateState((draft) => {
    const project = draft.projects.find((item) => item.id === projectId);
    if (project) Object.assign(project, patch, { updatedAt: now() });
  }, { reason: "update-project", projectId });
  saveState();
  return state;
});
ipcMain.handle("studio:create-project", (_, payload) => {
  saveStateBackup("create-project");
  const projectId = id("project");
  const styleBibleId = id("style");
  const createdAt = now();
  const defaultIntake = {
    sourceType: "idea",
    productionFormat: "short_video",
    targetDurationSec: 30,
    durationValue: 30,
    durationUnit: "seconds",
    episodeCount: 1,
    audience: "General audience",
    platform: "TikTok",
    platforms: ["TikTok"],
    outputLanguage: "Vietnamese",
    contentLanguage: "Vietnamese",
    // Storyboard I2V must preserve the selected keyframe as Flow's exact
    // opening frame. Loose component/reference mode is opt-in per job.
    flowVideoMode: "frames",
    aiRouting: { textProvider: "chatgpt-web", imageProvider: "chatgpt-web", videoProvider: "google-flow-web" }
  };
  const intake = {
    ...defaultIntake,
    ...(payload?.intake || {}),
    aiRouting: {
      ...defaultIntake.aiRouting,
      ...(payload?.intake?.aiRouting || {})
    }
  };
  mutateState((draft) => draft.projects.unshift({
    id: projectId,
    name: String(payload?.name || "Untitled project"),
    description: "",
    sourceDraft: String(payload?.sourceDraft || ""),
    styleBibleId,
    intake,
    createdAt,
    updatedAt: createdAt
  }), { reason: "create-project", projectId });
  mutateState((draft) => draft.styleBibles.push({
    id: styleBibleId,
    projectId,
    visualStyle: "Consistent cinematic production design with clean readable forms, stable character identity, and composition appropriate to the selected format.",
    colorPalette: "Use a small story-motivated palette with stable hero, environment, and accent colors across every scene.",
    texture: "Preserve authored material identity and tactile detail without noisy or conflicting surface treatments.",
    lighting: "Use motivated cinematic lighting that preserves geography, time of day, subject readability, and continuity between adjacent shots.",
    motionRules: "One dominant action per shot, stable screen direction, locked camera by default, and at most one short motivated move.",
    negativeStyle: "No warped anatomy, extra limbs, identity drift, prop duplication, unexplained wardrobe reset, unreadable text, captions, watermarks, or decorative UI."
  }), { reason: "create-project-style", projectId });
  mutateState((draft) => { draft.activeProjectId = projectId; }, { reason: "select-created-project", projectId });
  saveState();
  saveActiveProject();
  return state;
});
ipcMain.handle("studio:update-style-bible", (_, styleBibleId, patch) => {
  mutateState((draft) => {
    const styleBible = draft.styleBibles.find((item) => item.id === styleBibleId);
    if (styleBible) Object.assign(styleBible, patch);
  }, { reason: "update-style-bible", styleBibleId });
  saveState();
  return state;
});
ipcMain.handle("studio:select-project", (_, projectId) => {
  mutateState((draft) => {
    if (draft.projects.some((project) => project.id === projectId)) draft.activeProjectId = projectId;
  }, { reason: "select-project", projectId });
  saveActiveProject();
  return rendererStateSnapshot(state);
});
ipcMain.handle("studio:add-reference", (_, payload) => {
  const projectDir = path.join(dataRoot, "projects", payload.projectId, "references");
  fs.mkdirSync(projectDir, { recursive: true });
  const sourcePath = bridgeReferenceLocalPath(payload.filePath || payload.previewDataUrl || "");
  const sourceExtension = sourcePath && fs.existsSync(sourcePath) ? path.extname(sourcePath).slice(1).toLowerCase() : "";
  const mimeExtension = String(payload.mimeType || "image/png").split("/")[1]?.replace("jpeg", "jpg") || "png";
  const extension = sourceExtension || mimeExtension;
  const referenceId = id("reference");
  const filePath = path.join(projectDir, `${referenceId}.${extension}`);
  const base64 = String(payload.dataUrl || "").split(",")[1];
  if (base64) {
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  } else if (sourcePath && fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, filePath);
  } else {
    throw new Error("Reference image data is missing.");
  }
  mutateState((draft) => draft.visualReferences.push({
    id: referenceId,
    projectId: payload.projectId,
    name: payload.name,
    role: payload.role,
    referenceUse: payload.referenceUse,
    characterSlot: payload.characterSlot,
    filePath,
    previewDataUrl: toStudioMediaUrl(filePath),
    sourceDescription: payload.sourceDescription || "",
    transformationRequest: payload.transformationRequest || "",
    sourceAssetId: payload.sourceAssetId,
    sourceProvider: payload.sourceProvider,
    sourceAspectRatio: payload.sourceAspectRatio,
    createdAt: now()
  }), { reason: "add-reference", projectId: payload.projectId, referenceId });
  saveState();
  return state;
});
ipcMain.handle("studio:promote-reference-to-shot", (_, payload) => promoteReferenceToShot(payload, {
  fs, path, nativeImage, dataRoot, getState: () => state, mutateState, saveState, id, now, toStudioMediaUrl
}));
ipcMain.handle("studio:remove-reference", (_, referenceId) => {
  const reference = state.visualReferences.find((item) => item.id === referenceId);
  if (reference?.filePath && fs.existsSync(reference.filePath)) fs.unlinkSync(reference.filePath);
  mutateState((draft) => {
    draft.visualReferences = draft.visualReferences.filter((item) => item.id !== referenceId);
  }, { reason: "remove-reference", referenceId });
  saveState();
  return state;
});
ipcMain.handle("studio:remove-asset", (_, assetId) => {
  if (String(assetId).startsWith("job:")) {
    const jobId = String(assetId).slice(4);
    const job = state.jobs.find((item) => item.id === jobId);
    if (job) {
      job.status = "cancelled";
      job.statusMessage = "Rejected result discarded; job retained as superseded lineage.";
      job.resultAssetIds = [];
      job.updatedAt = now();
    }
    saveState();
    return state;
  }
  const removedAsset = state.assets.find((item) => item.id === assetId);
  if (removedAsset?.type === "video") {
    const removedShot = state.shots.find((item) => item.id === removedAsset.shotId || item.assetIds.includes(removedAsset.id));
    reconcileReviewedVideoWithSequence({
      project: state.projects.find((item) => item.id === removedAsset.projectId),
      shot: removedShot,
      asset: removedAsset,
      review: { status: "rejected" },
      timestamp: now()
    });
  }
  mutateState((draft) => {
    draft.assets = draft.assets.filter((item) => item.id !== assetId);
    draft.jobs = draft.jobs.map((job) => {
    const resultAssetIds = job.resultAssetIds.filter((idValue) => idValue !== assetId);
    if (resultAssetIds.length === job.resultAssetIds.length) return job;
    if (resultAssetIds.length > 0) return { ...job, resultAssetIds };
    return { ...job, resultAssetIds, status: "cancelled", statusMessage: "Rejected result discarded; job retained as superseded lineage.", updatedAt: now() };
    });
    draft.shots = draft.shots.map((shot) => {
    if (!shot.assetIds.includes(assetId) && shot.currentVideoAssetId !== assetId) return shot;
    const next = { ...shot, assetIds: shot.assetIds.filter((idValue) => idValue !== assetId) };
    if (shot.currentVideoAssetId === assetId) {
      delete next.currentVideoAssetId;
      delete next.currentVideoJobId;
    }
    return next;
    });
  }, { reason: "remove-asset", assetId });
  saveState();
  return state;
});
ipcMain.handle("studio:open-asset", async (_, assetId) => {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset?.filePath) return { ok: false, error: "Asset not found" };
  if (/^https?:\/\//i.test(asset.filePath)) {
    await shell.openExternal(asset.filePath);
    return { ok: true };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(asset.filePath) && !asset.filePath.startsWith("file:")) {
    await shell.openExternal(asset.filePath);
    return { ok: true };
  }
  const targetPath = asset.filePath.startsWith("file:") ? decodeURIComponent(new URL(asset.filePath).pathname) : asset.filePath;
  const result = await shell.openPath(targetPath);
  return result ? { ok: false, error: result } : { ok: true };
});
ipcMain.handle("studio:open-external", async (_, value) => {
  if (typeof value !== "string" || !/^https:\/\//i.test(value)) return { ok: false, error: "Only HTTPS URLs can be opened." };
  try {
    await shell.openExternal(value);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
const saveAssetHandler = createSaveAssetHandler({ getState: () => state, path, dialog, win, app, fs });
ipcMain.handle("studio:save-asset", saveAssetHandler);
ipcMain.handle("studio:import-verified-flow-video", (_, payload) => importVerifiedFlowVideo(payload, {
  fs, path, dataRoot, id, now, getState: () => state, mutateState, saveState,
  toStudioMediaUrl
}));
ipcMain.handle("studio:approve-asset", (_, assetId) => {
  const asset = state.assets.find((item) => item.id === assetId);
  if (asset?.type === "video" && asset.metadata?.editorialReview?.status !== "accepted") {
    logEvent("video_approval_blocked", { assetId, shotId: asset.shotId, reason: "editorial_review_required" });
    return state;
  }
  const job = state.jobs.find((item) => item.resultAssetIds.includes(assetId));
  if (job) job.status = "approved";
  const shot = state.shots.find((item) => item.assetIds.includes(assetId));
  if (shot && asset?.type === "video") shot.status = "approved";
  saveState();
  return state;
});
ipcMain.handle("studio:get-bridge-status", () => bridgeStatus());
ipcMain.handle("studio:approve-bridge-pairing", (_, payload) => {
  const extensionInstanceId = String(payload?.extensionInstanceId || "");
  const code = String(payload?.code || "");
  return bridgeServer?.approvePairing?.(extensionInstanceId, code) || { ok: false, code: "pairing_unavailable" };
});
ipcMain.handle("window:get-mode", () => windowModeState());
ipcMain.handle("window:set-mode", (_, requestedMode) => applyWindowMode(requestedMode));

app.whenReady().then(() => {
  ensureDataFiles();
  desktopInstanceId = loadOrCreateInstanceId({ fs, path, filePath: desktopInstanceIdPath, randomUUID: () => crypto.randomUUID() });
  pairingSecret = loadOrCreatePairingSecret({ fs, path, filePath: pairingSecretPath, safeStorage }).secret;

  protocol.handle("studio-media", serveStudioMedia);

  createMediaServer();
  createBridgeServer();
  setInterval(heartbeatBridgeConnections, 5_000).unref();
  setInterval(retryStuckOpeningJobs, 5_000).unref();
  setInterval(retryStuckActiveProviderJobs, 10_000).unref();
  createWindow();
});

app.on("before-quit", () => {
  if (stateSaveTimer) clearTimeout(stateSaveTimer);
  flushStateSave();
  if (rendererStateTimer) clearTimeout(rendererStateTimer);
  flushRendererState();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
