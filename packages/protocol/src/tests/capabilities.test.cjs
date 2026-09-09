const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCapabilityManifest, capabilityIssues } = require("../capabilities.cjs");

test("capability manifest normalizes identity fields and applies a safe size default", () => {
  assert.deepEqual(normalizeCapabilityManifest({
    protocolVersions: [2, 1, 2], providers: ["google-flow", "google-flow"], maxMessageBytes: 512
  }), {
    manifestVersion: "1", protocolVersions: [1, 2], providers: ["google-flow"], executors: [], tasks: [], maxMessageBytes: 4 * 1024 * 1024, binaryTransfer: "none"
  });
});

test("capability mismatch fails before dispatch while a legacy empty manifest remains compatible", () => {
  assert.deepEqual(capabilityIssues({ protocolVersions: [1], providers: ["chatgpt"], maxMessageBytes: 1024 }, { provider: "google-flow", protocolVersion: 1 }), {
    ok: false, issues: ["provider_unsupported"], manifest: normalizeCapabilityManifest({ protocolVersions: [1], providers: ["chatgpt"], maxMessageBytes: 1024 })
  });
  assert.equal(capabilityIssues({}, { provider: "google-flow", protocolVersion: 2 }, 20_000).ok, true);
});

test("message size and binary transport are explicit capability failures", () => {
  const result = capabilityIssues({ protocolVersions: [1], maxMessageBytes: 1024, binaryTransfer: "loopback-file" }, { protocolVersion: 1, binaryTransfer: "scoped-stream" }, 1025);
  assert.deepEqual(result.issues, ["message_too_large", "binary_transfer_unsupported"]);
});
