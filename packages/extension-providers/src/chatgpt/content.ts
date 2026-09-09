console.log("[Studio] ChatGPT adapter loaded");

import { extractBalancedJsonObject, hasDegenerateStructuredTail, normalizeAssistantText } from "./text-normalization";
import { extractLatestCompleteStoryJson, extractLatestCompleteStructuredJson, hasCompleteStructuredJson, isCompleteStoryJsonCandidate, isCompleteStructuredJsonCandidate, isStructuredTask } from "./structured-recovery";
import { markChatGptReferenceConfirmed, registeredChatGptReference, referenceFingerprint, type ChatGptReferenceRegistryEntry } from "./reference-registry";
import { resolveTextWaitPolicy, type TextReasoningTier, type TextWaitPolicy } from "./text-wait-policy";
import { finalizeImageRecovery as finalizeImageRecoveryBoundary, recoveredImageAsset } from "./image-recovery";
import { selectReasoningTier } from "./reasoning-control";
import { createChatGptReferenceLibrary } from "./reference-library";
import { configureChatGptVisualRuntime, getAssistantTurns, getConversationTurns, getReadableChatTextSources, getLatestCompleteStoryText, getLatestAssistantText, getLatestAssistantOnlyText, getLatestMountedAssistantText, getLatestQuickVisualAnalysisText, extractLatestQuickVisualAnalysisFromPage, getImageFileId, generatedImageAlt, chatGptAssetUrl, isGeneratedImage, generatedImageSortWeight, imageCandidateAllowed, getImageCandidates, isGenerating, waitForGenerationIdle, captureBaseline, getNewestAssistantTurn, getAssistantTurnForJob, findJobMarkerIndex, assistantTurnsAfterMarker, getCompleteStructuredTextForJob, isNewAssistantTextSinceBaseline, isStructuredProviderPayload, firstProviderError, detectProviderError, conversationPath, isLoginPage, waitForImageResults, visibleChatGptRetryButton, retryTransientImageError, assertImageProviderHealthy, assertImageWaitNotStalled, reportImageWaitProgress, pollImageResult, updateImageWaitState, reportStableImageCandidates } from "./visual-runtime";

declare global {
  interface Window {
    __studioChatGptAdapterVersion?: string;
    __studioChatGptAdapterListener?: Parameters<typeof chrome.runtime.onMessage.addListener>[0];
    __studioChatGptAcceptedJobIds?: Set<string>;
  }
}

const ADAPTER_VERSION = "chatgpt-result-baseline-v12+verified-reference-upload-v22+asset-library-reuse+structured-json-tail-recovery-v23+mounted-assistant-v24";

type JobPayload = {
  jobId: string;
  prompt: string;
  task: string;
  settings?: {
    newConversation?: boolean;
    freshConversationNavigated?: boolean;
    pipelineStage?: string;
    sessionKey?: string;
    reusePreviousContext?: boolean;
    storyboardSceneOrder?: number;
    storyboardSceneCount?: number;
    storyboardSequenceId?: string;
  };
  references?: Array<{ assetId: string; base64?: string; filePath?: string; mimeType?: string; filename?: string }>;
};

type ConversationBaseline = {
  assistantCount: number;
  turnCount: number;
  latestAssistantText: string;
  imageFileIds: Set<string>;
  url: string;
  capturedAt: number;
};

type ImageCandidate = {
  src: string;
  alt: string;
  fileId: string;
};

type ReferencePayload = NonNullable<JobPayload["references"]>[number];

function normalizedUiLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function simulateUiClick(element: Element): void {
  const target = element as HTMLElement;
  target.scrollIntoView({ block: "center", inline: "center" });
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX, clientY, pointerType: "mouse" }));
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX, clientY }));
  target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, clientX, clientY, pointerType: "mouse" }));
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX, clientY }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX, clientY }));
}
const selectChatGptReasoningTier = (jobId: string, tier: TextReasoningTier) => selectReasoningTier(jobId, tier, { normalizedUiLabel, simulateUiClick, visibleElement: (element) => Boolean(visibleElement(element)), sleep, reportStatus: (jobId, status, message) => reportStatus(jobId, status, message) });
const { reuseReference: tryReuseReferenceFromChatGptLibrary } = createChatGptReferenceLibrary({
  findLauncher: () => findChatGptLibraryPickerLauncher() ?? null, findTile: (filename) => findChatGptLibraryTile(filename) ?? null, visibleRoots: () => visibleMenuOrDialogRoots(),
  closePicker: closeChatGptPicker, composerHasFilename: (filename) => composerContainsReferenceFilename(filename), attachmentCount: (references) => composerAttachmentCount(references),
  waitForUpload: (jobId, references, beforeCount) => waitForReferenceUpload(jobId, references, beforeCount), registeredReference: (reference) => registeredChatGptReference(reference),
  confirmReference: (reference) => markChatGptReferenceConfirmed(reference), simulateClick: simulateUiClick, sleep, reportStatus: (jobId, status, message) => reportStatus(jobId, status, message)
});

class RetryableImageWaitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableImageWaitError";
  }
}

const SELECTORS = {
  promptInput: ["#prompt-textarea", 'div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]', 'textarea[placeholder*="Message"]'],
  submitButton: ['[data-testid="send-button"]', 'button[aria-label="Send message"]', 'button[aria-label*="Send" i]', 'button[type="submit"]'],
  resultContainer: [
    'div[data-message-author-role="assistant"]',
    '[data-testid^="conversation-turn-"] [data-message-author-role="assistant"]',
    '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
    ".agent-turn"
  ],
  conversationTurn: ['[data-testid^="conversation-turn-"]', "[data-message-author-role]"],
  images: ['img[alt^="Generated image"]', 'img[src^="blob:"]', 'img[src*="/backend-api/"]', 'img[src*="oaiusercontent.com"]', 'img[src*="oaidalleapiprodscus.blob.core.windows.net"]', 'img[src*="estuary"]', 'img[src*="files"]'],
  stopButton: ['button[aria-label="Stop generating"]', '[data-testid="stop-button"]', 'button[aria-label*="Stop"]'],
  generatingIndicator: ['[aria-label*="Generating"]', '[aria-label*="Đang tạo"]', '[class*="animate-pulse"]', '[class*="skeleton"]', '[class*="shimmer"]'],
  newChat: ['button[data-testid="create-new-chat-button"]', '[aria-label="Đoạn chat mới"]', 'a[aria-label="New chat"]', 'button[aria-label="New chat"]', 'a[href="/"]', 'a[href="/?model=auto"]']
  ,
  fileInput: [
    '#upload-files',
    '#upload-photos',
    '[data-testid="upload-photos-input"]',
    'input[type="file"][accept*="image"]',
    'input[type="file"]'
  ]
};

function findElement(selectors: string[], scope: ParentNode = document): Element | null {
  for (const selector of selectors) {
    try {
      const element = scope.querySelector(selector);
      if (element) return element;
    } catch {
      // Ignore unsupported selector variants.
    }
  }
  return null;
}

function findElements(selectors: string[], scope: ParentNode = document): Element[] {
  const elements: Element[] = [];
  const seen = new Set<Element>();
  for (const selector of selectors) {
    try {
      for (const element of Array.from(scope.querySelectorAll(selector))) {
        if (!seen.has(element)) {
          seen.add(element);
          elements.push(element);
        }
      }
    } catch {
      // Ignore unsupported selector variants.
    }
  }
  return elements;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomDelay(min: number, max: number): Promise<void> {
  await sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function typeText(element: Element, text: string): Promise<void> {
  const isContentEditable = element.getAttribute("contenteditable") === "true";
  (element as HTMLElement).focus();
  element.dispatchEvent(new Event("focus", { bubbles: true }));

  if (isContentEditable) {
    document.getSelection()?.selectAllChildren(element);
    document.execCommand("delete");
    document.execCommand("insertText", false, text);
    if (!composerText(element).includes(text.slice(0, Math.min(80, text.length)))) {
      element.textContent = text;
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  } else {
    const textarea = element as HTMLTextAreaElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    valueSetter?.call(textarea, text);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function composerText(element: Element | null): string {
  if (!element) return "";
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value;
  return (element.textContent || "").trim();
}

function requestExists(jobId: string): boolean {
  const marker = `studio_request_id: ${jobId}`.toLowerCase();
  return getConversationTurns().some((turn) => {
    const role = turn.getAttribute("data-message-author-role") ||
      turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
    return role === "user" && (turn.innerText || "").toLowerCase().includes(marker);
  });
}

async function triggerPromptSubmission(): Promise<void> {
  const readyStartedAt = Date.now();
  while (Date.now() - readyStartedAt < 30000) {
    const button = findElement(SELECTORS.submitButton) as HTMLButtonElement | null;
    if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
      button.click();
      return;
    }
    await sleep(400);
  }
  const input = findElement(SELECTORS.promptInput);
  input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  input?.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
}

async function verifyPromptSubmission(jobId: string, marker: string, requireVisibleMarker: boolean, initialTurnCount: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    if (requireVisibleMarker && requestExists(jobId)) return true;
    const input = findElement(SELECTORS.promptInput);
    if (!requireVisibleMarker && (getConversationTurns().length > initialTurnCount || (composerText(input).length === 0 && (isGenerating() || getAssistantTurns().length > 0)))) return true;
    if (requireVisibleMarker && !composerText(input).includes(marker) && isGenerating()) return true;
    await sleep(350);
  }
  return false;
}

async function submitPromptAttempt(jobId: string, fullPrompt: string, marker: string, requireVisibleMarker: boolean, initialTurnCount: number, attempt: number, recoverComposer: boolean): Promise<boolean> {
  if (requireVisibleMarker && requestExists(jobId)) return true;
  const input = findElement(SELECTORS.promptInput);
  if (!input) {
    // A newly opened/saved ChatGPT tab can expose the document before its
    // composer mounts. For YOLO/new-conversation jobs, recover once in-band
    // instead of turning a transient mount delay into a manual blocker.
    if (recoverComposer && attempt === 1) {
      reportStatus(jobId, "submitting", "ChatGPT composer is still mounting; opening a fresh conversation automatically...");
      try {
        await openNewConversation(jobId);
      } catch {
        if (!/^https:\/\/chatgpt\.com\/?(?:\?.*)?$/i.test(location.href)) location.href = "https://chatgpt.com/";
      }
      await sleep(2500);
    } else {
      reportStatus(jobId, "waiting_manual_action", "ChatGPT composer is unavailable. Sign in or reopen the saved chat.");
      await sleep(1500);
    }
    return false;
  }
  const expected = requireVisibleMarker ? marker : fullPrompt.slice(0, Math.min(80, fullPrompt.length));
  if (!composerText(input).includes(expected)) {
    reportStatus(jobId, "submitting", attempt === 1 ? "Preparing ChatGPT request..." : `Restoring interrupted request (${attempt}/3)...`);
    await typeText(input, fullPrompt);
  }
  await triggerPromptSubmission();
  return verifyPromptSubmission(jobId, marker, requireVisibleMarker, initialTurnCount);
}

async function submitPrompt(jobId: string, fullPrompt: string, options: { visibleMarker?: boolean; recoverComposer?: boolean } = {}): Promise<boolean> {
  const marker = `STUDIO_REQUEST_ID: ${jobId}`;
  const requireVisibleMarker = options.visibleMarker ?? true;
  const initialTurnCount = getConversationTurns().length;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await submitPromptAttempt(jobId, fullPrompt, marker, requireVisibleMarker, initialTurnCount, attempt, Boolean(options.recoverComposer))) return true;
  }
  return false;
}

async function executeJob(payload: JobPayload): Promise<void> {
  const { jobId, prompt, task, settings } = payload;
  try {
    reportStatus(jobId, "submitting", "ChatGPT adapter received the job.");
    await randomDelay(600, 1200);
    if (settings?.newConversation) await openNewConversation(jobId);

    const requestMarker = `STUDIO_REQUEST_ID: ${jobId}`;
    const isImageTask = task === "image" || task === "text_to_image";
    if (!isImageTask) {
      const waitPolicy = resolveTextWaitPolicy(task, prompt.length);
      await selectChatGptReasoningTier(jobId, waitPolicy.tier);
    }
    const fullPrompt = isImageTask ? prompt : `${requestMarker}\n${prompt}`;
    if (isImageTask) {
      await executeImageJobWithRecovery(payload, fullPrompt);
    } else {
      reportStatus(jobId, "opening_provider", "Waiting for previous ChatGPT generation to finish...");
      await waitForGenerationIdle(120000);
      if (payload.references?.some((reference) => reference.base64)) {
        reportStatus(jobId, "submitting", `Uploading ${payload.references.filter((reference) => reference.base64).length} visual reference(s)...`);
        await uploadReferences(payload.references, jobId);
      }
      const baseline = captureBaseline();
      const submitted = await submitPrompt(jobId, fullPrompt, {
        visibleMarker: true,
        // The background normalizes newConversation=false after navigating the
        // tab, but freshConversationNavigated is the durable handoff marker.
        recoverComposer: Boolean(settings?.newConversation || (settings as { freshConversationNavigated?: boolean } | undefined)?.freshConversationNavigated)
      });
      if (!submitted) {
        reportResult(jobId, "failed_retryable", undefined, "PROMPT_NOT_SUBMITTED: ChatGPT kept the request in the composer after three verified attempts.");
        return;
      }
      reportStatus(jobId, "generating", "Waiting for ChatGPT text response...");
      await waitForTextResult(jobId, baseline, { task, promptLength: prompt.length });
    }
  } catch (error) {
    reportResult(jobId, "failed_retryable", undefined, `ChatGPT error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function executeImageJobWithRecovery(payload: JobPayload, fullPrompt: string): Promise<void> {
  const maxAttempts = 3;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      reportStatus(payload.jobId, "opening_provider", `Retrying ChatGPT image request in a fresh chat (${attempt}/${maxAttempts})...`, 0.05);
      await openNewConversation(payload.jobId);
      await sleep(1500);
    }

    try {
      reportStatus(payload.jobId, "opening_provider", attempt === 1
        ? "Waiting for previous ChatGPT generation to finish..."
        : "Preparing recovered ChatGPT image request...");
      await waitForGenerationIdle(60000);
      // A fresh image conversation can be reloaded after ChatGPT has already
      // mounted the result. Do not baseline away that result; text jobs still
      // use the normal existing-image exclusion.
      const baseline = captureBaseline({ ignoreImages: Boolean(payload.settings?.newConversation || payload.settings?.freshConversationNavigated) });
      if (payload.references?.some((reference) => reference.base64)) {
        reportStatus(payload.jobId, "submitting", `Uploading ${payload.references.filter((reference) => reference.base64).length} visual reference(s)...`);
        await uploadReferences(payload.references, payload.jobId);
      }

      const submitted = await submitPrompt(payload.jobId, fullPrompt, {
        visibleMarker: false,
        recoverComposer: Boolean(payload.settings?.newConversation || payload.settings?.freshConversationNavigated)
      });
      if (!submitted) {
        throw new Error("PROMPT_NOT_SUBMITTED: ChatGPT kept the image request in the composer after three verified attempts.");
      }

      reportStatus(payload.jobId, "generating", `Waiting for ChatGPT image result (${attempt}/${maxAttempts})...`);
      await waitForImageResults(payload.jobId, baseline);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      reportStatus(payload.jobId, "generating", `${lastError} Retrying if attempts remain...`, Math.min(attempt / maxAttempts, 0.9));
    }
  }
  reportResult(payload.jobId, "failed_retryable", undefined, `ChatGPT image generation failed after ${maxAttempts} attempts. ${lastError}`);
}

function visibleElement(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 8 && rect.height > 8 && style.visibility !== "hidden" && style.display !== "none";
}

function composerRoot(): HTMLElement {
  const input = findElement(SELECTORS.promptInput) as HTMLElement | null;
  return (
    (input?.closest("form") as HTMLElement | null) ||
    (input?.closest('[data-testid*="composer" i]') as HTMLElement | null) ||
    (input?.parentElement?.parentElement as HTMLElement | null) ||
    document.body
  );
}

function composerAttachmentCount(references: NonNullable<JobPayload["references"]>): number {
  const root = composerRoot();
  const images = composerImageCount(root);
  const text = (root.innerText || "").toLowerCase();
  const filenameMatches = references.filter((reference) => reference.filename && text.includes(reference.filename.toLowerCase())).length;
  const attachmentControls = Array.from(root.querySelectorAll([
    '[data-testid*="attachment" i]',
    '[data-testid*="uploaded-file" i]',
    '[data-testid*="file-preview" i]',
    '[aria-label*="Remove attachment" i]',
    '[aria-label*="Xóa tệp" i]',
    '[aria-label*="delete attachment" i]'
  ].join(","))).filter(visibleElement).length;
  return images + filenameMatches + attachmentControls;
}

function composerImageCount(root: HTMLElement) {
  return Array.from(root.querySelectorAll("img")).filter((image) => {
    if (!visibleElement(image)) return false;
    const rect = image.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return false;
    const src = image.getAttribute("src") || "";
    const alt = (image.getAttribute("alt") || "").toLowerCase();
    return ["blob:", "data:image/", "/backend-api/", "oaiusercontent.com"].some((prefix) => src.includes(prefix))
      || alt.includes("uploaded") || alt.includes("image");
  }).length;
}

async function waitForReferenceUpload(jobId: string, references: NonNullable<JobPayload["references"]>, beforeCount: number): Promise<void> {
  const expectedCount = references.filter((reference) => reference.base64).length;
  if (expectedCount === 0) return;
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const afterCount = composerAttachmentCount(references);
    if (afterCount >= beforeCount + expectedCount) {
      reportStatus(
        jobId,
        "submitting",
        `Confirmed ${expectedCount} visual reference upload(s).`,
        undefined,
        references.filter((reference) => reference.base64).map((reference) => reference.assetId)
      );
      await sleep(1200);
      return;
    }
    reportStatus(jobId, "submitting", "Waiting for ChatGPT to show uploaded visual reference...");
    await sleep(600);
  }
  throw new Error("REFERENCE_UPLOAD_NOT_CONFIRMED: ChatGPT did not show the uploaded image in the composer. Reload ChatGPT/extension and retry before submitting.");
}

async function dismissDuplicateReferenceDialog(): Promise<boolean> {
  const duplicateText = /(?:you(?:'|’)ve uploaded this file before|already uploaded this file|bạn đã tải lên tệp này từ trước)/i;
  const dialog = visibleMenuOrDialogRoots().find((root) => duplicateText.test(root.innerText || ""));
  if (!dialog) return false;
  const confirm = Array.from(dialog.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .find((element) => visibleElement(element) && /^(?:ok|đồng ý|đóng)$/i.test((element.innerText || element.getAttribute("aria-label") || "").trim()));
  if (confirm) simulateUiClick(confirm);
  else await closeChatGptPicker();
  await sleep(300);
  return true;
}

function composerContainsReferenceFilename(filename: string): boolean {
  const normalized = normalizedUiLabel(filename);
  if (!normalized) return false;
  const root = composerRoot();
  return Array.from(root.querySelectorAll<HTMLElement>("[aria-label], [title], [data-testid], img"))
    .some((element) => normalizedUiLabel([
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
      element.innerText
    ].filter(Boolean).join(" ")).includes(normalized));
}

function visibleMenuOrDialogRoots(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"], [role="dialog"], [data-state="open"]'))
    .filter(visibleElement);
}

async function closeChatGptPicker(): Promise<void> {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  await sleep(250);
}

function findChatGptLibraryPickerLauncher() {
  return visibleMenuOrDialogRoots()
    .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('button, [role="menuitem"], a')))
    .find((element) => {
      const label = (element.innerText || element.getAttribute("aria-label") || "").trim();
      const href = element instanceof HTMLAnchorElement ? element.href : "";
      // The new ChatGPT attachment menu exposes a full-page /library link named
      // "Library". It is navigation, not an attachment picker; clicking it
      // destroys the composer and makes native uploads land in Library only.
      return !/\/library(?:[/?#]|$)/i.test(href) &&
        /^(?:library|thư viện|add from library|chọn từ thư viện|photos|ảnh)$/i.test(label);
    });
}

function findChatGptLibraryTile(filename: string) {
  const normalizedFilename = normalizedUiLabel(filename);
  return visibleMenuOrDialogRoots()
    .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('button, [role="option"], [data-testid*="asset" i], [data-testid*="image" i]')))
    .find((element) => normalizedUiLabel([
      element.getAttribute("aria-label"), element.getAttribute("title"), element.querySelector("img")?.getAttribute("alt"), element.innerText
    ].filter(Boolean).join(" ")).includes(normalizedFilename));
}

async function uploadReferencesNatively(references: NonNullable<JobPayload["references"]>, jobId: string): Promise<boolean> {
  for (const reference of references) {
    if (await tryReuseReferenceFromChatGptLibrary(reference, jobId)) continue;
    const beforeCount = composerAttachmentCount(references);
    const result = await chrome.runtime.sendMessage({ source: "content-script", action: "NATIVE_CHATGPT_UPLOAD_REFERENCES", jobId, assetId: reference.assetId })
      .catch(() => undefined) as { ok?: boolean } | undefined;
    if (!result?.ok) return false;
    try {
      await waitForReferenceUpload(jobId, [reference], beforeCount);
    } catch (error) {
      if (!await dismissDuplicateReferenceDialog()) throw error;
      if (!await tryReuseReferenceFromChatGptLibrary(reference, jobId)) {
        throw new Error(`CHATGPT_DUPLICATE_REFERENCE_NOT_REUSABLE: ${reference.filename || reference.assetId} already exists in ChatGPT but could not be attached from Library. The adapter stopped without uploading another copy.`);
      }
      continue;
    }
    markChatGptReferenceConfirmed(reference);
  }
  return true;
}

function referenceFile(reference: ReferencePayload): File | null {
  if (!reference.base64) return null;
  const normalizedBase64 = reference.base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const binary = atob(normalizedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], reference.filename || `${reference.assetId}.png`, { type: reference.mimeType || "image/png" });
}

async function uploadReferencesThroughInput(references: NonNullable<JobPayload["references"]>, jobId: string): Promise<void> {
  const input = SELECTORS.fileInput.flatMap((selector) => Array.from(document.querySelectorAll<HTMLInputElement>(selector))).find((candidate) => !candidate.disabled) || null;
  if (!input) throw new Error("Cannot find ChatGPT image upload input.");
  const seen = new Set<string>();
  for (const reference of references) {
    const file = referenceFile(reference);
    if (!file || seen.has(referenceFingerprint(reference))) continue;
    seen.add(referenceFingerprint(reference));
    const beforeCount = composerAttachmentCount(references);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await waitForReferenceUpload(jobId, [reference], beforeCount);
    markChatGptReferenceConfirmed(reference);
  }
  if (seen.size === 0) throw new Error("No image reference data was available to upload.");
}

async function uploadReferences(references: NonNullable<JobPayload["references"]>, jobId: string): Promise<void> {
  const attachmentMenuButton = Array.from(document.querySelectorAll("button")).find((element) => {
    const label = `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`.toLowerCase();
    return visibleElement(element) && /attach|add files|thêm tệp|đính kèm/.test(label);
  });
  if (attachmentMenuButton) {
    simulateUiClick(attachmentMenuButton);
    await sleep(400);
  }
  if (await uploadReferencesNatively(references, jobId)) return;
  await uploadReferencesThroughInput(references, jobId);
}

function findNewConversationTarget(): HTMLElement | null {
  return (findElement(SELECTORS.newChat) as HTMLElement | null) ||
    (Array.from(document.querySelectorAll("a, button")).find((element) => {
      const text = (element.textContent || "").trim().toLowerCase();
      return text.includes("new chat") || text.includes("đoạn chat mới");
    }) as HTMLElement | undefined) || null;
}

function isBlankRootConversation(url: string, turnCount: number) {
  return turnCount === 0 && /^https:\/\/chatgpt\.com\/?(?:\?.*)?$/i.test(url) && Boolean(findElement(SELECTORS.promptInput));
}

function newConversationReady(beforeUrl: string, beforeTurnCount: number) {
  const conversationCleared = beforeTurnCount > 0 && getConversationTurns().length === 0;
  return Boolean(findElement(SELECTORS.promptInput) && (location.href !== beforeUrl || conversationCleared || beforeTurnCount === 0));
}

async function openNewConversation(jobId: string): Promise<void> {
  const beforeUrl = location.href;
  const beforeTurnCount = getConversationTurns().length;
  // ChatGPT's current root page is already a blank conversation.  The new UI
  // may omit the sidebar control entirely, so do not reject a valid empty
  // composer merely because the "New chat" button is not rendered.
  if (isBlankRootConversation(beforeUrl, beforeTurnCount)) return;
  const target = findNewConversationTarget();

  if (!target) {
    throw new Error("NEW_CONVERSATION_NOT_CONFIRMED: ChatGPT did not expose the New Chat control. Refusing to write this project into the currently open conversation.");
  }

  target.click();
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await sleep(500);
    if (newConversationReady(beforeUrl, beforeTurnCount)) return;
  }
  throw new Error("NEW_CONVERSATION_NOT_CONFIRMED: ChatGPT did not switch away from the previous conversation within 15 seconds.");
}

configureChatGptVisualRuntime({
  extractBalancedJsonObject: extractBalancedJsonObject, extractLatestCompleteStoryJson: extractLatestCompleteStoryJson, extractLatestCompleteStructuredJson: extractLatestCompleteStructuredJson, findElement: findElement, findElements: findElements, hasCompleteStoryJson: hasCompleteStoryJson, hasQuickVisualAnalysis: hasQuickVisualAnalysis, normalizeAssistantText: normalizeAssistantText, normalizeQuickVisualAnalysisText: normalizeQuickVisualAnalysisText, randomDelay: randomDelay, reportResult: reportResult, reportStatus: reportStatus, sleep: sleep, visibleElement: visibleElement, SELECTORS: SELECTORS, RetryableImageWaitError: RetryableImageWaitError
});

function hasCompleteStoryJson(text: string): boolean {
  const candidate = extractLatestCompleteStoryJson(text) || extractBalancedJsonObject(text);
  return isCompleteStoryJsonCandidate(candidate);
}

function hasQuickVisualAnalysis(text: string): boolean {
  const normalized = normalizeQuickVisualAnalysisText(text);
  if (normalized.length < 140) return false;
  if (/^(thought for|thinking|đã suy nghĩ|đang suy nghĩ|suy nghĩ|risks?\s*:)/i.test(normalized)) return false;
  const lower = normalized.toLowerCase();
  if ([
    "i don't see an attached image",
    "i do not see an attached image",
    "don't see the attached image",
    "do not see the attached image",
    "there is no attached image",
    "without the image",
    "missing image",
    "please re-upload",
    "cannot assess",
    "can't reliably identify",
    "không thấy ảnh",
    "không có ảnh",
    "thiếu ảnh"
  ].some((value) => lower.includes(value))) return false;
  if ([
    "local fallback",
    "provider visual analysis was unavailable",
    "general note from user text only",
    "without the uploaded image",
    "without the image"
  ].some((value) => lower.includes(value))) return false;
  const hasRequiredSections = [
    ["subjects:", "subject:", "chủ thể:", "nhân vật:"],
    ["style:", "phong cách:"],
    ["character direction:", "định hướng nhân vật:"],
    ["background direction:", "định hướng bối cảnh:", "bối cảnh:"]
  ].every((group) => group.some((value) => lower.includes(value)));
  const hasUsefulStructure = normalized.split("\n").length >= 3 || /[:：-]/.test(normalized);
  return hasRequiredSections && hasUsefulStructure;
}

function normalizeQuickVisualAnalysisText(text: string): string {
  const normalized = normalizeAssistantText(text);
  const headingPattern = /\b(SUBJECTS|STYLE|CHARACTER DIRECTION|BACKGROUND DIRECTION|RISKS)\s*[:：]/gi;
  const matches = Array.from(normalized.matchAll(headingPattern));
  if (matches.length === 0) return normalized;
  const firstContentHeading = matches.find((match) => {
    const afterHeading = normalized.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 180);
    return !/^\s*(visible subject|rendering style|what the future|whether the background|ambiguity|subject\(s\))/i.test(afterHeading);
  }) ?? matches[matches.length - 1];
  if (firstContentHeading.index === undefined) return normalized;
  return normalized.slice(firstContentHeading.index).trim();
}

type TextWaitOptions = { task?: string; maxWaitMs?: number; promptLength?: number };

function waitTextFallback(jobId: string, options: TextWaitOptions, structuredTask: boolean) {
  return normalizeAssistantText(options.task === "quick_visual_analysis"
    ? (extractLatestQuickVisualAnalysisFromPage(jobId) || getLatestQuickVisualAnalysisText())
    : structuredTask ? getLatestAssistantOnlyText() : "");
}

function chooseWaitText(primaryText: string, fallbackText: string, mountedText: string, scopedStoryText: string, options: TextWaitOptions, structuredTask: boolean) {
  if (structuredTask && scopedStoryText) return scopedStoryText;
  if (structuredTask && mountedText.length > Math.max(primaryText.length, fallbackText.length)) return mountedText;
  if (structuredTask && fallbackText.length > primaryText.length) return fallbackText;
  if (options.task === "quick_visual_analysis" && !hasQuickVisualAnalysis(primaryText) && hasQuickVisualAnalysis(fallbackText)) return fallbackText;
  return primaryText;
}

function currentWaitText(jobId: string, baseline: ConversationBaseline, options: TextWaitOptions, structuredTask: boolean) {
  const jobMessage = getAssistantTurnForJob(jobId);
  const primaryText = normalizeAssistantText((jobMessage ?? getNewestAssistantTurn(baseline))?.innerText || "");
  const scopedStoryText = structuredTask ? getCompleteStructuredTextForJob(jobId, options.task || "") : "";
  const fallbackText = waitTextFallback(jobId, options, structuredTask);
  const requestVisible = requestExists(jobId) || (document.body.innerText || "").toLowerCase().includes(`studio_request_id: ${jobId}`.toLowerCase());
  const mountedText = structuredTask && requestVisible ? getLatestMountedAssistantText() : "";
  const rawText = chooseWaitText(primaryText, fallbackText, mountedText, scopedStoryText, options, structuredTask);
  const text = options.task === "quick_visual_analysis" ? normalizeQuickVisualAnalysisText(rawText) : rawText;
  return { jobMessage, requestVisible, text };
}

function waitTextIsReady({ baseline, jobMessage, options, providerGenerating, quickVisualReady, requestVisible, stableTicks, storyJsonReady, structuredTask, text }: {
  baseline: ConversationBaseline; jobMessage: HTMLElement | null | undefined; options: TextWaitOptions; providerGenerating: boolean;
  quickVisualReady: boolean; requestVisible: boolean; stableTicks: number; storyJsonReady: boolean; structuredTask: boolean; text: string;
}) {
  const hasNewTurn = getAssistantTurns().length > baseline.assistantCount || getConversationTurns().length > baseline.turnCount;
  const newStableText = isNewAssistantTextSinceBaseline(text, baseline) && !providerGenerating;
  const trustedStructuredText = [structuredTask, storyJsonReady, requestVisible || newStableText].every(Boolean);
  const trustedQuickVisualText = [options.task === "quick_visual_analysis", quickVisualReady, requestVisible || newStableText].every(Boolean);
  const trustedGraphText = [options.task === "production_graph_revision", requestVisible, jobMessage].every(Boolean);
  const stableTarget = options.task === "quick_visual_analysis" && quickVisualReady ? 2 : isGenerating() ? 8 : 3;
  const trustedTurn = [hasNewTurn, trustedStructuredText, trustedQuickVisualText, trustedGraphText].some(Boolean);
  return [trustedTurn, text.length, storyJsonReady, quickVisualReady, stableTicks >= stableTarget].every(Boolean);
}

function finalWaitText(jobId: string, options: TextWaitOptions, structuredTask: boolean) {
  const rawText = options.task === "quick_visual_analysis"
    ? (extractLatestQuickVisualAnalysisFromPage(jobId) || getLatestQuickVisualAnalysisText())
    : structuredTask
      ? (getCompleteStructuredTextForJob(jobId, options.task || "") || getLatestAssistantOnlyText())
      : normalizeAssistantText(getAssistantTurnForJob(jobId)?.innerText || getLatestAssistantText());
  return options.task === "quick_visual_analysis" ? normalizeQuickVisualAnalysisText(rawText) : normalizeAssistantText(rawText);
}

type TextWaitProgress = {
  degenerateTailSince: number;
  inactiveSince: number;
  lastLength: number;
  lastProgressAt: number;
  lastTextChangeAt: number;
  stableTicks: number;
};

async function rejectDegenerateText(jobId: string, text: string, structuredTask: boolean, providerGenerating: boolean, progress: TextWaitProgress) {
  if (structuredTask && hasDegenerateStructuredTail(text)) {
    if (!progress.degenerateTailSince) progress.degenerateTailSince = Date.now();
  } else progress.degenerateTailSince = 0;
  if (!structuredTask || !progress.degenerateTailSince || providerGenerating && Date.now() - progress.degenerateTailSince < 8000) return false;
  (findElement(SELECTORS.stopButton) as HTMLButtonElement | null)?.click();
  await sleep(350);
  reportResult(jobId, "failed_retryable", undefined, "PROVIDER_OUTPUT_DEGENERATED: ChatGPT entered a repeated-token loop while writing structured JSON. Split this packet into a smaller batch before retrying.");
  return true;
}

function updateTextWaitProgress(text: string, providerGenerating: boolean, progress: TextWaitProgress) {
  if (text.length > 0 && text.length === progress.lastLength) progress.stableTicks++;
  else {
    progress.stableTicks = 0;
    progress.lastLength = text.length;
    progress.lastTextChangeAt = Date.now();
    progress.inactiveSince = Date.now();
  }
  if (providerGenerating) progress.inactiveSince = Date.now();
}

function reportTextWaitProgress(jobId: string, text: string, storyJsonReady: boolean, quickVisualReady: boolean, structuredTask: boolean, options: TextWaitOptions, waitPolicy: ReturnType<typeof resolveTextWaitPolicy>, startTime: number, progress: TextWaitProgress) {
  if (Date.now() - progress.lastProgressAt <= 3000) return;
  const completion = Math.min((Date.now() - startTime) / waitPolicy.hardWaitMs, 0.95);
  const jsonNote = structuredTask && text.length > 0 && !storyJsonReady ? " Waiting for complete structured JSON." : "";
  const visualNote = options.task === "quick_visual_analysis" && text.length > 0 && !quickVisualReady ? " Waiting for visual analysis headings/content." : "";
  reportStatus(jobId, "generating", `Waiting for stable ChatGPT text response (${waitPolicy.tier} policy)... ${text.length} chars.${jsonNote}${visualNote}`, completion);
  progress.lastProgressAt = Date.now();
}

function reportInactiveTextFailure(jobId: string, text: string, providerGenerating: boolean, waitPolicy: ReturnType<typeof resolveTextWaitPolicy>, progress: TextWaitProgress): boolean {
  if (providerGenerating || text.length >= 200 || Date.now() - progress.inactiveSince < waitPolicy.inactiveWaitMs) return false;
  reportResult(jobId, "failed_retryable", undefined, `Provider became inactive before producing usable output (${waitPolicy.tier} policy, ${Math.round(waitPolicy.inactiveWaitMs / 1000)}s inactive).`);
  return true;
}

async function waitForTextResult(jobId: string, baseline: ConversationBaseline, options: TextWaitOptions = {}): Promise<void> {
  const maxWaitMs = options.maxWaitMs ?? 180000;
  const structuredTask = isStructuredTask(options.task);
  const waitPolicy = resolveTextWaitPolicy(options.task, options.promptLength, maxWaitMs);
  const hardWaitMs = waitPolicy.hardWaitMs;
  const startTime = Date.now();
  const progress: TextWaitProgress = { degenerateTailSince: 0, inactiveSince: startTime, lastLength: 0, lastProgressAt: 0, lastTextChangeAt: startTime, stableTicks: 0 };

  while (Date.now() - startTime < hardWaitMs) {
    await sleep(700);
    const tick = await processTextWaitTick(jobId, baseline, options, structuredTask, waitPolicy, startTime, progress);
    if (tick === "done") return;
    if (tick === "break") break;
  }

  const finalText = finalWaitText(jobId, options, structuredTask);
  const finalStoryReady = structuredTask ? hasCompleteStructuredJson(finalText, options.task || "") : true;
  const finalVisualReady = options.task === "quick_visual_analysis" ? hasQuickVisualAnalysis(finalText) : true;
  if (finalText.length > 0 && finalStoryReady && finalVisualReady) {
    reportTextResult(jobId, finalText);
    return;
  }
  reportResult(jobId, "failed_retryable", undefined, "Timeout waiting for ChatGPT text response");
}

async function processTextWaitTick(jobId: string, baseline: ConversationBaseline, options: TextWaitOptions, structuredTask: boolean, waitPolicy: ReturnType<typeof resolveTextWaitPolicy>, startTime: number, progress: TextWaitProgress): Promise<"continue" | "done" | "break"> {
  const { jobMessage, requestVisible, text } = currentWaitText(jobId, baseline, options, structuredTask);
  const error = jobMessage ? detectProviderError(jobMessage) : detectProviderError(document.body);
  if (error && !isGenerating(jobMessage)) {
    reportResult(jobId, "failed_retryable", undefined, `${error}: ${text.slice(0, 400)}`);
    return "done";
  }
  const providerGenerating = isGenerating();
  if (await rejectDegenerateText(jobId, text, structuredTask, providerGenerating, progress)) return "done";
  updateTextWaitProgress(text, providerGenerating, progress);
  if (reportInactiveTextFailure(jobId, text, providerGenerating, waitPolicy, progress)) return "done";
  const storyJsonReady = structuredTask ? hasCompleteStructuredJson(text, options.task || "") : true;
  const quickVisualReady = options.task === "quick_visual_analysis" ? hasQuickVisualAnalysis(text) : true;
  if (waitTextIsReady({ baseline, jobMessage, options, providerGenerating, quickVisualReady, requestVisible, stableTicks: progress.stableTicks, storyJsonReady, structuredTask, text })) {
    reportTextResult(jobId, text);
    return "done";
  }
  reportTextWaitProgress(jobId, text, storyJsonReady, quickVisualReady, structuredTask, options, waitPolicy, startTime, progress);
  return !providerGenerating && Date.now() - progress.lastTextChangeAt >= waitPolicy.inactiveWaitMs ? "break" : "continue";
}

function reportStatus(jobId: string, status: string, message: string, progress?: number, providerReferenceAssetIds?: string[]): void {
  const providerConversationUrl = /^\/c\/[^/]+/.test(location.pathname) ? location.href : undefined;
  chrome.runtime.sendMessage({
    source: "content-script",
    data: { type: "JOB_STATUS", jobId, status, message, progress, providerConversationUrl, providerReferenceAssetIds }
  });
}

function reportResult(jobId: string, status: string, assets?: Array<Record<string, unknown>>, error?: string): Promise<void> {
  const message = { source: "content-script", data: { type: "JOB_RESULT", jobId, status, assets, error } };
  return new Promise((resolve, reject) => {
    const deliver = (attempt: number) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (attempt < 3) setTimeout(() => deliver(attempt + 1), 800 * attempt);
        else reject(new Error("CHATGPT_RESULT_DELIVERY_TIMEOUT: extension did not acknowledge the result message"));
      }, 8_000);
      chrome.runtime.sendMessage(message, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
      // The callback API is intentional here: Chrome exposes delivery failures
      // through lastError, while a rejected Promise is not reliable across the
      // extension's mixed MV2/MV3 runtime and can leave a job stuck at
      // `downloading` forever.
        const failed = Boolean(chrome.runtime.lastError);
        if (!failed) {
          reportStatus(jobId, "downloading", "ChatGPT result delivered to extension; finalizing asset import...");
          resolve();
        } else if (attempt < 3) setTimeout(() => deliver(attempt + 1), 800 * attempt);
        else reject(new Error("CHATGPT_RESULT_DELIVERY_FAILED: extension did not acknowledge the result message"));
      });
    };
    deliver(1);
  });
}

function reportTextResult(jobId: string, text: string): void {
  const message = {
    source: "content-script",
    data: {
      type: "JOB_RESULT",
      jobId,
      status: "done",
      assets: [],
      output: { kind: "text", encoding: "utf8", text },
      providerMetadata: { conversationUrl: location.href }
    }
  };
  const deliver = (attempt: number) => {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError && attempt < 3) setTimeout(() => deliver(attempt + 1), 800 * attempt);
    });
  };
  deliver(1);
}

function capturedTextForJob(jobId: string, task: string, jobTurn: HTMLElement | null | undefined) {
  const completeStructuredText = isStructuredTask(task) ? getCompleteStructuredTextForJob(jobId, task) : "";
  if (completeStructuredText) return completeStructuredText;
  if (task === "quick_visual_analysis") return capturedQuickVisualText(jobId, jobTurn);
  if (structuredFallbackText(task, jobTurn)) return getLatestAssistantOnlyText();
  return normalizeAssistantText(jobTurn?.innerText || getLatestAssistantText());
}

function capturedQuickVisualText(jobId: string, jobTurn: HTMLElement | null | undefined) {
  const turnText = jobTurn?.innerText || "";
  return jobTurn && hasQuickVisualAnalysis(turnText)
    ? normalizeAssistantText(turnText)
    : (extractLatestQuickVisualAnalysisFromPage(jobId) || getLatestQuickVisualAnalysisText());
}

function structuredFallbackText(task: string, jobTurn: HTMLElement | null | undefined) {
  return isStructuredTask(task) && Boolean(jobTurn)
    && !hasCompleteStructuredJson(jobTurn?.innerText || "", task)
    && hasCompleteStructuredJson(getLatestAssistantOnlyText(), task);
}

function captureLatestText(jobId: string, task = ""): void {
  const jobTurn = getAssistantTurnForJob(jobId);
  const rawText = capturedTextForJob(jobId, task, jobTurn);
  const text = task === "quick_visual_analysis" ? normalizeQuickVisualAnalysisText(rawText) : rawText;
  const storyReady = !isStructuredTask(task) || hasCompleteStructuredJson(text, task);
  if (text && storyReady) {
    reportTextResult(jobId, text);
    return;
  }
  const turnCount = getConversationTurns().length;
  const pageText = document.body.innerText || "";
  const markerExists = pageText.toLowerCase().includes(`studio_request_id: ${jobId}`.toLowerCase());
  const reason = turnCount === 0
    ? "Waiting for the saved ChatGPT conversation messages to load..."
    : markerExists
      ? isStructuredTask(task) && text
        ? "Matching ChatGPT request found; ignoring schema echo and waiting for complete structured JSON..."
        : "Matching ChatGPT request found; waiting for assistant text to become readable..."
      : "Saved ChatGPT conversation is open, but the matching request marker is not visible yet...";
  reportStatus(jobId, markerExists ? "generating" : "waiting_manual_action", reason, 0.35);
}

function imageRecoveryContext(jobId: string, expectedConversationUrl: string) {
  const expectedPath = conversationPath(expectedConversationUrl);
  const currentPath = conversationPath(location.href);
  const marker = `studio_request_id: ${jobId}`.toLowerCase();
  const markerExists = [
    getConversationTurns().some((turn) => (turn.innerText || "").toLowerCase().includes(marker)),
    (document.body.innerText || "").toLowerCase().includes(marker)
  ].some(Boolean);
  const turn = getAssistantTurnForJob(jobId);
  return { expectedPath, currentPath, markerExists, turn };
}

async function captureImageForJob(jobId: string, expectedConversationUrl = ""): Promise<void> {
  if (isLoginPage()) return void reportStatus(jobId, "waiting_login", "ChatGPT sign-in is required before this saved image can be recovered.");
  const context = imageRecoveryContext(jobId, expectedConversationUrl);
  if (context.expectedPath && context.currentPath !== context.expectedPath) {
    reportStatus(jobId, "waiting_manual_action", `Open the saved conversation ${context.expectedPath}; the current tab is ${context.currentPath || location.pathname}.`);
    return;
  }
  const { expectedPath, currentPath, markerExists, turn } = context;
  if (!turn && markerExists && isGenerating()) {
    reportStatus(jobId, "generating", "Matching ChatGPT request found; image generation is still running.");
    return;
  }
  const candidates = await recoverImageCandidates(turn, expectedPath === currentPath);
  const providerError = turn ? detectProviderError(turn) : null;
  finalizeImageRecovery(jobId, { candidates, providerError, turn, markerExists });
}

function finalizeImageRecovery(jobId: string, input: { candidates: ReturnType<typeof getImageCandidates>; providerError: string | null; turn: HTMLElement | null | undefined; markerExists: boolean }) {
  finalizeImageRecoveryBoundary({ jobId, ...input, isGenerating, reportStatus, reportResult, reportRecoveredImage });
}

async function recoverImageCandidates(turn: HTMLElement | null | undefined, useDocumentFallback: boolean) {
  let candidates = turn ? getImageCandidates(turn) : [];
  if (candidates.length === 0 && !isGenerating()) {
    turn?.scrollIntoView({ block: "center", behavior: "instant" });
    await sleep(1200);
    candidates = turn ? getImageCandidates(turn) : getImageCandidates(document);
  }
  return candidates.length === 0 && useDocumentFallback ? getImageCandidates(document) : candidates;
}

function reportRecoveredImage(jobId: string, candidate: ReturnType<typeof getImageCandidates>[number]): void {
  reportResult(jobId, "done", recoveredImageAsset(jobId, candidate, location.href));
}

if (window.__studioChatGptAdapterListener) {
  chrome.runtime.onMessage.removeListener(window.__studioChatGptAdapterListener);
}

function handleChatGptExecution(message: any, sendResponse: (response?: any) => void): boolean {
  if (message.action !== "EXECUTE_CHATGPT_JOB_V2") return false;
  const payload = message.job as JobPayload;
  const acceptedJobIds = window.__studioChatGptAcceptedJobIds || new Set<string>();
  window.__studioChatGptAcceptedJobIds = acceptedJobIds;
  if (acceptedJobIds.has(payload.jobId)) {
    sendResponse({ ok: true, duplicate: true });
    return true;
  }
  acceptedJobIds.add(payload.jobId);
  if (acceptedJobIds.size > 200) acceptedJobIds.delete(acceptedJobIds.values().next().value!);
  void executeJob(payload).finally(() => acceptedJobIds.delete(payload.jobId));
  sendResponse({ ok: true, duplicate: false });
  return true;
}

function handleChatGptCapture(message: any, sendResponse: (response?: any) => void): boolean {
  if (message.action === "CAPTURE_LATEST_CHATGPT_TEXT_V2") {
    captureLatestText(String(message.jobId || ""), String(message.task || ""));
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === "CAPTURE_CHATGPT_IMAGE_FOR_JOB_V2") {
    void captureImageForJob(String(message.jobId || ""), String(message.expectedConversationUrl || ""));
    sendResponse({ ok: true });
    return true;
  }
  return false;
}

async function readChatGptAssetForBackground(url: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      // Estuary image URLs can expire while the already-rendered image remains
      // available in the browser cache. Prefer the mounted DOM image before
      // surfacing a misleading provider/download failure.
      const mounted = Array.from(document.images).find((image) => image.src === url && image.complete && image.naturalWidth > 0);
      if (mounted) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = mounted.naturalWidth;
          canvas.height = mounted.naturalHeight;
          canvas.getContext("2d")?.drawImage(mounted, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          return { ok: true, dataUrl, mimeType: "image/png", byteSize: Math.max(0, Math.round(dataUrl.length * 0.75)), recoveredFromMountedImage: true };
        } catch (error) {
          return { ok: false, error: `HTTP_${response.status}; DOM_IMAGE_READ_FAILED: ${error instanceof Error ? error.message : String(error)}` };
        }
      }
      return { ok: false, error: `HTTP_${response.status}` };
    }
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("READ_ERROR"));
      reader.readAsDataURL(blob);
    });
    return { ok: true, dataUrl, mimeType: blob.type || "application/octet-stream", byteSize: blob.size };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const chatGptMessageListener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message, _sender, sendResponse) => {
  if (window.__studioChatGptAdapterVersion !== ADAPTER_VERSION) return false;
  if (message.action === "PING_STUDIO_ADAPTER") {
    sendResponse({ ok: true, provider: "chatgpt", version: ADAPTER_VERSION });
    return true;
  }
  if (handleChatGptExecution(message, sendResponse)) return true;
  if (handleChatGptCapture(message, sendResponse)) return true;
  if (message.action === "READ_CHATGPT_ASSET_FOR_BACKGROUND") {
    void readChatGptAssetForBackground(String(message.url || "")).then(sendResponse);
    return true;
  }
  if (message.action === "CANCEL_JOB") sendResponse({ ok: true });
  return true;
};

window.__studioChatGptAdapterVersion = ADAPTER_VERSION;
window.__studioChatGptAdapterListener = chatGptMessageListener;
chrome.runtime.onMessage.addListener(chatGptMessageListener);

export {};
