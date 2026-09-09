type AssetLike = { id: string; type: string; filePath?: string; projectId?: string; sourceJobId?: string; sourceProvider?: string; createdAt: string; assetIds?: string[]; currentVideoAssetId?: string; metadata?: any };
type AutomationJobLike = { id: string; jobType?: string; shotId?: string; resultAssetIds: string[]; input?: unknown };
type ProjectIntakeLike = { videoFrame?: { aspectRatio?: string } };
type ShotLike = { id: string; assetIds: string[]; currentVideoAssetId?: string };
type VideoAspectRatio=NonNullable<ProjectIntakeLike["videoFrame"]>["aspectRatio"];
type ProviderJobInput={ bridgeMessage?: { task?: string;settings?: { aspectRatio?: string;startFrameAssetId?: string };references?: Array<{ assetId?: string }> } };

export function getAssetAspectRatio<T extends AssetLike>(asset: T|undefined,jobs: AutomationJobLike[]): VideoAspectRatio|undefined {
  if (!asset) return undefined;
  const aspect=asset.metadata?.aspectRatio;
  if (aspect==="9:16"||aspect==="16:9"||aspect==="1:1") return aspect;
  const sourceJob=jobs.find((job)=>job.id===asset.sourceJobId);
  const settingsAspect=(sourceJob?.input as ProviderJobInput|undefined)?.bridgeMessage?.settings?.aspectRatio;
  return settingsAspect==="9:16"||settingsAspect==="16:9"||settingsAspect==="1:1"?settingsAspect:undefined;
}

export function assetAspectMismatched<T extends AssetLike>(asset: T|undefined,jobs: AutomationJobLike[],targetAspectRatio: VideoAspectRatio) {
  const assetAspectRatio=getAssetAspectRatio(asset,jobs);
  return Boolean(assetAspectRatio&&assetAspectRatio!==targetAspectRatio);
}

export function isShotKeyframeAsset<T extends AssetLike>(asset: T,jobs: AutomationJobLike[]) {
  if (asset.type!=="image") return false;
  const sourceJob=jobs.find((job)=>job.id===asset.sourceJobId);
  if (!sourceJob) return true;
  const input=sourceJob.input as ProviderJobInput|undefined;
  return sourceJob.jobType==="image"&&input?.bridgeMessage?.task==="text_to_image";
}

export function shotKeyframeAssets<T extends AssetLike>(assets: T[],shot: ShotLike,jobs: AutomationJobLike[]) {
  return assets.filter((asset)=>shot.assetIds.includes(asset.id)&&isShotKeyframeAsset(asset,jobs)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

export function isLikelyEphemeralMediaUrl(filePath="") {
  const decoded=(()=>{ try { return decodeURIComponent(new URL(filePath).pathname); } catch { try { return decodeURIComponent(filePath); } catch { return filePath; } } })();
  return /\/playwright-artifacts-[^/]+\//.test(decoded);
}

export function assetShotId<T extends AssetLike>(asset: T) {
  return (asset as T&{ shotId?: string }).shotId;
}

export function flowJobStartFrameAssetId(job: AutomationJobLike|undefined) {
  const message=(job?.input as ProviderJobInput|undefined)?.bridgeMessage;
  return message?.settings?.startFrameAssetId||message?.references?.[0]?.assetId;
}

function isVerifiedFlowVideoAsset<T extends AssetLike>(asset: T,shot: ShotLike,job: AutomationJobLike|undefined,availableAssets?: T[]) {
  if (!hasCurrentFlowAssetIdentity(asset, shot) || !job || job.shotId !== shot.id) return false;
  const expectedStartFrameAssetId=flowJobStartFrameAssetId(job);
  const assetStartFrameAssetId=asset.metadata?.startFrameAssetId;
  const startFrameAsset=availableAssets?.find((candidate)=>candidate.id===assetStartFrameAssetId);
  return hasExpectedFlowStartFrame(expectedStartFrameAssetId, assetStartFrameAssetId, shot, asset, availableAssets, startFrameAsset);
}

function hasCurrentFlowAssetIdentity<T extends AssetLike>(asset: T, shot: ShotLike) {
  return !asset.metadata?.recoveredFromAdjacentOlderBaseline && !asset.metadata?.attachedFromDuplicateFlowRecovery
    && assetShotId(asset) === shot.id && Boolean(asset.metadata?.currentJobOnly && asset.metadata?.studioJobId);
}

function hasExpectedFlowStartFrame<T extends AssetLike>(expectedId: string | undefined, actualId: string | undefined, shot: ShotLike, asset: T, availableAssets: T[] | undefined, startFrameAsset: T | undefined) {
  if (!expectedId || !actualId || expectedId !== actualId || !shot.assetIds.includes(String(actualId))) return false;
  return !availableAssets || (startFrameAsset?.type === "image" && startFrameAsset.projectId === asset.projectId);
}

export function isVerifiedVideoAssetForShot<T extends AssetLike>(asset: T,shot: ShotLike,jobs?: AutomationJobLike[],availableAssets?: T[]) {
  if (!isVisibleVideoAsset(asset)) return false;
  const job=jobs?.find((item)=>item.id===asset.sourceJobId||item.resultAssetIds.includes(asset.id));
  if (job&&job.jobType!=="video") return false;
  if (!belongsToShot(asset, shot)) return false;
  return asset.metadata?.demo || providerVideoIsVerified(asset, shot, job, availableAssets);
}

function isVisibleVideoAsset<T extends AssetLike>(asset: T) {
  return asset.type === "video" && !asset.metadata?.hiddenFromStoryboard && !isLikelyEphemeralMediaUrl(asset.filePath);
}

function belongsToShot<T extends AssetLike>(asset: T, shot: ShotLike) {
  const ownedShotId = assetShotId(asset);
  return (shot.assetIds.includes(asset.id) || ownedShotId === shot.id) && (!ownedShotId || ownedShotId === shot.id);
}

function providerVideoIsVerified<T extends AssetLike>(asset: T, shot: ShotLike, job: AutomationJobLike | undefined, availableAssets?: T[]) {
  return asset.sourceProvider === "google-flow" || asset.sourceProvider === "google-flow-web"
    ? isVerifiedFlowVideoAsset(asset, shot, job, availableAssets)
    : true;
}

export function shotVideoAssets<T extends AssetLike>(assets: T[],shot: ShotLike,jobs?: AutomationJobLike[]) {
  return assets.filter((asset)=>isVerifiedVideoAssetForShot(asset,shot,jobs,assets)).sort((a,b)=>Number(b.id===shot.currentVideoAssetId)-Number(a.id===shot.currentVideoAssetId)||b.createdAt.localeCompare(a.createdAt));
}
