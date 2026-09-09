export type FlowNativeInputDeps = Record<string, any>;
type JobPayload = { jobId: string; [key: string]: any };
let lastNativeMouseClickDiagnostic = "";

let activeDeps: Record<string, any>;

async function requestTobyFlowTextInsert(text: string): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ source: "google-flow-adapter", type: "TOBY_FLOW_INSERT_TEXT", text });
    return response?.ok === true && response?.value === true;
  } catch {
    return false;
  }
}

async function requestTobyFlowSubmit(): Promise<boolean> {
  const requestId = `studio_toby_submit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => { if (settled) return; settled = true; window.removeEventListener("message", onMessage); resolve(value); };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "flow-auto-slate-result" || event.data.requestId !== requestId) return;
      finish(event.data.success === true);
    };
    window.addEventListener("message", onMessage);
    // TobyFlow's installed bridge exposes the provider action as clickSubmit.
    // Keep the request scoped to this Flow page and wait for its explicit reply.
    window.postMessage({ source: "flow-auto-slate", action: "clickSubmit", requestId, iconSelector: "" }, window.location.origin);
    window.setTimeout(() => finish(false), 5000);
  });
}

async function waitForFileInput(jobId?: string, timeoutMs = 8000, root: ParentNode = document): Promise<HTMLInputElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const pageError = activeDeps.flowPageErrorText();
    if (pageError) {
      activeDeps.flowTrace(jobId || "unknown", "Google Flow crashed while searching for the upload input; reloading the project tab before failing this attempt.", 0.31);
      try {
        location.reload();
      } catch {}
      if (jobId) activeDeps.reportResult(jobId, "failed_retryable", undefined, `${pageError} ${activeDeps.flowDebugSnapshot()}`);
      return null;
    }
    const scopedInputs = Array.from(root.querySelectorAll<HTMLInputElement>(activeDeps.SELECTORS.fileInput.join(",")));
    const inputs = (scopedInputs.length ? scopedInputs : Array.from(document.querySelectorAll<HTMLInputElement>(activeDeps.SELECTORS.fileInput.join(","))))
      .filter((input) => {
        const accept = input.getAttribute("accept") || "";
        return !accept || /image|\*/i.test(accept);
      });
    const input = inputs.find((candidate) => /image/i.test(candidate.getAttribute("accept") || "")) || inputs.at(-1) || null;
    if (input) return input;
    await activeDeps.sleep(500);
  }
  return null;
}

async function requestNativeMouseClick(
  clientX: number,
  clientY: number,
  expectedText = "",
  confirmIfUnchanged = false
): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({
      source: "google-flow-adapter",
      type: "NATIVE_MOUSE_CLICK",
      x: clientX,
      y: clientY,
      expectedText,
      confirmIfUnchanged
    });
    if (response?.ok) {
      const detail = response.value as { method?: string; directError?: string } | undefined;
      lastNativeMouseClickDiagnostic = `${detail?.method || "ok"}${detail?.directError ? `;directError=${detail.directError}` : ""}`;
      return true;
    }
    lastNativeMouseClickDiagnostic = `failed@${Math.round(clientX)},${Math.round(clientY)}:${String(response?.error || "unknown")}`;
    return false;
  } catch (error) {
    lastNativeMouseClickDiagnostic = `threw@${Math.round(clientX)},${Math.round(clientY)}:${error instanceof Error ? error.message : String(error)}`;
    return false;
  }
}

async function runFlowMainWorldAction(action: "open-component-picker" | "open-start-frame-picker" | "select-component-menu" | "select-reference" | "add-to-prompt" | "close-settings-menu" | "clear-prompt" | "set-prompt" | "submit", value = ""): Promise<boolean> {
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({
        source: "google-flow-adapter",
        type: "MAIN_WORLD_FLOW_ACTION",
        action,
        value
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Main-world Flow action timed out: ${action}`)), 5000))
    ]);
    lastNativeMouseClickDiagnostic = response?.ok
      ? `main-world-action-ok:${action}`
      : `main-world-action-failed:${action}:${String(response?.error || "unknown")}`;
    return Boolean(response?.ok);
  } catch (error) {
    lastNativeMouseClickDiagnostic = `main-world-action-threw:${action}:${error instanceof Error ? error.message : String(error)}`;
    return false;
  }
}

async function clickFlowFrameSlot(slot: HTMLElement): Promise<void> {
  slot.scrollIntoView({ block: "center", inline: "center" });
  const center = activeDeps.elementCenter(slot);
  const target = (document.elementFromPoint(center.clientX, center.clientY) as HTMLElement | null) || slot;
  if (await clickElementNative(target)) return;
  if (target !== slot) await clickElementNative(slot);
}

async function clickElementNative(element: HTMLElement): Promise<boolean> {
  element.scrollIntoView({ block: "center", inline: "center" });
  await activeDeps.sleep(80);
  const center = activeDeps.elementCenter(element);
  const target = (document.elementFromPoint(center.clientX, center.clientY) as HTMLElement | null) || element;
  if (await requestNativeMouseClick(center.clientX, center.clientY)) return true;
  activeDeps.simulateClick(target);
  lastNativeMouseClickDiagnostic = `${lastNativeMouseClickDiagnostic}; one DOM fallback dispatched`;
  return true;
}

async function clickElementCenterNative(element: HTMLElement): Promise<boolean> {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  if (await requestNativeMouseClick(clientX, clientY)) return true;
  activeDeps.simulateClick(element);
  lastNativeMouseClickDiagnostic = `${lastNativeMouseClickDiagnostic}; one DOM fallback dispatched`;
  return true;
}

async function clickElementStrictNative(element: HTMLElement, confirmIfUnchanged = false): Promise<boolean> {
  element.scrollIntoView({ block: "center", inline: "center" });
  await activeDeps.sleep(120);
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  return requestNativeMouseClick(clientX, clientY, activeDeps.visibleText(element), confirmIfUnchanged);
}

async function dispatchReferenceDrop(jobId: string, files: File[]): Promise<boolean> {
  const transfer = new DataTransfer();
  for (const file of files.slice(0, 1)) transfer.items.add(file);
  const targets = [
    ...activeDeps.flowStartOrEndFrameSlots(),
    activeDeps.getComposerRoot(),
    document.querySelector<HTMLElement>('[role="textbox"], [contenteditable="true"], textarea')
  ].filter((element): element is HTMLElement => Boolean(element && activeDeps.isVisible(element)));
  for (const target of targets.slice(0, 5)) {
    const beforePromptCount = activeDeps.promptAttachmentCount();
    const beforeFrameCount = activeDeps.directFrameAttachmentCount();
    activeDeps.flowTrace(jobId, `Trying direct Flow media drop on ${activeDeps.compactText(activeDeps.visibleText(target), 70) || target.tagName}.`, 0.38);
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + Math.max(8, Math.min(rect.width - 8, rect.width / 2));
    const clientY = rect.top + Math.max(8, Math.min(rect.height - 8, rect.height / 2));
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX,
        clientY
      }));
      await activeDeps.sleep(120);
    }
    if (await activeDeps.waitForPromptAttachmentIncrease(beforePromptCount, 2500)) return true;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 2500) {
      if (activeDeps.directFrameAttachmentCount() > beforeFrameCount || activeDeps.composerHasReferenceSource()) {
        activeDeps.flowTrace(jobId, "Flow accepted the keyframe directly into the video frame slot.", 0.48);
        return true;
      }
      await activeDeps.sleep(250);
    }
  }
  return false;
}

async function dragTileToComposer(jobId: string, tile: HTMLElement, beforeAttachmentCount: number, maxTargets = 8): Promise<boolean> {
  const source = activeDeps.tileDragSource(tile);
  const targets = activeDeps.flowComposerDropTargets();
  if (!targets.length) {
    activeDeps.flowTrace(jobId, "Flow composer did not expose a visible drop target for the keyframe tile.", 0.45);
    return false;
  }
  for (const target of targets.slice(0, maxTargets)) {
    const transfer = new DataTransfer();
    activeDeps.addTileDataToTransfer(transfer, tile);
    const from = activeDeps.elementCenter(source);
    const to = activeDeps.elementCenter(target);
    activeDeps.flowTrace(jobId, `Dragging keyframe tile into Flow composer target ${target.tagName}@${Math.round(to.clientX)},${Math.round(to.clientY)}.`, 0.46);
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer, ...from }));
    activeDeps.simulatePointerDrag(source, target);
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        ...to
      }));
      await activeDeps.sleep(180);
    }
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: transfer, ...to }));
    if (await activeDeps.waitForPromptAttachmentIncrease(beforeAttachmentCount, 3500) && await activeDeps.waitForComposerReference(jobId, 3500)) return true;
    await activeDeps.humanPause(350, 650);
  }
  return false;
}

type ReferenceUploadContext = {
  files: File[];
  jobId: string;
  pickerConfirmedAbsent: boolean;
  preflightPicker: HTMLElement | null;
  reference: NonNullable<JobPayload["references"]>[number];
  requireDirectFrameAttachment: boolean;
  skipReuse: boolean;
};


export function createFlowNativeInput(deps: FlowNativeInputDeps) {
  activeDeps = deps;
  return { waitForFileInput, requestNativeMouseClick, requestTobyFlowTextInsert, requestTobyFlowSubmit, runFlowMainWorldAction, clickFlowFrameSlot, clickElementNative, clickElementCenterNative, clickElementStrictNative, dispatchReferenceDrop, dragTileToComposer };
}
