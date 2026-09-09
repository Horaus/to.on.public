import type { StudioJob, ToolJobPayload } from "./job-types";
import { flowActionMainWorld } from "./flow-main-world-actions";

type RuntimeMessageDependencies = {
  activeJobs: Map<string, StudioJob>; bridgeStatus: () => { connected: boolean; activeJobs: number; availableProviders: string[]; lastError: string | null; pairing?: { pairingId: string; code?: string; state: string; expiresAt?: number }; providerVisibility?: Record<string, unknown>; discovery?: Record<string, unknown>; capabilities?: Record<string, unknown> };
  providerVisibilitySnapshot: () => Promise<Record<string, unknown>>;
  dispatchNativeCanvasDrag: (tabId: number, startX: number, startY: number, endX: number, endY: number) => Promise<void>; dispatchNativeFileInput: (tabId: number, filePaths: string[]) => Promise<void>; dispatchNativeFileChooserUpload: (tabId: number, x: number, y: number, filePaths: string[]) => Promise<void>;
  dispatchNativeMouseClick: (tabId: number, x: number, y: number, expectedText: string, confirmIfUnchanged: boolean) => Promise<unknown>; dispatchNativeTextInsert: (tabId: number, x: number, y: number, text: string, focusOnly: boolean) => Promise<void>; dispatchTobyFlowTextInsert: (tabId: number, text: string) => Promise<boolean>;
  enqueueCustomToolJob: (job: StudioJob, tab: chrome.tabs.Tab) => Promise<void>; ensureBridgeConnection: () => void; handleContentResult: (data: Record<string, unknown>) => Promise<void>;
  probeFlowAppIntake: (payload: unknown) => Promise<unknown>;
  isSavedChatGptConversationUrl: (value: string) => boolean; persistActiveJobSnapshot: (job: StudioJob) => Promise<void>; forgetActiveJobSnapshot: (jobId: string) => void; restoreActiveJobSnapshot: (jobId: string) => Promise<StudioJob | undefined>;
  sendToDesktop: (message: Record<string, unknown>) => void; uploadChatGptReferencesNatively: (job: StudioJob, assetId?: string) => Promise<void>;
};

type RuntimeMessage = Record<string, any>;
type RuntimeSender = chrome.runtime.MessageSender;
type RuntimeResponder = (response?: unknown) => void;

function respondTo(promise: Promise<unknown>, sendResponse: RuntimeResponder) {
  void promise.then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
}

function respondWithValue(promise: Promise<unknown>, sendResponse: RuntimeResponder) {
  void promise.then((value) => sendResponse({ ok: true, value })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
}

function handleFlowAppDiagnostic(deps: RuntimeMessageDependencies, message: RuntimeMessage, sendResponse: RuntimeResponder) {
  if (message.source !== "extension-diagnostic" || message.type !== "PROBE_FLOW_APP_INTAKE") return false;
  return respondWithValue(deps.probeFlowAppIntake(message.payload), sendResponse);
}

function handleBridgeMessage(deps: RuntimeMessageDependencies, message: RuntimeMessage, sendResponse: RuntimeResponder) {
  if (message.source === "google-flow-adapter" && message.type === "ENSURE_BRIDGE_CONNECTION") { deps.ensureBridgeConnection(); sendResponse({ ok: true }); return true; }
  if (message.source === "popup" && message.type === "GET_BRIDGE_STATUS") {
    deps.ensureBridgeConnection();
    void deps.providerVisibilitySnapshot()
      .then((providerVisibility) => sendResponse({ ...deps.bridgeStatus(), providerVisibility }))
      .catch((error) => sendResponse({ ...deps.bridgeStatus(), error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  return false;
}

function handleCustomToolMessage(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-custom-tool-host" || message.type !== "RUN_CUSTOM_TOOL_JOB") return false;
  const payload = message.payload as ToolJobPayload | undefined; const tab = sender.tab;
  if (!payload?.jobId || !tab?.id) { sendResponse({ ok: false, error: "Custom-tool relay payload is incomplete." }); return true; }
  const job = deps.activeJobs.get(payload.jobId) || { jobId: payload.jobId, provider: "google-flow", task: payload.task, prompt: payload.prompt, references: payload.references, settings: payload.settings, download: { auto: true, filenameTemplate: `studio-shot-bridge-${payload.jobId}` } };
  return respondTo(deps.enqueueCustomToolJob(job, tab), sendResponse);
}

function handleNativeClick(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-adapter" || message.type !== "NATIVE_MOUSE_CLICK") return false;
  const tabId = sender.tab?.id; const x = Number(message.x); const y = Number(message.y);
  if (!tabId || !Number.isFinite(x) || !Number.isFinite(y)) { sendResponse({ ok: false, error: "Missing tab id or click coordinates." }); return true; }
  return respondWithValue(deps.dispatchNativeMouseClick(tabId, x, y, String(message.expectedText || ""), message.confirmIfUnchanged === true), sendResponse);
}

function clickMainWorld(clientX: number, clientY: number) {
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const clickable = hit?.closest<HTMLElement>("button, [role='button'], [role='option'], [role='menuitem']") || hit;
  if (!clickable) return false;
  clickable.click(); return true;
}

function handleMainWorldClick(message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-adapter" || message.type !== "MAIN_WORLD_CLICK") return false;
  const tabId = sender.tab?.id; const x = Number(message.x); const y = Number(message.y);
  if (!tabId || !Number.isFinite(x) || !Number.isFinite(y)) { sendResponse({ ok: false, error: "Missing tab id or click coordinates." }); return true; }
  void chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: clickMainWorld, args: [x, y] }).then((results) => sendResponse({ ok: results.some((result) => result.result === true) })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
}

function handleFlowAction(message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-adapter" || message.type !== "MAIN_WORLD_FLOW_ACTION") return false;
  const tabId = sender.tab?.id; const action = String(message.action || "");
  if (!tabId || !action) { sendResponse({ ok: false, error: "Missing tab id or Flow action." }); return true; }
  void chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: flowActionMainWorld, args: [action, String(message.value || "")] }).then((results) => sendResponse({ ok: results.some((result) => result.result === true) })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
}

function handleNativeText(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (!["google-flow-adapter", "elevenlabs-flows-adapter"].includes(message.source) || message.type !== "NATIVE_INSERT_TEXT") return false;
  const tabId = sender.tab?.id; const x = Number(message.x); const y = Number(message.y);
  if (!tabId || !Number.isFinite(x) || !Number.isFinite(y)) { sendResponse({ ok: false, error: "Missing tab id or insertion coordinates." }); return true; }
  return respondTo(deps.dispatchNativeTextInsert(tabId, x, y, String(message.text ?? ""), message.focusOnly === true), sendResponse);
}

function handleTobyText(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-adapter" || message.type !== "TOBY_FLOW_INSERT_TEXT") return false;
  const tabId = sender.tab?.id;
  if (!tabId) { sendResponse({ ok: false, error: "Missing tab id." }); return true; }
  return respondWithValue(deps.dispatchTobyFlowTextInsert(tabId, String(message.text ?? "")), sendResponse);
}

function handleNativeFile(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-adapter" || message.type !== "NATIVE_SET_FILE_INPUT") return false;
  const tabId = sender.tab?.id; const paths = Array.isArray(message.filePaths) ? message.filePaths.map(String).filter(Boolean) : [];
  if (!tabId || !paths.length) { sendResponse({ ok: false, error: "Missing tab id or local file path." }); return true; }
  return respondTo(deps.dispatchNativeFileInput(tabId, paths), sendResponse);
}

function handleNativeFileChooserUpload(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-adapter" || message.type !== "NATIVE_UPLOAD_FILE_CHOOSER") return false;
  const tabId = sender.tab?.id; const x = Number(message.x); const y = Number(message.y); const paths = Array.isArray(message.filePaths) ? message.filePaths.map(String).filter(Boolean) : [];
  if (!tabId || !Number.isFinite(x) || !Number.isFinite(y) || !paths.length) { sendResponse({ ok: false, error: "Missing tab id, click coordinates or local file path." }); return true; }
  return respondTo(deps.dispatchNativeFileChooserUpload(tabId, x, y, paths), sendResponse);
}

function handleNativeDrag(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "elevenlabs-flows-adapter" || message.type !== "NATIVE_DRAG_CANVAS") return false;
  const tabId = sender.tab?.id; const coordinates = [message.startX, message.startY, message.endX, message.endY].map(Number);
  if (!tabId || coordinates.some((value) => !Number.isFinite(value))) { sendResponse({ ok: false, error: "Missing tab id or canvas drag coordinates." }); return true; }
  return respondTo(deps.dispatchNativeCanvasDrag(tabId, coordinates[0], coordinates[1], coordinates[2], coordinates[3]), sendResponse);
}

function handleNativeUpload(deps: RuntimeMessageDependencies, message: RuntimeMessage, sendResponse: RuntimeResponder) {
  if (message.source !== "content-script" || message.action !== "NATIVE_CHATGPT_UPLOAD_REFERENCES") return false;
  const job = deps.activeJobs.get(String(message.jobId || ""));
  if (!job) { sendResponse({ ok: false, error: "Active ChatGPT job was not found for native upload." }); return true; }
  return respondTo(deps.uploadChatGptReferencesNatively(job, typeof message.assetId === "string" ? message.assetId : undefined), sendResponse);
}

function handleFlowWorkspaceReference(deps: RuntimeMessageDependencies, message: RuntimeMessage, sendResponse: RuntimeResponder) {
  if (message.source !== "google-flow-adapter" || message.type !== "RESOLVE_FLOW_REFERENCE_IN_WORKSPACE") return false;
  const jobId = String(message.jobId || "");
  const reference = message.reference;
  if (!jobId || !reference?.assetId) { sendResponse({ ok: false, error: "Missing Flow job or reference for workspace picker relay." }); return true; }
  const projectId = String(message.projectId || "");
  const senderTabId = Number(message.senderTabId || 0);
  const resolve = async () => {
    const tabs = await chrome.tabs.query({ url: ["https://labs.google/fx/*", "https://labs.google.com/fx/*"] });
    const base = tabs.find((tab) => {
      if (!tab.id || tab.id === senderTabId || !tab.url || /\/project\/[^/]+\/(?:tool|tool-version)\//i.test(tab.url)) return false;
      try {
        const pathname = new URL(tab.url).pathname.replace(/\/$/, "");
        return !projectId || pathname.endsWith(`/project/${projectId}`);
      } catch { return false; }
    });
    if (!base?.id) throw new Error("Flow workspace base tab was not found; keep the project page open beside Studio Shot Bridge.");
    // This request originates in the published Relay runtime. The workspace
    // should resolve an exact ready tile first, then use its verified upload
    // input directly; opening the classic composer picker here can target a
    // stale/virtualized surface and leave the Relay job parked in submitting.
    const sendReference = () => chrome.tabs.sendMessage(base.id!, { action: "RESOLVE_FLOW_REFERENCE", jobId, reference, preferDirectUpload: true });
    const sendReferenceWithReconnect = async () => {
      try {
        return await sendReference();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (!/message channel closed|receiving end does not exist/i.test(detail)) throw error;
        await chrome.tabs.reload(base.id!).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        await chrome.tabs.sendMessage(base.id!, { action: "PING_STUDIO_ADAPTER" });
        return sendReference();
      }
    };
    // A workspace tab created during runtime dispatch can finish navigation
    // before its content script has registered the picker adapter. Probe once
    // and perform one bounded tab reload if the extension context is stale;
    // this prevents a silent relay drop without introducing a provider retry.
    return chrome.tabs.sendMessage(base.id, { action: "PING_STUDIO_ADAPTER" })
      .catch(async () => {
        await chrome.tabs.reload(base.id!).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return chrome.tabs.sendMessage(base.id!, { action: "PING_STUDIO_ADAPTER" });
      })
      .then(() => sendReferenceWithReconnect());
  };
  void resolve().then((result) => sendResponse(result || { ok: false, error: "Flow workspace returned no reference result." })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
}

async function restoreForwardJob(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender) {
  const jobId = String(message.data?.jobId || "");
  const active = deps.activeJobs.get(jobId);
  const job = active || await deps.restoreActiveJobSnapshot(jobId);
  // A late provider result can arrive after the in-memory coordinator has
  // pruned its job. Re-register the durable snapshot before handing the
  // result to result-handler; otherwise it receives no tabId and downgrades
  // a recoverable ChatGPT image to an expiring provider URL.
  if (!active && job) deps.activeJobs.set(jobId, job);
  if (job && sender.tab?.id) job.tabId = sender.tab.id;
  await persistConversationContext(deps, job, message, sender);
  normalizeHydratingChatGptStatus(job, message);
  return { job, jobId };
}

function hasDurableChatGptAssets(message: RuntimeMessage, job: StudioJob | undefined) {
  const provider = String(job?.provider || "").toLowerCase();
  return Boolean((provider === "chatgpt" || provider === "chatgpt-web") && message.data?.status === "done" && Array.isArray(message.data.assets) && message.data.assets.length > 0 &&
    message.data.assets.every((asset: any) => String(asset?.filePath || asset?.downloadPath || "").startsWith("data:")));
}

function forwardDurableChatGptResult(deps: RuntimeMessageDependencies, message: RuntimeMessage, jobId: string) {
  deps.sendToDesktop({ type: "JOB_RESULT", jobId, status: "done", assets: message.data.assets.map((asset: any) => ({
    ...asset,
    filePath: asset.filePath || asset.downloadPath,
    metadata: { ...(asset.metadata || {}), storage: asset.filePath?.startsWith("data:") ? "data_url" : "provider_url_fallback" }
  })) });
  // Durable bytes have crossed the provider boundary; release both lanes so
  // the next ChatGPT job is not blocked behind an already-approved image.
  deps.activeJobs.delete(jobId);
  deps.forgetActiveJobSnapshot(jobId);
}

async function hydrateChatGptResultAssets(message: RuntimeMessage, senderTabId?: number): Promise<RuntimeMessage> {
  if (message.data?.type !== "JOB_RESULT" || message.data?.status !== "done" || !Array.isArray(message.data.assets) || !senderTabId) return message;
  const assets = await Promise.all(message.data.assets.map(async (asset: any) => {
    const source = String(asset?.filePath || asset?.downloadPath || "");
    if (!/^https?:\/\//i.test(source)) return asset;
    try {
      const captured = await chrome.tabs.sendMessage(senderTabId, { action: "READ_CHATGPT_ASSET_FOR_BACKGROUND", url: source });
      if (captured?.ok && typeof captured.dataUrl === "string" && captured.dataUrl.startsWith("data:")) {
        return { ...asset, filePath: captured.dataUrl, downloadPath: captured.dataUrl,
          metadata: { ...(asset.metadata || {}), storage: "data_url", originalUrl: source, byteSize: captured.byteSize } };
      }
    } catch {}
    return asset;
  }));
  return { ...message, data: { ...message.data, assets } };
}

async function forwardContentResult(deps: RuntimeMessageDependencies, message: RuntimeMessage, jobId: string, job: StudioJob | undefined, senderTabId?: number) {
  if (message.data?.type === "JOB_RESULT") {
    message = await hydrateChatGptResultAssets(message, senderTabId);
    deps.sendToDesktop({ type: "JOB_STATUS", jobId, status: "downloading", message: "Extension received ChatGPT result; finalizing asset import..." });
    // A verified ChatGPT image can be handed to desktop immediately. Local
    // capture is best-effort; do not hold the whole job behind a provider-tab
    // downloader when the content script already has a valid result URL.
    // Only bypass the downloader when every image already arrived as a
    // durable data URL. A provider URL is merely a signed/expiring handle;
    // forwarding it directly skips the tab/provider capture paths and leaves
    // reference promotion with an unusable remote asset.
    if (hasDurableChatGptAssets(message, job)) {
      forwardDurableChatGptResult(deps, message, jobId);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        deps.handleContentResult(message.data),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("RESULT_PROCESSING_TIMEOUT: extension did not finalize the provider result within 30 seconds")), 30_000); })
      ]);
    } finally { if (timer) clearTimeout(timer); }
  } else deps.sendToDesktop(message.data);
}

async function forwardContentData(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender) {
  const { job, jobId } = await restoreForwardJob(deps, message, sender);
  await forwardContentResult(deps, message, jobId, job, sender.tab?.id);
}

async function persistConversationContext(deps: RuntimeMessageDependencies, job: StudioJob | undefined, message: RuntimeMessage, sender: RuntimeSender): Promise<void> {
  const conversationUrl = [message.data?.providerConversationUrl, sender.tab?.url].map((value) => String(value || "")).find(deps.isSavedChatGptConversationUrl) || "";
  if (!job || !conversationUrl) return;
  job.conversationUrl = conversationUrl;
  message.data.providerConversationUrl = conversationUrl;
  await deps.persistActiveJobSnapshot(job);
}

function normalizeHydratingChatGptStatus(job: StudioJob | undefined, message: RuntimeMessage): void {
  if (!job?.chatGptTextRecoveryActive || message.data?.type !== "JOB_STATUS" || message.data?.status !== "waiting_manual_action") return;
  message.data.status = "generating";
  message.data.message = `Reloaded saved ChatGPT conversation is still hydrating; checking again without resubmitting. ${String(message.data.message || "")}`.trim();
}

function handleContentData(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  if (message.source !== "content-script" || !message.data) return false;
  const relay = forwardContentData(deps, message, sender).catch((error) => {
    console.error("[extension] failed to forward content data", error);
    if (message.data?.type === "JOB_RESULT") {
      deps.sendToDesktop({ type: "JOB_RESULT", jobId: String(message.data.jobId || ""), status: "failed_retryable", assets: [], error: error instanceof Error ? error.message : String(error) });
    }
  });
  // Keep the MV3 service-worker event alive until the result has crossed the
  // downloader/importer boundary; acknowledging immediately can suspend the
  // worker while the detached relay is still processing the asset.
  return respondTo(relay, sendResponse);
}

function dispatchRuntimeMessage(deps: RuntimeMessageDependencies, message: RuntimeMessage, sender: RuntimeSender, sendResponse: RuntimeResponder) {
  const handlers = [() => handleBridgeMessage(deps, message, sendResponse), () => handleFlowAppDiagnostic(deps, message, sendResponse), () => handleCustomToolMessage(deps, message, sender, sendResponse), () => handleFlowWorkspaceReference(deps, { ...message, senderTabId: sender.tab?.id }, sendResponse), () => handleNativeClick(deps, message, sender, sendResponse), () => handleMainWorldClick(message, sender, sendResponse), () => handleFlowAction(message, sender, sendResponse), () => handleNativeText(deps, message, sender, sendResponse), () => handleTobyText(deps, message, sender, sendResponse), () => handleNativeFile(deps, message, sender, sendResponse), () => handleNativeFileChooserUpload(deps, message, sender, sendResponse), () => handleNativeDrag(deps, message, sender, sendResponse), () => handleNativeUpload(deps, message, sendResponse), () => handleContentData(deps, message, sender, sendResponse)];
  for (const handle of handlers) if (handle()) return true;
  sendResponse({ ok: true }); return true;
}

export function registerRuntimeMessageListener(deps: RuntimeMessageDependencies): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => dispatchRuntimeMessage(deps, message, sender, sendResponse));
}
