export type StudioJob = {
  jobId: string;
  provider: string;
  task: string;
  prompt: string;
  conversationUrl?: string;
  references?: Array<{ assetId: string; referenceRole?: string; filePath?: string; base64?: string; mimeType?: string; filename?: string }>;
  settings?: Record<string, unknown> & {
    characterVoice?: {
      characterId: string;
      characterName: string;
      provider: "google-flow";
      voiceId: string;
      voiceName: string;
      lockedAt: string;
    };
  };
  download: { auto: boolean; filenameTemplate: string; targetFolder?: string };
  tabId?: number;
  /** Canonical published Studio Shot Bridge route, kept separate from the
   * Flow project workspace URL used by media-picker recovery. */
  flowRuntimeUrl?: string;
  /** Exact provider route selected for this attempt (persisted at runtime). */
  providerWorkspaceUrl?: string;
  flowPageReloadRetries?: number;
  lastStatus?: string;
  lastStatusMessage?: string;
  lastProgress?: number;
  flowReloadRecoveryActive?: boolean;
  chatGptImageRecoveryActive?: boolean;
  chatGptTextRecoveryActive?: boolean;
  chatGptHardResetAttempts?: number;
  lastActivityAt?: number;
};

export type ToolJobPayload = Pick<StudioJob, "jobId" | "task" | "prompt" | "references" | "settings">;

export type ResultAsset = {
  type: "image" | "video" | "audio" | "subtitle" | "reference";
  filename?: string;
  downloadPath?: string;
  filePath?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

export type FlowCaptureResponse = {
  ok?: boolean;
  adapter?: string;
  assets?: ResultAsset[];
  error?: string;
};
