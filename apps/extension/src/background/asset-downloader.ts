import type { ResultAsset, StudioJob } from "./job-types";

type DownloadedData = { dataUrl: string; mimeType: string; byteSize: number };
const ASSET_FETCH_TIMEOUT_MS = 8_000;
const MAX_BINARY_BYTES: Record<string, number> = Object.freeze({ image: 25 * 1024 * 1024, video: 200 * 1024 * 1024, audio: 200 * 1024 * 1024 });

const PROVIDER_ASSET_HOSTS: Record<string, string[]> = {
  "google-flow": ["labs.google", "labs.google.com", "flow.google.com", "flow-content.google", "googleusercontent.com", "googleapis.com", "googlevideo.com"],
  chatgpt: ["chatgpt.com", "chat.openai.com", "openai.com", "oaiusercontent.com", "oaistatic.com", "estuary.dev"],
  grok: ["grok.com", "x.com", "xusercontent.com"],
  "elevenlabs-flows": ["elevenlabs.io", "elevenlabs.dev"]
};

function providerAssetHosts(provider: string): string[] {
  return PROVIDER_ASSET_HOSTS[String(provider || "").toLowerCase()] || [];
}

function hostMatchesAllowlist(hostname: string, allowedHosts: string[]): boolean {
  const normalized = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return allowedHosts.some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
}

export function isAllowedProviderAssetUrl(value: string, provider: string): boolean {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol === "blob:") {
      const embedded = new URL(url.pathname);
      return embedded.protocol === "https:" && hostMatchesAllowlist(embedded.hostname, providerAssetHosts(provider));
    }
    if (url.protocol !== "https:") return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    return hostMatchesAllowlist(url.hostname, providerAssetHosts(provider));
  } catch {
    return false;
  }
}

function assertAllowedProviderAssetUrl(value: string, provider: string): void {
  if (!isAllowedProviderAssetUrl(value, provider)) throw new Error(`MEDIA_REDIRECT_NOT_ALLOWED: ${provider || "provider"} asset URL is outside the provider allowlist.`);
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 180);
}

type DownloadedMediaKind = "image" | "video" | "audio";

function mediaKindFromMime(mimeType: string): DownloadedMediaKind | "" {
  const normalized = String(mimeType || "").toLowerCase().split(";", 1)[0];
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  return "";
}

function hasMediaSignature(bytes: Uint8Array, kind: DownloadedMediaKind): boolean {
  if (bytes.length < 4) return false;
  if (kind === "image") {
    return (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP");
  }
  if (kind === "video") {
    return (bytes.length >= 8 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp")
      || (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3);
  }
  return true;
}

/**
 * Validate a provider response before it is expanded into a durable data URL.
 * Redirect policy alone is insufficient: a trusted host can still return an
 * HTML error page, an oversized body, or a MIME/type mismatch.
 */
export function validateDownloadedBinary({ bytes, mimeType, assetType }: { bytes: Uint8Array; mimeType?: string; assetType: DownloadedMediaKind }): { ok: true; byteSize: number; mimeType: string } | { ok: false; code: string } {
  const byteSize = Number(bytes?.byteLength || 0);
  const maxBytes = MAX_BINARY_BYTES[assetType];
  if (!byteSize) return { ok: false, code: "empty_media" };
  if (byteSize > maxBytes) return { ok: false, code: "media_too_large" };
  const declaredKind = mediaKindFromMime(mimeType || "");
  if (declaredKind && declaredKind !== assetType) return { ok: false, code: "media_type_mismatch" };
  if (!hasMediaSignature(bytes, assetType)) return { ok: false, code: "invalid_media_signature" };
  return { ok: true, byteSize, mimeType: String(mimeType || "application/octet-stream") };
}

function responseContentLength(response: Response): number | undefined {
  const value = Number(response.headers.get("content-length"));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Read a response without ever retaining more than the provider's byte cap. */
export async function readResponseBytes(response: { body?: ReadableStream<Uint8Array> | null; arrayBuffer: () => Promise<ArrayBuffer> }, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength <= maxBytes ? bytes : null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel("media_too_large").catch(() => undefined);
        return null;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchAssetInBackground(url: string, provider: string, assetType: DownloadedMediaKind): Promise<DownloadedData | null> {
  assertAllowedProviderAssetUrl(url, provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASSET_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { credentials: "include", signal: controller.signal });
    if (!response.ok || (response.url && !isAllowedProviderAssetUrl(response.url, provider))) return null;
    const contentLength = responseContentLength(response);
    if (contentLength !== undefined && contentLength > MAX_BINARY_BYTES[assetType]) return null;
    const bytes = await readResponseBytes(response, MAX_BINARY_BYTES[assetType]);
    if (!bytes) return null;
    const mimeType = response.headers.get("content-type") || "application/octet-stream";
    const validation = validateDownloadedBinary({ bytes, mimeType, assetType });
    if (!validation.ok) return null;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return { dataUrl: `data:${validation.mimeType};base64,${btoa(binary)}`, mimeType: validation.mimeType, byteSize: validation.byteSize };
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

async function fetchInProviderTab(url: string, tabId: number, provider: string, assetType: DownloadedMediaKind): Promise<DownloadedData | null> {
  assertAllowedProviderAssetUrl(url, provider);
  const allowedHosts = providerAssetHosts(provider);
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (assetUrl: string, providerHosts: string[], expectedType: DownloadedMediaKind, maxBytes: number) => {
        const hostAllowed = (value: string) => {
          try {
            const parsed = new URL(value);
            if (parsed.protocol === "blob:") {
              const embedded = new URL(parsed.pathname);
              return embedded.protocol === "https:" && providerHosts.some((allowed) => embedded.hostname.toLowerCase() === allowed || embedded.hostname.toLowerCase().endsWith(`.${allowed}`));
            }
            const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
            return parsed.protocol === "https:" && providerHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
          } catch { return false; }
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);
        try {
          const response = await fetch(assetUrl, { credentials: "include", signal: controller.signal });
          if (!response.ok || (response.url && !hostAllowed(response.url))) return { ok: false };
          const contentLength = Number(response.headers.get("content-length"));
          if (Number.isFinite(contentLength) && contentLength > maxBytes) return { ok: false, code: "media_too_large" };
          const reader = response.body?.getReader();
          const chunks = [];
          let total = 0;
          if (reader) {
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) break;
                const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
                total += chunk.byteLength;
                if (total > maxBytes) { await reader.cancel("media_too_large").catch(() => undefined); return { ok: false, code: "media_too_large" }; }
                chunks.push(chunk);
              }
            } finally { reader.releaseLock(); }
          } else {
            const fallback = new Uint8Array(await response.arrayBuffer());
            if (fallback.byteLength > maxBytes) return { ok: false, code: "media_too_large" };
            chunks.push(fallback);
            total = fallback.byteLength;
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          const mime = String(response.headers.get("content-type") || "application/octet-stream").toLowerCase().split(";", 1)[0];
          const declaredKind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "";
          const signature = expectedType === "image"
            ? ((bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) || (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"))
            : expectedType === "video"
              ? ((bytes.length >= 8 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp") || (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3))
              : bytes.length > 0;
          if (!bytes.length || bytes.length > maxBytes || (declaredKind && declaredKind !== expectedType) || !signature) return { ok: false };
          const blob = new Blob([bytes], { type: mime });
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("READ_ERROR"));
            reader.readAsDataURL(blob);
          });
          return { ok: true, dataUrl, mimeType: blob.type || "application/octet-stream", byteSize: bytes.length };
        } catch { return { ok: false }; }
        finally { clearTimeout(timeout); }
      }, args: [url, allowedHosts, assetType, MAX_BINARY_BYTES[assetType]]
    });
    const value = result?.result as (DownloadedData & { ok?: boolean }) | undefined;
    return value?.ok && value.dataUrl ? value : null;
  } catch { return null; }
}

async function fetchThroughChatGptContentScript(url: string, tabId: number, provider: string, assetType: DownloadedMediaKind): Promise<DownloadedData | null> {
  assertAllowedProviderAssetUrl(url, provider);
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: "READ_CHATGPT_ASSET_FOR_BACKGROUND", url });
    if (!response?.ok || !response.dataUrl) return null;
    const encoded = String(response.dataUrl);
    const payload = encoded.match(/^data:[^;]+;base64,([A-Za-z0-9+/=\s]+)$/i)?.[1];
    if (!payload) return null;
    const binary = atob(payload.replace(/\s+/g, ""));
    const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
    const validation = validateDownloadedBinary({ bytes, mimeType: String(response.mimeType || "application/octet-stream"), assetType });
    return validation.ok ? { dataUrl: encoded, mimeType: validation.mimeType, byteSize: validation.byteSize } : null;
  } catch {
    return null;
  }
}

async function firstDownloadedAsset(tasks: Array<Promise<DownloadedData | null | undefined>>): Promise<DownloadedData | null> {
  try {
    return await Promise.any(tasks.map((task) => task.then((value) => value || Promise.reject(new Error("asset unavailable")))));
  } catch {
    return null;
  }
}

function waitForDownload(downloadId: number): Promise<chrome.downloads.DownloadItem> {
  return new Promise((resolve, reject) => {
    const cleanup = () => chrome.downloads.onChanged.removeListener(listener);
    const timeout = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for download ${downloadId}`)); }, 120000);
    const finish = async () => {
      clearTimeout(timeout); cleanup();
      const [item] = await chrome.downloads.search({ id: downloadId });
      item?.filename ? resolve(item) : reject(new Error(`Download ${downloadId} completed without a filename`));
    };
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return;
      if (delta.error?.current) { clearTimeout(timeout); cleanup(); reject(new Error(delta.error.current)); }
      if (delta.state?.current === "complete") void finish().catch(reject);
    };
    chrome.downloads.onChanged.addListener(listener);
  });
}

async function downloadViaChrome(asset: ResultAsset, source: string, filename: string, provider: string): Promise<ResultAsset> {
  assertAllowedProviderAssetUrl(source, provider);
  const downloadId = await chrome.downloads.download({ url: source, filename: `AI Video Studio/${sanitizeFilename(filename)}`, saveAs: false, conflictAction: "uniquify" });
  const item = await waitForDownload(downloadId);
  return { ...asset, filename: item.filename.split("/").pop() || filename, filePath: item.filename, downloadPath: item.filename,
    metadata: { ...(asset.metadata || {}), originalUrl: source, storage: "download", downloadId } };
}

async function persistChatGptImageViaChrome(asset: ResultAsset, dataUrl: string, filename: string): Promise<ResultAsset> {
  // A mounted ChatGPT image may only be recoverable as a data URL (for
  // example after its signed Estuary URL expires). Do not pass that URL to
  // chrome.downloads: the download event can remain unresolved longer than
  // the result handoff watchdog. The desktop result path already accepts and
  // persists this bounded fallback representation.
  if (dataUrl.startsWith("data:")) {
    return {
      ...asset,
      filename,
      filePath: dataUrl,
      downloadPath: dataUrl,
      metadata: { ...(asset.metadata || {}), storage: "data_url", byteSize: Math.max(0, Math.round(dataUrl.length * 0.75)) }
    };
  }
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename: `AI Video Studio/${sanitizeFilename(filename)}`,
    saveAs: false,
    conflictAction: "uniquify"
  });
  const item = await waitForDownload(downloadId);
  return {
    ...asset,
    filename: item.filename.split("/").pop() || filename,
    filePath: item.filename,
    downloadPath: item.filename,
    metadata: { ...(asset.metadata || {}), storage: "download", downloadId, byteSize: undefined }
  };
}

async function downloadChatGptImage(asset: ResultAsset, job: StudioJob, source: string): Promise<ResultAsset | undefined> {
  const result = await firstDownloadedAsset([
    withDeadline(fetchAssetInBackground(source, job.provider, "image"), ASSET_FETCH_TIMEOUT_MS),
    withDeadline(fetchInProviderTab(source, job.tabId!, job.provider, "image"), ASSET_FETCH_TIMEOUT_MS),
    withDeadline(fetchThroughChatGptContentScript(source, job.tabId!, job.provider, "image"), ASSET_FETCH_TIMEOUT_MS)
  ]);
  if (!result) return undefined;
  const filename = asset.filename || `chatgpt_${job.jobId}.png`;
  try {
    return await persistChatGptImageViaChrome(asset, result.dataUrl, filename);
  } catch (error) {
    console.warn("[Studio] ChatGPT image local download failed; retaining data URL fallback:", error);
    return { ...asset, filename, filePath: result.dataUrl, downloadPath: result.dataUrl,
      mimeType: result.mimeType, metadata: { ...(asset.metadata || {}), storage: "data_url", byteSize: result.byteSize, originalUrl: source } };
  }
}

async function downloadFlowVideo(asset: ResultAsset, job: StudioJob, source: string): Promise<ResultAsset> {
  const filename = asset.filename || `google_flow_${job.jobId}.mp4`;
  try {
    return { ...(await downloadViaChrome(asset, source, filename, job.provider)), type: "video", mimeType: asset.mimeType || "video/mp4" };
  } catch (downloadError) {
    console.warn("[Studio] Flow video chrome.downloads failed, trying tab fetch:", downloadError);
    const fetched = await fetchInProviderTab(source, job.tabId!, job.provider, "video");
    if (!fetched) throw downloadError;
    return { ...asset, type: "video", filename, filePath: fetched.dataUrl, downloadPath: fetched.dataUrl,
      mimeType: fetched.mimeType || "video/mp4", metadata: { ...(asset.metadata || {}), storage: "data_url", byteSize: fetched.byteSize, originalUrl: source } };
  }
}

function isChatGptImage(job: StudioJob | undefined, asset: ResultAsset): boolean {
  const provider = String(job?.provider || "").toLowerCase();
  return Boolean((provider === "chatgpt" || provider === "chatgpt-web") && job?.tabId && asset.type === "image");
}

function isFlowVideo(job: StudioJob | undefined, asset: ResultAsset): boolean {
  return Boolean(job?.provider === "google-flow" && job.tabId && (asset.type === "video" || asset.mimeType?.startsWith("video/")));
}

async function downloadAsset(asset: ResultAsset, job?: StudioJob): Promise<ResultAsset> {
  const source = asset.downloadPath || asset.filePath || "";
  // A content script may provide a mounted-image data URL alongside the
  // original signed URL. Prefer that local representation for the direct
  // result path; otherwise the URL would unnecessarily re-enter the 45s
  // downloader race and reproduce the handoff watchdog failure.
  const direct = directAssetResult(asset, job, asset.filePath || source);
  if (direct) return direct;
  // Late JOB_RESULT delivery can restore the snapshot after the in-memory
  // active-job map has been pruned. A ChatGPT image still carries its
  // conversation metadata, so preserve that verified provider result instead
  // of treating it as a generic asset and waiting on chrome.downloads.
  const lateResult = lateChatGptResult(asset, job, source);
  if (lateResult) return lateResult;
  if (!job && asset.type === "image" && asset.metadata?.conversationUrl) {
    throw new Error("CHATGPT_JOB_SNAPSHOT_UNAVAILABLE: refusing to relay an expiring provider URL without the active job snapshot.");
  }
  if (/^https?:/i.test(source)) assertAllowedProviderAssetUrl(source, job?.provider || "");
  const providerResult = await downloadProviderAsset(asset, job, source);
  if (providerResult) return providerResult;
  // Provider-specific result paths must fail fast. Falling through to the
  // generic chrome.downloads path can wait for its 120s download event even
  // though the signed provider URL is no longer readable, leaving the job in
  // `downloading` until the desktop watchdog fires.
  if (isChatGptImage(job, asset) || isFlowVideo(job, asset)) {
    throw new Error(`Provider asset capture failed for ${job?.jobId || "unknown-job"}; generic browser download was skipped.`);
  }
  return downloadGenericAsset(asset, job, source);
}

function lateChatGptResult(asset: ResultAsset, job: StudioJob | undefined, source: string): ResultAsset | undefined {
  if (job || asset.type !== "image" || !asset.metadata?.conversationUrl || !source) return undefined;
  return undefined;
}

function downloadGenericAsset(asset: ResultAsset, job: StudioJob | undefined, source: string): Promise<ResultAsset> {
  const template = job?.download?.filenameTemplate || asset.filename || `studio_${Date.now()}`;
  const base = sanitizeFilename(template.replace("[provider]", job?.provider || "provider").replace("[index]", "0"));
  return downloadViaChrome(asset, source, asset.filename || `${base}${asset.type === "video" ? ".mp4" : ".png"}`, job?.provider || "");
}

async function downloadProviderAsset(asset: ResultAsset, job: StudioJob | undefined, source: string): Promise<ResultAsset | undefined> {
  if (isChatGptImage(job, asset)) return downloadChatGptOrFallback(asset, job!, source);
  if (isFlowVideo(job, asset)) return downloadFlowVideo(asset, job!, source);
  return undefined;
}

async function downloadChatGptOrFallback(asset: ResultAsset, job: StudioJob, source: string): Promise<ResultAsset | undefined> {
  const downloaded = await downloadChatGptImage(asset, job, source);
  if (downloaded) return downloaded;
  // A signed provider URL is not a durable desktop asset. Returning it here
  // would make the desktop appear to accept an image while reference
  // promotion later has no local file to import; let the caller fail fast and
  // expose a retryable handoff error instead.
  return undefined;
}

function directAssetResult(asset: ResultAsset, job: StudioJob | undefined, source: string): ResultAsset | undefined {
  if (asset.mimeType?.startsWith("text/") || asset.type === "subtitle") {
    return { ...asset, filePath: asset.filename || source || `${job?.jobId || "chatgpt-response"}.md` };
  }
  if (!source || source.startsWith("file://") || source.startsWith("data:")) return { ...asset, filePath: source };
  return undefined;
}

export function createAssetDownloader() { return { downloadAsset }; }
