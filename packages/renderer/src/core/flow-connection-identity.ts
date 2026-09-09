export function canonicalFlowConnection(bridgeStatus: any) {
  const connections = Array.isArray(bridgeStatus?.connections) ? bridgeStatus.connections : [];
  const candidates = connections.filter((connection: any) => {
    const visibility = connection?.providerVisibility || {};
    return Number(visibility.googleFlowProjectTabs || 0) > 0
      && Number(visibility.googleFlowRuntimeToolTabs || 0) === 1
      && Number(visibility.googleFlowEditorToolTabs || 0) === 0;
  });
  // A browser restart can leave two confirmed/canonical sockets for the same
  // extension. Prefer the socket that owns the complete workspace + runtime
  // topology; only leave identity unresolved when the topology is genuinely
  // tied. This keeps the Electron readiness gate aligned with the verifier.
  const score = (connection: any) => {
    const visibility = connection?.providerVisibility || {};
    const urls = Array.isArray(visibility.googleFlowUrls) ? visibility.googleFlowUrls.map((value: unknown) => String(value)) : [];
    const hasRuntimeRoute = urls.some((value: string) => /\/tools\/flow\/project\/[^/]+\/tool(?:-version)?\//i.test(value));
    const hasBaseWorkspace = urls.some((value: string) => /\/tools\/flow\/project\/[^/]+\/tools\/?(?:[?#]|$)/i.test(value)
      || (hasRuntimeRoute && /\/tools\/flow\/project\/[^/]+\/?(?:[?#]|$)/i.test(value)));
    return (hasBaseWorkspace ? 100_000 : 0)
      + Number(visibility.googleFlowTabs || 0) * 1_000
      + Number(visibility.googleFlowProjectTabs || 0) * 100
      + (Number(visibility.googleFlowCustomToolTabs || 0) === 1 ? 20 : 0)
      + (Number(visibility.googleFlowRuntimeToolTabs || 0) === 1 ? 10 : 0);
  };
  const scores = candidates.map(score);
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const winners = candidates.filter((_candidate: any, index: number) => scores[index] === maxScore);
  const selected = winners.length === 1 ? winners[0] : undefined;
  const identity = String(selected?.extensionInstanceId || selected?.pairing?.extensionInstanceId || "");
  return {
    selected,
    candidateCount: candidates.length,
    otherConnectionCount: Math.max(0, connections.length - (selected ? 1 : 0)),
    identitySuffix: identity ? identity.slice(0, 4) : ""
  };
}

/**
 * Return the Flow connections that are allowed to contribute to readiness and
 * tab topology. A restarted extension can leave a second confirmed socket
 * advertising the same browser tab. When the bridge has explicitly elected a
 * canonical connection, stale/non-canonical sockets must not inflate counts or
 * route a job to the wrong session. If no election exists, retain all
 * connections so the caller can fail closed on ambiguity.
 */
export function flowConnectionsForTopology(bridgeStatus: any): any[] {
  const connections = Array.isArray(bridgeStatus?.connections) ? bridgeStatus.connections : [];
  const canonical = connections.filter((connection: any) => connection?.discovery?.canonical === true);
  if (canonical.length === 1) return canonical;
  if (canonical.length < 2) return connections;

  // After a browser restart two confirmed sessions can both self-report
  // `canonical` before the next election heartbeat. If they point at the same
  // Flow project, prefer the session advertising the real `/tools` workspace
  // over a project-shell/root URL. A tie remains ambiguous and is preserved so
  // readiness still fails closed.
  const projectKey = (connection: any) => {
    const raw = (connection?.providerVisibility?.googleFlowUrls || [])
      .map((value: unknown) => String(value))
      .find((value: string) => /\/tools\/flow\/project\/[^/]+/i.test(value));
    if (!raw) return "";
    const match = raw.match(/\/tools\/flow\/project\/([^/]+)/i);
    return match?.[1] || "";
  };
  const keys = new Set(canonical.map(projectKey).filter(Boolean));
  if (keys.size !== 1) return connections;
  const score = (connection: any) => {
    const urls = connection?.providerVisibility?.googleFlowUrls || [];
    const visibility = connection?.providerVisibility || {};
    const hasRuntimeRoute = urls.some((value: unknown) => /\/tools\/flow\/project\/[^/]+\/tool(?:-version)?\//i.test(String(value)));
    const hasBaseWorkspace = urls.some((value: unknown) => /\/tools\/flow\/project\/[^/]+\/tools\/?(?:[?#]|$)/i.test(String(value))
      || (hasRuntimeRoute && /\/tools\/flow\/project\/[^/]+\/?(?:[?#]|$)/i.test(String(value))));
    const routeScore = urls.reduce((best: number, value: unknown) => {
      const path = (() => { try { return new URL(String(value)).pathname; } catch { return ""; } })();
      if (/\/tools\/flow\/project\/[^/]+\/tools\/?$/i.test(path)) return Math.max(best, 3);
      if (/\/tools\/flow\/project\/[^/]+\/tool(?:-version)?\//i.test(path)) return Math.max(best, 2);
      return Math.max(best, 1);
    }, 0);
    return (hasBaseWorkspace ? 100_000 : 0)
      + Number(visibility.googleFlowTabs || 0) * 1_000
      + Number(visibility.googleFlowProjectTabs || 0) * 100
      + routeScore * 1_000;
  };
  const scores = canonical.map(score);
  const max = Math.max(...scores);
  const winners = canonical.filter((_connection: any, index: number) => scores[index] === max);
  return winners.length === 1 ? winners : connections;
}
