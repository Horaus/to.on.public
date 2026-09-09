export function flowProjectBaseUrl(urlValue = ""): string {
  try { const url = new URL(urlValue); return `${url.origin}${url.pathname.replace(/\/(?:tool|tool-version)\/[^/]+$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "")}`; } catch { return urlValue; }
}

export function canonicalFlowRoute(value: string | undefined): string {
  try {
    const url = new URL(String(value || ""));
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

export function flowWorkspaceMatches(expectedUrl: string, activeUrl: string): boolean {
  return !expectedUrl || flowProjectBaseUrl(expectedUrl) === flowProjectBaseUrl(activeUrl);
}

export type FlowSubmitContext = {
  expectedRuntimeUrl?: string;
  currentUrl?: string;
  expectedWorkspaceUrl?: string;
  expectedFrameId?: string;
  currentFrameId?: string;
  expectedDocumentEpoch?: string;
  currentDocumentEpoch?: string;
  expectedAccountHint?: string;
  currentAccountHint?: string;
};

/**
 * Revalidate the exact published runtime and project immediately before an
 * authorization click. Flow may navigate a hydrated tool back to a workspace
 * or draft route without destroying the iframe that the extension is using.
 */
export function validateFlowSubmitContext(context: FlowSubmitContext): { ok: true } | { ok: false; code: string } {
  const expected = canonicalFlowRoute(context.expectedRuntimeUrl);
  const current = canonicalFlowRoute(context.currentUrl);
  if (!expected || !current) return { ok: false, code: "route_missing" };
  if (!isPublishedFlowRuntimeRoute(current)) return { ok: false, code: "runtime_route_not_published" };
  if (expected !== current) return { ok: false, code: "runtime_route_changed" };
  const expectedProject = flowProjectId(context.expectedWorkspaceUrl || expected);
  const currentProject = flowProjectId(current);
  if (!expectedProject || !currentProject || expectedProject !== currentProject) return { ok: false, code: "provider_project_changed" };
  if (context.expectedFrameId && !context.currentFrameId) return { ok: false, code: "frame_missing" };
  if (context.expectedFrameId && context.expectedFrameId !== context.currentFrameId) return { ok: false, code: "frame_changed" };
  if (context.expectedDocumentEpoch && !context.currentDocumentEpoch) return { ok: false, code: "document_epoch_missing" };
  if (context.expectedDocumentEpoch && context.expectedDocumentEpoch !== context.currentDocumentEpoch) return { ok: false, code: "document_epoch_changed" };
  if (context.expectedAccountHint && !context.currentAccountHint) return { ok: false, code: "account_hint_missing" };
  if (context.expectedAccountHint && context.expectedAccountHint !== context.currentAccountHint) return { ok: false, code: "account_changed" };
  return { ok: true };
}

function isPublishedFlowRuntimeRoute(value: string): boolean {
  return /^https:\/\/labs\.google(?:\.com)?\/fx\/[^/]*\/tools\/flow\/project\/[^/]+\/tool-version\/[^/]+$/i.test(value)
    || /^https:\/\/labs\.google(?:\.com)?\/fx\/tools\/flow\/project\/[^/]+\/tool-version\/[^/]+$/i.test(value);
}

function flowProjectId(value: string | undefined): string {
  return String(value || "").match(/\/tools\/flow\/project\/([^/]+)/i)?.[1] || "";
}
