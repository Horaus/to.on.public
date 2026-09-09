const test = require("node:test");
const assert = require("node:assert/strict");
const { REQUIRED_FIELDS, validateEnvelope } = require("../connection-v2.cjs");

function validEnvelope(messageType = "RUN_JOB") {
  const contract = REQUIRED_FIELDS[messageType];
  const values = (fields, prefix) => Object.fromEntries(fields.map((field) => [field,
    field === "fencingToken" || field === "tabId" ? 1 : field === "frameId" ? 0 : `${prefix}-${field}`
  ]));
  return {
    protocolVersion: "2",
    messageType,
    messageId: "message-1",
    sequence: 1,
    issuedAt: new Date(100_000).toISOString(),
    expiresAt: new Date(200_000).toISOString(),
    source: values(contract.source, "source"),
    destination: values(contract.destination, "destination"),
    route: values(contract.route, "route"),
    job: values(contract.job, "job"),
    integrity: { algorithm: "hmac-sha256", nonce: "nonce-a", authenticator: "a".repeat(64) }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function removeField(value, scope, field) {
  const copy = clone(value);
  delete copy[scope][field];
  return copy;
}

test("v2 envelope validator is total over deterministic malformed corpus", () => {
  const corpus = [undefined, null, false, 0, "payload", [], {}, { protocolVersion: "2" }];
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let index = 0; index < 512; index += 1) {
    const object = {};
    const count = next() % 8;
    for (let field = 0; field < count; field += 1) object[`field_${next() % 13}`] = next() % 3 === 0 ? { nested: next() } : next() % 2 === 0 ? String(next()) : next();
    if (next() % 4 === 0) object.protocolVersion = "2";
    corpus.push(object);
  }
  for (const candidate of corpus) {
    assert.doesNotThrow(() => {
      const result = validateEnvelope(candidate, { nowMs: 150_000 });
      assert.equal(typeof result?.ok, "boolean");
      if (!result.ok) assert.equal(typeof result.code, "string");
    });
  }
});

test("every declared required field has a stable missing-field rejection", () => {
  for (const [messageType, contract] of Object.entries(REQUIRED_FIELDS)) {
    const valid = validEnvelope(messageType);
    assert.deepEqual(validateEnvelope(valid, { nowMs: 150_000 }), { ok: true }, messageType);
    for (const scope of ["source", "destination", "route", "job"]) {
      for (const field of contract[scope]) {
        assert.deepEqual(
          validateEnvelope(removeField(valid, scope, field), { nowMs: 150_000 }),
          { ok: false, code: `missing_${scope}_${field}` },
          `${messageType}.${scope}.${field}`
        );
      }
    }
  }
});

test("expiry and clock-skew boundaries fail closed without off-by-one ambiguity", () => {
  const valid = validEnvelope();
  assert.deepEqual(validateEnvelope(valid, { nowMs: 200_000 + 30_000 }), { ok: true });
  assert.deepEqual(validateEnvelope(valid, { nowMs: 200_000 + 30_001 }), { ok: false, code: "expired" });
  const future = { ...valid, issuedAt: new Date(150_001).toISOString(), expiresAt: new Date(250_001).toISOString() };
  assert.deepEqual(validateEnvelope(future, { nowMs: 120_001 }), { ok: true });
  assert.deepEqual(validateEnvelope(future, { nowMs: 120_000 }), { ok: false, code: "issued_in_future" });
});

test("expiry lifetime remains bounded even when the envelope is otherwise valid", () => {
  const valid = validEnvelope();
  const tooFar = { ...valid, expiresAt: new Date(100_000 + 5 * 60_000 + 1).toISOString() };
  assert.deepEqual(validateEnvelope(tooFar, { nowMs: 150_000 }), { ok: false, code: "expiry_too_far" });
});
