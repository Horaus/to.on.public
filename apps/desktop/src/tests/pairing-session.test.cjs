const test = require("node:test");
const assert = require("node:assert/strict");
const { PAIRING_STATES, createPairingSessions } = require("../main/bridge/pairing-session.cjs");

function socket() { return {}; }

test("pairing session requires explicit code approval before delivering the secret", () => {
  let now = 10_000;
  const client = socket();
  const pairing = createPairingSessions({ secret: "a-secret", nowMs: () => now, randomId: () => "pair-1", randomBytes: () => Buffer.alloc(32, 7) });
  const session = pairing.begin(client, { extensionId: "runtime-id", extensionInstanceId: "installation-a", sessionId: "worker-a" });
  assert.equal(session.state, PAIRING_STATES.PENDING);
  assert.equal(pairing.deliverSecret(client).ok, false);
  assert.deepEqual(pairing.approve(client, "wrong"), { ok: false, code: "pairing_code_mismatch" });
  const approved = pairing.approve(client, session.code);
  assert.equal(approved.ok, true);
  assert.deepEqual(pairing.deliverSecret(client), { ok: true, pairingId: "pair-1", secret: "a-secret" });
});

test("pairing confirmation is one-time, identity-bound and fails closed", () => {
  let now = 10_000;
  const client = socket();
  const pairing = createPairingSessions({ secret: "a-secret", nowMs: () => now, randomId: () => "pair-1", randomBytes: () => Buffer.alloc(32, 8) });
  const session = pairing.begin(client, { extensionInstanceId: "installation-a", sessionId: "worker-a" });
  pairing.approve(client, session.code);
  pairing.deliverSecret(client);
  assert.deepEqual(pairing.confirm(client, "bad"), { ok: false, code: "pairing_confirmation_invalid" });
  const proof = pairing.confirmationProof("a-secret", pairing.inspect(client));
  assert.equal(pairing.confirm(client, proof).ok, true);
  assert.equal(pairing.inspect(client).state, PAIRING_STATES.CONFIRMED);
  assert.deepEqual(pairing.confirm(client, proof), { ok: false, code: "pairing_secret_not_sent" });
});

test("pairing expires at the bounded challenge deadline", () => {
  let now = 100;
  const client = socket();
  const pairing = createPairingSessions({ secret: "a-secret", nowMs: () => now, ttlMs: 50, randomBytes: () => Buffer.alloc(32, 9) });
  const session = pairing.begin(client);
  now = session.expiresAt + 1;
  assert.equal(pairing.inspect(client).state, PAIRING_STATES.EXPIRED);
  assert.deepEqual(pairing.approve(client, session.code), { ok: false, code: "pairing_not_pending" });
});

test("pairing rejects brute-force approval after the bounded attempt budget", () => {
  const client = socket();
  const pairing = createPairingSessions({ secret: "a-secret", randomBytes: () => Buffer.alloc(32, 1) });
  pairing.begin(client);
  assert.deepEqual(pairing.approve(client, "wrong"), { ok: false, code: "pairing_code_mismatch" });
  assert.deepEqual(pairing.approve(client, "wrong"), { ok: false, code: "pairing_code_mismatch" });
  assert.deepEqual(pairing.approve(client, "wrong"), { ok: false, code: "pairing_attempts_exhausted" });
  assert.equal(pairing.inspect(client).state, PAIRING_STATES.REJECTED);
});

test("pairing resumes a previously provisioned extension without re-delivering the secret", () => {
  let now = 20_000;
  const client = socket();
  const pairing = createPairingSessions({ secret: "a-secret", nowMs: () => now, randomId: () => "pair-resume", randomBytes: () => Buffer.alloc(32, 2) });
  const challenge = pairing.begin(client);
  const proof = pairing.confirmationProof("a-secret", { ...challenge, extensionInstanceId: "installation-a", sessionId: "worker-b" });
  const resumed = pairing.resume(client, { extensionInstanceId: "installation-a", sessionId: "worker-b" }, proof);
  assert.equal(resumed.ok, true);
  assert.equal(pairing.inspect(client).state, PAIRING_STATES.CONFIRMED);
  assert.equal(pairing.inspect(client).resumedAt, now);
  assert.equal(pairing.deliverSecret(client).ok, false);
});
