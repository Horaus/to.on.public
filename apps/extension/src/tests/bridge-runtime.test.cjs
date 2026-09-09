const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { derivePairingConfirmation } = require("../../../../packages/protocol/src/connection-v2.cjs");

test("extension topology refresh sends one hello and a status update instead of a second handshake", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/bridge-runtime.ts"), "utf8");
  assert.doesNotMatch(source, /node:crypto/);
  const start = source.indexOf("function hello(): void");
  const end = source.indexOf("function scheduleReconnect", start);
  assert.ok(start >= 0 && end > start);
  const hello = source.slice(start, end);
  assert.equal((hello.match(/type: \"EXTENSION_HELLO\"/g) || []).length, 1);
  assert.match(source, /function sendTopologyStatus\(providerVisibility/);
  assert.match(source, /type: \"EXTENSION_STATUS\"/);
  assert.match(source, /function refreshStatus\(\): void/);
  assert.match(source, /refreshStatus, isOpen/);
  assert.doesNotMatch(hello, /send\(\{ \.\.\.base, providerVisibility \}\)/);
});

test("extension keepalive and Flow tab updates refresh topology without invoking hello", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/index.ts"), "utf8");
  const alarm = source.slice(source.indexOf("chrome.alarms.onAlarm"), source.indexOf("chrome.runtime.onStartup"));
  const tabUpdate = source.slice(source.indexOf("chrome.tabs.onUpdated"), source.indexOf("const crashedJob", source.indexOf("chrome.tabs.onUpdated")));
  assert.match(alarm, /refreshExtensionStatus\(\)/);
  assert.doesNotMatch(alarm, /sendExtensionHello\(\)/);
  assert.match(tabUpdate, /refreshExtensionStatus\(\)/);
  assert.doesNotMatch(tabUpdate, /sendExtensionHello\(\)/);
});

test("bridge runtime keeps idle discovery probes bounded for zero, one and duplicate tabs", async () => {
  const previous = { chrome: global.chrome, WebSocket: global.WebSocket, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
  const timers = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances = [];
    constructor() { this.readyState = FakeWebSocket.CONNECTING; this.messages = []; this.listeners = new Map(); FakeWebSocket.instances.push(this); }
    addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
    send(value) { this.messages.push(JSON.parse(value)); }
    open() { this.readyState = FakeWebSocket.OPEN; this.emit("open"); }
  }
  global.WebSocket = FakeWebSocket;
  global.chrome = { runtime: { id: "extension-id", getManifest: () => ({ version: "0.1.67" }) } };
  global.setTimeout = (callback, delay) => { const timer = { callback, delay, cleared: false, ran: false }; timers.push(timer); return timer; };
  global.clearTimeout = (timer) => { if (timer) timer.cleared = true; };
  try {
    const source = path.resolve(__dirname, "../background/bridge-runtime.ts");
    const { createBridgeRuntime } = await import(`${pathToFileURL(source).href}?idle-budget=${Date.now()}`);
    const scenarios = [
      ["zero", { googleFlowTabs: 0, googleFlowProjectTabs: 0, googleFlowCustomToolTabs: 0, googleFlowRuntimeToolTabs: 0, googleFlowEditorToolTabs: 0 }, 3],
      ["canonical", { googleFlowTabs: 1, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 0, googleFlowRuntimeToolTabs: 0, googleFlowEditorToolTabs: 0 }, 1],
      ["duplicate", { googleFlowTabs: 2, googleFlowProjectTabs: 2, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 0, googleFlowEditorToolTabs: 0 }, 3]
    ];
    for (const [name, visibility, expectedCalls] of scenarios) {
      timers.length = 0;
      FakeWebSocket.instances.length = 0;
      let visibilityCalls = 0;
      const runtime = createBridgeRuntime({
        bridgeUrl: "ws://127.0.0.1:3767", extensionSessionId: `idle-${name}`, extensionInstanceId: () => `installation-${name}`,
        capabilities: { protocolVersions: [1], providers: ["google-flow"] }, providers: ["google-flow"],
        providerVisibility: async () => { visibilityCalls += 1; return visibility; }, handleDesktopMessage: async () => {}
      });
      runtime.connect();
      const socket = FakeWebSocket.instances[0];
      socket.open();
      await Promise.resolve();
      await Promise.resolve();
      while (true) {
        const timer = timers.find((item) => !item.cleared && !item.ran);
        if (!timer) break;
        timer.ran = true;
        timer.callback();
        await Promise.resolve();
        await Promise.resolve();
      }
      assert.equal(visibilityCalls, expectedCalls, `${name} discovery probe count`);
      assert.equal(timers.filter((item) => !item.cleared && !item.ran).length, 0, `${name} should not leave an idle timer`);
      if (name === "canonical") assert.equal(runtime.discovery().phase, "low_energy");
      if (name === "duplicate") assert.equal(runtime.discovery().phase, "candidate");
    }
  } finally {
    global.chrome = previous.chrome;
    global.WebSocket = previous.WebSocket;
    global.setTimeout = previous.setTimeout;
    global.clearTimeout = previous.clearTimeout;
  }
});

test("bridge runtime reconnect smoke creates one handshake per worker session and no implicit job submit", async () => {
  const previous = { chrome: global.chrome, WebSocket: global.WebSocket, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
  const timers = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances = [];
    constructor(url) { this.url = url; this.readyState = FakeWebSocket.CONNECTING; this.messages = []; this.listeners = new Map(); FakeWebSocket.instances.push(this); }
    addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
    send(value) { this.messages.push(JSON.parse(value)); }
    open() { this.readyState = FakeWebSocket.OPEN; this.emit("open"); }
    close() { this.readyState = 3; this.emit("close"); }
  }
  global.WebSocket = FakeWebSocket;
  global.chrome = { runtime: { id: "extension-id", getManifest: () => ({ version: "0.1.67" }) } };
  global.setTimeout = (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; };
  global.clearTimeout = (timer) => { if (timer) timer.cleared = true; };
  try {
    const source = path.resolve(__dirname, "../background/bridge-runtime.ts");
    const { createBridgeRuntime } = await import(`${pathToFileURL(source).href}?reconnect=${Date.now()}`);
    const runtime = createBridgeRuntime({
      bridgeUrl: "ws://127.0.0.1:3767",
      extensionSessionId: "worker-session-a",
      extensionInstanceId: () => "installation-a",
      capabilities: { protocolVersions: [1], providers: ["google-flow"] },
      providers: ["google-flow"],
      providerVisibility: async () => ({ googleFlowTabs: 0, googleFlowProjectTabs: 0, googleFlowCustomToolTabs: 0 }),
      handleDesktopMessage: async () => {},
      reconnectDelayMs: 60_000
    });

    runtime.connect();
    const first = FakeWebSocket.instances[0];
    first.open();
    await Promise.resolve();
    assert.equal(first.messages.filter((message) => message.type === "EXTENSION_HELLO").length, 1);
    assert.equal(first.messages.some((message) => message.type === "RUN_JOB"), false);

    first.close();
    assert.equal(runtime.isOpen(), false);
    const reconnect = timers.find((timer) => timer.delay === 30_000 && !timer.cleared);
    assert.ok(reconnect, "a bounded reconnect timer should be scheduled");
    reconnect.callback();
    const second = FakeWebSocket.instances[1];
    second.open();
    await Promise.resolve();
    assert.equal(second.messages.filter((message) => message.type === "EXTENSION_HELLO").length, 1);
    assert.equal(second.messages.some((message) => message.type === "RUN_JOB"), false);
  } finally {
    global.chrome = previous.chrome;
    global.WebSocket = previous.WebSocket;
    global.setTimeout = previous.setTimeout;
    global.clearTimeout = previous.clearTimeout;
  }
});

test("bridge runtime stores an approved pairing secret and confirms the exact challenge", async () => {
  const previous = { chrome: global.chrome, WebSocket: global.WebSocket };
  const stored = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances = [];
    constructor() { this.readyState = FakeWebSocket.CONNECTING; this.messages = []; this.listeners = new Map(); FakeWebSocket.instances.push(this); }
    addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
    send(value) { this.messages.push(JSON.parse(value)); }
    open() { this.readyState = FakeWebSocket.OPEN; this.emit("open"); }
  }
  global.WebSocket = FakeWebSocket;
  global.chrome = {
    runtime: { id: "extension-id", getManifest: () => ({ version: "0.1.67" }) },
    storage: { local: { set: async (value) => { stored.push(value); } } }
  };
  try {
    const source = path.resolve(__dirname, "../background/bridge-runtime.ts");
    const { createBridgeRuntime } = await import(`${pathToFileURL(source).href}?pairing=${Date.now()}`);
    const runtime = createBridgeRuntime({
      bridgeUrl: "ws://127.0.0.1:3767",
      extensionSessionId: "worker-a",
      extensionInstanceId: () => "installation-a",
      capabilities: { protocolVersions: [1], providers: ["google-flow"] },
      providers: ["google-flow"],
      providerVisibility: async () => ({}),
      handleDesktopMessage: async () => {}
    });
    runtime.connect();
    const socket = FakeWebSocket.instances[0];
    assert.ok(socket);
    // Mark the socket open without firing the runtime's hello/visibility
    // probe; this keeps the unit test focused on pairing message handling.
    socket.readyState = FakeWebSocket.OPEN;
    socket.emit("message", { data: JSON.stringify({ type: "BRIDGE_PAIRING_CHALLENGE", pairingId: "pair-1", nonce: "nonce-1", code: "AB12CD34", expiresAt: 123456 }) });
    assert.equal(runtime.status().pairing.state, "pending");
    assert.equal(runtime.status().pairing.code, "AB12CD34");
    socket.emit("message", { data: JSON.stringify({ type: "BRIDGE_PAIRING_APPROVED", pairingId: "pair-1", secret: "pairing-secret" }) });
    // WebCrypto signing is asynchronous on some Node versions. Wait for the
    // bounded confirmation side effect instead of relying on a timing guess.
    for (let attempt = 0; attempt < 40 && !socket.messages.some((message) => message.type === "BRIDGE_PAIRING_CONFIRM"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(runtime.status().pairing.state, "secret_sent");
    assert.deepEqual(stored, [{ "studio.bridge.pairingSecret.v1": "pairing-secret" }]);
    const confirmation = socket.messages.find((message) => message.type === "BRIDGE_PAIRING_CONFIRM");
    assert.deepEqual(confirmation, {
      type: "BRIDGE_PAIRING_CONFIRM",
      pairingId: "pair-1",
      proof: derivePairingConfirmation("pairing-secret", { pairingId: "pair-1", nonce: "nonce-1", extensionInstanceId: "installation-a", sessionId: "worker-a" })
    });
    socket.emit("message", { data: JSON.stringify({ type: "BRIDGE_PAIRING_CONFIRMED", pairingId: "pair-1" }) });
    assert.equal(runtime.status().pairing.state, "confirmed");
  } finally {
    global.chrome = previous.chrome;
    global.WebSocket = previous.WebSocket;
  }
});

test("bridge runtime resumes a stored pairing secret after a fresh challenge", async () => {
  const previous = { chrome: global.chrome, WebSocket: global.WebSocket };
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances = [];
    constructor() { this.readyState = FakeWebSocket.CONNECTING; this.messages = []; this.listeners = new Map(); FakeWebSocket.instances.push(this); }
    addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
    send(value) { this.messages.push(JSON.parse(value)); }
  }
  global.WebSocket = FakeWebSocket;
  global.chrome = {
    runtime: { id: "extension-id", getManifest: () => ({ version: "0.1.67" }) },
    storage: { local: { get: async () => ({ "studio.bridge.pairingSecret.v1": "a".repeat(64) }) } }
  };
  try {
    const source = path.resolve(__dirname, "../background/bridge-runtime.ts");
    const { createBridgeRuntime } = await import(`${pathToFileURL(source).href}?resume=${Date.now()}`);
    let installationId = "worker-fallback";
    const runtime = createBridgeRuntime({
      bridgeUrl: "ws://127.0.0.1:3767", extensionSessionId: "worker-b", extensionInstanceId: () => installationId,
      capabilities: { protocolVersions: [1], providers: ["google-flow"] }, providers: ["google-flow"], providerVisibility: async () => ({}), handleDesktopMessage: async () => {}
    });
    runtime.connect();
    const socket = FakeWebSocket.instances[0];
    socket.readyState = FakeWebSocket.OPEN;
    installationId = "installation-a";
    socket.emit("message", { data: JSON.stringify({ type: "BRIDGE_PAIRING_CHALLENGE", pairingId: "pair-resume", nonce: "nonce-resume", expiresAt: 123456 }) });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(runtime.status().pairing.state, "secret_sent");
    assert.equal(socket.messages.filter((message) => message.type === "BRIDGE_PAIRING_RESUME").length, 1);
    assert.equal(socket.messages[0].extensionInstanceId, "installation-a");
  } finally {
    global.chrome = previous.chrome;
    global.WebSocket = previous.WebSocket;
  }
});
