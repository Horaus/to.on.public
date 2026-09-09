type AssetLike = { filePath?: string; metadata?: Record<string, unknown> };
type SceneLike = { id: string; assetDelta?: { characterChanges?: unknown[]; propChanges?: unknown[]; settingChange?: string } };
type VisualReferenceRole = "main_character" | "supporting_character" | "location" | "visual_style" | "prop";
type ProductionGraphNodeLike = { referenceRole?: VisualReferenceRole };
type VideoAspectRatio = "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
type ProductionFormat = "short_film" | "short_video" | "video_series";

export function assetFrameAspectRatio(role: VisualReferenceRole|ProductionGraphNodeLike["referenceRole"]): VideoAspectRatio|undefined {
  if (role==="main_character"||role==="supporting_character") return "3:4";
  if (role==="location"||role==="visual_style") return "16:9";
  if (role==="prop") return "1:1";
  return undefined;
}

export function flowMediaRatioClass(aspectRatio: string) {
  if (aspectRatio==="9:16") return "portrait";
  if (aspectRatio==="3:4") return "character";
  if (aspectRatio==="1:1") return "square";
  if (aspectRatio==="4:3") return "classic";
  return "landscape";
}

export function imagePreviewSrc(asset: AssetLike|undefined) {
  return typeof asset?.metadata?.previewUrl==="string"&&asset.metadata.previewUrl?asset.metadata.previewUrl:typeof asset?.metadata?.posterUrl==="string"&&asset.metadata.posterUrl?asset.metadata.posterUrl:asset?.filePath||"";
}

export function frameOrientation(aspectRatio: string) {
  if (aspectRatio === "16:9") return "horizontal";
  if (aspectRatio === "1:1") return "square";
  return "vertical";
}

export function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function imageNodeSrc(asset: AssetLike|undefined) {
  return asset?.filePath||imagePreviewSrc(asset);
}

export function defaultSceneContinuity(scene: SceneLike,previous?: SceneLike): any {
  const delta=scene.assetDelta;
  if (delta) return { mode:"override",wardrobeChanges:readableChanges(delta.characterChanges as unknown[]|undefined),propChanges:readableChanges(delta.propChanges as unknown[]|undefined),notes:delta.settingChange?.trim()||"" };
  return previous?{ mode:"inherit",inheritFromSceneId:previous.id }:{ mode:"override",wardrobeChanges:"",propChanges:"",notes:"" };
}

function readableChanges(value: unknown[]|undefined) {
  return (value??[]).map((item)=>typeof item==="string"?item:JSON.stringify(item)).join("; ");
}

export function hasSceneAssetDelta(scene: SceneLike) {
  const delta=scene.assetDelta;
  return Boolean(delta&&(delta.characterChanges?.length||delta.propChanges?.length||delta.settingChange?.trim()));
}

export function defaultProjectIntake(overrides: Record<string, unknown>={}): any {
  return { videoSkillId:"short-drama-video",sourceType:"idea",productionFormat:"short_video",targetDurationSec:30,durationValue:30,durationUnit:"seconds",episodeCount:1,audience:"General audience",platform:"YouTube",platforms:["YouTube"],outputLanguage:"Vietnamese",contentLanguage:"Vietnamese",videoFrame:{ orientation:"vertical",aspectRatio:"9:16" },flowVideoMode:"components",aiRouting:{ textProvider:"chatgpt-web",imageProvider:"chatgpt-web",videoProvider:"google-flow-web" },...overrides };
}

export function durationToSeconds(value: number,unit: "seconds" | "minutes" | "hours" | undefined) {
  if (unit==="hours") return Math.round(value*3600);
  if (unit==="minutes") return Math.round(value*60);
  return Math.round(value);
}

/** Read a number input without allowing an unfinished/invalid edit to poison state. */
export function finiteInputNumber(rawValue: string, fallback: number, options?: { min?: number; max?: number }) {
  if (!rawValue.trim()) return fallback;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  const boundedMin = options?.min === undefined ? parsed : Math.max(options.min, parsed);
  return options?.max === undefined ? boundedMin : Math.min(options.max, boundedMin);
}

export function productionFormatPatch(productionFormat: ProductionFormat,currentEpisodeCount: number): any {
  const preset=productionFormat==="short_video"?{ durationValue:45,durationUnit:"seconds" as const }:productionFormat==="video_series"?{ durationValue:2,durationUnit:"minutes" as const }:{ durationValue:10,durationUnit:"minutes" as const };
  return { productionFormat,...preset,targetDurationSec:durationToSeconds(preset.durationValue,preset.durationUnit),episodeCount:productionFormat==="video_series"?Math.max(3,currentEpisodeCount):1 };
}

export function durationSecondsPatch(value: number): any {
  const targetDurationSec=Math.max(1,Math.round(value||1));
  return { targetDurationSec,durationValue:targetDurationSec,durationUnit:"seconds" };
}

export function videoFramePatch(aspectRatio: VideoAspectRatio): any {
  return { videoFrame:{ aspectRatio,orientation:aspectRatio==="9:16"?"vertical":aspectRatio==="1:1"?"square":"horizontal" } };
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve,reject)=>{ const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file); });
}
