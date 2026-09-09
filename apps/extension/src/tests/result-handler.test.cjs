const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

test("failed ChatGPT asset download releases the single-flight snapshot", async () => {
  const { createResultHandler } = await import(`${pathToFileURL(path.resolve(__dirname, "../background/result-handler.ts")).href}?test=${Date.now()}`);
  const activeJobs = new Map([["image-1", {
    jobId: "image-1", provider: "chatgpt", task: "text_to_image", tabId: 7,
    settings: {}, download: { auto: false, filenameTemplate: "image-1" }
  }]]);
  const forgotten = [];
  const sent = [];
  const handler = createResultHandler({
    activeJobs,
    completedResultJobs: new Set(),
    processingResultJobs: new Set(),
    chatGptRateLimitCooldownMs: 900_000,
    flowJobWasSubmitted: () => false,
    flowRecoveryTimeoutMs: 1,
    flowResultMetadata: () => ({}),
    forgetActiveJobSnapshot: (jobId) => forgotten.push(jobId),
    isFlowAmbiguousCustomToolError: () => false,
    isFlowDefinitiveProviderFailure: () => false,
    isFlowPageCrashError: () => false,
    isFlowPostSubmitInspectionError: () => false,
    isSavedChatGptConversationUrl: () => false,
    persistChatGptRateLimit: async () => {},
    reloadAndRecoverFlowResult: async () => false,
    reloadAndRedispatchFlowJob: async () => false,
    recoverLatestFlowResult: async () => false,
    retryRecoveredCapture: async () => {},
    sendStatus: () => {},
    sendToDesktop: (message) => sent.push(message),
    waitForTabComplete: async () => ({ id: 7 }),
    withTimeout: async (promise) => promise,
    downloadAsset: async () => { throw new Error("download unavailable"); },
    markCompletedResultJob: () => { throw new Error("must not mark failed download complete"); },
    resolvedResultAssetType: () => "image"
  });

  await handler.handleContentResult({
    type: "JOB_RESULT", jobId: "image-1", status: "done",
    assets: [{ type: "image", filename: "image-1.png" }]
  });

  assert.equal(activeJobs.has("image-1"), false);
  assert.deepEqual([...new Set(forgotten)], ["image-1"]);
  assert.match(sent.at(-1).error, /could not download/i);
});
