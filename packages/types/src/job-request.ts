import type { ProviderPlatform, QualityFailureOwner } from "./index";

export type RunJobRequest = {
  type: "RUN_JOB"; jobId: string; provider: ProviderPlatform;
  task: "connection_test" | "quick_visual_analysis" | "story_development" | "story_foundation" | "story_architecture" | "screenplay_scene" | "shot_breakdown" | "production_graph_revision" | "translation" | "prompt_enhance" | "text_to_image" | "image_to_video" | "download";
  prompt: string; conversationUrl?: string;
  references: Array<{ assetId: string; filePath: string; base64?: string; mimeType?: string; filename?: string; referenceRole?: "shot_keyframe" | "character_identity" | "character_detail" | "setting" | "prop" | "style"; referenceLabel?: string }>;
  settings: {
    aspectRatio: "9:16" | "16:9" | "4:3" | "3:4" | "1:1"; durationSec: number; timelineDurationSec?: number; quality: "fast" | "balanced" | "high"; modelDisplayName?: string; generateAudio?: boolean;
    characterVoice?: { characterId: string; characterName: string; provider: "google-flow"; voiceId: string; voiceName: string; lockedAt: string };
    flowProjectUrl?: string; providerWorkspaceUrl?: string;
    outputResolution?: "720p" | "1080p"; newConversation?: boolean; sessionKey?: string; characterSlot?: string; characterName?: string; referenceUse?: string; referenceRole?: string; directReferenceUse?: string; directReferenceNote?: string; referenceRequirementId?: string; reusePreviousContext?: boolean; storyboardSceneOrder?: number; storyboardSceneCount?: number; storyboardSequenceId?: string; storyboardMode?: "scene_frames" | "shot_keyframes"; repairAspectRatio?: "9:16" | "16:9" | "4:3" | "3:4" | "1:1"; sourceAssetId?: string; resultType?: "image" | "video" | "text"; mode?: "image" | "video" | "text"; providerMode?: "image" | "video" | "text"; flowResultType?: "image" | "video"; flowVideoMode?: "components" | "frames"; sourceMode?: "components" | "frames"; flowExecutor?: "custom-tool-v1" | "flow-ui-direct-v2"; startFrameAssetId?: string; identityReferenceAssetIds?: string[]; outputLanguage?: string; sourceLanguage?: string; targetLanguage?: string; preflightOnly?: boolean; idempotencyKey?: string;
    shotSpec?: { camera: string; durationSec: number; action: string; dialogue: string; notes: string; timeline: Array<{ startSec: number; endSec: number; action: string; camera: string; dialogue: string; speaker: string }> };
    preflightValidation?: { valid: boolean; shotId: string; issues: Array<{ code: string; severity: "error" | "warning"; message: string; repair: string; owner: QualityFailureOwner }>; dominantAction: string; transformationKinds: string[]; spokenWordCount: number; spokenWordBudget: number; promptHash: string; referenceHashes: string[]; idempotencyKey: string; providerRoute: string; estimatedSubmits: number };
    projectId?: string; shotId?: string; screenplaySchemaVersion?: number; screenplaySceneId?: string; screenplayCueIds?: string[]; shotDurationsSec?: number[]; shotOrderStart?: number; shotBatchIndex?: number; shotBatchCount?: number; projectShotCount?: number; projectRuntimeSec?: number;
  };
  download: { auto: boolean; targetFolder: string; filenameTemplate: string };
};
