type FlowTileDeps = {
  flowImageTileRoot: (element: HTMLImageElement) => HTMLElement;
  tileCandidateScore: (tile: HTMLElement) => number;
  tileMediaUrls: (tile: HTMLElement) => string[];
  imageLooksLikeFlowMedia: (image: HTMLImageElement) => boolean;
  isVisible: (element: Element) => boolean;
  visibleText: (element: Element) => string;
};

function tileLooksBusy(tile: HTMLElement): boolean {
  const text = tile.innerText || "";
  return /processing|uploading|loading|failed|error|đang tải|đang xử lý|đang tải lên|lỗi|thất bại/i.test(text)
    || Boolean(tile.querySelector('[role="progressbar"], [aria-busy="true"], progress, .loading, .spinner'));
}

function tileHasReadyMedia(tile: HTMLElement): boolean {
  const image = tile.querySelector<HTMLImageElement>("img");
  if (image) return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  const video = tile.querySelector<HTMLVideoElement>("video");
  if (video) return video.readyState >= 1;
  return Boolean(tile.querySelector("canvas, svg, [style*='background-image']"));
}

function isVisibleReadyImageTile(tile: HTMLElement, deps: FlowTileDeps): boolean {
  const { imageLooksLikeFlowMedia, isVisible, visibleText } = deps;
  if (!isVisible(tile) || tileLooksBusy(tile) || tile.querySelector("video")) return false;
  const image = tile instanceof HTMLImageElement ? tile : tile.querySelector<HTMLImageElement>("img");
  if (!image || !imageLooksLikeFlowMedia(image)) return false;
  const rect = tile.getBoundingClientRect();
  if (rect.width < 96 || rect.height < 64) return false;
  if (/hỏi gemini|google dịch|devtools|redux/i.test(visibleText(tile))) return false;
  return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth + 16 && rect.bottom <= window.innerHeight + 16;
}

function visibleReadyImageTiles(root: ParentNode, deps: FlowTileDeps): HTMLElement[] {
  const { flowImageTileRoot, tileCandidateScore, tileMediaUrls } = deps;
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-tile-id], listboxoption, button, [role='button'], a, img"))
    .map((element) => element instanceof HTMLImageElement ? flowImageTileRoot(element) : element)
    .filter((element, index, list) => list.indexOf(element) === index)
    .filter((element) => isVisibleReadyImageTile(element, deps));
  const byTileKey = new Map<string, HTMLElement>();
  for (const tile of candidates) {
    const rect = tile.getBoundingClientRect();
    const mediaKey = tileMediaUrls(tile).join("|");
    const key = tile.dataset.tileId || `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${mediaKey}`;
    const existing = byTileKey.get(key);
    if (!existing || tileCandidateScore(tile) > tileCandidateScore(existing)) byTileKey.set(key, tile);
  }
  return Array.from(byTileKey.values()).sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    return (rectB.width * rectB.height) - (rectA.width * rectA.height);
  });
}

export function createFlowResultTileInspector(deps: FlowTileDeps) {
  return {
    tileLooksBusy,
    tileHasReadyMedia,
    isVisibleReadyImageTile: (tile: HTMLElement) => isVisibleReadyImageTile(tile, deps),
    visibleReadyImageTiles: (root: ParentNode = document) => visibleReadyImageTiles(root, deps),
    findVisibleReadyImageTile: () => visibleReadyImageTiles(document, deps)[0] || null
  };
}
