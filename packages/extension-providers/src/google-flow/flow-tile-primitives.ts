import { compactText, visibleText } from "./flow-text-utils";
import { FLOW_RESULT_TILE_SELECTOR, flowResultTileId, flowResultTiles } from "./flow-result-dom";

export function flowImageTileRoot(element: HTMLElement): HTMLElement { return element.closest<HTMLElement>(`${FLOW_RESULT_TILE_SELECTOR}, listboxoption, button, [role='button'], a`) || element; }
export function imageLooksLikeFlowMedia(image: HTMLImageElement): boolean {
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;
  const rect = image.getBoundingClientRect();
  if (rect.width < 72 || rect.height < 48) return false;
  const alt = image.alt || "";
  return !(/profile|avatar|hồ sơ người dùng|user/i.test(alt) && rect.width < 180);
}
export function tileCandidateScore(tile: HTMLElement): number {
  const text = visibleText(tile);
  return (tile.dataset.tileId ? 100 : 0) + (tile.querySelector("[data-tile-id]") ? 30 : 0) + (/asset_[a-z0-9_-]+\.(png|jpe?g|webp)/i.test(text) ? 20 : 0) + (text ? 5 : 0);
}
export function currentTileIds(): Set<string> { return new Set(flowResultTiles().map((tile) => flowResultTileId(tile, tileMediaUrls(tile, (scope) => Array.from(scope.querySelectorAll("img, video, source"))))).filter(Boolean)); }
export function tileStableText(tile: HTMLElement): string { return compactText([tile.innerText || "", tile.getAttribute("aria-label") || "", tile.getAttribute("title") || "", tile.dataset.tileId || ""].join(" "), 600); }
export function tileMediaUrls(tile: HTMLElement, mediaElementsIn: (scope: ParentNode) => Array<Element>): string[] {
  const selfUrl = tile instanceof HTMLImageElement || tile instanceof HTMLVideoElement ? tile.currentSrc || tile.src : tile instanceof HTMLSourceElement ? tile.src : tile instanceof HTMLAnchorElement ? tile.href : "";
  return Array.from(new Set([selfUrl, ...mediaElementsIn(tile).map((element) => (element as HTMLSourceElement).src || (element as HTMLAnchorElement).href || (element as HTMLImageElement).src)].filter(Boolean)));
}
