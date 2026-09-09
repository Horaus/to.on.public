const test = require("node:test");
const assert = require("node:assert/strict");
const { createBinaryHandle, validateBinaryHandle, createBinaryHandleRegistry } = require("../binary-handle.cjs");

test("binary handle carries bounded ownership, TTL and single-use policy", () => {
  const handle = createBinaryHandle({ issuer: "desktop-a", consumer: "extension-a", resourceId: "asset-1", ackOwner: "desktop-a", maxBytes: 1024, ttlMs: 90_000, nowMs: () => 10_000, randomBytes: () => Buffer.alloc(24, 7) });
  assert.equal(handle.issuer, "desktop-a");
  assert.equal(handle.consumer, "extension-a");
  assert.equal(handle.ackOwner, "desktop-a");
  assert.equal(handle.maxBytes, 1024);
  assert.equal(handle.expiresAt, 100_000);
  assert.equal(handle.singleUse, true);
  assert.deepEqual(validateBinaryHandle(handle, { issuer: "desktop-a", consumer: "extension-a", nowMs: () => 50_000, bytes: 1024 }), { ok: true });
});

test("binary handle rejects wrong owner, expiry and byte overflow", () => {
  const handle = createBinaryHandle({ issuer: "desktop-a", consumer: "extension-a", resourceId: "asset-1", maxBytes: 10, ttlMs: 1000, nowMs: () => 10_000, randomBytes: () => Buffer.alloc(24, 8) });
  assert.deepEqual(validateBinaryHandle(handle, { consumer: "extension-b", nowMs: () => 10_500 }), { ok: false, code: "wrong_consumer" });
  assert.deepEqual(validateBinaryHandle(handle, { consumer: "extension-a", nowMs: () => 11_000 }), { ok: false, code: "expired" });
  assert.deepEqual(validateBinaryHandle(handle, { consumer: "extension-a", nowMs: () => 10_500, bytes: 11 }), { ok: false, code: "bytes_exceeded" });
});

test("binary handle registry consumes once, rejects replay and supports issuer revoke", () => {
  let now = 1_000;
  const registry = createBinaryHandleRegistry({ nowMs: () => now });
  const handle = registry.issue({ issuer: "desktop-a", consumer: "extension-a", resourceId: "asset-1", maxBytes: 20 });
  assert.equal(registry.consume(handle.handleId, { consumer: "extension-a", bytes: 20 }).ok, true);
  assert.deepEqual(registry.consume(handle.handleId, { consumer: "extension-a", bytes: 1 }), { ok: false, code: "handle_consumed" });
  const revoked = registry.issue({ issuer: "desktop-a", consumer: "extension-a", resourceId: "asset-2" });
  assert.equal(registry.revoke(revoked.handleId, { issuer: "desktop-a" }).ok, true);
  assert.deepEqual(registry.consume(revoked.handleId, { consumer: "extension-a", bytes: 0 }), { ok: false, code: "handle_revoked" });
  now += 60_001;
  assert.equal(registry.pruneExpired(), 0);
});
