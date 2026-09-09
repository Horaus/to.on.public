const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../../");
const map = JSON.parse(fs.readFileSync(path.join(root, "docs/architecture-system-map.json"), "utf8"));

test("architecture mapping names every runtime boundary and entrypoint", () => {
  assert.equal(map.version, 2);
  assert.ok(map.boundaries.length >= 7);
  for (const boundary of map.boundaries) {
    assert.ok(boundary.id && boundary.path && boundary.owner);
    assert.ok(Array.isArray(boundary.contracts), `${boundary.id}: contracts must be listed`);
    assert.ok(Array.isArray(boundary.tests), `${boundary.id}: tests must be listed`);
    for (const entrypoint of boundary.entrypoints) {
      if (entrypoint.startsWith("@")) continue;
      assert.equal(fs.existsSync(path.join(root, entrypoint)), true, `${boundary.id}: missing ${entrypoint}`);
    }
  }
});

test("mapping declares its maintenance contract", () => {
  assert.equal(map.sourceOfTruth, "docs/architecture-system-map.json");
  assert.equal(map.maintenance.validateWith, "pnpm architecture:map");
  assert.ok(map.maintenance.requiredFields.includes("contracts"));
  assert.ok(map.changeLog.length > 0);
});

test("mapping preserves provider-neutral and persistence ownership", () => {
  const provider = map.boundaries.find((item) => item.id === "provider-adapters");
  const background = map.boundaries.find((item) => item.id === "extension-background");
  const main = map.boundaries.find((item) => item.id === "desktop-main");
  assert.ok(provider.contracts.includes("BrowserProviderAdapter"));
  assert.ok(background.contracts.includes("RunJobRequest"));
  assert.ok(main.contracts.includes("SQLite projection"));
  assert.equal(map.rules.providerDomMayNotOwn.includes("projectPersistence"), true);
  const persistence = map.boundaries.find((item) => item.id === "desktop-state-persistence");
  assert.ok(persistence);
  assert.ok(persistence.contracts.includes("schema_migrations ledger"));
  assert.ok(persistence.invariants.some((item) => item.includes("atomic")));
});

test("plan entity ids are scoped to their owning project", () => {
  const source = fs.readFileSync(path.join(root, "packages/workflow/src/plan-derivation-builders.ts"), "utf8");
  assert.match(source, /scene_plan_\$\{context\.projectId\}_/);
  assert.match(source, /shot_plan_\$\{context\.projectId\}_/);
});
