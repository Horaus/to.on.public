export type FlowReferenceIdentity = {
  filename?: string;
  assetId?: string;
  filePath?: string;
};

export function normalizedReferenceToken(value: string): string {
  return value.toLowerCase().replace(/^data:[^;]+;base64,/i, "").split(/[?#]/)[0].split("/").pop()!.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/g, "");
}

export function referenceSearchTokens(reference?: FlowReferenceIdentity): string[] {
  if (!reference) return [];
  const filePath = reference.filePath && !reference.filePath.startsWith("data:") ? reference.filePath : "";
  let decodedFilePath = filePath;
  try { decodedFilePath = decodeURIComponent(filePath); } catch { /* original path is still useful */ }
  const filePathBasename = decodedFilePath.split(/[/?#]/).filter(Boolean).pop() || "";
  return Array.from(new Set([reference.filename || "", reference.assetId || "", filePath, decodedFilePath, filePathBasename].map(normalizedReferenceToken).filter((token) => token.length >= 6)));
}

export function referenceRequiredLabel(reference?: FlowReferenceIdentity): string {
  return reference?.filename || reference?.assetId || "unknown reference";
}

export function referenceGeometryIsScoped(rect: { width: number; height: number; top: number }, viewport: { width: number; height: number }): boolean {
  if (rect.width < 36 || rect.height < 24) return false;
  if (rect.width > viewport.width * 0.78 || rect.height > viewport.height * 0.72) return false;
  return rect.width * rect.height <= viewport.width * viewport.height * 0.42 && rect.top >= 0;
}

export function fingerprintDistance(left: { width: number; height: number; values: number[] }, right: { width: number; height: number; values: number[] }): number {
  if (left.width !== right.width || left.height !== right.height || left.values.length !== right.values.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < left.values.length; index++) total += Math.abs(left.values[index] - right.values[index]);
  return total / Math.max(1, left.values.length) / 255;
}
