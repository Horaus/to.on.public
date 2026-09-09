export type PipelineStepId = "setup" | "foundation" | "architecture" | "screenplay" | "shots" | "character" | "prompts" | "storyboard" | "video" | "review";

export type PipelineReadiness = {
  hasBrief: boolean;
  foundationReady: boolean;
  architectureReady: boolean;
  screenplayReady: boolean;
  shotBreakdownReady: boolean;
  promptsReady: boolean;
  characterReady: boolean;
  keyframesReady: boolean;
  videosReady: boolean;
};

export function nextPipelineStep(readiness: PipelineReadiness): PipelineStepId {
  if (!readiness.hasBrief) return "setup";
  if (!readiness.foundationReady) return "foundation";
  if (!readiness.architectureReady) return "architecture";
  if (!readiness.screenplayReady) return "screenplay";
  if (!readiness.shotBreakdownReady) return "shots";
  if (!readiness.promptsReady) return "prompts";
  if (!readiness.characterReady) return "character";
  if (!readiness.keyframesReady) return "storyboard";
  if (!readiness.videosReady) return "video";
  return "review";
}

export function structuredTaskArtifactReady(
  task: string | undefined,
  readiness: Pick<PipelineReadiness, "foundationReady" | "architectureReady" | "screenplayReady" | "shotBreakdownReady">
): boolean {
  if (["story_development", "story_foundation"].includes(task || "")) return readiness.foundationReady;
  if (task === "story_architecture") return readiness.architectureReady;
  if (task === "screenplay_scene") return readiness.screenplayReady;
  if (task === "shot_breakdown") return readiness.shotBreakdownReady;
  return false;
}
