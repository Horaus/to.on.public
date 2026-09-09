type Reference = { assetId: string; filename?: string; [key: string]: unknown };
type Deps = {
  promptAttachmentElements: () => HTMLElement[]; tileMediaUrls: (tile: HTMLElement) => string[]; referenceFingerprint: (reference: Reference) => string | null; expectedComposerMediaUrlsByReference: Map<string, string[]>; composerPanelRoot: () => HTMLElement | null;
  findExistingUploadedReferenceTile: (reference: Reference) => HTMLElement | null; revealReadyImageTileLabels: (tiles: HTMLElement[]) => Promise<void>; tileMatchesReference: (reference: Reference, tile: HTMLElement) => boolean; tileVisuallyMatchesReference: (reference: Reference, tile: HTMLElement) => Promise<boolean>;
  promptAttachmentCount: () => number; sleep: (ms: number) => Promise<void>; directFrameAttachmentCount: () => number; flowTrace: (jobId: string, message: string, progress?: number) => void; isVisible: (element: Element) => boolean; visibleText: (element: Element) => string; getComposerRoot: () => HTMLElement | null;
  flowStartFrameAttachmentRemoveButtons: () => HTMLElement[]; clickElementStrictNative: (element: HTMLElement) => Promise<boolean>; humanPause: (min: number, max: number) => Promise<void>; activeFlowPromptEditor: () => HTMLElement | null; clearFlowPromptEditor: (editor: HTMLElement) => Promise<void>; closeMediaPickerIfOpen: () => Promise<void>; openFlowComposerFromProjectGrid: (jobId: string) => Promise<boolean>;
};
let deps: Deps;
export function configureFlowComposerReferenceHelpers(next: Deps): void { deps = next; }

function composerHasReferenceSource(): boolean {
  if (deps.promptAttachmentElements().length > 0) return true;
  if (composerReferenceRemoveButtons().length > 0) return true;
  return false;
}

function composerContainsMediaUrls(attachments: HTMLElement[], composerUrls: string[], expectedUrls: string[]): boolean {
  if (composerUrls.some((url) => expectedUrls.includes(url))) return true;
  return attachments.some((attachment) => deps.tileMediaUrls(attachment).some((url) => expectedUrls.includes(url)));
}

async function composerReferenceMatches(reference: Reference | undefined): Promise<boolean> {
  if (!reference) return composerHasReferenceSource();
  const attachments = deps.promptAttachmentElements();
  const fingerprint = deps.referenceFingerprint(reference);
  const expectedUrls = fingerprint ? deps.expectedComposerMediaUrlsByReference.get(fingerprint) || [] : [];
  const composerRoot = deps.composerPanelRoot();
  const composerUrls = composerRoot ? deps.tileMediaUrls(composerRoot) : [];
  if (!attachments.length && !composerUrls.length) return false;
  if (expectedUrls.length) {
    if (composerContainsMediaUrls(attachments, composerUrls, expectedUrls)) return true;
  }
  const exactTile = deps.findExistingUploadedReferenceTile(reference);
  const exactTileUrls = exactTile ? deps.tileMediaUrls(exactTile) : [];
  if (exactTileUrls.length) {
    if (composerContainsMediaUrls(attachments, composerUrls, exactTileUrls)) return true;
  }
  await deps.revealReadyImageTileLabels(attachments.slice(0, 4));
  for (const attachment of attachments) {
    if (deps.tileMatchesReference(reference, attachment)) return true;
    if (await deps.tileVisuallyMatchesReference(reference, attachment)) return true;
  }
  return false;
}

async function waitForPromptAttachmentIncrease(beforeCount: number, timeoutMs = 8000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (
      deps.promptAttachmentCount() > beforeCount
      || composerReferenceRemoveButtons().length > beforeCount
      || (beforeCount === 0 && composerHasReferenceSource())
    ) return true;
    await deps.sleep(300);
  }
  return false;
}

async function waitForComposerReference(jobId: string, timeoutMs = 6000, sourceMode: "components" | "frames" = "components", reference?: Reference): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const attached = sourceMode === "frames"
      // Flow V2 replaces the textual start-frame slot with a compact
      // thumbnail button labelled `cancel`/`Thành phần tạo hình ảnh`. Keep
      // this explicit structural signal alongside the media probe: on some
      // rerenders the thumbnail is mounted outside the slot node and the
      // nearby-media heuristic temporarily returns zero.
      ? deps.directFrameAttachmentCount() > 0 || deps.flowStartFrameAttachmentRemoveButtons().length > 0
      : composerHasReferenceSource();
    if (attached) {
      if (sourceMode === "components" && reference && !(await composerReferenceMatches(reference))) {
        await deps.sleep(300);
        continue;
      }
      deps.flowTrace(jobId, `Flow composer ${sourceMode === "frames" ? "start-frame" : "component"} source verified.`, 0.5);
      return true;
    }
    await deps.sleep(300);
  }
  return false;
}

async function waitForVerifiedComposerSource(jobId: string, timeoutMs: number, sourceMode: "components" | "frames", reference?: Reference, expectedReferenceCount = 1): Promise<boolean> {
  if (sourceMode === "frames") return waitForComposerReference(jobId, timeoutMs, sourceMode, reference);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const attachmentCount = Math.max(deps.promptAttachmentCount(), composerReferenceRemoveButtons().length);
    if (attachmentCount >= expectedReferenceCount && composerHasReferenceSource()) {
      deps.flowTrace(jobId, `Flow component source manifest remains attached (${attachmentCount}/${expectedReferenceCount}); identities were verified in the exact picker before attach.`, 0.5);
      return true;
    }
    await deps.sleep(300);
  }
  return false;
}

function isFlowRemoveButton(button: HTMLElement): boolean {
  if (!deps.isVisible(button)) return false;
  const label = [button.getAttribute("aria-label") || "", button.getAttribute("title") || "", deps.visibleText(button)].join(" ");
  return /remove (?:media|reference|attachment)|delete (?:media|reference|attachment)|x[oó]a (?:nội dung|tệp|ảnh)|^cancel$/i.test(label.trim());
}

function isDetachedCancelLabel(button: HTMLElement): boolean {
  return /^cancel$/i.test(`${button.getAttribute("aria-label") || ""} ${button.innerText || ""}`.trim());
}

function isDetachedCancelShape(button: HTMLElement): boolean {
  const rect = button.getBoundingClientRect();
  return rect.width >= 36 && rect.width <= 80 && rect.height >= 36 && rect.height <= 80;
}

function isDetachedCancelInComposer(button: HTMLElement, composerRect: DOMRect): boolean {
  const rect = button.getBoundingClientRect();
  return rect.top >= composerRect.top - 140 && rect.bottom <= composerRect.bottom + 16
    && rect.left >= composerRect.left - 24 && rect.right <= composerRect.right + 24;
}

function isDetachedFlowCancelButton(button: HTMLElement, composerRect: DOMRect): boolean {
  if (!deps.isVisible(button) || button.closest('[role="dialog"], [role="listbox"]')) return false;
  return isDetachedCancelLabel(button) && isDetachedCancelShape(button) && isDetachedCancelInComposer(button, composerRect);
}

function composerReferenceRemoveButtons(): HTMLElement[] {
  const composerRoot = deps.getComposerRoot();
  if (!composerRoot) return [];
  const composerRect = composerRoot.getBoundingClientRect();
  const thumbnailButtons = Array.from(composerRoot.querySelectorAll<HTMLElement>("img, video"))
    .filter((media) => deps.promptAttachmentElements().includes(media)).map((media) => media.closest<HTMLElement>("button, [role='button']")).filter((button): button is HTMLElement => Boolean(button && deps.isVisible(button)));
  const labelledButtons = Array.from(composerRoot.querySelectorAll<HTMLElement>("button, [role='button']")).filter(isFlowRemoveButton);
  const detachedThumbnailButtons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']")).filter((button) => isDetachedFlowCancelButton(button, composerRect));
  return Array.from(new Set([...thumbnailButtons, ...labelledButtons, ...detachedThumbnailButtons]));
}

async function clearComposerReferences(jobId: string, timeoutMs = 45000): Promise<boolean> {
  const startedAt = Date.now();
  let emptySince = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const before = composerReferenceCounts();
    if (before.empty) {
      emptySince ||= Date.now();
      if (Date.now() - emptySince >= 12000) return true;
      await deps.sleep(250);
      continue;
    }
    emptySince = 0;
    if (!(await removeOneComposerReference(jobId, before))) break;
  }
  const remaining = composerReferenceCounts();
  if (!remaining.empty) {
    deps.flowTrace(jobId, `Flow composer still has ${remaining.prompt} prompt source attachment(s), ${remaining.frames} frame attachment(s), and ${remaining.removeButtons.length} visible attachment remove control(s) after cleanup.`, 0.24);
  }
  return remaining.empty;
}

function composerReferenceCounts() {
  const prompt = deps.promptAttachmentCount();
  const frames = deps.directFrameAttachmentCount();
  const removeButtons = composerReferenceRemoveButtons();
  return { prompt, frames, removeButtons, empty: prompt === 0 && frames === 0 && removeButtons.length === 0 };
}

function discardFlowPromptButton(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    .filter(deps.isVisible)
    .find((button) => /x(?:oá|óa|oa) câu lệnh|clear prompt|discard prompt/i.test(button.textContent || "")) || null;
}

async function removeOneComposerReference(jobId: string, before: ReturnType<typeof composerReferenceCounts>): Promise<boolean> {
  const discard = discardFlowPromptButton();
  if (discard) {
    deps.flowTrace(jobId, "Clearing the complete Flow draft to remove all persisted component attachments.", 0.235);
    if (await deps.clickElementStrictNative(discard)) {
      await deps.humanPause(500, 850);
      return true;
    }
  }
  const frameRemove = deps.flowStartFrameAttachmentRemoveButtons()[0];
  if (frameRemove) {
    if (!(await deps.clickElementStrictNative(frameRemove))) return false;
    await deps.humanPause(450, 850);
    return true;
  }
  if (before.removeButtons.length > 0) {
    if (!(await deps.clickElementStrictNative(before.removeButtons[0]))) return false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 1800 && composerReferenceRemoveButtons().length >= before.removeButtons.length) await deps.sleep(120);
    await deps.humanPause(180, 320);
    return true;
  }
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await deps.humanPause(450, 850);
  const after = composerReferenceCounts();
  return after.prompt < before.prompt || after.frames < before.frames;
}

async function clearFlowDraftBeforeRetry(jobId: string): Promise<void> {
  const editor = deps.activeFlowPromptEditor();
  if (editor) await deps.clearFlowPromptEditor(editor);
  await clearComposerReferences(jobId, 45000);
  await deps.closeMediaPickerIfOpen();
  if (!deps.getComposerRoot()) {
    deps.flowTrace(jobId, "Flow composer is closed after draft cleanup; reopening it before reference inventory.", 0.245);
    await deps.openFlowComposerFromProjectGrid(jobId);
  }
}


export { composerHasReferenceSource, composerContainsMediaUrls, composerReferenceMatches, waitForPromptAttachmentIncrease, waitForComposerReference, waitForVerifiedComposerSource, isFlowRemoveButton, isDetachedCancelLabel, isDetachedCancelShape, isDetachedCancelInComposer, isDetachedFlowCancelButton, composerReferenceRemoveButtons, clearComposerReferences, composerReferenceCounts, discardFlowPromptButton, removeOneComposerReference, clearFlowDraftBeforeRetry };
