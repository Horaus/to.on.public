import type { FlowTileBaseline } from "./flow-result-policy";

export type FlowRuntimeHost = Window & {
  __studioFlowJobBaselines?: Record<string, FlowTileBaseline>;
  __studioFlowRunningJobIds?: Set<string>;
  __studioFlowJobRunTokens?: Record<string, number>;
};

export function readFlowJobBaselines(host: FlowRuntimeHost, key: string): Record<string, FlowTileBaseline> {
  if (!host.__studioFlowJobBaselines) {
    try {
      host.__studioFlowJobBaselines = JSON.parse(host.localStorage.getItem(key) || host.sessionStorage.getItem(key) || "{}") as Record<string, FlowTileBaseline>;
    } catch {
      host.__studioFlowJobBaselines = {};
    }
  }
  return host.__studioFlowJobBaselines;
}

export function persistFlowJobBaselines(host: FlowRuntimeHost, key: string): void {
  try {
    const entries = Object.entries(readFlowJobBaselines(host, key))
      .sort(([, left], [, right]) => right.submittedAt - left.submittedAt)
      .slice(0, 30);
    const serialized = JSON.stringify(Object.fromEntries(entries));
    host.localStorage.setItem(key, serialized);
    host.sessionStorage.setItem(key, serialized);
  } catch {}
}

export function runningFlowJobIds(host: FlowRuntimeHost): Set<string> {
  host.__studioFlowRunningJobIds ||= new Set<string>();
  return host.__studioFlowRunningJobIds;
}

export function flowJobRunTokens(host: FlowRuntimeHost): Record<string, number> {
  host.__studioFlowJobRunTokens ||= {};
  return host.__studioFlowJobRunTokens;
}

export function nextFlowJobRunToken(host: FlowRuntimeHost, jobId: string): number {
  const tokens = flowJobRunTokens(host);
  tokens[jobId] = Number(tokens[jobId] || 0) + 1;
  return tokens[jobId];
}

export function throwIfFlowJobRunStale(host: FlowRuntimeHost, jobId: string, runToken: number): void {
  if (flowJobRunTokens(host)[jobId] !== runToken) {
    const error = new Error("Google Flow job was cancelled or superseded by a newer retry.");
    error.name = "FlowJobCancelled";
    throw error;
  }
}
