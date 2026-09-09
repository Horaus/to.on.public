const assert = require("node:assert/strict");
const test = require("node:test");
const { deriveAuthenticator, derivePairingConfirmation } = require("../../../../packages/protocol/src/connection-v2.cjs");
const { createPairingSessions } = require("../main/bridge/pairing-session.cjs");
const { approvePairing, createBridgeMessageDeps, handleBridgeMessage } = require("../main/bridge/server.cjs");

function socket() {
  return {
    readyState: 1,
    messages: [],
    send(value) { this.messages.push(JSON.parse(value)); },
    terminate() { this.terminated = true; }
  };
}

function envelope(overrides = {}) {
  const value = {
    protocolVersion: "2",
    messageType: "JOB_ACK",
    type: "JOB_ACK",
    messageId: "message-1",
    sequence: 1,
    issuedAt: new Date(100_000).toISOString(),
    expiresAt: new Date(200_000).toISOString(),
    source: { extensionInstanceId: "extension-install" },
    destination: { desktopInstanceId: "desktop-a" },
    route: { sessionId: "session-a", connectionId: "connection-a", leaseId: "lease-a", fencingToken: 1 },
    job: { projectId: "project-a", jobId: "job-a", idempotencyKey: "key-a" },
    integrity: { algorithm: "hmac-sha256", nonce: "nonce-a", authenticator: "" },
    ...overrides
  };
  return value;
}

function deps(socketValue, calls, overrides = {}) {
  return {
    sockets: new Set([socketValue]),
    extensionConnections: new Map([[socketValue, {
      extensionId: "runtime-extension-id",
      extensionInstanceId: "extension-install",
      sessionId: "session-a"
    }]]),
    inboundSequences: new WeakMap(),
    nowMs: () => 150_000,
    pairingSecret: "pairing-secret",
    acknowledgeJobDispatch: (message) => calls.push(["ack", message.messageId]),
    publishBridgeStatus() {},
    deliverUnacknowledgedChatGptJobs() {},
    dispatchPendingJobs() {},
    recoverRecentFailedFlowJobs() {},
    dropBridgeSocket() {},
    releaseJobTarget: (message) => calls.push(["release", message.jobId]),
    dispatchDesktopNativeClick() { return Promise.resolve(); },
    evaluateFlowCustomTool() { return Promise.resolve(); },
    shouldIgnoreDirectFlowMessage() { return false; },
    updateJobStatus() {},
    finishJob() {},
    ...overrides
  };
}

function signedEnvelope(overrides = {}) {
  const value = envelope(overrides);
  value.integrity.authenticator = deriveAuthenticator("pairing-secret", value);
  return value;
}

test("bridge server factory forwards endpoint, pairing and lease guards to message handling", () => {
  const releaseJobTarget = () => {};
  const isJobTargetCurrent = () => true;
  const shouldRetainJobTarget = () => true;
  const inboundSequences = new WeakMap();
  const result = createBridgeMessageDeps({
    sockets: new Set(), extensionConnections: new Map(), publishBridgeStatus() {},
    deliverUnacknowledgedChatGptJobs() {}, dispatchPendingJobs() {}, recoverRecentFailedFlowJobs() {},
    dropBridgeSocket() {}, releaseJobTarget, isJobTargetCurrent, shouldRetainJobTarget, acknowledgeJobDispatch() {},
    dispatchDesktopNativeClick() {}, evaluateFlowCustomTool() {}, shouldIgnoreDirectFlowMessage() {},
    updateJobStatus() {}, finishJob() {}, desktopInstanceId: "desktop-a", pairingSecret: "pairing-secret",
    inboundSequences, nowMs: () => 150_000
  });
  assert.equal(result.releaseJobTarget, releaseJobTarget);
  assert.equal(result.shouldRetainJobTarget, shouldRetainJobTarget);
  assert.equal(result.desktopInstanceId, "desktop-a");
  assert.equal(result.pairingSecret, "pairing-secret");
  assert.equal(result.inboundSequences, inboundSequences);
  assert.equal(result.isJobTargetCurrent, isJobTargetCurrent);
});

test("inbound v2 accepts one authenticated ACK and rejects a replay", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls);
  const message = signedEnvelope();

  handleBridgeMessage(client, JSON.stringify(message), runtime);
  handleBridgeMessage(client, JSON.stringify(message), runtime);

  assert.deepEqual(calls, [["ack", "message-1"]]);
  assert.equal(client.messages.length, 1);
  assert.deepEqual(client.messages[0], {
    type: "BRIDGE_NACK",
    protocolVersion: "2",
    messageId: "message-1",
    code: "replayed_sequence",
    retryable: false
  });
});

test("inbound v2 rejects a stale job lease before invoking ACK or result handlers", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls, { isJobTargetCurrent: () => false });
  handleBridgeMessage(client, JSON.stringify(signedEnvelope({ messageId: "stale-lease", type: "JOB_RESULT", messageType: "JOB_RESULT" })), runtime);
  assert.deepEqual(calls, []);
  assert.deepEqual(client.messages.at(-1), { type: "BRIDGE_NACK", protocolVersion: "2", messageId: "stale-lease", code: "stale_job_lease", retryable: false });
});

test("bridge pairing requires desktop approval and confirmation before v2 dispatch", () => {
  let now = 150_000;
  const client = socket();
  const calls = [];
  const pairingSessions = createPairingSessions({ secret: "pairing-secret", nowMs: () => now, randomId: () => "pair-bridge", randomBytes: () => Buffer.alloc(32, 5) });
  pairingSessions.begin(client);
  const runtime = deps(client, calls, { pairingSessions });
  handleBridgeMessage(client, JSON.stringify({ type: "EXTENSION_HELLO", extensionId: "runtime-extension-id", extensionInstanceId: "extension-install", sessionId: "session-a", version: "0.1.67", providers: ["google-flow"] }), runtime);
  const pending = pairingSessions.inspect(client);
  assert.equal(pending.state, "pending");
  handleBridgeMessage(client, JSON.stringify(signedEnvelope({ messageId: "unpaired", sequence: 1 })), runtime);
  assert.equal(client.messages.at(-1).code, "pairing_not_confirmed");
  assert.deepEqual(approvePairing("extension-install", "wrong", runtime), { ok: false, code: "pairing_code_mismatch" });
  const approved = approvePairing("extension-install", pending.code, runtime);
  assert.equal(approved.ok, true);
  assert.equal(client.messages.at(-1).type, "BRIDGE_PAIRING_APPROVED");
  const proof = pairingSessions.confirmationProof("pairing-secret", pairingSessions.inspect(client));
  handleBridgeMessage(client, JSON.stringify({ type: "BRIDGE_PAIRING_CONFIRM", pairingId: pending.pairingId, proof }), runtime);
  assert.equal(pairingSessions.inspect(client).state, "confirmed");
  handleBridgeMessage(client, JSON.stringify(signedEnvelope({ messageId: "paired-ack", sequence: 1 })), runtime);
  assert.deepEqual(calls.at(-1), ["ack", "paired-ack"]);
});

test("bridge pairing approval falls back to stable extension ID when installation identity is not hydrated", () => {
  const client = socket();
  const calls = [];
  const pairingSessions = createPairingSessions({ secret: "pairing-secret", nowMs: () => 150_000, randomId: () => "pair-legacy", randomBytes: () => Buffer.alloc(32, 7) });
  const pending = pairingSessions.begin(client);
  const runtime = deps(client, calls, {
    pairingSessions,
    extensionConnections: new Map([[client, { extensionId: "runtime-extension-id", extensionInstanceId: "", sessionId: "session-a" }]])
  });
  const approved = approvePairing("runtime-extension-id", pending.code, runtime);
  assert.equal(approved.ok, true);
  assert.equal(client.messages.at(-1).type, "BRIDGE_PAIRING_APPROVED");
});

test("bridge server accepts a stored-secret resume and never delivers the secret again", () => {
  let now = 150_000;
  const client = socket();
  const calls = [];
  const pairingSessions = createPairingSessions({ secret: "pairing-secret", nowMs: () => now, randomId: () => "pair-resume", randomBytes: () => Buffer.alloc(32, 6) });
  const challenge = pairingSessions.begin(client);
  const runtime = deps(client, calls, { pairingSessions });
  const proof = derivePairingConfirmation("pairing-secret", { pairingId: challenge.pairingId, nonce: challenge.nonce, extensionInstanceId: "extension-install", sessionId: "session-a" });
  handleBridgeMessage(client, JSON.stringify({ type: "BRIDGE_PAIRING_RESUME", pairingId: challenge.pairingId, extensionId: "runtime-extension-id", extensionInstanceId: "extension-install", sessionId: "session-a", proof }), runtime);
  assert.equal(pairingSessions.inspect(client).state, "confirmed");
  assert.equal(runtime.extensionConnections.get(client).extensionInstanceId, "extension-install");
  assert.equal(runtime.extensionConnections.get(client).sessionId, "session-a");
  assert.equal(client.messages.at(-1).type, "BRIDGE_PAIRING_CONFIRMED");
  assert.equal(pairingSessions.deliverSecret(client).ok, false);
});

test("inbound v2 rejects wrong source/session and malformed envelopes before dispatch", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls);

  handleBridgeMessage(client, JSON.stringify(signedEnvelope({
    messageId: "wrong-source",
    source: { extensionInstanceId: "other-extension" }
  })), runtime);
  handleBridgeMessage(client, JSON.stringify(signedEnvelope({
    messageId: "wrong-session",
    sequence: 2,
    route: { sessionId: "other-session", connectionId: "connection-a", leaseId: "lease-a", fencingToken: 1 }
  })), runtime);
  handleBridgeMessage(client, JSON.stringify(envelope({
    messageId: "malformed",
    integrity: { algorithm: "hmac-sha256", nonce: "nonce-a", authenticator: "" },
    route: { sessionId: "session-a" }
  })), runtime);

  assert.deepEqual(calls, []);
  assert.deepEqual(client.messages.map((message) => [message.messageId, message.code]), [
    ["wrong-source", "wrong_source_extension"],
    ["wrong-session", "wrong_session"],
    ["malformed", "missing_route_connectionId"]
  ]);
});

test("inbound v2 rejects a destination for another desktop instance", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls, { desktopInstanceId: "desktop-b" });
  handleBridgeMessage(client, JSON.stringify(signedEnvelope({ messageId: "wrong-desktop" })), runtime);
  assert.deepEqual(calls, []);
  assert.deepEqual(client.messages, [{
    type: "BRIDGE_NACK",
    protocolVersion: "2",
    messageId: "wrong-desktop",
    code: "wrong_destination",
    retryable: false
  }]);
});

test("legacy v1 bridge messages remain compatible with inbound v2 validation", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls);

  handleBridgeMessage(client, JSON.stringify({ type: "JOB_ACK", jobId: "legacy-job" }), runtime);

  assert.deepEqual(calls, [["ack", undefined]]);
  assert.equal(client.messages.length, 0);
});

test("malformed JSON is rejected without invoking any bridge handler", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls);

  handleBridgeMessage(client, "{not-json", runtime);

  assert.deepEqual(calls, []);
  assert.deepEqual(client.messages, [{
    type: "BRIDGE_NACK",
    protocolVersion: "2",
    code: "invalid_json",
    retryable: false
  }]);
});

test("extension topology status preserves discovery phase for desktop diagnostics", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls, { dispatchPendingJobs: () => calls.push(["dispatch-pending"]) });
  handleBridgeMessage(client, JSON.stringify({
    type: "EXTENSION_STATUS",
    extensionId: "runtime-extension-id",
    sessionId: "session-a",
    version: "0.1.67",
    providerVisibility: { googleFlowProjectTabs: 1 },
    discovery: { phase: "low_energy", canonical: true, scanAttempt: 2 }
  }), runtime);
  assert.deepEqual(runtime.extensionConnections.get(client).discovery, { phase: "low_energy", canonical: true, scanAttempt: 2 });
  assert.deepEqual(runtime.extensionConnections.get(client).providerVisibility, { googleFlowProjectTabs: 1 });
  assert.deepEqual(calls, [["dispatch-pending"]]);
});

test("extension capability manifest is retained with topology status", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls);
  handleBridgeMessage(client, JSON.stringify({ type: "EXTENSION_STATUS", extensionId: "runtime-extension-id", sessionId: "session-a", version: "0.1.67", capabilities: { protocolVersions: [1], providers: ["google-flow"] } }), runtime);
  assert.deepEqual(runtime.extensionConnections.get(client).capabilities, { protocolVersions: [1], providers: ["google-flow"] });
});

test("extension hello records installation identity separately from worker session", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls);
  handleBridgeMessage(client, JSON.stringify({
    type: "EXTENSION_HELLO",
    extensionId: "runtime-extension-id",
    extensionInstanceId: "installation-a",
    sessionId: "worker-session-a",
    version: "0.1.67",
    providers: ["google-flow"],
    discovery: { phase: "searching" }
  }), runtime);
  const record = runtime.extensionConnections.get(client);
  assert.equal(record.extensionInstanceId, "installation-a");
  assert.equal(record.sessionId, "worker-session-a");
  assert.deepEqual(record.discovery, { phase: "searching" });
});

test("extension hello keeps separate browser installations alive", () => {
  const first = socket();
  const second = socket();
  const calls = [];
  const runtime = deps(second, calls, {
    sockets: new Set([first, second]),
    extensionConnections: new Map([[first, {
      extensionId: "runtime-extension-id",
      extensionInstanceId: "installation-a",
      sessionId: "worker-session-a"
    }]]),
    dropBridgeSocket: (candidate) => calls.push(["drop", candidate === first ? "first" : "second"])
  });
  handleBridgeMessage(second, JSON.stringify({
    type: "EXTENSION_HELLO",
    extensionId: "runtime-extension-id",
    extensionInstanceId: "installation-b",
    sessionId: "worker-session-b",
    version: "0.1.67",
    providers: ["google-flow"]
  }), runtime);
  assert.equal(first.terminated, undefined);
  assert.deepEqual(calls, []);
  assert.equal(runtime.extensionConnections.get(second).extensionInstanceId, "installation-b");
});

test("terminal result releases the desktop job target lease", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls);
  handleBridgeMessage(client, JSON.stringify({ type: "JOB_RESULT", jobId: "job-1", status: "done", assets: [] }), runtime);
  assert.deepEqual(calls, [["release", "job-1"]]);
});

test("result that reopens an active job retains the target lease", () => {
  const client = socket();
  const calls = [];
  const runtime = deps(client, calls, { shouldRetainJobTarget: () => true });
  handleBridgeMessage(client, JSON.stringify({ type: "JOB_RESULT", jobId: "job-1", status: "failed_retryable", assets: [] }), runtime);
  assert.deepEqual(calls, []);
});
