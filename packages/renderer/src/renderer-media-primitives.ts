export function imagePreviewSrc(asset: { metadata?: { previewUrl?: unknown; posterUrl?: unknown }; filePath?: string } | undefined): string {
  return typeof asset?.metadata?.previewUrl === "string" && asset.metadata.previewUrl
    ? asset.metadata.previewUrl
    : typeof asset?.metadata?.posterUrl === "string" && asset.metadata.posterUrl
      ? asset.metadata.posterUrl
      : asset?.filePath || "";
}
