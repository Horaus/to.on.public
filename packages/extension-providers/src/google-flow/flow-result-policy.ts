export type FlowTileBaseline = {
  beforeTileIds: string[];
  beforeTileTextById: Record<string, string>;
  beforeTileMediaById: Record<string, string[]>;
  beforeEditIds: string[];
  beforeMediaUrls: string[];
  submittedAt: number;
};

export type FlowTileIdentity = {
  tileId: string;
  editId?: string;
  mediaUrls: string[];
};

export type FlowGenerationEvidence = {
  expectVideo: boolean;
  hasProgressControl: boolean;
  percent: number | null;
  hasVideoMedia: boolean;
  hasAnyMedia: boolean;
  isImageOnlyResult: boolean;
  visibleText: string;
};

/**
 * A video submit is accepted only on video-specific evidence. Flow can briefly
 * render the attached start-frame as a duplicated image tile with a generic
 * spinner; that is composer hydration, not proof that video generation began.
 */
export function isFlowGenerationEvidence(evidence: FlowGenerationEvidence): boolean {
  if (evidence.expectVideo) {
    if (evidence.hasVideoMedia) return true;
    if (evidence.isImageOnlyResult) return false;
    if (evidence.percent !== null) return true;
    if (/đang tạo video|đang xử lý video|generating video|processing video|rendering video/i.test(evidence.visibleText)) return true;
    return evidence.hasProgressControl && !evidence.hasAnyMedia;
  }
  if (evidence.percent !== null || evidence.hasProgressControl) return true;
  return evidence.hasAnyMedia || /đang tạo|generating|processing|progress|rendering/i.test(evidence.visibleText);
}

/**
 * A Flow result is recoverable only when its identity is new relative to the
 * exact pre-submit snapshot. This deliberately rejects ambiguous old tiles so
 * recovery cannot attach another shot's output to the current job.
 */
export function isFreshFlowTile(identity: FlowTileIdentity, baseline?: FlowTileBaseline): boolean {
  if (!baseline || !identity.tileId) return false;
  if (baseline.beforeTileIds.includes(identity.tileId)) return false;
  if (identity.editId && baseline.beforeEditIds.includes(identity.editId)) return false;
  if (identity.mediaUrls.length > 0 && identity.mediaUrls.every((url) => baseline.beforeMediaUrls.includes(url))) return false;
  return true;
}

export type FlowResultMediaDeps = {
  mediaElementsIn: (scope: ParentNode) => Element[];
  flowTileLinks: (tile: HTMLElement) => string[];
  visibleText: (scope: Element) => string;
};

const flowMediaUrl = (element: Element): string => {
    const video = element as HTMLVideoElement;
    return video.currentSrc || (element as HTMLSourceElement).src || (element as HTMLAnchorElement).href || (element as HTMLImageElement).src || "";
};
const flowTileEditId = (tile: HTMLElement, flowTileLinks: FlowResultMediaDeps["flowTileLinks"]): string => {
    const editLink = flowTileLinks(tile).find((link) => /\/edit\//i.test(link)) || "";
    return editLink.match(/\/edit\/([^/?#]+)/i)?.[1] || "";
};
const isFlowVideoMediaElement = (element: Element): boolean => {
    const tagName = element.tagName.toLowerCase();
    const type = (element as HTMLElement).getAttribute("type") || "";
    return tagName === "video" || tagName === "source" || /video/i.test(type) || /\.(mp4|webm)(\?|#|$)/i.test(flowMediaUrl(element))
      || Boolean(typeof (element as Element & { closest?: unknown }).closest === "function" && element.closest("flow-video-tile"));
};
const flowTileHasVideoMedia = (tile: HTMLElement, mediaElementsIn: FlowResultMediaDeps["mediaElementsIn"]): boolean => mediaElementsIn(tile).some(isFlowVideoMediaElement);
const flowTileHasStaticImageMedia = (tile: HTMLElement, mediaElementsIn: FlowResultMediaDeps["mediaElementsIn"]): boolean => mediaElementsIn(tile).some((element) => element.tagName.toLowerCase() === "img" && !isFlowVideoMediaElement(element));
const flowTileIsImageOnlyResult = (tile: HTMLElement, deps: FlowResultMediaDeps): boolean => Boolean(flowTileEditId(tile, deps.flowTileLinks) && flowTileHasStaticImageMedia(tile, deps.mediaElementsIn) && !flowTileHasVideoMedia(tile, deps.mediaElementsIn));
const flowImageOnlyVideoError = (tileCount: number): string => `Google Flow returned ${tileCount} image-only result tile(s) for a video job. The Flow composer is likely still in image/keyframe mode, so the app will not treat these images as completed videos. Switch Flow to Video mode with a start frame, then retry the video step.`;
const flowTileMayRevealMedia = (tile: HTMLElement, deps: FlowResultMediaDeps): boolean => Boolean(deps.mediaElementsIn(tile).length > 0 || flowTileEditId(tile, deps.flowTileLinks) || /play_circle|phát|play|sử dụng lại câu lệnh|reuse prompt/i.test(deps.visibleText(tile)) || tile.querySelector('button, [role="button"], a[href*="/edit/"], video, img'));

/** Provider-local result media policy; DOM readers are injected for contract testing. */
export function createFlowResultMedia(deps: FlowResultMediaDeps) {
  return {
    flowMediaUrl,
    flowTileEditId: (tile: HTMLElement) => flowTileEditId(tile, deps.flowTileLinks),
    isFlowVideoMediaElement,
    flowTileHasVideoMedia: (tile: HTMLElement) => flowTileHasVideoMedia(tile, deps.mediaElementsIn),
    flowTileHasStaticImageMedia: (tile: HTMLElement) => flowTileHasStaticImageMedia(tile, deps.mediaElementsIn),
    flowTileIsImageOnlyResult: (tile: HTMLElement) => flowTileIsImageOnlyResult(tile, deps),
    flowImageOnlyVideoError,
    flowTileMayRevealMedia: (tile: HTMLElement) => flowTileMayRevealMedia(tile, deps),
  };
}
