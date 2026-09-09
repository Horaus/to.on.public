import type { StudioJob } from "./job-types";

const ACTIVE_JOB_SNAPSHOT_PREFIX = "studio.activeJob.v1.";

export function createChatGptSessionStore(activeJobs: Map<string, StudioJob>) {
  const snapshotKey = (jobId: string) => `${ACTIVE_JOB_SNAPSHOT_PREFIX}${jobId}`;

  return {
    async persist(job: StudioJob): Promise<void> {
      if (job.provider !== "chatgpt") return;
      // MV3 may suspend the service worker while a provider tab is navigating.
      // Keep the command envelope in session storage so a wake-up can resume the
      // same idempotent job. Binary reference payloads are deliberately omitted:
      // native upload uses the durable filePath and conversation-context jobs do
      // not need to upload the reference again.
      const references = (job.references || []).map(({ base64: _base64, ...reference }) => reference);
      const snapshot: StudioJob = {
        jobId: job.jobId,
        provider: job.provider,
        task: job.task,
        prompt: job.prompt,
        conversationUrl: job.conversationUrl,
        references,
        settings: { ...(job.settings || {}) },
        download: { auto: false, filenameTemplate: job.download.filenameTemplate || "recovered-response" },
        tabId: job.tabId,
        lastStatus: job.lastStatus,
        lastStatusMessage: job.lastStatusMessage,
        lastProgress: job.lastProgress,
        lastActivityAt: job.lastActivityAt,
        chatGptTextRecoveryActive: job.chatGptTextRecoveryActive
      };
      await chrome.storage.session.set({ [snapshotKey(job.jobId)]: snapshot });
    },

    async restore(jobId: string): Promise<StudioJob | undefined> {
      const key = snapshotKey(jobId);
      const stored = await chrome.storage.session.get(key);
      const snapshot = stored[key] as StudioJob | undefined;
      if (!snapshot?.jobId || snapshot.provider !== "chatgpt") return undefined;
      activeJobs.set(jobId, snapshot);
      return snapshot;
    },

    forget(jobId: string): void {
      void chrome.storage.session.remove(snapshotKey(jobId));
    }
  };
}

export function createChatGptBrowserState(rateLimitKey: string, tabKey: string, matchesTab: (tab: chrome.tabs.Tab) => boolean) {
  let inMemoryRateLimit = 0;
  return {
    async rateLimitedUntil(): Promise<number> {
      const stored = await chrome.storage.local.get(rateLimitKey);
      inMemoryRateLimit = Math.max(inMemoryRateLimit, Number(stored[rateLimitKey] || 0));
      return inMemoryRateLimit;
    },
    async persistRateLimit(until: number): Promise<void> {
      inMemoryRateLimit = Math.max(inMemoryRateLimit, until);
      await chrome.storage.local.set({ [rateLimitKey]: inMemoryRateLimit });
    },
    currentRateLimit: () => inMemoryRateLimit,
    async rememberTab(tabId: number): Promise<void> {
      await chrome.storage.session.set({ [tabKey]: tabId });
    },
    async rememberedTab(): Promise<chrome.tabs.Tab | undefined> {
      const stored = await chrome.storage.session.get(tabKey);
      const tabId = Number(stored[tabKey] || 0);
      if (!tabId) return undefined;
      const tab = await chrome.tabs.get(tabId).catch(() => undefined);
      if (tab?.id && matchesTab(tab)) return tab;
      await chrome.storage.session.remove(tabKey);
      return undefined;
    }
  };
}
