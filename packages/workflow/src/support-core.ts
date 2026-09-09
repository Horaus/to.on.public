import type { Asset, AutomationJob, VisualReference } from "@studio/types";


const ACTIVE_JOB_STATUSES = new Set<AutomationJob["status"]>(["pending", "opening_provider", "submitting", "generating", "downloading"]);
export function isActiveJob(job: AutomationJob) { return ACTIVE_JOB_STATUSES.has(job.status); }
export function isProjectJobBusy(job: AutomationJob) { return isActiveJob(job) || ["queued", "running", "awaiting_user", "recoverable"].includes(job.status); }
export function jobNeedsUserAction(job: AutomationJob | undefined) { return Boolean(job && ["waiting_login", "waiting_manual_action", "failed_manual", "failed_retryable"].includes(job.status)); }
export type RunJobPayload = { jobId: string; projectId: string; shotId?: string; providerId: string; jobType: AutomationJob["jobType"]; prompt: string; bridgeMessage: any; retryOfJobId?: string; retryAttempt?: number };
export function latestConversationForSession(jobs: AutomationJob[], projectId: string, providerId: string, sessionKey: string) {
  return jobs.filter((job) => job.projectId === projectId && job.providerId === providerId && job.providerConversationUrl?.startsWith("https://chatgpt.com/c/") && (job.input as RunJobPayload | undefined)?.bridgeMessage?.settings?.sessionKey === sessionKey)
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0]?.providerConversationUrl;
}
function referenceIsAvailableInConversation(assetId: string, conversationUrl: string | undefined, jobs: AutomationJob[], assets: Asset[], references: VisualReference[]) {
  if (!conversationUrl) return false;
  if (references.some((reference) => reference.id === assetId && reference.providerConversationUrl === conversationUrl)) return true;
  if (assets.some((asset) => asset.id === assetId && asset.metadata?.conversationUrl === conversationUrl)) return true;
  return jobs.some((job) => job.providerConversationUrl === conversationUrl && job.providerReferenceAssetIds?.includes(assetId));
}
export function referencesMissingFromConversation<T extends { assetId: string }>(items: T[], conversationUrl: string | undefined, jobs: AutomationJob[], assets: Asset[], references: VisualReference[]) {
  return items.filter((item) => !referenceIsAvailableInConversation(item.assetId, conversationUrl, jobs, assets, references));
}

export type VideoAspectRatio = "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
export type PipelineStepId = "setup" | "foundation" | "architecture" | "screenplay" | "shots" | "character" | "prompts" | "storyboard" | "video" | "review";
export type PipelineRunState = { mode: "step" | "full"; running: boolean; currentStep?: PipelineStepId; message: string; startedAt: string };
export function readFileAsDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
