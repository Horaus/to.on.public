const crypto = require("node:crypto");

const PROTOCOL_VERSION = "2";
const DEFAULT_MAX_ENVELOPE_LIFETIME_MS = 5 * 60_000;

const REQUIRED_FIELDS = Object.freeze({
  RUN_JOB: Object.freeze({
    source: ["desktopInstanceId"],
    destination: ["extensionInstanceId", "connectorInstanceId", "tabId", "frameId"],
    route: ["sessionId", "connectionId", "leaseId", "fencingToken", "provider"],
    job: ["projectId", "jobId", "idempotencyKey"]
  }),
  CANCEL_JOB: Object.freeze({
    source: ["desktopInstanceId"],
    destination: ["extensionInstanceId", "connectorInstanceId", "tabId", "frameId"],
    route: ["sessionId", "connectionId", "leaseId", "fencingToken", "provider"],
    job: ["projectId", "jobId", "idempotencyKey"]
  }),
  JOB_ACK: Object.freeze({
    source: ["extensionInstanceId"],
    destination: ["desktopInstanceId"],
    route: ["sessionId", "connectionId", "leaseId", "fencingToken"],
    job: ["projectId", "jobId", "idempotencyKey"]
  }),
  PROVIDER_ACCEPTED: Object.freeze({
    source: ["connectorInstanceId"],
    destination: ["desktopInstanceId"],
    route: ["sessionId", "connectionId", "leaseId", "fencingToken", "provider", "providerProjectId", "executorId"],
    job: ["projectId", "jobId", "idempotencyKey"]
  }),
  JOB_RESULT: Object.freeze({
    source: ["extensionInstanceId"],
    destination: ["desktopInstanceId"],
    route: ["sessionId", "connectionId", "leaseId", "fencingToken"],
    job: ["projectId", "jobId", "idempotencyKey"]
  })
});

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasValue(object, key) {
  const value = object?.[key];
  return (typeof value === "string" && value.trim().length > 0) || (typeof value === "number" && Number.isFinite(value));
}

function validateEnvelopeHeader(value) {
  if (!isRecord(value)) return { ok: false, code: "invalid_envelope" };
  if (value.protocolVersion !== PROTOCOL_VERSION) return { ok: false, code: "unsupported_protocol" };
  if (typeof value.messageType !== "string" || !value.messageType) return { ok: false, code: "missing_message_type" };
  if (typeof value.messageId !== "string" || !value.messageId) return { ok: false, code: "missing_message_id" };
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) return { ok: false, code: "invalid_sequence" };
  if (!isRecord(value.source) || !isRecord(value.destination) || !isRecord(value.route)) return { ok: false, code: "missing_endpoint_scope" };
  const contract = REQUIRED_FIELDS[value.messageType];
  return contract ? { ok: true, contract } : { ok: false, code: "unknown_message_type" };
}

function validateEnvelopeScopes(value, contract) {
  for (const field of contract.source) if (!hasValue(value.source, field)) return { ok: false, code: `missing_source_${field}` };
  for (const field of contract.destination) if (!hasValue(value.destination, field)) return { ok: false, code: `missing_destination_${field}` };
  if (contract.destination.includes("tabId") && (!Number.isSafeInteger(value.destination.tabId) || value.destination.tabId < 1)) return { ok: false, code: "invalid_destination_tabId" };
  if (contract.destination.includes("frameId") && (!Number.isSafeInteger(value.destination.frameId) || value.destination.frameId < 0)) return { ok: false, code: "invalid_destination_frameId" };
  for (const field of contract.route) if (!hasValue(value.route, field)) return { ok: false, code: `missing_route_${field}` };
  if (!contract.job.length) return { ok: true };
  if (!isRecord(value.job)) return { ok: false, code: "missing_job_scope" };
  for (const field of contract.job) if (!hasValue(value.job, field)) return { ok: false, code: `missing_job_${field}` };
  return { ok: true };
}

function validateEnvelopeTiming(value, options) {
  const nowMs = Number(options.nowMs || Date.now());
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  const clockSkewMs = Number.isFinite(Number(options.clockSkewMs)) ? Number(options.clockSkewMs) : 30_000;
  const maxLifetimeMs = Number.isFinite(Number(options.maxLifetimeMs)) ? Number(options.maxLifetimeMs) : DEFAULT_MAX_ENVELOPE_LIFETIME_MS;
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) return { ok: false, code: "invalid_expiry" };
  if (maxLifetimeMs <= 0 || expiresAt - issuedAt > maxLifetimeMs) return { ok: false, code: "expiry_too_far" };
  if (issuedAt - nowMs > clockSkewMs) return { ok: false, code: "issued_in_future" };
  if (expiresAt + clockSkewMs < nowMs) return { ok: false, code: "expired" };
  return { ok: true };
}

function validateEnvelopeTail(value, options) {
  if (!isRecord(value.integrity) || !hasValue(value.integrity, "algorithm") || !hasValue(value.integrity, "nonce") || !hasValue(value.integrity, "authenticator")) return { ok: false, code: "missing_integrity" };
  if (options.expectedDestination && !destinationMatches(value.destination, options.expectedDestination)) return { ok: false, code: "wrong_destination" };
  if (Number.isSafeInteger(options.lastSequence) && value.sequence <= options.lastSequence) return { ok: false, code: "replayed_sequence" };
  return { ok: true };
}

function validateEnvelope(value, options = {}) {
  const header = validateEnvelopeHeader(value);
  if (!header.ok) return header;
  const scopes = validateEnvelopeScopes(value, header.contract);
  if (!scopes.ok) return scopes;
  const timing = validateEnvelopeTiming(value, options);
  if (!timing.ok) return timing;
  return validateEnvelopeTail(value, options);
}

function destinationMatches(destination, expected) {
  if (!isRecord(destination) || !isRecord(expected)) return false;
  const fields = ["desktopInstanceId", "extensionInstanceId", "browserProfileId", "connectorInstanceId", "tabId", "frameId"];
  return fields.every((field) => expected[field] === undefined || destination[field] === expected[field]);
}

function canonicalize(value) {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\r\n?/g, "\n");
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function idempotencyKey(input) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}

function createPairingChallenge({ nowMs = Date.now, ttlMs = 60_000, randomBytes = crypto.randomBytes } = {}) {
  const issuedAt = Number(nowMs());
  return { nonce: randomBytes(32).toString("hex"), issuedAt, expiresAt: issuedAt + Number(ttlMs) };
}

function envelopeSigningInput(envelope) {
  const copy = { ...envelope };
  delete copy.integrity;
  return JSON.stringify(canonicalize(copy));
}

function deriveAuthenticator(secret, envelope) {
  return crypto.createHmac("sha256", String(secret)).update(envelopeSigningInput(envelope)).digest("hex");
}

function derivePairingConfirmation(secret, fields = {}) {
  const input = [fields.pairingId, fields.nonce, fields.extensionInstanceId, fields.sessionId].map((value) => String(value || "")).join("\u0000");
  return crypto.createHmac("sha256", String(secret)).update(input).digest("hex");
}

function verifyAuthenticator(secret, envelope) {
  const expected = deriveAuthenticator(secret, envelope);
  const actual = String(envelope?.integrity?.authenticator || "");
  if (!/^[a-f0-9]{64}$/i.test(actual) || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function createFencingAuthority({ nowMs = Date.now } = {}) {
  const lanes = new Map();
  return {
    grant(lane, owner, ttlMs = 120_000) {
      const previous = lanes.get(String(lane));
      const token = Number(previous?.token || 0) + 1;
      const lease = { lane: String(lane), owner: String(owner), token, expiresAt: nowMs() + Number(ttlMs) };
      lanes.set(String(lane), lease);
      return { ...lease };
    },
    accept(lane, owner, token) {
      const current = lanes.get(String(lane));
      return Boolean(current && current.owner === String(owner) && current.token === Number(token) && current.expiresAt >= nowMs());
    },
    inspect(lane) {
      const current = lanes.get(String(lane));
      return current ? { ...current } : undefined;
    }
  };
}

module.exports = { PROTOCOL_VERSION, DEFAULT_MAX_ENVELOPE_LIFETIME_MS, REQUIRED_FIELDS, validateEnvelope, destinationMatches, canonicalize, idempotencyKey, createPairingChallenge, deriveAuthenticator, derivePairingConfirmation, verifyAuthenticator, createFencingAuthority };
