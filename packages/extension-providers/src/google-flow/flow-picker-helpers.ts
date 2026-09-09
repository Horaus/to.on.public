// The provider DOM contract is intentionally structural; its concrete element
// types are supplied by the adapter at runtime.
// @ts-nocheck
type AnyReference = any;
let acceptFlowUploadConsentIfPresent: any;
let clickElementCenterNative: any;
let clickElementNative: any;
let clickElementStrictNative: any;
let clickFlowFrameSlot: any;
let closeMediaPickerIfOpen: any;
let compactText: any;
let compareStartFrameOptions: any;
let composerPanelRoot: any;
let dataUrlToFile: any;
let directFrameAttachmentCount: any;
let dragTileToComposer: any;
let exactReferenceOptionInOpenPicker: any;
let flowDebugSnapshot: any;
let flowStartFrameSlotLooksAttached: any;
let flowStartFrameSlots: any;
let flowStartOrEndFrameSlots: any;
let flowTrace: any;
let humanPause: any;
let isVisible: any;
let lastNativeMouseClickDiagnostic: any;
let lastStartFramePickerDiagnostic: any;
let mediaPickerDialogs: any;
let mediaPickerReferenceOptions: any;
let mediaUploadMenus: any;
let normalizedToken: any;
let pickerHasReadySelectedPreview: any;
let promptAttachmentCount: any;
let referenceRequiredLabel: any;
let referenceSearchTokens: any;
let rememberFlowTileForReference: any;
let reportFlowPageError: any;
let revealReadyImageTileLabels: any;
let runFlowMainWorldAction: any;
let simulateClick: any;
let sleep: any;
let tileHasReadyMedia: any;
let tileLooksBusy: any;
let tileMatchesReference: any;
let tileSearchText: any;
let tileVisuallyMatchesReference: any;
let visibleText: any;
let waitForComposerReference: any;
let waitForFileInput: any;
let waitForPromptAttachmentIncrease: any;
let waitForTileReady: any;
let referenceLocalFilePath: any;

export function configureFlowPickerHelpers(next: Record<string, any>): void {
  acceptFlowUploadConsentIfPresent = next.acceptFlowUploadConsentIfPresent;
  clickElementCenterNative = next.clickElementCenterNative;
  clickElementNative = next.clickElementNative;
  clickElementStrictNative = next.clickElementStrictNative;
  clickFlowFrameSlot = next.clickFlowFrameSlot;
  closeMediaPickerIfOpen = next.closeMediaPickerIfOpen;
  compactText = next.compactText;
  compareStartFrameOptions = next.compareStartFrameOptions;
  composerPanelRoot = next.composerPanelRoot;
  dataUrlToFile = next.dataUrlToFile;
  directFrameAttachmentCount = next.directFrameAttachmentCount;
  dragTileToComposer = next.dragTileToComposer;
  exactReferenceOptionInOpenPicker = next.exactReferenceOptionInOpenPicker;
  flowDebugSnapshot = next.flowDebugSnapshot;
  flowStartFrameSlotLooksAttached = next.flowStartFrameSlotLooksAttached;
  flowStartFrameSlots = next.flowStartFrameSlots;
  flowStartOrEndFrameSlots = next.flowStartOrEndFrameSlots;
  flowTrace = next.flowTrace;
  humanPause = next.humanPause;
  isVisible = next.isVisible;
  lastNativeMouseClickDiagnostic = next.lastNativeMouseClickDiagnostic;
  lastStartFramePickerDiagnostic = next.lastStartFramePickerDiagnostic;
  mediaPickerDialogs = next.mediaPickerDialogs;
  mediaPickerReferenceOptions = next.mediaPickerReferenceOptions;
  mediaUploadMenus = next.mediaUploadMenus;
  normalizedToken = next.normalizedToken;
  pickerHasReadySelectedPreview = next.pickerHasReadySelectedPreview;
  promptAttachmentCount = next.promptAttachmentCount;
  referenceRequiredLabel = next.referenceRequiredLabel;
  referenceSearchTokens = next.referenceSearchTokens;
  rememberFlowTileForReference = next.rememberFlowTileForReference;
  reportFlowPageError = next.reportFlowPageError;
  revealReadyImageTileLabels = next.revealReadyImageTileLabels;
  runFlowMainWorldAction = next.runFlowMainWorldAction;
  simulateClick = next.simulateClick;
  sleep = next.sleep;
  tileHasReadyMedia = next.tileHasReadyMedia;
  tileLooksBusy = next.tileLooksBusy;
  tileMatchesReference = next.tileMatchesReference;
  tileSearchText = next.tileSearchText;
  tileVisuallyMatchesReference = next.tileVisuallyMatchesReference;
  visibleText = next.visibleText;
  waitForComposerReference = next.waitForComposerReference;
  waitForFileInput = next.waitForFileInput;
  waitForPromptAttachmentIncrease = next.waitForPromptAttachmentIncrease;
  waitForTileReady = next.waitForTileReady;
  referenceLocalFilePath = next.referenceLocalFilePath;
}

async function waitForAddToPromptMenuItem(timeoutMs = 2500, root: ParentNode = document): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const menuItems = Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"], button, [role="button"]'))
      .filter((element) => isVisible(element));
    const exactAddItem = menuItems.find((item) => /thêm vào câu lệnh|add to prompt|use in prompt/i.test(visibleText(item)));
    if (exactAddItem) return exactAddItem;
    const addItem = menuItems.find((item) => /add to|khung bắt đầu|start frame|first frame|add as start/i.test(visibleText(item)));
    if (addItem) return addItem;
    await sleep(150);
  }
  return null;
}

async function waitForMediaPickerContent(root: ParentNode, timeoutMs = 6500): Promise<{ picker: HTMLElement; options: HTMLElement[] }> {
  const startedAt = Date.now();
  let currentRoot = root as HTMLElement;
  while (Date.now() - startedAt < timeoutMs) {
    currentRoot = mediaPickerDialogs().at(-1) || currentRoot;
    const options = mediaPickerReferenceOptions(currentRoot);
    if (options.length > 0) return { picker: currentRoot, options };
    if (await waitForAddToPromptMenuItem(250, currentRoot)) return { picker: currentRoot, options: mediaPickerReferenceOptions(currentRoot) };
    await sleep(250);
  }
  currentRoot = mediaPickerDialogs().at(-1) || currentRoot;
  return { picker: currentRoot, options: mediaPickerReferenceOptions(currentRoot) };
}

async function waitForPickerReference(jobId: string, picker: HTMLElement, reference?: any, timeoutMs = 5000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const options = mediaPickerReferenceOptions(mediaPickerDialogs().at(-1) || picker);
    if (reference ? options.some((option) => tileMatchesReference(reference, option)) : options.some((option) => /\.(png|jpe?g|webp)/i.test(tileSearchText(option)))) return true;
    await sleep(250);
  }
  return false;
}

async function ensureFlowPickerInventoryCategory(jobId: string, picker: HTMLElement, reference?: any): Promise<void> {
  const inventoryCategory = Array.from(picker.querySelectorAll<HTMLElement>("button, [role='button'], [role='tab']"))
    .filter(isVisible)
    .find((element) => /^(?:dashboard\s*)?(?:tất cả|all)$/i.test(compactText(visibleText(element), 40))) || null;
  if (!inventoryCategory) return;
  const selected = inventoryCategory.getAttribute("aria-selected") === "true"
    || inventoryCategory.getAttribute("data-state") === "active";
  if (selected) return;
  flowTrace(jobId, `Switching Flow component picker inventory to "${compactText(visibleText(inventoryCategory), 40)}".`, 0.328);
  if (!(await clickElementStrictNative(inventoryCategory))) return;
  if (await waitForPickerReference(jobId, picker, reference)) return;
  const livePicker = mediaPickerDialogs().at(-1) || picker;
  const uploadsCategory = Array.from(livePicker.querySelectorAll<HTMLElement>("button, [role='button'], [role='tab']"))
    .filter(isVisible)
    .find((element) => /(?:tệp tải lên|uploads?|uploaded files?)/i.test(compactText(visibleText(element), 50))) || null;
  if (!uploadsCategory) return;
  flowTrace(jobId, `Flow all-assets inventory did not expose uploaded filenames; switching to "${compactText(visibleText(uploadsCategory), 50)}".`, 0.329);
  if (!(await clickElementStrictNative(uploadsCategory))) return;
  await waitForPickerReference(jobId, livePicker, reference);
}

async function waitForExactReferenceOptionInPicker(
  reference: any | undefined,
  initialPicker: HTMLElement,
  timeoutMs = 30000,
  requiredStableObservations = 3
): Promise<{ picker: HTMLElement; option: HTMLElement } | null> {
  const startedAt = Date.now();
  let picker = initialPicker;
  let stableObservations = 0;
  while (Date.now() - startedAt < timeoutMs) {
    picker = mediaPickerDialogs().at(-1) || picker;
    const options = mediaPickerReferenceOptions(picker);
    const textMatches = options.filter((candidate) => tileMatchesReference(reference, candidate));
    let exactOption = exactReferenceOptionInOpenPicker(reference)
      || (textMatches.length === 1 ? textMatches[0] : null);
    if (!exactOption) {
      // A localized/virtualized picker may not expose the filename token at
      // all. Scan every visible option by fingerprint in that case; scanning
      // only token matches would fall through to the unsafe composer-upload
      // path even when the exact image is already present.
      for (const candidate of (textMatches.length > 1 ? textMatches : options)) {
        if (await tileVisuallyMatchesReference(reference, candidate)) {
          exactOption = candidate;
          break;
        }
      }
    }
    if (exactOption && isReadyExactReferenceOption(exactOption, picker)) {
      stableObservations++;
      if (stableObservations >= requiredStableObservations) return { picker, option: exactOption };
    } else {
      stableObservations = 0;
    }
    await sleep(400);
  }
  return null;
}

function isReadyExactReferenceOption(option: HTMLElement, picker: HTMLElement): boolean {
  return document.contains(option) && isVisible(option) && !tileLooksBusy(option)
    && (tileHasReadyMedia(option) || pickerHasReadySelectedPreview(picker));
}

async function waitForStartFrameAttachment(jobId: string, beforeFrameCount: number, timeoutMs = 5000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (directFrameAttachmentCount() > beforeFrameCount || flowStartFrameSlotLooksAttached()) {
      flowTrace(jobId, "Flow start-frame slot shows an attached keyframe.", 0.5);
      return true;
    }
    await sleep(250);
  }
  return false;
}

function flowComposerComponentAddButtons(): HTMLElement[] {
  const composerRoot = composerPanelRoot();
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [aria-haspopup='dialog']"))
    .filter((element) => isFlowComponentAddButton(element, composerRoot))
    .sort((left, right) => compareFlowComponentAddButtons(left, right, composerRoot));
  return Array.from(new Set(buttons));
}

function flowComponentButtonMatchesText(text: string): boolean {
  return /add_2|\+|^add$|thêm thành phần|add component|thêm vào câu lệnh|thêm nội dung nghe nhìn lên|tải nội dung nghe nhìn lên|upload media/i.test(text)
    && !/arrow_forward|send|gửi|generate|create(?!.*media)|tạo video|submit/i.test(text);
}

function flowComponentButtonPlacement(element: HTMLElement, composerRoot: HTMLElement | null): boolean {
  const rect = element.getBoundingClientRect();
  return Boolean(composerRoot?.contains(element)) || (rect.top > window.innerHeight * 0.5 && rect.left > window.innerWidth * 0.18 && rect.left < window.innerWidth * 0.75);
}

function flowComponentButtonShape(element: HTMLElement, text: string): boolean {
  const rect = element.getBoundingClientRect();
  const exact = element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "dialog" && rect.width <= 56 && rect.height <= 56 && /add_2|\+|^add$/i.test(text);
  const labelled = /thêm thành phần|add component|thêm nội dung nghe nhìn lên|tải nội dung nghe nhìn lên|upload media/i.test(text)
    && rect.width <= 520 && rect.height <= 120;
  return exact || labelled;
}

function isFlowComponentAddButton(element: HTMLElement, composerRoot: HTMLElement | null): boolean {
  if (!isVisible(element)) return false;
  const text = `${element.getAttribute("aria-label") || ""} ${visibleText(element)}`.trim();
  if (!flowComponentButtonMatchesText(text)) return false;
  return flowComponentButtonPlacement(element, composerRoot) && flowComponentButtonShape(element, text);
}

function compareFlowComponentAddButtons(left: HTMLElement, right: HTMLElement, composerRoot: HTMLElement | null): number {
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  const composerRank = (element: HTMLElement) => composerRoot?.contains(element) ? 0 : 1;
  const exactRank = (element: HTMLElement) => element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "dialog" ? 0 : 1;
  return exactRank(left) - exactRank(right) || composerRank(left) - composerRank(right)
    || rightRect.top - leftRect.top || leftRect.left - rightRect.left;
}

async function openFlowMediaPicker(jobId: string): Promise<HTMLElement | null> {
  const existing = mediaPickerDialogs().at(-1);
  if (existing) return existing;
  if (mediaUploadMenus().length) {
    flowTrace(jobId, "Closing Flow upload menu before opening the component picker.", 0.43);
    await closeMediaPickerIfOpen();
    await humanPause(350, 650);
  }
  const orderedButtons = flowComposerComponentAddButtons().slice(0, 4);
  for (const button of orderedButtons) {
    const dialog = await openFlowMediaPickerFromButton(jobId, button);
    if (dialog) return dialog;
    await humanPause(450, 800);
  }
  // Fresh Flow projects can expose the media picker through the localized
  // full-size "Thêm nội dung nghe nhìn" control instead of the compact
  // add_2 component button. It is still a composer-owned picker entrypoint;
  // accept it as a bounded fallback when no component button is discoverable.
  // The current Flow composer may expose stale/irrelevant compact add buttons
  // from the asset grid even when the real toolbar media control is the only
  // working entrypoint. Always try the explicit toolbar control after bounded
  // compact-button attempts; gating this fallback on `orderedButtons.length`
  // caused valid pickers to be reported as unavailable.
  {
    const mediaButton = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [aria-label]"))
      .filter(isVisible)
      .find((element) => {
        const ariaLabel = String(element.getAttribute("aria-label") || "").trim();
        const labelText = visibleText(element).trim();
        // Flow may render the material icon name (`add`) together with the
        // localized label, so matching the concatenated string exactly is
        // brittle. Match the semantic label in either channel instead.
        return /add media|thêm nội dung nghe nhìn|tải nội dung nghe nhìn lên/i.test(ariaLabel)
          || /thêm nội dung nghe nhìn|tải nội dung nghe nhìn lên/i.test(labelText);
      });
    if (mediaButton) {
      flowTrace(jobId, `Opening Flow media picker via ${compactText(visibleText(mediaButton), 80)}.`, 0.43);
      const opened = await clickElementStrictNative(mediaButton, true) || await runFlowMainWorldAction("open-component-picker");
      if (opened) return waitForFlowComponentDialog(jobId, 12000);
    }
  }
  if (!orderedButtons.length) {
    flowTrace(jobId, `Flow composer add button was not visible; refusing toolbar upload path. ${flowDebugSnapshot()}`, 0.43);
  } else {
    flowTrace(jobId, `Flow component picker did not open after ${orderedButtons.length} add-button attempt(s). ${flowDebugSnapshot()}`, 0.43);
  }
  return null;
}

async function openFlowMediaPickerFromButton(jobId: string, button: HTMLElement): Promise<HTMLElement | null> {
  flowTrace(jobId, `Opening Flow component picker via ${compactText(visibleText(button), 80) || button.tagName}...`, 0.43);
  let opened = await clickElementStrictNative(button, true);
  if (opened) await waitForMediaPickerDialog(3000);
  else if (!mediaPickerDialogs().length) opened = await runFlowMainWorldAction("open-component-picker");
  if (!opened) {
    flowTrace(jobId, `Native click was unavailable for the exact Flow component add button (${lastNativeMouseClickDiagnostic || "no diagnostic"}).`, 0.43);
    return null;
  }
  return waitForFlowComponentDialog(jobId, 12000);
}

async function waitForMediaPickerDialog(timeoutMs: number) {
  const startedAt = Date.now();
  while (!mediaPickerDialogs().length && Date.now() - startedAt < timeoutMs) await sleep(250);
}

async function waitForFlowComponentDialog(jobId: string, timeoutMs: number): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  let selected = false;
  while (Date.now() - startedAt < timeoutMs) {
    const dialog = mediaPickerDialogs().at(-1);
    if (dialog) return dialog;
    const menuItem = selected ? null : flowComponentMenuItem();
    if (menuItem) {
      selected = true;
      flowTrace(jobId, `Selecting Flow component menu item "${compactText(visibleText(menuItem), 80)}".`, 0.43);
      const clicked = await clickElementStrictNative(menuItem) || await runFlowMainWorldAction("select-component-menu");
      if (!clicked) flowTrace(jobId, `Native click was unavailable for the Flow component menu item (${lastNativeMouseClickDiagnostic || "no diagnostic"}).`, 0.43);
    }
    await sleep(250);
  }
  return null;
}

function flowComponentMenuItem(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [role='menuitem'], [role='option'], div"))
    .filter(isVisible)
    .find((element) => {
      const rect = element.getBoundingClientRect();
      const text = visibleText(element);
      return rect.top > window.innerHeight * 0.45 && rect.width >= 80 && rect.width <= 520
        && rect.height >= 28 && rect.height <= 120
        && /thêm thành phần|add component|component|ingredient|thành phần/i.test(text)
        && !/tải nội dung nghe nhìn|upload|delete|trash|settings|help|video|hình ảnh|image|khung hình/i.test(text);
    }) || null;
}

async function openFlowLibraryUploadMenu(jobId: string): Promise<HTMLElement | null> {
  const existing = mediaUploadMenus().at(-1);
  if (existing) return existing;
  const uploadButtons = flowLibraryUploadButtons();
  for (const button of uploadButtons.slice(0, 3)) {
    flowTrace(jobId, `Opening Flow library upload menu via ${compactText(visibleText(button), 80) || button.tagName}...`, 0.36);
    simulateClick(button);
    const startedAt = Date.now();
    while (Date.now() - startedAt < 3500) {
      const menu = mediaUploadMenus().at(-1);
      if (menu) return menu;
      if (await waitForFileInput(jobId, 300)) return document.body;
      // On the runtime tool route, “Tệp tải lên” is a navigation entrypoint.
      // Flow then renders the actual “Thêm nội dung nghe nhìn” menu button on
      // the project base route; click that second-stage control before giving
      // up so the upload menu can expose its file input.
      const addMedia = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [aria-label]"))
        .filter(isVisible)
        .find((element) => /^(?:add media|thêm nội dung nghe nhìn)$/i.test(`${element.getAttribute("aria-label") || ""} ${visibleText(element)}`.trim())) || null;
      if (addMedia && addMedia !== button) {
        simulateClick(addMedia);
        await humanPause(350, 650);
        const opened = mediaUploadMenus().at(-1);
        if (opened) return opened;
      }
      await sleep(250);
    }
    await humanPause(450, 800);
  }
  return null;
}

function flowLibraryUploadButtons(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [aria-label]"))
    .filter(isFlowLibraryUploadButton)
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top || rightRect.left - leftRect.left;
    });
}

function isFlowLibraryUploadButton(element: HTMLElement): boolean {
  if (!isVisible(element)) return false;
  const rect = element.getBoundingClientRect();
  const text = `${element.getAttribute("aria-label") || ""} ${visibleText(element)}`.trim();
  return rect.top < window.innerHeight * 0.22 && rect.width <= 180 && rect.height <= 90
    // The Flow host localizes this navigation control as “Tệp tải lên” in
    // Vietnamese; it is the upload/library entrypoint used by the custom tool.
    && /thêm nội dung nghe nhìn|add media|tệp tải lên|uploaded media/i.test(text);
}

async function openFlowStartFramePicker(jobId: string): Promise<HTMLElement | null> {
  const existingPicker = mediaPickerDialogs().at(-1);
  if (existingPicker) {
    const existingOptions = mediaPickerReferenceOptions(existingPicker);
    const existingAdd = await waitForAddToPromptMenuItem(300, existingPicker);
    if (existingOptions.length > 0 || existingAdd) {
      flowTrace(jobId, `Using already-open Flow start-frame picker with ${existingOptions.length} option(s).`, 0.43);
      return existingPicker;
    }
    await closeMediaPickerIfOpen();
    await humanPause(250, 500);
  }
  const startSlot = flowStartFrameSlots()[0] || null;
  if (!startSlot) {
    flowTrace(jobId, "No visible Flow start-frame slot matched the composer picker selector.", 0.43);
    return null;
  }
  flowTrace(jobId, `Opening Flow start-frame picker via ${compactText(visibleText(startSlot), 60) || startSlot.tagName}...`, 0.43);
  await clickFlowFrameSlot(startSlot);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 6000) {
    const dialog = mediaPickerDialogs().at(-1);
    if (dialog) return dialog;
    await sleep(250);
  }
  // The live Flow composer uses a div[type=button] for the Bắt đầu slot.
  // A trusted CDP click can land on that div yet miss the delegated React
  // handler during a composer re-render. Invoke the narrow main-world action
  // once against the exact frame-slot contract, then wait once more; this is
  // a bounded click fallback, not a retry loop or a different picker route.
  if (await runFlowMainWorldAction("open-start-frame-picker")) {
    const fallbackStartedAt = Date.now();
    while (Date.now() - fallbackStartedAt < 3100) {
      const dialog = mediaPickerDialogs().at(-1);
      if (dialog) return dialog;
      await sleep(250);
    }
  }
  flowTrace(jobId, `Flow start-frame slot click did not open the media picker (${compactText(visibleText(startSlot), 80) || startSlot.tagName}).`, 0.43);
  return null;
}

function tileSimilarity(left: HTMLElement, right: HTMLElement): boolean {
  const leftText = tileSearchText(left);
  const rightText = tileSearchText(right);
  const leftImage = left.querySelector<HTMLImageElement>("img")?.currentSrc || left.querySelector<HTMLImageElement>("img")?.src || "";
  const rightImage = right.querySelector<HTMLImageElement>("img")?.currentSrc || right.querySelector<HTMLImageElement>("img")?.src || "";
  return Boolean((leftImage && rightImage && leftImage === rightImage) || (leftText && rightText && (leftText.includes(rightText.slice(0, 48)) || rightText.includes(leftText.slice(0, 48)))));
}

function findTileInMediaPicker(tile: HTMLElement, picker: HTMLElement): HTMLElement | null {
  const tileId = tile.dataset.tileId || "";
  const candidates = mediaPickerReferenceOptions(picker);
  if (tileId) {
    const byId = candidates.find((element) => element.dataset.tileId === tileId);
    if (byId) return byId;
  }
  return candidates.find((element) => tileSimilarity(tile, element)) || null;
}

async function exactStartFrameOption(jobId: string, reference: any | undefined, allOptions: HTMLElement[]) {
  const exact = allOptions.filter((candidate) => !reference || tileMatchesReference(reference, candidate)).sort(compareStartFrameOptions)[0];
  if (exact || !reference) return exact || null;
  for (const candidate of allOptions) {
    if (!(await tileVisuallyMatchesReference(reference, candidate))) continue;
    flowTrace(jobId, `Flow start-frame picker matched ${referenceRequiredLabel(reference)} visually because the visible Flow filename differs from the app asset id.`, 0.45);
    rememberFlowTileForReference(reference, candidate);
    return candidate;
  }
  return null;
}

async function confirmStartFrameOption(jobId: string, picker: HTMLElement, option: HTMLElement) {
  const beforeFrameCount = directFrameAttachmentCount();
  flowTrace(jobId, `Selecting exact start-frame picker option "${compactText(visibleText(option), 90)}".`, 0.47);
  await clickElementNative(option);
  await humanPause(700, 1100);
  if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 1400)) {
    await closeMediaPickerIfOpen();
    return true;
  }
  // Flow renders the picker in a new viewport position after selection and
  // keeps “Thêm vào câu lệnh” disabled until the selected row is committed.
  // Re-resolve the live dialog on every bounded observation and require the
  // action to be enabled; clicking the first disabled/stale node leaves the
  // frame visibly selected but never attaches it to Bắt đầu.
  let livePicker = mediaPickerDialogs().at(-1) || picker;
  let addItem: HTMLElement | null = null;
  const addStartedAt = Date.now();
  while (Date.now() - addStartedAt < 4500) {
    livePicker = mediaPickerDialogs().at(-1) || livePicker;
    addItem = Array.from(livePicker.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"], button, [role="button"]'))
      .filter((item) => isVisible(item))
      .find((item) => /thêm vào câu lệnh|add to prompt|use in prompt/i.test(visibleText(item))
        && item.getAttribute("aria-disabled") !== "true"
        && !(item instanceof HTMLButtonElement && item.disabled)) || null;
    if (addItem) break;
    await sleep(150);
  }
  if (addItem) {
    const rect = addItem.getBoundingClientRect();
    flowTrace(jobId, `Confirming exact start-frame picker add action at ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} via "${compactText(visibleText(addItem), 90)}".`, 0.49);
    await clickElementCenterNative(addItem);
    await humanPause(900, 1400);
  }
  return waitForStartFrameAttachment(jobId, beforeFrameCount, 5500);
}

async function attachReferenceThroughVisibleStartPicker(jobId: string, reference: any | undefined): Promise<boolean> {
  lastStartFramePickerDiagnostic = "";
  let picker = await openFlowStartFramePicker(jobId);
  if (!picker) {
    lastStartFramePickerDiagnostic = "picker did not open";
    flowTrace(jobId, "Flow start-frame picker did not open from the visible Bắt đầu slot.", 0.44);
    return false;
  }
  const hydrated = await waitForMediaPickerContent(picker, 7000);
  picker = hydrated.picker;
  const hydratedOptions = hydrated.options;
  await revealReadyImageTileLabels(hydratedOptions.slice(0, 16));
  const allOptions = mediaPickerReferenceOptions(picker);
  const option = await exactStartFrameOption(jobId, reference, allOptions);
  if (!option) {
    lastStartFramePickerDiagnostic = `picker opened with ${allOptions.length} option(s), but none matched ${referenceRequiredLabel(reference)} by text or visual`;
    flowTrace(jobId, `Flow start-frame picker opened, but no exact option matched ${referenceRequiredLabel(reference)}.`, 0.44);
    await closeMediaPickerIfOpen();
    return false;
  }
  lastStartFramePickerDiagnostic = `picker matched option "${compactText(visibleText(option), 120)}" among ${allOptions.length} option(s)`;
  const attached = await confirmStartFrameOption(jobId, picker, option);
  if (!attached) {
    lastStartFramePickerDiagnostic = `${lastStartFramePickerDiagnostic}; picker confirmation did not attach (${lastNativeMouseClickDiagnostic || "no native diagnostic"})`;
    flowTrace(jobId, `Flow did not attach after picker confirmation (${lastNativeMouseClickDiagnostic || "no native diagnostic"}). ${flowDebugSnapshot()}`, 0.49);
  }
  if (attached) await closeMediaPickerIfOpen();
  return attached;
}

async function uploadReferenceThroughStartFramePicker(jobId: string, reference: any): Promise<boolean> {
  const file = dataUrlToFile(reference);
  if (!file) throw new Error(`No usable keyframe file data was available for ${referenceRequiredLabel(reference)}.`);
  let picker = await openFlowStartFramePicker(jobId);
  if (!picker) {
    throw new Error(`Flow start-frame picker did not open, so the app will not upload ${referenceRequiredLabel(reference)} through the media-grid fallback. ${flowDebugSnapshot()}`);
  }
  await revealReadyImageTileLabels(mediaPickerReferenceOptions(picker).slice(0, 16));
  if (mediaPickerReferenceOptions(picker).some((candidate) => tileMatchesReference(reference, candidate))) {
    return await attachReferenceThroughVisibleStartPicker(jobId, reference);
  }

  try {
    await stageStartFramePickerUpload(jobId, picker, file, reference);
  } catch (error) {
    if (!/no file input/i.test(error instanceof Error ? error.message : String(error))) throw error;
    // The current Angular Flow picker is a library selector and deliberately
    // has no file input. TobyFlow uploads through the project media-library
    // entrypoint, then reopens this picker to select the newly hydrated tile.
    flowTrace(jobId, `Flow start-frame picker has no upload input; using the single media-library upload path for ${referenceRequiredLabel(reference)}.`, 0.44);
    await closeMediaPickerIfOpen();
    await humanPause(350, 650);
    const uploadMenu = await openFlowLibraryUploadMenu(jobId);
    let chooserUploadAccepted = false;
    if (uploadMenu) {
      const uploadItem = Array.from(uploadMenu.querySelectorAll<HTMLElement>("button, [role='button'], [role='menuitem'], [role='option'], div"))
        .filter(isVisible)
        .find((element) => /(?:tải lên|upload)/i.test(compactText(visibleText(element), 40))
          && !/(?:bộ sưu tập|collection|tạo nhân vật|character|cảnh mới|new scene)/i.test(compactText(visibleText(element), 80))) || null;
      if (uploadItem) {
        const uploadRect = uploadItem.getBoundingClientRect();
        const localFilePath = String(referenceLocalFilePath?.(reference) || reference?.localFilePath || "");
        const nativeChooserUpload = localFilePath
          ? await chrome.runtime.sendMessage({ source: "google-flow-adapter", type: "NATIVE_UPLOAD_FILE_CHOOSER", x: uploadRect.left + uploadRect.width / 2, y: uploadRect.top + uploadRect.height / 2, filePaths: [localFilePath] }).catch(() => ({ ok: false }))
          : { ok: false };
        chooserUploadAccepted = nativeChooserUpload?.ok === true;
        if (!chooserUploadAccepted) {
          await clickElementNative(uploadItem);
          await humanPause(450, 750);
        } else {
          await humanPause(900, 1400);
        }
      }
    }
    if (chooserUploadAccepted) {
      await humanPause(900, 1400);
      picker = await openFlowStartFramePicker(jobId);
      if (!picker) throw new Error(`Flow media-library upload completed, but the start-frame picker did not reopen for ${referenceRequiredLabel(reference)}. ${flowDebugSnapshot()}`);
    }
    const input = chooserUploadAccepted ? null : await waitForFileInput(jobId, 5000, document);
    if (chooserUploadAccepted) {
      // The combined native path already selected the local file in Flow's
      // chooser and reopened the picker above; do not send a second file
      // assignment through the stale chooser-node fallback.
    } else if (input) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const nativeFilesSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files")?.set;
      if (nativeFilesSetter) nativeFilesSetter.call(input, transfer.files); else input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const localFilePath = String(referenceLocalFilePath?.(reference) || reference?.localFilePath || "");
      const nativeUpload = localFilePath
        ? await chrome.runtime.sendMessage({ source: "google-flow-adapter", type: "NATIVE_SET_FILE_INPUT", filePaths: [localFilePath] }).catch(() => ({ ok: false }))
        : { ok: false };
      if (!nativeUpload?.ok) throw error;
      flowTrace(jobId, `Flow native file chooser accepted ${referenceRequiredLabel(reference)} through the background CDP file target.`, 0.45);
    }
    await humanPause(900, 1400);
    if (!chooserUploadAccepted) {
      picker = await openFlowStartFramePicker(jobId);
      if (!picker) throw new Error(`Flow media-library upload completed, but the start-frame picker did not reopen for ${referenceRequiredLabel(reference)}. ${flowDebugSnapshot()}`);
    }
  }
  flowTrace(jobId, `Uploaded exactly one keyframe through the start-frame picker: ${referenceRequiredLabel(reference)}.`, 0.45);
  await acceptFlowUploadConsentIfPresent(jobId);

  const beforeFrameCount = directFrameAttachmentCount();
  if (await waitForUploadedStartFrame(jobId, picker, reference, beforeFrameCount)) return true;
  await closeMediaPickerIfOpen();
  throw new Error(`Uploaded ${referenceRequiredLabel(reference)} through the start-frame picker, but Flow did not expose or attach the exact uploaded option within 45s. ${flowDebugSnapshot()}`);
}

async function stageStartFramePickerUpload(jobId: string, picker: HTMLElement, file: File, reference: any): Promise<void> {
  const uploadControl = Array.from(picker.querySelectorAll<HTMLElement>("button, [role='button'], [role='menuitem'], div")).filter(isVisible).find((element) => /tải nội dung nghe nhìn lên|upload media|upload/i.test(visibleText(element)));
  if (uploadControl) { await clickElementNative(uploadControl); await humanPause(500, 900); }
  const input = await waitForFileInput(jobId, 5000);
  if (!input) throw new Error(`Flow start-frame picker has no file input for ${referenceRequiredLabel(reference)}. ${flowDebugSnapshot()}`);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const nativeFilesSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files")?.set;
  if (nativeFilesSetter) nativeFilesSetter.call(input, transfer.files); else input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForUploadedStartFrame(jobId: string, picker: HTMLElement, reference: any, beforeFrameCount: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    if (reportFlowPageError(jobId)) throw new Error(`Google Flow crashed while uploading ${referenceRequiredLabel(reference)} through the start-frame picker. ${flowDebugSnapshot()}`);
    if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 600)) { await closeMediaPickerIfOpen(); rememberFlowTileForReference(reference, flowStartOrEndFrameSlots()[0] || document.body); return true; }
    const livePicker = mediaPickerDialogs().at(-1) || picker;
    await revealReadyImageTileLabels(mediaPickerReferenceOptions(livePicker).slice(0, 16));
    const exactOption = mediaPickerReferenceOptions(livePicker).find((candidate) => tileMatchesReference(reference, candidate));
    if (exactOption) {
      await clickElementNative(exactOption);
      await humanPause(800, 1300);
      const addItem = await waitForAddToPromptMenuItem(4500, livePicker);
      if (addItem) await clickElementNative(addItem);
      if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 7000)) { await closeMediaPickerIfOpen(); return true; }
    }
    await sleep(800);
  }
  return false;
}

function exactPickerTarget(reference: any | undefined, tile: HTMLElement, livePicker: HTMLElement, pickerRoots: HTMLElement[], hydratedOption?: HTMLElement) {
  if (!reference) return findTileInMediaPicker(tile, livePicker);
  const referenceTokens = reference ? referenceSearchTokens(reference) : [];
  const selectedExactOption = pickerRoots
    .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>("[role='option'][aria-selected='true']")))
    .find((option) => referenceTokens.includes(normalizedToken(option.querySelector<HTMLImageElement>("img[alt]")?.alt || "")));
  return hydratedOption || selectedExactOption
    || mediaPickerReferenceOptions(livePicker).find((candidate) => tileMatchesReference(reference, candidate))
    || findTileInMediaPicker(tile, livePicker)
    || pickerRoots.flatMap((root) => Array.from(root.querySelectorAll<HTMLImageElement>("img[alt]"))).find((image) => referenceTokens.includes(normalizedToken(image.alt || "")))
    || null;
}

function selectedPickerTargetMatchesReference(reference: any | undefined, target: HTMLElement | null): boolean {
  if (!reference || !target || target.getAttribute("aria-selected") !== "true") return false;
  const tokens = referenceSearchTokens(reference);
  const label = normalizedToken(`${visibleText(target)} ${target.querySelector<HTMLImageElement>("img[alt]")?.alt || ""}`);
  return tokens.some((token) => label.includes(token) || token.includes(label));
}

async function waitForExactPickerSelection(reference: any | undefined, timeoutMs: number): Promise<boolean> {
  if (!reference) return true;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const selected = mediaPickerDialogs()
      .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>("[role='option'][aria-selected='true']")))
      .some((option) => tileMatchesReference(reference, option));
    if (selected) return true;
    await sleep(150);
  }
  return false;
}

async function selectExactPickerTarget(jobId: string, target: HTMLElement, reference?: any): Promise<boolean> {
  if (target.getAttribute("aria-selected") === "true") {
    const selectedPicker = mediaPickerDialogs().at(-1);
    const readyAddAction = selectedPicker ? await waitForAddToPromptMenuItem(500, selectedPicker) : null;
    if (readyAddAction) {
      // The exact, uniquely matched row is already selected and Flow exposes
      // the final semantic commit action. Clicking the row again can deselect
      // it or navigate to its asset viewer; proceed directly to the bounded
      // add-to-prompt step instead.
      flowTrace(jobId, `Exact Flow picker reference is already selected with a ready add-to-prompt action (${referenceRequiredLabel(reference)}).`, 0.44);
      return true;
    }
    // A highlighted Flow row can also be an asset-viewer button. Prefer the
    // picker semantic action first so selecting an exact reference does not
    // navigate the workspace to /edit/<asset> and lose the composer route.
    const semanticSelection = reference ? await runFlowMainWorldAction("select-reference", referenceRequiredLabel(reference)) : false;
    if (semanticSelection && await waitForExactPickerSelection(reference, 5000)) {
      flowTrace(jobId, "Exact Flow picker reference selected through the picker semantic action; keeping the composer route.", 0.44);
      await humanPause(500, 800);
      return true;
    }
    flowTrace(jobId, "Exact Flow picker reference is highlighted; confirming it with one native selection fallback before add-to-prompt.", 0.44);
    // In the current Flow picker `aria-selected=true` can mean the row is
    // merely highlighted, not that it has been attached. A real selection
    // click is what commits that row and may close the picker while the
    // composer chip hydrates. Do it once, then let commitPickerTarget observe
    // the attachment transition; never loop or click a second time here.
    const clicked = await clickElementStrictNative(target);
    if (clicked) {
      await humanPause(500, 800);
      return true;
    }
  }
  const semanticSelection = reference ? await runFlowMainWorldAction("select-reference", referenceRequiredLabel(reference)) : false;
  const selected = semanticSelection && await waitForExactPickerSelection(reference, 5000)
    || await clickElementStrictNative(target) && await waitForExactPickerSelection(reference, 8000);
  if (!selected) flowTrace(jobId, `No trusted selection path was available for the exact Flow picker reference (${lastNativeMouseClickDiagnostic || "no diagnostic"}).`, 0.44);
  else if (semanticSelection) flowTrace(jobId, `Confirmed the exact Flow picker reference selection before add-to-prompt (${referenceRequiredLabel(reference!)}).`, 0.44);
  if (selected) await humanPause(500, 800);
  return selected;
}

async function commitPickerTarget(jobId: string, livePicker: HTMLElement, beforeAttachmentCount: number, reference?: any): Promise<boolean> {
  if (promptAttachmentCount() > beforeAttachmentCount || await waitForComposerReference(jobId, 1200, "components", reference)) {
    await closeMediaPickerIfOpen();
    return true;
  }
  return commitSelectedPickerItem(jobId, livePicker, beforeAttachmentCount, reference);
}

async function commitSelectedPickerItem(jobId: string, livePicker: HTMLElement, beforeAttachmentCount: number, reference?: any): Promise<boolean> {
  const currentPicker = mediaPickerDialogs().at(-1) || livePicker;
  const addItem = await waitForAddToPromptMenuItem(6500, currentPicker);
  if (!addItem) {
    flowTrace(jobId, `Flow component picker selected the matched keyframe, but no "Thêm vào câu lệnh" action appeared. picker="${compactText(visibleText(currentPicker), 180)}"`, 0.46);
    await closeMediaPickerIfOpen();
    return false;
  }
  flowTrace(jobId, `Selecting keyframe via "${compactText(visibleText(addItem), 90)}"...`, 0.46);
  // Selection is now verified against Flow's exact aria-selected option. Use
  // the same revalidated native press as a person for the final add action;
  // page-world .click() can close a freshly hydrated picker without committing
  // its React attachment state.
  let addClicked = await clickElementStrictNative(addItem);
  if (!addClicked) {
    addClicked = await runFlowMainWorldAction("add-to-prompt");
  }
  if (!addClicked) {
    flowTrace(jobId, `No trusted click path was available for Flow add-to-prompt (${lastNativeMouseClickDiagnostic || "no diagnostic"}).`, 0.46);
    await closeMediaPickerIfOpen();
    return false;
  }
  await humanPause(900, 1400);
  if (await waitForPromptAttachmentIncrease(beforeAttachmentCount, 3500)) {
    await closeMediaPickerIfOpen();
    if (reference) {
      flowTrace(jobId, `Flow attached the exact picker option for ${referenceRequiredLabel(reference)} through the semantic add action.`, 0.5);
    }
    return true;
  }
  const retryPicker = mediaPickerDialogs().at(-1);
  const retryAddItem = retryPicker ? await waitForAddToPromptMenuItem(1200, retryPicker) : null;
  if (retryAddItem && await runFlowMainWorldAction("add-to-prompt")) {
    flowTrace(jobId, "Flow native add action did not hydrate the composer; retrying the still-visible picker action once in the page world.", 0.48);
    await humanPause(900, 1400);
  }
  // The current Flow picker can close immediately while its exact selected
  // component thumbnail hydrates in the composer much later. Keep observing
  // the accepted 0-to-1 transition instead of treating that delay as a failed
  // attach and retrying/uploading the same reference again.
  const attached = await waitForPromptAttachmentIncrease(beforeAttachmentCount, 75000);
  await closeMediaPickerIfOpen();
  if (attached && reference) {
    flowTrace(jobId, `Flow attached the exact picker option for ${referenceRequiredLabel(reference)}; accepting the confirmed 0-to-1 composer attachment transition.`, 0.5);
  }
  return attached;
}

async function addTileToPromptViaPicker(jobId: string, tile: HTMLElement, beforeAttachmentCount: number, reference?: any): Promise<boolean> {
  const picker = await openFlowMediaPicker(jobId);
  if (!picker) {
    flowTrace(jobId, "Flow component picker was not available; skipping direct tile click to avoid crashing the project page.", 0.44);
    return false;
  }
  if (reference) await revealReadyImageTileLabels(mediaPickerReferenceOptions(picker).slice(0, 20));
  // The picker is already hydrated by openFlowMediaPicker. A virtualized row
  // may never satisfy the strict geometry matcher even while its exact,
  // aria-selected option is visible, so keep this probe short and let
  // exactPickerTarget use the selected-row fallback instead of blocking the
  // job for the old two-minute inventory timeout.
  const exactHydrated = reference ? await waitForExactReferenceOptionInPicker(reference, picker, 8000) : null;
  const livePicker = exactHydrated?.picker || mediaPickerDialogs().at(-1) || picker;
  const pickerRoots = Array.from(new Set([...mediaPickerDialogs(), livePicker]));
  const target = exactPickerTarget(reference, tile, livePicker, pickerRoots, exactHydrated?.option);
  if (!target || (reference && !tileMatchesReference(reference, target) && !selectedPickerTargetMatchesReference(reference, target))) {
    if (reference) flowTrace(jobId, `Flow component picker opened, but no picker item matched ${referenceRequiredLabel(reference)}.`, 0.44);
    await closeMediaPickerIfOpen();
    return false;
  }
  if (exactHydrated) flowTrace(jobId, `Flow component picker hydrated the exact reference before attach (${compactText(tileSearchText(target), 90)}).`, 0.44);
  flowTrace(jobId, "Selecting keyframe inside Flow component picker...", 0.44);
  if (!await selectExactPickerTarget(jobId, target, reference)) {
    await closeMediaPickerIfOpen();
    return false;
  }
  return commitPickerTarget(jobId, livePicker, beforeAttachmentCount, reference);
}

async function addTileToPromptViaStartFramePicker(jobId: string, tile: HTMLElement, beforeAttachmentCount: number, reference?: any): Promise<boolean> {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await humanPause(250, 450);
  const picker = await openFlowStartFramePicker(jobId);
  if (!picker) return false;
  if (reference) await revealReadyImageTileLabels(mediaPickerReferenceOptions(picker).slice(0, 16));
  const target = reference
    ? mediaPickerReferenceOptions(picker).find((candidate) => tileMatchesReference(reference, candidate)) || findTileInMediaPicker(tile, picker)
    : findTileInMediaPicker(tile, picker);
  if (!target || (reference && !tileMatchesReference(reference, target))) {
    flowTrace(jobId, `Flow start-frame picker opened, but no tile matched ${referenceRequiredLabel(reference)}.`, 0.44);
    await closeMediaPickerIfOpen();
    return false;
  }
  flowTrace(jobId, `Selecting matched keyframe in Flow start-frame picker (${compactText(tileSearchText(target), 90)}).`, 0.46);
  const beforeFrameCount = directFrameAttachmentCount();
  await clickElementNative(target);
  await humanPause(650, 1050);
  if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 1400)) {
    await closeMediaPickerIfOpen();
    return true;
  }
  const livePicker = mediaPickerDialogs().at(-1) || picker;
  const addItem = await waitForAddToPromptMenuItem(5500, livePicker);
  if (!addItem) {
    await closeMediaPickerIfOpen();
    return false;
  }
  flowTrace(jobId, `Attaching matched keyframe via start-frame picker "${compactText(visibleText(addItem), 90)}"...`, 0.48);
  await clickElementNative(addItem);
  await humanPause(900, 1400);
  const attached = await waitForStartFrameAttachment(jobId, beforeFrameCount, 7000)
    || await waitForPromptAttachmentIncrease(beforeAttachmentCount, 2000);
  await closeMediaPickerIfOpen();
  return attached;
}

async function addExactReferenceTile(jobId: string, tile: HTMLElement, beforeAttachmentCount: number, reference: any): Promise<boolean> {
  if (await addTileToPromptViaPicker(jobId, tile, beforeAttachmentCount, reference)) return true;
  if (promptAttachmentCount() > beforeAttachmentCount || await waitForComposerReference(jobId, 1200, "components", reference)) return true;
  flowTrace(jobId, `Flow component picker did not attach the exact ${referenceRequiredLabel(reference)}. Refusing tile-menu/grid fallback because it can create wrong-reference or text-only videos.`, 0.44);
  return false;
}

async function addTileWithFallbackStrategy(jobId: string, tile: HTMLElement, beforeAttachmentCount: number, allowPickerFallback: boolean, reference?: any): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!(await waitForTileReady(tile, 5000))) {
      flowTrace(jobId, `Keyframe tile is not ready for context menu yet (attempt ${attempt}/3).`, 0.42);
      continue;
    }
    if (!allowPickerFallback) {
      if (await attachReferenceThroughVisibleStartPicker(jobId, reference)) return true;
      if (await addTileToPromptViaStartFramePicker(jobId, tile, beforeAttachmentCount, reference)) return true;
      flowTrace(jobId, `Keyframe tile could not be attached through the video start-frame picker (attempt ${attempt}/3). Refusing direct drag because it does not match the verified manual Flow path.`, 0.44);
      await humanPause(900, 1400);
      return false;
    }
    if (await addTileToPromptViaPicker(jobId, tile, beforeAttachmentCount, reference)) return true;
    if (promptAttachmentCount() > beforeAttachmentCount || await waitForComposerReference(jobId, 1200, "components", reference)) return true;
    if (await dragTileToComposer(jobId, tile, beforeAttachmentCount, 5)) return true;
    flowTrace(jobId, `Flow component picker did not attach the keyframe (attempt ${attempt}/3); no verified tile-menu attach path succeeded.`, 0.44);
    return false;
  }
  return false;
}

async function addTileToPrompt(jobId: string, tile: HTMLElement, beforeAttachmentCount: number, allowPickerFallback = true, reference?: any): Promise<boolean> {
  if (allowPickerFallback && reference) return addExactReferenceTile(jobId, tile, beforeAttachmentCount, reference);
  return addTileWithFallbackStrategy(jobId, tile, beforeAttachmentCount, allowPickerFallback, reference);
}


export { waitForAddToPromptMenuItem, waitForMediaPickerContent, waitForPickerReference, ensureFlowPickerInventoryCategory, waitForExactReferenceOptionInPicker, isReadyExactReferenceOption, waitForStartFrameAttachment, flowComposerComponentAddButtons, flowComponentButtonMatchesText, flowComponentButtonPlacement, flowComponentButtonShape, isFlowComponentAddButton, compareFlowComponentAddButtons, openFlowMediaPicker, openFlowMediaPickerFromButton, waitForMediaPickerDialog, waitForFlowComponentDialog, flowComponentMenuItem, openFlowLibraryUploadMenu, flowLibraryUploadButtons, isFlowLibraryUploadButton, openFlowStartFramePicker, tileSimilarity, findTileInMediaPicker, exactStartFrameOption, confirmStartFrameOption, attachReferenceThroughVisibleStartPicker, uploadReferenceThroughStartFramePicker, stageStartFramePickerUpload, waitForUploadedStartFrame, exactPickerTarget, selectedPickerTargetMatchesReference, waitForExactPickerSelection, selectExactPickerTarget, commitPickerTarget, commitSelectedPickerItem, addTileToPromptViaPicker, addTileToPromptViaStartFramePicker, addExactReferenceTile, addTileWithFallbackStrategy, addTileToPrompt };
