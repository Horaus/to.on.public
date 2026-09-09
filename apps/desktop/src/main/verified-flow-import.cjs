const path = require("node:path");

function importVerifiedFlowVideo(payload, deps) {
  const { fs, dataRoot, id, now, getState, mutateState, saveState, toStudioMediaUrl } = deps;
  const projectId = String(payload?.projectId || "");
  const shotId = String(payload?.shotId || "");
  const sourcePath = String(payload?.sourcePath || "");
  const providerJobId = String(payload?.providerJobId || "");
  const flowMediaId = String(payload?.flowMediaId || "");
  const flowTileId = String(payload?.flowTileId || "");
  if (!projectId || !shotId || !sourcePath || !providerJobId || !flowMediaId || !flowTileId) {
    throw new Error("Verified Flow import requires project, shot, source, providerJobId, flowMediaId, and flowTileId.");
  }
  if (!fs.existsSync(sourcePath)) throw new Error("Verified Flow video file does not exist.");
  const state = getState();
  const shot = state.shots.find((item) => {
    if (item.id !== shotId) return false;
    const scene = state.scenes.find((candidate) => candidate.id === item.sceneId);
    return scene?.projectId === projectId || item.projectId === projectId;
  });
  if (!shot) throw new Error("Target shot was not found in the selected project.");
  const destinationDir = path.join(dataRoot, "projects", projectId, "videos");
  fs.mkdirSync(destinationDir, { recursive: true });
  const assetId = id("asset");
  const destination = path.join(destinationDir, `${assetId}.mp4`);
  fs.copyFileSync(sourcePath, destination);
  const timestamp = now();
  const asset = {
    id: assetId, projectId, sceneId: shot.sceneId, shotId, type: "video",
    filePath: toStudioMediaUrl(destination), sourceProvider: "google-flow",
    sourceJobId: String(payload.jobId || "verified-flow-import"),
    width: Number(payload.width) || 720, height: Number(payload.height) || 1280,
    durationSeconds: Number(payload.durationSeconds) || 0,
    metadata: {
      providerJobId, flowMediaId, flowTileId,
      flowResultUrl: String(payload.flowResultUrl || ""),
      flowCustomToolExecutor: String(payload.flowCustomToolExecutor || "chrome-cdp-v1"),
      startFrameAssetId: String(payload.startFrameAssetId || ""),
      startFrameValidation: { passed: true, source: "verified-flow-import" },
      aspectRatio: String(payload.aspectRatio || "9:16"),
      durationSec: Number(payload.durationSeconds) || 0,
      verifiedAt: timestamp, verificationSource: "google-flow-edit-route"
    },
    createdAt: timestamp
  };
  let result;
  mutateState((draft) => {
    draft.assets.push(asset);
    if (!shot.assetIds.includes(assetId)) shot.assetIds.push(assetId);
    shot.status = "review";
    const job = payload.jobId ? draft.jobs.find((item) => item.id === payload.jobId) : undefined;
    if (job) {
      job.status = "review_required"; job.statusMessage = "Verified Google Flow video imported from the provider edit route.";
      job.progress = 1; job.resultAssetIds = Array.from(new Set([...(job.resultAssetIds || []), assetId]));
      job.providerJobId = providerJobId; job.flowMediaId = flowMediaId; job.flowTileId = flowTileId; job.updatedAt = timestamp;
    }
    result = { assetId, jobId: payload.jobId || undefined, status: job?.status || "review_required", filePath: asset.filePath };
  }, { reason: "verified-flow-video-import", projectId, shotId, assetId });
  saveState();
  return result;
}

module.exports = { importVerifiedFlowVideo };
