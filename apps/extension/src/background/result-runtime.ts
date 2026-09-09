import type { FlowCaptureResponse, ResultAsset, StudioJob } from "./job-types";
import { createResultHandler } from "./result-handler";
import { createAssetDownloader } from "./asset-downloader";
import type { ResultRuntimeDependencies } from "./result-contract";
export type { ResultRuntimeDependencies } from "./result-contract";

function resolvedResultAssetType(asset: ResultAsset, job?: StudioJob): ResultAsset["type"] {
  return asset.type || (asset.mimeType?.startsWith("video/") ? "video" : undefined)
    || (asset.mimeType?.startsWith("image/") ? "image" : undefined)
    || (/\.mp4$|\.webm$|\.mov$/i.test(String(asset.filePath || asset.filename || "")) ? "video" : undefined)
    || (job?.task?.includes("video") ? "video" : "image");
}

function markCompletedResultJob(deps: ResultRuntimeDependencies, jobId: string): void {
  deps.processingResultJobs.delete(jobId);
  deps.completedResultJobs.add(jobId);
  deps.activeJobs.delete(jobId);
  deps.forgetActiveJobSnapshot(jobId);
  if (deps.completedResultJobs.size <= 200) return;
  const oldest = deps.completedResultJobs.values().next().value;
  if (oldest) deps.completedResultJobs.delete(oldest);
}

async function recoverFlowCustomToolAsset(deps: ResultRuntimeDependencies, job: StudioJob): Promise<ResultAsset | undefined> {
  if (job.provider !== "google-flow" || !job.tabId) return undefined;
  const result = await deps.requestDesktopFlowToolEvaluate(`(async () => {
    const expectedJobId = ${JSON.stringify(job.jobId)};
    const body = document.body?.innerText || "";
    const payloadText = [...document.querySelectorAll("pre, code, textarea")].map((item) => item.value || item.innerText || item.textContent || "").join("\\n");
    // Bridge revisions have used both camelCase and snake_case identity keys.
    // Require the exact current job id in a serialized payload before accepting
    // any visible video, so a prior Flow result can never be attached here.
    const identity = (text) => text.includes('"job_id": "' + expectedJobId + '"') || text.includes('"jobId": "' + expectedJobId + '"');
    if ((!identity(payloadText) && !identity(body)) || !/\\bCOMPLETED\\b/.test(body)) return null;
    const video = [...document.querySelectorAll("video")].find((item) => item.currentSrc || item.src);
    let source = video?.currentSrc || video?.src || "";
    // Relay results are commonly exposed as blob:null URLs inside the
    // sandbox. Materialize the bytes while the runtime is still alive so the
    // extension can download/import them after recovery; never pass an
    // unreadable blob URL across the CDP boundary.
    if (/^blob:/i.test(source)) {
      try {
        const response = await fetch(source);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        source = "data:" + (response.headers.get("content-type") || "video/mp4") + ";base64," + btoa(binary);
      } catch { return null; }
    }
    if (!/^data:video\\/[^;]+;base64,|^https?:\\/\\//i.test(source)) return null;
    const resultText = [...document.querySelectorAll("pre, code")]
      .map((item) => String(item.textContent || "").trim())
      .find((text) => text.includes("mediaId") || text.includes("media_id") || text.includes("providerJobId") || text.includes("provider_id")) || "";
    let parsed = null;
    try { parsed = JSON.parse(resultText); } catch {}
    const mediaId = String(parsed?.mediaId || parsed?.media_id || "");
    const providerId = String(parsed?.providerJobId || parsed?.provider_id || parsed?.providerId || (mediaId ? "flow_relay_" + mediaId : ""));
    const reference = ${JSON.stringify(job.references?.find((item) => item.referenceRole === "shot_keyframe") || job.references?.[0] || null)};
    const expected = reference?.base64 ? "data:" + String(reference.mimeType || "image/png") + ";base64," + String(reference.base64).replace(/^data:[^,]+,/, "") : "";
    let startFrameValidation = { passed: false, error: "Recovery reference bytes unavailable." };
    if (expected && video) {
      try {
        const image = await new Promise((resolve, reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = expected; });
        if (video.readyState < 2) await new Promise((resolve, reject) => { video.addEventListener("loadeddata", resolve, { once: true }); video.addEventListener("error", reject, { once: true }); });
        if (video.currentTime !== 0) { video.currentTime = 0; await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true })); }
        const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 18; const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, 32, 18); const expectedPixels = context.getImageData(0, 0, 32, 18).data;
        context.clearRect(0, 0, 32, 18); context.drawImage(video, 0, 0, 32, 18); const actualPixels = context.getImageData(0, 0, 32, 18).data;
        let error = 0; for (let index = 0; index < expectedPixels.length; index += 4) for (let channel = 0; channel < 3; channel++) error += Math.abs(expectedPixels[index + channel] - actualPixels[index + channel]);
        const normalizedMae = error / (32 * 18 * 3 * 255); startFrameValidation = { passed: normalizedMae <= 0.08, normalizedMae, mode: "recovery-runtime" };
      } catch (error) { startFrameValidation = { passed: false, error: String(error) }; }
    }
    return { source, providerId, mediaId, width: Number(video?.videoWidth || 0), height: Number(video?.videoHeight || 0), durationSeconds: Number(video?.duration || 0), startFrameValidation, sourceMode: parsed?.sourceMode, quality: parsed?.quality, audioPolicy: parsed?.audioPolicy, voiceLockVerified: parsed?.voiceLockVerified };
  })()`) as { source?: string; providerId?: string; mediaId?: string; width?: number; height?: number; durationSeconds?: number; startFrameValidation?: Record<string, unknown>; sourceMode?: string; quality?: string; audioPolicy?: string; voiceLockVerified?: boolean } | null;
  if (!result?.source) return undefined;
  return { type: "video", filePath: result.source, downloadPath: result.source,
    filename: `google_flow_${job.jobId}.mp4`, mimeType: "video/mp4",
    metadata: {
      currentJobOnly: true, flowStrictCurrentJobRecovery: true, recoveredFromStudioShotBridge: true,
      providerJobId: result.providerId || undefined, flowMediaId: result.mediaId || undefined,
      flowCustomToolExecutor: "flow-relay-v1", width: result.width || undefined, height: result.height || undefined,
      durationSeconds: result.durationSeconds || undefined, aspectRatio: job.settings?.aspectRatio || undefined,
      startFrameValidation: result.startFrameValidation,
      providerMetadataComplete: Boolean(result.providerId && result.mediaId && result.startFrameValidation?.passed === true),
      ...(result.sourceMode ? { sourceMode: result.sourceMode } : {}),
      ...(result.quality ? { quality: result.quality } : {}),
      ...(result.audioPolicy ? { audioPolicy: result.audioPolicy } : {}),
      ...(typeof result.voiceLockVerified === "boolean" ? { voiceLockVerified: result.voiceLockVerified } : {})
    } };
}

function recoveredAssetPayload(deps: ResultRuntimeDependencies, job: StudioJob, asset: ResultAsset, originalError: string) {
  const type = resolvedResultAssetType(asset, job);
  const recoveredAfterFlowCrash = deps.isFlowPageCrashError(originalError);
  return { type, filePath: asset.filePath || asset.downloadPath || asset.filename || `${job.jobId}.${type === "video" ? "mp4" : "png"}`,
    provider: job.provider, mimeType: asset.mimeType, filename: asset.filename,
    metadata: deps.flowResultMetadata(job, asset, { recoveredFromAdjacentOlderBaseline: recoveredAfterFlowCrash ? undefined : asset.metadata?.recoveredFromAdjacentOlderBaseline,
      recoveredAfterFlowWarning: true, recoveredAfterFlowCrash, originalFlowWarning: originalError }) };
}

async function recoverLatestFlowResult(deps: ResultRuntimeDependencies, downloadAsset: (asset: ResultAsset, job?: StudioJob) => Promise<ResultAsset>, job: StudioJob, originalError: string, allowVisibleFallback = false): Promise<boolean> {
  deps.sendStatus(job.jobId, "downloading", allowVisibleFallback ? "Recovering strict current-job Google Flow video after refresh..." : "Flow reported a warning; checking only current-job Flow result media...", 0.92);
  try {
    const customToolAsset = await recoverFlowCustomToolAsset(deps, job).catch(() => undefined);
    let response: FlowCaptureResponse | undefined = customToolAsset ? { ok: true, adapter: "studio-shot-bridge", assets: [customToolAsset] } : undefined;
    if (!response) {
      await deps.ensureContentScript(job);
      response = await chrome.tabs.sendMessage(job.tabId!, { action: "CAPTURE_LATEST_FLOW_RESULT", allowVisibleFallback,
        job: { jobId: job.jobId, task: job.task, prompt: job.prompt, settings: job.settings || {}, references: job.references || [] } }) as FlowCaptureResponse;
    }
    if (!response?.ok || !response.assets?.length) return false;
    const assets = await Promise.all(response.assets.map((asset) => downloadAsset(asset, job)));
    deps.sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "done", assets: assets.map((asset) => recoveredAssetPayload(deps, job, asset, originalError)) });
    markCompletedResultJob(deps, job.jobId);
    return true;
  } catch (error) { console.warn("[Studio] Flow result recovery failed", error); return false; }
}

export function createResultRuntime(deps: ResultRuntimeDependencies) {
  const { activeFlowCustomToolTab, activeJobs, chatGptRateLimitCooldownMs, completedResultJobs, ensureContentScript, flowJobWasSubmitted, flowRecoveryTimeoutMs, processingResultJobs, findFlowProjectTab, flowResultMetadata, flowStartFrameAssetId, forgetActiveJobSnapshot, inferProviderFromUrl, isFlowAmbiguousCustomToolError, isFlowBridgeUnavailableError, isFlowDefinitiveProviderFailure, isFlowPageCrashError, isFlowPostSubmitInspectionError, isSavedChatGptConversationUrl, persistChatGptRateLimit, reloadAndRecoverFlowResult, reloadAndRedispatchFlowJob, requestDesktopFlowToolEvaluate, retryRecoveredCapture, sendStatus, sendToDesktop, waitForTabComplete, withTimeout } = deps;

  const { downloadAsset } = createAssetDownloader();
  const recoverFlowResult = (job: StudioJob, error: string, allowFallback = false) => recoverLatestFlowResult(deps, downloadAsset, job, error, allowFallback);
  const completeResultJob = (jobId: string) => markCompletedResultJob(deps, jobId);
  const { handleContentResult } = createResultHandler({
    activeJobs, chatGptRateLimitCooldownMs, completedResultJobs, downloadAsset, flowJobWasSubmitted,
    flowRecoveryTimeoutMs, flowResultMetadata, forgetActiveJobSnapshot, isFlowAmbiguousCustomToolError, isFlowBridgeUnavailableError,
    isFlowDefinitiveProviderFailure, isFlowPageCrashError, isFlowPostSubmitInspectionError,
    isSavedChatGptConversationUrl, markCompletedResultJob: completeResultJob, persistChatGptRateLimit, processingResultJobs,
    resolvedResultAssetType,
    recoverLatestFlowResult: recoverFlowResult, reloadAndRecoverFlowResult, reloadAndRedispatchFlowJob, retryRecoveredCapture,
    sendStatus, sendToDesktop, waitForTabComplete, withTimeout
  });
  return { handleContentResult, recoverLatestFlowResult: recoverFlowResult };
}
