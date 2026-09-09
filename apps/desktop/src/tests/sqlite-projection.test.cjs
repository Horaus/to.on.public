const assert = require("node:assert/strict");
const test = require("node:test");
const { replaceProjection } = require("../main/state/sqlite-projection.cjs");

function recordingDb() {
  const executions = [];
  const statements = [];
  return {
    executions,
    statements,
    exec(sql) { executions.push(sql); },
    prepare(sql) {
      const record = { sql, rows: [] };
      statements.push(record);
      return { run(...values) { record.rows.push(values); } };
    }
  };
}

test("SQLite projection replaces every owned table and writes all entity families", () => {
  const db = recordingDb();
  replaceProjection(db, {
    projects: [{ id: "p1", name: "Project", createdAt: "a", updatedAt: "b", intake: { platform: "YouTube" } }],
    characters: [{ id: "c1", projectId: "p1", name: "Mai", role: "lead", visualDescription: "", outfit: "", face: "", referenceAssetIds: [] }],
    styleBibles: [{ id: "s1", projectId: "p1", visualStyle: "film", colorPalette: "", texture: "", lighting: "", motionRules: "", negativeStyle: "" }],
    scenes: [{ id: "sc1", projectId: "p1", title: "Scene", summary: "", location: "", timeOfDay: "day", emotionalTone: "", order: 1 }],
    shots: [{ id: "sh1", sceneId: "sc1", order: 1, description: "Action", camera: "locked", motion: "small", durationSec: 4, prompt: "", status: "draft", assetIds: [] }],
    assets: [{ id: "a1", projectId: "p1", type: "image", filePath: "/tmp/a.png", sourceProvider: "chatgpt", createdAt: "a" }],
    jobs: [{ id: "j1", projectId: "p1", providerId: "chatgpt-web", jobType: "text", input: {}, status: "approved", resultAssetIds: [], createdAt: "a", updatedAt: "b" }],
    visualReferences: [{ id: "r1", projectId: "p1", name: "Mai", role: "main_character", filePath: "/tmp/r.png", sourceDescription: "", transformationRequest: "", createdAt: "a" }]
  });

  assert.equal(db.executions.length, 8);
  assert.ok(db.executions.every((sql) => sql.startsWith("DELETE FROM ")));
  assert.equal(db.statements.length, 8);
  assert.ok(db.statements.every((statement) => statement.rows.length === 1));
  assert.match(db.statements[0].rows[0][7], /YouTube/);
});

test("SQLite projection clears tables even when a collection is absent", () => {
  const db = recordingDb();
  replaceProjection(db, {});
  assert.equal(db.executions.length, 8);
  assert.equal(db.statements.length, 8);
  assert.ok(db.statements.every((statement) => statement.rows.length === 0));
});

test("SQLite projection skips malformed legacy jobs without aborting valid rows", () => {
  const db = recordingDb();
  replaceProjection(db, {
    jobs: [
      { status: "failed_retryable", createdAt: "a", updatedAt: "b" },
      { id: "j1", projectId: "p1", providerId: "google-flow-web", jobType: "video", status: "submitting", createdAt: "a", updatedAt: "b", resultAssetIds: [] }
    ]
  });
  const jobStatement = db.statements.find((statement) => statement.sql.includes("automation_jobs"));
  assert.equal(jobStatement.rows.length, 1);
  assert.equal(jobStatement.rows[0][0], "j1");
});
