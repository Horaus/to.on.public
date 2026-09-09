type TextReader = (element: Element) => string;
type VisibilityReader = (element: Element) => boolean;

type FlowFrameDomDeps = {
  visibleText: TextReader;
  isVisible: VisibilityReader;
  getComposerRoot: () => HTMLElement | null;
  activeFlowPromptEditor: () => HTMLElement | null;
};

function isFlowFrameSlot(deps: FlowFrameDomDeps, element: HTMLElement): boolean {
  if (!deps.isVisible(element)) return false;
  const rect = element.getBoundingClientRect();
  const text = deps.visibleText(element).replace(/\s+/g, " ").trim();
  return frameLabelIsEligible(element, rect, text) && frameSlotGeometryIsEligible(rect) && /(^|\s)(bắt đầu|kết thúc|start|end)(\s|$)/i.test(text);
}

function frameLabelIsEligible(element: HTMLElement, rect: DOMRect, text: string): boolean {
  if (element.closest('[contenteditable="true"], [role="textbox"], textarea')) return false;
  const exactFrameLabel = /^(bắt đầu|kết thúc|start|end)$/i.test(text);
  return exactFrameLabel || (text.length <= 80 && rect.top >= window.innerHeight * 0.62);
}

function frameSlotGeometryIsEligible(rect: DOMRect): boolean {
  return rect.top > window.innerHeight * 0.35 && rect.top < window.innerHeight * 0.92 && rect.left < window.innerWidth * 0.55 && rect.width >= 36 && rect.width <= 220 && rect.height >= 26 && rect.height <= 90;
}

function compareFlowFrameSlots(deps: FlowFrameDomDeps, left: HTMLElement, right: HTMLElement): number {
  const leftText = deps.visibleText(left); const rightText = deps.visibleText(right);
  const leftRect = left.getBoundingClientRect(); const rightRect = right.getBoundingClientRect();
  const leftStart = /bắt đầu|start/i.test(leftText) ? 0 : 1; const rightStart = /bắt đầu|start/i.test(rightText) ? 0 : 1;
  const leftExact = /^(bắt đầu|start)$/i.test(leftText.trim()) ? 0 : 1; const rightExact = /^(bắt đầu|start)$/i.test(rightText.trim()) ? 0 : 1;
  const leftBottom = leftRect.top > window.innerHeight * 0.62 ? 0 : 1; const rightBottom = rightRect.top > window.innerHeight * 0.62 ? 0 : 1;
  return leftStart - rightStart || leftExact - rightExact || leftBottom - rightBottom || (leftRect.width * leftRect.height) - (rightRect.width * rightRect.height) || leftRect.left - rightRect.left || leftRect.top - rightRect.top;
}

function flowStartOrEndFrameSlots(deps: FlowFrameDomDeps): HTMLElement[] {
  const composerRoot = deps.getComposerRoot();
  const scoped = composerRoot?.querySelectorAll<HTMLElement>(".frame-trigger") || [];
  const candidates = scoped.length
    ? Array.from(scoped)
    : Array.from(document.querySelectorAll<HTMLElement>(".prompt-top-row .frame-trigger, flow-ingredient-bar .frame-trigger"));
  const slots = candidates
    .filter((element) => {
      if (!deps.isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      const text = deps.visibleText(element).replace(/\s+/g, " ").trim();
      return frameSlotGeometryIsEligible(rect)
        && (/(^|\s)(bắt đầu|kết thúc|start|end)(\s|$)/i.test(text) || Boolean(element.querySelector(".chip-container, img, video, canvas")));
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect(); const rightRect = right.getBoundingClientRect();
      return leftRect.left - rightRect.left || compareFlowFrameSlots(deps, left, right);
    });
  return Array.from(new Set(slots)).slice(0, 2);
}

function flowStartFrameSlots(deps: FlowFrameDomDeps): HTMLElement[] {
  const slots = flowStartOrEndFrameSlots(deps);
  const labelled = slots.filter((slot) => /bắt đầu|start/i.test(deps.visibleText(slot)));
  return labelled.length ? labelled : slots.slice(0, 1);
}

function flowDirectFrameAttachmentElements(deps: FlowFrameDomDeps): HTMLElement[] {
  const slots = flowStartOrEndFrameSlots(deps);
  const slotMedia = slots.flatMap((slot) => Array.from(slot.querySelectorAll<HTMLElement>("img, video, canvas, [style*='background-image']")))
    .filter((element) => deps.isVisible(element) && (element.matches("img, video, canvas") || Boolean((element as HTMLElement).style.backgroundImage)));
  // Do not inspect the whole project gallery here: gallery thumbnails also
  // contain `video`/frame labels and were previously counted as attached
  // start frames. The fallback is limited to the live composer surface.
  const composerRoot = deps.getComposerRoot();
  const nearbyMedia = Array.from((composerRoot || document.createDocumentFragment()).querySelectorAll<HTMLElement>("img, video, canvas, [style*='background-image']"))
    .filter((element) => {
      if (!deps.isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.45 || rect.width < 40 || rect.height < 40) return false;
      const text = deps.visibleText(element.closest("button, [role='button'], section, div") || element);
      return /bắt đầu|kết thúc|start|end|video|khung hình/i.test(text);
    });
  return Array.from(new Set([...slotMedia, ...nearbyMedia]));
}

function flowStartFrameSlotLooksAttached(deps: FlowFrameDomDeps): boolean {
  return flowStartFrameAttachmentRemoveButtons(deps).length > 0;
}

function flowStartFrameAttachmentRemoveButtons(deps: FlowFrameDomDeps): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [aria-label]"))
    .filter((element) => {
      if (!deps.isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      const text = `${element.getAttribute("aria-label") || ""} ${deps.visibleText(element)}`.trim();
      const isRemoveLabel = /(^|\s)(cancel|remove|clear|x[oó]a|huỷ|hủy)(\s|$)/i.test(text);
      // After a frame is attached Flow replaces the textual `Bắt đầu` slot
      // with a thumbnail button whose only label is the Material icon
      // `cancel`. On tall/retina windows its top can be below 64% of the
      // viewport, so geometry alone must not discard it. Require either the
      // remove label or visible media inside the small lower-left composer
      // card; this excludes the unrelated project-grid media tiles.
      const hasFrameMedia = Boolean(element.querySelector("img, video, canvas"));
      const minimumTop = hasFrameMedia ? window.innerHeight * 0.35 : window.innerHeight * 0.45;
      return rect.top > minimumTop && rect.top < window.innerHeight * 0.9
        && rect.left < window.innerWidth * 0.6 && rect.width >= 32 && rect.width <= 90 && rect.height >= 26 && rect.height <= 90
        && (isRemoveLabel || hasFrameMedia);
    });
}

function directFrameAttachmentCount(deps: FlowFrameDomDeps): number {
  return flowDirectFrameAttachmentElements(deps).length + (flowStartFrameSlotLooksAttached(deps) ? 1 : 0);
}

function flowComposerDropTargets(deps: FlowFrameDomDeps): HTMLElement[] {
  const targets: HTMLElement[] = [...flowStartOrEndFrameSlots(deps)];
  const composerRoot = deps.getComposerRoot();
  if (composerRoot) {
    targets.push(composerRoot);
    let node = composerRoot.parentElement;
    while (node && node !== document.body && targets.length < 10) {
      const rect = node.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.45 && rect.width >= 300 && rect.height >= 70 && rect.height <= 320) targets.push(node);
      node = node.parentElement;
    }
  }
  const promptEditor = deps.activeFlowPromptEditor();
  if (promptEditor) targets.push(promptEditor);
  return Array.from(new Set(targets)).filter(deps.isVisible);
}

function tileDragSource(tile: HTMLElement): HTMLElement {
  return tile.querySelector<HTMLElement>('[aria-roledescription="draggable"], [draggable="true"], [role="button"], button, img, video, a') || tile;
}

function addTileDataToTransfer(transfer: DataTransfer, tile: HTMLElement): void {
  const tileId = tile.dataset.tileId || tile.getAttribute("data-tile-id") || "";
  const image = tile.querySelector<HTMLImageElement>("img");
  const video = tile.querySelector<HTMLVideoElement>("video");
  const source = tile.querySelector<HTMLSourceElement>("source");
  const mediaUrl = image?.currentSrc || image?.src || video?.currentSrc || video?.src || source?.src || "";
  setTransferValue(transfer, "text/plain", tileId);
  setTransferValue(transfer, "text/uri-list", mediaUrl);
  setTransferValue(transfer, "text/html", tile.outerHTML);
  transfer.effectAllowed = "copyMove";
  transfer.dropEffect = "copy";
}

function setTransferValue(transfer: DataTransfer, type: string, value: string): void {
  if (!value) return;
  try { transfer.setData(type, value); } catch { /* browser rejected optional drag metadata */ }
}

export function createFlowFrameDom(deps: FlowFrameDomDeps) {
  return {
    isFlowFrameSlot: (element: HTMLElement) => isFlowFrameSlot(deps, element),
    compareFlowFrameSlots: (left: HTMLElement, right: HTMLElement) => compareFlowFrameSlots(deps, left, right),
    flowStartOrEndFrameSlots: () => flowStartOrEndFrameSlots(deps),
    flowStartFrameSlots: () => flowStartFrameSlots(deps),
    flowDirectFrameAttachmentElements: () => flowDirectFrameAttachmentElements(deps),
    flowStartFrameSlotLooksAttached: () => flowStartFrameSlotLooksAttached(deps),
    flowStartFrameAttachmentRemoveButtons: () => flowStartFrameAttachmentRemoveButtons(deps),
    directFrameAttachmentCount: () => directFrameAttachmentCount(deps),
    flowComposerDropTargets: () => flowComposerDropTargets(deps),
    tileDragSource,
    addTileDataToTransfer
  };
}
