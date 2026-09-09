export type FlowAppDiagnosticPayload = {
  diagnosticId: string;
  expectedRuntimeUrl: string;
  manifest: Record<string, unknown>;
  mediaId?: string;
  aspectRatio?: "16:9" | "9:16";
  durationSec?: 4 | 6 | 8;
};

export type FlowAppDiagnosticReceipt = {
  ok: boolean;
  diagnosticId: string;
  stage: "extension_received" | "flow_app_missing" | "flow_app_received" | "flow_app_mismatch";
  runtimeUrl: string;
  manifestText: string;
  parsedManifest?: Record<string, unknown>;
  mediaId: string;
  aspectRatio: string;
  durationSec: number;
  checks: { diagnosticId: boolean; manifest: boolean; mediaId: boolean; aspectRatio: boolean; durationSec: boolean };
};

export function normalizeFlowAppDiagnosticPayload(value: unknown): FlowAppDiagnosticPayload {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const diagnosticId = String(payload.diagnosticId || "").trim();
  const expectedRuntimeUrl = String(payload.expectedRuntimeUrl || "").trim();
  const manifest = payload.manifest && typeof payload.manifest === "object" && !Array.isArray(payload.manifest)
    ? payload.manifest as Record<string, unknown> : undefined;
  if (!diagnosticId || !expectedRuntimeUrl || !manifest) throw new Error("Flow diagnostic requires diagnosticId, expectedRuntimeUrl, and manifest.");
  const aspectRatio = payload.aspectRatio === "9:16" ? "9:16" : "16:9";
  const requestedDuration = Number(payload.durationSec || 4);
  const durationSec = ([4, 6, 8].includes(requestedDuration) ? requestedDuration : 4) as 4 | 6 | 8;
  return { diagnosticId, expectedRuntimeUrl, manifest: { ...manifest, diagnosticId }, mediaId: String(payload.mediaId || ""), aspectRatio, durationSec };
}

export function evaluateFlowAppDiagnosticReceipt(payload: FlowAppDiagnosticPayload, observed: Omit<FlowAppDiagnosticReceipt, "ok" | "stage" | "checks">): FlowAppDiagnosticReceipt {
  const checks = {
    diagnosticId: String(observed.parsedManifest?.diagnosticId || "") === payload.diagnosticId,
    manifest: JSON.stringify(observed.parsedManifest || null) === JSON.stringify(payload.manifest),
    mediaId: observed.mediaId === String(payload.mediaId || ""),
    aspectRatio: observed.aspectRatio === payload.aspectRatio,
    durationSec: observed.durationSec === payload.durationSec
  };
  const ok = Object.values(checks).every(Boolean);
  return { ...observed, ok, stage: ok ? "flow_app_received" : "flow_app_mismatch", checks };
}
