const assert = require("node:assert/strict");
const test = require("node:test");
const { createBridgeConnectionManager } = require("../main/bridge/connection-manager.cjs");

function socket() {
  return { OPEN: 1, readyState: 1, messages: [], send(value) { this.messages.push(JSON.parse(value)); }, terminate() { this.terminated = true; } };
}

test("bridge routes provider jobs only to a live capable canonical extension", () => {
  const chat = socket();
  const flow = socket();
  const direct = socket();
  const sockets = new Set([chat, flow, direct]);
  const now = 100_000;
  const connections = new Map([
    [chat, { extensionId: "main", version: "1", providers: ["chatgpt"], lastSeenAt: now }],
    [flow, { extensionId: "main", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: now }],
    [direct, { extensionId: "tab:content-direct", providers: ["google-flow"], lastSeenAt: now }]
  ]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "1", sendToRenderer() {}, nowMs: () => now, randomId: () => "nonce" });

  assert.equal(manager.send({ provider: "chatgpt-web", type: "RUN_JOB" }), 1);
  assert.equal(chat.messages.length, 1);
  assert.equal(flow.messages.length, 0);
  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB" }), 1);
  assert.equal(flow.messages.length, 1);
  assert.equal(direct.messages.length, 0);
  assert.equal(manager.ignoreDirectFlowMessage(direct, { type: "JOB_RESULT" }), true);
});

test("bridge status ignores direct and stale sockets without erasing live connections", () => {
  const live = socket();
  const stale = socket();
  const direct = socket();
  const sockets = new Set([live, stale, direct]);
  const connections = new Map([
    [live, { extensionId: "live", version: "2", providers: ["chatgpt"], lastSeenAt: 100_000 }],
    [stale, { extensionId: "stale", version: "1", providers: ["chatgpt"], lastSeenAt: 1 }],
    [direct, { extensionId: "tab:content-direct", lastSeenAt: 100_000 }]
  ]);
  const published = [];
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "2", sendToRenderer: (_, value) => published.push(value), nowMs: () => 100_000, randomId: () => "nonce" });

  assert.deepEqual(manager.status(), {
    connectedExtensions: 1,
    openSocketCount: 3,
    expectedVersion: "2",
    versions: ["2"],
    connections: [{ extensionId: "live", version: "2", providerVisibility: {} }],
    updateRequired: false,
    identifying: false
  });
  manager.heartbeat();
  assert.equal(stale.terminated, true);
  assert.equal(sockets.has(stale), false);
  assert.equal(published.at(-1).connectedExtensions, 1);
});

test("bridge status keeps separate browser installations while exposing both Flow routes", () => {
  const stale = socket();
  const fresh = socket();
  const sockets = new Set([stale, fresh]);
  const connections = new Map([
    [stale, { extensionId: "same-extension", extensionInstanceId: "old-install", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 0 }, pairing: { state: "confirmed" }, lastSeenAt: 101_000 }],
    [fresh, { extensionId: "same-extension", extensionInstanceId: "new-install", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, pairing: { state: "confirmed" }, lastSeenAt: 100_500 }]
  ]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "1", sendToRenderer() {}, nowMs: () => 101_000, randomId: () => "nonce" });
  const status = manager.status();
  assert.equal(status.connectedExtensions, 2);
  assert.deepEqual(status.connections.map((connection) => connection.extensionInstanceId).sort(), ["new-install", "old-install"]);
});

test("Flow dispatch collapses duplicate sessions within one browser installation", () => {
  const stale = socket();
  const fresh = socket();
  const sockets = new Set([stale, fresh]);
  const connections = new Map([
    [stale, { extensionId: "same-extension", extensionInstanceId: "same-install", sessionId: "old-session", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, pairing: { state: "confirmed" }, lastSeenAt: 101_000 }],
    [fresh, { extensionId: "same-extension", extensionInstanceId: "same-install", sessionId: "new-session", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, pairing: { state: "confirmed" }, lastSeenAt: 100_500 }]
  ]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "1", sendToRenderer() {}, nowMs: () => 101_000, randomId: () => "nonce" });
  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB", jobId: "one" }), 1);
  assert.equal(stale.messages.length + fresh.messages.length, 1);
  assert.equal(stale.messages.length, 1);
  assert.equal(fresh.messages.length, 0);
});

test("Flow job with a project route prefers the least-cluttered matching runtime session", () => {
  const stale = socket();
  const fresh = socket();
  const sockets = new Set([stale, fresh]);
  const project = "https://labs.google/fx/vi/tools/flow/project/p123";
  const runtime = `${project}/tool-version/r123`;
  const connections = new Map([
    [stale, { extensionId: "same-extension", extensionInstanceId: "stale-install", sessionId: "stale-session", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowTabs: 12, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: [project, runtime, "https://labs.google/fx/vi/tools/flow"] }, pairing: { state: "confirmed" }, lastSeenAt: 101_000 }],
    [fresh, { extensionId: "same-extension", extensionInstanceId: "fresh-install", sessionId: "fresh-session", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: [project, runtime] }, pairing: { state: "confirmed" }, lastSeenAt: 100_500 }]
  ]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "1", sendToRenderer() {}, nowMs: () => 101_000, randomId: () => "nonce" });
  assert.equal(manager.send({ provider: "google-flow-web", jobId: "route-job", settings: { flowProjectUrl: project } }), 1);
  assert.equal(fresh.messages.length, 1);
  assert.equal(stale.messages.length, 0);
});

test("provider jobs use one leased endpoint and rotate fairly across extensions", () => {
  const first = socket();
  const second = socket();
  const sockets = new Set([first, second]);
  const connections = new Map([
    [first, { extensionId: "extension-a", sessionId: "session-a", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 100_000 }],
    [second, { extensionId: "extension-b", sessionId: "session-b", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 100_000 }]
  ]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "1", sendToRenderer() {}, nowMs: () => 100_000, randomId: () => "nonce" });

  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB", jobId: "one" }), 1);
  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB", jobId: "two" }), 1);
  assert.equal(first.messages.length, 1);
  assert.equal(second.messages.length, 1);
  assert.deepEqual(first.messages[0], { provider: "google-flow-web", type: "RUN_JOB", jobId: "one" });
  assert.deepEqual(second.messages[0], { provider: "google-flow-web", type: "RUN_JOB", jobId: "two" });
});

test("same job keeps one endpoint for retry and cancel until terminal release", () => {
  const first = socket();
  const second = socket();
  const sockets = new Set([first, second]);
  const connections = new Map([
    [first, { extensionId: "extension-a", sessionId: "session-a", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 100_000 }],
    [second, { extensionId: "extension-b", sessionId: "session-b", version: "1", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 100_000 }]
  ]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "1", sendToRenderer() {}, nowMs: () => 100_000, randomId: () => "nonce" });
  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB", jobId: "same-job" }), 1);
  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB", jobId: "same-job" }), 1);
  assert.equal(manager.broadcast({ type: "CANCEL_JOB", jobId: "same-job" }), 1);
  assert.equal(first.messages.length, 3);
  assert.equal(second.messages.length, 0);
  assert.equal(manager.releaseJobTarget({ provider: "google-flow-web", jobId: "same-job" }), true);
  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB", jobId: "next-job" }), 1);
  assert.equal(second.messages.length, 1);
});

test("capability mismatch is filtered before a job reaches an extension", () => {
  const client = socket();
  const sockets = new Set([client]);
  const connections = new Map([[client, { extensionId: "extension-a", sessionId: "session-a", version: "1", providers: ["google-flow"], capabilities: { protocolVersions: [1], providers: ["chatgpt"], maxMessageBytes: 4096 }, providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 100_000 }]]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "1", sendToRenderer() {}, nowMs: () => 100_000, randomId: () => "nonce" });
  assert.equal(manager.send({ provider: "google-flow-web", type: "RUN_JOB", jobId: "capability-job" }), 0);
  assert.equal(client.messages.length, 0);
});

test("v2 jobs fail closed without exact destination and route only to the named extension session", () => {
  const first = socket();
  const second = socket();
  const sockets = new Set([first, second]);
  const connections = new Map([
    [first, { extensionId: "extension-a", sessionId: "session-a", version: "2", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 100_000 }],
    [second, { extensionId: "extension-b", sessionId: "session-b", version: "2", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 100_000 }]
  ]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "2", sendToRenderer() {}, nowMs: () => 150_000, randomId: () => "nonce" });
  const message = {
    protocolVersion: "2", messageType: "RUN_JOB", messageId: "message-v2", sequence: 1,
    issuedAt: new Date(100_000).toISOString(), expiresAt: new Date(200_000).toISOString(),
    source: { desktopInstanceId: "desktop-a" }, destination: { extensionInstanceId: "extension-b", connectorInstanceId: "connector-b", tabId: 42, frameId: 0 },
    route: { sessionId: "session-b", connectionId: "connection-b", leaseId: "lease-b", fencingToken: 1, provider: "google-flow" },
    job: { projectId: "project-a", jobId: "job-v2", idempotencyKey: "key-v2" },
    integrity: { algorithm: "hmac-sha256", nonce: "nonce-v2", authenticator: "tag-v2" }
  };
  assert.equal(manager.send({ ...message, destination: {} }), 0);
  assert.equal(manager.send(message), 1);
  assert.equal(first.messages.length, 0);
  assert.equal(second.messages.length, 1);
  assert.equal(manager.send(message), 0);
  assert.equal(second.messages.length, 1);
});

test("v2 retries require the active lease fencing token and reject a stale split-brain token", () => {
  const client = socket();
  const sockets = new Set([client]);
  const connections = new Map([[client, { extensionId: "extension-a", extensionInstanceId: "extension-a", sessionId: "session-a", version: "2", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 150_000 }]]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "2", sendToRenderer() {}, nowMs: () => 150_000, randomId: () => "lease-authority-1" });
  const base = {
    protocolVersion: "2", messageType: "RUN_JOB", messageId: "split-brain-1", sequence: 1,
    issuedAt: new Date(100_000).toISOString(), expiresAt: new Date(200_000).toISOString(),
    source: { desktopInstanceId: "desktop-a" }, destination: { extensionInstanceId: "extension-a", connectorInstanceId: "connector-a", tabId: 41, frameId: 0 },
    route: { sessionId: "session-a", connectionId: "connection-a", leaseId: "producer-claim", fencingToken: 1, provider: "google-flow" },
    job: { projectId: "project-a", jobId: "split-brain-job", idempotencyKey: "split-brain-key" },
    integrity: { algorithm: "hmac-sha256", nonce: "split-brain-nonce-1", authenticator: "split-brain-tag-1" }
  };
  assert.equal(manager.send(base), 1);
  const lease = manager.inspectJobTarget("job:split-brain-job");
  assert.deepEqual(lease, { jobKey: "job:split-brain-job", endpoint: "extension-a\u0000session-a", leaseId: "lease-authority-1", fencingToken: 1, acquiredAt: 150_000, expiresAt: 15 * 60_000 + 150_000 });
  const retry = { ...base, messageId: "split-brain-2", sequence: 2, route: { ...base.route, leaseId: lease.leaseId, fencingToken: lease.fencingToken }, integrity: { ...base.integrity, nonce: "split-brain-nonce-2" } };
  assert.equal(manager.send(retry), 1);
  assert.equal(manager.isJobTargetCurrent(client, { ...retry, type: "JOB_RESULT", messageType: "JOB_RESULT" }), true);
  const stale = { ...retry, messageId: "split-brain-3", sequence: 3, route: { ...retry.route, fencingToken: lease.fencingToken + 1 }, integrity: { ...retry.integrity, nonce: "split-brain-nonce-3" } };
  assert.equal(manager.send(stale), 0);
  assert.equal(manager.isJobTargetCurrent(client, { ...stale, type: "JOB_RESULT", messageType: "JOB_RESULT" }), false);
  assert.equal(client.messages.length, 2);
});

test("v2 jobs do not leave desktop while extension pairing is pending", () => {
  const client = socket();
  const sockets = new Set([client]);
  const connections = new Map([[client, { extensionId: "extension-a", extensionInstanceId: "installation-a", sessionId: "session-a", version: "2", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, pairing: { state: "pending" }, lastSeenAt: 100_000 }]]);
  const manager = createBridgeConnectionManager({ sockets, connections, expectedVersion: "2", sendToRenderer() {}, nowMs: () => 150_000, randomId: () => "nonce" });
  const message = {
    protocolVersion: "2", messageType: "RUN_JOB", messageId: "message-pending", sequence: 1,
    issuedAt: new Date(100_000).toISOString(), expiresAt: new Date(200_000).toISOString(),
    source: { desktopInstanceId: "desktop-a" }, destination: { extensionInstanceId: "installation-a", connectorInstanceId: "connector-a", tabId: 41, frameId: 0 },
    route: { sessionId: "session-a", connectionId: "connection-a", leaseId: "lease-a", fencingToken: 1, provider: "google-flow" },
    job: { projectId: "project-a", jobId: "job-pending", idempotencyKey: "key-pending" },
    integrity: { algorithm: "hmac-sha256", nonce: "nonce-pending", authenticator: "tag-pending" }
  };
  assert.equal(manager.send(message), 0);
  assert.equal(client.messages.length, 0);
  connections.get(client).pairing = { state: "confirmed" };
  assert.equal(manager.send(message), 1);
});

test("independent desktop managers cannot cross-deliver a v2 job to another desktop's extension", () => {
  const first = socket();
  const second = socket();
  const firstConnections = new Map([[first, { extensionId: "extension-a", extensionInstanceId: "installation-a", sessionId: "session-a", version: "2", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 150_000 }]]);
  const secondConnections = new Map([[second, { extensionId: "extension-b", extensionInstanceId: "installation-b", sessionId: "session-b", version: "2", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 }, lastSeenAt: 150_000 }]]);
  const firstManager = createBridgeConnectionManager({ sockets: new Set([first]), connections: firstConnections, expectedVersion: "2", sendToRenderer() {}, nowMs: () => 150_000, randomId: () => "lease-a" });
  const secondManager = createBridgeConnectionManager({ sockets: new Set([second]), connections: secondConnections, expectedVersion: "2", sendToRenderer() {}, nowMs: () => 150_000, randomId: () => "lease-b" });
  const message = (desktop, extension, session, jobId) => ({
    protocolVersion: "2", messageType: "RUN_JOB", messageId: `message-${jobId}`, sequence: 1,
    issuedAt: new Date(100_000).toISOString(), expiresAt: new Date(200_000).toISOString(),
    source: { desktopInstanceId: desktop }, destination: { extensionInstanceId: extension, connectorInstanceId: `${extension}-connector`, tabId: 41, frameId: 0 },
    route: { sessionId: session, connectionId: `${session}-connection`, leaseId: `${jobId}-lease`, fencingToken: 1, provider: "google-flow" },
    job: { projectId: "project-a", jobId, idempotencyKey: `${jobId}-key` },
    integrity: { algorithm: "hmac-sha256", nonce: `${jobId}-nonce`, authenticator: `${jobId}-tag` }
  });
  assert.equal(firstManager.send(message("desktop-a", "installation-b", "session-b", "cross-job")), 0);
  assert.equal(first.messages.length, 0);
  assert.equal(secondManager.send(message("desktop-b", "installation-b", "session-b", "owned-job")), 1);
  assert.equal(second.messages.length, 1);
  assert.equal(second.messages[0].destination.extensionInstanceId, "installation-b");
});
