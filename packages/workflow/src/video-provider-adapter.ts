import { resolveProviderVideoDuration } from "@studio/domain/duration-policy";
import type { ProjectIntake, ProviderPlatform, Shot } from "@studio/types";

type VideoAspectRatio = NonNullable<ProjectIntake["videoFrame"]>["aspectRatio"];

export type VideoProviderCapabilityProfile = {
  id: string;
  version: number;
  platform: ProviderPlatform;
  sourceModes: Array<"components" | "frames">;
  maxPromptUtf8Bytes?: number;
  safePromptUtf8Bytes?: number;
  maxReferenceImages?: number;
  supportsNativeAudio: boolean;
  supportsLockedCharacterVoice: boolean;
};

const GOOGLE_FLOW_PROFILE: VideoProviderCapabilityProfile = {
  id: "google-flow-video",
  version: 1,
  platform: "google-flow",
  sourceModes: ["components", "frames"],
  maxPromptUtf8Bytes: 4000,
  safePromptUtf8Bytes: 3600,
  maxReferenceImages: 1,
  supportsNativeAudio: true,
  // Live Studio Shot Bridge evidence proves that native speech can be present,
  // but its SDK exposes no reusable character Voice ID. Named dialogue must use
  // the separate character audio pass instead of claiming a provider voice lock.
  supportsLockedCharacterVoice: false
};

const GENERIC_VIDEO_PROFILE: VideoProviderCapabilityProfile = {
  id: "generic-image-to-video",
  version: 1,
  platform: "other",
  sourceModes: ["components"],
  supportsNativeAudio: false,
  supportsLockedCharacterVoice: false
};

export function buildShotGenerationSpec(shot: Shot) {
  return {
    camera: shot.camera,
    durationSec: shot.durationSec,
    action: shot.dominantAction || shot.description,
    dialogue: shot.dialogue || "",
    notes: shot.motion || "",
    timeline: (shot.actionBeats || []).map((beat) => ({
      startSec: beat.startSec,
      endSec: beat.endSec,
      action: beat.action,
      camera: beat.camera,
      dialogue: beat.dialogue || "",
      speaker: beat.speaker || ""
    }))
  };
}

export function videoProviderCapabilityProfile(platform: ProviderPlatform): VideoProviderCapabilityProfile {
  return platform === "google-flow" ? GOOGLE_FLOW_PROFILE : { ...GENERIC_VIDEO_PROFILE, platform };
}

export function compileVideoProviderRequest({
  platform,
  neutralPrompt,
  shot,
  aspectRatio,
  sourceMode = "components",
  quality = "fast",
  generateAudio = false,
  outputLanguage
}: {
  platform: ProviderPlatform;
  neutralPrompt: string;
  shot: Shot;
  aspectRatio: VideoAspectRatio;
  sourceMode?: "components" | "frames";
  quality?: "fast" | "quality";
  generateAudio?: boolean;
  outputLanguage: string;
}) {
  const profile = videoProviderCapabilityProfile(platform);
  const resolvedSourceMode = profile.sourceModes.includes(sourceMode) ? sourceMode : profile.sourceModes[0];
  const settings = {
    aspectRatio,
    durationSec: resolveProviderVideoDuration(platform, shot.durationSec),
    timelineDurationSec: shot.durationSec,
    quality: quality === "quality" ? "high" as const : "fast" as const,
    outputLanguage,
    generateAudio: profile.supportsNativeAudio && generateAudio
  };
  if (platform !== "google-flow") return { profile, prompt: neutralPrompt.trim(), sourceMode: resolvedSourceMode, settings };
  return {
    profile,
    prompt: neutralPrompt.trim(),
    sourceMode: resolvedSourceMode,
    settings: {
      ...settings,
      flowVideoMode: resolvedSourceMode,
      sourceMode: resolvedSourceMode,
      resultType: "video" as const,
      mode: "video" as const,
      providerMode: "video" as const,
      flowResultType: "video" as const,
      // Native Flow v2 is the active executor. The custom app stays pending
      // and can only be selected explicitly when its runtime is ready.
      flowExecutor: "flow-ui-direct-v2" as const,
      modelDisplayName: quality === "quality" ? "Veo 3.1 - Quality" : "Omni Flash",
      outputResolution: quality === "quality" ? "1080p" as const : "720p" as const
    }
  };
}
