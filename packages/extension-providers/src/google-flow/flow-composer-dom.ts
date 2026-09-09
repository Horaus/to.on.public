type ClickResult = any;
export type FlowComposerDomDeps = Record<string, any>;

let activeDeps: Record<string, any>;

function getActiveSettingsPanel(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-state="open"]'))
    .filter((element) => {
      const text = element.innerText || "";
      return activeDeps.isVisible(element) && /khung hình|thành phần|hình ảnh|video|omni|4s|6s|8s|10s|x1|x2|x3|x4|9\s*:\s*16|16\s*:\s*9/i.test(text);
    });
  const sidePanel = Array.from(document.querySelectorAll<HTMLElement>("div, aside, section"))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const text = element.innerText || "";
      return activeDeps.isVisible(element)
        && rect.width >= 240
        && rect.height >= 360
        && rect.left > window.innerWidth * 0.55
        && /cài đặt tác nhân|generation defaults|chế độ mặc định|tính năng tạo video|omni|9\s*:\s*16|16\s*:\s*9/i.test(text);
    })
    .at(-1);
  return candidates.at(-1) || sidePanel || null;
}

function getComposerSettingsMenu(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"], [data-radix-popper-content-wrapper], [data-state="open"]'))
    .filter((element) => {
      const text = element.innerText || "";
      const rect = element.getBoundingClientRect();
      return activeDeps.isVisible(element)
        && rect.top > window.innerHeight * 0.35
        && /hình ảnh|image/i.test(text)
        && /video/i.test(text)
        && /9\s*:\s*16|16\s*:\s*9|4\s*:\s*3|3\s*:\s*4|1\s*:\s*1/i.test(text)
        && /x\s*1|1x|x\s*2|x\s*3|x\s*4|4s|6s|8s|10s/i.test(text);
    })
    .at(-1) || null;
}

function getComposerSettingsButton(): HTMLElement | null {
  const composerRoot = activeDeps.getComposerRoot();
  const directTriggers = Array.from(document.querySelectorAll<HTMLElement>("button.settings-trigger-button, button[aria-label*='cài đặt' i], button[aria-label*='settings' i]"))
    .filter((button) => activeDeps.isVisible(button) && button.getBoundingClientRect().top > window.innerHeight * 0.55);
  if (directTriggers.length) return directTriggers.at(-1) || null;
  if (!composerRoot) return null;
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']")).filter((button) => isComposerSettingsButton(button, composerRoot));
  const openTrigger = buttons.find((button) => button.getAttribute("aria-expanded") === "true" && button.getAttribute("aria-haspopup"));
  if (openTrigger) return openTrigger;
  const compactComposerButton = buttons.find((button) => {
    const rect = button.getBoundingClientRect();
    const text = activeDeps.visibleText(button);
    return rect.width >= 90
      && rect.width <= 260
      && rect.height >= 32
      && rect.height <= 90
      && /nano|veo|video|hình ảnh|image|\d+\s*s|x\s*1|1x/i.test(text);
  });
  return compactComposerButton || buttons.at(-1) || null;
}

function isComposerSettingsButton(button: HTMLElement, composerRoot: HTMLElement): boolean {
  if (!activeDeps.isVisible(button)) return false;
  const text = activeDeps.visibleText(button);
  const rect = button.getBoundingClientRect();
  const isInsideComposer = composerRoot.contains(button) || Boolean(button.closest("[data-radix-popper-content-wrapper], [role='menu']"));
  return isInsideComposer && rect.top > window.innerHeight * 0.55
    && /video|hình ảnh|image|nano|veo|model/i.test(text)
    && /\d+\s*s|9\s*:\s*16|16\s*:\s*9|1\s*:\s*1|x\s*1|1x|nano|veo/i.test(text);
}

function composerSettingsText(): string {
  return [
    getComposerSettingsButton(),
    getComposerSettingsMenu()
  ]
    .filter(Boolean)
    .map((element) => activeDeps.visibleText(element as Element))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function flowIsImageEditorSurface(): boolean {
  return Boolean(document.querySelector("flow-image-editor, .image-editor, flow-edit-image-prompt-box"));
}

function composerShowsVideoMode(): boolean {
  // When the selector menu is open it necessarily contains both the Image
  // and Video options. Inspect the compact trigger alone; combining the menu
  // text here made a valid Video selection look like Nano Banana/image mode.
  const trigger = getComposerSettingsButton();
  const text = trigger ? activeDeps.visibleText(trigger) : "";
  const nativeTrigger = Array.from(document.querySelectorAll<HTMLElement>("button.settings-trigger-button, button[aria-label*='cài đặt' i], button[aria-label*='settings' i]"))
    .filter((button) => activeDeps.isVisible(button)).at(-1);
  const nativeText = nativeTrigger ? activeDeps.visibleText(nativeTrigger).replace(/\s+/g, " ").trim() : "";
  if (/^video\b/i.test(nativeText) && !/nano\s+banana|hình ảnh|\bimage\b/i.test(nativeText)) return true;
  // The Agent shell can leave a stale hidden settings label containing
  // “Video” while the visible composer is still Nano Banana/image mode. Only
  // treat the route as Video when the visible settings identify a video model
  // (Veo/Video), and reject the image model label explicitly.
  return Boolean(activeDeps.getComposerRoot())
    && /(^|\s)(?:video|veo)(\s|·|$)/i.test(text)
    && !/nano\s+banana|hình ảnh|\bimage\b/i.test(text);
}

function composerShowsAspectRatio(aspectRatio: string): boolean {
  if (!aspectRatio) return true;
  const text = composerSettingsText();
  const compactRatio = aspectRatio.replace(":", "_");
  const escapedRatio = aspectRatio.replace(":", "\\s*:?\\s*");
  return new RegExp(escapedRatio).test(text) || new RegExp(`crop_${compactRatio}`, "i").test(text);
}

function composerShowsDuration(durationSec: number): boolean {
  if (!durationSec) return true;
  const flowDuration = activeDeps.resolveProviderVideoDuration("google-flow", durationSec);
  const settingsText = composerSettingsText();
  if (settingsText.includes(`${flowDuration} giây`) || settingsText.includes(`${flowDuration} seconds`)) return true;
  const localizedDuration = [4, 6, 8, 10].find((value) => settingsText.includes(`${value} giây`) || settingsText.includes(`${value} seconds`));
  if (localizedDuration !== undefined && localizedDuration >= flowDuration) return true;
  if (new RegExp(`(^|\\D)${flowDuration}\\s*s(?=\\D|$)`, "i").test(settingsText)) return true;
  const visibleDuration = Number(settingsText.match(/(^|\D)(4|6|8|10)\s*s(?=\D|$)/i)?.[2] || 0);
  return visibleDuration >= flowDuration;
}

function isFlowAgentShellVisible(): boolean {
  const bodyText = document.body?.innerText || "";
  return /bắt đầu tạo hoặc thả nội dung nghe nhìn|thả nội dung nghe nhìn|start creating or drop media|drop media|thêm thành phần|add component|cài đặt tác nhân|agent settings|hướng dẫn cho tác nhân|agent instructions/i.test(bodyText)
    && !getComposerSettingsButton()
    && !getComposerSettingsMenu();
}

async function ensureFlowProjectRoute(jobId: string): Promise<boolean> {
  const match = location.pathname.match(/^(\/fx\/(?:[^/]+\/)?tools\/flow\/project\/[^/]+)/i);
  if (!match) {
    // Flow's short project URL (flow.google.com/project/<id>) is a valid
    // signed-in workspace and is the route TobyFlow commonly leaves open.
    // Accept it in-place so the native composer can continue without
    // requiring the user to focus or manually navigate.
    const shortProject = location.pathname.match(/^(\/project\/[^/]+)(?:\/edit\/[^/]+)?\/?$/i);
    if (shortProject) {
      if (location.pathname !== shortProject[1] || flowIsImageEditorSurface()) {
        activeDeps.flowTrace(jobId, "Leaving the Flow image editor and restoring the project composer in the background.", 0.04, "opening_provider");
        location.assign(`${location.origin}${shortProject[1]}`);
        await activeDeps.sleep(6500);
      }
      // The short flow.google.com route is the authenticated workspace in
      // some profiles; preserve it instead of redirecting to labs.google,
      // which can trigger a different account chooser. TobyFlow operates on
      // this route directly, so native Flow does too.
      activeDeps.flowTrace(jobId, "Using the authenticated Flow short project route in the background tab.", 0.04, "opening_provider");
      return true;
    }
    if (/^\/fx\/(?:[^/]+\/)?tools\/flow\/?$/i.test(location.pathname)) {
      return activeDeps.openNewFlowProjectComposer(jobId);
    }
    activeDeps.reportResult(jobId, "waiting_manual_action", undefined, "Google Flow must be opened on a project URL like /fx/vi/tools/flow/project/... before video automation can run.");
    return false;
  }
  const projectRoot = match[1];
  if (flowIsImageEditorSurface()) {
    activeDeps.flowTrace(jobId, "Leaving the Flow image editor and restoring the project composer in the background.", 0.04, "opening_provider");
    location.assign(`${location.origin}${projectRoot}`);
    await activeDeps.sleep(6500);
  }
  if (location.pathname !== projectRoot) {
    activeDeps.flowTrace(jobId, `Returning Google Flow from ${location.pathname} to the project workspace before running video automation.`, 0.04, "opening_provider");
    const needsFullNavigation = /\/edit\/|\/view\/|\/asset\//i.test(location.pathname);
    if (needsFullNavigation) {
      location.assign(projectRoot);
      await activeDeps.sleep(6500);
    } else {
      history.pushState({}, "", projectRoot);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      await activeDeps.sleep(2500);
    }
    if (location.pathname !== projectRoot) {
      location.assign(projectRoot);
      await activeDeps.sleep(6500);
    }
  }
  await activeDeps.closeMediaPickerIfOpen();
  await activeDeps.closeTransientFlowOverlays(jobId);
  return true;
}

async function openComposerSettingsMenu(jobId: string): Promise<HTMLElement | null> {
  const openMenu = getComposerSettingsMenu();
  if (openMenu) return openMenu;
  const button = getComposerSettingsButton();
  if (!button) return null;
  activeDeps.flowTrace(jobId, `Opening Flow composer video controls (${activeDeps.compactText(activeDeps.visibleText(button), 80)}).`);
  await activeDeps.clickVisibleElement(button);
  return getComposerSettingsMenu();
}

async function ensureFlowVideoComposerMode(jobId: string): Promise<boolean> {
  if (composerShowsVideoMode()) {
    activeDeps.flowTrace(jobId, `Flow composer is already in Video mode (${activeDeps.compactText(composerSettingsText(), 80)}).`);
    return true;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const menu = await openComposerSettingsMenu(jobId);
    if (!menu) {
      await activeDeps.humanPause(450, 850);
      continue;
    }

    const videoResult = await activeDeps.clickVisibleText([/^video$/i, /(^|\s)video$/i], menu);
    if (videoResult.ok) {
      activeDeps.flowTrace(jobId, `Flow composer switched to Video tab (${videoResult.text || "Video"}).`);
      await activeDeps.humanPause(700, 1200);
      if (composerShowsVideoMode()) return true;
    }

    const videoTab = Array.from(menu.querySelectorAll<HTMLElement>("button, [role='button'], [role='tab'], label"))
      .filter(activeDeps.isVisible)
      .find((element) => /(^|\s)video$/i.test(activeDeps.normalizedFlowControlText(element)) || /video$/i.test(activeDeps.visibleText(element).replace(/\s+/g, " ").trim()));
    if (videoTab) {
      activeDeps.simulateClick(videoTab);
      activeDeps.flowTrace(jobId, `Flow composer switched to Video tab via direct tab selector (${activeDeps.compactText(activeDeps.visibleText(videoTab), 40)}).`);
      await activeDeps.humanPause(700, 1200);
      if (composerShowsVideoMode()) return true;
    }
  }
  console.warn(`[Studio][Flow][${jobId}] Flow composer Video tab was not found.`, activeDeps.flowDebugSnapshot());
  return false;
}

async function closeFlowSettingsPanelIfOpenUnbounded(jobId: string): Promise<void> {
  // The compact composer controls are a Radix menu, not a side panel. A
  // synthetic Escape can be ignored while Flow is restoring the composer
  // after a setting click, leaving the menu mounted over the Slate editor.
  // Toggle the actual trigger once and verify that the open menu disappeared
  // before falling back to the broader side-panel handling below.
  const composerMenu = getComposerSettingsMenu();
  if (composerMenu) {
    const trigger = getComposerSettingsButton();
    if (trigger) {
      activeDeps.flowTrace(jobId, "Closing the open Flow composer settings menu before prompt input...");
      await activeDeps.clickElementNative(trigger);
      await activeDeps.humanPause(350, 650);
      if (getComposerSettingsMenu()) {
        // Native CDP activation can be swallowed when the trigger is partially
        // clipped by Flow's bottom composer. React's own activation is a
        // bounded fallback, followed by an explicit state check.
        trigger.click();
        await activeDeps.humanPause(250, 450);
      }
    }
    if (getComposerSettingsMenu()) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await activeDeps.humanPause(350, 650);
    }
    if (getComposerSettingsMenu()) {
      // Clicking the editor is Flow's reliable pointer-outside path. Use the
      // native click so Radix receives a trusted event and Slate is already
      // the next focus target for prompt insertion.
      const editor = activeDeps.activeFlowPromptEditor?.();
      if (editor) {
        await activeDeps.clickElementNative(editor);
        await activeDeps.humanPause(250, 450);
      }
    }
    if (getComposerSettingsMenu() && activeDeps.runFlowMainWorldAction) {
      await activeDeps.runFlowMainWorldAction("close-settings-menu");
      await activeDeps.humanPause(250, 450);
    }
  }
  const panel = getActiveSettingsPanel();
  if (!panel) return;

  activeDeps.flowTrace(jobId, "Closing open Flow settings panel before continuing...");
  const saved = await activeDeps.clickVisibleText([/^lưu$/i, /^save$/i], panel);
  if (saved.ok) {
    await activeDeps.humanPause(700, 1200);
    if (!getActiveSettingsPanel()) return;
  }

  const rightSideButtons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return activeDeps.isVisible(button) && rect.left > window.innerWidth * 0.55;
    });
  const closeButton = rightSideButtons.find((button) => /quay lại|back|đóng|close|^x$/i.test(activeDeps.visibleText(button)))
    || rightSideButtons.find((button) => {
      const label = activeDeps.visibleText(button);
      const iconText = (button.querySelector("svg")?.textContent || "").trim();
      return /arrow_back|chevron_left|close/i.test(label + " " + iconText);
    });
  if (closeButton) {
    activeDeps.simulateClick(closeButton);
    await activeDeps.humanPause(650, 1000);
  }
  if (getActiveSettingsPanel()) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await activeDeps.humanPause(650, 1000);
  }
}

// Flow can leave a Radix/settings surface in a half-restored state after a
// navigation. Native CDP activation may then never resolve, which used to
// hold a provider job in `submitting` until the five-minute watchdog. Keep
// this boundary bounded so the caller can report the observed state and fail
// closed without creating a hidden retry loop.
async function closeFlowSettingsPanelIfOpen(jobId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closeFlowSettingsPanelIfOpenUnbounded(jobId),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 8_000); })
    ]);
    if (timer) clearTimeout(timer);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensureFlowAgentModeOff(jobId: string): Promise<void> {
  const agentButtons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    .filter((button) => activeDeps.isVisible(button) && /^(tác nhân|agent)$/i.test(activeDeps.visibleText(button).replace(/\s+/g, " ").trim()))
  // Flow also renders Agent suggestion cards with the same visible label.
  // Only the mode toggle exposes aria-pressed/aria-selected; choosing the
  // last matching label clicked a suggestion and left the Agent shell active.
  const agentButton = agentButtons.find((button) => button.hasAttribute("aria-pressed") || button.hasAttribute("aria-selected"))
    || agentButtons.at(-1);
  if (!agentButton) return;
  const stateText = [
    agentButton.getAttribute("aria-pressed"),
    agentButton.getAttribute("aria-selected"),
    agentButton.getAttribute("data-state"),
    agentButton.getAttribute("aria-expanded"),
    agentButton.className
  ].filter(Boolean).join(" ");
  const agentShellVisible = isFlowAgentShellVisible();
  if (!agentShellVisible && !/true|checked|selected|active|open/i.test(stateText)) return;
  activeDeps.flowTrace(jobId, "Flow agent mode is enabled; switching it off before running the classic composer automation.", 0.12);
  await activeDeps.clickElementNative(agentButton);
  await activeDeps.humanPause(700, 1200);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000 && isFlowAgentShellVisible()) await activeDeps.sleep(200);
}

async function clickByIdSuffix(suffix: string, scope: ParentNode = document): Promise<ClickResult> {
  const escaped = suffix.replace(/"/g, '\\"');
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(`button[id$="-trigger-${escaped}"], [role="button"][id$="-trigger-${escaped}"]`))
    .filter(activeDeps.isVisible);
  const match = candidates.at(-1);
  if (!match) return { ok: false };
  await activeDeps.clickElementNative(match);
  await activeDeps.humanPause();
  return { ok: true, via: `id:${suffix}`, text: activeDeps.compactText(activeDeps.visibleText(match), 90) };
}

async function clickInComposerSettings(jobId: string, label: string, patterns: RegExp[], retryCount = 3, suffixes: string[] = []): Promise<ClickResult> {
  for (let attempt = 0; attempt < retryCount; attempt++) {
    const menu = await openComposerSettingsMenu(jobId);
    if (menu) {
      for (const suffix of suffixes) {
        const suffixResult = await clickByIdSuffix(suffix, menu);
        if (suffixResult.ok) {
          activeDeps.flowTrace(jobId, `Flow composer setting "${label}" clicked via ${suffixResult.via}${suffixResult.text ? ` (${suffixResult.text})` : ""}.`);
          return suffixResult;
        }
      }
      const scopedResult = await activeDeps.clickVisibleText(patterns, menu);
      if (scopedResult.ok) {
        activeDeps.flowTrace(jobId, `Flow composer setting "${label}" clicked via ${scopedResult.via}${scopedResult.text ? ` (${scopedResult.text})` : ""}.`);
        return scopedResult;
      }
    }
    await activeDeps.humanPause(450, 850);
  }
  console.warn(`[Studio][Flow][${jobId}] Flow composer setting "${label}" was not found.`, activeDeps.flowDebugSnapshot());
  return { ok: false };
}

async function clickInComposerSettingsBounded(
  jobId: string,
  label: string,
  patterns: RegExp[],
  retryCount = 2,
  suffixes: string[] = [],
  timeoutMs = 2500
): Promise<ClickResult> {
  const result = await activeDeps.withTimeout(
    clickInComposerSettings(jobId, label, patterns, retryCount, suffixes),
    timeoutMs,
    { ok: false, via: "timeout" }
  );
  if (!result.ok && result.via === "timeout") {
    activeDeps.flowTrace(jobId, `Flow composer setting "${label}" timed out; continuing with visible composer state.`, 0.18);
  }
  return result;
}


export function createFlowComposerDom(deps: FlowComposerDomDeps) {
  activeDeps = deps;
  return { getActiveSettingsPanel, getComposerSettingsMenu, getComposerSettingsButton, composerSettingsText, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, isFlowAgentShellVisible, ensureFlowProjectRoute, openComposerSettingsMenu, ensureFlowVideoComposerMode, closeFlowSettingsPanelIfOpen, ensureFlowAgentModeOff, clickByIdSuffix, clickInComposerSettings, clickInComposerSettingsBounded };
}
