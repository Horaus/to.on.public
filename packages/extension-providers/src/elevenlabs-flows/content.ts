console.log("[Studio] ElevenLabs Flows adapter loaded");

const ADAPTER_VERSION = "2026-07-20-elevenlabs-flows-v1";
const NODE_SELECTOR = ".react-flow__node[data-id]";
document.documentElement.dataset.studioElevenLabsFlowsAdapter = ADAPTER_VERSION;

type JobPayload = {
  jobId: string;
  prompt: string;
  task: string;
  settings?: Record<string, unknown>;
};

type FlowNodeSnapshot = {
  id: string;
  kind: string;
  label: string;
  loading: boolean;
  handles: string[];
  mediaUrls: string[];
};

function visible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function nodeKind(node: Element): string {
  const className = String(node.className);
  if (className.includes("react-flow__node-content-generation")) {
    const text = node.textContent || "";
    const handles = Array.from(node.querySelectorAll(".react-flow__handle[data-handleid]"))
      .map((handle) => handle.getAttribute("data-handleid"));
    if (handles.includes("referenceVideos") || /^\s*Video/i.test(text)) return "video-generation";
    if (/^\s*Image/i.test(text)) return "image-generation";
    return "generation";
  }
  const match = className.match(/react-flow__node-([\w-]+)/);
  return match?.[1] || "unknown";
}

function canonicalMediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function mediaUrls(node: Element): string[] {
  const kind = nodeKind(node);
  const selector = kind === "video-generation" ? "video, video source" : "img, audio, a[download]";
  return Array.from(node.querySelectorAll(selector))
    .filter((element) => mediaElementMatchesKind(element, kind))
    .map(mediaElementUrl)
    .filter(isUsableMediaUrl)
    .filter((url) => kind !== "image-generation" || isGeneratedImageUrl(url));
}

function mediaElementMatchesKind(element: Element, kind: string) {
  return kind !== "image-generation" || element instanceof HTMLImageElement
    && element.className.includes("object-contain") && !element.className.includes("blur");
}
function mediaElementUrl(element: Element) {
  if (element instanceof HTMLAnchorElement) return element.href;
  if (element instanceof HTMLSourceElement) return element.src;
  if (element instanceof HTMLMediaElement) return element.currentSrc || element.src;
  if (element instanceof HTMLImageElement) return element.currentSrc || element.src;
  return "";
}
function isUsableMediaUrl(url: string) { return Boolean(url) && !url.startsWith("data:"); }
function isGeneratedImageUrl(url: string) { return url.includes("/content_generation/") && !url.includes("/content_generation/content_asset/"); }

function mediaReady(node: Element, candidate: string): boolean {
  const canonicalCandidate = canonicalMediaUrl(candidate);
  return Array.from(node.querySelectorAll("img, video")).some((element) => {
    const source = element instanceof HTMLVideoElement
      ? element.currentSrc || element.src
      : element instanceof HTMLImageElement
        ? element.currentSrc || element.src
        : "";
    if (canonicalMediaUrl(source) !== canonicalCandidate) return false;
    if (element instanceof HTMLImageElement) {
      return element.complete && element.naturalWidth >= 256 && !element.className.includes("blur");
    }
    return element instanceof HTMLVideoElement && element.readyState >= HTMLMediaElement.HAVE_METADATA;
  });
}

function generationBlocker(): string {
  const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [data-radix-dialog-content]'))
    .find((candidate) => visible(candidate) && /upgrade to continue creating|subscribe to creator|insufficient credits|not enough credits/i.test(candidate.innerText || ""));
  if (!dialog) return "";
  const text = (dialog.innerText || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 360);
}

function inspectFlow(): FlowNodeSnapshot[] {
  return Array.from(document.querySelectorAll(NODE_SELECTOR)).map((node) => ({
    id: node.getAttribute("data-id") || "",
    kind: nodeKind(node),
    label: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 240),
    loading: node.getAttribute("data-loading") === "true" || node.getAttribute("aria-busy") === "true",
    handles: Array.from(node.querySelectorAll(".react-flow__handle[data-handleid]"))
      .map((handle) => handle.getAttribute("data-handleid") || "")
      .filter(Boolean),
    mediaUrls: mediaUrls(node)
  }));
}

function generationKind(payload: JobPayload): string {
  const requested = String(payload.settings?.generationType || payload.settings?.resultType || payload.task || "");
  if (/video/i.test(requested)) return "video-generation";
  if (/image/i.test(requested)) return "image-generation";
  throw new Error("ElevenLabs Flows job must declare image or video generation.");
}

function exactNode(nodeId: unknown): HTMLElement | null {
  if (!nodeId) return null;
  return Array.from(document.querySelectorAll<HTMLElement>(NODE_SELECTOR))
    .find((node) => node.getAttribute("data-id") === String(nodeId)) || null;
}

function resolveGenerationNode(payload: JobPayload): HTMLElement {
  const expectedKind = generationKind(payload);
  const requested = exactNode(payload.settings?.generationNodeId);
  if (requested) {
    if (nodeKind(requested) !== expectedKind) {
      throw new Error(`Node ${requested.dataset.id} is ${nodeKind(requested)}, expected ${expectedKind}.`);
    }
    return requested;
  }
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(NODE_SELECTOR))
    .filter((node) => nodeKind(node) === expectedKind);
  if (candidates.length !== 1) {
    throw new Error(`Expected one ${expectedKind} node, found ${candidates.length}. Set settings.generationNodeId.`);
  }
  return candidates[0];
}

function incomingHandleIsConnected(nodeId: string, handleId: string): boolean {
  return Array.from(document.querySelectorAll(".react-flow__edge[data-testid]"))
    .some((edge) => (edge.getAttribute("data-testid") || "").endsWith(`-${nodeId}-${handleId}`));
}

function assertGenerationContract(node: HTMLElement, payload: JobPayload): void {
  const id = node.dataset.id || "";
  if (!incomingHandleIsConnected(id, "prompt")) {
    throw new Error(`Generation node ${id} has no prompt edge. Connect a Text or LLM output first.`);
  }
  const requireReference = payload.settings?.requireReference !== false;
  if (requireReference && !incomingHandleIsConnected(id, "referenceImages") && !incomingHandleIsConnected(id, "referenceVideos")) {
    throw new Error(`Generation node ${id} has no reference media edge.`);
  }
}

function resolvePromptNode(payload: JobPayload, generationNode: HTMLElement): HTMLElement {
  const requested = exactNode(payload.settings?.promptNodeId);
  if (requested) return requested;
  const generationId = generationNode.dataset.id || "";
  const edge = Array.from(document.querySelectorAll(".react-flow__edge[data-testid]"))
    .find((candidate) => (candidate.getAttribute("data-testid") || "").endsWith(`-${generationId}-prompt`));
  const testId = edge?.getAttribute("data-testid") || "";
  const sourceId = Array.from(document.querySelectorAll<HTMLElement>(`${NODE_SELECTOR}.react-flow__node-text`))
    .map((node) => node.dataset.id || "")
    .find((id) => testId.includes(`edge-${id}-${generationId}-prompt`));
  const node = exactNode(sourceId);
  if (!node) throw new Error(`Could not resolve the Text node connected to ${generationId}. Set settings.promptNodeId.`);
  return node;
}

async function replacePrompt(promptNode: HTMLElement, prompt: string): Promise<void> {
  const editor = promptNode.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!editor) throw new Error(`Prompt node ${promptNode.dataset.id} has no editable text field.`);
  const rect = editor.getBoundingClientRect();
  editor.focus();
  const response = await chrome.runtime.sendMessage({
    source: "elevenlabs-flows-adapter",
    type: "NATIVE_INSERT_TEXT",
    x: rect.left + rect.width / 2,
    y: rect.top + Math.min(rect.height / 2, 28),
    focusOnly: true,
    text: prompt
  });
  if (!response?.ok) throw new Error(response?.error || "Native prompt insertion failed.");
  await sleep(1200);
  if ((editor.textContent || "").trim() !== prompt.trim()) {
    throw new Error("ElevenLabs prompt editor reverted the requested text after its state update.");
  }
}

function runButton(node: HTMLElement): HTMLButtonElement {
  const button = Array.from(node.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => visible(candidate) && /^run$/i.test((candidate.textContent || "").trim()));
  if (!button || button.disabled) throw new Error(`Generation node ${node.dataset.id} has no enabled Run button.`);
  return button;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function revealNode(node: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rect = node.getBoundingClientRect();
    const margin = 72;
    if (rect.left >= margin && rect.top >= margin && rect.right <= innerWidth - margin && rect.bottom <= innerHeight - margin) return;
    const pane = document.querySelector<HTMLElement>(".react-flow__pane");
    const paneRect = pane?.getBoundingClientRect();
    const response = await panCanvasTowardNode(node, rect, pane, paneRect, margin);
    if (!response?.ok) throw new Error(response?.error || "Native canvas pan failed.");
    await sleep(450);
  }
  throw new Error(`Could not bring ElevenLabs node ${node.dataset.id} into the visible canvas.`);
}

async function panCanvasTowardNode(node: HTMLElement, rect: DOMRect, pane: HTMLElement | null, paneRect: DOMRect | undefined, margin: number) {
  if (!pane || !paneRect) throw new Error(`Could not reveal ElevenLabs node ${node.dataset.id}: canvas pane is missing.`);
  const moveMode = document.querySelector<HTMLButtonElement>('button[aria-label="Move"]');
  if (!moveMode) throw new Error(`Could not reveal ElevenLabs node ${node.dataset.id}: Move tool is missing.`);
  moveMode.click();
  await sleep(120);
  const candidates = [
    [0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75],
    [0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]
  ].map(([x, y]) => ({
    x: Math.max(margin, Math.min(innerWidth - margin, paneRect.left + paneRect.width * x)),
    y: Math.max(margin, Math.min(innerHeight - margin, paneRect.top + paneRect.height * y))
  }));
  const panStart = candidates.find((candidate) => {
    const hit = document.elementFromPoint(candidate.x, candidate.y);
    return Boolean(hit && pane.contains(hit) && !hit.closest(NODE_SELECTOR) && !hit.closest("button, [role='button']"));
  });
  if (!panStart) throw new Error(`Could not reveal ElevenLabs node ${node.dataset.id}: no empty canvas drag point is visible.`);
  const desiredX = innerWidth / 2 - (rect.left + rect.width / 2);
  const desiredY = innerHeight / 2 - (rect.top + rect.height / 2);
  const maxDrag = 320;
  const deltaX = Math.max(-maxDrag, Math.min(maxDrag, desiredX));
  const deltaY = Math.max(-maxDrag, Math.min(maxDrag, desiredY));
  return chrome.runtime.sendMessage({
    source: "elevenlabs-flows-adapter",
    type: "NATIVE_DRAG_CANVAS",
    startX: panStart.x,
    startY: panStart.y,
    endX: panStart.x + deltaX,
    endY: panStart.y + deltaY
  });
}

async function waitForResult(jobId: string, node: HTMLElement, before: Set<string>, maxWaitMs: number): Promise<void> {
  const startedAt = Date.now();
  let observedRunning = false;
  let stableCandidate = "";
  let stablePolls = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(2000);
    const blocker = generationBlocker();
    if (blocker) {
      reportResult(jobId, "failed_manual", undefined, `ElevenLabs blocked generation: ${blocker}`);
      return;
    }
    const loading = node.getAttribute("data-loading") === "true" || node.getAttribute("aria-busy") === "true";
    observedRunning ||= loading;
    const current = mediaUrls(node);
    const created = current.filter((url) => !before.has(canonicalMediaUrl(url)));
    const progress = Math.min(0.92, 0.35 + ((Date.now() - startedAt) / maxWaitMs) * 0.57);
    reportStatus(jobId, "generating", loading ? "ElevenLabs generation is running..." : "Checking ElevenLabs node output...", progress);
    const candidate = created[0] || (before.size === 0 ? current[0] : "");
    const ready = Boolean(candidate && mediaReady(node, candidate));
    const stability = updateResultStability(loading, ready, candidate, stableCandidate, stablePolls);
    stableCandidate = stability.stableCandidate;
    stablePolls = stability.stablePolls;
    if (isStableResultReady({ loading, ready, candidate, stablePolls, created, observedRunning, before })) {
      const kind = nodeKind(node).startsWith("video") ? "video" : "image";
      const resultUrl = candidate;
      reportResult(jobId, "done", [{
        type: kind,
        filename: `elevenlabs-flows-${jobId}.${kind === "video" ? "mp4" : "png"}`,
        downloadPath: resultUrl,
        mimeType: kind === "video" ? "video/mp4" : "image/png",
        metadata: { providerUrl: location.href, nodeId: node.dataset.id, currentJobOnly: true }
      }]);
      return;
    }
  }
  reportResult(jobId, "failed_retryable", undefined, `Timed out waiting for output from ElevenLabs node ${node.dataset.id}.`);
}

function isStableResultReady(args: { loading: boolean; ready: boolean; candidate: string; stablePolls: number; created: string[]; observedRunning: boolean; before: Set<string> }) {
  return !args.loading && args.ready && Boolean(args.candidate) && args.stablePolls >= 2
    && (args.created.length > 0 || args.observedRunning || args.before.size === 0);
}

function updateResultStability(loading: boolean, ready: boolean, candidate: string, stableCandidate: string, stablePolls: number) {
  if (loading || !ready) return { stableCandidate, stablePolls: 0 };
  const canonicalCandidate = canonicalMediaUrl(candidate);
  return canonicalCandidate === stableCandidate
    ? { stableCandidate, stablePolls: stablePolls + 1 }
    : { stableCandidate: canonicalCandidate, stablePolls: 1 };
}

async function createNode(kind: "image-generation" | "video-generation"): Promise<FlowNodeSnapshot> {
  const label = kind === "video-generation" ? "Video generation" : "Image generation";
  const before = new Set(inspectFlow().map((node) => node.id));
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`))
    .find(visible);
  if (!button || button.disabled) throw new Error(`ElevenLabs toolbar has no enabled ${label} button.`);
  button.click();
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    await sleep(250);
    const created = inspectFlow().find((node) => !before.has(node.id) && node.kind === kind);
    if (created) return created;
  }
  throw new Error(`ElevenLabs did not create a ${label} node.`);
}

async function executeJob(payload: JobPayload): Promise<void> {
  try {
    if (!location.pathname.startsWith("/app/flows/")) throw new Error("Open a saved ElevenLabs Flow before running this job.");
    const generationNode = resolveGenerationNode(payload);
    assertGenerationContract(generationNode, payload);
    const promptNode = resolvePromptNode(payload, generationNode);
    const before = new Set(mediaUrls(generationNode).map(canonicalMediaUrl));
    reportStatus(payload.jobId, "submitting", `Updating prompt node ${promptNode.dataset.id}...`, 0.25);
    await revealNode(promptNode);
    await replacePrompt(promptNode, payload.prompt);
    await revealNode(generationNode);
    await sleep(400);
    runButton(generationNode).click();
    reportStatus(payload.jobId, "generating", `Started ${generationNode.dataset.id}.`, 0.35);
    await waitForResult(payload.jobId, generationNode, before, Number(payload.settings?.maxWaitMs || 600_000));
  } catch (error) {
    reportResult(payload.jobId, "failed_retryable", undefined, `ElevenLabs Flows automation error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function reportStatus(jobId: string, status: string, message: string, progress?: number): void {
  chrome.runtime.sendMessage({ source: "content-script", data: { type: "JOB_STATUS", jobId, status, message, progress } });
}

function reportResult(jobId: string, status: string, assets?: Array<Record<string, unknown>>, error?: string): void {
  chrome.runtime.sendMessage({ source: "content-script", data: { type: "JOB_RESULT", jobId, status, assets, error } });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "PING_STUDIO_ADAPTER") {
    sendResponse({ ok: true, adapter: "elevenlabs-flows", version: ADAPTER_VERSION, nodes: inspectFlow() });
    return false;
  }
  if (message.action === "INSPECT_ELEVENLABS_FLOW") {
    sendResponse({ ok: true, adapter: "elevenlabs-flows", url: location.href, nodes: inspectFlow() });
    return false;
  }
  if (message.action === "EXECUTE_JOB") {
    void executeJob(message.job as JobPayload);
    sendResponse({ ok: true, adapter: "elevenlabs-flows" });
    return false;
  }
  if (message.action === "CREATE_ELEVENLABS_FLOW_NODE") {
    void createNode(message.kind === "image-generation" ? "image-generation" : "video-generation")
      .then((node) => sendResponse({ ok: true, adapter: "elevenlabs-flows", node }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message.action === "CANCEL_JOB") {
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "studio-elevenlabs-flows-inspect") return;
  window.postMessage({
    source: "studio-elevenlabs-flows-inspect-result",
    requestId: event.data.requestId,
    adapter: ADAPTER_VERSION,
    url: location.href,
    nodes: inspectFlow()
  }, "*");
});

export {};
