import { isSavedChatGptConversationUrl, normalizeProvider, providerAdapter, providerAdapters } from "./adapters/registry";
import { planProviderAdmission } from "./coordinator";
import { createChatGptBrowserState, createChatGptSessionStore } from "./session-store";
import { registerRuntimeMessageListener } from "./runtime-messages";
import { createBridgeRuntime } from "./bridge-runtime";
import { createGoogleFlowCustomToolAdapter } from "./adapters/google-flow-custom-tool";
import { createResultRuntime } from "./result-runtime";
import { createProviderTabs } from "./provider-tabs";
import { createDispatchRuntime } from "./dispatch-runtime";
import { createJobCoordinator } from "./job-coordinator";
import { flowResultMetadata, flowStartFrameAssetId, inferProviderFromUrl, randomDelay, withTimeout } from "./runtime-utils";
import installationIdentity from "./installation-identity.cjs";
import capabilityContract from "../../../../packages/protocol/src/capabilities.cjs";
import type { FlowCaptureResponse, ResultAsset, StudioJob, ToolJobPayload } from "./job-types";

const configuredBridgePort = Number((import.meta as ImportMeta & { env?: { VITE_STUDIO_BRIDGE_PORT?: string } }).env?.VITE_STUDIO_BRIDGE_PORT || 3767);
const BRIDGE_URL = `ws://127.0.0.1:${Number.isInteger(configuredBridgePort) && configuredBridgePort > 0 && configuredBridgePort < 65_536 ? configuredBridgePort : 3767}`;
const REQUIRED_CHATGPT_ADAPTER_CAPABILITIES = ["chatgpt-result-baseline-v12", "verified-reference-upload-v22", "structured-json-tail-recovery-v23"];
const RECONNECT_DELAY = 3000;
const KEEPALIVE_ALARM = "studio-bridge-keepalive";
const EXTENSION_SESSION_ID = crypto.randomUUID();
let EXTENSION_INSTANCE_ID = `${chrome.runtime.id}:${EXTENSION_SESSION_ID}`;
const extensionIdentityReady = installationIdentity.loadOrCreateInstallationId(chrome.storage.local, () => crypto.randomUUID())
  .then((value: string) => { EXTENSION_INSTANCE_ID = value; return value; })
  .catch(() => EXTENSION_INSTANCE_ID);
const FLOW_RECOVERY_TIMEOUT_MS = 900_000;
const FLOW_TOOL_EVALUATE_TIMEOUT_MS = 90_000;
// ChatGPT applies account-level throttling across all open conversations.
// YOLO chains references and keyframes, so the old 30s floor still allowed a
// long run to trip the provider-wide request limit. Keep the lane deliberately
// slow; a cooldown is much more expensive than one paced request.
const CHATGPT_MIN_DISPATCH_INTERVAL_MS = 120_000;
// Provider-local pacing: ChatGPT is deliberately slower; Flow can run in
// parallel with ChatGPT, but its own submissions remain human-paced.
const PROVIDER_MIN_DISPATCH_INTERVAL_MS: Record<string, number> = {
  "google-flow": 8_000,
  "elevenlabs-flows": 4_000,
  grok: 5_000
};
const CHATGPT_RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;
// A terminal desktop result is not echoed back into the extension snapshot.
// Keep active work long enough for a healthy provider response, but release a
// silent single-flight snapshot promptly so a later YOLO job cannot wait on a
// dead browser lane for twenty minutes.
const CHATGPT_ACTIVE_JOB_STALE_MS = 5 * 60_000;
const CHATGPT_OPENING_NO_ACK_STALE_MS = 90_000;
const CHATGPT_DOWNLOADING_STALE_MS = 90_000;
const CHATGPT_RATE_LIMIT_STORAGE_KEY = "studio.chatgpt.rateLimitedUntil.v1";
const CHATGPT_STUDIO_TAB_STORAGE_KEY = "studio.chatgpt.tabId.v1";
const PROVIDER_DISPATCH_DELAY_MS: Record<string, [number, number]> = {
  chatgpt: [20000, 30000],
  "google-flow": [7000, 14000],
  "elevenlabs-flows": [3500, 7000],
  grok: [4000, 9000]
};

const PROVIDER_URLS = Object.fromEntries(providerAdapters.map((adapter) => [adapter.provider, adapter.targetUrl]));
const EXTENSION_CAPABILITIES = capabilityContract.normalizeCapabilityManifest({
  manifestVersion: "2", protocolVersions: [1, 2], providers: Object.keys(PROVIDER_URLS),
  executors: ["custom-tool-v1", "flow-ui-direct-v2"],
  tasks: ["connection_test", "quick_visual_analysis", "story_development", "story_foundation", "story_architecture", "screenplay_scene", "shot_breakdown", "production_graph_revision", "translation", "prompt_enhance", "text_to_image", "image_to_video", "download"],
  maxMessageBytes: 4 * 1024 * 1024, binaryTransfer: "loopback-file"
});

const CONTENT_SCRIPT_BY_PROVIDER = Object.fromEntries(providerAdapters.filter((adapter) => adapter.contentScript).map((adapter) => [adapter.provider, adapter.contentScript!])) as Record<string, string>;

const MAIN_WORLD_SCRIPT_BY_PROVIDER = Object.fromEntries(providerAdapters.filter((adapter) => adapter.mainWorldScript).map((adapter) => [adapter.provider, adapter.mainWorldScript!])) as Partial<Record<string, string>>;

const EXISTING_TAB_PROVIDERS = new Set(["google-flow", "elevenlabs-flows", "grok"]);
// Include the canonical Flow project workspace itself. The old list only
// matched /fx and /tool routes, so a valid base project tab was invisible to
// exact project locking even though Chrome and TobyFlow could see it.
const FLOW_TAB_PATTERNS = ["https://labs.google/fx/*", "https://labs.google.com/fx/*", "https://flow.google.com/fx/*", "https://flow.google.com/project/*", "https://flow.google.com/project/*/tool/*"];

const activeJobs = new Map<string, StudioJob>();
let latestProviderVisibility: Record<string, unknown> = {};
const completedResultJobs = new Set<string>();
const processingResultJobs = new Set<string>();
const customToolActiveJobs = new Set<string>();
const chatGptSessions = createChatGptSessionStore(activeJobs);
const chatGptBrowserState = createChatGptBrowserState(
  CHATGPT_RATE_LIMIT_STORAGE_KEY,
  CHATGPT_STUDIO_TAB_STORAGE_KEY,
  (tab) => providerTabMatches("chatgpt", tab.url)
);
const persistedChatGptRateLimitedUntil = chatGptBrowserState.rateLimitedUntil;
const persistChatGptRateLimit = chatGptBrowserState.persistRateLimit;
const rememberStudioChatGptTab = chatGptBrowserState.rememberTab;
const rememberedStudioChatGptTab = chatGptBrowserState.rememberedTab;
const persistActiveJobSnapshot = chatGptSessions.persist;
const restoreActiveJobSnapshot = chatGptSessions.restore;
const forgetActiveJobSnapshot = chatGptSessions.forget;

async function humanProviderPause(provider: string, phase: string, jobId: string): Promise<void> {
  const range = PROVIDER_DISPATCH_DELAY_MS[provider] || [2500, 6000];
  const delay = randomDelay(range);
  sendStatus(jobId, "opening_provider", `Waiting ${Math.round(delay / 1000)}s before ${phase} to keep browser automation human-paced...`, 0.2);
  await new Promise((resolve) => setTimeout(resolve, delay));
}


async function providerVisibilitySnapshot(): Promise<Record<string, unknown>> {
  let flowVisibilityError = "";
  const flow = await findFlowProjectTab().catch((error) => {
    flowVisibilityError = error instanceof Error ? error.message : String(error);
    return {
    flowTabCount: 0,
    projectTabCount: 0,
    customToolTabCount: 0,
    runtimeToolTabCount: 0,
    editorToolTabCount: 0,
    urls: []
    };
  });
  const elevenLabsFlowsTabs = (await chrome.tabs.query({ url: "https://elevenlabs.io/app/flows/*" }).catch(() => []))
    .filter((tab) => providerTabMatches("elevenlabs-flows", tab.url));
  const snapshot = {
    googleFlowTabs: flow.flowTabCount,
    googleFlowProjectTabs: flow.projectTabCount,
    googleFlowCustomToolTabs: flow.customToolTabCount,
    googleFlowRuntimeToolTabs: flow.runtimeToolTabCount,
    googleFlowEditorToolTabs: flow.editorToolTabCount,
    googleFlowUrls: flow.urls,
    ...(flowVisibilityError ? { googleFlowVisibilityError: flowVisibilityError } : {}),
    elevenLabsFlowsTabs: elevenLabsFlowsTabs.length,
    elevenLabsFlowsUrls: elevenLabsFlowsTabs.map((tab) => tab.url || "").filter(Boolean).slice(0, 4)
  };
  latestProviderVisibility = snapshot;
  return snapshot;
}

const bridge = createBridgeRuntime({
  bridgeUrl: BRIDGE_URL, extensionSessionId: EXTENSION_SESSION_ID, extensionInstanceId: () => EXTENSION_INSTANCE_ID, capabilities: EXTENSION_CAPABILITIES, providers: Object.keys(PROVIDER_URLS),
  providerVisibility: providerVisibilitySnapshot, handleDesktopMessage: (message) => handleDesktopMessage(message)
});
const connect = () => { void extensionIdentityReady.finally(() => bridge.connect()); };
const ensureBridgeConnection = bridge.ensureConnection;
const sendExtensionHello = bridge.hello;
const refreshExtensionStatus = bridge.refreshStatus;
const sendToDesktop = bridge.send;
const requestDesktopNativeClick = bridge.requestNativeClick;
const requestDesktopFlowToolEvaluate = bridge.requestFlowToolEvaluate;

function sendStatus(jobId: string, status: string, message: string, progress = 0): void {
  const job = activeJobs.get(jobId);
  if (job) {
    job.lastStatus = status;
    job.lastStatusMessage = message;
    job.lastProgress = progress;
    job.lastActivityAt = Date.now();
  }
  sendToDesktop({ type: "JOB_STATUS", jobId, status, message, progress });
}

function pruneStaleChatGptJobs(nowMs = Date.now()): void {
  for (const [jobId, candidate] of activeJobs) {
    if (candidate.provider !== "chatgpt") continue;
    const lastActivityAt = Number(candidate.lastActivityAt || 0);
    // Snapshots from older extension builds did not persist activity time.
    // They cannot be proven live, so discard them before single-flight admission
    // instead of resurrecting a terminal ChatGPT job and blocking every project.
    const openingWithoutAck = candidate.lastStatus === "opening_provider" && Number(candidate.lastProgress || 0) <= 0.2;
    const staleOpening = openingWithoutAck && (!lastActivityAt || nowMs - lastActivityAt > CHATGPT_OPENING_NO_ACK_STALE_MS);
    const staleDownloading = candidate.lastStatus === "downloading" && (!lastActivityAt || nowMs - lastActivityAt > CHATGPT_DOWNLOADING_STALE_MS);
    if (staleOpening || staleDownloading || !lastActivityAt || nowMs - lastActivityAt > CHATGPT_ACTIVE_JOB_STALE_MS) {
      activeJobs.delete(jobId);
      processingResultJobs.delete(jobId);
      forgetActiveJobSnapshot(jobId);
      sendToDesktop({ type: "JOB_RESULT", jobId, status: "failed_retryable", assets: [], error: staleDownloading
        ? "ChatGPT asset handoff became stale and was released; retry after reloading the provider tab."
        : "ChatGPT provider dispatch became stale after the bridge acknowledgement and was released; retry without resubmitting the old request." });
      continue;
    }
  }
}

// A desktop watchdog can terminate a job without another RUN_JOB arriving.
// Periodically reclaim that silent extension snapshot so the provider lane
// cannot remain locked indefinitely.
setInterval(() => pruneStaleChatGptJobs(), 15_000);

let coordinator!: ReturnType<typeof createJobCoordinator>;
let enqueueCustomToolJob!: (job: StudioJob, tab: chrome.tabs.Tab) => Promise<void>;
let cancelCustomToolJob!: (jobId: string) => void;
let probeFlowAppIntake!: (payload: unknown) => Promise<unknown>;
const handleDesktopMessage = (message: Record<string, unknown>) => coordinator.handleDesktopMessage(message);
const retryRecoveredCapture = (job: StudioJob, tabId: number) => coordinator.retryRecoveredCapture(job, tabId);
const uploadChatGptReferencesNatively = (job: StudioJob, assetId?: string) => coordinator.uploadChatGptReferencesNatively(job, assetId);

const providerTabs = createProviderTabs({
  existingTabProviders: EXISTING_TAB_PROVIDERS, flowTabPatterns: FLOW_TAB_PATTERNS, providerUrls: PROVIDER_URLS,
  inferProviderFromUrl, normalizeProvider, providerAdapter, rememberedStudioChatGptTab, rememberStudioChatGptTab, sendStatus
});
const { activeFlowCustomToolTab, chatGptPageHasFatalShellError, chatGptPageHasRateLimit, findExistingProviderTab, findFlowProjectTab, findExactFlowProjectTab, findOrCreateTab, isFlowCustomToolUrl, isFlowProjectUrl, isProviderErrorPage, providerTabMatches, retryProviderTabAfterErrorPage, waitForTabComplete } = providerTabs;

const flowCustomToolAdapter = createGoogleFlowCustomToolAdapter({
  activeJobs, bridgeIsOpen: bridge.isOpen, customToolActiveJobs, handleContentResult: (data) => handleContentResult(data),
  requestDesktopFlowToolEvaluate, sendStatus, sendToDesktop, waitForTabComplete
});
enqueueCustomToolJob = flowCustomToolAdapter.dispatch;
cancelCustomToolJob = flowCustomToolAdapter.cancel;
probeFlowAppIntake = flowCustomToolAdapter.probeIntake;

const dispatchRuntime = createDispatchRuntime({
  activeJobs, chatGptPageHasFatalShellError, chatGptPageHasRateLimit, contentScripts: CONTENT_SCRIPT_BY_PROVIDER, findOrCreateTab,
  handleContentResult: (data) => handleContentResult(data), humanProviderPause, isSavedChatGptConversationUrl,
  mainWorldScripts: MAIN_WORLD_SCRIPT_BY_PROVIDER, providerMinDispatchIntervalMs: PROVIDER_MIN_DISPATCH_INTERVAL_MS, chatGptMinDispatchIntervalMs: CHATGPT_MIN_DISPATCH_INTERVAL_MS,
  persistActiveJobSnapshot, providerAdapter, providerUrls: PROVIDER_URLS,
  persistedChatGptRateLimitedUntil, providerTabMatches, requestDesktopNativeClick,
  recoverLatestFlowResult: (job, error, allowVisibleFallback) => recoverLatestFlowResult(job, error, allowVisibleFallback),
  requiredChatGptCapabilities: REQUIRED_CHATGPT_ADAPTER_CAPABILITIES, retryProviderTabAfterErrorPage, retryRecoveredCapture,
  sendStatus, sendToDesktop, uploadChatGptReferencesNatively, waitForTabComplete, withTimeout
});
const { dispatchNativeCanvasDrag, dispatchNativeFileChooserUpload, dispatchNativeFileInput, dispatchNativeMouseClick, dispatchNativeTextInsert, dispatchTobyFlowTextInsert, dispatchToContentScript, ensureContentScript, flowJobWasSubmitted, hardResetChatGptDispatch, isFlowAmbiguousCustomToolError, isFlowBridgeUnavailableError, isFlowDefinitiveProviderFailure, isFlowMidComposerFailure, isFlowPageCrashError, isFlowPostSubmitInspectionError, reloadAndRecoverFlowResult, reloadAndRedispatchFlowJob } = dispatchRuntime;

function handleCancelJob(jobId: string): void {
  const job = activeJobs.get(jobId);
  cancelCustomToolJob?.(jobId);
  if (job?.tabId) chrome.tabs.sendMessage(job.tabId, { action: "CANCEL_JOB", jobId }).catch(() => undefined);
  activeJobs.delete(jobId);
}

const resultRuntime = createResultRuntime({
  activeFlowCustomToolTab, activeJobs, completedResultJobs, processingResultJobs, findFlowProjectTab,
  flowResultMetadata, flowStartFrameAssetId, forgetActiveJobSnapshot, inferProviderFromUrl,
  requestDesktopFlowToolEvaluate, sendToDesktop,
  chatGptRateLimitCooldownMs: CHATGPT_RATE_LIMIT_COOLDOWN_MS, ensureContentScript,
  flowJobWasSubmitted, isFlowBridgeUnavailableError, flowRecoveryTimeoutMs: FLOW_RECOVERY_TIMEOUT_MS,
  isFlowAmbiguousCustomToolError, isFlowDefinitiveProviderFailure, isFlowPageCrashError,
  isFlowPostSubmitInspectionError, isSavedChatGptConversationUrl, persistChatGptRateLimit,
  reloadAndRecoverFlowResult, reloadAndRedispatchFlowJob, retryRecoveredCapture, sendStatus,
  waitForTabComplete, withTimeout
});
const handleContentResult = resultRuntime.handleContentResult;
const recoverLatestFlowResult = resultRuntime.recoverLatestFlowResult;

coordinator = createJobCoordinator({
  activeFlowCustomToolTab, activeJobs, bridge, dispatchToContentScript, enqueueCustomToolJob, ensureContentScript,
  extensionSessionId: EXTENSION_SESSION_ID, findFlowProjectTab, findExactFlowProjectTab, findOrCreateTab, flowJobWasSubmitted,
  flowRecoveryTimeoutMs: FLOW_RECOVERY_TIMEOUT_MS, handleCancelJob, handleContentResult, hardResetChatGptDispatch,
  isFlowAmbiguousCustomToolError, isFlowCustomToolUrl, isFlowProjectUrl, isSavedChatGptConversationUrl,
  normalizeProvider, persistActiveJobSnapshot, planProviderAdmission, providerAdapter, providerUrls: PROVIDER_URLS,
  providerVisibilitySnapshot, pruneStaleChatGptJobs, recoverLatestFlowResult, restoreActiveJobSnapshot,
  sendStatus, sendToDesktop, waitForTabComplete, withTimeout
});

registerRuntimeMessageListener({
  activeJobs,
  bridgeStatus: () => ({ connected: bridge.isOpen(), activeJobs: activeJobs.size, availableProviders: Object.keys(PROVIDER_URLS), lastError: bridge.status().lastError, pairing: bridge.status().pairing, providerVisibility: latestProviderVisibility, discovery: bridge.discovery(), capabilities: EXTENSION_CAPABILITIES }),
  providerVisibilitySnapshot,
  dispatchNativeCanvasDrag, dispatchNativeFileChooserUpload, dispatchNativeFileInput, dispatchNativeMouseClick, dispatchNativeTextInsert, dispatchTobyFlowTextInsert,
  enqueueCustomToolJob, ensureBridgeConnection, handleContentResult, probeFlowAppIntake, isSavedChatGptConversationUrl,
  forgetActiveJobSnapshot, persistActiveJobSnapshot, restoreActiveJobSnapshot, sendToDesktop, uploadChatGptReferencesNatively
});

connect();
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  ensureBridgeConnection();
  if (bridge.isOpen()) refreshExtensionStatus();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url || info.status === "complete") {
    void chrome.tabs.get(tabId).then((tab) => {
      if (providerTabMatches("google-flow", tab.url)) refreshExtensionStatus();
    }).catch(() => undefined);
  }
  const crashedJob = Array.from(activeJobs.values()).find((candidate) =>
    candidate.provider === "google-flow" && candidate.tabId === tabId
  );
  const flowCrashVisible = /application error:\s*a client-side exception|aw,\s*snap|err_[a-z_]+/i.test(String(info.title || info.url || ""));
  const unexpectedEditRoute = /\/tools\/flow\/project\/[^/]+\/edit\/[^/]+/i.test(String(info.url || "")) && !/generation was accepted|waiting for google flow result/i.test(crashedJob?.lastStatusMessage || "");
  if (crashedJob && (flowCrashVisible || unexpectedEditRoute) && !crashedJob.flowReloadRecoveryActive) {
    crashedJob.flowReloadRecoveryActive = true;
    const submitWasClicked = /submit button clicked|generation was accepted|waiting for google flow result/i.test(crashedJob.lastStatusMessage || "");
    const recovery = submitWasClicked
      ? reloadAndRecoverFlowResult(crashedJob, "Flow crashed immediately after submit; recover without resubmitting.")
      : reloadAndRedispatchFlowJob(crashedJob, unexpectedEditRoute
        ? "Google Flow left the project composer for an old media edit route before submit."
        : "Google Flow crashed with a client-side exception before submit.");
    void recovery
      .then((recovered) => {
        if (recovered) return;
        sendToDesktop({
          type: "JOB_RESULT",
          jobId: crashedJob.jobId,
          status: "failed_retryable",
          assets: [],
          error: submitWasClicked
            ? "Flow crashed after submit, but strict recovery could not find a video tied to this job. The adapter did not resubmit."
            : "Flow crashed before submit and could not be safely redispatched."
        });
        activeJobs.delete(crashedJob.jobId);
      })
      .finally(() => { crashedJob.flowReloadRecoveryActive = false; });
    return;
  }
  if (info.status !== "complete") return;
  const job = Array.from(activeJobs.values()).find((candidate) =>
    candidate.provider === "google-flow"
    && candidate.tabId === tabId
    && Number(candidate.lastProgress || 0) >= 0.7
    && !candidate.flowReloadRecoveryActive
  );
  if (!job) return;
  job.flowReloadRecoveryActive = true;
  void reloadAndRecoverFlowResult(job, "Flow tab reloaded after submit; recover the accepted result without resubmitting.")
    .then((recovered) => {
      if (recovered) return;
      sendToDesktop({
        type: "JOB_RESULT",
        jobId: job.jobId,
        status: "failed_retryable",
        assets: [],
        error: "Flow reloaded after submit, but strict recovery could not tie a completed video to this job. The adapter did not resubmit."
      });
      activeJobs.delete(job.jobId);
    })
    .catch((error) => {
      sendToDesktop({
        type: "JOB_RESULT",
        jobId: job.jobId,
        status: "failed_retryable",
        assets: [],
        error: `Flow post-submit reload recovery failed without resubmitting: ${error instanceof Error ? error.message : String(error)}`
      });
      activeJobs.delete(job.jobId);
    });
});
