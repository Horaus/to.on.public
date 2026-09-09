import type { StudioJob } from "./job-types";
import type { ProviderAdapter } from "./adapters/types";
import { createNativeInput } from "./native-input";

type DispatchRuntimeDependencies = {
  activeJobs: Map<string, StudioJob>; contentScripts: Record<string, string>; mainWorldScripts: Partial<Record<string, string>>; providerUrls: Record<string, string>; requiredChatGptCapabilities: string[];
  chatGptPageHasFatalShellError: (tabId: number) => Promise<boolean>; chatGptPageHasRateLimit: (tabId: number) => Promise<boolean>; findOrCreateTab: (url: string, provider?: string, jobId?: string) => Promise<chrome.tabs.Tab>;
  handleContentResult: (data: Record<string, unknown>) => Promise<void>; humanProviderPause: (provider: string, phase: string, jobId: string) => Promise<void>;
  isSavedChatGptConversationUrl: (value: unknown) => value is string; persistedChatGptRateLimitedUntil: () => Promise<number>;
  providerTabMatches: (provider: string, url?: string) => boolean; providerMinDispatchIntervalMs: Record<string, number>; chatGptMinDispatchIntervalMs: number;
  persistActiveJobSnapshot: (job: StudioJob) => Promise<void>; providerAdapter: (provider: string) => ProviderAdapter | undefined;
  recoverLatestFlowResult: (job: StudioJob, error: string, allowVisibleFallback?: boolean) => Promise<boolean>;
  retryProviderTabAfterErrorPage: (job: StudioJob, error: unknown) => Promise<boolean>;
  retryRecoveredCapture: (job: StudioJob, tabId: number) => Promise<void>;
  requestDesktopNativeClick: (tabUrl: string, x: number, y: number, expectedText?: string, confirmIfUnchanged?: boolean) => Promise<void>;
  sendStatus: (jobId: string, status: string, message: string, progress?: number) => void; sendToDesktop: (message: Record<string, unknown>) => void;
  uploadChatGptReferencesNatively: (job: StudioJob, assetId?: string) => Promise<void>; waitForTabComplete: (tabId: number, timeoutMs?: number) => Promise<chrome.tabs.Tab>;
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number, label: string) => Promise<T>;
};

let activeJobs: DispatchRuntimeDependencies["activeJobs"];
let CHATGPT_MIN_DISPATCH_INTERVAL_MS: number;
let PROVIDER_MIN_DISPATCH_INTERVAL_MS: Record<string, number>;
let chatGptPageHasFatalShellError: DispatchRuntimeDependencies["chatGptPageHasFatalShellError"];
let chatGptPageHasRateLimit: DispatchRuntimeDependencies["chatGptPageHasRateLimit"];
let CONTENT_SCRIPT_BY_PROVIDER: DispatchRuntimeDependencies["contentScripts"];
let findOrCreateTab: DispatchRuntimeDependencies["findOrCreateTab"];
let handleContentResult: DispatchRuntimeDependencies["handleContentResult"];
let humanProviderPause: DispatchRuntimeDependencies["humanProviderPause"];
let isSavedChatGptConversationUrl: DispatchRuntimeDependencies["isSavedChatGptConversationUrl"];
let MAIN_WORLD_SCRIPT_BY_PROVIDER: DispatchRuntimeDependencies["mainWorldScripts"];
let persistActiveJobSnapshot: DispatchRuntimeDependencies["persistActiveJobSnapshot"];
let persistedChatGptRateLimitedUntil: DispatchRuntimeDependencies["persistedChatGptRateLimitedUntil"];
let providerAdapter: DispatchRuntimeDependencies["providerAdapter"];
let providerTabMatches: DispatchRuntimeDependencies["providerTabMatches"];
let PROVIDER_URLS: DispatchRuntimeDependencies["providerUrls"];
let recoverLatestFlowResult: DispatchRuntimeDependencies["recoverLatestFlowResult"];
let requestDesktopNativeClick: DispatchRuntimeDependencies["requestDesktopNativeClick"];
let REQUIRED_CHATGPT_ADAPTER_CAPABILITIES: string[];
let retryProviderTabAfterErrorPage: DispatchRuntimeDependencies["retryProviderTabAfterErrorPage"];
let retryRecoveredCapture: DispatchRuntimeDependencies["retryRecoveredCapture"];
let sendStatus: DispatchRuntimeDependencies["sendStatus"];
let sendToDesktop: DispatchRuntimeDependencies["sendToDesktop"];
let uploadChatGptReferencesNatively: DispatchRuntimeDependencies["uploadChatGptReferencesNatively"];
let waitForTabComplete: DispatchRuntimeDependencies["waitForTabComplete"];
let withTimeout: DispatchRuntimeDependencies["withTimeout"];
let dispatchNativeMouseClick: ReturnType<typeof createNativeInput>["dispatchNativeMouseClick"];
let dispatchNativeTextInsert: ReturnType<typeof createNativeInput>["dispatchNativeTextInsert"];
let dispatchTobyFlowTextInsert: ReturnType<typeof createNativeInput>["dispatchTobyFlowTextInsert"];
let dispatchNativeFileInput: ReturnType<typeof createNativeInput>["dispatchNativeFileInput"];
let dispatchNativeFileChooserUpload: ReturnType<typeof createNativeInput>["dispatchNativeFileChooserUpload"];
let dispatchNativeCanvasDrag: ReturnType<typeof createNativeInput>["dispatchNativeCanvasDrag"];
let lastChatGptDispatchAt = 0;
const lastProviderDispatchAt = new Map<string, number>();
// Keep pacing provider-local. A Flow submit must never wait behind ChatGPT,
// while commands targeting the same web provider are serialized to avoid
// double-submit races when retries and the YOLO pump fire together.
const providerDispatchTails = new Map<string, Promise<void>>();

export function createDispatchRuntime(deps: DispatchRuntimeDependencies) {
  ({ activeJobs, chatGptMinDispatchIntervalMs: CHATGPT_MIN_DISPATCH_INTERVAL_MS, providerMinDispatchIntervalMs: PROVIDER_MIN_DISPATCH_INTERVAL_MS, chatGptPageHasFatalShellError, chatGptPageHasRateLimit, contentScripts: CONTENT_SCRIPT_BY_PROVIDER, findOrCreateTab, handleContentResult, humanProviderPause, isSavedChatGptConversationUrl, mainWorldScripts: MAIN_WORLD_SCRIPT_BY_PROVIDER, persistActiveJobSnapshot, persistedChatGptRateLimitedUntil, providerAdapter, providerTabMatches, providerUrls: PROVIDER_URLS, recoverLatestFlowResult, requestDesktopNativeClick, requiredChatGptCapabilities: REQUIRED_CHATGPT_ADAPTER_CAPABILITIES, retryProviderTabAfterErrorPage, retryRecoveredCapture, sendStatus, sendToDesktop, uploadChatGptReferencesNatively, waitForTabComplete, withTimeout } = deps);
  ({ dispatchNativeMouseClick, dispatchNativeTextInsert, dispatchTobyFlowTextInsert, dispatchNativeFileInput, dispatchNativeFileChooserUpload, dispatchNativeCanvasDrag } = createNativeInput(requestDesktopNativeClick));
  return { dispatchNativeCanvasDrag, dispatchNativeFileChooserUpload, dispatchNativeFileInput, dispatchNativeMouseClick, dispatchNativeTextInsert, dispatchTobyFlowTextInsert, dispatchToContentScript, ensureContentScript, flowJobWasSubmitted, hardResetChatGptDispatch, isFlowAmbiguousCustomToolError, isFlowBridgeUnavailableError, isFlowDefinitiveProviderFailure, isFlowMidComposerFailure, isFlowPageCrashError, isFlowPostSubmitInspectionError, reloadAndRecoverFlowResult, reloadAndRedispatchFlowJob };
}
async function hardResetChatGptDispatch(job: StudioJob): Promise<void> {
  if (!job.tabId) throw new Error("ChatGPT hard reset requires the original provider tab.");
  const attempts = Number(job.chatGptHardResetAttempts || 0);
  if (attempts >= 1) {
    sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: "ChatGPT hard reset was already attempted once; the extension stopped without another submit." });
    activeJobs.delete(job.jobId);
    return;
  }
  job.chatGptHardResetAttempts = attempts + 1;
  const targetUrl = isSavedChatGptConversationUrl(job.conversationUrl) ? job.conversationUrl! : PROVIDER_URLS.chatgpt;
  const fatalShell = await chatGptPageHasFatalShellError(job.tabId);
  sendStatus(job.jobId, "opening_provider", fatalShell
    ? "ChatGPT displayed a fatal error shell. Hard reloading the same tab without cache once..."
    : "ChatGPT dispatch stalled after ACK. Hard reloading the same tab without cache once...", 0.18);
  const current = await chrome.tabs.get(job.tabId).catch(() => undefined);
  if (!current || !providerTabMatches("chatgpt", current.url)) {
    await chrome.tabs.update(job.tabId, { url: targetUrl });
  } else {
    await chrome.tabs.reload(job.tabId, { bypassCache: true });
  }
  // ChatGPT is an SPA and can keep reporting `loading` after the composer
  // and content bridge are already usable. Do not spend the whole recovery
  // watchdog waiting for a browser lifecycle flag; probe the live tab after
  // a short bounded settle instead.
  try { await waitForTabComplete(job.tabId, 15_000); } catch {
    const current = await chrome.tabs.get(job.tabId).catch(() => undefined);
    if (!current?.url?.startsWith("https://chatgpt.com/")) throw new Error("ChatGPT hard reset left the provider tab unavailable.");
  }
  await new Promise((resolve) => setTimeout(resolve, 2200));
  await ensureContentScript(job);
  sendStatus(job.jobId, "opening_provider", "ChatGPT hard reset completed; retrying the same idempotent extension command once.", 0.22);
  await dispatchToContentScript(job);
}

function isFlowPageCrashError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Google Flow crashed with a client-side exception|Flow browser tab is in a Chrome error state|Application error:\s*a client-side exception|left the project composer for an old media edit route|chrome-error:\/\/|Aw,\s*Snap|ERR_[A-Z_]+/i.test(message);
}

function isFlowMidComposerFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /upload input|source frame|start-frame|composer|keyframe|Prompt staged|Flow keyframe|Cannot find Google Flow upload input/i.test(message);
}

function isFlowPostSubmitInspectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /after submit|generation was accepted|checking whether generation started|accepted the prompt|Waiting for Google Flow result|Timeout waiting for Google Flow result/i.test(message);
}

function isFlowAmbiguousCustomToolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Desktop Flow tool evaluation timed out|Studio Shot Bridge sandbox target (?:was not found|is not attached)|Remote sandbox CDP (?:connection timed out|connection failed)|Studio Shot Bridge frame is not ready/i.test(message);
}

// A Flow runtime can expose an about:srcdoc frame while the custom-tool
// iframe is still blocked by reCAPTCHA or has no bridge preview. This is a
// deterministic readiness failure, not an ambiguous post-submit result;
// recovery would only reload the same unusable frame and burn the watchdog.
function isFlowBridgeUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Studio Shot Bridge sandbox target was not found:[\s\S]*(?:reCAPTCHA|about:srcdoc:\s*Flow App)|Timed out waiting for Studio Shot Bridge controls|Timed out waiting for storyboard media|Timed out waiting for continuity reference|bản DRAFT \/tool\/|unpublished draft route|runtime \/tool-version\/ đã publish/i.test(message);
}

function isFlowDefinitiveProviderFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Google Flow generation failed after preflight and provider authorization|Google Flow SDK failed after authorization|GOOGLE_FLOW_PROVIDER_POLICY_REJECTED|vi phạm chính sách|\bVideo generation failed\b/i.test(message);
}

function flowJobWasSubmitted(job: StudioJob | undefined): boolean {
  if (!job || job.provider !== "google-flow") return false;
  if (["generating", "downloading"].includes(String(job.lastStatus || ""))) return true;
  if (Number(job.lastProgress || 0) >= 0.7) return true;
  return /submit button clicked|generation was accepted|accepted the prompt|waiting for google flow result|generating in google flow/i.test(job.lastStatusMessage || "");
}

async function reloadAndRecoverFlowResult(job: StudioJob, originalError: unknown): Promise<boolean> {
  if (job.provider !== "google-flow" || !job.tabId) return false;
  sendStatus(job.jobId, "opening_provider", "Refreshing Google Flow to check for an already submitted video result before retrying...", 0.88);
  const tab = await chrome.tabs.get(job.tabId).catch(() => undefined);
  const targetUrl = (job.conversationUrl || tab?.url || PROVIDER_URLS["google-flow"]).replace(/\/edit\/.*$/i, "");
  await chrome.tabs.update(job.tabId, { url: targetUrl });
  await waitForTabComplete(job.tabId, 60000);
  await new Promise((resolve) => setTimeout(resolve, 3500));
  await ensureContentScript(job);
  const startedAt = Date.now();
  const maxWaitMs = 180_000;
  let attempt = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    attempt += 1;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    sendStatus(job.jobId, "downloading", `Checking refreshed Google Flow project for completed video (${attempt}, ${elapsedSec}s)...`, 0.9);
    if (await recoverLatestFlowResult(job, String(originalError || ""), true)) return true;
    if (isFlowPageCrashError(originalError) && await recoverLatestFlowResult(job, String(originalError || ""), true)) return true;
    await new Promise((resolve) => setTimeout(resolve, 12_000));
  }
  sendStatus(job.jobId, "downloading", "Strict Flow recovery found no current-job video; refusing to import visible project videos that cannot be tied to this job.", 0.94);
  return false;
}

async function reloadAndRedispatchFlowJob(job: StudioJob, originalError: unknown): Promise<boolean> {
  // A pre-submit Flow crash is not evidence that the provider accepted the
  // job. Redispatching here repeatedly reopens the picker, creates oscillating
  // status events, and can submit a wrong/duplicate frame. Leave the job for
  // the bounded result-recovery path (which never submits) and require a
  // deliberate user retry after the Flow page is healthy again.
  void job;
  void originalError;
  return false;
}

async function paceChatGptDispatch(job: StudioJob): Promise<boolean> {
  if (job.provider !== "chatgpt") return true;
  if (job.tabId && await chatGptPageHasRateLimit(job.tabId)) {
    sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: "CHATGPT_RATE_LIMIT_COOLDOWN: ChatGPT is showing a request-rate limit. No prompt was submitted; wait for the provider cooldown before retrying." });
    activeJobs.delete(job.jobId);
    return false;
  }
  const nowMs = Date.now();
  const rateLimitedUntil = await persistedChatGptRateLimitedUntil();
  if (nowMs < rateLimitedUntil) {
    sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: `CHATGPT_RATE_LIMIT_COOLDOWN: ChatGPT temporarily limited this account. No request was submitted; wait ${Math.ceil((rateLimitedUntil - nowMs) / 60_000)} minute(s).` });
    activeJobs.delete(job.jobId);
    return false;
  }
  const remaining = CHATGPT_MIN_DISPATCH_INTERVAL_MS - (nowMs - lastChatGptDispatchAt);
  if (remaining > 0) {
    sendStatus(job.jobId, "opening_provider", `ChatGPT safety pacing: waiting ${Math.ceil(remaining / 1000)}s before the next submit.`, 0.2);
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return true;
}

async function paceProviderDispatch(job: StudioJob): Promise<boolean> {
  if (job.provider === "chatgpt") return paceChatGptDispatch(job);
  const interval = Number(PROVIDER_MIN_DISPATCH_INTERVAL_MS[job.provider] || 0);
  const remaining = interval - (Date.now() - (lastProviderDispatchAt.get(job.provider) || 0));
  if (remaining > 0) {
    sendStatus(job.jobId, "opening_provider", `${job.provider} safety pacing: waiting ${Math.ceil(remaining / 1000)}s before the next submit.`, 0.2);
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return true;
}

async function ensureRecoverableContentScript(job: StudioJob): Promise<void> {
  try { await ensureContentScript(job); }
  catch (error) {
    if (!await retryProviderTabAfterErrorPage(job, error)) throw error;
    await ensureContentScript(job);
  }
}

function providerCommand(job: StudioJob) {
  return { action: job.provider === "chatgpt" ? "EXECUTE_CHATGPT_JOB_V2" : "EXECUTE_JOB", job: { jobId: job.jobId, prompt: job.prompt, task: job.task, references: job.references, settings: job.settings } };
}

async function sendProviderCommand(job: StudioJob): Promise<{ ok?: boolean } | undefined> {
  const command = providerCommand(job);
  const timeoutMs = job.provider === "chatgpt" && (job.task === "image" || job.task === "text_to_image") ? 30_000 : 8_000;
  try { return await sendTabMessageWithTimeout(job.tabId!, command, timeoutMs); }
  catch (error) {
    if (job.provider === "chatgpt") {
      sendStatus(job.jobId, "submitting", "ChatGPT acknowledgement timed out. Verifying the live adapter and resending the same idempotent job once...", 0.27);
      await pingChatGptAdapter(job.tabId!);
      return sendTabMessageWithTimeout(job.tabId!, command, timeoutMs);
    }
    if (job.provider !== "google-flow" || job.task !== "image_to_video") throw error;
    sendStatus(job.jobId, "submitting", "Flow acknowledgement timed out. Reloading the exact project tab, restoring the adapter, and retrying the same idempotent job once...", 0.27);
    await chrome.tabs.reload(job.tabId!); await waitForTabComplete(job.tabId!, 30_000); await ensureContentScript(job);
    return sendTabMessageWithTimeout(job.tabId!, command, timeoutMs);
  }
}

async function handleDispatchFailure(job: StudioJob, error: unknown): Promise<void> {
  if (job.provider === "google-flow" && job.task === "image_to_video" && isFlowAmbiguousCustomToolError(error)) {
    await handleContentResult({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: `Studio Shot Bridge lost its control callback after the Flow command may have been accepted. Recovering the strict current-job result without resubmitting: ${error instanceof Error ? error.message : String(error)}` });
    return;
  }
  if (job.provider === "chatgpt" && (job.task === "image" || job.task === "text_to_image") && job.tabId && isSavedChatGptConversationUrl(job.conversationUrl)) {
    job.chatGptImageRecoveryActive = true;
    sendStatus(job.jobId, "opening_provider", `ChatGPT content bridge became unreadable. Reloading ${job.conversationUrl} and checking for the image before failing...`, 0.2);
    void retryRecoveredCapture(job, job.tabId);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: /Open one signed-in blank ChatGPT tab first/i.test(message) ? "failed_manual" : "failed_retryable", assets: [], error: `Failed to communicate with content script: ${message}` });
  activeJobs.delete(job.jobId);
}

async function dispatchToContentScript(job: StudioJob): Promise<void> {
  if (!job.tabId) return;
  const previous = providerDispatchTails.get(job.provider) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  providerDispatchTails.set(job.provider, tail);
  await previous;
  try {
    if (!await paceProviderDispatch(job)) return;
    await humanProviderPause(job.provider, "sending the next provider command", job.jobId);
    sendStatus(job.jobId, "submitting", "Sending prompt to provider content script...", 0.25);
    try {
      await ensureRecoverableContentScript(job);
      const response = await sendProviderCommand(job);
      const dispatchedAt = Date.now();
      if (job.provider === "chatgpt") lastChatGptDispatchAt = dispatchedAt;
      else lastProviderDispatchAt.set(job.provider, dispatchedAt);
      sendStatus(job.jobId, "submitting", response?.ok ? `${job.provider} content script accepted the job.` : `${job.provider} content script returned an empty acknowledgement.`, 0.3);
    } catch (error) { await handleDispatchFailure(job, error); }
  } finally {
    release();
    if (providerDispatchTails.get(job.provider) === tail) providerDispatchTails.delete(job.provider);
  }
}

function sendTabMessageWithTimeout<T = unknown>(tabId: number, message: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Timed out waiting for tab ${tabId} content script response after ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message)
      .then((response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response as T);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function ensureContentScript(job: StudioJob): Promise<void> {
  if (!job.tabId) return;
  const currentTab = await chrome.tabs.get(job.tabId).catch(() => undefined);
  if (!currentTab) throw new Error(`Provider tab ${job.tabId} is unavailable.`);
  if (currentTab.status !== "complete") await waitForTabComplete(job.tabId, 15_000);
  // A registered content script can remain healthy across many jobs. Reinjecting the
  // same large bundle on every dispatch is both unnecessary and, on busy provider
  // pages, can leave executeScript waiting even though the existing adapter is ready.
  // Probe first; injection is recovery for a genuinely missing receiver only.
  if (await probeContentScript(job)) return;
  // No live receiver (or an obsolete adapter): install the current bridge below.
  const mainWorldFile = MAIN_WORLD_SCRIPT_BY_PROVIDER[job.provider];
  if (mainWorldFile) {
    sendStatus(job.jobId, "submitting", `Injecting ${job.provider} main-world bridge...`, 0.22);
    try {
      await withTimeout(
        chrome.scripting.executeScript({
          target: { tabId: job.tabId },
          files: [mainWorldFile],
          world: "MAIN"
        }),
        10_000,
        `Injecting ${mainWorldFile} into tab ${job.tabId}`
      );
    } catch (error) {
      throw new Error(`Cannot inject ${mainWorldFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const file = CONTENT_SCRIPT_BY_PROVIDER[job.provider];
  if (!file) return;
  sendStatus(job.jobId, "submitting", `Injecting ${job.provider} adapter...`, 0.24);
  try {
    await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: job.tabId }, files: [file] }),
      10_000,
      `Injecting ${file} into tab ${job.tabId}`
    );
    if (job.provider === "chatgpt") await pingChatGptAdapter(job.tabId);
    if (job.provider === "google-flow") await pingGoogleFlowAdapter(job.tabId);
    if (job.provider === "elevenlabs-flows") await pingElevenLabsFlowsAdapter(job.tabId);
  } catch (error) {
    // Reloading the extension service worker invalidates listeners installed
    // by an older content script while the page itself remains open. Recover
    // that one lifecycle mismatch by reloading the same provider tab once;
    // never enter an unbounded inject/retry loop.
    if (job.provider === "google-flow") {
      sendStatus(job.jobId, "opening_provider", "Flow adapter receiver was stale; reloading the same workspace tab once...", 0.2);
      await chrome.tabs.reload(job.tabId, { bypassCache: true });
      await waitForTabComplete(job.tabId, 15_000);
      await withTimeout(
        chrome.scripting.executeScript({ target: { tabId: job.tabId }, files: [file] }),
        10_000,
        `Recovering ${file} in tab ${job.tabId}`
      );
      await pingGoogleFlowAdapter(job.tabId);
      return;
    }
    throw new Error(`Cannot inject ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function probeContentScript(job: StudioJob) {
  try {
    if (job.provider === "chatgpt") await pingChatGptAdapter(job.tabId!);
    else if (job.provider === "google-flow") await pingGoogleFlowAdapter(job.tabId!);
    else if (job.provider === "elevenlabs-flows") await pingElevenLabsFlowsAdapter(job.tabId!);
    else {
      const response = await sendTabMessageWithTimeout<{ ok?: boolean }>(job.tabId!, { action: "PING_STUDIO_ADAPTER" }, 3000);
      if (!response?.ok) throw new Error(`Unexpected adapter response: ${JSON.stringify(response)}`);
    }
    return true;
  } catch {
    return false;
  }
}

async function pingElevenLabsFlowsAdapter(tabId: number): Promise<void> {
  const response = await sendTabMessageWithTimeout<{ ok?: boolean; adapter?: string }>(
    tabId,
    { action: "PING_STUDIO_ADAPTER" },
    3000
  );
  if (!response?.ok || response.adapter !== "elevenlabs-flows") {
    throw new Error(`ElevenLabs Flows adapter did not respond: ${JSON.stringify(response)}`);
  }
}

async function pingGoogleFlowAdapter(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await sendTabMessageWithTimeout<{ ok?: boolean; adapter?: string }>(tabId, { action: "PING_STUDIO_ADAPTER" }, 3000);
      if (response?.ok && typeof response.adapter === "string") return;
      throw new Error(`Unexpected adapter response: ${JSON.stringify(response)}`);
    } catch (error) {
      if (attempt === 1) {
        throw new Error(`Google Flow adapter did not respond: ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}

async function pingChatGptAdapter(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: "PING_STUDIO_ADAPTER" });
      if (response?.ok && typeof response.version === "string" && REQUIRED_CHATGPT_ADAPTER_CAPABILITIES.every((capability) => response.version.includes(capability))) return;
      throw new Error(`Unexpected adapter response: ${JSON.stringify(response)}`);
    } catch (error) {
      if (attempt === 1) {
        throw new Error(`ChatGPT adapter lacks required capabilities ${REQUIRED_CHATGPT_ADAPTER_CAPABILITIES.join(", ")}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
