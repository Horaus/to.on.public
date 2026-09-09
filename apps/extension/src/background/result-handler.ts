import type { ResultAsset, StudioJob } from "./job-types";
import type { ResultRuntimeDependencies } from "./result-contract";

type ResultHandlerDependencies = Pick<ResultRuntimeDependencies,
  "activeJobs" | "chatGptRateLimitCooldownMs" | "completedResultJobs" | "flowJobWasSubmitted" |
  "flowRecoveryTimeoutMs" | "flowResultMetadata" | "forgetActiveJobSnapshot" |
  "isFlowAmbiguousCustomToolError" | "isFlowBridgeUnavailableError" | "isFlowDefinitiveProviderFailure" | "isFlowPageCrashError" |
  "isFlowPostSubmitInspectionError" | "isSavedChatGptConversationUrl" | "persistChatGptRateLimit" |
  "processingResultJobs" | "reloadAndRecoverFlowResult" | "reloadAndRedispatchFlowJob" |
  "retryRecoveredCapture" | "sendStatus" | "sendToDesktop" | "waitForTabComplete" | "withTimeout"
> & {
  downloadAsset: (asset: ResultAsset, job?: StudioJob) => Promise<ResultAsset>;
  markCompletedResultJob: (jobId: string) => void;
  resolvedResultAssetType: (asset: ResultAsset, job?: StudioJob) => ResultAsset["type"];
  recoverLatestFlowResult: (job: StudioJob, originalError: string, allowVisibleFallback?: boolean) => Promise<boolean>;
};

const RESULT_ASSET_PROCESSING_TIMEOUT_MS = 20_000;


async function recoverChatGptFailure(deps: ResultHandlerDependencies, job: StudioJob, data: Record<string, unknown>): Promise<boolean> {
  await recordChatGptRateLimit(deps, data);
  const savedConversation = job.tabId && deps.isSavedChatGptConversationUrl(job.conversationUrl);
  if (await recoverSavedChatGptImage(deps, job, data, savedConversation)) return true;
  return recoverSavedChatGptText(deps, job, data, savedConversation);
}

async function recordChatGptRateLimit(deps: ResultHandlerDependencies, data: Record<string, unknown>) {
  const error = String(data.error || "");
  if (!/RATE_LIMIT|sending requests too quickly|bạn đang gửi yêu cầu quá nhanh|tạm thời hạn chế quyền truy cập/i.test(error)) return;
  await deps.persistChatGptRateLimit(Date.now() + deps.chatGptRateLimitCooldownMs);
  data.error = `CHATGPT_RATE_LIMIT_COOLDOWN: ChatGPT temporarily limited this account. The extension stopped without resubmitting and will reject new ChatGPT jobs for 15 minutes. Provider detail: ${error}`;
}

async function recoverSavedChatGptImage(deps: ResultHandlerDependencies, job: StudioJob, data: Record<string, unknown>, savedConversation: boolean | 0 | undefined) {
  if (!(job.task === "image" || job.task === "text_to_image") || data.status === "failed_manual" || !savedConversation || job.chatGptImageRecoveryActive) return false;
  job.chatGptImageRecoveryActive = true;
  deps.sendStatus(job.jobId, "opening_provider", "ChatGPT image request ended ambiguously. Reloading its exact conversation and checking for a completed image before failing...", 0.2);
  void deps.retryRecoveredCapture(job, job.tabId!);
  return true;
}

async function recoverSavedChatGptText(deps: ResultHandlerDependencies, job: StudioJob, data: Record<string, unknown>, savedConversation: boolean | 0 | undefined) {
  // A text response can arrive after the active-job watchdog has fired. If the
  // provider conversation was persisted, inspect that conversation before
  // submitting another prompt; otherwise a late valid response is stranded and
  // the retry path needlessly creates another generation.
  const hydrationFailure = /timeout waiting|became inactive|complete structured json|provider job timed out|did not return a result in time|active[- ]timeout/i.test(String(data.error || ""));
  if (job.task === "image" || job.task === "text_to_image" || data.status !== "failed_retryable" || !hydrationFailure || !savedConversation || job.chatGptTextRecoveryActive) return false;
  job.chatGptTextRecoveryActive = true;
  deps.sendStatus(job.jobId, "opening_provider", "ChatGPT text ended ambiguously. Reloading the exact saved conversation once and capturing its server-stored response without resubmitting...", 0.2);
  void retrySavedChatGptText(deps, job);
  return true;
}

async function retrySavedChatGptText(deps: ResultHandlerDependencies, job: StudioJob) {
  try {
    await chrome.tabs.update(job.tabId!, { url: job.conversationUrl });
    await deps.waitForTabComplete(job.tabId!, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await deps.retryRecoveredCapture(job, job.tabId!);
  } catch (error) {
    deps.sendToDesktop({ type: "JOB_RESULT", jobId: job.jobId, status: "failed_retryable", assets: [], error: `Automatic saved-conversation text recovery failed without resubmitting: ${error instanceof Error ? error.message : String(error)}` });
    deps.activeJobs.delete(job.jobId);
  }
}

async function recoverFlowFailure(deps: ResultHandlerDependencies, job: StudioJob, error: unknown): Promise<boolean> {
  if (deps.isFlowDefinitiveProviderFailure(error)) return false;
  if (deps.isFlowBridgeUnavailableError(error)) return false;
  const submitted = deps.isFlowPostSubmitInspectionError(error) || deps.isFlowAmbiguousCustomToolError(error) || deps.flowJobWasSubmitted(job);
  if (submitted) {
        return deps.withTimeout(
          deps.reloadAndRecoverFlowResult(job, error), deps.flowRecoveryTimeoutMs,
          "Google Flow refresh recovery"
        ).catch((error) => {
          console.warn("[Studio] Flow refresh recovery timed out", error);
          return false;
        });
  }
  if (deps.isFlowPageCrashError(error)) {
          const recovered = await deps.withTimeout(
            deps.reloadAndRecoverFlowResult(job, error), deps.flowRecoveryTimeoutMs,
            "Google Flow crash refresh recovery"
          ).catch((reason) => {
            console.warn("[Studio] Flow crash refresh recovery timed out", reason);
            return false;
          });
          if (recovered) return true;
  }
  if (await deps.reloadAndRedispatchFlowJob(job, error)) return true;
  return deps.withTimeout(
          deps.recoverLatestFlowResult(job, String(error || ""), deps.isFlowPostSubmitInspectionError(error)), deps.flowRecoveryTimeoutMs,
          "Google Flow recovery"
        ).catch((reason) => {
          console.warn("[Studio] Flow automatic recovery timed out", reason);
          return false;
        });
}

async function handleFailedResult(deps: ResultHandlerDependencies, job: StudioJob | undefined, jobId: string, data: Record<string, unknown>): Promise<boolean> {
  const provider = String(job?.provider || "").toLowerCase();
  if (job && (provider === "chatgpt" || provider === "chatgpt-web") && await recoverChatGptFailure(deps, job, data)) return true;
  if (job?.provider === "google-flow" && data.status === "failed_retryable" && job.tabId && await recoverFlowFailure(deps, job, data.error)) return true;
  deps.activeJobs.delete(jobId);
  deps.forgetActiveJobSnapshot(jobId);
  return false;
}

async function downloadResultAssets(deps: ResultHandlerDependencies, job: StudioJob | undefined, assets: ResultAsset[]) {
  const downloaded: ResultAsset[] = [];
  const errors: string[] = [];
  for (const asset of assets) {
    try {
      const result = await deps.downloadAsset(asset, job);
      if (!result) {
        errors.push(`Generated ${asset.type} could not be downloaded from the provider`);
      } else if (job?.task?.includes("video") && deps.resolvedResultAssetType(result, job) !== "video") {
        errors.push(`Flow returned ${deps.resolvedResultAssetType(result, job)} media for a video job`);
      } else downloaded.push(result);
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  return { assets: downloaded, errors };
}

function resultAssetPayload(deps: ResultHandlerDependencies, job: StudioJob | undefined, jobId: string, assets: ResultAsset[]) {
  return assets.map((asset) => {
    const type = deps.resolvedResultAssetType(asset, job);
    return { type, filePath: asset.filePath || asset.downloadPath || asset.filename || `${jobId}.${type === "video" ? "mp4" : "png"}`, provider: job?.provider || "browser", mimeType: asset.mimeType, filename: asset.filename, metadata: deps.flowResultMetadata(job, asset) };
  });
}

async function handleCompletedAssets(deps: ResultHandlerDependencies, job: StudioJob | undefined, jobId: string, data: Record<string, unknown>): Promise<void> {
  const { markCompletedResultJob, processingResultJobs, sendStatus, sendToDesktop } = deps;
    if (job?.task === "story_development" || job?.task === "connection_test") {
      sendToDesktop({
        type: "JOB_RESULT",
        jobId,
        status: "done",
        assets: (data.assets as ResultAsset[]).map((asset) => ({
          type: asset.type,
          filePath: asset.filename || `${jobId}.md`,
          provider: job.provider,
          metadata: asset.metadata || {}
        }))
      });
      markCompletedResultJob(jobId);
      return;
    }
    sendStatus(jobId, "downloading", "Downloading generated assets...", 0.9);
    sendStatus(jobId, "downloading", `Processing ${Array.isArray(data.assets) ? data.assets.length : 0} generated asset(s)...`, 0.91);
    const { assets, errors: downloadErrors } = await Promise.race([
      downloadResultAssets(deps, job, data.assets as ResultAsset[]),
      new Promise<{ assets: ResultAsset[]; errors: string[] }>((resolve) => setTimeout(() => resolve({
        assets: [], errors: [`Provider asset processing exceeded ${RESULT_ASSET_PROCESSING_TIMEOUT_MS / 1000}s`]
      }), RESULT_ASSET_PROCESSING_TIMEOUT_MS))
    ]);
    sendStatus(jobId, "downloading", `Asset processing returned ${assets.length} asset(s)${downloadErrors.length ? `; ${downloadErrors.length} warning(s)` : ""}.`, 0.96);
    if (assets.length === 0) {
      processingResultJobs.delete(jobId);
      sendToDesktop({
        type: "JOB_RESULT",
        jobId,
        status: "failed_retryable",
        assets: [],
        error: `Generated media was detected, but the extension could not download it into the app: ${downloadErrors.join("; ") || "no downloadable asset was returned"}`
      });
      // A failed download is terminal for this provider attempt. Leaving the
      // in-memory job (or its MV3 snapshot) alive here blocks the single-flight
      // ChatGPT lane and makes the next YOLO task wait forever even though the
      // desktop job is already retryable.
      deps.activeJobs.delete(jobId);
      deps.forgetActiveJobSnapshot(jobId);
      return;
    }
    sendToDesktop({
      type: "JOB_RESULT",
      jobId,
      status: "done",
      assets: resultAssetPayload(deps, job, jobId, assets)
    });
    markCompletedResultJob(jobId);
}

function updateContentJobStatus(job: StudioJob | undefined, data: Record<string, unknown>) {
  if (!job || data.type !== "JOB_STATUS") return;
  job.lastStatus = String(data.status || "");
  job.lastStatusMessage = String(data.message || "");
  job.lastProgress = Number(data.progress || 0);
  job.lastActivityAt = Date.now();
}

function beginResultProcessing(deps: ResultHandlerDependencies, jobId: string, data: Record<string, unknown>) {
  if (data.type !== "JOB_RESULT") return { done: false, skip: false };
  if (deps.completedResultJobs.has(jobId)) return { done: false, skip: true };
  const done = data.status === "done";
  if (done && deps.processingResultJobs.has(jobId)) return { done, skip: true };
  if (done) deps.processingResultJobs.add(jobId);
  return { done, skip: false };
}

function deliverStructuredOutput(deps: ResultHandlerDependencies, jobId: string, data: Record<string, unknown>) {
  if (data.status !== "done" || !data.output || typeof data.output !== "object") return false;
  deps.sendToDesktop({
    type: "JOB_RESULT", jobId, status: "done", assets: [],
    output: data.output, providerMetadata: data.providerMetadata
  });
  deps.markCompletedResultJob(jobId);
  return true;
}

async function handleContentResult(deps: ResultHandlerDependencies, data: Record<string, unknown>): Promise<void> {
  const jobId = String(data.jobId ?? "");
  const job = deps.activeJobs.get(jobId);
  updateContentJobStatus(job, data);
  const processing = beginResultProcessing(deps, jobId, data);
  if (processing.skip) return;
  if (await handleFailedResult(deps, job, jobId, data)) return;
  if (deliverStructuredOutput(deps, jobId, data)) return;
  if (data.status === "done" && Array.isArray(data.assets)) {
    await handleCompletedAssets(deps, job, jobId, data);
    return;
  }
  deps.sendToDesktop({ type: "JOB_RESULT", ...data });
  if (processing.done) deps.processingResultJobs.delete(jobId);
}


export function createResultHandler(deps: ResultHandlerDependencies) {
  return { handleContentResult: (data: Record<string, unknown>) => handleContentResult(deps, data) };
}
