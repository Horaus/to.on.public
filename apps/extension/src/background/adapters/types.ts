export type ProviderId = "chatgpt" | "google-flow" | "elevenlabs-flows" | "grok" | "freepik";

export type ProviderJob = {
  jobId: string;
  provider: string;
  task: string;
  prompt: string;
  conversationUrl?: string;
  settings?: Record<string, unknown>;
};

export type ProviderDispatchResult = { accepted: boolean; tabId?: number; reason?: string };
export type ProviderRecoveryResult = { recovered: boolean; terminal: boolean; reason?: string };

export interface ProviderAdapter {
  readonly provider: ProviderId;
  readonly targetUrl: string;
  readonly contentScript?: string;
  readonly mainWorldScript?: string;
  canHandle(job: ProviderJob): boolean;
  matchesTab(url?: string): boolean;
}
