import type { AssetType, AutomationJobStatus, ProviderPlatform } from "@studio/types";
import type { RunJobRequest } from "./job-request";

export type JobStatusMessage = {
  type: "JOB_STATUS";
  jobId: string;
  status: AutomationJobStatus;
  message: string;
  progress: number;
};

export type JobResultMessage = {
  type: "JOB_RESULT";
  jobId: string;
  status: "done" | "failed_manual" | "failed_retryable";
  assets: Array<{
    type: AssetType;
    filePath: string;
    provider: ProviderPlatform;
    metadata: Record<string, unknown>;
  }>;
  output?: { kind: "text"; encoding: "utf8"; text: string };
  error?: string;
};

export type ExtensionHelloMessage = {
  type: "EXTENSION_HELLO";
  extensionId?: string;
  version: string;
  providers: ProviderPlatform[];
};

export type BridgeMessage = RunJobRequest | JobStatusMessage | JobResultMessage | ExtensionHelloMessage;

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  return Boolean(value && typeof value === "object" && "type" in value);
}
