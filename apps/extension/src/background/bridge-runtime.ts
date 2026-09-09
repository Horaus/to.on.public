import discoveryState from "./discovery-state.cjs";
import pairingRuntimeModule from "./pairing-runtime.cjs";

const { createPairingRuntime } = pairingRuntimeModule;

type BridgeRuntimeOptions = {
  bridgeUrl: string;
  extensionSessionId: string;
  extensionInstanceId?: () => string;
  capabilities?: Record<string, unknown>;
  providers: string[];
  providerVisibility: () => Promise<Record<string, unknown>>;
  handleDesktopMessage: (message: Record<string, unknown>) => Promise<void>;
  pairingSecretStorageKey?: string;
  reconnectDelayMs?: number;
  flowToolTimeoutMs?: number;
};

type NativePending = { resolve: (value?: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
function settleNativeResult(message: Record<string, unknown>, clickRequests: Map<string, NativePending>, flowToolRequests: Map<string, NativePending>): boolean {
  const requestId = String(message.requestId || "");
  const collection = message.type === "NATIVE_CLICK_RESULT" ? clickRequests : message.type === "NATIVE_FLOW_TOOL_EVALUATE_RESULT" ? flowToolRequests : undefined;
  const pending = collection?.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  collection!.delete(requestId);
  if (message.ok === true) pending.resolve(message.value);
  else pending.reject(new Error(String(message.error || "Desktop native operation failed.")));
  return true;
}

type RuntimeState = {
  socket: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  connected: boolean;
  lastError: string | null;
};

function extensionIdentity(options: BridgeRuntimeOptions): string {
  return options.extensionInstanceId?.() || chrome.runtime.id;
}

function createDiscoveryController(options: BridgeRuntimeOptions, state: RuntimeState, send: (message: Record<string, unknown>) => void) {
  let discovery = discoveryState.initialDiscovery();
  let discoveryTimer: ReturnType<typeof setTimeout> | null = null;
  const socketIsOpen = () => state.socket?.readyState === 1;

  function clearDiscoveryTimer(): void {
    if (!discoveryTimer) return;
    clearTimeout(discoveryTimer);
    discoveryTimer = null;
  }

  function scheduleDiscoveryProbe(): void {
    if (discoveryTimer || !socketIsOpen()) return;
    const delayMs = discoveryState.nextSearchDelayMs(discovery);
    if (delayMs === null) return;
    discoveryTimer = setTimeout(() => { discoveryTimer = null; refreshStatus(); }, delayMs);
  }

  function sendTopologyStatus(providerVisibility: Record<string, unknown>): void {
    discovery = discoveryState.observeDiscovery(discovery, providerVisibility);
    send({ type: "EXTENSION_STATUS", extensionId: chrome.runtime.id, extensionInstanceId: extensionIdentity(options), sessionId: options.extensionSessionId, version: chrome.runtime.getManifest().version, capabilities: options.capabilities || {}, providerVisibility, discovery });
    scheduleDiscoveryProbe();
  }

  function refreshStatus(): void {
    let visibilityPromise: Promise<Record<string, unknown>>;
    try { visibilityPromise = options.providerVisibility(); }
    catch {
      visibilityPromise = Promise.resolve({});
    }
    void visibilityPromise.then(sendTopologyStatus).catch(() => {
      discovery = discoveryState.observeDiscovery(discovery, {});
      send({ type: "EXTENSION_STATUS", extensionId: chrome.runtime.id, extensionInstanceId: extensionIdentity(options), sessionId: options.extensionSessionId, version: chrome.runtime.getManifest().version, capabilities: options.capabilities || {}, providerVisibility: {}, discovery });
      scheduleDiscoveryProbe();
    });
  }

  return {
    clearDiscoveryTimer,
    refreshStatus,
    reset: () => { discovery = discoveryState.initialDiscovery(); },
    reacquire: () => { discovery = discoveryState.reacquireDiscovery(); },
    snapshot: () => ({ ...discovery }),
    scheduleDiscoveryProbe
  };
}

function createNativeRequests(options: BridgeRuntimeOptions, isOpen: () => boolean, send: (message: Record<string, unknown>) => void, clickRequests: Map<string, NativePending>, flowToolRequests: Map<string, NativePending>) {
  function requestNativeClick(tabUrl: string, x: number, y: number, expectedText = "", confirmIfUnchanged = false): Promise<void> {
    if (!isOpen()) return Promise.reject(new Error("Desktop bridge is not connected."));
    const requestId = `native-click-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { clickRequests.delete(requestId); reject(new Error("Desktop native click timed out.")); }, 5000);
      clickRequests.set(requestId, { resolve, reject, timer });
      send({ type: "NATIVE_CLICK_REQUEST", requestId, tabUrl, x, y, expectedText, confirmIfUnchanged });
    });
  }

  function requestFlowToolEvaluate(expression: string): Promise<unknown> {
    if (!isOpen()) return Promise.reject(new Error("Desktop bridge is not connected."));
    const requestId = `flow-tool-evaluate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { flowToolRequests.delete(requestId); reject(new Error("Desktop Flow tool evaluation timed out.")); }, options.flowToolTimeoutMs ?? 90_000);
      flowToolRequests.set(requestId, { resolve, reject, timer });
      send({ type: "NATIVE_FLOW_TOOL_EVALUATE_REQUEST", requestId, expression });
    });
  }

  return { requestFlowToolEvaluate, requestNativeClick };
}

function createSocketController(options: BridgeRuntimeOptions, state: RuntimeState, send: (message: Record<string, unknown>) => void, pairingRuntime: ReturnType<typeof createPairingRuntime>, discovery: ReturnType<typeof createDiscoveryController>) {
  function hello(): void {
    // Complete the bridge handshake immediately. Tab visibility is useful
    // metadata, but it must never prevent the desktop from registering this
    // live extension socket when Chrome is still waking the service worker.
    send({ type: "EXTENSION_HELLO", extensionId: chrome.runtime.id, sessionId: options.extensionSessionId, extensionInstanceId: extensionIdentity(options), version: chrome.runtime.getManifest().version, providers: options.providers, providerVisibility: {}, capabilities: options.capabilities || {}, discovery: discovery.snapshot() });
    discovery.refreshStatus();
  }

  function scheduleReconnect(): void {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    const baseDelay = Math.max(1000, options.reconnectDelayMs ?? 3000);
    const delay = Math.min(baseDelay * (2 ** Math.min(state.reconnectAttempt, 4)), 30_000);
    state.reconnectAttempt += 1;
    state.reconnectTimer = setTimeout(connect, delay);
  }

  function connect(): void {
    if (state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) return;
    discovery.clearDiscoveryTimer();
    discovery.reset();
    state.socket = new WebSocket(options.bridgeUrl);
    state.socket.addEventListener("open", () => { state.connected = true; state.reconnectAttempt = 0; state.lastError = null; void hello(); });
    state.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (pairingRuntime.handleMessage(message)) {
          // Pairing confirmation/resume can arrive after the initial HELLO.
          // Refresh the topology immediately so the desktop replaces any
          // stale capability snapshot (including a v1-only record) with the
          // current bundle's manifest before v2 dispatch is considered.
          if (String(options.capabilities?.manifestVersion || "") === "2") discovery.refreshStatus();
          return;
        }
        void options.handleDesktopMessage(message);
      } catch (error) { state.lastError = error instanceof Error ? error.message : String(error); }
    });
    state.socket.addEventListener("close", () => { state.connected = false; discovery.clearDiscoveryTimer(); discovery.reacquire(); state.socket = null; scheduleReconnect(); });
    state.socket.addEventListener("error", () => { state.connected = false; state.lastError = "WebSocket connection failed"; state.socket?.close(); });
  }

  function ensureConnection(): void {
    if (state.socket?.readyState !== WebSocket.OPEN && state.socket?.readyState !== WebSocket.CONNECTING) connect();
  }

  return { connect, ensureConnection, hello };
}

export function createBridgeRuntime(options: BridgeRuntimeOptions) {
  const state: RuntimeState = { socket: null, reconnectTimer: null, reconnectAttempt: 0, connected: false, lastError: null };
  const clickRequests = new Map<string, NativePending>();
  const flowToolRequests = new Map<string, NativePending>();
  const isOpen = () => state.socket?.readyState === 1;
  const send = (message: Record<string, unknown>): void => { if (isOpen()) state.socket!.send(JSON.stringify(message)); };
  const pairingRuntime = createPairingRuntime({
    pairingSecretStorageKey: options.pairingSecretStorageKey || "studio.bridge.pairingSecret.v1",
    extensionId: chrome.runtime.id,
    extensionInstanceId: () => extensionIdentity(options),
    extensionSessionId: options.extensionSessionId,
    send,
    onError: (message: string) => { state.lastError = message; }
  });
  const discovery = createDiscoveryController(options, state, send);
  const sockets = createSocketController(options, state, send, pairingRuntime, discovery);
  const native = createNativeRequests(options, isOpen, send, clickRequests, flowToolRequests);
  return {
    ...sockets, refreshStatus: discovery.refreshStatus, isOpen, ...native, send,
    settleNativeResult: (message: Record<string, unknown>) => settleNativeResult(message, clickRequests, flowToolRequests),
    status: () => ({ connected: state.connected, lastError: state.lastError, discovery: discovery.snapshot(), pairing: pairingRuntime.status() }),
    discovery: discovery.snapshot
  };
}

export type BridgeRuntime = ReturnType<typeof createBridgeRuntime>;
