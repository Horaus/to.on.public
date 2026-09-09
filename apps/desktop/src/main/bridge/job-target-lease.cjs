function createJobTargetLeases({ nowMs = Date.now, ttlMs = 15 * 60_000, randomId = () => `lease-${Date.now()}` } = {}) {
  const leases = new Map();
  const nextTokens = new Map();

  function inspect(jobKey) {
    const lease = leases.get(String(jobKey));
    return lease ? { ...lease } : undefined;
  }

  function active(jobKey) {
    const lease = leases.get(String(jobKey));
    return Boolean(lease && lease.expiresAt > Number(nowMs()));
  }

  function acquire(jobKey, endpoint) {
    const key = String(jobKey || "");
    const owner = String(endpoint || "");
    if (!key || !owner) return { ok: false, code: "missing_lease_scope" };
    const current = leases.get(key);
    const now = Number(nowMs());
    if (current && current.expiresAt <= now) return { ok: false, code: "lease_expired", lease: { ...current } };
    if (current) {
      return current.endpoint === owner
        ? { ok: true, lease: { ...current } }
        : { ok: false, code: "lease_held", lease: { ...current } };
    }
    const fencingToken = Number(nextTokens.get(key) || 0) + 1;
    nextTokens.set(key, fencingToken);
    const lease = { jobKey: key, endpoint: owner, leaseId: String(randomId()), fencingToken, acquiredAt: now, expiresAt: now + Math.max(1, Number(ttlMs)) };
    leases.set(key, lease);
    return { ok: true, lease: { ...lease } };
  }

  function release(jobKey, endpoint) {
    const key = String(jobKey || "");
    const current = leases.get(key);
    if (!current || (endpoint && current.endpoint !== String(endpoint))) return false;
    leases.delete(key);
    return true;
  }

  function releaseByEndpoint(endpoint) {
    const owner = String(endpoint || "");
    let released = 0;
    for (const [key, lease] of leases) {
      if (lease.endpoint !== owner) continue;
      leases.delete(key);
      released += 1;
    }
    return released;
  }

  function matches(jobKey, endpoint, leaseId, fencingToken) {
    const current = leases.get(String(jobKey || ""));
    return Boolean(current
      && current.endpoint === String(endpoint || "")
      && current.leaseId === String(leaseId || "")
      && Number(current.fencingToken) === Number(fencingToken));
  }

  function pruneExpired() {
    const now = Number(nowMs());
    let pruned = 0;
    for (const [key, lease] of leases) {
      if (lease.expiresAt > now) continue;
      leases.delete(key);
      pruned += 1;
    }
    return pruned;
  }

  return { inspect, active, acquire, release, releaseByEndpoint, matches, pruneExpired };
}

module.exports = { createJobTargetLeases };
