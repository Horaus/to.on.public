// @ts-nocheck
type ConversationBaseline = any;
type ImageCandidate = any;
type ImageWaitState = any;
let extractBalancedJsonObject: any;
let extractLatestCompleteStoryJson: any;
let extractLatestCompleteStructuredJson: any;
let findElement: any;
let findElements: any;
let hasCompleteStoryJson: any;
let hasQuickVisualAnalysis: any;
let normalizeAssistantText: any;
let normalizeQuickVisualAnalysisText: any;
let randomDelay: any;
let reportResult: any;
let reportStatus: any;
let sleep: any;
let visibleElement: any;
let SELECTORS: any;
let RetryableImageWaitError: any;

export function configureChatGptVisualRuntime(next: Record<string, any>): void {
  extractBalancedJsonObject = next.extractBalancedJsonObject;
  extractLatestCompleteStoryJson = next.extractLatestCompleteStoryJson;
  extractLatestCompleteStructuredJson = next.extractLatestCompleteStructuredJson;
  findElement = next.findElement;
  findElements = next.findElements;
  hasCompleteStoryJson = next.hasCompleteStoryJson;
  hasQuickVisualAnalysis = next.hasQuickVisualAnalysis;
  normalizeAssistantText = next.normalizeAssistantText;
  normalizeQuickVisualAnalysisText = next.normalizeQuickVisualAnalysisText;
  randomDelay = next.randomDelay;
  reportResult = next.reportResult;
  reportStatus = next.reportStatus;
  sleep = next.sleep;
  visibleElement = next.visibleElement;
  SELECTORS = next.SELECTORS;
  RetryableImageWaitError = next.RetryableImageWaitError;
}

function getAssistantTurns(): HTMLElement[] {
  const roleTurns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'));
  if (roleTurns.length > 0) return roleTurns;
  const direct = findElements(SELECTORS.resultContainer)
    .filter((element, index, values) => values.indexOf(element) === index) as HTMLElement[];
  if (direct.length > 0) return direct;
  return getConversationTurns().filter((turn) => {
    const role = turn.getAttribute("data-message-author-role");
    if (role === "assistant") return true;
    if (turn.querySelector('[data-message-author-role="assistant"]')) return true;
    const buttons = (turn.innerText || "").toLowerCase();
    return buttons.includes("good response") || buttons.includes("bad response") || buttons.includes("copy");
  });
}

function getConversationTurns(): HTMLElement[] {
  const outerTurns = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="conversation-turn-"]'));
  if (outerTurns.length > 0) return outerTurns;
  return Array.from(document.querySelectorAll<HTMLElement>("[data-message-author-role]"));
}

function getReadableChatTextSources(): string[] {
  const selectors = [
    '[data-message-author-role="assistant"]',
    '[data-testid^="conversation-turn-"]',
    "article",
    "main .markdown",
    ".markdown",
    '[class*="agent-turn"]',
    '[class*="assistant"]'
  ];
  const sources: string[] = [];
  const seen = new Set<string>();
  const add = (text?: string | null) => {
    const normalized = normalizeAssistantText(text || "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    sources.push(normalized);
  };

  for (const turn of getAssistantTurns()) add(turn.innerText);
  for (const turn of getConversationTurns()) add(turn.innerText);
  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      add(element.innerText);
    }
  }
  add(document.body.innerText || "");
  return sources;
}

function getLatestCompleteStoryText(): string {
  for (const source of getReadableChatTextSources().slice().reverse()) {
    const json = extractLatestCompleteStoryJson(source);
    if (json) return json;
  }
  return "";
}

function getLatestAssistantText(): string {
  const storyJson = getLatestCompleteStoryText();
  if (storyJson) return storyJson;

  const assistantTexts = getAssistantTurns()
    .map((turn) => normalizeAssistantText(turn.innerText || ""))
    .filter(Boolean);
  const assistantStoryJson = assistantTexts
    .slice()
    .reverse()
    .find((text) => hasCompleteStoryJson(text));
  if (assistantStoryJson) return assistantStoryJson;

  const conversationTexts = getConversationTurns()
    .map((turn) => normalizeAssistantText(turn.innerText || ""))
    .filter(Boolean);
  const structuredResponse = conversationTexts
    .slice()
    .reverse()
    .find((text: string) => hasCompleteStoryJson(text));
  if (structuredResponse) return structuredResponse;

  const pageText = document.body.innerText || "";
  const pageStoryJson = extractLatestCompleteStoryJson(pageText);
  if (pageStoryJson) return pageStoryJson;

  const assistantText = assistantTexts.at(-1);
  if (assistantText) return assistantText;
  return conversationTexts.at(-1) || getReadableChatTextSources().at(-1) || "";
}

function getLatestAssistantOnlyText(): string {
  const assistantTexts = getAssistantTurns()
    .map((turn) => normalizeAssistantText(turn.innerText || ""))
    .filter(Boolean);
  return assistantTexts.at(-1) || "";
}

function getLatestMountedAssistantText(): string {
  const mounted = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-testid^="conversation-turn-"] [data-message-author-role="assistant"], .agent-turn [data-message-author-role="assistant"], [data-message-author-role="assistant"]'
  ));
  const latest = mounted.at(-1);
  if (!latest) return "";
  const inner = normalizeAssistantText(latest.innerText || "");
  const content = normalizeAssistantText(latest.textContent || "");
  return content.length > inner.length ? content : inner;
}

function getLatestQuickVisualAnalysisText(): string {
  const assistantTexts = getAssistantTurns()
    .map((turn) => normalizeQuickVisualAnalysisText(turn.innerText || ""))
    .filter(Boolean);
  const quickVisualText = assistantTexts
    .slice()
    .reverse()
    .find((text) => hasQuickVisualAnalysis(text));
  if (quickVisualText) return quickVisualText;

  const conversationTexts = getConversationTurns()
    .map((turn) => normalizeQuickVisualAnalysisText(turn.innerText || ""))
    .filter(Boolean);
  return conversationTexts
    .slice()
    .reverse()
    .find((text) => hasQuickVisualAnalysis(text)) ||
    extractLatestQuickVisualAnalysisFromPage() ||
    normalizeQuickVisualAnalysisText(getLatestAssistantText());
}

function extractLatestQuickVisualAnalysisFromPage(jobId = ""): string {
  const pageText = document.body.innerText || "";
  const marker = jobId ? `studio_request_id: ${jobId}`.toLowerCase() : "studio_request_id:";
  const lower = pageText.toLowerCase();
  const markerIndex = lower.lastIndexOf(marker);
  const source = markerIndex >= 0 ? pageText.slice(markerIndex) : pageText;
  const headingPattern = /\b(SUBJECTS|STYLE|CHARACTER DIRECTION|BACKGROUND DIRECTION|RISKS)\s*[:：]/gi;
  const matches = Array.from(source.matchAll(headingPattern));
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index];
    if (match.index === undefined) continue;
    const candidate = normalizeQuickVisualAnalysisText(source.slice(match.index));
    if (hasQuickVisualAnalysis(candidate)) return candidate;
  }
  return "";
}

function getImageFileId(src: string): string {
  const match = src.match(/[?&]id=(file_[a-z0-9]+)/i) || src.match(/(file_[a-z0-9]+)/i);
  return match?.[1] || src;
}

function generatedImageAlt(alt: string, largeResult: boolean): boolean {
  const lower = alt.toLowerCase();
  return lower.startsWith("generated image") || lower.startsWith("image generated") || lower.startsWith("ảnh đã tạo") ||
    lower.startsWith("hình ảnh đã tạo") || lower.startsWith("tạo ảnh") || lower === "image" || alt === "" || largeResult;
}

function chatGptAssetUrl(src: string): boolean {
  return src.startsWith("blob:") || src.includes("/backend-api/") || src.includes("oaiusercontent.com") ||
    src.includes("oaidalleapiprodscus.blob.core.windows.net") || src.includes("estuary") || src.includes("files");
}

function isGeneratedImage(image: HTMLImageElement): boolean {
  if (!image.src || image.src.startsWith("data:")) return false;
  if (image.classList.contains("blur-2xl")) return false;
  const alt = image.getAttribute("alt") || "";
  const lowerAlt = alt.toLowerCase();
  const src = image.src;
  const rect = image.getBoundingClientRect();
  const looksLikeLargeResult = rect.width >= 220 && rect.height >= 220;
  const looksLikeReference = lowerAlt.includes("uploaded image") || lowerAlt.includes("user uploaded");
  return chatGptAssetUrl(src) && generatedImageAlt(alt, looksLikeLargeResult) && !looksLikeReference;
}

function generatedImageSortWeight(image: HTMLImageElement): number {
  const alt = (image.getAttribute("alt") || "").toLowerCase();
  return alt.startsWith("generated image") || alt.startsWith("ảnh đã tạo") ? 0 : 1;
}

function imageCandidateAllowed(image: HTMLImageElement, scope: ParentNode, baseline?: ConversationBaseline): ImageCandidate | null {
  if (!isGeneratedImage(image)) return null;
  const fileId = getImageFileId(image.src);
  // ChatGPT's current DOM can nest an assistant image inside a conversation
  // turn that is labelled `user` (especially after image-generation follow-up
  // UI updates). The semantic role is therefore not a safe exclusion rule.
  // Generated-image alt/src validation plus the pre-submit file-id baseline
  // already prevents uploaded/old images from being accepted.
  if (baseline?.imageFileIds.has(fileId)) return null;
  return { src: image.src, alt: image.getAttribute("alt") || "", fileId };
}

function getImageCandidates(scope: ParentNode = document, baseline?: ConversationBaseline): ImageCandidate[] {
  const byFileId = new Map<string, ImageCandidate>();
  const images = (findElements(SELECTORS.images, scope) as HTMLImageElement[]).sort((a, b) => generatedImageSortWeight(a) - generatedImageSortWeight(b) || b.getBoundingClientRect().top - a.getBoundingClientRect().top);
  for (const image of images) {
    const candidate = imageCandidateAllowed(image, scope, baseline);
    if (candidate && !byFileId.has(candidate.fileId)) byFileId.set(candidate.fileId, candidate);
  }
  return Array.from(byFileId.values());
}

function isGenerating(scope: ParentNode = document): boolean {
  if (findElement(SELECTORS.stopButton)) return true;
  const selectors = scope === document ? SELECTORS.generatingIndicator.filter((selector) => selector.includes("aria-label")) : SELECTORS.generatingIndicator;
  return findElements(selectors, scope).length > 0;
}

async function waitForGenerationIdle(maxWaitMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (!isGenerating()) return;
    await sleep(1000);
  }
}

function captureBaseline(options: { ignoreImages?: boolean } = {}): ConversationBaseline {
  const imageFileIds = new Set<string>();
  if (!options.ignoreImages) {
    for (const candidate of getImageCandidates(document)) imageFileIds.add(candidate.fileId);
  }
  return {
    assistantCount: getAssistantTurns().length,
    turnCount: getConversationTurns().length,
    latestAssistantText: normalizeAssistantText(getLatestAssistantText()),
    imageFileIds,
    url: location.href,
    capturedAt: Date.now()
  };
}

function getNewestAssistantTurn(baseline: ConversationBaseline): HTMLElement | undefined {
  const turns = getAssistantTurns();
  if (turns.length > baseline.assistantCount) return turns[turns.length - 1];
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index];
    if (getImageCandidates(turn, baseline).length > 0 || isGenerating(turn)) return turn;
  }
  return turns[turns.length - 1];
}

function getAssistantTurnForJob(jobId: string): HTMLElement | undefined {
  const turns = getConversationTurns();
  const marker = `studio_request_id: ${jobId}`.toLowerCase();
  const markerIndex = findJobMarkerIndex(turns, marker);
  if (markerIndex < 0) return undefined;
  const turnsAfterMarker = turns.slice(markerIndex + 1);
  const assistantTurns = assistantTurnsAfterMarker(turnsAfterMarker, marker);
  const selectedTurn = [...assistantTurns].reverse().find((turn) => normalizeAssistantText(turn.innerText || "").length > 20 && !isGenerating(turn)) ?? assistantTurns.at(-1);
  if (!selectedTurn) return undefined;
  // ChatGPT can virtualize/truncate the outer conversation-turn text while the
  // nested author-role node still contains the complete streamed response.
  // Always prefer that role-scoped node so structured JSON is not cut mid-way.
  return selectedTurn.matches('[data-message-author-role="assistant"]')
    ? selectedTurn
    : selectedTurn.querySelector<HTMLElement>('[data-message-author-role="assistant"]') ?? selectedTurn;
}

function findJobMarkerIndex(turns: HTMLElement[], marker: string) {
  return turns.findIndex((turn) => {
    const role = turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
    return role === "user" && (turn.innerText || "").toLowerCase().includes(marker);
  });
}

function assistantTurnsAfterMarker(turns: HTMLElement[], marker: string) {
  const explicit = turns.filter((turn) => {
    const role = turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
    return role === "assistant" || Boolean(turn.querySelector('[data-message-author-role="assistant"]'));
  });
  if (explicit.length) return explicit;
  return turns.filter((turn) => {
    const role = turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
    const text = (turn.innerText || "").trim();
    return role !== "user" && text.length > 0 && !text.toLowerCase().includes(marker);
  });
}

function getCompleteStructuredTextForJob(jobId: string, task: string): string {
  const turns = getConversationTurns();
  const marker = `studio_request_id: ${jobId}`.toLowerCase();
  const markerIndex = turns.findIndex((turn) => {
    const role = turn.getAttribute("data-message-author-role") ||
      turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
    return role === "user" && (turn.innerText || "").toLowerCase().includes(marker);
  });
  if (markerIndex < 0) return "";

  for (let index = turns.length - 1; index > markerIndex; index--) {
    const turn = turns[index];
    const role = turn.getAttribute("data-message-author-role") ||
      turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
    if (role !== "assistant" && !turn.querySelector('[data-message-author-role="assistant"]')) continue;
    const normalized = normalizeAssistantText(turn.innerText || "");
    const json = task === "story_development"
      ? extractLatestCompleteStoryJson(normalized)
      : extractLatestCompleteStructuredJson(normalized, task);
    if (json) return json;
  }
  return "";
}

function isNewAssistantTextSinceBaseline(text: string, baseline: ConversationBaseline): boolean {
  const normalized = normalizeAssistantText(text);
  if (!normalized) return false;
  if (!baseline.latestAssistantText) return true;
  if (normalized === baseline.latestAssistantText) return false;
  return !baseline.latestAssistantText.includes(normalized) && !normalized.includes(baseline.latestAssistantText);
}

const PROVIDER_ERROR_CHECKS: Array<[string, string[]]> = [
    ["RATE_LIMIT", ["usage cap", "too many requests", "rate limit", "message cap", "sending requests too quickly", "đã đạt giới hạn", "hết lượt", "quá nhiều yêu cầu", "bạn đang gửi yêu cầu quá nhanh", "tạm thời hạn chế quyền truy cập"]],
    ["CONTENT_BLOCKED", ["content policy", "cannot help create", "không thể hỗ trợ", "vi phạm"]],
    ["LOGIN_REQUIRED", ["log in", "sign in", "đăng nhập"]],
    [
      "IMAGE_REFERENCE_REQUIRED",
      [
        "upload the reference image",
        "usable reference image",
        "vui lòng upload",
        "chỉ rõ hình ảnh tham chiếu",
        "please either upload",
        "interpreted as an edit",
        "hiểu nhầm yêu cầu là chỉnh sửa ảnh",
        "không tạo được ảnh",
        "không thể tạo ảnh",
        "không cần upload ảnh"
      ]
    ],
    ["NETWORK", ["network error", "something went wrong", "đã xảy ra lỗi"]]
];

function isStructuredProviderPayload(rawText: string): boolean {
  if (/^[{[]/.test(rawText)) return true;
  const candidate = extractBalancedJsonObject(rawText);
  if (!candidate) return false;
  try {
    const parsed = JSON.parse(candidate);
    return Boolean(parsed && typeof parsed === "object" && ((parsed.logline && parsed.story) || parsed.sourceAnalysis || (Array.isArray(parsed.shots) && parsed.shots.length > 0)));
  } catch {
    return false;
  }
}

function firstProviderError(text: string): string | null {
  return PROVIDER_ERROR_CHECKS.find(([, patterns]) => patterns.some((pattern) => text.includes(pattern)))?.[0] || null;
}

function detectProviderError(scope: ParentNode): string | null {
  const rawText = ((scope as HTMLElement).innerText || "").trim();
  if (isStructuredProviderPayload(rawText)) return null;
  return firstProviderError(rawText.toLowerCase());
}

function conversationPath(value: string): string {
  try {
    return new URL(value).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isLoginPage(): boolean {
  const path = location.pathname.toLowerCase();
  const text = (document.body.innerText || "").toLowerCase();
  return path.includes("/auth/") ||
    (!findElement(SELECTORS.promptInput) && ["log in", "sign in", "đăng nhập"].some((value) => text.includes(value)));
}

async function waitForImageResults(jobId: string, baseline: ConversationBaseline, maxWaitMs = 180000): Promise<void> {
  const startTime = Date.now();
  const state: ImageWaitState = {
    lastProgressAt: 0, generationSeen: false, lastGeneratingAt: startTime,
    stableCandidateKey: "", stableCandidateSeenAt: 0, lastCandidateChangeAt: startTime,
    providerRetryAttempts: 0
  };
  while (Date.now() - startTime < maxWaitMs) {
    await sleep(1000);
    if (await pollImageResult(jobId, baseline, state, startTime, maxWaitMs)) return;
  }
  throw new RetryableImageWaitError("Timeout waiting for ChatGPT image response");
}

type ImageWaitState = {
  lastProgressAt: number; generationSeen: boolean; lastGeneratingAt: number;
  stableCandidateKey: string; stableCandidateSeenAt: number; lastCandidateChangeAt: number;
  providerRetryAttempts: number;
};

function visibleChatGptRetryButton(): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((element) => {
    const label = `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`.trim().toLowerCase();
    return visibleElement(element) && /try again|retry|thử lại/.test(label);
  }) as HTMLButtonElement | undefined;
}

async function retryTransientImageError(jobId: string, state: ImageWaitState, candidates: ReturnType<typeof getImageCandidates>, error: string | null) {
  const retryButton = visibleChatGptRetryButton();
  if (candidates.length || error !== "NETWORK" || !retryButton || state.providerRetryAttempts >= 2) return false;
  state.providerRetryAttempts++;
  reportStatus(jobId, "generating", `ChatGPT returned a temporary generation error. Retrying the same request (${state.providerRetryAttempts}/2)...`);
  retryButton.click();
  state.generationSeen = false;
  state.lastGeneratingAt = Date.now();
  await sleep(2500);
  return true;
}

function assertImageProviderHealthy(candidates: ReturnType<typeof getImageCandidates>, error: string | null, generating: boolean, latestTurn: HTMLElement | null) {
  if (candidates.length || !error || (generating && error !== "IMAGE_REFERENCE_REQUIRED")) return;
  throw new RetryableImageWaitError(`${error}: ${((latestTurn || document.body).innerText || "").slice(0, 400)}`);
}

function assertImageWaitNotStalled(state: ImageWaitState, generating: boolean) {
  if (state.generationSeen && !generating && Date.now() - state.lastGeneratingAt > 90000) {
    throw new RetryableImageWaitError("ChatGPT generation stopped but no new image appeared.");
  }
  if (state.stableCandidateKey && generating && Date.now() - state.lastCandidateChangeAt > 45000) {
    throw new RetryableImageWaitError("ChatGPT image result appeared but never became idle for capture.");
  }
}

function reportImageWaitProgress(jobId: string, state: ImageWaitState, startTime: number, maxWaitMs: number) {
  if (Date.now() - state.lastProgressAt <= 3000) return;
  const progress = Math.min((Date.now() - startTime) / maxWaitMs, 0.95);
  reportStatus(jobId, "generating", `Waiting for new ChatGPT image result... ${Math.round(progress * 100)}%`, progress);
  state.lastProgressAt = Date.now();
}

async function pollImageResult(jobId: string, baseline: ConversationBaseline, state: ImageWaitState, startTime: number, maxWaitMs: number): Promise<boolean> {
  const latestTurn = getNewestAssistantTurn(baseline);
  const generating = isGenerating();
  // New ChatGPT image turns can be mounted under a conversation turn that is
  // labelled `user`, so they may not be descendants of the newest semantic
  // assistant turn. Prefer the scoped result, then inspect the whole document
  // with the same file-id baseline before declaring the provider stalled.
  const scopedCandidates = latestTurn ? getImageCandidates(latestTurn, baseline) : [];
  const candidates = scopedCandidates.length ? scopedCandidates : getImageCandidates(document, baseline);
  const error = latestTurn ? detectProviderError(latestTurn) : detectProviderError(document.body);
  if (await retryTransientImageError(jobId, state, candidates, error)) return false;
  assertImageProviderHealthy(candidates, error, generating, latestTurn ?? null);
  updateImageWaitState(state, candidates, generating);
  if (await reportStableImageCandidates(jobId, candidates, generating, state)) return true;
  assertImageWaitNotStalled(state, generating);
  reportImageWaitProgress(jobId, state, startTime, maxWaitMs);
  return false;
}

function updateImageWaitState(state: ImageWaitState, candidates: ReturnType<typeof getImageCandidates>, generating: boolean): void {
  if (generating) {
    state.generationSeen = true;
    state.lastGeneratingAt = Date.now();
  }
  const key = candidates.map((candidate) => candidate.fileId).join("|");
  if (!key || key === state.stableCandidateKey) return;
  state.stableCandidateKey = key;
  state.stableCandidateSeenAt = Date.now();
  state.lastCandidateChangeAt = Date.now();
}

async function reportStableImageCandidates(jobId: string, candidates: ReturnType<typeof getImageCandidates>, generating: boolean, state: ImageWaitState): Promise<boolean> {
  const stableMs = state.stableCandidateKey ? Date.now() - state.stableCandidateSeenAt : 0;
  if (candidates.length === 0 || (generating && stableMs <= 12000)) return false;
  reportStatus(jobId, "downloading", "Found new ChatGPT image result; sending result to extension...");
  await randomDelay(900, 1600);
  const assets = await Promise.all(candidates.map(async (candidate, index) => {
    const mounted = await mountedImageDataUrl(candidate.src);
    return {
    type: "image", filename: `chatgpt_${jobId}_${index}.png`,
    // Keep the cross-origin provider URL in the result envelope. Sending a
    // rendered PNG data URL through chrome.runtime can exceed the practical
    // message budget and strand the job at `downloading`; the background
    // downloader already fetches this URL in the signed-in provider tab and
    // converts it to durable bytes before desktop import.
    filePath: mounted || undefined, downloadPath: candidate.src, mimeType: "image/png",
    metadata: { altPrompt: candidate.alt.replace(/^Generated image:\s*/i, ""), fileId: candidate.fileId, conversationUrl: location.href }
    };
  }));
  await reportResult(jobId, "done", assets);
  return true;
}

async function mountedImageDataUrl(src: string): Promise<string | undefined> {
  const image = Array.from(document.images).find((candidate) => candidate.src === src);
  if (image?.complete && image.naturalWidth > 0) try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl.startsWith("data:image/")) return dataUrl;
  } catch {
    // Signed ChatGPT image URLs can be cross-origin to the page and therefore
    // reject canvas reads. Fetch the same URL with the tab's credentials and
    // convert the response to a data URL before leaving the provider boundary.
  }
  try {
    const response = await fetch(src, { credentials: "include" });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" && reader.result.startsWith("data:image/") ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}


export { getAssistantTurns, getConversationTurns, getReadableChatTextSources, getLatestCompleteStoryText, getLatestAssistantText, getLatestAssistantOnlyText, getLatestMountedAssistantText, getLatestQuickVisualAnalysisText, extractLatestQuickVisualAnalysisFromPage, getImageFileId, generatedImageAlt, chatGptAssetUrl, isGeneratedImage, generatedImageSortWeight, imageCandidateAllowed, getImageCandidates, isGenerating, waitForGenerationIdle, captureBaseline, getNewestAssistantTurn, getAssistantTurnForJob, findJobMarkerIndex, assistantTurnsAfterMarker, getCompleteStructuredTextForJob, isNewAssistantTextSinceBaseline, isStructuredProviderPayload, firstProviderError, detectProviderError, conversationPath, isLoginPage, waitForImageResults, visibleChatGptRetryButton, retryTransientImageError, assertImageProviderHealthy, assertImageWaitNotStalled, reportImageWaitProgress, pollImageResult, updateImageWaitState, reportStableImageCandidates };
