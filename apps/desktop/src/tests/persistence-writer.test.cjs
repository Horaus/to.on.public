const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPersistenceWriter } = require("../main/state/persistence-writer.cjs");

test("persistence writer coalesces mutation intent into one complete atomic snapshot", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-state-writer-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "studio-state.json");
  const activeProjectPath = path.join(directory, "active-project.json");
  const state = { activeProjectId: "p1", projects: [{ id: "p1" }], shots: [], jobs: [] };
  let touches = 0;
  let projections = 0;
  const events = [];
  const writer = createPersistenceWriter({
    statePath,
    activeProjectPath,
    schemaVersion: 7,
    getState: () => state,
    touchState: () => { touches += 1; },
    syncProjection: () => { projections += 1; },
    logEvent: (name, payload) => events.push({ name, payload }),
    debounceMs: 5
  });

  writer.request();
  writer.request();
  assert.equal(touches, 2);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(projections, 1);
  assert.equal(events.filter((event) => event.name === "state_saved").length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, "utf8")), { ...state, schemaVersion: 7 });
  writer.saveActiveProject();
  assert.deepEqual(JSON.parse(fs.readFileSync(activeProjectPath, "utf8")), { activeProjectId: "p1" });
});

test("flush is a no-op until persistence is requested", () => {
  const writer = createPersistenceWriter({
    statePath: "/unused/state.json",
    activeProjectPath: "/unused/active.json",
    schemaVersion: 1,
    getState: () => ({ projects: [] }),
    touchState: () => {},
    syncProjection: () => {},
    logEvent: () => {}
  });
  assert.equal(writer.flush(), false);
});
