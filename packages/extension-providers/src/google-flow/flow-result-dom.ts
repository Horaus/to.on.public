export function flowTilePercent(tile: HTMLElement): number | null {
  const match = (tile.innerText || "").match(/(\d{1,3})\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : null;
}

export function mediaElementsIn(scope: ParentNode, selectors: string[]): Element[] {
  return selectors.flatMap((selector) => Array.from(scope.querySelectorAll(selector)));
}

/** Flow's current gallery uses custom elements instead of data-tile-id nodes. */
export const FLOW_RESULT_TILE_SELECTOR = "[data-tile-id], flow-grid-tile-container, flow-video-tile";

export function flowResultTiles(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FLOW_RESULT_TILE_SELECTOR));
}

export function flowResultTileId(tile: HTMLElement, mediaUrls: string[] = []): string {
  const directId = tile.dataset.tileId || tile.getAttribute("data-tile-id") || tile.dataset.mediaId || tile.getAttribute("data-media-id") || "";
  if (directId) return directId;
  const mediaId = tile.querySelector<HTMLElement>("[data-media-id]")?.dataset.mediaId || "";
  if (mediaId) return mediaId;
  const mediaUrl = mediaUrls[0] || tile.querySelector<HTMLImageElement>("img")?.currentSrc || tile.querySelector<HTMLVideoElement>("video")?.currentSrc || "";
  if (mediaUrl) return `media:${mediaUrl}`;
  const label = tile.getAttribute("aria-label") || tile.getAttribute("title") || "";
  return label ? `label:${label}` : "";
}

export function closestFlowResultTile(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>(FLOW_RESULT_TILE_SELECTOR);
}

export function flowTileLinks(tile: HTMLElement | null): string[] {
  if (!tile) return [];
  return Array.from(tile.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((anchor) => {
      try { return new URL(anchor.href, location.href).href; } catch { return anchor.href; }
    })
    .filter(Boolean);
}
