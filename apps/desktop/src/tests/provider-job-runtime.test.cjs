const assert = require("node:assert/strict");
const test = require("node:test");
const { createProviderJobRuntime } = require("../main/jobs/provider-runtime.cjs");

function runtimeFixture(job, projects = [], options = {}) {
  const state = { jobs: [job], projects };
  const messages = [];
  const events = [];
  let clock = 100_000;
  const runtime = createProviderJobRuntime({
    getState: () => state,
    sockets: options.sockets || new Set([{}]),
    saveState() {},
    sendToRenderer() {},
    sendBridgeMessage: (message) => { messages.push(message); return 1; },
    encodeReferences: (message) => message,
    socketCanHandleProvider: () => true,
    safeSend: () => true,
    broadcast: (message) => { messages.push(message); return 1; },
    now: () => new Date(clock).toISOString(),
    nowMs: () => clock,
    logEvent: (name) => events.push(name),
    providerActiveTimeoutMs: 10_000,
    flowActiveTimeoutMs: 20_000,
    flowRecoveryTimeoutMs: 30_000
  });
  return { runtime, messages, events, advance(ms) { clock += ms; } };
}

test("provider runtimes keep state and sockets isolated per instance", () => {
  const job1 = {
    id: "instance-one-job", projectId: "p1", providerId: "chatgpt-web", status: "pending",
    input: { bridgeMessage: { type: "RUN_JOB", jobId: "instance-one-job", task: "text" } }
  };
  const job2 = {
    id: "instance-two-job", projectId: "p2", providerId: "chatgpt-web", status: "pending",
    input: { bridgeMessage: { type: "RUN_JOB", jobId: "instance-two-job", task: "text" } }
  };
  const first = runtimeFixture(job1);
  const second = runtimeFixture(job2);

  // Creating a second runtime must not retarget the first runtime's dispatch
  // to the second state/socket set (the former module-global bug).
  assert.equal(first.runtime.dispatchPending(), 1);
  assert.equal(job1.status, "opening_provider");
  assert.equal(job2.status, "pending");
  assert.equal(first.messages.length, 1);
  assert.equal(second.messages.length, 0);

  const noSocketFirst = runtimeFixture({ ...job1, id: "no-socket-job", status: "pending", input: { bridgeMessage: { type: "RUN_JOB", jobId: "no-socket-job", task: "text" } } }, [], { sockets: new Set() });
  const socketSecond = runtimeFixture({ ...job2, id: "socket-job", status: "pending", input: { bridgeMessage: { type: "RUN_JOB", jobId: "socket-job", task: "text" } } }, [], { sockets: new Set([{}]) });
  assert.equal(noSocketFirst.runtime.dispatchPending(), 0);
  assert.equal(noSocketFirst.messages.length, 0);
  assert.equal(socketSecond.runtime.dispatchPending(), 1);
});

test("ChatGPT ACK stall gets one hard reset then terminates without resubmitting", () => {
  const job = { id: "j1", projectId: "p1", providerId: "chatgpt-web", status: "opening_provider", bridgeAcknowledgedAt: "yes", updatedAt: new Date(0).toISOString(), input: { bridgeMessage: { type: "RUN_JOB", task: "text" } } };
  const fixture = runtimeFixture(job);
  assert.equal(fixture.runtime.retryOpening(), 1);
  assert.equal(job.chatGptHardResetAttempts, 1);
  assert.deepEqual(fixture.messages[0], { type: "HARD_RESET_CHATGPT_DISPATCH", jobId: "j1" });
  assert.ok(fixture.events.includes("chatgpt_hard_reset_requested"));

  fixture.advance(100_000);
  assert.equal(fixture.runtime.retryOpening(), 1);
  assert.equal(job.status, "failed_retryable");
  assert.equal(fixture.messages.filter((message) => message.type === "HARD_RESET_CHATGPT_DISPATCH").length, 1);
  assert.equal(fixture.messages.some((message) => message.type === "RUN_JOB"), false);
});

test("Flow ACK stall terminates without redelivering the video envelope", () => {
  const job = {
    id: "flow-ack-stall", projectId: "p1", shotId: "sh1", providerId: "google-flow-web",
    status: "opening_provider", bridgeAcknowledgedAt: "yes", updatedAt: new Date(0).toISOString(),
    input: { bridgeMessage: { type: "RUN_JOB", task: "image_to_video", prompt: "shot" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(160_000);
  assert.equal(fixture.runtime.retryOpening(), 1);
  assert.equal(job.status, "failed_retryable");
  assert.match(job.error, /did not advance after the extension ACK/);
  assert.deepEqual(fixture.messages, [{ type: "CANCEL_JOB", jobId: "flow-ack-stall" }]);
});

test("Flow timeout enters strict recovery before any fresh provider submission", () => {
  const job = { id: "flow1", projectId: "p1", shotId: "sh1", providerId: "google-flow-web", jobType: "video", status: "generating", updatedAt: new Date(0).toISOString(), input: { prompt: "shot", bridgeMessage: { type: "RUN_JOB", task: "image_to_video", prompt: "shot", references: [] } } };
  const fixture = runtimeFixture(job);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.status, "downloading");
  assert.equal(job.flowRecoveryAttempts, 1);
  assert.equal(fixture.messages.filter((message) => message.type === "RECOVER_FLOW_RESULT").length, 1);
  assert.equal(fixture.messages.filter((message) => message.type === "RUN_JOB").length, 0);
});

test("Flow generation watchdog starts at immutable provider acceptance, not picker dispatch", () => {
  const job = {
    id: "flow-accepted", projectId: "p1", shotId: "sh1", providerId: "google-flow-web", jobType: "video",
    status: "generating", providerRunStartedAt: new Date(0).toISOString(), providerAcceptedAt: new Date(90_000).toISOString(),
    input: { bridgeMessage: { type: "RUN_JOB", task: "image_to_video" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(9_000);
  assert.equal(fixture.runtime.retryActive(), 0);
  assert.equal(job.status, "generating");
  fixture.advance(12_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.status, "downloading");
  assert.equal(fixture.messages.filter((message) => message.type === "RECOVER_FLOW_RESULT").length, 1);
});

test("user-suppressed Flow recovery does not resurrect after bridge reconnect", () => {
  const job = {
    id: "flow-cancelled", projectId: "p1", shotId: "sh1", providerId: "google-flow-web", jobType: "video",
    status: "failed_retryable", needsStrictFlowRecovery: false, flowRecoverySuppressedAt: new Date(90_000).toISOString(),
    error: "timeout waiting for Google Flow result", input: { bridgeMessage: { type: "RUN_JOB", task: "image_to_video" } }
  };
  const fixture = runtimeFixture(job);
  assert.equal(fixture.runtime.recoverRecentFlowFailures(), 0);
  assert.equal(job.status, "failed_retryable");
  assert.equal(fixture.messages.length, 0);
});

test("Flow recovery respects the project's explicit YOLO opt-in", () => {
  const job = {
    id: "flow-project-off", projectId: "p1", shotId: "sh1", providerId: "google-flow-web", jobType: "video",
    status: "failed_retryable", needsStrictFlowRecovery: true,
    error: "timeout waiting for Google Flow result", input: { bridgeMessage: { type: "RUN_JOB", task: "image_to_video" } }
  };
  const fixture = runtimeFixture(job, [{ id: "p1", intake: { yoloEnabled: false } }]);
  assert.equal(fixture.runtime.recoverRecentFlowFailures(), 0);
  assert.equal(job.status, "failed_retryable");
  assert.equal(fixture.messages.length, 0);
});

test("Flow reconnect recovery ignores stale historical failures", () => {
  const job = {
    id: "flow-stale", projectId: "p1", shotId: "sh1", providerId: "google-flow-web", jobType: "video",
    status: "failed_retryable", needsStrictFlowRecovery: true,
    updatedAt: new Date(-1_000_000).toISOString(), error: "timeout waiting for Google Flow result",
    input: { bridgeMessage: { type: "RUN_JOB", task: "image_to_video" } }
  };
  const fixture = runtimeFixture(job, [{ id: "p1", intake: { yoloEnabled: true } }]);
  assert.equal(fixture.runtime.recoverRecentFlowFailures(), 0);
  assert.equal(job.status, "failed_retryable");
  assert.equal(fixture.messages.length, 0);
});

test("Flow reconnect recovery permits one recent YOLO failure", () => {
  const job = {
    id: "flow-recent", projectId: "p1", shotId: "sh1", providerId: "google-flow-web", jobType: "video",
    status: "failed_retryable", needsStrictFlowRecovery: true,
    updatedAt: new Date(99_000).toISOString(), error: "timeout waiting for Google Flow result",
    input: { bridgeMessage: { type: "RUN_JOB", task: "image_to_video" } }
  };
  const fixture = runtimeFixture(job, [{ id: "p1", intake: { yoloEnabled: true } }]);
  assert.equal(fixture.runtime.recoverRecentFlowFailures(), 1);
  assert.equal(job.status, "downloading");
  assert.equal(fixture.messages[0].type, "RECOVER_FLOW_RESULT");
});

test("provider heartbeats cannot extend an active attempt watchdog", () => {
  const job = {
    id: "chat1", projectId: "p1", providerId: "chatgpt-web", status: "generating",
    providerRunStartedAt: new Date(0).toISOString(), updatedAt: new Date(9_000).toISOString(),
    input: { bridgeMessage: { type: "RUN_JOB", task: "text" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(11_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.status, "opening_provider");
  assert.equal(job.chatGptHardResetAttempts, 1);
  assert.equal(fixture.messages[0].type, "HARD_RESET_CHATGPT_DISPATCH");
});

test("ChatGPT active timeout hard-resets before sending another envelope", () => {
  const job = {
    id: "chat-timeout", projectId: "p1", providerId: "chatgpt-web", status: "generating",
    providerRunStartedAt: new Date(0).toISOString(), input: { bridgeMessage: { type: "RUN_JOB", task: "text" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(11_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.status, "opening_provider");
  assert.equal(job.chatGptHardResetAttempts, 1);
  assert.deepEqual(fixture.messages[0], { type: "HARD_RESET_CHATGPT_DISPATCH", jobId: "chat-timeout" });
  assert.equal(fixture.messages.some((message) => message.type === "RUN_JOB"), false);
  assert.ok(fixture.events.includes("chatgpt_hard_reset_requested"));
});

test("ChatGPT structured screenplay gets the extended watchdog", () => {
  const job = {
    id: "chat-structured-timeout", projectId: "p1", providerId: "chatgpt-web", status: "generating",
    providerRunStartedAt: new Date(0).toISOString(), input: { bridgeMessage: { type: "RUN_JOB", task: "screenplay_scene" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(130_000);
  assert.equal(fixture.runtime.retryActive(), 0);
  assert.equal(job.status, "generating");
  fixture.advance(180_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.chatGptHardResetAttempts, 1);
});

test("ChatGPT structured request stuck before send keeps the short watchdog", () => {
  const job = {
    id: "chat-structured-submit-stall", projectId: "p1", providerId: "chatgpt-web", status: "submitting",
    providerRunStartedAt: new Date(0).toISOString(), statusMessage: "Preparing ChatGPT request...",
    input: { bridgeMessage: { type: "RUN_JOB", task: "shot_breakdown" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(11_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.status, "opening_provider");
  assert.equal(job.chatGptHardResetAttempts, 1);
  assert.deepEqual(fixture.messages[0], { type: "HARD_RESET_CHATGPT_DISPATCH", jobId: "chat-structured-submit-stall" });
});

test("ChatGPT image render gets the extended watchdog while text keeps the normal bound", () => {
  const job = {
    id: "chat-image-timeout", projectId: "p1", providerId: "chatgpt-web", status: "generating",
    providerRunStartedAt: new Date(0).toISOString(), input: { bridgeMessage: { type: "RUN_JOB", task: "text_to_image" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(130_000);
  assert.equal(fixture.runtime.retryActive(), 0);
  assert.equal(job.status, "generating");
  fixture.advance(110_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.chatGptHardResetAttempts, 1);
});

test("ChatGPT image handoff gets time to download without hard-resetting or resubmitting", () => {
  const job = {
    id: "chat-download", projectId: "p1", providerId: "chatgpt-web", status: "downloading",
    providerRunStartedAt: new Date(0).toISOString(), input: { bridgeMessage: { type: "RUN_JOB", task: "image" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(11_000);
  assert.equal(fixture.runtime.retryActive(), 0);
  assert.equal(job.status, "downloading");
  fixture.advance(120_000);
  assert.equal(fixture.runtime.retryActive(), 0);
  fixture.advance(10_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.status, "failed_retryable");
  assert.equal(fixture.messages.some((message) => message.type === "HARD_RESET_CHATGPT_DISPATCH"), false);
  assert.equal(fixture.messages.some((message) => message.type === "RUN_JOB"), false);
  assert.match(job.statusMessage, /asset handoff/i);
});

test("structured text handoff gets its own import window and is never labeled an image failure", () => {
  const job = {
    id: "chat-text-handoff", projectId: "p1", providerId: "chatgpt-web", status: "downloading",
    providerRunStartedAt: new Date(0).toISOString(), updatedAt: new Date(99_000).toISOString(),
    input: { bridgeMessage: { type: "RUN_JOB", task: "screenplay_scene" } }
  };
  const fixture = runtimeFixture(job);
  assert.equal(fixture.runtime.retryActive(), 0);
  assert.equal(job.resultHandoffStartedAt, new Date(99_000).toISOString());
  assert.equal(job.status, "downloading");
  fixture.advance(20_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.doesNotMatch(job.statusMessage, /image candidate/i);
});

test("legacy active jobs get a stable watchdog anchor", () => {
  const job = {
    id: "legacy-chat", projectId: "p1", providerId: "chatgpt-web", status: "downloading",
    createdAt: new Date(0).toISOString(), updatedAt: new Date(9_000).toISOString(),
    input: { bridgeMessage: { type: "RUN_JOB", task: "image" } }
  };
  const fixture = runtimeFixture(job);
  fixture.advance(11_000);
  assert.equal(fixture.runtime.retryActive(), 0);
  fixture.advance(229_000);
  assert.equal(fixture.runtime.retryActive(), 1);
  assert.equal(job.status, "failed_retryable");
  assert.equal(job.providerRunStartedAt, new Date(0).toISOString());
});
