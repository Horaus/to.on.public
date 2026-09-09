const test = require("node:test");
const assert = require("node:assert/strict");

const { createStore } = require("../main/state/store.cjs");
const { createJobStatusRuntime } = require("../main/jobs/status-runtime.cjs");
const { createFoundationPipeline } = require("../main/story-pipeline/foundation.cjs");
const { createArchitecturePipeline } = require("../main/story-pipeline/architecture.cjs");
const { createScreenplayPipeline } = require("../main/story-pipeline/screenplay.cjs");
const { createShotBreakdownPipeline } = require("../main/story-pipeline/shot-breakdown.cjs");
const { createStoryPolicies } = require("../main/story-pipeline/policies.cjs");

test("story pipeline exposes one factory for every durable stage", () => {
  assert.equal(typeof createFoundationPipeline, "function");
  assert.equal(typeof createArchitecturePipeline, "function");
  assert.equal(typeof createScreenplayPipeline, "function");
  assert.equal(typeof createShotBreakdownPipeline, "function");
  assert.equal(typeof createStoryPolicies, "function");
});

test("state store publishes atomic revisions without exposing a replacement object", () => {
  const initial = { projects: [], jobs: [] };
  const store = createStore(initial);
  const changes = [];
  const unsubscribe = store.onChange((event) => changes.push(event));

  store.mutate((state) => state.jobs.push({ id: "job-1" }), { reason: "contract-test" });

  assert.equal(store.get(), initial);
  assert.equal(store.revision(), 1);
  assert.deepEqual(store.get().jobs, [{ id: "job-1" }]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].reason, "contract-test");
  unsubscribe();
});

test("job status runtime rejects regressions after a terminal result", () => {
  const jobs = [{ id: "job-1", status: "approved", progress: 1, updatedAt: "before" }];
  const runtime = createJobStatusRuntime({
    getState: () => ({ jobs }),
    isSavedConversationUrl: () => false,
    saveState() {},
    sendState() {},
    logEvent() {},
    now: () => "after"
  });

  runtime.update({ jobId: "job-1", status: "generating", progress: 0.5, message: "late" });

  assert.equal(jobs[0].status, "approved");
  assert.equal(jobs[0].progress, 1);
  assert.equal(jobs[0].updatedAt, "before");
});

test("architecture rejects a contract beat assigned to multiple scenes", () => {
  const state = {
    projects: [{ id: "project-1", intake: { targetDurationSec: 30 }, storyDocument: { foundationApprovedAt: "now", narrativeContract: { beats: [{ id: "beat-1" }, { id: "beat-2" }, { id: "beat-3" }] } } }],
    scenes: [], shots: [], characters: []
  };
  const pipeline = createArchitecturePipeline({
    extractJson: JSON.parse, getState: () => state, recommendedProjectShotCount: () => 3,
    formatSceneBreakdown: () => "scenes", id: (prefix) => `${prefix}-id`, now: () => "now",
    upsertProjectCharactersFromStory() {}
  });
  const visualRequirements = [
    { id: "main", name: "Mai", role: "main_character", description: "Mai", continuityRules: "same" },
    { id: "place", name: "Kitchen", role: "location", description: "Kitchen", continuityRules: "same" }
  ];
  const scene = (id, beats, motifFunction) => ({
    id, title: id, summary: id, contractBeatIds: beats, location: "Kitchen", timeOfDay: "day", emotionalTone: "tense",
    objective: "objective", conflict: "conflict", dramaticTurn: "turn", escalationMechanism: "pressure", choicePressure: "now",
    emotionalShift: "shift", motifFunction, entryState: "before", exitState: "after", settingDescription: "Kitchen",
    requiredProps: [], wardrobeState: "same", referenceRequirementIds: ["main", "place"], assetDelta: null
  });
  const output = JSON.stringify({ visualRequirements, scenes: [scene("s1", ["beat-1", "beat-2"], "setup"), scene("s2", ["beat-2"], "turn"), scene("s3", ["beat-3"], "payoff")] });
  assert.throws(() => pipeline.applyStoryArchitectureResult({ projectId: "project-1" }, { output: { text: output } }), /beat beat-2 to more than one scene/);
});
