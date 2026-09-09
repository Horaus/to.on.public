const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore } = require("../main/state/store.cjs");

test("state store owns one replaceable state object", () => {
  const store = createStore({ jobs: [] });
  const next = { jobs: [{ id: "job-1" }] };
  assert.equal(store.replace(next), next);
  assert.equal(store.get(), next);
});

test("state mutations retain object identity and emit an auditable revision", () => {
  const state = { jobs: [] };
  const store = createStore(state);
  const changes = [];
  const unsubscribe = store.onChange((event) => changes.push(event));
  store.mutate((draft) => draft.jobs.push({ id: "job-1" }), { reason: "queue-job" });
  unsubscribe();
  assert.equal(store.get(), state);
  assert.equal(store.revision(), 1);
  assert.deepEqual(changes.map(({ kind, reason, revision }) => ({ kind, reason, revision })), [
    { kind: "mutate", reason: "queue-job", revision: 1 }
  ]);
});

test("touch records legacy direct mutations without replacing state", () => {
  const state = { jobs: [] };
  const store = createStore(state);
  state.jobs.push({ id: "legacy" });
  store.touch({ reason: "persist-request" });
  assert.equal(store.get().jobs.length, 1);
  assert.equal(store.revision(), 1);
});

test("state store rejects invalid replacement and mutation contracts", () => {
  const store = createStore({});
  assert.throws(() => store.replace(null), /object state/);
  assert.throws(() => store.mutate(null), /requires a function/);
});
