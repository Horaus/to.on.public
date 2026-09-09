const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FLOW_EXECUTOR_CUSTOM_TOOL,
  FLOW_EXECUTOR_UI_DIRECT,
  flowExecutorFromSettings,
  shouldUseFlowCustomTool
} = require("../background/flow-executor-selection.cjs");

test("new Flow jobs default to the native UI-direct executor", () => {
  assert.equal(flowExecutorFromSettings(undefined), FLOW_EXECUTOR_UI_DIRECT);
  assert.equal(shouldUseFlowCustomTool({ settings: {} }), false);
});

test("custom Flow jobs require an explicit executor selection", () => {
  const job = { settings: { flowExecutor: FLOW_EXECUTOR_CUSTOM_TOOL } };
  assert.equal(flowExecutorFromSettings(job.settings), FLOW_EXECUTOR_CUSTOM_TOOL);
  assert.equal(shouldUseFlowCustomTool(job), true);
});

test("unknown executor values fail closed to native Flow", () => {
  assert.equal(flowExecutorFromSettings({ flowExecutor: "unknown" }), FLOW_EXECUTOR_UI_DIRECT);
});
