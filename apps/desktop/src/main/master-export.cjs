function prepareMasterExportClips({ sequence, assets, shots = [], draft, localPathFromAsset, fileExists }) {
  if (!sequence?.clips?.length) throw new Error("A persisted edit sequence is required before export.");
  return sequence.clips.slice().sort((a, b) => a.order - b.order).map((clip) => {
    // Older edit sequences identify their source by shotId. Resolve the same
    // shot-owned video before validating the export so historical projects
    // remain publishable after editorial review.
    const linkedAsset = assets.find((item) => item.id === clip.sourceAssetId);
    const asset = linkedAsset?.type === "video" ? linkedAsset :
      (clip.shotId ? assets.filter((item) => item.type === "video" && item.shotId === clip.shotId).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0] : undefined);
    const filePath = asset ? localPathFromAsset(asset) : "";
    if (!asset || asset.type !== "video" || !filePath || !fileExists(filePath)) throw new Error(`Missing source video for edit clip ${clip.id}.`);
    if (!(Number(clip.sourceOutSec) > Number(clip.sourceInSec))) throw new Error(`Invalid source range for edit clip ${clip.id}.`);
    return { id: clip.id, assetId: asset.id, filePath, sourceInSec: clip.sourceInSec, sourceOutSec: clip.sourceOutSec };
  });
}

module.exports = { prepareMasterExportClips };
