function nextPipelineStep(readiness) {
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

function structuredTaskArtifactReady(task, readiness) {
  if (["story_development", "story_foundation"].includes(task || "")) return readiness.foundationReady;
  if (task === "story_architecture") return readiness.architectureReady;
  if (task === "screenplay_scene") return readiness.screenplayReady;
  if (task === "shot_breakdown") return readiness.shotBreakdownReady;
  return false;
}

module.exports = { nextPipelineStep, structuredTaskArtifactReady };
