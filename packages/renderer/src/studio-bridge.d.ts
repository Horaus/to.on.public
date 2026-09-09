import type { RunJobRequest } from "@studio/types/job-request";
import type { Asset, AutomationJob, Character, Project, ProjectIntake, Scene, Shot, StyleBible, StudioState, VideoEditorialReview } from "@studio/types";
import type { BridgeStatus, ReferenceUploadPayload, SkillDoc } from "@studio/workflow/studio-types";
import type { RunJobPayload } from "@studio/domain/job-contracts";

declare global {
  interface Window {
    studioBridge?: {
      getWindowMode?: () => Promise<{ mode: "compact" | "maximized"; bounds: { x: number; y: number; width: number; height: number }; displayId?: string; compactViewportSupported: boolean }>;
      setWindowMode?: (mode: "compact" | "maximized") => Promise<{ mode: "compact" | "maximized"; bounds: { x: number; y: number; width: number; height: number }; displayId?: string; compactViewportSupported: boolean }>;
      getState: () => Promise<StudioState>;
      getBridgeStatus: () => Promise<BridgeStatus>;
      approveBridgePairing?: (payload: { extensionInstanceId: string; code: string }) => Promise<{ ok: boolean; code?: string }>;
      getSkills: () => Promise<SkillDoc[]>;
      probeMedia: (assetId: string) => Promise<{ filePath: string; durationSeconds?: number; formatName?: string; sizeBytes?: number; streams: Array<{ index: number; type?: string; codec?: string; width?: number; height?: number; frameRate?: number; sampleRate?: number; channels?: number; rotation: number }> }>;
      runJob: (payload: RunJobPayload) => Promise<StudioState>;
      applyPlan: (payload: { projectId: string; storySeed: string; scenes: Scene[]; shots: Shot[]; characters?: Character[] }) => Promise<StudioState>;
      updateShot: (patch: Partial<Shot> & { id: string }) => Promise<StudioState>;
      updateScene: (patch: Partial<Scene> & { id: string }) => Promise<StudioState>;
      updateCharacter: (patch: Partial<Character> & { id: string }) => Promise<StudioState>;
      updateProject: (projectId: string, patch: Partial<Project>) => Promise<StudioState>;
      updateStyleBible: (styleBibleId: string, patch: Partial<StyleBible>) => Promise<StudioState>;
      createProject: (payload: { name: string; sourceDraft?: string; intake?: ProjectIntake }) => Promise<StudioState>;
      selectProject: (projectId: string) => Promise<StudioState>;
      addReference: (payload: ReferenceUploadPayload) => Promise<StudioState>;
      promoteReferenceToShot: (payload: { projectId: string; shotId: string; referenceId: string; aspectRatio?: string }) => Promise<{ ok: boolean; assetId: string; reused?: boolean; state: StudioState }>;
      removeReference: (referenceId: string) => Promise<StudioState>;
      removeAsset: (assetId: string) => Promise<StudioState>;
      approveAsset: (assetId: string) => Promise<StudioState>;
      recoverJob: (jobId: string) => Promise<StudioState>;
      cancelProjectJobs: (projectId: string) => Promise<StudioState>;
      openAsset: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
      openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
      saveAsset: (payload: { assetId: string; sourcePath?: string; suggestedName?: string }) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }>;
      saveVideoPoster: (payload: { assetId: string; dataUrl: string }) => Promise<StudioState>;
      saveVideoReviewFrame: (payload: { assetId: string; kind: "first" | "last"; dataUrl: string; timeSeconds: number }) => Promise<StudioState>;
      updateVideoReview: (payload: { assetId: string; review: Omit<VideoEditorialReview, "reviewedAt"> }) => Promise<StudioState>;
      exportSequence: (payload: { projectId: string; draft: boolean; width?: number; height?: number; frameRate?: number }) => Promise<StudioState>;
      cancelExport: (jobId: string) => Promise<StudioState>;
      generateVoiceClip: (payload: { projectId: string; shotId?: string; characterId: string; text?: string; preview?: boolean }) => Promise<StudioState>;
      generateSoundBed: (payload: { projectId: string; kind: "rain" | "machine" | "horn"; timelineStartSec: number; durationSec: number; label?: string; shotId?: string; gain?: number }) => Promise<StudioState>;
      onState: (callback: (state: StudioState) => void) => () => void;
      onBridge: (callback: (status: BridgeStatus) => void) => () => void;
    };
  }
}

export {};
