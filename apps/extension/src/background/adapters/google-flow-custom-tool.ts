import type { StudioJob } from "../job-types";
import { canonicalFlowRoute, validateFlowSubmitContext } from "../../../../../packages/extension-providers/src/google-flow/flow-workspace";
import { evaluateFlowAppDiagnosticReceipt, normalizeFlowAppDiagnosticPayload, type FlowAppDiagnosticPayload, type FlowAppDiagnosticReceipt } from "../flow-app-diagnostic";
import { normalizeFlowRelayIntegration } from "../flow-relay-result";
import relayEnvelopeModule from "../flow-relay-envelope.cjs";

const { createFlowRelayRequest } = relayEnvelopeModule as any;

type CustomToolDependencies = {
  activeJobs: Map<string, StudioJob>;
  bridgeIsOpen: () => boolean;
  customToolActiveJobs: Set<string>;
  handleContentResult: (data: Record<string, unknown>) => Promise<void>;
  requestDesktopFlowToolEvaluate: (expression: string) => Promise<unknown>;
  sendToDesktop: (message: Record<string, unknown>) => void;
  sendStatus: (jobId: string, status: string, message: string, progress?: number) => void;
  waitForTabComplete: (tabId: number, timeoutMs?: number) => Promise<chrome.tabs.Tab>;
};

let runtime: CustomToolDependencies;
let customToolDispatchTail: Promise<void> = Promise.resolve();
const customToolScheduledJobs = new Set<string>();
const customToolSessions = new Map<string, StudioBridgeSession>();

export function createGoogleFlowCustomToolAdapter(deps: CustomToolDependencies) {
  runtime = deps;
  return { dispatch: enqueueCustomToolJob, cancel: cancelCustomToolJob, probeIntake: probeFlowAppIntake };
}

function enqueueCustomToolJob(job: StudioJob, tab: chrome.tabs.Tab): Promise<void> {
    const { sendStatus } = runtime;
    if (customToolScheduledJobs.has(job.jobId)) {
      sendStatus(job.jobId, "submitting", "Duplicate Studio Shot Bridge dispatch ignored; this job was already queued or completed in this extension session.", 0.3);
      return Promise.resolve();
    }
    customToolScheduledJobs.add(job.jobId);
    const run = customToolDispatchTail
      .catch(() => undefined)
      .then(() => dispatchCustomToolJob(job, tab));
    customToolDispatchTail = run.catch(() => undefined);
    return run;
  }
type StudioReference = NonNullable<StudioJob["references"]>[number];
type DebugPending = { resolve: (value: any) => void; reject: (error: Error) => void };

const LOCAL_MEDIA_ORIGIN = "http://127.0.0.1:3768/media/";
// Flow can finish a real generation after ten minutes (the SH2 canary took
// roughly eleven minutes). Keep the wait bounded, but long enough to avoid
// converting a slow provider result into a false readback failure. This does
// not authorize another submit or create a retry loop.
const FLOW_RESULT_TIMEOUT_MS = 15 * 60_000;

// The current Flow tool is a fresh relay app, not the removed Studio Shot
// Bridge. Keep the legacy picker executor available for old persisted jobs,
// but identify the new runtime by its own visible shell before issuing any
// commands. This prevents the extension from sending legacy controls to the
// new app and producing a misleading "connected" state.
const relayToolReadyExpression = `(() => { const text = String(document.body?.innerText || document.documentElement?.innerText || ""); return (/RELAY BRIDGE/i.test(text) && /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(text)) || (/STUDIO-TO-PROVIDER PROTOCOL PROXY/i.test(text) && /(?:IDLE \/ WAITING|AWAITING STUDIO_SHOT_REQUEST)/i.test(text)); })()`;

function isFreshRelayRuntime(url: string) {
  // Add new runtime UUIDs here as new tool versions are published.
  // Also detects via relayToolReadyExpression DOM check as fallback.
  return /(?:\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)(?:61af9773-1ce9-4f36-a624-d010f05a53f2|6c907eac-e8e8-4040-8e46-e38e6cd0662b|4b879882-e1c1-4414-9e05-4202b33f1f31|08ee45bf-f7fc-4e9a-a097-940a16ecf03a|8ff19cad-99ce-4213-abea-9f316663255c|578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1|d8011bb8-81b8-460f-b0a0-164455f6bfac)|\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1))(?:[/?#]|$)/i.test(url);
}

function cancelCustomToolJob(jobId: string): void {
  customToolSessions.get(jobId)?.cancel();
}

function isFlowSandboxTarget(target: { type?: string; url?: string }) {
  // Chrome/Flow expose the srcdoc applet as `other`
  // rather than `iframe`. It is still safe to accept only the exact srcdoc
  // URL; reCAPTCHA and unrelated frames retain their own HTTPS URLs.
  // Published Flow projects can instead expose the real runner as a
  // `page`/`other` target whose URL is the Flow runner shim. Accept that exact
  // runner path so the debugger can reach the visible `Flow app` frame while
  // continuing to exclude compiler, reCAPTCHA, and arbitrary child pages.
  return target.type === "iframe"
    || (target.type === "other" && target.url === "about:srcdoc")
    || Boolean(target.url && /\/flow-applet-runner\/shim\.html(?:[?#]|$)/i.test(target.url));
}

function localMediaUrl(filePath: string): string {
  if (/^https?:\/\/127\.0\.0\.1:\d+\/media\//i.test(filePath)) return filePath;
  if (filePath.startsWith("/")) return `${LOCAL_MEDIA_ORIGIN}${encodeURIComponent(filePath)}`;
  return "";
}

async function hydrateReference(reference: StudioReference): Promise<StudioReference> {
  if (reference.base64) return reference;
  const source = localMediaUrl(String(reference.filePath || ""));
  if (!source) return reference;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not read Flow reference ${reference.assetId} from local media server (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`Local Flow reference ${reference.assetId} was empty.`);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  const mimeType = reference.mimeType || response.headers.get("content-type")?.split(";", 1)[0] || "image/png";
  return { ...reference, mimeType, base64: `data:${mimeType};base64,${btoa(binary)}` };
}

async function hydrateFlowReferences(references: StudioReference[] | undefined): Promise<StudioReference[]> {
  return Promise.all((references || []).map(hydrateReference));
}

// The Flow sandbox can expose controls through a hydrated custom element before
// its button subtree is available to the debugger. Keep the visible-control
// check as the strongest signal, but accept the same user-facing bridge labels
// from the hydrated document so we do not discard a real Studio Shot Bridge
// iframe during reload/reconnect races.
const bridgePreviewReadyExpression = `(() => { const visible = (item) => { const rect = item.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; }; const body = String(document.body?.innerText || ""); const root = String(document.querySelector("#root")?.innerText || ""); const pageText = [body, root, String(document.documentElement?.innerText || "")].join("\\n"); const flowApp = /^Flow App(?:\\s|$)/i.test(String(document.title || "")); const freshRelay = /relay bridge/i.test(pageText) && /(?:generate video|execute relay job|trigger relay)/i.test(pageText); const shellRelay = /STUDIO-TO-PROVIDER PROTOCOL PROXY/i.test(pageText) && /(?:IDLE \/ WAITING|AWAITING STUDIO_SHOT_REQUEST)/i.test(pageText); const bridgeShell = /studio shot bridge/i.test(pageText) || freshRelay || shellRelay || (flowApp && Boolean(document.querySelector("#root"))); const controls = [...document.querySelectorAll("button, [role='button'], [class*='cursor-pointer']")].some((item) => /(?:select|connect) storyboard|add reference|(?:generate video|execute relay job|trigger relay)/i.test(String(item.innerText || item.getAttribute("aria-label") || "").trim()) && visible(item)); return bridgeShell && (controls || shellRelay || /(?:connect storyboard|select storyboard|add reference|storyboard keyframe|visual references|(?:generate video|execute relay job|trigger relay))/i.test(pageText)); })()`;

function localFlowCommandExpression(expression: string): string {
  if (expression.startsWith("__STUDIO_CLICK_BUTTON__:")) {
    const label = JSON.stringify(expression.slice("__STUDIO_CLICK_BUTTON__:".length).trim().toLowerCase());
    return `(() => { const needle = ${label}; const visible = (item) => { const rect = item.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; }; const textOf = (item) => String(item.innerText || item.textContent || item.getAttribute("aria-label") || "").trim().toLowerCase(); const candidates = [...document.querySelectorAll("button, [role='button'], .cursor-pointer, div")].filter((item) => visible(item) && textOf(item).includes(needle)); const exact = candidates.find((item) => textOf(item) === needle); const smallest = [...candidates].sort((a, b) => textOf(a).length - textOf(b).length)[0]; const iconAdd = needle === "add reference" ? [...document.querySelectorAll("button, [role='button']")].find((item) => { if (!visible(item) || !/^(?:add|\\+)$/i.test(textOf(item))) return false; let context = ""; let ancestor = item.parentElement; for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) context += " " + String(ancestor.innerText || ancestor.textContent || ""); return /(?:visual references|tài nguyên trực quan)/i.test(context); }) : undefined; const target = (exact || smallest)?.closest?.("button, [role='button'], .cursor-pointer") || exact || smallest || iconAdd; if (!target) return false; const rect = target.getBoundingClientRect(); const eventInit = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerType: "mouse" }; target.dispatchEvent(new PointerEvent("pointerdown", eventInit)); target.dispatchEvent(new MouseEvent("mousedown", eventInit)); target.dispatchEvent(new PointerEvent("pointerup", eventInit)); target.dispatchEvent(new MouseEvent("mouseup", eventInit)); target.dispatchEvent(new MouseEvent("click", eventInit)); target.click(); return true; })()`;
  }
  if (expression.startsWith("__STUDIO_CONFIRM_FLOW_MEDIA__:")) {
    const filename = JSON.stringify(expression.slice("__STUDIO_CONFIRM_FLOW_MEDIA__:".length));
    return `(async () => { const name = ${filename}; const visible = (item) => { const rect = item.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; }; const tile = [...document.querySelectorAll("button, [role='button'], [role='option'], div")].filter(visible).findLast((item) => (item.textContent || "").trim() === name); if (tile) { tile.click(); await new Promise((resolve) => setTimeout(resolve, 120)); } const add = [...document.querySelectorAll("button, [role='button']")].find((item) => /^(Thêm nội dung nghe nhìn|Add media)$/i.test((item.textContent || "").trim()) && !item.disabled); add?.click(); return Boolean(add); })()`;
  }
  if (expression === "__STUDIO_DISMISS_FLOW_MEDIA_PICKER__") {
    return `(() => { const backdrop = [...document.querySelectorAll('[data-state="open"][aria-hidden="true"]')].find((item) => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }); backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 2, clientY: 2 })); return Boolean(backdrop); })()`;
  }
  return expression;
}

class StudioBridgeSession {
  private cancelled = false;
  private childSessions = new Map<string, string>();
  private childTargets = new Map<string, { targetId: string; type: string; url?: string; parentId?: string }>();
  private debugTarget: chrome.debugger.Debuggee;
  private innerCommandId = 0;
  private innerPending = new Map<number, DebugPending>();
  private innerSessionId = "";
  private remotePending = new Map<number, DebugPending>();
  private remoteSocket: WebSocket | null = null;
  private desktopFlowEvaluateUnavailable = false;
  private trustedRuntimeUrl = "";
  private trustedFrameId = "";
  private trustedDocumentEpoch = "";
  private topLevelRelay = false;

  constructor(private job: StudioJob, private tabId: number, extensionOnly = false) {
    this.debugTarget = { tabId };
    this.desktopFlowEvaluateUnavailable = extensionOnly;
  }

  private command(method: string, params?: object): Promise<any> {
    return Promise.race([
      chrome.debugger.sendCommand(this.debugTarget, method, params) as Promise<any>,
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error(`CDP command ${method} timed out`)), 10_000))
    ]);
  }

  private async evaluate(expression: string, contextId?: number) {
    const result = await this.command("Runtime.evaluate", { expression, contextId, awaitPromise: true, returnByValue: true });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "CDP evaluation failed.");
    return result?.result?.value;
  }

  private handleTargetEvent = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
    if (source.tabId !== this.tabId) return;
    if (method === "Target.attachedToTarget") {
      const event = params as { sessionId?: string; targetInfo?: { targetId?: string; type?: string; url?: string; parentId?: string } } | undefined;
      if (!event?.sessionId || !event.targetInfo?.targetId) return;
      this.childSessions.set(event.targetInfo.targetId, event.sessionId);
      this.childTargets.set(event.targetInfo.targetId, {
        targetId: event.targetInfo.targetId,
        type: String(event.targetInfo.type || ""),
        url: event.targetInfo.url,
        parentId: event.targetInfo.parentId
      });
      return;
    }
    if (method !== "Target.receivedMessageFromTarget") return;
    try {
      const response = JSON.parse(String((params as { message?: string } | undefined)?.message || "{}"));
      const pending = this.innerPending.get(Number(response.id));
      if (!pending) return;
      this.innerPending.delete(Number(response.id));
      if (response.error) pending.reject(new Error(response.error.message || "Sandbox CDP command failed."));
      else pending.resolve(response.result || {});
    } catch {}
  };

  private innerCommand(method: string, params?: object): Promise<any> {
    if (this.remoteSocket?.readyState === WebSocket.OPEN) {
      const id = ++this.innerCommandId;
      return new Promise<any>((resolve, reject) => {
        this.remotePending.set(id, { resolve, reject });
        this.remoteSocket!.send(JSON.stringify({ id, method, params }));
      });
    }
    if (!this.innerSessionId) return Promise.reject(new Error("No inner session selected."));
    const id = ++this.innerCommandId;
    return new Promise<any>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      const wrappedResolve = (value: unknown) => { clearTimeout(timeoutId); resolve(value); };
      const wrappedReject = (error: unknown) => { clearTimeout(timeoutId); reject(error); };
      timeoutId = setTimeout(() => {
        this.innerPending.delete(id);
        wrappedReject(new Error(`Inner CDP command ${method} timed out`));
      }, 5000);
      this.innerPending.set(id, { resolve: wrappedResolve, reject: wrappedReject });
      this.command("Target.sendMessageToTarget", { sessionId: this.innerSessionId, message: JSON.stringify({ id, method, params: params || {} }) })
        .catch((error) => { this.innerPending.delete(id); wrappedReject(error); });
    });
  }

  private async evaluateInner(expression: string) {
    if (runtime.bridgeIsOpen() && !this.desktopFlowEvaluateUnavailable) {
      try {
        return await Promise.race([
          runtime.requestDesktopFlowToolEvaluate(expression),
          // Flow can take longer than a normal DOM query while its editor is
          // hydrating or recovering a generation. Keep the wait bounded, but
          // do not convert a temporarily busy provider tab into a false
          // unrecoverable failure after only ten seconds. If the optional
          // desktop CDP route is unavailable, the debugger attached directly
          // to this tab is the authoritative fallback for the whole session.
          new Promise((_, reject) => setTimeout(() => reject(new Error("Desktop Flow tool evaluation did not answer promptly.")), 8_000))
        ]);
      } catch (error) {
        this.desktopFlowEvaluateUnavailable = true;
        // Embedded Chromium hosts may not expose the optional
        // desktop CDP port (9222). Once the extension debugger is attached,
        // the already-discovered Flow iframe is authoritative and can handle
        // both plain expressions and the small command vocabulary below.
        if (!this.innerSessionId && !this.remoteSocket && !(await this.connectRemoteSandbox())) {
          await this.discoverChildSandbox("");
        }
      }
    }
    return this.evaluateAttachedInner(localFlowCommandExpression(expression));
  }

  private async evaluateAttachedInner(expression: string) {
    const result = await this.innerCommand("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Sandbox CDP evaluation failed.");
    return result.result?.value;
  }

  private async waitInner(expression: string, timeoutMs: number, label: string) {
    const startedAt = Date.now();
    let rebound = false;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        if (await this.evaluateInner(expression)) return;
      } catch (error) {
        // A Flow reload can destroy the srcdoc target while leaving the top
        // page alive. Re-discover the child once so the next poll uses the
        // replacement CDP session instead of waiting on a stale attachment.
        if (!rebound && /Studio Shot Bridge controls|storyboard media|continuity reference/i.test(label)) {
          rebound = true;
          this.innerSessionId = "";
          this.childSessions.clear();
          this.childTargets.clear();
          await this.discoverChildSandbox("").catch(() => undefined);
          continue;
        }
        throw error;
      }
      // Some detached CDP sessions resolve Runtime.evaluate with an empty
      // value rather than an error. Give the replacement iframe one bounded
      // chance when controls remain absent for a few seconds.
      if (!rebound && Date.now() - startedAt >= 3_000 && /Studio Shot Bridge controls/i.test(label)) {
        rebound = true;
        this.innerSessionId = "";
        this.childSessions.clear();
        this.childTargets.clear();
        await this.discoverChildSandbox("").catch(() => undefined);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${label}.`);
  }

  private async connectRemoteSandbox() {
    try {
      const target = await findRemoteSandboxTarget();
      if (!target?.webSocketDebuggerUrl) return false;
      this.remoteSocket = new WebSocket(target.webSocketDebuggerUrl);
      this.remoteSocket.addEventListener("message", (event) => this.resolveRemoteMessage(event));
      await waitForRemoteSocket(this.remoteSocket);
      await this.innerCommand("Runtime.enable");
      const valid = /^Flow App(?:\s|$)/i.test(String(await this.evaluateInner("document.title")))
        && Boolean(await this.evaluateInner(bridgePreviewReadyExpression));
      if (valid) return true;
    } catch {}
    this.remoteSocket?.close();
    this.remoteSocket = null;
    return false;
  }

  private resolveRemoteMessage(event: MessageEvent) {
    try {
      const response = JSON.parse(String(event.data || "{}"));
      const pending = this.remotePending.get(Number(response.id));
      if (!pending) return;
      this.remotePending.delete(Number(response.id));
      if (response.error) pending.reject(new Error(response.error.message || "Remote sandbox CDP command failed."));
      else pending.resolve(response.result || {});
    } catch {}
  }

  private async discoverChildSandbox(rootTargetId: string) {
    const diagnostics = new Set<string>();
    for (let attempt = 0; attempt < 60; attempt++) {
      // Target.setAutoAttach only reports frames created after it is enabled.
      // Flow can hydrate the custom-tool iframe before the debugger attaches,
      // leaving an already-live frame absent from childTargets. Enumerate and
      // attach those existing iframe targets as well; the saved tool may use a
      // non-about:srcdoc URL after a Flow shell update.
      if (attempt === 0) {
        const targetResult = await this.command("Target.getTargets").catch(() => ({})) as { targetInfos?: Array<{ targetId?: string; type?: string; url?: string; parentFrameId?: string }> };
        for (const target of targetResult.targetInfos || []) {
          // Existing targets returned by chrome.debugger may omit
          // parentFrameId even though they belong to the attached page. Only
          // reject an iframe when a parent id is present and proves it is a
          // different root; title/body checks below still identify Flow's
          // Studio Shot Bridge target.
          if (!isFlowSandboxTarget(target) || (rootTargetId && target.parentFrameId && target.parentFrameId !== rootTargetId) || !target.targetId) continue;
          if (this.childSessions.has(target.targetId)) continue;
          const attached = await this.command("Target.attachToTarget", { targetId: target.targetId, flatten: false }).catch((error) => {
            diagnostics.add(`${target.url || "iframe"}: attach failed: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
          });
          const sessionId = String(attached?.sessionId || "");
          if (!sessionId) continue;
          this.childSessions.set(target.targetId, sessionId);
          this.childTargets.set(target.targetId, { targetId: target.targetId, type: "iframe", url: target.url, parentId: target.parentFrameId });
        }
      }
      const candidates = Array.from(this.childTargets.values()).filter((info) => isFlowSandboxTarget(info) && (!rootTargetId || !info.parentId || info.parentId === rootTargetId));
      let freshEmptyCandidate: typeof candidates[number] | undefined;
      for (const candidate of candidates) {
        this.innerSessionId = String(this.childSessions.get(candidate.targetId) || "");
        if (!this.innerSessionId) continue;
        try {
          await this.innerCommand("Runtime.enable");
          const title = String(await this.evaluateInner("document.title").catch(() => ""));
          const body = String(await this.evaluateInner("document.body?.innerText?.slice(0, 800) || ''").catch(() => ""));
          diagnostics.add(`${candidate.url}: ${title} ${body}`.trim());
          // A generation can replace the srcdoc document before React has
          // painted its controls. The title is still the authoritative target
          // identity; return the session and let waitInner poll until the
          // Bridge controls hydrate instead of discarding a valid target.
          // A replaced srcdoc can briefly expose a title-only, empty target.
          // Keep polling it, but do not select it ahead of a hydrated bridge
          // target: doing so pins the session to a stale iframe and leaves the
          // manifest at the tool's default project/shot values.
          // A freshly reloaded published Relay can expose only the Flow App
          // title while its React root is still empty. The Relay configure
          // phase owns a bounded mount fallback, so accept this exact runtime
          // shell instead of waiting on an impossible body-text predicate.
          if (/^Flow App(?:\s|$)/i.test(title) || title === "" || title === "about:srcdoc") {
            const ready = await this.evaluateInner(bridgePreviewReadyExpression);
            if (ready || /studio shot bridge/i.test(body) || /relay bridge/i.test(body)) return;
            if (isFreshRelayRuntime(this.trustedRuntimeUrl) && title !== "") freshEmptyCandidate = candidate;
          }
        } catch (error) {
          diagnostics.add(`${candidate.url || "iframe"}: evaluate failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.innerSessionId = "";
      }
      // Prefer a hydrated Relay target when several srcdoc frames coexist.
      // Only fall back to a title-only fresh runtime after every candidate in
      // this scan has been inspected; otherwise a stale empty iframe can win
      // election and hide the real Relay controls.
      if (freshEmptyCandidate) {
        this.innerSessionId = String(this.childSessions.get(freshEmptyCandidate.targetId) || "");
        if (this.innerSessionId) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Studio Shot Bridge sandbox target was not found: ${JSON.stringify(Array.from(diagnostics).slice(0, 5))}`);
  }

  private async rootDocumentIdentity() {
    const result = await this.command("Page.getFrameTree").catch(() => ({})) as {
      frameTree?: { frame?: { id?: string; loaderId?: string } }
    };
    const frame = result.frameTree?.frame;
    return { frameId: String(frame?.id || ""), documentEpoch: String(frame?.loaderId || "") };
  }

  private async captureTrustedDocumentIdentity() {
    const identity = await this.rootDocumentIdentity();
    this.trustedFrameId = identity.frameId;
    this.trustedDocumentEpoch = identity.documentEpoch;
  }

  private async attachAndDiscover() {
    console.log("[DEBUG] attachAndDiscover started");
    const initialTab = await chrome.tabs.get(this.tabId).catch(() => undefined);
    const runtimeUrl = String(initialTab?.url || "");
    if (/\/tools\/flow\/project\/[^/]+\/tool\//i.test(runtimeUrl) && !/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)/i.test(runtimeUrl)) {
      throw new Error("Studio Shot Bridge đang mở ở bản DRAFT /tool/. Hãy mở Công cụ → PDL Studio Shot Bridge, hoàn tất chỉnh sửa và bấm Xong để mở bản runtime /tool-version/ đã publish trước khi tạo video.");
    }
    this.trustedRuntimeUrl = canonicalFlowRoute(runtimeUrl);
    await Promise.race([
      chrome.debugger.attach(this.debugTarget, "1.3"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Chrome DevTools debugger attach timed out; another debugger may still own the Flow tab.")), 10_000))
    ]);
    chrome.debugger.onEvent.addListener(this.handleTargetEvent);
    await this.command("Runtime.enable");
    await this.command("Page.enable");
    await this.command("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
    // Some current Flow projects render the runner as a same-process sandboxed
    // iframe. Playwright can see its `Flow app` document, but Chrome's Target
    // domain intentionally omits it from getTargets/frameTree. The parent
    // window is still the runner's real message boundary, so use that narrow
    // boundary when the exact Flow runner shim is present.
    const hasRunnerShim = await this.evaluate(`(() => [...document.querySelectorAll('iframe')].some((frame) => /\/flow-applet-runner\/shim\.html(?:[?#]|$)/i.test(String(frame.src || ''))))()`).catch(() => false);
    if (hasRunnerShim) {
      this.topLevelRelay = true;
      await this.captureTrustedDocumentIdentity();
      return;
    }
    // Reuse an already hydrated Studio Shot Bridge before reloading Flow. A
    // reload tears down the srcdoc iframe and its MessageEvent callback; when
    // the runtime is visibly healthy that teardown is the race that turns a
    // valid picker into a controls timeout. Reload remains the bounded
    // fallback for a tab whose sandbox cannot be discovered.
    const existingRootFrame = await this.command("Page.getFrameTree").catch(() => ({})) as { frameTree?: { frame?: { id?: string } } };
    try {
      await this.discoverChildSandbox(String(existingRootFrame.frameTree?.frame?.id || ""));
      await this.captureTrustedDocumentIdentity();
      return;
    } catch {
      this.innerSessionId = "";
      this.childSessions.clear();
      this.childTargets.clear();
    }
    // Reload only after the debugger is attached. A second reload used to
    // tear down Flow's nested Studio Shot Bridge iframe and leave the job
    // waiting on a stale frame even though the visible tab looked healthy.
    await chrome.tabs.reload(this.tabId);
    try {
      // Flow is an SPA and may keep the tab in `loading` while its composer
      // and bridge iframe are already usable (reCAPTCHA can also hold the
      // browser status open). Do not block iframe discovery on that hint.
      await runtime.waitForTabComplete(this.tabId, 20_000);
    } catch {
      runtime.sendStatus(this.job.jobId, "opening_provider", "Flow vẫn đang tải nền; tiếp tục kiểm tra iframe Studio Shot Bridge...", 0.2);
    }
    // Flow can recover a crashed custom tool by silently replacing the
    // /tool-version/ route with the project workspace. That leaves the
    // visible tab signed in but destroys the Studio Shot Bridge iframe, so
    // restore the exact runtime route before discovering the sandbox.
    const afterReload = await chrome.tabs.get(this.tabId).catch(() => undefined);
    if (/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+/i.test(runtimeUrl) && !/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+/i.test(String(afterReload?.url || ""))) {
      runtime.sendStatus(this.job.jobId, "opening_provider", "Flow đã chuyển về workspace; đang mở lại đúng Studio Shot Bridge runtime...", 0.22);
      await chrome.tabs.update(this.tabId, { url: runtimeUrl });
      await runtime.waitForTabComplete(this.tabId, 30_000).catch(() => undefined);
    }
    console.log("[DEBUG] attachAndDiscover: Waiting 1800ms before discovering iframe");
    await new Promise((resolve) => setTimeout(resolve, 1800));
    // The root Flow page has its own title; the Studio Shot Bridge controls
    // live in a nested iframe. Do not poll the root document for the iframe's
    // title (or require the optional 9222 CDP port) before discovering it.
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await this.connectRemoteSandbox()) {
      await this.captureTrustedDocumentIdentity();
      return;
    }
    const rootFrame = await this.command("Page.getFrameTree") as { frameTree?: { frame?: { id?: string } } };
    console.log("[DEBUG] attachAndDiscover: discoverChildSandbox called");
    await this.discoverChildSandbox(String(rootFrame.frameTree?.frame?.id || ""));
    console.log("[DEBUG] attachAndDiscover: discoverChildSandbox finished");
    await this.captureTrustedDocumentIdentity();
    console.log("[DEBUG] attachAndDiscover: done");
  }

  private async primeMedia(references: StudioReference[]) {
    const response = await chrome.tabs.sendMessage(this.tabId, {
      action: "PRIME_FLOW_MEDIA", jobId: this.job.jobId, references
    }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    if (!response?.ok) {
      const detail = String(response?.error || "content script did not respond");
      if (/primeFlowSdkMedia\([^)]*\)\.then is not a function/i.test(detail)) {
        throw new Error("Studio Shot Bridge is running an older media-selection implementation. Open the Flow tool in Edit, apply the latest update, click Xong, then reopen the canonical tool before retrying.");
      }
      throw new Error(`Studio Shot Bridge could not prepare Flow media selection: ${detail}`);
    }
  }

  private async validateSelectedStoryboard(keyframe: StudioReference) {
    const expected = `data:${keyframe.mimeType || "image/png"};base64,${String(keyframe.base64).replace(/^data:[^,]+,/, "")}`;
    const validation = await this.evaluateInner(`(async () => {
      const actual = document.querySelector('img[alt="Storyboard"]'); if (!actual?.src) return { passed: false, error: "preview missing" };
      const load = (source) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
      try { const source = await load(${JSON.stringify(expected)}); const pixels = (image) => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 32, 18); return context.getImageData(0, 0, 32, 18).data; };
        const first = pixels(source); const second = pixels(actual); let difference = 0; for (let index = 0; index < first.length; index += 4) for (let channel = 0; channel < 3; channel++) difference += Math.abs(first[index + channel] - second[index + channel]);
        const normalizedMae = difference / (32 * 18 * 3 * 255); return { passed: normalizedMae <= 0.08, normalizedMae };
      } catch (error) { return { passed: false, error: String(error) }; }
    })()`);
    if (!validation?.passed) throw new Error(`Studio Shot Bridge selected storyboard does not match the requested keyframe (${JSON.stringify(validation)}).`);
    runtime.sendStatus(this.job.jobId, "submitting", `Verified selected storyboard fingerprint (MAE ${Number(validation.normalizedMae || 0).toFixed(4)}).`, 0.5);
  }

  private async attachStoryboardMedia(): Promise<void> {
    const clicked = await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Select Storyboard Image");
    if (!clicked) await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Connect Storyboard");
    try {
      await this.waitInner("Boolean(document.querySelector('img[alt=\"Storyboard\"]'))", 90_000, "storyboard media");
    } catch (error) {
      const selectionError = await this.evaluateInner(`(() => { const errors = globalThis.__studioFlowSelectionErrors; return errors && typeof errors === "object" ? errors[${JSON.stringify(this.job.jobId)}] || "" : ""; })()`).catch(() => "");
      if (selectionError) throw new Error(`Studio Shot Bridge media selection failed: ${selectionError}`);
      const runtimeState = await this.evaluateInner(`(() => { const text = String(document.body?.innerText || ""); const bridgeShell = /studio shot bridge/i.test(text); return JSON.stringify({ draft: /\\bDRAFT\\b/i.test(text), bridgeShell, storyboardReady: Boolean(document.querySelector('img[alt=\\"Storyboard\\"]')), references: document.querySelectorAll('img[alt^=\\"Reference\\"]').length }); })()`).catch(() => "{}");
      let parsed: { draft?: boolean; bridgeShell?: boolean; storyboardReady?: boolean; references?: number } = {};
      try { parsed = JSON.parse(String(runtimeState)); } catch {}
      if (parsed.draft && !parsed.bridgeShell && !parsed.storyboardReady && Number(parsed.references || 0) === 0) {
        throw new Error("Studio Shot Bridge đang chạy trong Flow editor bản DRAFT. Hãy mở Công cụ → PDL Studio Shot Bridge, bấm Xong để lưu, rồi mở lại bản runtime /tool-version/ trước khi tạo video.");
      }
      throw error;
    }
  }

  private async clearStaleVisualReferences(): Promise<void> {
    await this.evaluateInner(`(async () => {
      const section = () => [...document.querySelectorAll('div,section')].find((item) => /(?:VISUAL REFERENCES|TÀI NGUYÊN TRỰC QUAN)\\s*\\(\\s*\\d+\\s*\\//i.test(String(item.innerText || '')));
      const closeLabels = /^(?:close|đóng|x)$/i;
      for (let pass = 0; pass < 12; pass += 1) {
        const root = section();
        if (!root) break;
        const buttons = [...root.querySelectorAll('button, [role="button"]')].filter((item) => {
          const label = String(item.getAttribute('aria-label') || item.getAttribute('title') || item.innerText || '').trim();
          return closeLabels.test(label) && item.getBoundingClientRect().width > 2;
        });
        if (!buttons.length) break;
        buttons[buttons.length - 1].click();
        await new Promise((resolve) => setTimeout(resolve, 320));
      }
      return true;
    })()`);
  }

  private async prepareMedia(keyframe: StudioReference, references: StudioReference[]) {
    await this.waitInner(bridgePreviewReadyExpression, 20_000, "Studio Shot Bridge controls");
    // Older saved tool versions still call Flow.media.select directly and
    // expect a Promise. Install a local compatibility shim in the sandbox so
    // those versions use the same strict host bridge as the current tool code.
    await this.evaluateInner(`(() => {
      const errors = globalThis.__studioFlowSelectionErrors || (globalThis.__studioFlowSelectionErrors = {});
      window.addEventListener("message", (event) => { const payload = event.data?.payload; if (event.data?.type === "FLOW_RESPONSE" && payload?.error) errors[${JSON.stringify(this.job.jobId)}] = String(payload.error); }, true);
      const flow = globalThis.Flow;
      if (!flow?.media || typeof flow.media.select !== "function" || flow.media.select.__studioBridgeShim) return Boolean(flow?.media?.select);
      const select = () => new Promise((resolve, reject) => {
        const id = "studio-media-" + Math.random().toString(36).slice(2);
        const onMessage = (event) => {
          if (event.data?.type !== "FLOW_RESPONSE" || event.data?.id !== id) return;
          window.removeEventListener("message", onMessage);
          const payload = event.data?.payload || {};
          payload.error ? reject(new Error(String(payload.error))) : resolve(payload);
        };
        window.addEventListener("message", onMessage);
        window.parent.postMessage({ type: "FLOW_SELECT_MEDIA", id, payload: { filter: "image" } }, "*");
        setTimeout(() => { window.removeEventListener("message", onMessage); reject(new Error("Studio media selection timed out.")); }, 30_000);
      });
      select.__studioBridgeShim = true;
      flow.media.select = select;
      return true;
    })()`);
    await this.attachStoryboardMedia();
    await this.validateSelectedStoryboard(keyframe);
    // Preserve the storyboard slot while removing stale continuity references
    // left by an earlier failed attempt.
    await this.clearStaleVisualReferences();
    for (let index = 0; index < references.length; index++) {
      await this.waitInner(`(() => [...document.querySelectorAll('button, [role="button"]')].some((item) => {
        const text = String(item.innerText || item.textContent || item.getAttribute('aria-label') || '').trim();
        const rect = item.getBoundingClientRect();
        const labelled = /(?:add reference|thêm tham chiếu)/i.test(text);
        // Flow renders this control as a Material icon in some locales/builds
        // (the text "add") and changes the number of wrapper elements when a selected
        // tile hydrates. Walk a few ancestors instead of assuming a fixed
        // parent depth, while still requiring the Visual References section
        // context so unrelated add buttons cannot satisfy the wait.
        let context = '';
        let ancestor = item.parentElement;
        for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) context += ' ' + String(ancestor.innerText || ancestor.textContent || '');
        const iconAdd = (text === 'add' || text === '+') && /(?:visual references|tài nguyên trực quan)/i.test(context);
        return (labelled || iconAdd) && !item.disabled && item.getAttribute('aria-disabled') !== 'true' && rect.width > 2 && rect.height > 2;
      }))()`, 20_000, "Add Reference control");
      await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Add Reference");
      // Published `/tool-version/` runtimes resolve each SDK selection through
      // the base-workspace relay. Sending the legacy host-picker confirmation
      // at the same time races that relay and can leave a picker open, which
      // then makes the next reference report a missing composer add button.
      // Keep the confirmation only for old/editor routes that do not support
      // the runtime relay yet.
      if (!/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)/i.test(String(this.job.providerWorkspaceUrl || this.job.settings?.providerWorkspaceUrl || this.job.flowRuntimeUrl || ""))) {
        const reference = references[index];
        void chrome.tabs.sendMessage(this.tabId, {
          action: "CONFIRM_FLOW_MEDIA",
          filename: reference.filename || reference.filePath || ""
        }).catch(() => undefined);
      }
      await this.waitInner(`(() => {
        const expected = ${index + 1};
        const labelled = document.querySelectorAll('img[alt^="Reference"]').length;
        const body = String(document.body?.innerText || "");
        const countMatch = body.match(/(?:VISUAL REFERENCES|TÀI NGUYÊN TRỰC QUAN)\\s*\\(\\s*(\\d+)\\s*\\//i);
        const counted = countMatch ? Number(countMatch[1]) : 0;
        const closeButtons = [...document.querySelectorAll('button, [role="button"]')].filter((item) => /^(?:close|đóng|x)$/i.test(String(item.innerText || item.getAttribute('aria-label') || '').trim())).length;
        return labelled >= expected || counted >= expected || closeButtons >= expected;
      })()`, 20_000, `continuity reference ${index + 1}`);
    }
  }

  private manifest(keyframe: StudioReference, references: StudioReference[], resolvedMediaId = "") {
    const durationSeconds = manifestDuration(this.job.settings);
    const settings = this.job.settings || {};
    const voice = settings.characterVoice && typeof settings.characterVoice === "object" ? settings.characterVoice as Record<string, unknown> : null;
    const voiceLock = voice && String(voice.characterId || "").trim() && String(voice.voiceId || "").trim() && String(voice.lockedAt || "").trim()
      ? {
        characterId: String(voice.characterId),
        voiceId: String(voice.voiceId),
        voiceSignature: String(voice.voiceSignature || `${voice.voiceId}:${voice.characterId}:${settings.outputLanguage || ""}`),
        lockedAt: String(voice.lockedAt || "")
      } : null;
    const sourceMode = String(settings.sourceMode || settings.flowVideoMode || "frames");
    const componentReferences = [keyframe, ...references].map((reference) => String(reference.assetId || "").trim()).filter(Boolean);
    return {
      durationSeconds,
      value: {
        schemaVersion: 2,
        jobId: this.job.jobId, projectId: String(settings.projectId || "studio_project"), shotId: String(settings.shotId || this.job.jobId), prompt: this.job.prompt,
        aspectRatio: String(settings.aspectRatio || "16:9"), durationSeconds,
        idempotencyKey: String(settings.idempotencyKey || `${this.job.jobId}:studio-shot-bridge:v1`),
        sourceMode,
        flowVideoMode: sourceMode,
        componentIds: sourceMode === "components" ? componentReferences : undefined,
        quality: String(settings.quality || "fast"),
        modelDisplayName: String(settings.modelDisplayName || "Omni Flash"), outputResolution: String(settings.outputResolution || "720p"),
        generateAudio: settings.generateAudio === true, characterVoice: settings.characterVoice || null,
        audioPolicy: String(settings.audioPolicy || (settings.generateAudio === true ? "native_audio" : "separate_audio_pass")),
        voiceLock,
        // The fresh Relay runtime consumes the provider identity from the
        // manifest as well as the visible media input. Keep both fields in
        // sync; previously the resolver ran only while filling the input,
        // leaving `fe_id` blank and allowing the applet to submit a logically
        // incomplete I2V request.
        fe_id: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || (keyframe as StudioReference & { flowMediaId?: string }).flowMediaId || ""),
        // Relay v2 names the same provider tile identity explicitly. Keep the
        // legacy `fe_id` for the published v1 app while emitting the canonical
        // field so a v2 runtime can validate frames without translation.
        imageMediaId: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || (keyframe as StudioReference & { flowMediaId?: string }).flowMediaId || ""),
        // V3 consumes the strict storyboard-reference contract directly. The
        // frame is the only storyboard reference; continuity/semantic assets
        // remain outside this one-reference provider boundary.
        references: [{
          assetId: String(keyframe.assetId || ""),
          mediaId: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || (keyframe as StudioReference & { flowMediaId?: string }).flowMediaId || ""),
          imageMediaId: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || (keyframe as StudioReference & { flowMediaId?: string }).flowMediaId || ""),
          role: "storyboard"
        }],
        outputLanguage: String(settings.outputLanguage || "Vietnamese"),
        shotSpec: settings.shotSpec || null,
        referenceRoles: Object.fromEntries([keyframe, ...references].map((reference) => [reference.assetId, reference.referenceRole || "style"]))
      }
    };
  }

  private async configure(manifest: Record<string, unknown>, durationSeconds: number) {
    await this.evaluateInner(`(() => {
      const setValue = (element, value) => { const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); };
      const textareas = [...document.querySelectorAll("textarea")]; setValue(textareas[0], ${JSON.stringify(JSON.stringify(manifest, null, 2))});
      setValue(textareas.find((item) => /cinematic action/i.test(item.placeholder)), ${JSON.stringify(this.job.prompt)});
      const durationInput = document.querySelector('input[type="number"]'); if (durationInput) setValue(durationInput, ${JSON.stringify(String(durationSeconds))}); return true;
    })()`);
    await this.waitInner("/\\bREADY\\b/.test(document.body.innerText) && /MODE:\\s*I2V/i.test(document.body.innerText)", 20_000, "I2V preflight");
    const voice = this.job.settings?.characterVoice;
    if (!voice) return;
    const retained = await this.evaluateInner(`(() => { try { const value = document.querySelector('textarea')?.value || ''; const manifest = JSON.parse(value); return manifest.characterVoice?.voiceId === ${JSON.stringify(voice.voiceId)} && manifest.characterVoice?.characterId === ${JSON.stringify(voice.characterId)}; } catch { return false; } })()`);
    if (!retained) throw new Error(`Studio Shot Bridge did not retain requested voice ${voice.voiceId} for character ${voice.characterId}.`);
  }

  private async resolveFreshRelayMediaId(settings: Record<string, unknown>, keyframe: StudioReference): Promise<string> {
    let mediaId = String(settings.flowMediaId || settings.imageMediaId || (keyframe as StudioReference & { flowMediaId?: string }).flowMediaId || "");
    if (mediaId) return mediaId;
    const runtimeUrl = String(this.job.providerWorkspaceUrl || this.job.settings?.providerWorkspaceUrl || this.job.flowRuntimeUrl || "");
    const projectId = (() => { try { return new URL(runtimeUrl).pathname.match(/\/project\/([^/]+)/i)?.[1] || ""; } catch { return ""; } })();
    const tabs = await chrome.tabs.query({ url: ["https://labs.google/fx/*", "https://labs.google.com/fx/*", "https://flow.google.com/project/*"] });
    const bases = tabs.filter((tab) => {
      if (!tab.id || !tab.url || /\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)/i.test(tab.url)) return false;
      try { return !projectId || new URL(tab.url).pathname.replace(/\/$/, "").endsWith(`/project/${projectId}`); } catch { return false; }
    });
    const orderedBases = bases.sort((left, right) => Number(new URL(String(right.url)).hostname === "flow.google.com") - Number(new URL(String(left.url)).hostname === "flow.google.com"));
    const base = orderedBases[0];
    if (!base?.id) throw new Error("Fresh Flow Video Relay Bridge needs a project media id for I2V: Flow workspace base tab was not found beside the published relay runtime.");
    try {
      await chrome.tabs.sendMessage(base.id, { action: "PING_STUDIO_ADAPTER" });
      // The published Relay runtime must use the workspace's bounded direct
      // upload/reuse path. Without this flag the workspace opens the virtual
      // component picker, which is unreliable on a fresh project and can
      // strand a valid job in `submitting`.
      const resolved = await chrome.tabs.sendMessage(base.id, { action: "RESOLVE_FLOW_REFERENCE", jobId: this.job.jobId, reference: keyframe, preferDirectUpload: true });
      if (resolved?.ok && resolved.mediaId) mediaId = String(resolved.mediaId);
      else throw new Error(String(resolved?.error || "workspace reference resolver returned no media id"));
    } catch (error) {
      throw new Error(`Fresh Flow Video Relay Bridge needs a project media id for I2V: ${error instanceof Error ? error.message : String(error)}`);
    }
    return mediaId;
  }

  /** Configure the fresh Flow Video Relay Bridge form.  Its contract is
   * deliberately smaller than the removed picker-based app: manifest JSON,
   * optional Gallery media id, aspect ratio, and duration. */
  private async configureFreshRelay(manifest: Record<string, unknown>, durationSeconds: number, keyframe: StudioReference, resolvedMediaId = "") {
    const settings = this.job.settings || {};
    // Some Flow runtime versions load the srcdoc and import map but skip the
    // bootstrap module's top-level mount, leaving an empty Applet preview.
    // Mount the published app once in that narrow state so the existing form
    // contract can be used; never replace a non-empty user/runtime document.
    const mounted = await this.evaluateInner(`(async () => {
      const root = document.getElementById("root");
      if (!root || root.childElementCount > 0) return true;
      try {
        const appModule = await import("@app");
        const react = await import("react");
        const renderer = await import("react-dom/client");
        const component = appModule.default || appModule.App;
        if (!component) return false;
        renderer.createRoot(root).render(react.createElement(component));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return root.childElementCount > 0;
      } catch (error) {
        console.warn("[Studio] Flow relay applet mount fallback failed", error);
        return false;
      }
    })()`);
    if (!mounted) throw new Error("Flow Video Relay Bridge applet did not mount in the runtime preview.");
    const mediaId = resolvedMediaId || await this.resolveFreshRelayMediaId(settings, keyframe);
    const aspectRatio = String(settings.aspectRatio || "16:9");
    await this.evaluateInner(`(() => {
      const setValue = (element, value) => {
        if (!element) return false;
        const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      const area = document.querySelector("textarea");
      setValue(area, ${JSON.stringify(JSON.stringify(manifest, null, 2))});
      const media = [...document.querySelectorAll("input")].find((item) => /media.?id/i.test(String(item.placeholder || item.getAttribute("aria-label") || "")));
      if (${JSON.stringify(mediaId)}) setValue(media, ${JSON.stringify(mediaId)});
      const clickText = (value) => [...document.querySelectorAll("button")].find((item) => String(item.textContent || "").trim() === value)?.click();
      clickText(${JSON.stringify(aspectRatio)});
      clickText(${JSON.stringify(`${durationSeconds}s`)});
      // Relay v2 accepts the request through the iframe parent channel. Keep
      // the fields both top-level and inside payload so published tool
      // revisions with either envelope shape remain interoperable. This is
      // intake only; the separate authorize/generate action remains gated in
      // the tool and is still issued at most once by generateFreshRelay().
      const request = ${JSON.stringify(createFlowRelayRequest({
        sessionId: String(this.job.settings?.sessionId || "studio-session"),
        correlationId: `${this.job.jobId}:relay-v2`,
        idempotencyKey: String(manifest.idempotencyKey || ""),
        manifest
      }))};
      const runner = [...document.querySelectorAll("iframe")].find((item) => /flow-applet-runner\/shim\.html/i.test(String(item.getAttribute("src") || "")));
      if (!runner?.contentWindow) return false;
      runner.contentWindow.postMessage(request, "*");
      // The published v3 relay has an explicit two-step guard: intake ACK is
      // not authorization. Send the matching authorization only after the
      // request has been delivered, so its Generate control can become ready
      // without weakening the tool's no-credit-on-request invariant.
      const authorize = {
        source: "rtk-ai-video-studio",
        protocolVersion: 2,
        type: "STUDIO_SHOT_AUTHORIZE",
        sessionId: String(${JSON.stringify(String(this.job.settings?.sessionId || "studio-session"))}),
        correlationId: ${JSON.stringify(`${this.job.jobId}:relay-v2`)},
        jobId: ${JSON.stringify(String(manifest.jobId || ""))},
        idempotencyKey: ${JSON.stringify(String(manifest.idempotencyKey || ""))},
        payload: { jobId: ${JSON.stringify(String(manifest.jobId || ""))}, idempotencyKey: ${JSON.stringify(String(manifest.idempotencyKey || ""))} }
      };
      // Let the relay commit its validating/ready state and emit its ACK
      // before the second protocol message is delivered. This avoids batching
      // request and authorization against the same stale React closure.
      setTimeout(() => {
        const liveRunner = [...document.querySelectorAll("iframe")].find((item) => /flow-applet-runner\/shim\.html/i.test(String(item.getAttribute("src") || "")));
        liveRunner?.contentWindow?.postMessage(authorize, "*");
      }, 350);
      return Boolean(area && runner?.contentWindow);
    })()`);
    // After a completed run the relay intentionally keeps the previous result
    // visible, so its status remains COMPLETED until the next submit. Treat the
    // next job as ready when its exact manifest/media values are retained and
    // the Generate control is enabled; generateFreshRelay separately snapshots
    // and rejects the stale result identity.
    await this.waitInner(`(() => {
      const area = document.querySelector("textarea");
      const media = [...document.querySelectorAll("input")].find((item) => /media.?id/i.test(String(item.placeholder || item.getAttribute("aria-label") || "")));
      let parsed = null; try { parsed = JSON.parse(area?.value || ""); } catch {}
      const generate = [...document.querySelectorAll("button")].find((item) => /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(String(item.textContent || "")));
      // V3 exposes the accepted manifest as read-only JSON rather than the
      // legacy textarea/media-input pair. Its enabled Generate control is the
      // authoritative post-authorize readiness signal.
      if (!area) return Boolean(generate && !generate.disabled && /(?:READY|AUTHORIZED|GENERATE VIDEO)/i.test(String(document.body?.innerText || "")));
      const manifestMediaId = String(parsed?.fe_id || parsed?.imageMediaId || parsed?.flowMediaId || "");
      const mediaMatches = !media ? manifestMediaId === ${JSON.stringify(mediaId)} : String(media.value || "") === ${JSON.stringify(mediaId)};
      return parsed?.jobId === ${JSON.stringify(String(manifest.jobId || ""))} && mediaMatches && Boolean(generate && !generate.disabled);
    })()`, 20_000, "fresh Flow relay controls");
  }

  private async generateFreshRelay() {
    if (this.job.settings?.preflightOnly === true) {
      runtime.sendToDesktop({ type: "JOB_RESULT", jobId: this.job.jobId, status: "waiting_manual_action", assets: [], error: "Fresh Flow relay preflight passed without submitting or spending credit." });
      return null;
    }
    const baseline = await this.evaluateInner(`(() => {
      const candidates = [...document.querySelectorAll("pre, code, textarea")].map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "")).filter((value) => value.includes("base64") || value.includes("mediaId") || value.includes("media_id"));
      let parsed = null; for (const value of candidates) { try { const next = JSON.parse(value); if (next?.base64 || next?.mediaId || next?.media_id) { parsed = next; break; } } catch {} }
      const encoded = typeof parsed?.base64 === "string" ? parsed.base64.replace(/^data:[^,]+,/, "") : "";
      return { mediaId: String(parsed?.mediaId || parsed?.media_id || ""), bytesFingerprint: encoded ? encoded.length + ":" + encoded.slice(0, 24) + ":" + encoded.slice(-24) : "", videoReady: Boolean(document.querySelector("video")?.currentSrc) };
    })()`);
    // The Flow sandbox can re-render its form immediately after the manifest
    // and media-id inputs dispatch their change events. Waiting for the
    // enabled control avoids a false negative where the button is visible in
    // the screenshot but has not yet been committed to the sandbox DOM. This
    // is a readiness wait, not a generation retry: the submit click below is
    // still issued at most once for this job.
    await this.waitInner(`(() => [...document.querySelectorAll("button")].some((item) => /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(String(item.textContent || "")) && !item.disabled && item.getBoundingClientRect().width > 2 && item.getBoundingClientRect().height > 2))()`, 10_000, "fresh Flow relay generate control");
    const clicked = await this.evaluateInner(`(() => {
      const buttons = [...document.querySelectorAll("button")];
      const target = buttons.find((item) => /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(String(item.textContent || "")) && !item.disabled && item.getBoundingClientRect().width > 2 && item.getBoundingClientRect().height > 2);
      if (!target) return false;
      target.click();
      return true;
    })()`);
    if (!clicked) throw new Error("Fresh Flow Video Relay Bridge generate control was not ready.");
    runtime.sendStatus(this.job.jobId, "generating", "Generating through the new Flow Video Relay Bridge...", 0.75);
    await this.waitInner(`(() => {
      // Do not scan body.innerText here: the SDK result can contain a multi-MB
      // base64 payload and makes every CDP poll needlessly expensive. Read the
      // small status label outside the result payload instead.
      const statusText = [...document.querySelectorAll("[role='status'], span, h1, h2, h3, p, label")]
        .map((item) => String(item.textContent || "").trim()).filter((value) => value.length < 120).join(" ");
      if (/\\bFAILED\\b/i.test(statusText)) return true; if (!/\\bCOMPLETED\\b/i.test(statusText)) return false;
      const candidates = [...document.querySelectorAll("pre, code, textarea")].map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "")).filter((value) => value.includes("base64") || value.includes("mediaId") || value.includes("media_id"));
      let parsed = null; for (const value of candidates) { try { const next = JSON.parse(value); if (next?.base64 || next?.mediaId || next?.media_id) { parsed = next; break; } } catch {} }
      const mediaId = String(parsed?.mediaId || parsed?.media_id || ""); const encoded = typeof parsed?.base64 === "string" ? parsed.base64.replace(/^data:[^,]+,/, "") : "";
      const fingerprint = encoded ? encoded.length + ":" + encoded.slice(0, 24) + ":" + encoded.slice(-24) : "";
      return Boolean((mediaId && mediaId !== ${JSON.stringify(String(baseline?.mediaId || ""))}) || (fingerprint && fingerprint !== ${JSON.stringify(String(baseline?.bytesFingerprint || ""))}) || (document.querySelector("video")?.currentSrc && !${JSON.stringify(Boolean(baseline?.videoReady))}));
    })()`, FLOW_RESULT_TIMEOUT_MS, "fresh Flow relay result");
    if (await this.evaluateInner(`(() => [...document.querySelectorAll("[role='status'], span, h1, h2, h3, p, label")]
      .map((item) => String(item.textContent || "").trim()).filter((value) => value.length < 120).join(" ")
      .match(/\\bFAILED\\b/i))()`)) {
      // Preserve the provider/app error that caused the terminal state. The
      // old generic message made a Relay failure indistinguishable from a
      // stale runtime, invalid Gallery media id, quota/safety rejection, or
      // an SDK exception, which forced another paid attempt just to diagnose
      // the boundary. Read only the standalone result/status nodes; never
      // persist the full enclosing Flow page or its unrelated UI text.
      const detail = await this.evaluateInner(`(() => {
        const values = [...document.querySelectorAll("pre, code, textarea, [role='status']")]
          .map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "").trim())
          .filter((value) => value && /error|failed|message|reason|code/i.test(value));
        return values.sort((left, right) => right.length - left.length)[0] || "";
      })()`).catch(() => "");
      const compact = String(detail || "").replace(/\\s+/g, " ").trim().slice(0, 1200);
      throw new Error(`Fresh Flow Video Relay Bridge reported FAILED${compact ? `: ${compact}` : "."}`);
    }
    return await this.evaluateInner(`(async () => {
      const video = document.querySelector("video");
      let videoUrl = video?.currentSrc || video?.src || video?.getAttribute("src") || "";
      // Flow renders the real result as a blob:null URL inside the sandbox.
      // That URL is not readable by Electron or the extension after the CDP
      // session closes, so materialize it in the sandbox before handoff.
      if (/^blob:/i.test(videoUrl)) {
        try {
          const response = await fetch(videoUrl);
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
          videoUrl = "data:" + (response.headers.get("content-type") || "video/mp4") + ";base64," + btoa(binary);
        } catch {}
      }
      const candidates = [...document.querySelectorAll("pre, code")]
        .map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "").trim())
        .filter((value) => value.includes("base64") && value.length > 100);
      let payload = "", parsed = null;
      for (const raw of candidates.sort((a, b) => b.length - a.length)) {
        const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
        const candidate = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
        try { const value = JSON.parse(candidate); if (typeof value?.base64 === "string" || value?.mediaId || value?.media_id) { payload = candidate; parsed = value; break; } } catch {}
      }
      const encoded = typeof parsed?.base64 === "string" ? parsed.base64.replace(/^data:[^,]+,/, "") : "";
      return { video: videoUrl || (encoded ? "data:video/mp4;base64," + encoded : ""), payload };
    })()`);
  }

  private async generate() {
    if (this.job.settings?.preflightOnly === true) {
      runtime.sendToDesktop({ type: "JOB_RESULT", jobId: this.job.jobId, status: "waiting_manual_action", assets: [], error: "Studio Shot Bridge I2V preflight passed without submitting or spending credit." });
      return null;
    }
    const clicked = await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Authorize Generation");
    if (!clicked) throw new Error("Studio Shot Bridge authorization control was not ready.");
    runtime.sendStatus(this.job.jobId, "generating", "Generating through Flow SDK in Studio Shot Bridge...", 0.75);
    await this.waitInner("/\\bCOMPLETED\\b|\\bFAILED\\b/.test(document.body.innerText)", FLOW_RESULT_TIMEOUT_MS, "Flow SDK result");
    if (await this.evaluateInner("/\\bFAILED\\b/.test(document.body.innerText)")) throw new Error("Google Flow SDK failed after authorization.");
    const result = await this.evaluateInner(`(() => {
      const video = document.querySelector("video");
      // Flow may expose the generated artifact through currentSrc/blob URL
      // without retaining a literal src attribute on the element.
      const videoUrl = video?.currentSrc || video?.src || video?.getAttribute("src") || "";
      const textNodes = [...document.querySelectorAll("pre, code, textarea, [data-testid], [role='status']")]
        .map((item) => item instanceof HTMLTextAreaElement ? item.value : item.textContent || "");
      const payload = textNodes.find((text) => text.includes('"media_id"') || text.includes('"provider_id"')) || "";
      return { video: videoUrl, payload };
    })()`);
    if (!result?.video) throw new Error("Studio Shot Bridge completed without video data.");
    return result as { video: string; payload: string };
  }

  private async revalidateBeforeSubmit(manifest: Record<string, unknown>) {
    const currentTab = await chrome.tabs.get(this.tabId).catch(() => undefined);
    const currentDocument = await this.rootDocumentIdentity();
    const route = validateFlowSubmitContext({
      expectedRuntimeUrl: this.trustedRuntimeUrl || this.job.flowRuntimeUrl,
      currentUrl: String(currentTab?.url || ""),
      expectedWorkspaceUrl: String(this.job.providerWorkspaceUrl || this.job.settings?.providerWorkspaceUrl || ""),
      expectedFrameId: this.trustedFrameId,
      currentFrameId: currentDocument.frameId,
      expectedDocumentEpoch: this.trustedDocumentEpoch,
      currentDocumentEpoch: currentDocument.documentEpoch,
      expectedAccountHint: String(this.job.settings?.accountHint || ""),
      currentAccountHint: String(this.job.settings?.currentAccountHint || "")
    });
    if (!route.ok) {
      throw new Error(`Flow submit blocked before authorization (${route.code}). The published Studio Shot Bridge route changed; no provider submit was attempted.`);
    }
    const observed = await this.evaluateInner(`(() => { try { const value = document.querySelector("textarea")?.value || ""; const parsed = JSON.parse(value); return { jobId: String(parsed.jobId || ""), idempotencyKey: String(parsed.idempotencyKey || "") }; } catch { return null; } })()`);
    if (!observed || observed.jobId !== String(manifest.jobId || "") || observed.idempotencyKey !== String(manifest.idempotencyKey || "")) {
      throw new Error("Flow submit blocked before authorization (manifest_changed). The composer no longer contains this job identity; no provider submit was attempted.");
    }
  }

  private async validateGeneratedStartFrame(keyframe: StudioReference) {
    const expected = `data:${keyframe.mimeType || "image/png"};base64,${String(keyframe.base64).replace(/^data:[^,]+,/, "")}`;
    return this.evaluateInner(`(async () => {
      const video = document.querySelector('video[src]'); if (!video?.src) return { passed: false, error: "video missing" };
      try { const storyboard = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = ${JSON.stringify(expected)}; });
        if (video.readyState < 2) await new Promise((resolve, reject) => { video.addEventListener('loadeddata', resolve, { once: true }); video.addEventListener('error', reject, { once: true }); });
        if (video.currentTime !== 0) await new Promise((resolve) => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0; });
        const luma = (media) => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18; const context = canvas.getContext('2d'); context.drawImage(media, 0, 0, 32, 18); const pixels = context.getImageData(0, 0, 32, 18).data; const values = []; for (let index = 0; index < pixels.length; index += 4) values.push(.299 * pixels[index] + .587 * pixels[index + 1] + .114 * pixels[index + 2]); return values; };
        const correlation = (a, b) => { const am = a.reduce((sum, value) => sum + value, 0) / a.length; const bm = b.reduce((sum, value) => sum + value, 0) / b.length; let n = 0, av = 0, bv = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - am, y = b[i] - bm; n += x * y; av += x * x; bv += y * y; } return n / Math.sqrt(av * bv); };
        const edges = (values) => values.map((value, index) => index % 32 === 31 || index >= values.length - 32 ? 0 : Math.abs(values[index + 1] - value) + Math.abs(values[index + 32] - value));
        const first = luma(storyboard), second = luma(video); const lumaCorrelation = correlation(first, second), edgeCorrelation = correlation(edges(first), edges(second)); return { passed: lumaCorrelation >= .55 && edgeCorrelation >= .4, lumaCorrelation, edgeCorrelation };
      } catch (error) { return { passed: false, error: String(error) }; }
    })()`);
  }

  private async deliverResult(result: { video: string; payload: string }, keyframe: StudioReference, durationSeconds: number, startFrameValidation: Record<string, unknown>, executor = "chrome-cdp-v1") {
    let rawIntegration: Record<string, any> = {};
    try { rawIntegration = JSON.parse(result.payload || "{}"); } catch {}
    const integration = normalizeFlowRelayIntegration(rawIntegration);
    const hasProviderMetadata = Boolean(integration.providerJobId && integration.mediaId);
    const aspectRatio = String(this.job.settings?.aspectRatio || "16:9");
    const fallbackWidth = aspectRatio === "9:16" ? 720 : 1280;
    const fallbackHeight = aspectRatio === "9:16" ? 1280 : 720;
    const videoSource = /^blob:/i.test(String(result.video || "")) && typeof integration.base64 === "string"
      ? `data:video/mp4;base64,${integration.base64}`
      : result.video;
    await runtime.handleContentResult({
      type: "JOB_RESULT", jobId: this.job.jobId, status: hasProviderMetadata ? "done" : "review_required",
      assets: [{
        type: "video", filePath: videoSource, mimeType: "video/mp4", provider: "google-flow",
        filename: `studio-shot-bridge-${this.job.jobId}.mp4`,
        metadata: {
          studioJobId: this.job.jobId, currentJobOnly: true, startFrameAssetId: keyframe.assetId,
          aspectRatio,
          width: Number(integration.metadata?.width || fallbackWidth), height: Number(integration.metadata?.height || fallbackHeight),
          durationSeconds: Number(integration.metadata?.duration || durationSeconds), providerJobId: integration.providerJobId,
          flowMediaId: integration.mediaId, flowCustomToolExecutor: executor, storage: "data_url", startFrameValidation,
          ...(integration.sourceMode ? { sourceMode: integration.sourceMode } : {}),
          ...(integration.quality ? { quality: integration.quality } : {}),
          ...(integration.audioPolicy ? { audioPolicy: integration.audioPolicy } : {}),
          ...(typeof integration.voiceLockVerified === "boolean" ? { voiceLockVerified: integration.voiceLockVerified } : {}),
          ...(integration.voiceLock ? { voiceLock: integration.voiceLock } : {}),
          ...(integration.outputLanguage ? { outputLanguage: integration.outputLanguage } : {}),
          ...(integration.outputResolution ? { outputResolution: integration.outputResolution } : {}),
          providerIdentitySource: rawIntegration.provider_id || rawIntegration.providerJobId ? "provider-run-id" : "flow-relay-media-id",
          providerMetadataComplete: hasProviderMetadata,
          ...(hasProviderMetadata ? {} : { reviewReason: "Fresh Flow relay returned video bytes but no provider_id/media_id metadata." })
        }
      }]
    });
  }

  private cleanup() {
    for (const pending of this.remotePending.values()) pending.reject(new Error("Remote sandbox CDP connection closed."));
    this.remotePending.clear();
    this.remoteSocket?.close();
    chrome.debugger.onEvent.removeListener(this.handleTargetEvent);
    return chrome.debugger.detach(this.debugTarget).catch(() => undefined);
  }

  cancel() {
    this.cancelled = true;
    void this.cleanup();
  }

  async run() {
    // Persisted jobs intentionally keep durable filePath values instead of
    // huge base64 strings. The Bridge contract needs encoded bytes, so hydrate
    // local media only for this in-memory execution and never write it back to
    // studio-state.json.
    this.job = { ...this.job, references: await hydrateFlowReferences(this.job.references) };
    const { keyframe, references } = this.validateRunInputs();
    try {
      await this.executeRun(keyframe, references);
    } finally {
      await this.cleanup();
    }
  }

  async diagnoseIntake(payload: FlowAppDiagnosticPayload): Promise<FlowAppDiagnosticReceipt> {
    try {
      await this.attachAndDiscover();
      const runtimeUrl = canonicalFlowRoute(String((await chrome.tabs.get(this.tabId)).url || ""));
      if (runtimeUrl !== canonicalFlowRoute(payload.expectedRuntimeUrl)) throw new Error("Flow diagnostic attached to a different runtime URL.");
      const mounted = await this.evaluateInner(`(async () => {
        const root = document.getElementById("root");
        if (!root) return false;
        if (root.childElementCount > 0) return true;
        try {
          const appModule = await import("@app"), react = await import("react"), renderer = await import("react-dom/client");
          const component = appModule.default || appModule.App; if (!component) return false;
          renderer.createRoot(root).render(react.createElement(component));
          await new Promise((resolve) => requestAnimationFrame(resolve)); return root.childElementCount > 0;
        } catch { return false; }
      })()`);
      if (!mounted) throw new Error("Flow diagnostic found the runtime iframe but its app did not mount.");
      const manifestText = JSON.stringify(payload.manifest, null, 2);
      const observed = await this.evaluateInner(`(() => {
        const setValue = (element, value) => { if (!element) return false; const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); return true; };
        const area = document.querySelector("textarea");
        const media = [...document.querySelectorAll("input")].find((item) => /media.?id/i.test(String(item.placeholder || item.getAttribute("aria-label") || "")));
        if (!setValue(area, ${JSON.stringify(manifestText)})) return { appMissing: true };
        setValue(media, ${JSON.stringify(String(payload.mediaId || ""))});
        const clickText = (value) => [...document.querySelectorAll("button")].find((item) => String(item.textContent || "").trim() === value)?.click();
        clickText(${JSON.stringify(payload.aspectRatio)}); clickText(${JSON.stringify(`${payload.durationSec}s`)});
        let parsedManifest = null; try { parsedManifest = JSON.parse(area.value); } catch {}
        const selected = [...document.querySelectorAll("button")].filter((item) => item.getAttribute("aria-pressed") === "true" || item.getAttribute("data-state") === "on" || /selected|active|text-black/i.test(String(item.className || ""))).map((item) => String(item.textContent || "").trim());
        return { appMissing: false, manifestText: area.value, parsedManifest, mediaId: media?.value || "", selected, body: String(document.body?.innerText || "") };
      })()`);
      if (observed?.appMissing) return { ok: false, diagnosticId: payload.diagnosticId, stage: "flow_app_missing", runtimeUrl, manifestText: "", mediaId: "", aspectRatio: "", durationSec: 0, checks: { diagnosticId: false, manifest: false, mediaId: false, aspectRatio: false, durationSec: false } };
      const selected = Array.isArray(observed?.selected) ? observed.selected : [];
      const aspectRatio = payload.aspectRatio || "16:9";
      const durationSec = payload.durationSec || 4;
      return evaluateFlowAppDiagnosticReceipt(payload, {
        diagnosticId: payload.diagnosticId, runtimeUrl, manifestText: String(observed?.manifestText || ""), parsedManifest: observed?.parsedManifest || undefined,
        mediaId: String(observed?.mediaId || ""), aspectRatio: selected.includes(aspectRatio) ? aspectRatio : "",
        durationSec: selected.includes(`${durationSec}s`) ? durationSec : 0
      });
    } finally { await this.cleanup(); }
  }

  private validateRunInputs() {
    const keyframe = findKeyframeReference(this.job.references);
    if (!keyframe?.base64) throw new Error("Studio Shot Bridge requires the encoded shot keyframe.");
    const references = continuityReferences(this.job.references, keyframe);
    validateVoiceInput(this.job.settings);
    return { keyframe, references };
  }

  private async validateKeyframeAspect(keyframe: StudioReference): Promise<void> {
    const expected = String(this.job.settings?.aspectRatio || "16:9");
    const [expectedWidth, expectedHeight] = expected.split(":").map(Number);
    if (!expectedWidth || !expectedHeight || !keyframe.base64) return;
    const encoded = String(keyframe.base64).replace(/^data:[^,]+,/, "");
    const localDimensions = pngDimensions(keyframe);
    // Large inline references can exceed Chrome DevTools' expression budget
    // when embedded in an Image() probe. PNG geometry is self-describing, so
    // validate it locally and reserve CDP for small/non-PNG inputs.
    if (localDimensions && encoded.length > 900_000) {
      const actualRatio = localDimensions.width / localDimensions.height;
      const targetRatio = expectedWidth / expectedHeight;
      const relativeError = Math.abs(actualRatio - targetRatio) / targetRatio;
      if (relativeError > 0.04) throw new Error(`Flow I2V preflight blocked: shot keyframe is ${localDimensions.width}×${localDimensions.height} (${actualRatio.toFixed(4)}), but the job requires ${expected}. Reframe/regenerate the keyframe before submitting; no provider request was sent.`);
      return;
    }
    const actual = await this.evaluateInner(`(async () => {
      const image = new Image();
      const loaded = new Promise((resolve) => { image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => resolve(null); });
      image.src = ${JSON.stringify(`data:${keyframe.mimeType || "image/png"};base64,${encoded}`)};
      return await loaded;
    })()`).catch(() => null) as { width?: number; height?: number } | null;
    const width = Number(actual?.width || 0), height = Number(actual?.height || 0);
    if (!width || !height) throw new Error(`Flow I2V preflight could not read the shot keyframe dimensions for ${expected}.`);
    const actualRatio = width / height;
    const targetRatio = expectedWidth / expectedHeight;
    const relativeError = Math.abs(actualRatio - targetRatio) / targetRatio;
    if (relativeError > 0.04) {
      throw new Error(`Flow I2V preflight blocked: shot keyframe is ${width}×${height} (${actualRatio.toFixed(4)}), but the job requires ${expected}. Reframe/regenerate the keyframe before submitting; no provider request was sent.`);
    }
  }

  private async restorePublishedRuntime(): Promise<void> {
    const runtimeUrl = String(this.trustedRuntimeUrl || this.job.flowRuntimeUrl || "").trim();
    if (!runtimeUrl || !this.tabId) return;
    const current = await chrome.tabs.get(this.tabId).catch(() => undefined);
    if (!current?.url || /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+/i.test(current.url)) return;
    // Flow can return a custom-tool tab to the project/catalog route after a
    // completed generation. Restore the exact published runtime before the
    // next serial shot; otherwise the next job is misclassified as a missing
    // Bridge and falls into opening_provider.
    await chrome.tabs.update(this.tabId, { url: runtimeUrl });
    await runtime.waitForTabComplete(this.tabId, 20_000).catch(() => undefined);
  }

  private async runTopLevelRelay(manifest: Record<string, unknown>, durationSeconds: number, mediaId: string) {
    const correlationId = `${this.job.jobId}:relay-v2`;
    const sessionId = String(this.job.settings?.sessionId || "studio-session");
    const request = createFlowRelayRequest({
      sessionId,
      correlationId,
      idempotencyKey: String(manifest.idempotencyKey || ""),
      manifest
    });
    const response = await this.evaluate(`(() => {
      const key = "__studioRelayMessages";
      window[key] = [];
      window.addEventListener("message", (event) => {
        const value = event.data;
        if (value && value.source === "studio-shot-bridge" && value.protocolVersion === 2) window[key].push(value);
      });
      const runner = [...document.querySelectorAll("iframe")].find((item) => /flow-applet-runner\/shim\.html/i.test(String(item.getAttribute("src") || "")));
      (runner?.contentWindow || window).postMessage(${JSON.stringify(request)}, "*");
      return Boolean(runner);
    })()`);
    if (!response) throw new Error("Flow Relay Bridge runner iframe was not found; intake was not dispatched.");
    const readMessages = () => this.evaluate(`(() => window.__studioRelayMessages || [])()`);
    const waitFor = async (types: string[], timeoutMs: number) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const messages = await readMessages().catch(() => []);
        const match = (Array.isArray(messages) ? messages : []).find((value: any) => types.includes(String(value?.type || "")) && String(value?.correlationId || "") === correlationId && String(value?.jobId || "") === String(manifest.jobId || ""));
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`Timed out waiting for Flow Relay Bridge ${types.join("/")}.`);
    };
    const ack = await waitFor(["STUDIO_SHOT_ACK"], 20_000);
    if (String(ack.status || "") !== "ready") throw new Error(`Flow Relay Bridge intake rejected the manifest: ${String(ack.error || ack.message || "unknown error")}`);
    const authorize = {
      source: "rtk-ai-video-studio",
      protocolVersion: 2,
      type: "STUDIO_SHOT_AUTHORIZE",
      sessionId,
      correlationId,
      jobId: String(manifest.jobId || ""),
      idempotencyKey: String(manifest.idempotencyKey || ""),
      payload: { jobId: String(manifest.jobId || ""), idempotencyKey: String(manifest.idempotencyKey || "") }
    };
    await this.evaluate(`(() => {
      const runner = [...document.querySelectorAll("iframe")].find((item) => /flow-applet-runner\/shim\.html/i.test(String(item.getAttribute("src") || "")));
      if (!runner) return false;
      runner.contentWindow.postMessage(${JSON.stringify(authorize)}, "*");
      return true;
    })()`);
    runtime.sendStatus(this.job.jobId, "generating", "Generating through the published Flow Relay Bridge...", 0.75);
    const resultMessage = await waitFor(["STUDIO_SHOT_RESULT", "STUDIO_SHOT_ERROR"], FLOW_RESULT_TIMEOUT_MS);
    if (String(resultMessage.type) === "STUDIO_SHOT_ERROR") {
      throw new Error(`Flow Relay Bridge returned ${String(resultMessage.payload?.code || resultMessage.error || "STUDIO_SHOT_ERROR")}.`);
    }
    const payload = resultMessage.payload && typeof resultMessage.payload === "object" ? resultMessage.payload : {};
    const encoded = typeof payload.base64 === "string" ? payload.base64.replace(/^data:[^,]+,/, "") : "";
    const resultVideo = encoded ? `data:${String(payload.mimeType || "video/mp4")};base64,${encoded}` : String(payload.videoUrl || "");
    if (!resultVideo || !String(payload.mimeType || "").toLowerCase().startsWith("video/") || !(payload.providerJobId || payload.mediaId || payload.flowMediaId)) {
      throw new Error("Flow Relay Bridge returned result_unconfirmed: missing real MP4/video bytes or provider metadata.");
    }
    return { video: resultVideo, payload: JSON.stringify({ ...payload, mediaId: payload.mediaId || payload.flowMediaId, durationSeconds, sourceMode: payload.sourceMode || manifest.sourceMode }) };
  }

  private async executeRun(keyframe: StudioReference, references: StudioReference[]) {
    console.log("[DEBUG] executeRun started");
    await this.attachAndDiscover();
    console.log("[DEBUG] attachAndDiscover finished in executeRun");
    await this.validateKeyframeAspect(keyframe);
    console.log("[DEBUG] validateKeyframeAspect finished");
    const runtimeUrl = String(this.job.flowRuntimeUrl || this.job.settings?.flowRuntimeUrl || "");
    if (this.topLevelRelay) {
      runtime.sendStatus(this.job.jobId, "submitting", "Preparing the Flow Relay Bridge parent-window protocol...", 0.32);
      const resolvedMediaId = await this.resolveFreshRelayMediaId(this.job.settings || {}, keyframe);
      const configured = this.manifest(keyframe, references, resolvedMediaId);
      const result = await this.runTopLevelRelay(configured.value, configured.durationSeconds, resolvedMediaId);
      await this.deliverResult(result, keyframe, configured.durationSeconds, { passed: true, mode: "parent-window-relay" }, "flow-relay-v2");
      return;
    }
    const freshRelay = isFreshRelayRuntime(runtimeUrl) || Boolean(await this.evaluateInner(relayToolReadyExpression).catch(() => false));
    if (freshRelay) {
      runtime.sendStatus(this.job.jobId, "submitting", "Preparing the fresh Flow Video Relay Bridge...", 0.32);
      const resolvedMediaId = await this.resolveFreshRelayMediaId(this.job.settings || {}, keyframe);
      const configured = this.manifest(keyframe, references, resolvedMediaId);
      await this.configureFreshRelay(configured.value, configured.durationSeconds, keyframe, resolvedMediaId);
      const result = await this.generateFreshRelay();
      // `preflightOnly` intentionally returns no media. It already emitted a
      // terminal waiting_manual_action result and must not be converted into
      // a misleading provider failure by the outer execution path.
      if (!result) return;
      if (!result?.video) throw new Error("Fresh Flow Video Relay Bridge completed without video data.");
      await this.deliverResult(result, keyframe, configured.durationSeconds, { passed: true, mode: "relay-runtime" }, "flow-relay-v1");
      await this.restorePublishedRuntime();
      return;
    }
    runtime.sendStatus(this.job.jobId, "submitting", "Preparing Studio Shot Bridge in strict I2V mode...", 0.32);
    // Queue the exact references first. The Bridge iframe requests each item
    // only after its visible Select/Add control is clicked; the host Flow page
    // then opens its picker and resolves that request without a speculative
    // picker click on the tool shell.
    await this.primeMedia([keyframe, ...references]);
    await this.prepareMedia(keyframe, references);
    const configured = this.manifest(keyframe, references);
    await this.configure(configured.value, configured.durationSeconds);
    await this.revalidateBeforeSubmit(configured.value);
    const result = await this.generate();
    if (result) await this.deliverResult(result, keyframe, configured.durationSeconds, await this.validateGeneratedStartFrame(keyframe));
  }
}

async function probeFlowAppIntake(value: unknown): Promise<FlowAppDiagnosticReceipt> {
  const payload = normalizeFlowAppDiagnosticPayload(value);
  const tabs = await chrome.tabs.query({ url: ["https://labs.google/fx/*", "https://labs.google.com/fx/*"] });
  const expected = canonicalFlowRoute(payload.expectedRuntimeUrl);
  const matches = tabs.filter((tab) => tab.id && canonicalFlowRoute(String(tab.url || "")) === expected);
  if (matches.length !== 1) throw new Error(`Flow diagnostic requires exactly one matching runtime tab; found ${matches.length}.`);
  const job: StudioJob = { jobId: payload.diagnosticId, provider: "google-flow", task: "connection_test", prompt: "", references: [], settings: {}, download: { auto: false, filenameTemplate: payload.diagnosticId } };
  return new StudioBridgeSession(job, matches[0].id!, true).diagnoseIntake(payload);
}

async function findRemoteSandboxTarget() {
  const targets = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json()) as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>;
  return targets.find((item) => item.type === "iframe" && item.url === "about:srcdoc" && item.webSocketDebuggerUrl);
}

function waitForRemoteSocket(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Remote sandbox CDP connection timed out.")), 5000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Remote sandbox CDP connection failed.")); }, { once: true });
  });
}

function manifestDuration(settings: StudioJob["settings"] | undefined) {
  const timelineDuration = Number(settings?.timelineDurationSec || settings?.durationSec || 8);
  return [4, 6, 8, 10].find((duration) => timelineDuration <= duration) || 10;
}

function pngDimensions(reference: StudioReference): { width: number; height: number } | null {
  const encoded = String(reference.base64 || "").replace(/^data:[^,]+,/, "");
  if (!encoded || !/^iVBORw0KGgo/i.test(encoded)) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded.slice(0, 32)), (value) => value.charCodeAt(0));
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
    const view = new DataView(bytes.buffer);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  } catch { return null; }
}

function findKeyframeReference(references: StudioReference[] | undefined) {
  return (references || []).find((reference) => reference.referenceRole === "shot_keyframe") || references?.[0];
}

function continuityReferences(references: StudioReference[] | undefined, keyframe: StudioReference) {
  return (references || []).filter((reference) => reference.assetId !== keyframe.assetId && reference.referenceRole !== "shot_keyframe" && reference.base64).slice(0, 7);
}

function validateVoiceInput(settings: StudioJob["settings"] | undefined) {
  const voice = settings?.characterVoice;
  if (settings?.generateAudio === true && voice && (voice.provider !== "google-flow" || !voice.characterId || !voice.voiceId || !voice.lockedAt)) {
    throw new Error("Âm thanh thoại cần được xử lý ở bước âm thanh riêng để giữ giọng nhân vật nhất quán giữa các shot.");
  }
}

async function dispatchCustomToolJob(job: StudioJob, tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) throw new Error("Studio Shot Bridge tab has no id.");
  if (runtime.customToolActiveJobs.has(job.jobId)) {
    runtime.sendStatus(job.jobId, "submitting", "Duplicate Studio Shot Bridge dispatch ignored; this job is already active.", 0.3);
    return;
  }
  runtime.customToolActiveJobs.add(job.jobId);
  job.tabId = tab.id;
  runtime.activeJobs.set(job.jobId, job);
  runtime.sendStatus(job.jobId, "opening_provider", "Connecting to Studio Shot Bridge through Chrome DevTools...", 0.18);
  console.log("[DEBUG] dispatchCustomToolJob: session.run starting");
  const session = new StudioBridgeSession(job, tab.id);
  customToolSessions.set(job.jobId, session);
  try {
    await session.run();
    console.log("[DEBUG] dispatchCustomToolJob: session.run finished");
  } catch (err) {
    console.error("[DEBUG] dispatchCustomToolJob error:", err);
    throw err;
  } finally {
    customToolSessions.delete(job.jobId);
    runtime.customToolActiveJobs.delete(job.jobId);
    customToolScheduledJobs.delete(job.jobId);
  }
}

(globalThis as any)._dispatchCustomToolJob = dispatchCustomToolJob;
(globalThis as any)._customToolScheduledJobs = customToolScheduledJobs;
