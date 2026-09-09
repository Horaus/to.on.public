export type DirectFlowJobPayload = {
  jobId: string;
  prompt: string;
  task: string;
  settings?: Record<string, unknown>;
  references?: unknown[];
};

type BridgeWindow = Window & { __studioFlowDirectBridgeSocket?: WebSocket | null; __studioFlowDirectBridgeReconnectTimer?: number };
type DirectFlowBridgeOptions = {
  host: BridgeWindow;
  bridgeUrl: string;
  extensionVersion: string;
  providerAdapterId?: string;
  providerVisibility: () => Record<string, unknown>;
  onRunJob: (payload: DirectFlowJobPayload) => void;
  onCancelJob: (jobId: string) => void;
};

function sendSocketMessage(socket: WebSocket | null | undefined, message: Record<string, unknown>): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try { socket.send(JSON.stringify(message)); } catch { try { socket.close(); } catch {} }
}

function sendRuntimeMessageSafely(message: Record<string, unknown>): void {
  try {
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch {
    // The content script can outlive an MV3 extension reload. The direct
    // socket remains the authoritative bridge in that short transition.
  }
}

function parseJob(message: Record<string, unknown>): DirectFlowJobPayload | null {
  const provider = String(message.provider || "");
  if (provider && !["google-flow", "flow", "google-flow-web"].includes(provider)) return null;
  const jobId = String(message.jobId || "");
  const task = String(message.task || "");
  if (!jobId || !task) return null;
  return { jobId, prompt: String(message.prompt || ""), task, settings: message.settings as Record<string, unknown> | undefined, references: message.references as unknown[] | undefined };
}

function bridgeHello(socket: WebSocket, options: DirectFlowBridgeOptions): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  let extensionId = "flow-content";
  try { extensionId = chrome.runtime.id || extensionId; } catch {}
  sendSocketMessage(socket, { type: "EXTENSION_HELLO", extensionId: `${extensionId}:content-direct`, version: options.extensionVersion, providers: ["google-flow"], providerVisibility: options.providerVisibility() });
}

function handleBridgeMessage(event: MessageEvent, socket: WebSocket, options: DirectFlowBridgeOptions): void {
  let message: Record<string, unknown>;
  try { message = JSON.parse(String(event.data)); } catch { return; }
  if (message.type === "PING") return sendSocketMessage(socket, { type: "PONG", timestamp: Date.now(), extensionVersion: options.extensionVersion, activeProviders: ["google-flow"], providerVisibility: options.providerVisibility() });
  if (message.type === "RUN_JOB") {
    const payload = parseJob(message);
    if (payload) options.onRunJob(payload);
    return;
  }
  if (message.type === "CANCEL_JOB") {
    const jobId = String(message.jobId || "");
    if (jobId) options.onCancelJob(jobId);
  }
}

function scheduleBridgeReconnect(socket: WebSocket, connect: () => void, options: DirectFlowBridgeOptions): void {
  if (options.host.__studioFlowDirectBridgeSocket === socket) options.host.__studioFlowDirectBridgeSocket = null;
  window.clearTimeout(options.host.__studioFlowDirectBridgeReconnectTimer);
  options.host.__studioFlowDirectBridgeReconnectTimer = window.setTimeout(connect, 5000);
}

export function createDirectFlowBridge(options: DirectFlowBridgeOptions) {
  const sendMessage = (message: Record<string, unknown>): void => sendSocketMessage(options.host.__studioFlowDirectBridgeSocket, message);
  const connect = (): void => {
    const publishedProjectTool = /\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1)(?:[/?#]|$)/i.test(location.pathname);
    const shortProjectWorkspace = /^\/project\/[^/]+(?:\/edit\/[^/]+)?\/?$/i.test(location.pathname);
    if ((!/\/tools\/flow\/project\//i.test(location.pathname) || /\/tools\/flow\/project\/[^/]+\/tool\/[^/]+/i.test(location.pathname)) && !publishedProjectTool && !shortProjectWorkspace) return;
    const existing = options.host.__studioFlowDirectBridgeSocket;
    if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(options.bridgeUrl);
    options.host.__studioFlowDirectBridgeSocket = socket;
    socket.addEventListener("open", () => { bridgeHello(socket, options); sendRuntimeMessageSafely({ source: "google-flow-adapter", type: "ENSURE_BRIDGE_CONNECTION" }); });
    socket.addEventListener("message", (event) => handleBridgeMessage(event, socket, options));
    const reconnect = () => scheduleBridgeReconnect(socket, connect, options);
    socket.addEventListener("close", reconnect);
    socket.addEventListener("error", reconnect);
  };
  const stop = (): void => { options.host.__studioFlowDirectBridgeSocket?.close(); options.host.__studioFlowDirectBridgeSocket = null; window.clearTimeout(options.host.__studioFlowDirectBridgeReconnectTimer); };
  return { connect, stop, sendMessage };
}
