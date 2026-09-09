const test = require("node:test");
const assert = require("node:assert/strict");
const { STORAGE_KEY, loadOrCreateInstallationId } = require("../background/installation-identity.cjs");

test("installation identity remains stable across service-worker restarts", async () => {
  const values = {};
  const storage = {
    async get(key) { return { [key]: values[key] }; },
    async set(patch) { Object.assign(values, patch); }
  };
  assert.equal(await loadOrCreateInstallationId(storage, () => "install-a"), "install-a");
  assert.equal(await loadOrCreateInstallationId(storage, () => "install-b"), "install-a");
  assert.equal(values[STORAGE_KEY], "install-a");
});

test("installation identity fails closed when the generator is empty", async () => {
  const storage = { async get() { return {}; }, async set() { throw new Error("must not persist empty identity"); } };
  await assert.rejects(() => loadOrCreateInstallationId(storage, () => ""), /empty value/);
});
