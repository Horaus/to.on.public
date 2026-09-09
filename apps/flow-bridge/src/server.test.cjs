const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const { createFlowBridge } = require("./server.cjs");

function message(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for bridge message")), 3000);
    socket.once("message", (raw) => { clearTimeout(timer); resolve(JSON.parse(String(raw))); });
  });
}

function waitForCount(values, count) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (values.length >= count) return resolve(values);
      if (Date.now() - started > 3000) return reject(new Error("Timed out waiting for bridge messages"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

test("routes one job to one capable extension and returns lease", async () => {
  const bridge = createFlowBridge({ port: 0 });
  await bridge.start();
  const port = bridge.server.address().port;
  const desktop = new WebSocket(`ws://127.0.0.1:${port}`);
  const extension = new WebSocket(`ws://127.0.0.1:${port}`);
  await Promise.all([new Promise((r) => desktop.once("open", r)), new Promise((r) => extension.once("open", r))]);
  const desktopHello = message(desktop); const extensionHello = message(extension);
  desktop.send(JSON.stringify({ type: "HELLO", role: "desktop", clientId: "desktop-1" }));
  extension.send(JSON.stringify({ type: "HELLO", role: "extension", clientId: "ext-1", providers: ["google-flow"] }));
  assert.equal((await desktopHello).type, "HELLO_ACK");
  assert.equal((await extensionHello).type, "HELLO_ACK");
  const acceptedMessage = message(desktop); const dispatchedMessage = message(extension);
  desktop.send(JSON.stringify({ type: "RUN_JOB", job: { jobId: "job-1", provider: "google-flow", task: "image_to_video" } }));
  const [accepted, dispatched] = await Promise.all([acceptedMessage, dispatchedMessage]);
  assert.equal(accepted.type, "JOB_ACCEPTED");
  assert.equal(dispatched.type, "RUN_JOB");
  assert.equal(accepted.leaseId, dispatched.leaseId);
  extension.send(JSON.stringify({ type: "JOB_RESULT", jobId: "job-1", status: "failed_retryable" }));
  await bridge.stop();
});

test("rejects status from a different client lease", async () => {
  const bridge = createFlowBridge({ port: 0 });
  await bridge.start();
  const port = bridge.server.address().port;
  const desktop = new WebSocket(`ws://127.0.0.1:${port}`);
  const extension = new WebSocket(`ws://127.0.0.1:${port}`);
  await Promise.all([new Promise((r) => desktop.once("open", r)), new Promise((r) => extension.once("open", r))]);
  const desktopHello = message(desktop); const extensionHello = message(extension);
  desktop.send(JSON.stringify({ type: "HELLO", role: "desktop", clientId: "desktop-2" }));
  extension.send(JSON.stringify({ type: "HELLO", role: "extension", clientId: "ext-2", providers: ["google-flow"] }));
  await Promise.all([desktopHello, extensionHello]);
  const acceptedMessage = message(desktop); const dispatchedMessage = message(extension);
  desktop.send(JSON.stringify({ type: "RUN_JOB", job: { jobId: "job-2", provider: "google-flow" } }));
  const accepted = await acceptedMessage; await dispatchedMessage;
  const impostor = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((r) => impostor.once("open", r));
  const impostorHello = message(impostor);
  impostor.send(JSON.stringify({ type: "HELLO", role: "extension", clientId: "ext-3", providers: ["google-flow"] }));
  await impostorHello;
  const errorMessage = message(impostor);
  impostor.send(JSON.stringify({ type: "JOB_STATUS", jobId: "job-2", status: "submitting" }));
  assert.deepEqual(await errorMessage, { type: "BRIDGE_ERROR", jobId: "job-2", error: "stale_or_missing_lease" });
  assert.ok(accepted.leaseId);
  await bridge.stop();
});

test("accepts the current extension hello envelope and forwards JOB_ACK", async () => {
  const bridge = createFlowBridge({ port: 0 });
  await bridge.start();
  const port = bridge.server.address().port;
  const desktop = new WebSocket(`ws://127.0.0.1:${port}`);
  const extension = new WebSocket(`ws://127.0.0.1:${port}`);
  await Promise.all([new Promise((r) => desktop.once("open", r)), new Promise((r) => extension.once("open", r))]);
  const desktopHello = message(desktop);
  const extensionMessages = [];
  extension.on("message", (raw) => extensionMessages.push(JSON.parse(String(raw))));
  desktop.send(JSON.stringify({ type: "HELLO", role: "desktop", clientId: "desktop-compat" }));
  extension.send(JSON.stringify({ type: "EXTENSION_HELLO", extensionId: "ext-compat", extensionInstanceId: "install-compat", sessionId: "session-compat", version: "0.1.67", providers: ["google-flow"], providerVisibility: { googleFlowProjectTabs: 1 } }));
  assert.equal((await desktopHello).type, "HELLO_ACK");
  await waitForCount(extensionMessages, 2);
  assert.equal(extensionMessages[0].type, "BRIDGE_PAIRING_CHALLENGE");
  assert.equal(extensionMessages[1].type, "EXTENSION_STATUS");
  const acceptedMessage = message(desktop); const dispatchedMessage = message(extension);
  desktop.send(JSON.stringify({ type: "RUN_JOB", job: { jobId: "compat-job", provider: "google-flow", task: "image_to_video" } }));
  const [accepted, dispatched] = await Promise.all([acceptedMessage, dispatchedMessage]);
  assert.equal(accepted.type, "JOB_ACCEPTED");
  assert.equal(dispatched.type, "RUN_JOB");
  const ackMessage = message(desktop);
  extension.send(JSON.stringify({ type: "JOB_ACK", jobId: "compat-job", sessionId: "session-compat" }));
  assert.equal((await ackMessage).type, "JOB_ACK");
  await bridge.stop();
});

test("routes native click requests through the leased desktop endpoint", async () => {
  const bridge = createFlowBridge({ port: 0 });
  await bridge.start();
  const port = bridge.server.address().port;
  const desktop = new WebSocket(`ws://127.0.0.1:${port}`);
  const extension = new WebSocket(`ws://127.0.0.1:${port}`);
  await Promise.all([new Promise((r) => desktop.once("open", r)), new Promise((r) => extension.once("open", r))]);
  const desktopHello = message(desktop); const extensionHello = message(extension);
  desktop.send(JSON.stringify({ type: "HELLO", role: "desktop", clientId: "desktop-native" }));
  extension.send(JSON.stringify({ type: "HELLO", role: "extension", clientId: "ext-native", providers: ["google-flow"] }));
  await Promise.all([desktopHello, extensionHello]);
  const requestMessage = message(desktop);
  extension.send(JSON.stringify({ type: "NATIVE_CLICK_REQUEST", requestId: "native-1", tabUrl: "https://labs.google/fx/vi/tools/flow/project/x", x: 10, y: 20 }));
  const request = await requestMessage;
  assert.equal(request.type, "NATIVE_CLICK_REQUEST");
  const resultMessage = message(extension);
  desktop.send(JSON.stringify({ type: "NATIVE_CLICK_RESULT", requestId: "native-1", ok: true }));
  assert.deepEqual(await resultMessage, { type: "NATIVE_CLICK_RESULT", requestId: "native-1", ok: true });
  await bridge.stop();
});
