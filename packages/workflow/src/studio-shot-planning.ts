import type { ScreenplayScene } from "@studio/types";

type PlannedCue = {
  id: string;
  kind: "action" | "dialogue" | "sound";
  sequenceOrder: number;
  sourceIndex: number;
  dependsOnCueIds: string[];
};

export type SceneShotCuePacket = {
  index: number;
  cueIds: string[];
};

function atomicCueGroups(scene: ScreenplayScene): string[][] {
  const cueById = new Map(sceneCues(scene).map((cue) => [cue.id, cue]));
  const groups: string[][] = [];
  for (const cueId of orderScreenplayCueIds(scene)) {
    const cue = cueById.get(cueId)!;
    const current = groups.at(-1);
    const currentHasSameAtomicKind = current?.some((id) => {
      const kind = cueById.get(id)?.kind;
      return kind === cue.kind && (kind === "action" || kind === "dialogue");
    });
    if (!current || currentHasSameAtomicKind) groups.push([cueId]);
    else current.push(cueId);
  }
  return groups;
}

export function minimumAtomicShotCount(scene: ScreenplayScene): number {
  return atomicCueGroups(scene).length;
}

export function allocateSceneShotCounts(scenes: ScreenplayScene[], preferredTotal: number): number[] {
  if (!scenes.length) return [];
  const counts = scenes.map(minimumAtomicShotCount);
  const maximums = scenes.map((scene) => orderScreenplayCueIds(scene).length);
  const minimumTotal = counts.reduce((sum, count) => sum + count, 0);
  const maximumTotal = maximums.reduce((sum, count) => sum + count, 0);
  const target = Math.min(Math.max(preferredTotal, minimumTotal), maximumTotal);
  while (counts.reduce((sum, count) => sum + count, 0) < target) {
    const index = scenes.reduce((best, scene, candidate) => {
      if (counts[candidate] >= maximums[candidate]) return best;
      if (best < 0) return candidate;
      const cueCount = scene.actionCues.length + scene.dialogueCues.length + scene.soundCues.length;
      const bestCueCount = scenes[best].actionCues.length + scenes[best].dialogueCues.length + scenes[best].soundCues.length;
      return cueCount / counts[candidate] > bestCueCount / counts[best] ? candidate : best;
    }, -1);
    if (index < 0) break;
    counts[index]++;
  }
  return counts;
}

const ROLE_DURATION_WEIGHT: Record<string, number> = {
  initiation: 0.8, question: 0.8, proposal: 0.9, pressure: 0.75, refusal: 0.75, answer: 0.85,
  interruption: 0.65, reaction: 0.65, revelation: 1.15, confirmation: 0.75, consequence: 1.05,
  command: 0.75, warning: 0.85, permission: 0.9, decision: 0.95, discovery: 1.05,
  verification: 0.9, commitment: 1, resolution: 1.25
};

function sceneCues(scene: ScreenplayScene): PlannedCue[] {
  return [
    ...scene.actionCues.map((cue) => ({ ...cue, kind: "action" as const })),
    ...scene.dialogueCues.map((cue) => ({ ...cue, kind: "dialogue" as const })),
    ...scene.soundCues.map((cue) => ({ ...cue, kind: "sound" as const }))
  ].map((cue, sourceIndex) => ({
      id: cue.id,
      kind: cue.kind,
      sequenceOrder: Number(cue.sequenceOrder || sourceIndex + 1),
      sourceIndex,
      dependsOnCueIds: [...(cue.dependsOnCueIds || []), ...(cue.viewerRequiresCueIds || [])]
    }));
}

export function orderScreenplayCueIds(scene: ScreenplayScene): string[] {
  const cues = sceneCues(scene);
  const graph = buildCueGraph(cues);
  const compare = (left: PlannedCue, right: PlannedCue) => left.sequenceOrder - right.sequenceOrder || left.sourceIndex - right.sourceIndex;
  const ordered = drainCueGraph(cues, graph, compare);
  if (ordered.length !== cues.length) throw new Error(`SCREENPLAY_DEPENDENCY_CONFLICT: scene ${scene.id} contains a causal dependency cycle.`);
  return ordered;
}

function buildCueGraph(cues: PlannedCue[]) {
  const byId = new Map(cues.map((cue) => [cue.id, cue]));
  const indegree = new Map(cues.map((cue) => [cue.id, 0]));
  const outgoing = new Map(cues.map((cue) => [cue.id, [] as string[]]));
  for (const cue of cues) for (const dependencyId of new Set(cue.dependsOnCueIds)) {
    if (!byId.has(dependencyId) || dependencyId === cue.id) continue;
    outgoing.get(dependencyId)?.push(cue.id);
    indegree.set(cue.id, (indegree.get(cue.id) || 0) + 1);
  }
  return { byId, indegree, outgoing };
}

function drainCueGraph(cues: PlannedCue[], graph: ReturnType<typeof buildCueGraph>, compare: (left: PlannedCue, right: PlannedCue) => number) {
  const { byId, indegree, outgoing } = graph;
  const ready = cues.filter((cue) => indegree.get(cue.id) === 0).sort(compare);
  const ordered: string[] = [];
  while (ready.length) {
    const cue = ready.shift()!;
    ordered.push(cue.id);
    for (const nextId of outgoing.get(cue.id) || []) {
      indegree.set(nextId, (indegree.get(nextId) || 0) - 1);
      if (indegree.get(nextId) === 0) { ready.push(byId.get(nextId)!); ready.sort(compare); }
    }
  }
  return ordered;
}

export function planSceneShotCuePackets(scene: ScreenplayScene, shotCount: number): SceneShotCuePacket[] {
  const orderedCueIds = orderScreenplayCueIds(scene);
  if (!Number.isInteger(shotCount) || shotCount < 1) throw new Error("Shot count must be a positive integer.");
  if (orderedCueIds.length < shotCount) {
    throw new Error(`SHOT_PACKET_UNDERFLOW: scene ${scene.id} has ${orderedCueIds.length} cues for ${shotCount} required shots.`);
  }
  const groups = atomicCueGroups(scene);
  if (groups.length > shotCount) {
    throw new Error(`SHOT_ATOMICITY_OVERFLOW: scene ${scene.id} requires at least ${groups.length} shots for ${shotCount} action/dialogue-safe packets.`);
  }
  while (groups.length < shotCount) {
    const splitIndex = groups.reduce((best, group, index) => group.length > groups[best].length ? index : best, 0);
    const group = groups[splitIndex];
    if (group.length < 2) throw new Error(`SHOT_PACKET_UNDERFLOW: scene ${scene.id} cannot produce ${shotCount} non-empty packets.`);
    const midpoint = Math.ceil(group.length / 2);
    groups.splice(splitIndex, 1, group.slice(0, midpoint), group.slice(midpoint));
  }
  return groups.map((cueIds, index) => ({ index, cueIds }));
}

export function sceneShotPacketWeights(scene: ScreenplayScene, packets: SceneShotCuePacket[]): number[] {
  const cues = new Map<string, { semanticRole?: string }>([
    ...scene.actionCues.map((cue) => [cue.id, cue] as const),
    ...scene.dialogueCues.map((cue) => [cue.id, cue] as const),
    ...scene.soundCues.map((cue) => [cue.id, cue] as const)
  ]);
  const dialogueById = new Map(scene.dialogueCues.map((cue) => [cue.id, cue]));
  return packets.map((packet) => {
    const roleWeight = Math.max(...packet.cueIds.map((cueId) => ROLE_DURATION_WEIGHT[cues.get(cueId)?.semanticRole || ""] || 0.8));
    const dialogueTokens = packet.cueIds.reduce((sum, cueId) => sum + String(dialogueById.get(cueId)?.line || "").trim().split(/\s+/).filter(Boolean).length, 0);
    // Weight spoken packets by the actual conservative provider budget so the
    // duration planner gives longer slots to longer locked lines.
    const speechSeconds = dialogueTokens > 0 ? (dialogueTokens + 1) / 2 : 0;
    return Math.max(roleWeight, speechSeconds);
  });
}

export function sceneShotPacketSpeechMinimums(scene: ScreenplayScene, packets: SceneShotCuePacket[]): number[] {
  const dialogueById = new Map(scene.dialogueCues.map((cue) => [cue.id, cue]));
  return packets.map((packet) => {
    const words = packet.cueIds.reduce((sum, cueId) => sum + String(dialogueById.get(cueId)?.line || "").trim().split(/\s+/).filter(Boolean).length, 0);
    return words > 0 ? (words + 1) / 2 : 0;
  });
}
