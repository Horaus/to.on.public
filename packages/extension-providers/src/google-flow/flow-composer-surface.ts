import { compactText, flowEditableText, isVisible, visibleText } from "./flow-text-utils";

export type FlowComposerSurfaceDeps = {
  isVisible: typeof isVisible;
  flowEditableText: typeof flowEditableText;
  compactText: typeof compactText;
  visibleText: typeof visibleText;
};

function flowPromptEditorCandidates(deps: FlowComposerSurfaceDeps): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-slate-editor="true"], [contenteditable="true"], [role="textbox"], textarea'
  )).filter((element) => {
    if (!deps.isVisible(element)) return false;
    const rect = element.getBoundingClientRect();
    const textHints = [
      element.getAttribute("aria-label"), element.getAttribute("placeholder"),
      element.getAttribute("data-placeholder"), element.getAttribute("data-testid"),
      element.id, element.className
    ].filter(Boolean).join(" ");
    const dialog = element.closest<HTMLElement>('[role="dialog"], [data-state="open"]');
    if (/search|tìm kiếm|title|tiêu đề|filter|lọc/i.test(textHints)) return false;
    if (dialog?.innerText?.match(/thêm vào câu lệnh|add to prompt|tìm kiếm thành phần|search assets/i)) return false;
    // The authenticated short Flow route renders long prompts in a tall
    // ProseMirror surface anchored at the top of the composer. Keep the
    // normal lower-half geometry guard for other editors, but admit this
    // explicitly identified composer editor.
    return promptEditorGeometryFits(rect) || (element.classList.contains("ProseMirror") && proseMirrorComposerGeometryFits(rect));
  });
}

function proseMirrorComposerGeometryFits(rect: DOMRect): boolean {
  // The compact Flow viewport can render the real composer wider than the
  // viewport-relative ratio (the observed V2 surface is 562px wide in a
  // 700px viewport). Recommendation editors are still excluded by their
  // position and bounded height below; do not reject the actual PM host here.
  return rect.width >= 300 && rect.width <= 900
    && rect.height >= 70 && rect.height <= Math.min(900, window.innerHeight)
    && rect.bottom > window.innerHeight * 0.45;
}

function promptEditorGeometryFits(rect: DOMRect): boolean {
  // Flow recommendation cards also contain Slate editors. Their virtualized
  // card can intersect the viewport while starting hundreds of pixels above
  // it and spanning most of the page; treating that as the composer makes us
  // erase sample text and configure image controls instead of the bottom
  // prompt. The real composer is a bounded control anchored in the lower
  // half of the viewport.
  return rect.width >= 120 && rect.height >= 8
    // Long authored video prompts expand Flow's real composer upward. Keep
    // that bounded surface while still rejecting the 1000px+ virtualized
    // recommendation-card editors that start above the viewport.
    && rect.height <= Math.min(720, window.innerHeight * 0.75)
    && rect.top > window.innerHeight * 0.45
    && rect.top < window.innerHeight;
}

function activeFlowPromptEditor(deps: FlowComposerSurfaceDeps): HTMLElement | null {
  const candidates = flowPromptEditorCandidates(deps);
  const visibleSlateEditors = Array.from(document.querySelectorAll<HTMLElement>('[data-slate-editor="true"]'))
    .filter((element) => deps.isVisible(element) && promptEditorGeometryFits(element.getBoundingClientRect()))
    .filter((element) => !element.closest<HTMLElement>('[role="dialog"], [role="menu"], [role="listbox"]'));
  if (visibleSlateEditors.length > 0) {
    return visibleSlateEditors.sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0];
  }
  return candidates.map((element) => {
    const rect = element.getBoundingClientRect();
    const hint = [element.getAttribute("aria-label"), element.getAttribute("placeholder"), element.getAttribute("data-placeholder"), element.textContent].filter(Boolean).join(" ");
    const bottom = rect.bottom > window.innerHeight * 0.45 ? 40 : 0;
    const proseMirror = element.classList.contains("ProseMirror") ? 60 : 0;
    const promptHint = /bạn muốn tạo gì|what do you want|prompt|describe|create|tạo gì/i.test(hint) ? 35 : 0;
    const wide = rect.width > 240 ? 15 : 0;
    const content = deps.flowEditableText(element).trim().length > 0 ? 8 : 0;
    return { element, score: proseMirror + bottom + promptHint + wide + content + rect.bottom / Math.max(1, window.innerHeight) * 20 };
  }).sort((a, b) => b.score - a.score)[0]?.element || null;
}

function getComposerRoot(deps: FlowComposerSurfaceDeps): HTMLElement | null {
  const textbox = Array.from(document.querySelectorAll<HTMLElement>('[role="textbox"], [contenteditable="true"], textarea'))
    .filter((element) => isComposerRootTextbox(element, deps)).at(-1);
  let node = textbox?.parentElement || null;
  let best: HTMLElement | null = null;
  while (node && node !== document.body) {
    const rect = node.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.4 && rect.width >= 300
      && rect.width <= Math.min(820, window.innerWidth * 0.78)
      && rect.height >= 70 && rect.height <= Math.min(560, window.innerHeight * 0.7)) best = node;
    node = node.parentElement;
  }
  return best || textbox?.parentElement || null;
}

function isComposerRootTextbox(element: HTMLElement, deps: FlowComposerSurfaceDeps): boolean {
  const rect = element.getBoundingClientRect();
  const dialog = element.closest<HTMLElement>('[role="dialog"], [data-state="open"]');
  return deps.isVisible(element) && promptEditorGeometryFits(rect)
    && !dialog?.innerText?.match(/thêm vào câu lệnh|add to prompt|tìm kiếm thành phần|search assets/i);
}

function composerPanelRoot(deps: FlowComposerSurfaceDeps): HTMLElement | null {
  const textbox = activeFlowPromptEditor(deps);
  if (!textbox || !deps.isVisible(textbox)) return getComposerRoot(deps);
  let node = textbox.parentElement;
  let best: HTMLElement | null = null;
  while (node && node !== document.body) {
    const rect = node.getBoundingClientRect();
    const text = deps.visibleText(node);
    const hasComposerControls = /tác nhân|agent|video|image|hình ảnh|khung hình|thành phần|component|1x|2x|4s|6s|8s|10s/i.test(text);
    if (rect.top > window.innerHeight * 0.42 && rect.width >= 320
      && rect.height >= 70 && rect.height <= Math.min(680, window.innerHeight * 0.62)
      && hasComposerControls) best = node;
    node = node.parentElement;
  }
  return best || getComposerRoot(deps);
}

function attachmentGeometryFits(rect: DOMRect, rootRect: DOMRect): boolean {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return rect.width > 36 && rect.height > 36 && rect.width <= Math.min(220, rootRect.width * 0.45)
    && rect.height <= Math.min(180, rootRect.height * 0.7)
    && rect.top >= rootRect.top - 8 && rect.bottom <= rootRect.bottom + 8
    && rect.top >= window.innerHeight * 0.45 && centerX >= rootRect.left - 8 && centerX <= rootRect.right + 8
    && centerY >= rootRect.top - 8 && centerY <= rootRect.bottom + 8;
}

function attachmentTileFits(element: HTMLElement, rootRect: DOMRect): boolean {
  const tileRect = element.closest<HTMLElement>("[data-tile-id]")?.getBoundingClientRect();
  return !tileRect || (tileRect.width <= Math.min(260, rootRect.width * 0.5)
    && tileRect.height <= Math.min(220, rootRect.height * 0.75));
}

function elementLooksLikeComposerAttachment(element: HTMLElement, root: HTMLElement, deps: FlowComposerSurfaceDeps): boolean {
  if (!deps.isVisible(element) || element.closest('[role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper]')) return false;
  const rootRect = root.getBoundingClientRect();
  return attachmentGeometryFits(element.getBoundingClientRect(), rootRect) && attachmentTileFits(element, rootRect);
}

function promptAttachmentElements(deps: FlowComposerSurfaceDeps): HTMLElement[] {
  const composerRoot = composerPanelRoot(deps);
  if (!composerRoot) return [];
  const selector = '[data-slate-editor="true"] img:not(.ProseMirror-separator), [contenteditable="true"] img:not(.ProseMirror-separator), .prompt-ref, [data-ref-image], img[alt*="nội dung nghe nhìn" i], img[alt*="media" i]';
  const directRefs = Array.from(composerRoot.querySelectorAll<HTMLElement>(selector)).filter((element) => elementLooksLikeComposerAttachment(element, composerRoot, deps));
  const composerRefs = Array.from(composerRoot.querySelectorAll<HTMLElement>("img, video, canvas, [data-tile-id], [style*='background-image']"))
    .filter((element) => elementLooksLikeComposerAttachment(element, composerRoot, deps));
  return Array.from(new Set([...directRefs, ...composerRefs]));
}

export function createFlowComposerSurface(deps: FlowComposerSurfaceDeps) {
  return {
    activeFlowPromptEditor: () => activeFlowPromptEditor(deps),
    getComposerRoot: () => getComposerRoot(deps),
    composerPanelRoot: () => composerPanelRoot(deps),
    promptAttachmentElements: () => promptAttachmentElements(deps),
    promptAttachmentCount: () => promptAttachmentElements(deps).length
  };
}
