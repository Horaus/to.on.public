export function referenceDataUrl(reference: any): string {
  return reference.base64 || reference.filePath || "";
}
export function hasUsableReference(reference: any): boolean {
  const data = referenceDataUrl(reference);
  return Boolean(data && (/^data:image\/[^;]+;base64,/i.test(data) || reference.base64));
}
export function dataUrlToFile(reference: any): File | null {
  const data = referenceDataUrl(reference);
  if (!data) return null;
  const mimeType = reference.mimeType || data.match(/^data:([^;]+);base64,/i)?.[1] || "image/png";
  const normalizedBase64 = data.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  if (!normalizedBase64) return null;
  const binary = atob(normalizedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], reference.filename || `${reference.assetId}.png`, { type: mimeType });
}
export function referenceLocalFilePath(reference: any): string {
  const filePath = String(reference.filePath || "");
  if (/^https?:\/\/127\.0\.0\.1:\d+\/media\//i.test(filePath)) {
    try { return decodeURIComponent(new URL(filePath).pathname.replace(/^\/media\//, "")); } catch { return ""; }
  }
  if (filePath.startsWith("file://")) {
    try { return decodeURIComponent(new URL(filePath).pathname); } catch { return filePath.slice("file://".length); }
  }
  return filePath.startsWith("/") ? filePath : "";
}

/**
 * Persisted jobs deliberately keep a durable filePath instead of image bytes.
 * Flow's picker contract needs bytes, so hydrate only the in-memory execution
 * copy. Callers must not write the returned object back to studio state.
 */
export async function hydrateReference(reference: any): Promise<any> {
  if (reference?.base64) return reference;
  const filePath = String(reference?.filePath || "");
  const source = /^https?:\/\/127\.0\.0\.1:\d+\/media\//i.test(filePath)
    ? filePath
    : "";
  if (!source || typeof fetch !== "function") return reference;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not read Flow reference ${reference?.assetId || "unknown"} from local media server (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`Local Flow reference ${reference?.assetId || "unknown"} was empty.`);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const mimeType = reference.mimeType || response.headers.get("content-type")?.split(";", 1)[0] || "image/png";
  return { ...reference, mimeType, base64: `data:${mimeType};base64,${btoa(binary)}` };
}

export async function hydrateReferences(references: any[] | undefined): Promise<any[]> {
  return Promise.all((references || []).map(hydrateReference));
}
