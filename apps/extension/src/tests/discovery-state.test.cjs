const test = require("node:test");
const assert = require("node:assert/strict");
const { initialDiscovery, observeDiscovery, reacquireDiscovery, nextSearchDelayMs } = require("../background/discovery-state.cjs");

test("discovery uses a bounded startup search budget and then stops probing", () => {
  let state = initialDiscovery(100);
  assert.equal(state.phase, "searching");
  assert.equal(nextSearchDelayMs(state), 1_000);
  state = observeDiscovery(state, {}, 200);
  assert.equal(nextSearchDelayMs(state), 2_000);
  state = observeDiscovery(state, {}, 300);
  assert.equal(nextSearchDelayMs(state), 4_000);
  state = observeDiscovery(state, {}, 400);
  assert.equal(state.budgetExhausted, true);
  assert.equal(nextSearchDelayMs(state), null);
});

test("a clean single Flow workspace transitions to low energy", () => {
  const state = observeDiscovery(initialDiscovery(100), {
    googleFlowTabs: 3,
    googleFlowProjectTabs: 1,
    googleFlowCustomToolTabs: 1,
    googleFlowRuntimeToolTabs: 1,
    googleFlowEditorToolTabs: 0
  }, 200);
  assert.equal(state.phase, "low_energy");
  assert.equal(state.canonical, true);
  assert.equal(nextSearchDelayMs(state), null);
});

test("duplicate or incomplete Flow tabs remain a visible candidate", () => {
  const duplicate = observeDiscovery(initialDiscovery(100), { googleFlowTabs: 2, googleFlowProjectTabs: 2 }, 200);
  assert.equal(duplicate.phase, "candidate");
  assert.equal(duplicate.canonical, false);
  const reacquiring = reacquireDiscovery(300);
  const empty = observeDiscovery(reacquiring, {}, 400);
  assert.equal(empty.phase, "reacquiring");
});

test("discovery budget also stops polling duplicate tabs instead of waking forever", () => {
  const visibility = { googleFlowTabs: 2, googleFlowProjectTabs: 2, googleFlowCustomToolTabs: 1 };
  let state = initialDiscovery(100);
  const delays = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    state = observeDiscovery(state, visibility, 200 + attempt);
    delays.push(nextSearchDelayMs(state));
  }
  assert.deepEqual(delays, [2_000, 4_000, null]);
  assert.equal(state.phase, "candidate");
  assert.equal(state.budgetExhausted, true);
});
