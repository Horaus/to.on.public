const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEnvelope, destinationMatches, idempotencyKey, createPairingChallenge, deriveAuthenticator, derivePairingConfirmation, verifyAuthenticator, createFencingAuthority } = require("../connection-v2.cjs");

function envelope(overrides = {}) {
  return {
    protocolVersion: "2", messageType: "RUN_JOB", messageId: "message-1", sequence: 1,
    issuedAt: new Date(100_000).toISOString(), expiresAt: new Date(200_000).toISOString(),
    source: { desktopInstanceId: "desktop-a" }, destination: { extensionInstanceId: "extension-a", connectorInstanceId: "connector-a", tabId: 41, frameId: 0 },
    route: { sessionId: "session-a", connectionId: "connection-a", leaseId: "lease-a", fencingToken: 1, provider: "google-flow" },
    job: { projectId: "project-a", jobId: "job-a", idempotencyKey: "key-a" },
    integrity: { algorithm: "hmac-sha256", nonce: "nonce-a", authenticator: "tag-a" }, ...overrides
  };
}

test("v2 RUN_JOB requires an exact endpoint and lease scope", () => {
  assert.deepEqual(validateEnvelope(envelope(), { nowMs: 150_000 }), { ok: true });
  assert.deepEqual(validateEnvelope(envelope({ destination: {} }), { nowMs: 150_000 }), { ok: false, code: "missing_destination_extensionInstanceId" });
  for (const field of ["connectorInstanceId", "tabId", "frameId"]) {
    const destination = { ...envelope().destination };
    delete destination[field];
    assert.deepEqual(validateEnvelope(envelope({ destination }), { nowMs: 150_000 }), { ok: false, code: `missing_destination_${field}` });
  }
  assert.deepEqual(validateEnvelope(envelope({ destination: { ...envelope().destination, tabId: 0 } }), { nowMs: 150_000 }), { ok: false, code: "invalid_destination_tabId" });
  assert.deepEqual(validateEnvelope(envelope({ destination: { ...envelope().destination, frameId: -1 } }), { nowMs: 150_000 }), { ok: false, code: "invalid_destination_frameId" });
  assert.deepEqual(validateEnvelope(envelope({ route: { ...envelope().route, fencingToken: undefined } }), { nowMs: 150_000 }), { ok: false, code: "missing_route_fencingToken" });
});

test("v2 rejects expiry, replay and wrong destination before dispatch", () => {
  assert.deepEqual(validateEnvelope(envelope(), { nowMs: 300_000 }), { ok: false, code: "expired" });
  assert.deepEqual(validateEnvelope(envelope(), { nowMs: 150_000, lastSequence: 1 }), { ok: false, code: "replayed_sequence" });
  assert.deepEqual(validateEnvelope(envelope(), { nowMs: 150_000, expectedDestination: { extensionInstanceId: "extension-b" } }), { ok: false, code: "wrong_destination" });
  assert.equal(destinationMatches({ extensionInstanceId: "extension-a", tabId: 4 }, { extensionInstanceId: "extension-a" }), true);
  assert.equal(destinationMatches({ extensionInstanceId: "extension-a" }, { extensionInstanceId: "extension-b" }), false);
});

test("v2 rejects envelopes whose lifetime exceeds the bounded protocol window", () => {
  assert.deepEqual(validateEnvelope(envelope({ expiresAt: new Date(100_000 + 5 * 60_000).toISOString() }), { nowMs: 150_000 }), { ok: true });
  assert.deepEqual(validateEnvelope(envelope({ expiresAt: new Date(100_000 + 5 * 60_000 + 1).toISOString() }), { nowMs: 150_000 }), { ok: false, code: "expiry_too_far" });
  assert.deepEqual(validateEnvelope(envelope({ expiresAt: new Date(100_000 + 1_000).toISOString() }), { nowMs: 150_000, maxLifetimeMs: 500 }), { ok: false, code: "expiry_too_far" });
});

test("idempotency canonicalization ignores object key order but preserves source changes", () => {
  assert.equal(idempotencyKey({ prompt: "A\r\nB", settings: { duration: 4, aspect: "9:16" } }), idempotencyKey({ settings: { aspect: "9:16", duration: 4 }, prompt: "A\nB" }));
  assert.notEqual(idempotencyKey({ sourceFingerprint: "one" }), idempotencyKey({ sourceFingerprint: "two" }));
});

test("fencing authority invalidates an old owner even while its old lease is unexpired", () => {
  let now = 1_000;
  const fencing = createFencingAuthority({ nowMs: () => now });
  const first = fencing.grant("google-flow:project-a", "extension-a");
  const second = fencing.grant("google-flow:project-a", "extension-b");
  assert.equal(second.token, first.token + 1);
  assert.equal(fencing.accept("google-flow:project-a", "extension-a", first.token), false);
  assert.equal(fencing.accept("google-flow:project-a", "extension-b", second.token), true);
  now += 121_000;
  assert.equal(fencing.accept("google-flow:project-a", "extension-b", second.token), false);
});

test("pairing challenge and HMAC authenticator are deterministic and reject tampering", () => {
  const challenge = createPairingChallenge({ nowMs: () => 10_000, ttlMs: 5_000, randomBytes: () => Buffer.from("challenge") });
  assert.deepEqual(challenge, { nonce: Buffer.from("challenge").toString("hex"), issuedAt: 10_000, expiresAt: 15_000 });
  const message = envelope({ messageType: "JOB_ACK", source: { extensionInstanceId: "extension-a" }, destination: { desktopInstanceId: "desktop-a" }, route: { sessionId: "session-a", connectionId: "connection-a", leaseId: "lease-a", fencingToken: 1 }, integrity: { algorithm: "hmac-sha256", nonce: challenge.nonce, authenticator: "" } });
  message.integrity.authenticator = deriveAuthenticator("pairing-secret", message);
  assert.equal(verifyAuthenticator("pairing-secret", message), true);
  message.job.jobId = "tampered";
  assert.equal(verifyAuthenticator("pairing-secret", message), false);
});

test("pairing confirmation proof binds the challenge and extension session", () => {
  const fields = { pairingId: "pair-1", nonce: "nonce-1", extensionInstanceId: "installation-a", sessionId: "worker-a" };
  const proof = derivePairingConfirmation("pairing-secret", fields);
  assert.equal(proof.length, 64);
  assert.equal(derivePairingConfirmation("pairing-secret", fields), proof);
  assert.notEqual(derivePairingConfirmation("pairing-secret", { ...fields, sessionId: "worker-b" }), proof);
});
