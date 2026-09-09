function connectionScore(connection) {
  const visibility = connection?.providerVisibility || {};
  // A restarted extension can leave a stale runtime-only session alive. Both
  // sessions may advertise one project/tool tab, so scoring only the route
  // booleans lets lastSeenAt select the stale session. Prefer the session that
  // owns the complete workspace + published runtime topology.
  const flowTabs = Number(visibility.googleFlowTabs || 0);
  const workspaceTabs = Number(visibility.googleFlowProjectTabs || 0);
  const customTabs = Number(visibility.googleFlowCustomToolTabs || 0);
  const runtimeTabs = Number(visibility.googleFlowRuntimeToolTabs || 0);
  const urls = Array.isArray(visibility.googleFlowUrls) ? visibility.googleFlowUrls.map((value) => String(value)) : [];
  const hasRuntimeRoute = urls.some((value) => /\/tools\/flow\/project\/[^/]+\/tool(?:-version)?\//i.test(value));
  const hasBaseWorkspace = urls.some((value) => /\/tools\/flow\/project\/[^/]+\/tools\/?(?:[?#]|$)/i.test(value)
    || (hasRuntimeRoute && /\/tools\/flow\/project\/[^/]+\/?(?:[?#]|$)/i.test(value)));
  return (hasBaseWorkspace ? 100_000 : 0)
    + flowTabs * 1_000
    + (workspaceTabs > 0 ? 100 : 0)
    + (customTabs > 0 ? 20 : 0)
    // A published runtime is the executable provider surface. Prefer it over
    // an editor/custom-tool session that can remain registered after its tab
    // was closed; retain the workspace bonus when both candidates have one.
    + (runtimeTabs > 0 ? 5_000 : 0)
    + (connection?.pairing?.state === "confirmed" ? 5 : 0)
    + Number(connection?.lastSeenAt || 0) / 1e15;
}

export function selectFlowSession(connections, extensionIdentity = "") {
  const matching = (Array.isArray(connections) ? connections : [])
    .filter((connection) => !extensionIdentity || String(connection?.extensionId || "") === String(extensionIdentity));
  const selected = [...matching].sort((left, right) => connectionScore(right) - connectionScore(left))[0];
  return {
    selected,
    matching,
    ignoredMatchingSessionCount: Math.max(0, matching.length - (selected ? 1 : 0))
  };
}
