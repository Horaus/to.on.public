import type { Scene, Shot } from "@studio/types";

type PipelineStepId = "setup" | "foundation" | "architecture" | "screenplay" | "shots" | "character" | "prompts" | "storyboard" | "video" | "review";
type PipelineRunState = { mode: "step" | "full"; running: boolean; currentStep?: PipelineStepId; message: string; startedAt: string };
type PendingStoryboardQueue = { sequenceId: string; projectId: string; providerId: string; sessionKey: string; items: Array<{ scene: Scene; shot: Shot; sourceAssetId?: string }>; nextIndex: number; previousJobId?: string; repairAspectRatio?: "9:16" | "16:9" | "4:3" | "3:4" | "1:1"; mode?: "scene_frames" | "shot_keyframes" };

const RUNTIME_KEY_PREFIX = "studio.pipeline-runtime.v1.";
export function runtimeKey(projectId: string) { return `${RUNTIME_KEY_PREFIX}${projectId}`; }
export function readPipelineRuntime(storage: Storage | undefined, projectId: string): { run: PipelineRunState | null; storyboardQueue: PendingStoryboardQueue | null } {
  if (!storage || !projectId) return { run: null, storyboardQueue: null };
  try {
    const value = JSON.parse(storage.getItem(runtimeKey(projectId)) || "null");
    if (!value || value.projectId !== projectId) return { run: null, storyboardQueue: null };
    return { run: value.run || null, storyboardQueue: value.storyboardQueue || null };
  } catch { return { run: null, storyboardQueue: null }; }
}
export function writePipelineRuntime(storage: Storage | undefined, projectId: string, value: { run: PipelineRunState | null; storyboardQueue: PendingStoryboardQueue | null }): void {
  if (!storage || !projectId) return;
  if (!value.run && !value.storyboardQueue) storage.removeItem(runtimeKey(projectId));
  else storage.setItem(runtimeKey(projectId), JSON.stringify({ projectId, ...value, updatedAt: new Date().toISOString() }));
}
