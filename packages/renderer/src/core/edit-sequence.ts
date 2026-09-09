import type { Asset, EditSequence, EditSequenceClip, Shot } from "@studio/types";

export function sourceDurationSeconds(asset: Asset | undefined) {
  const value = Number(asset?.durationSeconds ?? asset?.metadata?.durationSeconds ?? asset?.metadata?.duration);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function plannedEditorialDuration(shot: Shot, sourceDuration: number) {
  const activeDuration = Number(shot.timingContract?.estimatedActiveDurationSec);
  return Number.isFinite(activeDuration) && activeDuration > 0
    ? Math.min(sourceDuration, activeDuration)
    : sourceDuration;
}

export function createDefaultEditSequence(projectId: string, shots: Shot[], videoByShot: ReadonlyMap<string, Asset>, timestamp = new Date().toISOString()): EditSequence {
  const clips = [...shots].map((shot, order): EditSequenceClip => {
    const video = videoByShot.get(shot.id);
    const sourceDuration = sourceDurationSeconds(video) ?? shot.durationSec;
    const editorialDuration = plannedEditorialDuration(shot, sourceDuration);
    return {
      id: `edit_clip_${shot.id}`,
      shotId: shot.id,
      sourceAssetId: video?.id,
      order,
      sourceInSec: 0,
      sourceOutSec: editorialDuration,
      timelineDurationSec: editorialDuration,
      segment: 1
    };
  });
  return { id: `edit_sequence_${projectId}`, projectId, revision: 1, clips, createdAt: timestamp, updatedAt: timestamp };
}

export function normalizeEditSequence(sequence: EditSequence, shots: Shot[], assets: Asset[]): EditSequence {
  const shotIds = new Set(shots.map((shot) => shot.id));
  const shotById = new Map(shots.map((shot) => [shot.id, shot]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const clips = sequence.clips
    .filter((clip) => shotIds.has(clip.shotId))
    .sort((a, b) => a.order - b.order)
    .map((clip, order) => {
      const shot = shotById.get(clip.shotId);
      const previousAsset = assetById.get(clip.sourceAssetId || "");
      const currentAsset = shot?.currentVideoAssetId ? assetById.get(shot.currentVideoAssetId) : undefined;
      const targetAsset = currentAsset?.type === "video" ? currentAsset : previousAsset;
      const previousDuration = sourceDurationSeconds(previousAsset) ?? Math.max(0.1, Number(clip.sourceOutSec) || 0.1);
      const sourceDuration = sourceDurationSeconds(targetAsset) ?? previousDuration;
      const wasFullSource = !clip.splitFromClipId && Number(clip.sourceInSec || 0) <= 0.001
        && Math.abs(Number(clip.sourceOutSec || 0) - previousDuration) <= 0.05;
      if (shot && wasFullSource) {
        const duration = plannedEditorialDuration(shot, sourceDuration);
        return { ...clip, order, sourceAssetId: targetAsset?.id, sourceInSec: 0, sourceOutSec: duration, timelineDurationSec: duration };
      }
      const sourceInSec = Math.max(0, Math.min(sourceDuration - 0.1, Number(clip.sourceInSec) || 0));
      const sourceOutSec = Math.max(sourceInSec + 0.1, Math.min(sourceDuration, Number(clip.sourceOutSec) || sourceDuration));
      return { ...clip, order, sourceAssetId: targetAsset?.id || clip.sourceAssetId, sourceInSec, sourceOutSec, timelineDurationSec: sourceOutSec - sourceInSec };
    });
  const representedShotIds = new Set(clips.map((clip) => clip.shotId));
  for (const shot of shots) {
    if (representedShotIds.has(shot.id)) continue;
    const video = assets
      .filter((asset) => asset.type === "video" && (asset.shotId === shot.id || shot.assetIds.includes(asset.id)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const duration = plannedEditorialDuration(shot, sourceDurationSeconds(video) ?? shot.durationSec);
    clips.push({ id: `edit_clip_${shot.id}`, shotId: shot.id, sourceAssetId: video?.id, order: clips.length, sourceInSec: 0, sourceOutSec: duration, timelineDurationSec: duration, segment: 1 });
  }
  return { ...sequence, clips };
}

export function reorderSequenceClips(clips: EditSequenceClip[], clipId: string, targetIndex: number) {
  const next = [...clips].sort((a, b) => a.order - b.order);
  const currentIndex = next.findIndex((clip) => clip.id === clipId);
  if (currentIndex < 0) return next;
  const [clip] = next.splice(currentIndex, 1);
  next.splice(Math.max(0, Math.min(next.length, targetIndex)), 0, clip);
  return next.map((item, order) => ({ ...item, order }));
}

export function trimSequenceClip(clip: EditSequenceClip, edge: "start" | "end", seconds: number, sourceDuration: number) {
  const minimum = 0.1;
  if (edge === "start") {
    const sourceInSec = Math.max(0, Math.min(clip.sourceOutSec - minimum, seconds));
    return { ...clip, sourceInSec, timelineDurationSec: clip.sourceOutSec - sourceInSec };
  }
  const sourceOutSec = Math.max(clip.sourceInSec + minimum, Math.min(sourceDuration, seconds));
  return { ...clip, sourceOutSec, timelineDurationSec: sourceOutSec - clip.sourceInSec };
}

export function splitSequenceClip(clips: EditSequenceClip[], clipId: string, localSeconds: number, suffix = Date.now().toString()) {
  return clips.flatMap((clip) => {
    if (clip.id !== clipId || localSeconds < 0.1 || localSeconds > clip.timelineDurationSec - 0.1) return [clip];
    const splitAt = clip.sourceInSec + localSeconds;
    return [
      { ...clip, id: `${clip.id}:a:${suffix}`, sourceOutSec: splitAt, timelineDurationSec: localSeconds, splitFromClipId: clip.id },
      { ...clip, id: `${clip.id}:b:${suffix}`, sourceInSec: splitAt, timelineDurationSec: clip.sourceOutSec - splitAt, splitFromClipId: clip.id, segment: clip.segment + 1 }
    ];
  }).map((clip, order) => ({ ...clip, order }));
}
