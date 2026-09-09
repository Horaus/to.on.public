const test = require("node:test");
const assert = require("node:assert/strict");
const { planProviderAdmission } = require("../background/coordinator.cjs");

test("provider coordinator rejects duplicate envelopes idempotently", () => {
  assert.deepEqual(planProviderAdmission({ jobId: "j1", provider: "chatgpt" }, [{ jobId: "j1", provider: "chatgpt" }], true), { action: "duplicate", activeJobId: "j1" });
});

test("provider coordinator serializes ChatGPT without blocking other providers", () => {
  const active = [{ jobId: "j1", provider: "chatgpt" }];
  assert.deepEqual(planProviderAdmission({ jobId: "j2", provider: "chatgpt" }, active, true), { action: "reject_serial", activeJobId: "j1" });
  assert.deepEqual(planProviderAdmission({ jobId: "j3", provider: "google-flow" }, active, true), { action: "accept" });
  // Provider lanes are independent: an image/keyframe ChatGPT lane may be
  // active while a Flow video lane starts, and vice versa. Only commands
  // targeting the same ChatGPT lane are single-flight.
  assert.deepEqual(planProviderAdmission({ jobId: "j4", provider: "chatgpt" }, [{ jobId: "flow-1", provider: "google-flow" }], true), { action: "accept" });
  assert.deepEqual(planProviderAdmission({ jobId: "j5", provider: "google-flow" }, [{ jobId: "chat-1", provider: "chatgpt" }], true), { action: "accept" });
});

test("provider coordinator fails unknown routes before mutating active jobs", () => {
  assert.deepEqual(planProviderAdmission({ jobId: "j1", provider: "unknown" }, [], false), { action: "reject_unknown" });
});
