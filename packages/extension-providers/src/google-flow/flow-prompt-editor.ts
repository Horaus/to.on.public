type StagePromptResult = { ok: boolean; method: "native" | "dom" | "bridge" | "none"; tier?: string; error?: string };
type BridgeResult = { ok: boolean; tier?: string; method?: string; error?: string };
type PromptEditorDeps = {
  activeFlowPromptEditor: () => HTMLElement | null;
  flowEditableText: (element: Element) => string;
  promptCompareKey: (text: string) => string;
  compactText: (text: string, maxLength?: number) => string;
  simulateClick: (element: Element) => void;
  elementCenter: (element: Element) => { clientX: number; clientY: number };
  humanPause: (minMs?: number, maxMs?: number) => Promise<void>;
  setNativeInputValue: (element: HTMLInputElement | HTMLTextAreaElement, value: string) => void;
  dispatchFlowInput: (element: HTMLElement, inputType?: string, data?: string) => void;
  runFlowMainWorldAction?: (action: "set-prompt", value?: string) => Promise<boolean>;
  runTobyFlowTextInsert?: (text: string) => Promise<boolean>;
  bridgeCall: (action: "clear" | "insert", payload?: Record<string, unknown>, timeoutMs?: number) => Promise<BridgeResult>;
  sleep: (ms: number) => Promise<void>;
};
type PromptEditorState = { lastNativeTextInsertError: string };

function resolveProseMirrorEditor(deps: PromptEditorDeps): HTMLElement | null {
  const proseMirror = Array.from(document.querySelectorAll<HTMLElement>('.ProseMirror'))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return element.isConnected && rect.width >= 300 && rect.height >= 70 && rect.bottom > window.innerHeight * 0.45;
    })
    .sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0];
  return proseMirror || deps.activeFlowPromptEditor();
}

function promptTextMatches(text: string, deps: PromptEditorDeps): boolean {
  const editor = resolveProseMirrorEditor(deps) || deps.activeFlowPromptEditor();
  if (!editor) return false;
  const clone = editor.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
  const actual = deps.promptCompareKey(clone.textContent || deps.flowEditableText(editor));
  const expected = deps.promptCompareKey(text);
  return Boolean(expected && actual === expected);
}

function promptMismatchDetail(text: string, deps: PromptEditorDeps): string {
  const editor = resolveProseMirrorEditor(deps);
  if (!editor) return "editor=missing";
  const clone = editor.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
  const actual = deps.promptCompareKey(clone.textContent || deps.flowEditableText(editor));
  const expected = deps.promptCompareKey(text);
  const rect = editor.getBoundingClientRect();
  return `editor=${editor.className} rect=${Math.round(rect.width)}x${Math.round(rect.height)} actual=${actual.length} expected=${expected.length}`;
}

async function clearFlowPromptEditor(editor: HTMLElement, deps: PromptEditorDeps): Promise<void> {
  if (editor.getAttribute("data-slate-editor") === "true") {
    // Slate owns the DOM tree. Clearing it with execCommand/textContent can
    // leave detached leaves that Flow cannot map back to its model.
    const result = await deps.bridgeCall("clear", undefined, 4000);
    if (result.ok) return;
  }
  deps.simulateClick(editor);
  await deps.humanPause(200, 400);
  clearEditorValue(editor, deps);
  await deps.humanPause(250, 500);
}

function clearEditorValue(editor: HTMLElement, deps: PromptEditorDeps): void {
  if (editor.getAttribute("data-slate-editor") === "true") return;
  if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
    deps.setNativeInputValue(editor, "");
    deps.dispatchFlowInput(editor, "deleteContentBackward");
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.execCommand("delete", false);
  editor.textContent = "";
  deps.dispatchFlowInput(editor, "deleteContentBackward");
}

async function stagePromptTextViaDom(text: string, clearFirst: boolean, deps: PromptEditorDeps): Promise<boolean> {
  let editor = resolveProseMirrorEditor(deps);
  if (!editor) return false;
  const isProseMirror = editor.classList.contains("ProseMirror");
  if (editor.getAttribute("data-slate-editor") === "true") return false;
  editor.focus();
  await deps.humanPause(350, 650);
  if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
    if (clearFirst) deps.setNativeInputValue(editor, "");
    deps.setNativeInputValue(editor, text);
    deps.dispatchFlowInput(editor, "insertText", text);
  } else {
    if (clearFirst) {
      if (isProseMirror) {
        // Match TobyFlow's verified ProseMirror path: use the browser editing
        // command with a real selection, without replacing the DOM tree or
        // dispatching synthetic React events that can desync the model.
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand("delete", false);
        selection?.removeAllRanges();
        await deps.sleep(100);
        editor = resolveProseMirrorEditor(deps) || editor;
        if (deps.flowEditableText(editor).trim()) {
          editor.focus();
          document.execCommand("selectAll", false);
          document.execCommand("delete", false);
          await deps.sleep(100);
        }
        // Flow may replace the ProseMirror host after the model applies the
        // deletion. TobyFlow re-resolves the editor before inserting; doing
        // the same avoids writing through a detached host.
        editor = resolveProseMirrorEditor(deps) || editor;
      } else {
        clearEditorValue(editor, deps);
      }
    }
    if (isProseMirror) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("insertText", false, text);
      selection?.removeAllRanges();
      await deps.sleep(150);
      if (promptTextMatches(text, deps)) {
        // TobyFlow's verified ProseMirror driver stops after execCommand.
        // Dispatching an additional synthetic input event can make Flow
        // reconcile the host from stale React state and discard the text.
        return true;
      }
      // A second lookup is cheap and covers Flow replacing the host while
      // applying the ProseMirror transaction.
      await deps.sleep(100);
      return promptTextMatches(text, deps);
    }
    document.execCommand("insertText", false, text);
    deps.dispatchFlowInput(editor, "insertText", text);
  }
  await deps.humanPause(650, 1100);
  return promptTextMatches(text, deps);
}

async function stagePromptTextViaNative(text: string, deps: PromptEditorDeps, state: PromptEditorState): Promise<boolean> {
  state.lastNativeTextInsertError = "";
  const editor = deps.activeFlowPromptEditor();
  if (!editor) return false;
  editor.scrollIntoView({ block: "center", inline: "center" });
  editor.focus({ preventScroll: true });
  deps.simulateClick(editor);
  await deps.sleep(180);
  const center = deps.elementCenter(editor);
  try {
    const response = await chrome.runtime.sendMessage({
      source: "google-flow-adapter", type: "NATIVE_INSERT_TEXT", x: center.clientX, y: center.clientY,
      // DOM focus is not sufficient for CDP Input.insertText: Flow can keep a
      // Slate editor focused in page JS while the browser's native target has
      // moved to a settings/picker control. Always perform one bounded native
      // focus click before inserting so the event reaches the visible editor.
      text, focusOnly: false
    });
    if (!response?.ok) {
      state.lastNativeTextInsertError = String(response?.error || "Native insert request was rejected.");
      return false;
    }
  } catch (error) {
    state.lastNativeTextInsertError = error instanceof Error ? error.message : String(error);
    return false;
  }
  await deps.humanPause(900, 1400);
  return promptTextMatches(text, deps);
}

function bridgeResultLabel(result: BridgeResult): string {
  return result.ok ? result.tier || result.method || "ok" : result.error || "failed";
}

async function stagePromptTextViaBridge(text: string, clearFirst: boolean, deps: PromptEditorDeps): Promise<StagePromptResult> {
  const clearResult = clearFirst
    ? await deps.bridgeCall("clear")
    : { ok: true, tier: "skipped-after-attachments", method: "skipped-after-attachments" };
  if (!clearFirst) await deps.humanPause(450, 850);
  const insertResult = await deps.bridgeCall("insert", { text }, 4000);
  if (clearResult.ok && insertResult.ok) return { ok: true, method: "bridge", tier: insertResult.tier || insertResult.method };
  return { ok: false, method: "none", error: `bridge clear=${bridgeResultLabel(clearResult)}, insert=${bridgeResultLabel(insertResult)}` };
}

function slateInsertionFailure(state: PromptEditorState): StagePromptResult {
  const detail = state.lastNativeTextInsertError ? ` (${state.lastNativeTextInsertError})` : "";
  return { ok: false, method: "none", error: `Native text insertion did not update the visible Slate editor${detail}; unsafe DOM and React-internal fallbacks were skipped.` };
}

async function stagePromptText(text: string, options: { clearFirst?: boolean }, deps: PromptEditorDeps, state: PromptEditorState): Promise<StagePromptResult> {
  const clearFirst = options.clearFirst ?? true;
  const initialEditor = deps.activeFlowPromptEditor();
  if (initialEditor?.classList.contains("ProseMirror")) {
    // A content-world driver (for example TobyFlow) may already have staged
    // the exact prompt while Flow was opening its composer. Never clear an
    // already-correct ProseMirror document: doing so creates a needless
    // rerender window in which Flow can replace the live host.
    if (promptTextMatches(text, deps)) return { ok: true, method: "dom", tier: "existing-prosemirror-text" };
    // Flow only enables generation after a trusted browser text transaction
    // reaches its native editing model. This is the same Input.insertText
    // path that succeeded in the live Flow/Toby comparison; try it before
    // content-world execCommand fallbacks.
    if (clearFirst && await stagePromptTextViaNative(text, deps, state)) {
      return { ok: true, method: "native", tier: "cdp-insert-text-prosemirror" };
    }
    if (deps.runTobyFlowTextInsert && await deps.runTobyFlowTextInsert(text)) {
      await deps.sleep(250);
      if (promptTextMatches(text, deps)) return { ok: true, method: "dom", tier: "tobyflow-execution-context" };
    }
    // TobyFlow's verified V2 driver runs this execCommand path from the
    // content-world editor driver. Keep Flow's own ProseMirror model in the
    // same world; main-world scripting is reserved for picker/submit actions.
    if (await stagePromptTextViaDom(text, clearFirst, deps)) return { ok: true, method: "dom", tier: "tobyflow-prosemirror" };
    // Keep a bounded page-world fallback for Flow builds whose ProseMirror
    // transaction is not exposed to the extension isolated world.
    if (deps.runFlowMainWorldAction && await deps.runFlowMainWorldAction("set-prompt", text)) {
      await deps.sleep(250);
      return { ok: true, method: "dom", tier: "main-world-prosemirror" };
    }
    return { ok: false, method: "none", error: `TobyFlow ProseMirror insertion did not update the visible editor (${promptMismatchDetail(text, deps)}).` };
  }
  if (clearFirst && await stagePromptTextViaNative(text, deps, state)) return { ok: true, method: "native", tier: "cdp-insert-text" };
  const editor = deps.activeFlowPromptEditor();
  if (editor?.getAttribute("data-slate-editor") === "true") {
    // Native CDP input can miss a Slate editor when Flow has moved focus to a
    // virtualized composer surface. Give the main-world Slate bridge one
    // bounded attempt before surfacing manual action; never fall through to
    // unverified DOM mutation for a Slate-controlled field.
    const bridged = await stagePromptTextViaBridge(text, clearFirst, deps);
    if (bridged.ok && promptTextMatches(text, deps)) return bridged;
    return slateInsertionFailure(state);
  }
  if (await stagePromptTextViaDom(text, clearFirst, deps)) return { ok: true, method: "dom", tier: "visible-editor" };
  return stagePromptTextViaBridge(text, clearFirst, deps);
}

async function refreshPromptEditorState(deps: PromptEditorDeps): Promise<boolean> {
  const editor = deps.activeFlowPromptEditor();
  if (!editor) return false;
  deps.simulateClick(editor);
  await deps.humanPause(250, 500);
  deps.dispatchFlowInput(editor, "insertText", deps.flowEditableText(editor));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
  await deps.humanPause(600, 1000);
  return true;
}

async function waitForFlowPromptEditor(timeoutMs: number, deps: PromptEditorDeps): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const editor = deps.activeFlowPromptEditor();
    if (editor) return editor;
    await deps.sleep(250);
  }
  return null;
}

export function createFlowPromptEditor(deps: PromptEditorDeps) {
  const state: PromptEditorState = { lastNativeTextInsertError: "" };
  return {
    promptTextMatches: (text: string) => promptTextMatches(text, deps),
    clearFlowPromptEditor: (editor: HTMLElement) => clearFlowPromptEditor(editor, deps),
    stagePromptTextViaDom: (text: string, clearFirst: boolean) => stagePromptTextViaDom(text, clearFirst, deps),
    stagePromptTextViaNative: (text: string) => stagePromptTextViaNative(text, deps, state),
    stagePromptText: (text: string, options: { clearFirst?: boolean } = {}) => stagePromptText(text, options, deps, state),
    refreshPromptEditorState: () => refreshPromptEditorState(deps),
    waitForFlowPromptEditor: (timeoutMs = 15000) => waitForFlowPromptEditor(timeoutMs, deps),
  };
}
