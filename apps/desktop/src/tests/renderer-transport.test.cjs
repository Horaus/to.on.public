const assert = require("node:assert/strict");
const test = require("node:test");
const { createRendererTransport } = require("../main/renderer-transport.cjs");

test("renderer transport coalesces state and exposes only active-project production data", async () => {
  const sent = [];
  const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: (channel, payload) => sent.push({ channel, payload }) } };
  const transport = createRendererTransport({ getWindow: () => window, logEvent() {}, debounceMs: 5 });
  const base = {
    activeProjectId: "p1",
    projects: [{ id: "p1", name: "One", sourceDraft: "one" }, { id: "p2", name: "Two", sourceDraft: "private", intake: { platform: "YouTube" } }],
    scenes: [{ id: "sc1", projectId: "p1" }, { id: "sc2", projectId: "p2" }],
    shots: [{ id: "sh1", sceneId: "sc1" }, { id: "sh2", sceneId: "sc2" }],
    jobs: [{ id: "j1", projectId: "p1" }, { id: "j2", projectId: "p2" }],
    characters: [], styleBibles: [], assets: [], visualReferences: []
  };
  transport.send("studio:state", base);
  transport.send("studio:state", { ...base, revision: 2 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.revision, 2);
  assert.deepEqual(sent[0].payload.shots.map((shot) => shot.id), ["sh1"]);
  assert.deepEqual(sent[0].payload.jobs.map((job) => job.id), ["j1"]);
  assert.equal(sent[0].payload.projects[1].sourceDraft, "");
  assert.deepEqual(sent[0].payload.projectSummaries.find((item) => item.projectId === "p2"), { projectId: "p2", sceneCount: 1, shotCount: 1, assetCount: 0, sourceCount: 0, jobCount: 1, approvedShots: 0, actionNeededJobs: 0, activeJobs: 0 });
});

test("renderer transport fails closed when the BrowserWindow is unavailable", () => {
  const transport = createRendererTransport({ getWindow: () => undefined, logEvent() {} });
  assert.equal(transport.send("studio:bridge", {}), false);
  assert.equal(transport.flush(), false);
});
