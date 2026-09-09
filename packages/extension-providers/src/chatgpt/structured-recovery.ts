import { extractBalancedJsonObject } from "./text-normalization";

function storyCandidateIsSchemaEcho(parsed: Record<string, unknown>): boolean {
  const placeholders = new Set(["one concise sentence", "primary subject name or stable label", "short scene title", "one visually observable action"]);
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  const characters = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const requirements = Array.isArray(parsed?.visualRequirements) ? parsed.visualRequirements : [];
  return placeholders.has(String(parsed?.logline || "").trim().toLowerCase())
    || characters.some((character: { name?: string }) => placeholders.has(String(character?.name || "").trim().toLowerCase()))
    || scenes.some((scene: { title?: string; shots?: Array<{ description?: string }> }) => placeholders.has(String(scene?.title || "").trim().toLowerCase()) || (scene?.shots || []).some((shot) => placeholders.has(String(shot?.description || "").trim().toLowerCase())))
    || requirements.some((requirement: { role?: string }) => String(requirement?.role || "").includes(","));
}

function validStoryCandidateShape(parsed: Record<string, unknown>): boolean {
  return Boolean(parsed.logline && parsed.story && Array.isArray(parsed.scenes) && parsed.scenes.length >= 1 && parsed.scenes.every((scene: { shots?: unknown[] }) => Array.isArray(scene?.shots) && scene.shots.length >= 1));
}

export function isCompleteStoryJsonCandidate(candidate: string): boolean {
  if (!candidate) return false;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return Boolean(parsed && typeof parsed === "object" && validStoryCandidateShape(parsed) && !storyCandidateIsSchemaEcho(parsed));
  } catch {
    return false;
  }
}

const structuredTaskValidators: Record<string, (parsed: Record<string, any>) => boolean> = {
  story_foundation: (parsed) => Boolean(parsed.sourceAnalysis && Array.isArray(parsed.adaptationDecisions) && parsed.narrativeContract && Array.isArray(parsed.characters) && parsed.logline && parsed.story),
  story_architecture: (parsed) => {
    const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    return Boolean(Array.isArray(parsed.visualRequirements) && parsed.visualRequirements.length > 0 && scenes.length > 0 && scenes.every((scene: { shots?: unknown }) => scene.shots === undefined));
  },
  shot_breakdown: (parsed) => Array.isArray(parsed.shots) && parsed.shots.length > 0,
  screenplay_scene: (parsed) => Boolean(parsed.screenplayScene)
};

export function isCompleteStructuredJsonCandidate(candidate: string, task = "story_development"): boolean {
  if (!candidate) return false;
  if (task === "story_development") return isCompleteStoryJsonCandidate(candidate);
  try {
    const parsed = JSON.parse(candidate) as Record<string, any>;
    return Boolean(parsed && typeof parsed === "object" && (structuredTaskValidators[task]?.(parsed) ?? true));
  } catch {
    return false;
  }
}

export function isStructuredTask(task = ""): boolean {
  return ["story_development", "story_foundation", "story_architecture", "screenplay_scene", "shot_breakdown"].includes(task);
}

export function hasCompleteStructuredJson(text: string, task: string): boolean {
  const balanced = extractBalancedJsonObject(text);
  if (isCompleteStructuredJsonCandidate(balanced, task)) return true;
  const candidates: string[] = [];
  for (let index = 0; index < text.length; index++) if (text[index] === "{") candidates.push(extractBalancedJsonObject(text.slice(index)));
  if (candidates.some((candidate) => isCompleteStructuredJsonCandidate(candidate, task))) return true;
  // Known structured tasks own an exact root schema. A streamed response can
  // contain a large, balanced nested object (for example sourceAnalysis)
  // while the root JSON is still incomplete. Treating that nested object as a
  // finished response causes the extension to return truncated text.
  if (task === "story_development" || Object.hasOwn(structuredTaskValidators, task)) return false;
  return [balanced, ...candidates].some((candidate) => candidate.length >= 200 && candidate.trim().startsWith("{") && candidate.trim().endsWith("}"));
}

export function extractLatestCompleteStructuredJson(text: string, task: string): string {
  const starts: number[] = [];
  for (let index = 0; index < text.length; index++) if (text[index] === "{") starts.push(index);
  for (let index = starts.length - 1; index >= 0; index--) {
    const candidate = extractBalancedJsonObject(text.slice(starts[index]));
    if (isCompleteStructuredJsonCandidate(candidate, task)) return candidate;
  }
  return "";
}

export function extractLatestCompleteStoryJson(text: string): string {
  const starts = Array.from(text, (character, index) => character === "{" ? index : -1).filter((index) => index >= 0);
  for (const start of starts.reverse()) {
    const candidate = extractBalancedJsonObject(text.slice(start));
    if (isCompleteStoryJsonCandidate(candidate)) return candidate;
  }
  return "";
}
