const test = require("node:test");
const assert = require("node:assert/strict");
const { CURRENT_SCHEMA_VERSION, applySqliteMigrations, migrateState, sqliteMigrations } = require("../main/state/migrations.cjs");

test("JSON migrations are ordered, idempotent and preserve user entities", () => {
  const raw = { projects: [{ id: "p1" }], scenes: [{ id: "s1" }], shots: [{ id: "sh1" }] };
  const migrated = migrateState(raw);
  assert.equal(migrated, raw);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.projects[0].id, "p1");
  assert.deepEqual(migrated.shots[0].referenceRequirementIds, []);
  assert.deepEqual(migrateState(migrated), migrated);
});

test("legacy duplicate plan scenes are scoped by project when unreferenced", () => {
  const raw = {
    projects: [{ id: "p1" }, { id: "p2" }],
    scenes: [
      { id: "scene_plan_1", projectId: "p1", order: 1 },
      { id: "scene_plan_1", projectId: "p2", order: 1 },
      { id: "scene_plan_1", projectId: "p1", order: 1 }
    ],
    shots: []
  };
  migrateState(raw);
  assert.deepEqual(raw.scenes.map((scene) => scene.id).sort(), ["scene_plan_p1_1", "scene_plan_p1_1_3", "scene_plan_p2_1"]);
});

test("SQLite migrations have stable unique versions and names", () => {
  assert.equal(new Set(sqliteMigrations.map(([version]) => version)).size, sqliteMigrations.length);
  assert.equal(new Set(sqliteMigrations.map(([, name]) => name)).size, sqliteMigrations.length);
  assert.deepEqual(sqliteMigrations.map(([version]) => version), sqliteMigrations.map(([version]) => version).sort((a, b) => a - b));
});

test("SQLite migration ledger commits atomically with each schema change", () => {
  const calls = [];
  const applied = [];
  const db = {
    exec(sql) { calls.push(sql); if (sql.includes("ALTER TABLE") && sql.includes("source_draft")) throw new Error("migration failed"); },
    prepare(sql) {
      if (sql.startsWith("SELECT")) return { all: () => [] };
      return { run: (...args) => applied.push(args) };
    }
  };
  assert.throws(() => applySqliteMigrations(db, "now"), /migration failed/);
  assert.ok(calls.includes("BEGIN IMMEDIATE"));
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(applied.length, 0);
});
