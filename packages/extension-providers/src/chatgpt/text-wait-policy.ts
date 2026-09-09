export type TextReasoningTier = "instant" | "medium" | "high";
export type TextWaitPolicy = { tier: TextReasoningTier; hardWaitMs: number; inactiveWaitMs: number };
export function resolveTextWaitPolicy(task = "", promptLength = 0, maxWaitMs = 120000): TextWaitPolicy {
  const instantTasks = new Set(["connection_test", "quick_visual_analysis", "translation", "prompt_enhance", "story_foundation", "story_architecture", "screenplay_scene", "shot_breakdown"]);
  const mediumTasks = new Set(["production_graph_revision"]);
  const tier: TextReasoningTier = instantTasks.has(task) ? "instant" : mediumTasks.has(task) ? "medium" : promptLength >= 16000 ? "high" : "medium";
  // Instant work is intentionally bounded: a stalled browser response must
  // release the pipeline instead of occupying a job indefinitely. Medium and
  // high tiers keep longer windows for deliberate reasoning.
  const defaults = tier === "high" ? { hardWaitMs: 1200000, inactiveWaitMs: 480000 } : tier === "medium" ? { hardWaitMs: 600000, inactiveWaitMs: 240000 } : { hardWaitMs: 120000, inactiveWaitMs: 60000 };
  return { tier, hardWaitMs: Math.max(maxWaitMs, defaults.hardWaitMs), inactiveWaitMs: defaults.inactiveWaitMs };
}
