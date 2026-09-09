type JobPayload = { jobId: string; [key: string]: unknown };

type FlowJobDispatchDeps = {
  routeHandoffKey: string;
  runningFlowJobIds: () => Set<string>;
  flowJobRunTokens: () => Record<string, number>;
  nextFlowJobRunToken: (jobId: string) => number;
  reportStatus: (jobId: string, status: string, message: string, progress?: number) => void;
  reportResult: (jobId: string, status: string, assets?: Array<Record<string, unknown>>, error?: string) => void;
  executeJob: (payload: JobPayload, runToken: number) => Promise<void>;
};

function relayCustomToolJob(payload: JobPayload, deps: FlowJobDispatchDeps): boolean {
  if (!/\/tools\/flow\/project\/[^/]+\/tool\/[^/]+/i.test(location.pathname)) return false;
  deps.reportStatus(payload.jobId, "opening_provider", "Routing this job to the Studio Shot Bridge iframe executor...", 0.16);
  chrome.runtime.sendMessage({ source: "google-flow-custom-tool-host", type: "RUN_CUSTOM_TOOL_JOB", payload }).catch((error) => deps.reportResult(payload.jobId, "failed_retryable", undefined, `Studio Shot Bridge relay failed: ${error instanceof Error ? error.message : String(error)}`));
  return true;
}

function restoreProjectRoute(payload: JobPayload, deps: FlowJobDispatchDeps): boolean {
  if (!/\/tools\/flow\/project\/[^/]+\/edit\//i.test(location.pathname)) return false;
  const basePath = location.pathname.replace(/\/edit\/.*$/i, "");
  sessionStorage.setItem(deps.routeHandoffKey, JSON.stringify({ payload, savedAt: Date.now() }));
  deps.reportStatus(payload.jobId, "opening_provider", "Google Flow opened a media item; restoring the project workspace and resuming this job automatically...");
  location.assign(`${location.origin}${basePath}`);
  return true;
}

async function dispatchFlowJobOnce(payload: JobPayload, deps: FlowJobDispatchDeps): Promise<void> {
  if (relayCustomToolJob(payload, deps) || restoreProjectRoute(payload, deps)) return;
  const runningJobs = deps.runningFlowJobIds();
  if (runningJobs.has(payload.jobId)) {
    deps.reportStatus(payload.jobId, "submitting", "Duplicate Google Flow dispatch ignored; the current job is already running in this tab.");
    return;
  }
  runningJobs.add(payload.jobId);
  const runToken = deps.nextFlowJobRunToken(payload.jobId);
  try {
    await deps.executeJob(payload, runToken);
  } finally {
    if (deps.flowJobRunTokens()[payload.jobId] === runToken) runningJobs.delete(payload.jobId);
  }
}

export function createFlowJobDispatcher(deps: FlowJobDispatchDeps) {
  return (payload: JobPayload) => dispatchFlowJobOnce(payload, deps);
}
