type ProviderPlatform = string;

export type ProviderVideoDurationPolicy = { supportedDurationsSec: number[]; preferredDurationSec: number };

const DEFAULT_POLICY: ProviderVideoDurationPolicy = { supportedDurationsSec: [], preferredDurationSec: 6 };
const POLICIES: Partial<Record<ProviderPlatform, ProviderVideoDurationPolicy>> = {
  "google-flow": { supportedDurationsSec: [4, 6, 8, 10], preferredDurationSec: 8 }
};

export function getProviderVideoDurationPolicy(provider: ProviderPlatform): ProviderVideoDurationPolicy {
  return POLICIES[provider] ?? DEFAULT_POLICY;
}

export function resolveProviderVideoDuration(provider: ProviderPlatform, timelineDurationSec: number): number {
  const requested = Number.isFinite(timelineDurationSec) && timelineDurationSec > 0 ? timelineDurationSec : 6;
  const ladder = getProviderVideoDurationPolicy(provider).supportedDurationsSec;
  if (!ladder.length) return requested;
  return ladder.find((duration) => requested <= duration) ?? ladder.at(-1) ?? requested;
}

export function recommendedProviderShotCount(provider: ProviderPlatform, targetDurationSec: number): number {
  const policy = getProviderVideoDurationPolicy(provider);
  const minimumDuration = policy.supportedDurationsSec[0] ?? 4;
  // Keep this aligned with the desktop runtime: sub-20s projects may use one
  // or two provider shots, while longer projects need at least three narrative
  // beats. The previous floor-based branch produced 3 scenes for a 12s Flow
  // project, while the runtime validator correctly expected 2.
  const narrativeMinimum = targetDurationSec >= 20 ? 3 : 1;
  return Math.max(narrativeMinimum, Math.round(targetDurationSec / policy.preferredDurationSec));
}

export function planProviderShotDurations(provider: ProviderPlatform, targetDurationSec: number, shotCount = recommendedProviderShotCount(provider, targetDurationSec)): number[] {
  const policy = getProviderVideoDurationPolicy(provider);
  const ladder = policy.supportedDurationsSec;
  if (!ladder.length) return Array.from({ length: shotCount }, () => Math.max(1, targetDurationSec / shotCount));
  const durations = Array.from({ length: shotCount }, () => policy.preferredDurationSec);
  for (let pass = 0; pass < shotCount * 2; pass++) {
    const total = durations.reduce((sum, value) => sum + value, 0);
    const currentError = Math.abs(targetDurationSec - total);
    let best: { index: number; duration: number; error: number } | undefined;
    for (const [index, current] of durations.entries()) for (const duration of ladder) {
      const error = Math.abs(targetDurationSec - (total - current + duration));
      if (error < currentError && (!best || error < best.error || (error === best.error && Math.abs(duration - policy.preferredDurationSec) < Math.abs(best.duration - policy.preferredDurationSec)))) best = { index, duration, error };
    }
    if (!best) break;
    durations[best.index] = best.duration;
  }
  return durations.sort((left, right) => left - right);
}

export function planProviderShotDurationsByWeights(provider: ProviderPlatform, targetDurationSec: number, weights: number[], minimumDurationsSec: number[] = []): number[] {
  if (!weights.length) return [];
  const policy = getProviderVideoDurationPolicy(provider);
  const ladder = policy.supportedDurationsSec;
  if (!ladder.length) return weightedDurationsWithoutLadder(targetDurationSec, weights, minimumDurationsSec);
  const ideals = weightedDurationIdeals(targetDurationSec, weights);
  const states = weightedDurationStates(ideals, ladder, minimumDurationsSec);
  return [...states.entries()].sort(([leftTotal, left], [rightTotal, right]) => Math.abs(targetDurationSec - leftTotal) - Math.abs(targetDurationSec - rightTotal) || left.cost - right.cost)[0]?.[1].durations || planProviderShotDurations(provider, targetDurationSec, weights.length);
}

function weightedDurationsWithoutLadder(targetDurationSec: number, weights: number[], minimumDurationsSec: number[]) {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0.1, weight), 0);
  return weights.map((weight, index) => Math.max(minimumDurationsSec[index] || 0, targetDurationSec * Math.max(0.1, weight) / totalWeight));
}

function weightedDurationIdeals(targetDurationSec: number, weights: number[]) {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0.1, weight), 0);
  return weights.map((weight) => targetDurationSec * Math.max(0.1, weight) / totalWeight);
}

function weightedDurationStates(ideals: number[], ladder: number[], minimumDurationsSec: number[]) {
  let states = new Map<number, { durations: number[]; cost: number }>([[0, { durations: [], cost: 0 }]]);
  for (const [index, ideal] of ideals.entries()) {
    const next = new Map<number, { durations: number[]; cost: number }>();
    for (const [total, candidate] of states) for (const duration of ladder.filter((value) => value >= (minimumDurationsSec[index] || 0))) {
      const repeatsPrevious = candidate.durations.at(-1) === duration;
      const repeatedPenalty = repeatsPrevious && candidate.durations.at(-2) === duration ? 6 : repeatsPrevious ? 1 : 0;
      const cost = candidate.cost + Math.pow(duration - ideal, 2) + repeatedPenalty;
      const nextTotal = total + duration;
      const existing = next.get(nextTotal);
      if (!existing || cost < existing.cost) next.set(nextTotal, { durations: [...candidate.durations, duration], cost });
    }
    states = next;
    if (index > 30) break;
  }
  return states;
}
