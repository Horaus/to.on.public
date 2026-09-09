const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("builds and normalizes compatible top-level and nested Relay v2 envelopes", () => {
  const module = require("../background/flow-relay-envelope.cjs");
  const request = module.createFlowRelayRequest({ sessionId: "s1", correlationId: "c1", idempotencyKey: "k1", manifest: { jobId: "j1" } });
  assert.equal(request.type, "STUDIO_SHOT_REQUEST");
  assert.equal(request.payload.type, request.type);
  assert.equal(request.payload.correlationId, "c1");
  assert.deepEqual(module.normalizeFlowRelayMessage(request), { source: "rtk-ai-video-studio", protocolVersion: 2, type: "STUDIO_SHOT_REQUEST", sessionId: "s1", correlationId: "c1", idempotencyKey: "k1", manifest: { jobId: "j1" } });
  assert.equal(module.normalizeFlowRelayMessage({ payload: request.payload }).type, "STUDIO_SHOT_REQUEST");
});

test("normalizes the live Flow Relay camelCase SDK result", async () => {
  const module = await import(`${pathToFileURL(path.resolve(__dirname, "../background/flow-relay-result.ts")).href}?test=${Date.now()}`);
  const result = module.normalizeFlowRelayIntegration({ base64: "data:video/mp4;base64,AAAA", mimeType: "video/mp4", mediaId: "fe_id_new" });
  assert.equal(result.base64, "AAAA");
  assert.equal(result.mediaId, "fe_id_new");
  assert.equal(result.providerJobId, "flow_relay_fe_id_new");
});

test("preserves legacy provider identity and detects only a new relay result", async () => {
  const module = await import(`${pathToFileURL(path.resolve(__dirname, "../background/flow-relay-result.ts")).href}?test=${Date.now()}`);
  const legacy = module.normalizeFlowRelayIntegration({ base64: "BBBB", media_id: "fe_id_legacy", provider_id: "flow_real_run" });
  assert.equal(legacy.mediaId, "fe_id_legacy");
  assert.equal(legacy.providerJobId, "flow_real_run");
  assert.equal(module.flowRelayResultChanged({ mediaId: "fe_id_old", bytesFingerprint: "old" }, { mediaId: "fe_id_old", bytesFingerprint: "old" }), false);
  assert.equal(module.flowRelayResultChanged({ mediaId: "fe_id_old", bytesFingerprint: "old" }, { mediaId: "fe_id_new", bytesFingerprint: "new" }), true);
});

test("normalizes the old experimental source label to the v2 components contract", async () => {
  const module = await import(`${pathToFileURL(path.resolve(__dirname, "../background/flow-relay-result.ts")).href}?test=${Date.now()}`);
  const result = module.normalizeFlowRelayIntegration({ sourceMode: "experimental", audio_policy: "separate_audio_pass", quality: "quality", voiceLockVerified: true });
  assert.equal(result.sourceMode, "components");
  assert.equal(result.audioPolicy, "separate_audio_pass");
  assert.equal(result.quality, "quality");
  assert.equal(result.voiceLockVerified, true);
});

test("normalizes voice lock and output settings for v2 result binding", async () => {
  const module = await import(`${pathToFileURL(path.resolve(__dirname, "../background/flow-relay-result.ts")).href}?test=${Date.now()}`);
  const result = module.normalizeFlowRelayIntegration({
    voiceLock: { characterId: "mai", voiceId: "vi-female-1", voiceSignature: "sig-mai" },
    output_language: "Vietnamese", output_resolution: "1080p"
  });
  assert.deepEqual(result.voiceLock, { characterId: "mai", voiceId: "vi-female-1", voiceSignature: "sig-mai" });
  assert.equal(result.outputLanguage, "Vietnamese");
  assert.equal(result.outputResolution, "1080p");
});
