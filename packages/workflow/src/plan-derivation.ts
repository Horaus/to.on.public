import { getProviderVideoDurationPolicy, planProviderShotDurations, recommendedProviderShotCount } from "@studio/domain/duration-policy";
import type { Character, ProviderPlatform, Scene, Shot } from "@studio/types";
import { buildPlannedScenes, buildPlannedShots } from "./plan-derivation-builders";

export type PlanPayload = { projectId: string; storySeed: string; scenes: Scene[]; shots: Shot[]; characters?: Character[] };


export function derivePlan(projectId: string, storySeed: string, targetDurationSec = 30, videoProviderPlatform: ProviderPlatform = "google-flow", outputLanguage = "Vietnamese"): PlanPayload {
  const sentences = storySeed
    .split(/[.!?]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const shotCount = recommendedProviderShotCount(videoProviderPlatform, targetDurationSec);
  const sceneCount = Math.min(3, shotCount);
  const durationPolicy = getProviderVideoDurationPolicy(videoProviderPlatform);
  const plannedDurations = planProviderShotDurations(videoProviderPlatform, targetDurationSec, shotCount);
  const vietnamese = outputLanguage.toLowerCase().includes("vietnam");
  const fallbackBeats = fallbackPlanBeats(storySeed, vietnamese);
  const beats = Array.from({ length: sceneCount }, (_, index) => sentences[index] || fallbackBeats[index] || `Progression beat ${index + 1}`);
  const planContext = { projectId, beats, sceneCount, vietnamese, shotCount, plannedDurations, preferredDurationSec: durationPolicy.preferredDurationSec };
  const scenes = buildPlannedScenes(planContext);
  const shots = buildPlannedShots(planContext, scenes);
  return { projectId, storySeed, scenes, shots };
}

function fallbackPlanBeats(storySeed: string, vietnamese: boolean) {
  return vietnamese ? [
    storySeed,
    "Nhân vật chính quan sát môi trường để tìm manh mối",
    "Một chuyển động nhỏ làm lộ ra trở ngại tiếp theo",
    "Nhân vật chính đưa ra lựa chọn an toàn và dứt khoát",
    "Hành động cuối cùng giải quyết mục tiêu trước mắt"
  ] : [
    storySeed,
    "The lead character studies the environment for a clue",
    "A small motion reveals the next conflict",
    "The lead makes a decisive safe choice",
    "The final action resolves the immediate goal"
  ];
}
