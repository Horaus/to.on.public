import assert from "node:assert/strict";
import test from "node:test";
import { selectFlowSession } from "./flow-session-selection.mjs";

test("selects the session that owns the current Flow topology", () => {
  const result = selectFlowSession([
    { extensionId: "same", extensionInstanceId: "stale", providerVisibility: { googleFlowProjectTabs: 0 }, pairing: { state: "confirmed" } },
    { extensionId: "same", extensionInstanceId: "active", providerVisibility: { googleFlowProjectTabs: 2, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1 }, pairing: { state: "confirmed" } }
  ], "same");
  assert.equal(result.selected.extensionInstanceId, "active");
  assert.equal(result.ignoredMatchingSessionCount, 1);
});

test("does not borrow a session from another extension identity", () => {
  const result = selectFlowSession([
    { extensionId: "other", extensionInstanceId: "other-active", providerVisibility: { googleFlowProjectTabs: 2 } },
    { extensionId: "same", extensionInstanceId: "same-empty", providerVisibility: { googleFlowProjectTabs: 0 } }
  ], "same");
  assert.equal(result.selected.extensionInstanceId, "same-empty");
  assert.equal(result.matching.length, 1);
});

test("prefers the complete workspace plus runtime over a newer runtime-only stale session", () => {
  const result = selectFlowSession([
    { extensionId: "same", extensionInstanceId: "complete", lastSeenAt: 100, providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1 }, pairing: { state: "confirmed" } },
    { extensionId: "same", extensionInstanceId: "runtime-only-stale", lastSeenAt: 999999999999, providerVisibility: { googleFlowTabs: 1, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1 }, pairing: { state: "confirmed" } }
  ], "same");
  assert.equal(result.selected.extensionInstanceId, "complete");
});

test("does not select a catalog landing tab as the workspace owner", () => {
  const result = selectFlowSession([
    { extensionId: "same", extensionInstanceId: "catalog", lastSeenAt: 999999999999, providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p/tool-version/r", "https://labs.google/fx/vi/tools/flow"] }, pairing: { state: "confirmed" } },
    { extensionId: "same", extensionInstanceId: "workspace", lastSeenAt: 1, providerVisibility: { googleFlowTabs: 2, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/vi/tools/flow/project/p", "https://labs.google/fx/vi/tools/flow/project/p/tool-version/r"] }, pairing: { state: "confirmed" } }
  ], "same");
  assert.equal(result.selected.extensionInstanceId, "workspace");
});

test("prefers a published runtime over a stale editor-tool session", () => {
  const result = selectFlowSession([
    { extensionId: "same", extensionInstanceId: "editor", providerVisibility: { googleFlowTabs: 1, googleFlowProjectTabs: 1, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 0, googleFlowEditorToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/tools/flow/project/p/tool/old"] }, pairing: { state: "confirmed" } },
    { extensionId: "same", extensionInstanceId: "runtime", providerVisibility: { googleFlowTabs: 1, googleFlowProjectTabs: 0, googleFlowCustomToolTabs: 1, googleFlowRuntimeToolTabs: 1, googleFlowUrls: ["https://labs.google/fx/tools/flow/project/p/tool-version/new"] }, pairing: { state: "confirmed" } }
  ], "same");
  assert.equal(result.selected.extensionInstanceId, "runtime");
});
