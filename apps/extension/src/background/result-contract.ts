import type { ResultAsset, StudioJob } from "./job-types";

export type ResultRuntimeDependencies = {
  activeFlowCustomToolTab: () => Promise<chrome.tabs.Tab | undefined>;
  activeJobs: Map<string, StudioJob>; completedResultJobs: Set<string>; processingResultJobs: Set<string>;
  findFlowProjectTab: () => Promise<{ tab?: chrome.tabs.Tab; activeFlowTab?: chrome.tabs.Tab; flowTabCount: number; projectTabCount: number; customToolTabCount: number; urls: string[] }>;
  flowResultMetadata: (job: StudioJob | undefined, asset: ResultAsset, extra?: Record<string, unknown>) => Record<string, unknown>;
  flowStartFrameAssetId: (job?: StudioJob) => string; forgetActiveJobSnapshot: (jobId: string) => void;
  inferProviderFromUrl: (url: string) => string; requestDesktopFlowToolEvaluate: (expression: string) => Promise<unknown>;
  chatGptRateLimitCooldownMs: number; ensureContentScript: (job: StudioJob) => Promise<void>;
  flowRecoveryTimeoutMs: number; flowJobWasSubmitted: (job?: StudioJob) => boolean;
  isFlowAmbiguousCustomToolError: (error: unknown) => boolean; isFlowBridgeUnavailableError: (error: unknown) => boolean; isFlowDefinitiveProviderFailure: (error: unknown) => boolean;
  isFlowPageCrashError: (error: unknown) => boolean; isFlowPostSubmitInspectionError: (error: unknown) => boolean;
  isSavedChatGptConversationUrl: (value: unknown) => value is string; persistChatGptRateLimit: (until: number) => Promise<void>;
  reloadAndRecoverFlowResult: (job: StudioJob, error: unknown) => Promise<boolean>; reloadAndRedispatchFlowJob: (job: StudioJob, error: unknown) => Promise<boolean>;
  retryRecoveredCapture: (job: StudioJob, tabId: number) => Promise<void>; sendStatus: (jobId: string, status: string, message: string, progress?: number) => void;
  sendToDesktop: (message: Record<string, unknown>) => void; waitForTabComplete: (tabId: number, timeoutMs?: number) => Promise<chrome.tabs.Tab>;
  withTimeout: (promise: Promise<boolean>, timeoutMs: number, label: string) => Promise<boolean>;
};
