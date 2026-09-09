const SEARCH_DELAYS_MS = Object.freeze([1_000, 2_000, 4_000]);

function initialDiscovery(nowMs = Date.now()) {
  return {
    phase: "searching",
    scanAttempt: 0,
    candidateCount: 0,
    canonical: false,
    budgetExhausted: false,
    lastObservedAt: Number(nowMs)
  };
}

function countVisibility(visibility) {
  const keys = ["googleFlowTabs", "elevenLabsFlowsTabs"];
  return keys.reduce((total, key) => total + Math.max(0, Number(visibility?.[key] || 0)), 0);
}

function isCanonicalFlow(visibility) {
  const project = Number(visibility?.googleFlowProjectTabs || 0);
  const workspaceTools = Number(visibility?.googleFlowCustomToolTabs || 0);
  const runtimeTools = Number(visibility?.googleFlowRuntimeToolTabs || 0);
  const editorTools = Number(visibility?.googleFlowEditorToolTabs || 0);
  return project === 1 && workspaceTools <= 1 && runtimeTools <= 1 && editorTools === 0;
}

function observeDiscovery(previous, visibility, nowMs = Date.now()) {
  const prior = previous || initialDiscovery(nowMs);
  const candidateCount = countVisibility(visibility);
  const canonical = isCanonicalFlow(visibility);
  const scanAttempt = Math.min(Number(prior.scanAttempt || 0) + 1, SEARCH_DELAYS_MS.length);
  const phase = canonical ? "low_energy" : candidateCount > 0 ? "candidate" : prior.phase === "reacquiring" ? "reacquiring" : "searching";
  return {
    phase,
    scanAttempt,
    candidateCount,
    canonical,
    // Discovery is a bounded startup probe even when incomplete/duplicate
    // tabs are visible. Keep the candidate in diagnostics, but do not wake
    // the service worker forever while the user decides which tab to keep.
    budgetExhausted: !canonical && scanAttempt >= SEARCH_DELAYS_MS.length,
    lastObservedAt: Number(nowMs)
  };
}

function reacquireDiscovery(nowMs = Date.now()) {
  return { ...initialDiscovery(nowMs), phase: "reacquiring" };
}

function nextSearchDelayMs(state) {
  if (!state || state.phase === "low_energy" || state.budgetExhausted) return null;
  const index = Math.max(0, Math.min(Number(state.scanAttempt || 0), SEARCH_DELAYS_MS.length - 1));
  return SEARCH_DELAYS_MS[index];
}

module.exports = { SEARCH_DELAYS_MS, initialDiscovery, observeDiscovery, reacquireDiscovery, nextSearchDelayMs };
