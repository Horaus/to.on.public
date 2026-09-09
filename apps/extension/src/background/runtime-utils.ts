import type { ResultAsset, StudioJob } from "./job-types";

export function flowStartFrameAssetId(job?: StudioJob): string {
  return String(job?.settings?.startFrameAssetId || job?.references?.[0]?.assetId || "");
}

export function flowResultMetadata(job: StudioJob | undefined, asset: ResultAsset, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const metadata = asset.metadata || {};
  if (job?.provider !== "google-flow") return { ...metadata, ...extra, filename: asset.filename, mimeType: asset.mimeType };
  const startFrameAssetId = flowStartFrameAssetId(job);
  return {
    ...metadata, ...extra, studioJobId: job.jobId, currentJobOnly: metadata.currentJobOnly === false ? false : true,
    startFrameAssetId: startFrameAssetId || metadata.startFrameAssetId, filename: asset.filename, mimeType: asset.mimeType
  };
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

export function randomDelay([minMs, maxMs]: [number, number]): number {
  return Math.round(minMs + Math.random() * Math.max(0, maxMs - minMs));
}

export function inferProviderFromUrl(urlValue: string): string {
  try {
    const url = new URL(urlValue);
    if (["labs.google", "labs.google.com", "flow.google.com"].includes(url.hostname)) return "google-flow";
    if (url.hostname === "grok.com" || (url.hostname === "x.com" && url.pathname.startsWith("/i/grok"))) return "grok";
    if (["chatgpt.com", "chat.openai.com"].includes(url.hostname)) return "chatgpt";
    if (url.hostname === "elevenlabs.io" && url.pathname.startsWith("/app/flows/")) return "elevenlabs-flows";
  } catch {}
  return "";
}
