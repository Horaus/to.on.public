const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function moduleUnderTest() {
  return import(`${pathToFileURL(path.resolve(__dirname, "../core/flow-connection-identity.ts")).href}?test=${Date.now()}`);
}

test("canonical Flow identity selects only the extension that owns the runtime", async () => {
  const module = await moduleUnderTest();
  const result = module.canonicalFlowConnection({ connections: [
    { extensionInstanceId: "aaaa-no-flow", providerVisibility: { googleFlowProjectTabs: 0, googleFlowRuntimeToolTabs: 0, googleFlowEditorToolTabs: 0 } },
    { extensionInstanceId: "2536-owner", providerVisibility: { googleFlowProjectTabs: 2, googleFlowRuntimeToolTabs: 1, googleFlowEditorToolTabs: 0 } }
  ] });
  assert.equal(result.selected.extensionInstanceId, "2536-owner");
  assert.equal(result.identitySuffix, "2536");
  assert.equal(result.otherConnectionCount, 1);
});

test("canonical Flow identity stays unresolved when two installations own runtimes", async () => {
  const module = await moduleUnderTest();
  const result = module.canonicalFlowConnection({ connections: [
    { extensionInstanceId: "first", providerVisibility: { googleFlowProjectTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowEditorToolTabs: 0 } },
    { extensionInstanceId: "second", providerVisibility: { googleFlowProjectTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowEditorToolTabs: 0 } }
  ] });
  assert.equal(result.selected, undefined);
  assert.equal(result.candidateCount, 2);
});

test("topology ignores one non-canonical restarted session", async () => {
  const module = await moduleUnderTest();
  const result = module.flowConnectionsForTopology({ connections: [
    { extensionInstanceId: "canonical", discovery: { canonical: true }, providerVisibility: { googleFlowProjectTabs: 1 } },
    { extensionInstanceId: "stale", discovery: { canonical: false }, providerVisibility: { googleFlowProjectTabs: 1 } }
  ] });
  assert.deepEqual(result.map((connection) => connection.extensionInstanceId), ["canonical"]);
});

test("topology remains fail-closed when canonical election is ambiguous", async () => {
  const module = await moduleUnderTest();
  const result = module.flowConnectionsForTopology({ connections: [
    { extensionInstanceId: "one", discovery: { canonical: true } },
    { extensionInstanceId: "two", discovery: { canonical: true } }
  ] });
  assert.equal(result.length, 2);
});

test("topology prefers the real tools workspace over a same-project shell session", async () => {
  const module = await moduleUnderTest();
  const result = module.flowConnectionsForTopology({ connections: [
    { extensionInstanceId: "workspace", discovery: { canonical: true }, providerVisibility: { googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p/tools"] } },
    { extensionInstanceId: "shell", discovery: { canonical: true }, providerVisibility: { googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p"] } }
  ] });
  assert.deepEqual(result.map((connection) => connection.extensionInstanceId), ["workspace"]);
});

test("canonical identity prefers the complete workspace plus runtime after restart", async () => {
  const module = await moduleUnderTest();
  const result = module.canonicalFlowConnection({ connections: [
    { extensionInstanceId: "runtime-only-stale", providerVisibility: { googleFlowTabs: 1, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowEditorToolTabs: 0 } },
    { extensionInstanceId: "complete", providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowEditorToolTabs: 0 } }
  ] });
  assert.equal(result.selected.extensionInstanceId, "complete");
  assert.equal(result.candidateCount, 2);
});

test("topology election ignores stale canonical runtime when complete session is available", async () => {
  const module = await moduleUnderTest();
  const result = module.flowConnectionsForTopology({ connections: [
    { extensionInstanceId: "stale", discovery: { canonical: true }, providerVisibility: { googleFlowTabs: 1, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p/tool-version/r"] } },
    { extensionInstanceId: "complete", discovery: { canonical: true }, providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p/tool-version/r", "https://labs.google/fx/vi/tools/flow/project/p"] } }
  ] });
  assert.deepEqual(result.map((connection) => connection.extensionInstanceId), ["complete"]);
});

test("catalog landing tab does not count as a real Flow workspace", async () => {
  const module = await moduleUnderTest();
  const result = module.flowConnectionsForTopology({ connections: [
    { extensionInstanceId: "catalog", discovery: { canonical: true }, providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p/tool-version/r", "https://labs.google/fx/vi/tools/flow"] } },
    { extensionInstanceId: "workspace", discovery: { canonical: true }, providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p", "https://labs.google/fx/vi/tools/flow/project/p/tool-version/r"] } }
  ] });
  assert.deepEqual(result.map((connection) => connection.extensionInstanceId), ["workspace"]);
});
