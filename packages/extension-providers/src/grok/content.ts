console.log("[Studio] Grok adapter loaded");

type JobPayload = {
  jobId: string;
  prompt: string;
  task: string;
  settings?: Record<string, unknown>;
};

const SELECTORS = {
  promptInput: [
    'textarea[aria-label*="message" i]',
    'textarea[aria-label*="prompt" i]',
    'textarea[placeholder*="Ask" i]',
    'textarea[placeholder*="Message" i]',
    'textarea[placeholder*="prompt" i]',
    '[contenteditable="true"]',
    "textarea"
  ],
  submitButton: [
    'button[aria-label*="send" i]',
    'button[aria-label*="submit" i]',
    'button[type="submit"]'
  ],
  resultMedia: ['video source[src]', "video[src]", 'a[href$=".mp4"]', 'img[src*="grok"]', 'img[alt*="Generated"]', 'img[src^="blob:"]'],
  loadingIndicator: ['[role="progressbar"]', '[aria-busy="true"]', ".animate-spin", ".loading"]
};

function isVideoJob(payload: JobPayload): boolean {
  return payload.task.includes("video") || payload.settings?.resultType === "video" || payload.settings?.mode === "video";
}

function findElement(selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) return element;
    } catch {}
  }
  return null;
}

function findElements(selectors: string[]): Element[] {
  const results = new Set<Element>();
  for (const selector of selectors) {
    try {
      document.querySelectorAll(selector).forEach((element) => results.add(element));
    } catch {}
  }
  return Array.from(results);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerGateMessage(): string | null {
  const body = document.body?.innerText || "";
  if (/security verification|cloudflare|verify you are human|just a moment/i.test(body)) {
    return "Grok is showing a security verification page. Complete it in this browser tab, then retry the job.";
  }
  if (/sign in|log in|subscribe|upgrade|not available/i.test(body)) {
    return "Grok requires sign-in, access, or subscription confirmation before automation can continue.";
  }
  return null;
}

async function ensureImaginePage(): Promise<void> {
  if (location.pathname.startsWith("/imagine") && !location.pathname.startsWith("/imagine/saved") && !location.pathname.startsWith("/imagine/projects")) return;
  location.href = "https://grok.com/imagine";
  await sleep(2500);
}

async function typePrompt(element: Element, text: string): Promise<void> {
  const target = element as HTMLElement & { value?: string };
  target.focus();
  target.dispatchEvent(new Event("focus", { bubbles: true }));
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  document.execCommand("selectAll");
  document.execCommand("insertText", false, text);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
}

function clickSubmit(): boolean {
  const button = findElement(SELECTORS.submitButton) as HTMLButtonElement | null;
  if (button && !button.disabled) {
    button.click();
    return true;
  }
  const active = document.activeElement as HTMLElement | null;
  active?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, metaKey: true }));
  active?.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, metaKey: true }));
  return true;
}

function clickTextButton(patterns: RegExp[]): boolean {
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], [role='radio']")) as HTMLElement[];
  const match = buttons.find((button) => {
    const text = `${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`.trim();
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && patterns.some((pattern) => pattern.test(text));
  });
  if (!match) return false;
  match.click();
  return true;
}

async function applyVideoSettings(payload: JobPayload): Promise<void> {
  if (!isVideoJob(payload)) return;
  clickTextButton([/\bvideo\b/i, /generate video/i]);
  await sleep(350);
  const aspectRatio = String(payload.settings?.aspectRatio || "");
  if (aspectRatio === "9:16") clickTextButton([/9:16/, /portrait/i, /story/i]);
  if (aspectRatio === "16:9") clickTextButton([/16:9/, /widescreen/i, /landscape/i]);
  if (aspectRatio === "1:1") clickTextButton([/1:1/, /square/i]);
  const duration = String(payload.settings?.durationSec || "");
  if (duration) clickTextButton([new RegExp(`${duration}\\s*s`, "i")]);
}

async function executeJob(payload: JobPayload): Promise<void> {
  const { jobId, prompt } = payload;
  try {
    await ensureImaginePage();
    const gate = providerGateMessage();
    if (gate) {
      reportResult(jobId, "waiting_manual_action", undefined, gate);
      return;
    }
    const promptInput = findElement(SELECTORS.promptInput);
    if (!promptInput) {
      reportResult(jobId, "waiting_manual_action", undefined, "Grok opened, but no composer was found. Open a Grok chat or confirm selectors from the signed-in UI, then retry.");
      return;
    }
    reportStatus(jobId, "submitting", "Typing prompt into Grok...", 0.25);
    await applyVideoSettings(payload);
    await typePrompt(promptInput, prompt);
    clickSubmit();
    reportStatus(jobId, "generating", "Waiting for Grok result...", 0.35);
    await waitForResults(jobId, isVideoJob(payload));
  } catch (error) {
    reportResult(jobId, "failed_retryable", undefined, `Grok automation error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForResults(jobId: string, expectVideo: boolean, maxWaitMs = 600000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(3000);
    const gate = providerGateMessage();
    if (gate) {
      reportResult(jobId, "waiting_manual_action", undefined, gate);
      return;
    }
    const media = findElements(SELECTORS.resultMedia);
    const loading = findElement(SELECTORS.loadingIndicator);
    const progress = Math.min((Date.now() - start) / maxWaitMs, 0.95);
    reportStatus(jobId, "generating", `Generating in Grok... ${Math.round(progress * 100)}%`, progress);
    if (!loading && media.length > 0) {
      const assets = media
        .map((element, index) => {
          const url = (element as HTMLSourceElement).src || (element as HTMLAnchorElement).href || (element as HTMLImageElement).src;
          if (!url) return null;
          const isVideo = url.includes(".mp4") || element.tagName.toLowerCase().includes("video");
          if (expectVideo && !isVideo) return null;
          return {
            type: isVideo ? "video" : "image",
            filename: `grok_${jobId}_${index}${isVideo ? ".mp4" : ".png"}`,
            downloadPath: url,
            mimeType: isVideo ? "video/mp4" : "image/png",
            metadata: { providerUrl: location.href }
          };
        })
        .filter(Boolean);
      if (assets.length > 0) {
        reportResult(jobId, "done", assets as Array<Record<string, unknown>>);
        return;
      }
    }
  }
  reportResult(jobId, "failed_retryable", undefined, "Timeout waiting for Grok result. If Grok generated the video but it was not detected, keep the tab open and report the visible UI.");
}

function reportStatus(jobId: string, status: string, message: string, progress?: number): void {
  chrome.runtime.sendMessage({ source: "content-script", data: { type: "JOB_STATUS", jobId, status, message, progress } });
}

function reportResult(jobId: string, status: string, assets?: Array<Record<string, unknown>>, error?: string): void {
  chrome.runtime.sendMessage({ source: "content-script", data: { type: "JOB_RESULT", jobId, status, assets, error } });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "EXECUTE_JOB") {
    void executeJob(message.job as JobPayload);
    sendResponse({ ok: true });
  }
  if (message.action === "CANCEL_JOB") sendResponse({ ok: true });
  return true;
});

export {};
