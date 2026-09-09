const assert = require("node:assert/strict");
const test = require("node:test");
const { registerCancelProjectJobsHandler } = require("../main/job-handler-actions.cjs");

test("cancelling a project disables persisted YOLO in the same transaction", () => {
  const state = {
    projects: [{ id: "project-1", intake: { yoloEnabled: true, targetDurationSec: 30 } }],
    jobs: [
      { id: "flow-1", projectId: "project-1", providerId: "google-flow-web", jobType: "video", status: "opening_provider" },
      { id: "flow-2", projectId: "project-1", providerId: "google-flow-web", jobType: "video", status: "failed_retryable", needsStrictFlowRecovery: true },
      { id: "other-1", projectId: "other", providerId: "google-flow-web", jobType: "video", status: "opening_provider" }
    ]
  };
  let handler;
  const sent = [];
  registerCancelProjectJobsHandler({
    ipcMain: { handle: (_name, callback) => { handler = callback; } },
    getState: () => state,
    mutateState: (mutator) => { mutator(state); return state; },
    now: () => "2026-08-31T00:00:00.000Z",
    saveState: () => {},
    sendToRenderer: (...args) => sent.push(args),
    broadcast: (message) => sent.push(message)
  });

  const result = handler({}, "project-1");
  assert.equal(result.projects[0].intake.yoloEnabled, false);
  assert.equal(result.jobs[0].status, "cancelled");
  assert.equal(result.jobs[1].needsStrictFlowRecovery, false);
  assert.ok(result.jobs[1].flowRecoverySuppressedAt);
  assert.equal(result.jobs[2].status, "opening_provider");
});

test("run job persists submit intent before a successful bridge delivery", () => {
  const { registerRunJobHandler } = require("../main/job-handler-actions.cjs");
  const state = { projects: [{ id: "project-1" }], shots: [], assets: [], jobs: [] };
  let handler;
  let saves = 0;
  const now = () => "2026-08-31T00:00:00.000Z";
  registerRunJobHandler({
    ipcMain: { handle: (_name, callback) => { handler = callback; } },
    crypto: require("node:crypto"),
    normalizeBridgeMessageForStorage: (_projectId, message) => message,
    now,
    saveStateBackup: () => {},
    getState: () => state,
    mutateState: (mutator) => { mutator(state); return state; },
    saveState: () => { saves += 1; },
    sendToRenderer: () => {},
    logEvent: () => {},
    shotHasRenderableVideo: () => false,
    sockets: new Set([{}]),
    sendBridgeMessage: () => 1,
    encodeBridgeReferences: (message) => message
  });
  handler({}, {
    jobId: "job-intent", projectId: "project-1", providerId: "chatgpt-web", jobType: "image", prompt: "A test frame",
    bridgeMessage: { type: "RUN_JOB", provider: "chatgpt-web", task: "text_to_image", jobId: "job-intent", prompt: "A test frame", references: [], settings: {} }
  });
  assert.equal(state.jobs[0].submissionState, "bridge_delivered");
  assert.equal(state.jobs[0].submitIntentAt, now());
  assert.ok(state.jobs[0].submitDeliveredAt);
  assert.ok(saves >= 2);
});

test("run job with no bridge delivery keeps a durable intent without claiming submission", () => {
  const { registerRunJobHandler } = require("../main/job-handler-actions.cjs");
  const state = { projects: [{ id: "project-1" }], shots: [], assets: [], jobs: [] };
  let handler;
  registerRunJobHandler({
    ipcMain: { handle: (_name, callback) => { handler = callback; } },
    crypto: require("node:crypto"),
    normalizeBridgeMessageForStorage: (_projectId, message) => message,
    now: () => "2026-08-31T00:00:00.000Z",
    saveStateBackup: () => {},
    getState: () => state,
    mutateState: (mutator) => { mutator(state); return state; },
    saveState: () => {}, sendToRenderer: () => {}, logEvent: () => {}, shotHasRenderableVideo: () => false,
    sockets: new Set(), sendBridgeMessage: () => 0, encodeBridgeReferences: (message) => message
  });
  handler({}, {
    jobId: "job-no-bridge", projectId: "project-1", providerId: "chatgpt-web", jobType: "image", prompt: "A test frame",
    bridgeMessage: { type: "RUN_JOB", provider: "chatgpt-web", task: "text_to_image", jobId: "job-no-bridge", prompt: "A test frame", references: [], settings: {} }
  });
  assert.equal(state.jobs[0].status, "pending");
  assert.equal(state.jobs[0].submissionState, "intent_recorded");
  assert.equal(state.jobs[0].submitDeliveredAt, undefined);
});

test("new jobs receive unique dispatch idempotency keys for identical logical payloads", () => {
  const { registerRunJobHandler } = require("../main/job-handler-actions.cjs");
  const state = { projects: [{ id: "project-1" }], shots: [], assets: [], jobs: [] };
  let handler;
  const envelopes = [];
  registerRunJobHandler({
    ipcMain: { handle: (_name, callback) => { handler = callback; } },
    crypto: require("node:crypto"), normalizeBridgeMessageForStorage: (_projectId, message) => structuredClone(message),
    now: () => "2026-09-01T00:00:00.000Z", saveStateBackup: () => {}, getState: () => state,
    mutateState: (mutator) => { mutator(state); return state; }, saveState: () => {}, sendToRenderer: () => {}, logEvent: () => {}, shotHasRenderableVideo: () => false,
    sockets: new Set([{}]), sendBridgeMessage: (message) => { envelopes.push(message); return 1; }, encodeBridgeReferences: (message) => message
  });
  const payload = (jobId) => ({
    jobId, projectId: "project-1", providerId: "chatgpt-web", jobType: "image", prompt: "same prompt",
    bridgeMessage: { type: "RUN_JOB", provider: "chatgpt-web", task: "text_to_image", jobId, prompt: "same prompt", references: [], settings: { idempotencyKey: "logical-key" } }
  });
  handler({}, payload("job-one"));
  state.jobs[0].status = "done";
  handler({}, payload("job-two"));
  assert.equal(state.jobs[1].idempotencyKey, "job-one:logical-key");
  assert.equal(state.jobs[0].idempotencyKey, "job-two:logical-key");
  assert.equal(envelopes[0].settings.idempotencyKey, "job-one:logical-key");
  assert.equal(envelopes[1].settings.idempotencyKey, "job-two:logical-key");
});

test("video preflight signature follows the concrete dispatch id", () => {
  const { registerRunJobHandler } = require("../main/job-handler-actions.cjs");
  const state = { projects: [{ id: "project-1" }], shots: [], assets: [], jobs: [] };
  let handler;
  let envelope;
  registerRunJobHandler({
    ipcMain: { handle: (_name, callback) => { handler = callback; } },
    crypto: require("node:crypto"),
    normalizeBridgeMessageForStorage: (_projectId, message) => structuredClone(message),
    now: () => "2026-09-01T00:00:00.000Z", saveStateBackup: () => {}, getState: () => state,
    mutateState: (mutator) => { mutator(state); return state; }, saveState: () => {}, sendToRenderer: () => {}, logEvent: () => {},
    shotHasRenderableVideo: () => false, sockets: new Set([{}]), sendBridgeMessage: (message) => { envelope = message; return 1; },
    encodeBridgeReferences: (message) => message
  });
  handler({}, {
    jobId: "flow-job", projectId: "project-1", shotId: "shot-1", providerId: "google-flow-web", jobType: "video", prompt: "shot",
    bridgeMessage: { type: "RUN_JOB", provider: "google-flow", task: "image_to_video", jobId: "flow-job", prompt: "shot", references: [], settings: {
      idempotencyKey: "logical-key", preflightValidation: { valid: true, shotId: "shot-1", idempotencyKey: "logical-key", estimatedSubmits: 1, issues: [] }
    } }
  });
  assert.equal(state.jobs[0].status, "opening_provider");
  assert.equal(envelope.settings.idempotencyKey, "flow-job:logical-key");
  assert.equal(envelope.settings.preflightValidation.idempotencyKey, "flow-job:logical-key");
});
