const test = require("node:test");
const assert = require("node:assert/strict");
const { readPipelineRuntime, runtimeKey, writePipelineRuntime } = require("../../../workflow/src/orchestration/pipeline-runtime.cjs");

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}

test("pipeline and storyboard queue survive renderer reload for the same project", () => {
  const storage = memoryStorage();
  const value = { run: { mode: "full", running: true, currentStep: "storyboard" }, storyboardQueue: { projectId: "p1", nextIndex: 2, items: [] } };
  writePipelineRuntime(storage, "p1", value);
  assert.deepEqual(readPipelineRuntime(storage, "p1"), value);
  assert.deepEqual(readPipelineRuntime(storage, "p2"), { run: null, storyboardQueue: null });
});

test("empty runtime removes stale durable state", () => {
  const storage = memoryStorage();
  writePipelineRuntime(storage, "p1", { run: { running: true }, storyboardQueue: null });
  writePipelineRuntime(storage, "p1", { run: null, storyboardQueue: null });
  assert.equal(storage.getItem(runtimeKey("p1")), null);
});

test("corrupt runtime fails closed instead of blocking YOLO", () => {
  const storage = memoryStorage();
  storage.setItem(runtimeKey("p1"), "{broken");
  assert.deepEqual(readPipelineRuntime(storage, "p1"), { run: null, storyboardQueue: null });
});
