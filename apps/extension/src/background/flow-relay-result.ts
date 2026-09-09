export type FlowRelayIntegration = {
  base64?: string;
  mimeType?: string;
  mediaId?: string;
  providerJobId?: string;
  sourceMode?: "frames" | "components";
  quality?: "fast" | "quality";
  audioPolicy?: "separate_audio_pass" | "native_audio";
  voiceLockVerified?: boolean;
  voiceLock?: { characterId: string; voiceId?: string; voiceSignature: string };
  outputLanguage?: string;
  outputResolution?: "720p" | "1080p";
  metadata?: Record<string, unknown>;
};

export function normalizeFlowRelayIntegration(value: unknown): FlowRelayIntegration {
  const source = value && typeof value === "object" ? value as Record<string, any> : {};
  const mediaId = String(source.mediaId || source.media_id || "");
  const explicitProviderId = String(source.providerJobId || source.provider_id || source.providerId || "");
  const rawSourceMode = String(source.sourceMode || source.source_mode || "").toLowerCase();
  const sourceMode = rawSourceMode === "frames" ? "frames" : rawSourceMode === "components" || rawSourceMode === "experimental" ? "components" : undefined;
  const rawQuality = String(source.quality || "").toLowerCase();
  const quality = rawQuality === "fast" || rawQuality === "quality" ? rawQuality : undefined;
  const rawAudioPolicy = String(source.audioPolicy || source.audio_policy || "").toLowerCase();
  const audioPolicy = rawAudioPolicy === "native_audio" || rawAudioPolicy === "separate_audio_pass" ? rawAudioPolicy : undefined;
  const rawVoice = source.voiceLock && typeof source.voiceLock === "object" ? source.voiceLock : undefined;
  const voiceLock = rawVoice && String(rawVoice.characterId || "").trim() && String(rawVoice.voiceSignature || "").trim()
    ? { characterId: String(rawVoice.characterId), ...(String(rawVoice.voiceId || "").trim() ? { voiceId: String(rawVoice.voiceId) } : {}), voiceSignature: String(rawVoice.voiceSignature) }
    : undefined;
  const outputLanguage = String(source.outputLanguage || source.output_language || "").trim() || undefined;
  const rawResolution = String(source.outputResolution || source.output_resolution || "").toLowerCase();
  const outputResolution = rawResolution === "720p" || rawResolution === "1080p" ? rawResolution : undefined;
  return {
    base64: typeof source.base64 === "string" ? source.base64.replace(/^data:[^,]+,/, "") : undefined,
    mimeType: String(source.mimeType || source.mime_type || "video/mp4"),
    mediaId: mediaId || undefined,
    // Flow Relay currently exposes a durable mediaId but no separate run id.
    // Namespace that provider identity instead of discarding the real media
    // result or pretending the visible SDK result belongs to the current job.
    providerJobId: explicitProviderId || (mediaId ? `flow_relay_${mediaId}` : undefined),
    sourceMode,
    quality,
    audioPolicy,
    voiceLockVerified: typeof source.voiceLockVerified === "boolean" ? source.voiceLockVerified : undefined,
    voiceLock,
    outputLanguage,
    outputResolution,
    metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : undefined
  };
}

export function relayBytesFingerprint(base64: unknown): string {
  const value = typeof base64 === "string" ? base64.replace(/^data:[^,]+,/, "") : "";
  return value ? `${value.length}:${value.slice(0, 24)}:${value.slice(-24)}` : "";
}

export function flowRelayResultChanged(before: { mediaId?: string; bytesFingerprint?: string }, after: { mediaId?: string; bytesFingerprint?: string }): boolean {
  if (after.mediaId && after.mediaId !== before.mediaId) return true;
  return Boolean(after.bytesFingerprint && after.bytesFingerprint !== before.bytesFingerprint);
}
