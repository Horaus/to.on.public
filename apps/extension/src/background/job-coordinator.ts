import type { StudioJob } from "./job-types";
import { shouldUseFlowCustomTool } from "./flow-executor-selection.cjs";
import type { BridgeRuntime } from "./bridge-runtime";
import type { ProviderAdapter } from "./adapters/types";
import type { ProviderAdmission } from "./coordinator";

type JobCoordinatorDependencies = {
  activeFlowCustomToolTab: () => Promise<chrome.tabs.Tab | undefined>; activeJobs: Map<string, StudioJob>; bridge: BridgeRuntime; extensionSessionId: string; flowRecoveryTimeoutMs: number; providerUrls: Record<string, string>;
  dispatchToContentScript: (job: StudioJob) => Promise<void>; enqueueCustomToolJob: (job: StudioJob, tab: chrome.tabs.Tab) => Promise<void>; ensureContentScript: (job: StudioJob) => Promise<void>;
  findFlowProjectTab: () => Promise<{ tab?: chrome.tabs.Tab; activeFlowTab?: chrome.tabs.Tab; flowTabCount: number; projectTabCount: number; customToolTabCount: number; urls: string[] }>; findExactFlowProjectTab: (url: string) => Promise<chrome.tabs.Tab>; findOrCreateTab: (url: string, provider?: string, jobId?: string) => Promise<chrome.tabs.Tab>;
  flowJobWasSubmitted: (job?: StudioJob) => boolean; handleCancelJob: (jobId: string) => void; handleContentResult: (data: Record<string, unknown>) => Promise<void>; hardResetChatGptDispatch: (job: StudioJob) => Promise<void>;
  isFlowAmbiguousCustomToolError: (error: unknown) => boolean; isFlowCustomToolUrl: (url?: string) => boolean; isFlowProjectUrl: (url?: string) => boolean; isSavedChatGptConversationUrl: (value: unknown) => value is string;
  normalizeProvider: (provider: string) => string; persistActiveJobSnapshot: (job: StudioJob) => Promise<void>; planProviderAdmission: (job: StudioJob, active: StudioJob[], known: boolean) => ProviderAdmission; providerAdapter: (provider: string) => ProviderAdapter | undefined;
  providerVisibilitySnapshot: () => Promise<Record<string, unknown>>; pruneStaleChatGptJobs: () => void; recoverLatestFlowResult: (job: StudioJob, error: string, allowVisibleFallback?: boolean) => Promise<boolean>; restoreActiveJobSnapshot: (jobId: string) => Promise<StudioJob | undefined>;
  sendStatus: (jobId: string, status: string, message: string, progress?: number) => void; sendToDesktop: (message: Record<string, unknown>) => void; waitForTabComplete: (tabId: number, timeoutMs?: number) => Promise<chrome.tabs.Tab>; withTimeout: <T>(promise: Promise<T>, timeoutMs: number, label: string) => Promise<T>;
};

let activeFlowCustomToolTab: JobCoordinatorDependencies["activeFlowCustomToolTab"];
let activeJobs: JobCoordinatorDependencies["activeJobs"];
let bridge: JobCoordinatorDependencies["bridge"];
let dispatchToContentScript: JobCoordinatorDependencies["dispatchToContentScript"];
let enqueueCustomToolJob: JobCoordinatorDependencies["enqueueCustomToolJob"];
let ensureContentScript: JobCoordinatorDependencies["ensureContentScript"];
let findFlowProjectTab: JobCoordinatorDependencies["findFlowProjectTab"];
let findExactFlowProjectTab: JobCoordinatorDependencies["findExactFlowProjectTab"];
let findOrCreateTab: JobCoordinatorDependencies["findOrCreateTab"];
let flowJobWasSubmitted: JobCoordinatorDependencies["flowJobWasSubmitted"];
let handleCancelJob: JobCoordinatorDependencies["handleCancelJob"];
let handleContentResult: JobCoordinatorDependencies["handleContentResult"];
let hardResetChatGptDispatch: JobCoordinatorDependencies["hardResetChatGptDispatch"];
let isFlowAmbiguousCustomToolError: JobCoordinatorDependencies["isFlowAmbiguousCustomToolError"];
let isFlowCustomToolUrl: JobCoordinatorDependencies["isFlowCustomToolUrl"];
let isFlowProjectUrl: JobCoordinatorDependencies["isFlowProjectUrl"];
let isSavedChatGptConversationUrl: JobCoordinatorDependencies["isSavedChatGptConversationUrl"];
// Avoid re-selecting the same visual asset in a reused ChatGPT conversation.
// The key is tab + conversation/session so a deliberate new chat can upload again.
const uploadedChatGptReferences = new Map<string, Set<string>>();
let normalizeProvider: JobCoordinatorDependencies["normalizeProvider"];
let persistActiveJobSnapshot: JobCoordinatorDependencies["persistActiveJobSnapshot"];
let planProviderAdmission: JobCoordinatorDependencies["planProviderAdmission"];
let providerAdapter: JobCoordinatorDependencies["providerAdapter"];
let providerVisibilitySnapshot: JobCoordinatorDependencies["providerVisibilitySnapshot"];
let pruneStaleChatGptJobs: JobCoordinatorDependencies["pruneStaleChatGptJobs"];
let recoverLatestFlowResult: JobCoordinatorDependencies["recoverLatestFlowResult"];
let restoreActiveJobSnapshot: JobCoordinatorDependencies["restoreActiveJobSnapshot"];
let sendStatus: JobCoordinatorDependencies["sendStatus"];
let sendToDesktop: JobCoordinatorDependencies["sendToDesktop"];
let waitForTabComplete: JobCoordinatorDependencies["waitForTabComplete"];
let withTimeout: JobCoordinatorDependencies["withTimeout"];
let EXTENSION_SESSION_ID: string;
let FLOW_RECOVERY_TIMEOUT_MS: number;
let PROVIDER_URLS: Record<string, string>;
const queuedChatGptJobs = new Map<string, StudioJob>();
const queuedChatGptSince = new Map<string, number>();
let chatGptQueueTimer: ReturnType<typeof setTimeout> | undefined;
const CHATGPT_QUEUE_WAIT_STALE_MS = 5 * 60_000;

export function createJobCoordinator(deps: JobCoordinatorDependencies) {
  ({ activeFlowCustomToolTab, activeJobs, bridge, dispatchToContentScript, enqueueCustomToolJob, ensureContentScript, extensionSessionId: EXTENSION_SESSION_ID, findFlowProjectTab, findExactFlowProjectTab, findOrCreateTab, flowJobWasSubmitted, flowRecoveryTimeoutMs: FLOW_RECOVERY_TIMEOUT_MS, handleCancelJob, handleContentResult, hardResetChatGptDispatch, isFlowAmbiguousCustomToolError, isFlowCustomToolUrl, isFlowProjectUrl, isSavedChatGptConversationUrl, normalizeProvider, persistActiveJobSnapshot, planProviderAdmission, providerAdapter, providerUrls: PROVIDER_URLS, providerVisibilitySnapshot, pruneStaleChatGptJobs, recoverLatestFlowResult, restoreActiveJobSnapshot, sendStatus, sendToDesktop, waitForTabComplete, withTimeout } = deps);
  return { handleDesktopMessage, handleRecoverFlowResult, handleRecoverJob, handleRunJob, retryRecoveredCapture, uploadChatGptReferencesNatively };
}

async function handleDesktopMessage(message: Record<string, unknown>): Promise<void> {
  if (bridge.settleNativeResult(message)) return;
  switch (message.type) {
    case "PING":
      sendToDesktop({
        type: "PONG",
        nonce: message.nonce,
        sessionId: EXTENSION_SESSION_ID,
        timestamp: Date.now(),
        extensionVersion: chrome.runtime.getManifest().version,
        activeProviders: Object.keys(PROVIDER_URLS),
        providerVisibility: await providerVisibilitySnapshot()
      });
      break;
    case "RUN_JOB":
      sendToDesktop({ type: "JOB_ACK", jobId: message.jobId, sessionId: EXTENSION_SESSION_ID, receivedAt: Date.now() });
      try {
        await handleRunJob(message as unknown as StudioJob & { type: string });
      } catch (error) {
        // JOB_ACK is emitted before dispatch by protocol design. Never leave
        // the desktop job parked in `opening_provider` when admission or
        // routing throws synchronously after that ACK; surface the exact
        // exception and release the in-memory slot.
        const jobId = String(message.jobId || "");
        activeJobs.delete(jobId);
        sendToDesktop({ type: "JOB_RESULT", jobId, status: "failed_retryable", assets: [], error: `Extension could not start the provider job after ACK: ${error instanceof Error ? error.message : String(error)}` });
      }
      break;
    case "RECOVER_JOB":
      await handleRecoverJob(message);
      break;
    case "HARD_RESET_CHATGPT_DISPATCH": {
      const jobId = String(message.jobId || "");
      const job = activeJobs.get(jobId) || await restoreActiveJobSnapshot(jobId);
      if (!job || job.provider !== "chatgpt") {
        sendToDesktop({ type: "JOB_RESULT", jobId, status: "failed_retryable", assets: [], error: "ChatGPT hard reset could not recover the active extension job." });
        break;
      }
      void hardResetChatGptDispatch(job).catch((error) => {
        sendToDesktop({ type: "JOB_RESULT", jobId, status: "failed_retryable", assets: [], error: `ChatGPT cache-bypassing hard reset failed without another retry: ${error instanceof Error ? error.message : String(error)}` });
        activeJobs.delete(jobId);
      });
      break;
    }
    case "RECOVER_FLOW_RESULT":
      await handleRecoverFlowResult(message);
      break;
    case "CANCEL_JOB":
      queuedChatGptJobs.delete(String(message.jobId ?? ""));
      queuedChatGptSince.delete(String(message.jobId ?? ""));
      handleCancelJob(String(message.jobId ?? ""));
      break;
    case "QUERY_STATUS":
      sendToDesktop({
        type: "EXTENSION_STATUS",
        connected: bridge.isOpen(),
        version: chrome.runtime.getManifest().version,
        activeJobs: activeJobs.size,
        availableProviders: Object.keys(PROVIDER_URLS),
        lastError: bridge.status().lastError,
        providerVisibility: await providerVisibilitySnapshot()
      });
      break;
  }
}

function nativeUploadCandidates(job: StudioJob, assetId: string | undefined, uploaded: Set<string>) {
  return (job.references || [])
    .filter((reference) => !assetId || reference.assetId === assetId)
    .filter((reference) => !uploaded.has(reference.assetId));
}

async function setChatGptNativeFiles(target: chrome.debugger.Debuggee, files: string[]) {
  await chrome.debugger.attach(target, "1.3");
  try {
    const documentNode = await chrome.debugger.sendCommand(target, "DOM.getDocument", { depth: -1, pierce: true }) as { root?: { nodeId?: number } };
    const rootNodeId = documentNode.root?.nodeId;
    if (!rootNodeId) throw new Error("ChatGPT document root is unavailable.");
    const query = await chrome.debugger.sendCommand(target, "DOM.querySelector", { nodeId: rootNodeId, selector: "#upload-files:not([disabled])" }) as { nodeId?: number };
    if (!query.nodeId) throw new Error("Enabled ChatGPT #upload-files input was not found.");
    await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", { nodeId: query.nodeId, files: [] });
    await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", { nodeId: query.nodeId, files });
    await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
      expression: `(() => { const input = document.querySelector('#upload-files:not([disabled])'); if (!input) return false; input.dispatchEvent(new Event('input', { bubbles: true, composed: true })); input.dispatchEvent(new Event('change', { bubbles: true, composed: true })); return true; })()`,
      returnByValue: true
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function uploadChatGptReferencesNatively(job: StudioJob, assetId?: string): Promise<void> {
  if (!job.tabId) throw new Error("ChatGPT tab is unavailable for native reference upload.");
  if (String(job.settings?.referenceTransport || "") === "conversation_context") return;
  const conversationKey = `${job.tabId}:${String(job.conversationUrl || job.settings?.sessionKey || "default")}`;
  const uploaded = uploadedChatGptReferences.get(conversationKey) || new Set<string>();
  const candidates = nativeUploadCandidates(job, assetId, uploaded);
  const files = candidates.map((reference) => reference.filePath).filter((value): value is string => Boolean(value));
  if (files.length === 0) throw new Error("No local reference paths are available for native upload.");
  await setChatGptNativeFiles({ tabId: job.tabId }, files);
  candidates.forEach((reference) => uploaded.add(reference.assetId));
  uploadedChatGptReferences.set(conversationKey, uploaded);
}

async function handleRecoverFlowResult(message: Record<string, unknown>): Promise<void> {
  const jobId = String(message.jobId || "");
  if (!jobId) return;
  const job: StudioJob = {
    jobId,
    provider: "google-flow",
    task: String(message.task || "image_to_video"),
    prompt: String(message.prompt || ""),
    references: Array.isArray(message.references) ? message.references as StudioJob["references"] : [],
    settings: typeof message.settings === "object" && message.settings ? message.settings as Record<string, unknown> : {},
    download: { auto: true, filenameTemplate: `google-flow-${jobId}` }
  };
  activeJobs.set(jobId, job);
  sendStatus(jobId, "downloading", "Recovering only strict current-job Google Flow video media...", 0.9);
  try {
    // A late result from the Relay lives in the published custom-tool tab,
    // not in the Flow workspace tab. Prefer that exact runtime during recovery
    // so a valid in-memory COMPLETED result can be read before any workspace
    // navigation destroys it. Fall back to the workspace only when no runtime
    // for the requested project is available.
    const expectedWorkspaceUrl = String(job.settings?.providerWorkspaceUrl || message.providerWorkspaceUrl || "");
    const projectIdFromUrl = (value: string) => value.match(/\/project\/([^/]+)/i)?.[1] || "";
    const expectedProjectId = projectIdFromUrl(expectedWorkspaceUrl);
    const runtimeTab = await activeFlowCustomToolTab();
    const runtimeProjectId = projectIdFromUrl(String(runtimeTab?.url || ""));
    const tab = runtimeTab?.id && (!expectedProjectId || runtimeProjectId === expectedProjectId)
      ? runtimeTab
      : await findOrCreateTab(PROVIDER_URLS["google-flow"], "google-flow", jobId);
    if (!tab.id) throw new Error("Flow project tab has no id");
    job.tabId = tab.id;
    await persistActiveJobSnapshot(job);
    const recovered = await withTimeout(
      recoverLatestFlowResult(job, String(message.originalError || "manual recovery"), true),
      FLOW_RECOVERY_TIMEOUT_MS,
      "Google Flow recovery"
    );
    if (!recovered) {
      const originalError = String(message.originalError || "").trim();
      const conciseError = originalError.replace(/^(?:No recoverable Google Flow video was found for this job\.\s*Original provider failure:\s*)+/i, "").trim();
      sendToDesktop({
        type: "JOB_RESULT",
        jobId,
        status: "failed_retryable",
        assets: [],
        error: originalError
          ? `No recoverable Google Flow video was found for this job. Original provider failure: ${conciseError || originalError}`
          : "No recoverable Google Flow video was found in the current project tab."
      });
      activeJobs.delete(jobId);
    }
  } catch (error) {
    sendToDesktop({
      type: "JOB_RESULT",
      jobId,
      status: "failed_retryable",
      assets: [],
      error: `Cannot recover Google Flow result: ${error instanceof Error ? error.message : String(error)}`
    });
    activeJobs.delete(jobId);
  }
}

async function handleRecoverJob(message: Record<string, unknown>): Promise<void> {
  const jobId = String(message.jobId || "");
  const conversationUrl = String(message.conversationUrl || "");
  if (!jobId || !conversationUrl.startsWith("https://chatgpt.com/")) {
    sendToDesktop({ type: "JOB_RESULT", jobId, status: "failed_retryable", assets: [], error: "No saved ChatGPT conversation URL is available." });
    return;
  }
  const job: StudioJob = {
    jobId,
    provider: "chatgpt",
    task: String(message.task || "connection_test"),
    prompt: "",
    conversationUrl,
    references: [],
    settings: { resultType: String(message.resultType || "") },
    download: { auto: false, filenameTemplate: "recovered-response" }
  };
  activeJobs.set(jobId, job);
  sendStatus(jobId, "opening_provider", "Opening the saved ChatGPT conversation...", 0.2);
  try {
    const tab = await findOrCreateTab(conversationUrl);
    if (!tab.id) throw new Error("Recovered tab has no id");
    const recoveredTabId = tab.id;
    job.tabId = recoveredTabId;
    void retryRecoveredCapture(job, recoveredTabId);
  } catch (error) {
    sendToDesktop({ type: "JOB_RESULT", jobId, status: "failed_retryable", assets: [], error: `Cannot recover conversation: ${error instanceof Error ? error.message : String(error)}` });
    activeJobs.delete(jobId);
  }
}

async function retryRecoveredCapture(job: StudioJob, tabId: number): Promise<void> {
  const startedAt = Date.now();
  let lastReloadAt = 0;
  const action = recoveryCaptureAction(job);
  const recoveryTimeoutMs = action === "CAPTURE_LATEST_CHATGPT_TEXT_V2" ? 60_000 : 15 * 60 * 1000;
  while (activeJobs.has(job.jobId) && Date.now() - startedAt < recoveryTimeoutMs) {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      sendStatus(job.jobId, "waiting_manual_action", "The saved ChatGPT tab is closed. Use Recover again to reopen it.", 0.2);
      return;
    }
    lastReloadAt = await performRecoveryCapture(job, tabId, tab, action, lastReloadAt);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (activeJobs.has(job.jobId)) {
    sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: "Recovery timed out before the saved ChatGPT result became available." });
    activeJobs.delete(job.jobId);
  }
}

function recoveryCaptureAction(job: StudioJob) {
  return job.task === "image" || job.task === "text_to_image" || job.settings?.resultType === "image"
    ? "CAPTURE_CHATGPT_IMAGE_FOR_JOB_V2"
    : "CAPTURE_LATEST_CHATGPT_TEXT_V2";
}

async function performRecoveryCapture(job: StudioJob, tabId: number, tab: chrome.tabs.Tab, action: string, lastReloadAt: number) {
  if (isSavedChatGptConversationUrl(job.conversationUrl) && tab.url !== job.conversationUrl) {
    sendStatus(job.jobId, "opening_provider", "Returning to the exact saved ChatGPT conversation before checking its result...", 0.22);
    await chrome.tabs.update(tabId, { url: job.conversationUrl });
    await waitForTabComplete(tabId, 45_000);
    return Date.now();
  }
  try {
    if (tab.status === "complete" && tab.url?.startsWith("https://chatgpt.com/")) {
      await ensureContentScript(job);
      await chrome.tabs.sendMessage(tabId, { action, jobId: job.jobId, task: job.task, expectedConversationUrl: job.conversationUrl });
    } else sendStatus(job.jobId, "waiting_manual_action", "Waiting for the saved ChatGPT conversation to open. Sign in if required.", 0.2);
  } catch (error) {
    if (isSavedChatGptConversationUrl(job.conversationUrl) && Date.now() - lastReloadAt >= 15_000) {
      sendStatus(job.jobId, "opening_provider", `ChatGPT page is not readable yet. Reloading the saved conversation and checking again: ${error instanceof Error ? error.message : String(error)}`, 0.24);
      await chrome.tabs.update(tabId, { url: job.conversationUrl }).catch(() => undefined);
      await waitForTabComplete(tabId, 45_000).catch(() => undefined);
      return Date.now();
    }
    sendStatus(job.jobId, "generating", "Saved ChatGPT conversation is still loading; checking again without resubmitting.", 0.3);
  }
  return lastReloadAt;
}


function buildStudioJob(message: StudioJob & { type: string }): StudioJob {
  const settings = message.task === "image_to_video"
    ? {
      ...(message.settings || {}),
      resultType: "video",
      mode: "video",
      providerMode: "video",
      flowResultType: "video",
      // A storyboard/keyframe I2V request must use Flow's start-frame
      // workflow so the selected image is the exact opening frame. Preserve
      // an explicit components request for loose visual-reference jobs.
      flowVideoMode: message.settings?.flowVideoMode || "frames",
      sourceMode: message.settings?.sourceMode || "frames",
    }
    : message.settings;
  const conversationUrl = message.conversationUrl || (typeof settings?.providerWorkspaceUrl === "string" ? settings.providerWorkspaceUrl : undefined);
  return { jobId: message.jobId, provider: normalizeProvider(message.provider), task: message.task, prompt: message.prompt, conversationUrl, references: message.references, settings, download: message.download };
}

function admitJob(job: StudioJob): boolean {
  if (job.provider === "chatgpt") pruneStaleChatGptJobs();
  const admission = planProviderAdmission(job, Array.from(activeJobs.values()), Boolean(providerAdapter(job.provider)));
  if (admission.action === "duplicate") {
    const active = activeJobs.get(admission.activeJobId);
    sendStatus(job.jobId, active?.lastStatus || "opening_provider", "Duplicate envelope ignored; this provider job is already active.", active?.lastProgress || 0.1); return false;
  }
  if (admission.action === "reject_serial") {
    // ChatGPT is intentionally single-flight, but a second project should wait
    // behind the active tab instead of becoming a terminal retry error. Keep the
    // envelope in the extension so YOLO can continue once the prior tab settles.
    queuedChatGptJobs.set(job.jobId, job);
    queuedChatGptSince.set(job.jobId, Date.now());
    sendStatus(job.jobId, "opening_provider", "Waiting for the previous ChatGPT job to finish; no second tab or submission was created.", 0.1);
    scheduleChatGptQueueFlush();
    return false;
  }
  if (admission.action === "reject_unknown") { sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_manual", assets: [], error: `Unknown provider: ${job.provider}` }); return false; }
  job.lastActivityAt = Date.now(); activeJobs.set(job.jobId, job); sendStatus(job.jobId, "opening_provider", `Opening ${job.provider}...`, 0.1); return true;
}

type FlowProjectSnapshot = Awaited<ReturnType<JobCoordinatorDependencies["findFlowProjectTab"]>>;

async function bindFlowWorkspace(job: StudioJob, targetUrl: string, flow: FlowProjectSnapshot): Promise<void> {
  const workspaceTab = flow.tab && !isFlowCustomToolUrl(flow.tab.url) ? flow.tab : undefined;
  if (workspaceTab?.url && isFlowProjectUrl(workspaceTab.url)) {
    try {
      const workspaceUrl = new URL(workspaceTab.url);
      workspaceUrl.pathname = workspaceUrl.pathname
        .replace(/\/tool-version\/[^/]+\/?$/i, "")
        .replace(/\/tool\/[^/]+\/?$/i, "")
        .replace(/\/edit\/[^/]+\/?$/i, "")
        .replace(/\/+$/, "");
      workspaceUrl.search = "";
      workspaceUrl.hash = "";
      if (/\/project\/[^/]+$/i.test(workspaceUrl.pathname)) {
        const exactWorkspaceUrl = workspaceUrl.toString();
        job.conversationUrl = exactWorkspaceUrl;
        job.settings = { ...(job.settings || {}), providerWorkspaceUrl: exactWorkspaceUrl };
        await persistActiveJobSnapshot(job);
      }
    } catch { /* retain the existing route when the tab URL is malformed */ }
  }
  if (flow.tab?.id && !isFlowCustomToolUrl(flow.tab.url)) return;
  const requestedWorkspace = String(job.settings?.flowProjectUrl || job.settings?.providerWorkspaceUrl || job.providerWorkspaceUrl || "").trim();
  const activeRuntimeUrl = isFlowCustomToolUrl(flow.activeFlowTab?.url) ? String(flow.activeFlowTab?.url || "") : "";
  let baseUrl = /\/project\/[^/]+/i.test(requestedWorkspace)
    ? requestedWorkspace
    : /\/project\/[^/]+/i.test(activeRuntimeUrl)
    ? activeRuntimeUrl
    : /\/project\/[^/]+/i.test(targetUrl)
        ? targetUrl
        : String(flow.tab?.url || flow.activeFlowTab?.url || targetUrl);
  try {
    const parsed = new URL(baseUrl);
    parsed.pathname = parsed.pathname.replace(/\/tool-version\/[^/]+\/?$/i, "").replace(/\/tool\/[^/]+\/?$/i, "").replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    baseUrl = parsed.toString();
  } catch {}
  try {
    const workspaceUrl = new URL(baseUrl);
    if (/\/project\/[^/]+$/i.test(workspaceUrl.pathname)) {
      const exactWorkspaceUrl = workspaceUrl.toString();
      job.conversationUrl = exactWorkspaceUrl;
      job.settings = { ...(job.settings || {}), flowProjectUrl: exactWorkspaceUrl, providerWorkspaceUrl: exactWorkspaceUrl };
      await persistActiveJobSnapshot(job);
    }
  } catch { /* retain the existing route when the derived URL is malformed */ }
  const workspace = await chrome.tabs.create({ url: baseUrl, active: false });
  if (workspace.id) await waitForTabComplete(workspace.id, 20_000).catch(() => undefined);
}

function scheduleChatGptQueueFlush(): void {
  if (chatGptQueueTimer || queuedChatGptJobs.size === 0) return;
  chatGptQueueTimer = setTimeout(() => {
    chatGptQueueTimer = undefined;
    void flushChatGptQueue();
  }, 3000);
}

async function flushChatGptQueue(): Promise<void> {
  if (queuedChatGptJobs.size === 0) return;
  pruneStaleChatGptJobs();
  const now = Date.now();
  for (const [jobId, queued] of queuedChatGptJobs) {
    const queuedAt = queuedChatGptSince.get(jobId) || now;
    if (now - queuedAt <= CHATGPT_QUEUE_WAIT_STALE_MS) continue;
    queuedChatGptJobs.delete(jobId);
    queuedChatGptSince.delete(jobId);
    sendToDesktop({
      type: "JOB_RESULT", jobId, status: "failed_retryable", assets: [],
      error: "ChatGPT queue wait exceeded 5 minutes; the older provider job did not release the single-flight slot. Retry after refreshing the provider tab."
    });
  }
  if (queuedChatGptJobs.size === 0) return;
  if (Array.from(activeJobs.values()).some((job) => job.provider === "chatgpt")) {
    scheduleChatGptQueueFlush();
    return;
  }
  const next = queuedChatGptJobs.values().next().value as StudioJob | undefined;
  if (!next) return;
  queuedChatGptJobs.delete(next.jobId);
  queuedChatGptSince.delete(next.jobId);
  await startAdmittedJob(next);
  if (queuedChatGptJobs.size > 0) scheduleChatGptQueueFlush();
}

async function dispatchCustomFlowJob(job: StudioJob, targetUrl: string): Promise<boolean> {
  if (job.provider !== "google-flow" || job.task !== "image_to_video") return false;
  // Native Flow v2 is the default for new jobs. The custom app remains an
  // explicit opt-in so pending/locked app work cannot capture native jobs.
  if (!shouldUseFlowCustomTool(job)) {
    sendStatus(job.jobId, "opening_provider", "Using the Flow UI-direct v2 executor; Studio Shot Bridge is bypassed for this job.", 0.11);
    return false;
  }
  // The runtime tool and the project workspace have different jobs: the
  // runtime hosts Studio Shot Bridge, while the base project owns Flow's
  // media picker. Never repurpose a custom-tool tab as the workspace when the
  // original base tab is missing; that leaves two runtime tabs and makes the
  // reference relay impossible.
  const flow = await findFlowProjectTab();
  sendStatus(job.jobId, "opening_provider", `Flow tab scan: ${flow.flowTabCount} tabs, ${flow.projectTabCount} project, ${flow.customToolTabCount} custom-tool.`, 0.105);
  // A runtime-only topology is valid, but historical jobs may still carry
  // a workspace URL from an older Flow project. An explicit workspace route
  // is authoritative; only fall back to the active runtime project when the
  // job has no requested route, preventing cross-project picker retargeting.
  // The provider catalog URL (`/tools/flow`) is only a landing page; never
  // persist it as the job's project context.
  await bindFlowWorkspace(job, targetUrl, flow);
  // Never bind a job to Flow's editable `/tool/` draft. It looks like a
  // custom-tool tab but cannot be used as a stable generation runtime; using
  // it starts the watchdog/recovery path before any provider submission.
  let tab = await activeFlowCustomToolTab();
  if (tab && !/(?:\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+|\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1))(?:[/?#]|$)/i.test(String(tab.url || ""))) {
    sendStatus(job.jobId, "opening_provider", "Flow đang mở bản DRAFT /tool/; bỏ qua tab chỉnh sửa và chỉ chấp nhận runtime /tool-version/ hoặc /shared/tool/ đã publish.", 0.108);
    tab = undefined;
  }
  sendStatus(job.jobId, "opening_provider", `Flow runtime candidate: ${tab?.url || "none"}.`, 0.108);
  if (!tab) {
    // The provider adapter's targetUrl is the Flow catalog landing page, not
    // a published Studio Shot Bridge runtime. Never navigate the user's
    // workspace to that catalog URL: doing so destroys the picker tab and
    // leaves a custom-tool job stuck in opening_provider. A custom executor
    // may only open a route that was explicitly observed/persisted as a
    // published `/tool-version/` URL; otherwise require the user to open the
    // shared Bridge through Flow's UI first.
    const savedRuntimeUrl = job.flowRuntimeUrl || String(job.settings?.flowRuntimeUrl || "");
    if (!isFlowCustomToolUrl(savedRuntimeUrl)) {
      throw new Error("Studio Shot Bridge runtime is not open. In Flow, open Công cụ → PDL Studio Shot Bridge and open the published /tool-version/ runtime, then retry this shot.");
    }
    const refreshed = await findFlowProjectTab(); const reusable = refreshed.tab || refreshed.activeFlowTab;
    if (!reusable?.id) throw new Error("Open one signed-in Google Flow project tab before running Studio Shot Bridge.");
    sendStatus(job.jobId, "opening_provider", "Opening Studio Shot Bridge in the existing signed-in Flow tab...", 0.11);
    tab = await chrome.tabs.update(reusable.id, { url: savedRuntimeUrl });
    try {
      await waitForTabComplete(reusable.id, 20_000);
    } catch {
      throw new Error("Studio Shot Bridge runtime did not finish loading within 20 seconds. Keep the Flow workspace and runtime tabs open, then reload the runtime tool before retrying.");
    }
    tab = await chrome.tabs.get(reusable.id);
    if (!isFlowCustomToolUrl(tab.url)) throw new Error("Google Flow is open, but Studio Shot Bridge is not attached. Open the shared Studio Shot Bridge tool in this signed-in Flow workspace, then retry.");
  }
  // Keep the published runtime route independently from the base project
  // workspace. Flow may navigate the runtime tab back to `/project/...` after
  // submit; retries must never redispatch a video job into that base route.
  if (tab.url && /(?:\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+|\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1))(?:[/?#]|$)/i.test(tab.url)) {
    job.flowRuntimeUrl = tab.url;
  }
  // Reloading an unpacked extension removes content-script receivers from
  // already-open Flow tabs while leaving the runtime tab visibly intact.
  // Custom-tool execution talks to that receiver for PRIME_FLOW_MEDIA, so
  // probe/inject it before enqueueing the job instead of failing with the
  // opaque "Receiving end does not exist" error.
  if (tab.id) {
    job.tabId = tab.id;
    await ensureContentScript(job);
  }
  sendStatus(job.jobId, "submitting", "Waiting for the previous Studio Shot Bridge command to release the Flow tab...", 0.12);
  await enqueueCustomToolJob(job, tab);
  return true;
}

async function openProviderJob(job: StudioJob, targetUrl: string): Promise<void> {
  if (job.provider === "google-flow" && job.task === "image_to_video" && !job.conversationUrl) {
    throw new Error("No signed-in Google Flow project workspace was observed. Open the target project in one Flow tab, then run this shot again.");
  }
  if (job.provider === "google-flow" && job.task === "image_to_video" && job.conversationUrl) {
    // UI-direct Flow is locked to the project captured at admission. Never
    // fall back to the catalog or navigate an unrelated Flow tab: doing so
    // loses the project composer and makes the job appear stuck in opening.
    const tab = await findExactFlowProjectTab(job.conversationUrl);
    if (!tab.id) throw new Error("The locked Google Flow project tab has no browser id.");
    await persistProviderTab(job, tab);
    return dispatchToContentScript(job);
  }
  let tab = await findOrCreateTab(job.conversationUrl || targetUrl, job.provider, job.jobId);
  if (!tab.id) throw new Error("Provider tab has no id");
  tab = await prepareFreshConversation(job, tab, targetUrl);
  await persistProviderTab(job, tab);
  if (tab.status === "complete") return dispatchToContentScript(job);
  // ChatGPT is an SPA and may keep the tab in `loading` while its composer
  // and content bridge are already usable. Do not hold the desktop pipeline
  // behind the browser's unreliable loading flag; probe/dispatch directly.
  if (job.provider === "chatgpt") {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return dispatchToContentScript(job);
  }
  // Never leave a job in OPENING_PROVIDER forever when the browser tab stops
  // emitting onUpdated events (a common failure after a provider crash or a
  // stale content-script lifecycle). A bounded wait lets the normal retryable
  // failure path preserve history and release YOLO's provider lane.
  await waitForProviderTab(job, tab.id!);
}

async function prepareFreshConversation(job: StudioJob, tab: chrome.tabs.Tab, targetUrl: string) {
  if (job.provider !== "chatgpt" || !job.settings?.newConversation || job.conversationUrl || !tab.id) return tab;
  sendStatus(job.jobId, "opening_provider", "Opening a clean ChatGPT conversation for this production session...", 0.16);
  if (tab.url !== targetUrl) tab = await chrome.tabs.update(tab.id, { url: targetUrl });
  job.settings = { ...job.settings, newConversation: false, freshConversationNavigated: true };
  return tab;
}

async function persistProviderTab(job: StudioJob, tab: chrome.tabs.Tab) {
  job.tabId = tab.id;
  if (job.provider === "google-flow" && isFlowProjectUrl(tab.url)) {
    job.conversationUrl = String(tab.url).replace(/\/edit\/.*$/i, "");
    job.settings = { ...(job.settings || {}), providerWorkspaceUrl: job.conversationUrl };
  }
  await persistActiveJobSnapshot(job);
}

async function waitForProviderTab(job: StudioJob, tabId: number): Promise<void> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await waitForTabComplete(tabId, 60_000);
  } catch (error) {
    // ChatGPT can keep reporting `loading` while its SPA is already usable.
    // Probe the live content bridge instead of leaving the desktop job stuck
    // in OPENING_PROVIDER until the watchdog fires.
    const current = await chrome.tabs.get(tabId).catch(() => undefined);
    if (job.provider !== "chatgpt" || !current?.url?.startsWith("https://chatgpt.com/")) throw error;
    sendStatus(job.jobId, "submitting", "ChatGPT tab reports loading; probing the live adapter before retrying.", 0.24);
    await dispatchToContentScript(job);
    return;
  }
  if (tab.status !== "complete") {
    const current = await chrome.tabs.get(tabId).catch(() => undefined);
    if (job.provider !== "chatgpt" || !current?.url?.startsWith("https://chatgpt.com/")) throw new Error(`Timed out waiting for ${job.provider} provider tab to finish loading.`);
    sendStatus(job.jobId, "submitting", "ChatGPT tab reports loading; probing the live adapter before retrying.", 0.24);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await dispatchToContentScript(job);
}

async function handleRunFailure(job: StudioJob, error: unknown): Promise<void> {
  const flowVideo = job.provider === "google-flow" && job.task === "image_to_video";
  const message = error instanceof Error ? error.message : String(error);
  if (flowVideo && flowJobWasSubmitted(job)) {
    sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: `Google Flow generation failed after preflight and provider authorization. Prompt delivery and Studio Shot Bridge succeeded; Flow did not return a video. This can be caused by provider capacity, quota, safety, or model availability. Wait for the provider condition to clear, or change the authorized Flow workspace/model, then retry this shot without rewriting it. Technical detail: ${message}` }); activeJobs.delete(job.jobId); return;
  }
  if (flowVideo && isFlowAmbiguousCustomToolError(error)) {
    await handleContentResult({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: `Studio Shot Bridge lost its control callback after the Flow command may have been accepted. Recovering the strict current-job result without resubmitting: ${message}` }); return;
  }
  if (job.provider === "chatgpt" && (job.task === "image" || job.task === "text_to_image") && job.tabId && isSavedChatGptConversationUrl(job.conversationUrl)) {
    job.chatGptImageRecoveryActive = true; sendStatus(job.jobId, "opening_provider", `ChatGPT tab became unreadable after submission. Reloading ${job.conversationUrl} and checking for the image before failing...`, 0.2); void retryRecoveredCapture(job, job.tabId); return;
  }
  sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: /Open one signed-in blank ChatGPT tab first/i.test(message) ? "failed_manual" : "failed_retryable", assets: [], error: `Failed to open provider tab: ${message}` });
  activeJobs.delete(job.jobId);
}

async function startAdmittedJob(job: StudioJob): Promise<void> {
  activeJobs.set(job.jobId, job);
  job.lastActivityAt = Date.now();
  sendStatus(job.jobId, "opening_provider", `Opening ${job.provider}...`, 0.1);
  const targetUrl = providerAdapter(job.provider)!.targetUrl;
  try {
    // A Flow job may carry the exact workspace selected by the user/app. Treat
    // it as authoritative so an unrelated active Flow tab cannot steal the
    // job and silently route the composer into an older project.
    if (job.provider === "google-flow" && job.task === "image_to_video" && !job.conversationUrl) {
      const requestedWorkspace = String(job.settings?.flowProjectUrl || job.settings?.providerWorkspaceUrl || "").trim();
      if (/^https:\/\/labs\.google\/fx\/[^/]+\/tools\/flow\/project\/[^/]+(?:\/|$)/i.test(requestedWorkspace)) {
        try {
          const url = new URL(requestedWorkspace);
          url.pathname = url.pathname.replace(/\/(?:tool|tool-version)\/[^/]+\/?$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "");
          url.search = "";
          url.hash = "";
          job.conversationUrl = url.toString();
          job.settings = { ...(job.settings || {}), providerWorkspaceUrl: job.conversationUrl };
          await persistActiveJobSnapshot(job);
        } catch { /* normal tab discovery below will report a clear error */ }
      }
    }
    // UI-direct Flow jobs must target the signed-in project workspace, not the
    // provider catalog landing page. Capture the exact project route before
    // openProviderJob() chooses a fallback URL; otherwise a stale renderer
    // snapshot can silently navigate to /tools and strand the job.
    if (job.provider === "google-flow" && job.task === "image_to_video" && !shouldUseFlowCustomTool(job) && !job.conversationUrl) {
      const flow = await findFlowProjectTab();
      const workspace = flow.tab && !isFlowCustomToolUrl(flow.tab.url) ? flow.tab : undefined;
      if (workspace?.url && isFlowProjectUrl(workspace.url)) {
        try {
          const url = new URL(workspace.url);
          url.pathname = url.pathname.replace(/\/tool-version\/[^/]+\/?$/i, "").replace(/\/tool\/[^/]+\/?$/i, "").replace(/\/edit\/[^/]+\/?$/i, "").replace(/\/+$/, "");
          url.search = "";
          url.hash = "";
          if (/\/project\/[^/]+$/i.test(url.pathname)) {
            job.conversationUrl = url.toString();
            job.settings = { ...(job.settings || {}), providerWorkspaceUrl: job.conversationUrl };
            await persistActiveJobSnapshot(job);
          }
        } catch { /* the normal provider-route guard will report an invalid tab */ }
      }
    }
    if (!await dispatchCustomFlowJob(job, targetUrl)) await openProviderJob(job, targetUrl);
  }
  catch (error) { await handleRunFailure(job, error); }
}

async function handleRunJob(message: StudioJob & { type: string }): Promise<void> {
  const job = buildStudioJob(message);
  if (!admitJob(job)) return;
  await startAdmittedJob(job);
}
