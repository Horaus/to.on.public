type JobPayload = any;

export function createFlowComposerSettings(runtime: Record<string, any>) {
  return {
    aspectRatioSuffix: (aspectRatio: string) => aspectRatioSuffix(runtime, aspectRatio),
    flowVideoSourceMode: (payload: JobPayload) => flowVideoSourceMode(runtime, payload),
    flowComposerLooksVideoReady: (payload: JobPayload) => flowComposerLooksVideoReady(runtime, payload),
    waitForFlowComposerVideoReady: (payload: JobPayload, timeoutMs = 5000) => waitForFlowComposerVideoReady(runtime, payload, timeoutMs),
    selectFlowVideoSourceMode: (jobId: string, payload: JobPayload) => selectFlowVideoSourceMode(runtime, jobId, payload),
    focusFlowStartFrameSlot: (jobId: string) => focusFlowStartFrameSlot(runtime, jobId),
    applyFlowAspectRatio: (jobId: string, aspectRatio: string) => applyFlowAspectRatio(runtime, jobId, aspectRatio),
    applyFlowDuration: (jobId: string, payload: JobPayload, durationSec: number) => applyFlowDuration(runtime, jobId, payload, durationSec),
    applyFlowSettingsForJob: (jobId: string, payload: JobPayload) => applyFlowSettingsForJob(runtime, jobId, payload)
  };
}

function aspectRatioSuffix(runtime: Record<string, any>, aspectRatio: string): string | null {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  if (aspectRatio === "9:16") return "PORTRAIT";
  if (aspectRatio === "16:9") return "LANDSCAPE";
  if (aspectRatio === "1:1") return "SQUARE";
  return null;

}

function flowVideoSourceMode(runtime: Record<string, any>, payload: JobPayload): "components" | "frames" {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  const requested = String(payload.settings?.flowVideoMode || payload.settings?.sourceMode || "").toLowerCase();
  if (/frame|khung/i.test(requested)) return "frames";
  return "components";

}

function flowComposerLooksVideoReady(runtime: Record<string, any>, payload: JobPayload): boolean {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  if (!isVideoJob(payload)) return true;
  const aspectRatio = String(payload.settings?.aspectRatio || "");
  const durationSec = Number(payload.settings?.durationSec || 0);
  return composerShowsVideoMode()
    && composerShowsAspectRatio(aspectRatio)
    && composerShowsDuration(durationSec);

}

async function waitForFlowComposerVideoReady(runtime: Record<string, any>, payload: JobPayload, timeoutMs = 5000): Promise<boolean> {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (flowComposerLooksVideoReady(runtime, payload)) return true;
    await sleep(200);
  }
  return flowComposerLooksVideoReady(runtime, payload);

}

async function selectFlowVideoSourceMode(runtime: Record<string, any>, jobId: string, payload: JobPayload): Promise<string[]> {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  const missing: string[] = [];
  if (!isVideoJob(payload)) return missing;
  const sourceMode = flowVideoSourceMode(runtime, payload);
  const composerSurfaceReady = Boolean(getComposerRoot() || runtime.activeFlowPromptEditor?.());
  if (sourceMode === "frames" && !composerSurfaceReady) {
    if (!(await openFlowComposerFromProjectGrid(jobId)) || !getComposerRoot()) {
      flowTrace(jobId, "Flow frame-source mode needs the classic composer, but the project grid/agent shell did not expose one.", 0.17);
      missing.push("classic video composer");
      return missing;
    }
  }
  flowTrace(jobId, `Selecting Google Flow video source mode (${sourceMode === "components" ? "Thành phần" : "Khung hình"}).`);
  if (!(await ensureFlowVideoComposerMode(jobId))) missing.push("Video mode");
  if (sourceMode === "frames") {
    // Flow V2 exposes frame mode directly through the Bắt đầu/Kết thúc
    // ingredient bar and does not render a separate "Frame source mode"
    // menu. Opening the compact settings menu here causes a composer
    // rerender that can detach an already-selected start frame. The native
    // frame slots are the stronger mode signal, so leave them untouched.
    if (flowStartOrEndFrameSlots().length >= 2) {
      flowTrace(jobId, "Flow V2 frame slots are already present; keeping native frame mode without opening the unavailable source-mode menu.", 0.17);
      return missing;
    }
    const frameMode = await clickInComposerSettingsBounded(jobId, "Frame source mode", [/khung hình/i, /^frames?$/i], 1, ["VIDEO_FRAMES"]);
    if (!frameMode.ok) {
      flowTrace(jobId, "Flow frame-source control was not visible; continuing with Video tab selected and using the start-frame slot.", 0.17);
    }
  } else {
    const componentMode = await clickInComposerSettingsBounded(jobId, "Component source mode", [/thành phần/i, /ingredient/i, /component/i, /reference/i], 1, ["VIDEO_REFERENCES"]);
    if (!componentMode.ok) {
      flowTrace(jobId, "Flow component-source control was not visible; continuing with the current Video composer mode.", 0.17);
    }
  }
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await humanPause(500, 850);
  return missing;

}

async function focusFlowStartFrameSlot(runtime: Record<string, any>, jobId: string): Promise<boolean> {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const slots = flowStartOrEndFrameSlots();
    const target = slots.find((element: HTMLElement) => /^(bắt đầu|start)$/i.test(visibleText(element).replace(/\s+/g, " ").trim()))
      || null;
    if (target) {
      flowTrace(jobId, "Selecting Flow start-frame slot before attaching keyframe...", 0.41);
      await clickFlowFrameSlot(target);
      await humanPause(700, 1150);
      return true;
    }
    await sleep(250);
  }
  flowTrace(jobId, "Flow start-frame slot was not visible; continuing with frame mode active.", 0.41);
  return false;

}

async function applyFlowAspectRatio(runtime: Record<string, any>, jobId: string, aspectRatio: string): Promise<string | undefined> {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  if (!aspectRatio || composerShowsAspectRatio(aspectRatio)) return undefined;
  const ratioPattern = new RegExp(`^${aspectRatio.replace(":", "\\s*:\\s*")}$`);
  const suffix = aspectRatioSuffix(runtime, aspectRatio);
  return (await clickInComposerSettingsBounded(jobId, `Frame ratio ${aspectRatio}`, [ratioPattern], 1, suffix ? [suffix] : [])).ok
    ? undefined : `Frame ratio ${aspectRatio}`;

}

async function applyFlowDuration(runtime: Record<string, any>, jobId: string, payload: JobPayload, durationSec: number): Promise<string | undefined> {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  if (durationSec <= 0 || composerShowsDuration(durationSec)) return undefined;
  const flowDuration = resolveProviderVideoDuration("google-flow", durationSec);
  const durationPattern = new RegExp(`^${flowDuration}\\s*s(ec|econds)?$`, "i");
  const durationResult = await clickInComposerSettingsBounded(jobId, `${flowDuration}s duration`, [durationPattern, new RegExp(`^${flowDuration}\\s*giây$`, "i")], 1);
  if (!durationResult.ok) return `Duration ${flowDuration}s`;
  if (!(await waitForFlowComposerVideoReady(runtime, payload, 3500))) return `Duration ${flowDuration}s not confirmed`;
  const timelineDurationSec = Number(payload.settings?.timelineDurationSec || durationSec);
  flowTrace(jobId, `Flow duration mapped from ${timelineDurationSec}s timeline shot to supported ${flowDuration}s render and confirmed.`, 0.18);
  return undefined;

}

async function applyFlowSettingsForJob(runtime: Record<string, any>, jobId: string, payload: JobPayload): Promise<string[]> {
  const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
  const missing: string[] = [];
  const aspectRatio = String(payload.settings?.aspectRatio || "");
  const durationSec = Number(payload.settings?.durationSec || 0);
  missing.push(...await selectFlowVideoSourceMode(runtime, jobId, payload));
  const missingAspectRatio = await applyFlowAspectRatio(runtime, jobId, aspectRatio);
  if (missingAspectRatio) missing.push(missingAspectRatio);
  if (composerShowsVideoMode()
    && (!aspectRatio || composerShowsAspectRatio(aspectRatio))
    && (!durationSec || composerShowsDuration(durationSec))) {
    flowTrace(jobId, "Flow required video mode, ratio, and duration are already visible; skipping redundant settings clicks.", 0.19);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await closeFlowSettingsPanelIfOpen(jobId);
    await humanPause(700, 1200);
    return missing;
  }
  const missingDuration = await applyFlowDuration(runtime, jobId, payload, durationSec);
  if (missingDuration) missing.push(missingDuration);
  await clickInComposerSettingsBounded(jobId, "Quantity x1", [/^x\s*1$/i, /^1x$/i, /^1$/], 1, ["1"], 1800);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await closeFlowSettingsPanelIfOpen(jobId);
  await humanPause(500, 850);
  return missing;

}
