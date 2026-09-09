const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("Flow app diagnostic normalizes an extension-only intake payload", async () => {
  const module = await import(`${pathToFileURL(path.resolve(__dirname, "../background/flow-app-diagnostic.ts")).href}?test=${Date.now()}`);
  const payload = module.normalizeFlowAppDiagnosticPayload({
    diagnosticId: "diag-001", expectedRuntimeUrl: "https://labs.google/fx/vi/tools/flow/project/p/tool-version/t",
    manifest: { prompt: "lantern" }, mediaId: "fe_id_reference", aspectRatio: "9:16", durationSec: 4
  });
  assert.deepEqual(payload.manifest, { prompt: "lantern", diagnosticId: "diag-001" });
  assert.equal(payload.aspectRatio, "9:16");
});

test("Flow app diagnostic receipt separates successful intake from mismatched app state", async () => {
  const module = await import(`${pathToFileURL(path.resolve(__dirname, "../background/flow-app-diagnostic.ts")).href}?test=${Date.now()}`);
  const payload = module.normalizeFlowAppDiagnosticPayload({ diagnosticId: "diag-002", expectedRuntimeUrl: "https://labs.google/fx/vi/tools/flow/project/p/tool-version/t", manifest: { prompt: "lake" }, mediaId: "fe_id_a", aspectRatio: "16:9", durationSec: 6 });
  const base = { diagnosticId: payload.diagnosticId, runtimeUrl: payload.expectedRuntimeUrl, manifestText: JSON.stringify(payload.manifest), parsedManifest: payload.manifest, mediaId: "fe_id_a", aspectRatio: "16:9", durationSec: 6 };
  const accepted = module.evaluateFlowAppDiagnosticReceipt(payload, base);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.stage, "flow_app_received");
  const mismatch = module.evaluateFlowAppDiagnosticReceipt(payload, { ...base, mediaId: "wrong" });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.stage, "flow_app_mismatch");
  assert.equal(mismatch.checks.mediaId, false);
});
