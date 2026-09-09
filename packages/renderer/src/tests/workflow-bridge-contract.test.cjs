const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("workflow bridge is injectable and does not require a DOM global", async () => {
  const bridge = await import(pathToFileURL(path.resolve(__dirname, "../../../workflow/src/workflow-bridge.ts")));
  const fake = { runJob: async () => ({}) };
  bridge.configureWorkflowBridge(fake);
  assert.equal(bridge.getWorkflowBridge(), fake);
  bridge.configureWorkflowBridge(undefined);
  assert.equal(bridge.getWorkflowBridge(), undefined);
});
