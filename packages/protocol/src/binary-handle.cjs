const crypto = require("node:crypto");

const BINARY_HANDLE_VERSION = "1";
const MAX_HANDLE_BYTES = 512 * 1024 * 1024;
const MAX_HANDLE_TTL_MS = 15 * 60 * 1000;

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return fallback;
  return Math.min(number, maximum);
}

function createBinaryHandle({ issuer, consumer, resourceId, ackOwner = issuer, maxBytes = 1, ttlMs = 60_000, nowMs = Date.now, randomBytes = crypto.randomBytes } = {}) {
  const normalizedIssuer = String(issuer || "").trim();
  const normalizedConsumer = String(consumer || "").trim();
  const normalizedResource = String(resourceId || "").trim();
  if (!normalizedIssuer || !normalizedConsumer || !normalizedResource) throw new Error("Binary handle requires issuer, consumer and resourceId.");
  const issuedAt = Number(nowMs());
  const boundedTtl = positiveInteger(ttlMs, 60_000, MAX_HANDLE_TTL_MS);
  return {
    version: BINARY_HANDLE_VERSION,
    handleId: randomBytes(24).toString("hex"),
    issuer: normalizedIssuer,
    consumer: normalizedConsumer,
    resourceId: normalizedResource,
    ackOwner: String(ackOwner || normalizedIssuer),
    maxBytes: positiveInteger(maxBytes, 1, MAX_HANDLE_BYTES),
    issuedAt,
    expiresAt: issuedAt + boundedTtl,
    singleUse: true,
    resumePolicy: "none",
    backpressure: "bounded",
    cleanupOwner: normalizedIssuer,
    state: "issued"
  };
}

function validateBinaryHandle(handle, { issuer, consumer, nowMs = Date.now, bytes } = {}) {
  if (!handle || typeof handle !== "object" || Array.isArray(handle)) return { ok: false, code: "invalid_handle" };
  if (handle.version !== BINARY_HANDLE_VERSION) return { ok: false, code: "unsupported_handle_version" };
  for (const field of ["handleId", "issuer", "consumer", "resourceId", "ackOwner"]) if (typeof handle[field] !== "string" || !handle[field].trim()) return { ok: false, code: `missing_${field}` };
  if (!Number.isSafeInteger(handle.maxBytes) || handle.maxBytes < 1 || handle.maxBytes > MAX_HANDLE_BYTES) return { ok: false, code: "invalid_max_bytes" };
  if (!Number.isSafeInteger(handle.issuedAt) || !Number.isSafeInteger(handle.expiresAt) || handle.expiresAt <= handle.issuedAt) return { ok: false, code: "invalid_expiry" };
  if (handle.singleUse !== true) return { ok: false, code: "not_single_use" };
  const now = Number(nowMs());
  if (now >= handle.expiresAt) return { ok: false, code: "expired" };
  if (issuer !== undefined && String(issuer) !== handle.issuer) return { ok: false, code: "wrong_issuer" };
  if (consumer !== undefined && String(consumer) !== handle.consumer) return { ok: false, code: "wrong_consumer" };
  if (bytes !== undefined && (!Number.isSafeInteger(Number(bytes)) || Number(bytes) < 0 || Number(bytes) > handle.maxBytes)) return { ok: false, code: "bytes_exceeded" };
  if (!["issued", "consumed", "revoked"].includes(handle.state)) return { ok: false, code: "invalid_state" };
  if (handle.state !== "issued") return { ok: false, code: `handle_${handle.state}` };
  return { ok: true };
}

function createBinaryHandleRegistry({ nowMs = Date.now } = {}) {
  const handles = new Map();
  return {
    issue(options) {
      const handle = createBinaryHandle({ ...options, nowMs });
      handles.set(handle.handleId, handle);
      return { ...handle };
    },
    inspect(handleId) {
      const handle = handles.get(String(handleId || ""));
      return handle ? { ...handle } : undefined;
    },
    consume(handleId, { consumer, bytes } = {}) {
      const handle = handles.get(String(handleId || ""));
      const validation = validateBinaryHandle(handle, { consumer, bytes, nowMs });
      if (!validation.ok) return validation;
      handle.state = "consumed";
      handle.consumedAt = Number(nowMs());
      handle.bytesConsumed = Number(bytes || 0);
      return { ok: true, handle: { ...handle } };
    },
    revoke(handleId, { issuer } = {}) {
      const handle = handles.get(String(handleId || ""));
      if (!handle) return { ok: false, code: "handle_not_found" };
      if (issuer !== undefined && String(issuer) !== handle.issuer) return { ok: false, code: "wrong_issuer" };
      if (handle.state !== "issued") return { ok: false, code: `handle_${handle.state}` };
      handle.state = "revoked";
      handle.revokedAt = Number(nowMs());
      return { ok: true, handle: { ...handle } };
    },
    pruneExpired() {
      let removed = 0;
      const now = Number(nowMs());
      for (const [key, handle] of handles) {
        if (handle.expiresAt > now || handle.state !== "issued") continue;
        handles.delete(key);
        removed += 1;
      }
      return removed;
    }
  };
}

module.exports = { BINARY_HANDLE_VERSION, MAX_HANDLE_BYTES, MAX_HANDLE_TTL_MS, createBinaryHandle, validateBinaryHandle, createBinaryHandleRegistry };
