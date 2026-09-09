type JobReference = any;
export type FlowReferenceSearchDeps = Record<string, any>;

let activeDeps: Record<string, any>;

function referenceTileGeometryLooksScoped(tile: HTMLElement): boolean {
  if (!activeDeps.isVisible(tile)) return false;
  const rect = tile.getBoundingClientRect();
  return activeDeps.referenceGeometryIsScoped(rect, { width: window.innerWidth, height: window.innerHeight });
}

function containsReferenceToken(reference: JobReference | undefined, element: HTMLElement): boolean {
  const tokens = activeDeps.referenceSearchTokens(reference);
  if (!tokens.length) return false;
  const searchText = tileSearchText(element);
  const visible = activeDeps.normalizedToken(activeDeps.visibleText(element));
  return tokens.some((token: any) => searchText.includes(token) || visible.includes(token));
}

function referenceMediaTileCandidates(reference?: JobReference, root: ParentNode = document): HTMLElement[] {
  const tokens = activeDeps.referenceSearchTokens(reference);
  if (!tokens.length) return [];
  const rawCandidates = referenceMediaElements(root)
    .map((element) => {
      if (element instanceof HTMLImageElement) return activeDeps.flowImageTileRoot(element);
      const tile = element.closest<HTMLElement>("[data-tile-id], listboxoption, [role='option'], button, [role='button'], a");
      return tile || element;
    })
    .filter((element, index, list) => list.indexOf(element) === index)
    .filter((element) => isReferenceMediaCandidate(reference, element));
  return smallestReferenceCandidates(reference, rawCandidates).sort(compareReferenceCandidates);
}

function referenceMediaElements(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-tile-id], listboxoption, [role='option'], button, [role='button'], a, img"));
}

function isReferenceMediaCandidate(reference: JobReference | undefined, element: HTMLElement) {
  return referenceTileGeometryLooksScoped(element)
    && containsReferenceToken(reference, element)
    && (activeDeps.tileMediaUrls(element).length > 0 || Boolean(element.querySelector("img, video, canvas, [style*='background-image']")));
}

function smallestReferenceCandidates(reference: JobReference | undefined, candidates: HTMLElement[]) {
  return candidates.filter((candidate) => {
    const candidateArea = candidate.getBoundingClientRect().width * candidate.getBoundingClientRect().height;
    return !candidates.some((other) => {
      if (other === candidate || !candidate.contains(other)) return false;
      const otherRect = other.getBoundingClientRect();
      const otherArea = otherRect.width * otherRect.height;
      return otherArea > 0 && otherArea < candidateArea && containsReferenceToken(reference, other);
    });
  });
}

function compareReferenceCandidates(left: HTMLElement, right: HTMLElement) {
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  const leftHasTileId = left.dataset.tileId ? 0 : 1;
  const rightHasTileId = right.dataset.tileId ? 0 : 1;
  const leftArea = leftRect.width * leftRect.height;
  const rightArea = rightRect.width * rightRect.height;
  return leftHasTileId - rightHasTileId || leftArea - rightArea || leftRect.top - rightRect.top || leftRect.left - rightRect.left;
}

function tileMatchesReference(reference: JobReference | undefined, tile: HTMLElement | null): boolean {
  if (!reference || !tile) return false;
  if (!referenceTileGeometryLooksScoped(tile)) return false;
  return containsReferenceToken(reference, tile);
}

function exactReferenceOptionInOpenPicker(reference: JobReference | undefined): HTMLElement | null {
  const requiredFilename = (reference?.filename || "").trim().toLowerCase();
  const tokens = activeDeps.referenceSearchTokens(reference);
  if (!requiredFilename && !tokens.length) return null;
  const options = activeDeps.mediaPickerDialogs().flatMap((picker: any) => activeDeps.mediaPickerReferenceOptions(picker));
  const matches = options.filter((option: any) => {
    const rawLabel = [
      option.innerText || "",
      ...Array.from(option.querySelectorAll("img")).map((image: any) => image.alt || "")
    ].join(" ").trim().toLowerCase();
    if (requiredFilename && rawLabel.includes(requiredFilename)) return true;
    const labels = [rawLabel].map(activeDeps.normalizedToken).filter(Boolean);
    return tokens.some((token: any) => labels.some((label: any) => label === token || label.includes(token)));
  });
  return matches.length === 1 ? matches[0] : null;
}

type ImageFingerprint = {
  width: number;
  height: number;
  values: number[];
};

const imageFingerprintCache = new Map<string, ImageFingerprint | null>();

function loadComparableImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error("Image timed out while loading for Flow visual matching."));
    }, 3500);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Image did not load for Flow visual matching."));
    };
    image.src = src;
  });
}

async function imageFingerprint(src: string): Promise<ImageFingerprint | null> {
  if (!src) return null;
  if (imageFingerprintCache.has(src)) return imageFingerprintCache.get(src) || null;
  try {
    const image = await loadComparableImage(src);
    const width = 24;
    const height = 24;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const values: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      values.push(Math.round((data[index] + data[index + 1] + data[index + 2]) / 3));
    }
    const fingerprint = { width, height, values };
    imageFingerprintCache.set(src, fingerprint);
    return fingerprint;
  } catch {
    imageFingerprintCache.set(src, null);
    return null;
  }
}

async function tileVisuallyMatchesReference(reference: JobReference | undefined, tile: HTMLElement | null): Promise<boolean> {
  if (!reference || !tile) return false;
  const referenceData = activeDeps.referenceDataUrl(reference);
  if (!referenceData) return false;
  const image = tile instanceof HTMLImageElement ? tile : tile.querySelector<HTMLImageElement>("img");
  const tileSrc = image?.currentSrc || image?.src || "";
  if (!tileSrc) return false;
  const [referenceFingerprintValue, tileFingerprintValue] = await Promise.all([
    imageFingerprint(referenceData),
    imageFingerprint(tileSrc)
  ]);
  if (!referenceFingerprintValue || !tileFingerprintValue) return false;
  return activeDeps.compareImageFingerprints(referenceFingerprintValue, tileFingerprintValue) < 0.055;
}

function tileSearchText(tile: HTMLElement): string {
  const parts = [
    tile.innerText || "",
    tile.getAttribute("aria-label") || "",
    tile.getAttribute("title") || "",
    tile.dataset.tileId || ""
  ];
  tile.querySelectorAll<HTMLElement>("img, a, video, source").forEach((element) => {
    parts.push(element.getAttribute("alt") || "");
    parts.push(element.getAttribute("title") || "");
    parts.push(element.getAttribute("aria-label") || "");
    parts.push((element as HTMLImageElement | HTMLVideoElement).src || "");
    parts.push((element as HTMLAnchorElement).href || "");
  });
  return parts.map(activeDeps.normalizedToken).join(" ");
}

function findExistingUploadedReferenceTile(reference?: JobReference): HTMLElement | null {
  const fingerprint = activeDeps.referenceFingerprint(reference);
  if (fingerprint) {
    const cached = activeDeps.readFlowReferenceCache()[fingerprint];
    if (cached?.tileId) {
      const cachedTile = document.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(cached.tileId)}"]`);
      if (cachedTile && activeDeps.visibleReadyImageTiles().includes(cachedTile) && tileMatchesReference(reference, cachedTile)) return cachedTile;
    }
  }
  const tiles = activeDeps.visibleReadyImageTiles();
  const exactTiles = referenceMediaTileCandidates(reference);
  return tiles.find((tile: any) => exactTiles.includes(tile) || containsReferenceToken(reference, tile)) || null;
}

async function findExistingUploadedReferenceTileByVisual(jobId: string, reference?: JobReference): Promise<HTMLElement | null> {
  if (!reference) return null;
  // Flow projects can contain dozens of prior uploads with the same generated
  // filename. The first 16 visible tiles are not a reliable inventory window;
  // scan a bounded larger window so the strict pixel matcher can disambiguate
  // older uploads without turning this into an unbounded DOM walk.
  const visibleCandidates = activeDeps.visibleReadyImageTiles();
  // Virtualized Flow grids keep hydrated images in the DOM even when they
  // are just outside the viewport. Include those image-backed tile roots so
  // a duplicate filename can be disambiguated before opening a picker that
  // may navigate the base project route and close the relay channel.
  const hydratedCandidates = Array.from(document.querySelectorAll<HTMLImageElement>("img[src]"))
    .filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.getBoundingClientRect().width > 72)
    .map((image) => image.closest<HTMLElement>("[data-tile-id], listboxoption, button, [role='button'], a") || image)
    .filter((tile, index, list) => list.indexOf(tile) === index);
  const candidates = [...visibleCandidates, ...hydratedCandidates]
    .filter((tile, index, list) => list.indexOf(tile) === index)
    .slice(0, 128);
  // Most Flow inventory tiles already expose an image URL (and therefore can
  // be fingerprinted) even when their hover label is virtualized. Avoid the
  // old sequential hover delay for those tiles: 64 candidates × 420ms could
  // exceed the published runtime's bounded 8s workspace relay. Only reveal
  // labels for candidates that have neither a media URL nor an image element.
  const labelOnlyCandidates = candidates.filter((tile: any) =>
    activeDeps.tileMediaUrls(tile).length === 0
    && !tile.querySelector("img[src], video[src], canvas, [style*='background-image']")
  );
  if (labelOnlyCandidates.length) await revealReadyImageTileLabels(labelOnlyCandidates.slice(0, 8));
  const textMatches = candidates.filter((tile: any) => tileMatchesReference(reference, tile));
  // Filenames are not unique in Flow's inventory. Only trust a text match
  // when it identifies one tile; duplicate labels must be disambiguated by
  // the actual image fingerprint below.
  if (textMatches.length === 1) {
    const textMatched = textMatches[0];
    activeDeps.flowTrace(jobId, `Matched existing Flow media tile by revealed label for ${activeDeps.referenceRequiredLabel(reference)}.`, 0.34);
    activeDeps.rememberFlowTileForReference(reference, textMatched);
    return textMatched;
  }
  const visualCandidates = (textMatches.length > 1 ? textMatches : candidates) as any[];
  // Compare a small bounded batch at a time. Sequentially fingerprinting a
  // virtualized inventory can exceed the runtime relay's 8s deadline; an
  // unbounded Promise.all would instead create a burst of image loads.
  for (let offset = 0; offset < visualCandidates.length; offset += 8) {
    const batch = visualCandidates.slice(offset, offset + 8);
    const matches = await Promise.all(batch.map(async (tile) => ({ tile, matched: await tileVisuallyMatchesReference(reference, tile) })));
    const visualMatch = matches.find((entry) => entry.matched)?.tile;
    if (visualMatch) {
      activeDeps.flowTrace(jobId, `Matched existing Flow media tile visually for ${activeDeps.referenceRequiredLabel(reference)}.`, 0.34);
      activeDeps.rememberFlowTileForReference(reference, visualMatch);
      return visualMatch;
    }
  }
  return null;
}

async function revealReadyImageTileLabels(tiles: HTMLElement[]): Promise<void> {
  for (const tile of tiles) {
    const target = tile.querySelector<HTMLElement>("img, button, [role='button'], a") || tile;
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    for (const element of [tile, target]) {
      element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX, clientY, pointerType: "mouse" }));
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, clientX, clientY }));
      element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true, clientX, clientY }));
    }
    await activeDeps.sleep(420);
  }
}


export function createFlowReferenceSearch(deps: FlowReferenceSearchDeps) {
  activeDeps = deps;
  return { referenceTileGeometryLooksScoped, containsReferenceToken, referenceMediaTileCandidates, referenceMediaElements, isReferenceMediaCandidate, smallestReferenceCandidates, compareReferenceCandidates, tileMatchesReference, exactReferenceOptionInOpenPicker, loadComparableImage, imageFingerprint, tileVisuallyMatchesReference, tileSearchText, findExistingUploadedReferenceTile, findExistingUploadedReferenceTileByVisual, revealReadyImageTileLabels };
}
