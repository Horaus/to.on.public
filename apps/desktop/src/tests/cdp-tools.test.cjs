const test = require("node:test");
const assert = require("node:assert/strict");

const { isFlowCustomToolUrl } = require("../main/bridge/cdp-tools.cjs");
const fs = require("node:fs");
const path = require("node:path");

test("Flow desktop matcher accepts legacy and runtime tool-version routes", () => {
  assert.equal(isFlowCustomToolUrl("https://labs.google/fx/vi/tools/flow/project/p1/tool/t1"), true);
  assert.equal(isFlowCustomToolUrl("https://labs.google/fx/vi/tools/flow/project/p1/tool-version/t2"), true);
  assert.equal(isFlowCustomToolUrl("https://labs.google/fx/vi/tools/flow/shared/tool/t3"), true);
  assert.equal(isFlowCustomToolUrl("https://labs.google/fx/vi/tools/flow/project/p1"), false);
});

test("live Flow verifier treats the optional runtime tab as an advisory", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../scripts/verify-live-flow.mjs"), "utf8");
  assert.match(source, /const advisories = \[\]/);
  assert.match(source, /googleFlowRuntimeToolTabs !== 1\) advisories\.push/);
  assert.doesNotMatch(source, /googleFlowRuntimeToolTabs !== 1\) blockers\.push/);
  assert.match(source, /bridgeConnected: app\.connectedExtensions >= 1/);
  assert.match(source, /flowRouteObserved = app\.connections\?\.some/);
  assert.match(source, /providerRuntimeVerified:/);
  assert.match(source, /flowWorkspaceTabCount = flowProjectTabCount/);
  assert.match(source, /Prefer the base workspace for page inspection/);
  assert.match(source, /Flow workspace tab/);
  assert.match(source, /pairing chưa được xác nhận/);
  assert.match(source, /pairing\?\.state !== "confirmed"/);
  assert.match(source, /runtimeOnlyTopology/);
  assert.match(source, /runtime đã publish/);
  assert.match(source, /Flow CDP tab chưa phải published runtime/);
  assert.match(source, /flowPageIsPublishedRuntime/);
});
