export type ChatGptReferencePayload = { assetId: string; base64?: string; mimeType?: string; filename?: string };
export type ChatGptReferenceRegistryEntry = { fingerprint: string; filename: string; conversationUrl: string; confirmedAt: number };
const REGISTRY_KEY = "studio.chatgpt.referenceRegistry.v1";
export function referenceFingerprint(reference: ChatGptReferencePayload): string {
  const normalizedBase64 = String(reference.base64 || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalizedBase64.length; index += 1) { hash ^= normalizedBase64.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `${reference.mimeType || "image/png"}:fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}:${normalizedBase64.length}`;
}
export function readChatGptReferenceRegistry(): Record<string, ChatGptReferenceRegistryEntry> {
  try { return JSON.parse(window.localStorage.getItem(REGISTRY_KEY) || "{}") as Record<string, ChatGptReferenceRegistryEntry>; } catch { return {}; }
}
export function writeChatGptReferenceRegistry(registry: Record<string, ChatGptReferenceRegistryEntry>): void {
  try { const entries = Object.entries(registry).sort(([, left], [, right]) => right.confirmedAt - left.confirmedAt).slice(0, 200); window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(Object.fromEntries(entries))); } catch {}
}
export function markChatGptReferenceConfirmed(reference: ChatGptReferencePayload): void {
  const fingerprint = referenceFingerprint(reference); if (!reference.base64 || !fingerprint) return;
  const registry = readChatGptReferenceRegistry(); registry[fingerprint] = { fingerprint, filename: reference.filename || `${reference.assetId}.png`, conversationUrl: location.href, confirmedAt: Date.now() }; writeChatGptReferenceRegistry(registry);
}
export function registeredChatGptReference(reference: ChatGptReferencePayload): ChatGptReferenceRegistryEntry | undefined {
  if (!reference.base64) return undefined; return readChatGptReferenceRegistry()[referenceFingerprint(reference)];
}
