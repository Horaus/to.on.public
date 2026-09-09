const test = require("node:test");
const assert = require("node:assert/strict");
const { createJobTargetLeases } = require("../main/bridge/job-target-lease.cjs");

test("job target lease keeps one endpoint and rejects cross-delivery", () => {
  const leases = createJobTargetLeases({ nowMs: () => 100, randomId: () => "lease-a" });
  const first = leases.acquire("google-flow:job-1", "extension-a/session-a");
  assert.equal(first.ok, true);
  assert.equal(leases.acquire("google-flow:job-1", "extension-b/session-b").code, "lease_held");
  assert.equal(leases.acquire("google-flow:job-1", "extension-a/session-a").ok, true);
  assert.equal(leases.active("google-flow:job-1"), true);
});

test("expired lease fails closed and endpoint release allows a deliberate new attempt", () => {
  let now = 100;
  const leases = createJobTargetLeases({ nowMs: () => now, ttlMs: 10, randomId: () => "lease-a" });
  assert.equal(leases.acquire("job-1", "endpoint-a").ok, true);
  now = 111;
  assert.equal(leases.active("job-1"), false);
  assert.equal(leases.acquire("job-1", "endpoint-b").code, "lease_expired");
  assert.equal(leases.releaseByEndpoint("endpoint-a"), 1);
  assert.equal(leases.acquire("job-1", "endpoint-b").ok, true);
});

test("lease identity matching rejects a stale endpoint or fencing token", () => {
  const leases = createJobTargetLeases({ nowMs: () => 100, randomId: () => "lease-a" });
  const acquired = leases.acquire("job-1", "endpoint-a");
  assert.equal(leases.matches("job-1", "endpoint-a", acquired.lease.leaseId, acquired.lease.fencingToken), true);
  assert.equal(leases.matches("job-1", "endpoint-b", acquired.lease.leaseId, acquired.lease.fencingToken), false);
  assert.equal(leases.matches("job-1", "endpoint-a", acquired.lease.leaseId, acquired.lease.fencingToken + 1), false);
  assert.equal(leases.release("job-1", "endpoint-a"), true);
  const reassigned = leases.acquire("job-1", "endpoint-b");
  assert.equal(reassigned.lease.fencingToken, acquired.lease.fencingToken + 1);
  assert.equal(leases.matches("job-1", "endpoint-a", acquired.lease.leaseId, acquired.lease.fencingToken), false);
  assert.equal(leases.matches("job-1", "endpoint-b", reassigned.lease.leaseId, reassigned.lease.fencingToken), true);
});
