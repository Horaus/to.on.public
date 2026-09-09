console.log("[Studio] Google Flow main-world bridge loaded");

type BridgeRequest = {
  source: "studio-flow-bridge";
  requestId: string;
  action: "clear" | "insert" | "submit" | "refreshSession";
  text?: string;
};

type BridgeResponse = {
  source: "studio-flow-bridge-result";
  requestId: string;
  ok: boolean;
  error?: string;
  tier?: string;
  method?: string;
};

type SlateLikeEditor = {
  children?: unknown[];
  selection?: unknown;
  insertText?: (text: string) => void;
  insertData?: (data: DataTransfer) => void;
  deleteFragment?: () => void;
  select?: (target: unknown) => void;
  apply?: (operation: Record<string, unknown>) => void;
  onChange?: () => void;
  withoutNormalizing?: (fn: () => void) => void;
};

// ---------------------------------------------------------------------------
//  FIND SLATE EDITOR
//  Port from TobyFlow: search via React Context dependencies and Hooks
//  (memoizedState linked list), NOT generic recursive object walk.
// ---------------------------------------------------------------------------

function isSlateEditor(value: unknown, requireInsertText = false): value is SlateLikeEditor {
  if (!value || typeof value !== "object") return false;
  const editor = value as SlateLikeEditor;
  return Array.isArray(editor.children) && typeof editor.apply === "function" && (!requireInsertText || typeof editor.insertText === "function");
}

function editorFromContext(firstContext: unknown): SlateLikeEditor | null {
  let context = firstContext as { memoizedValue?: unknown; next?: unknown } | null;
  while (context) {
    if (isSlateEditor(context.memoizedValue, true)) return context.memoizedValue;
    context = context.next as typeof context;
  }
  return null;
}

function editorFromHookState(firstState: unknown): SlateLikeEditor | null {
  let state = firstState as { memoizedState?: unknown; next?: unknown } | null;
  while (state) {
    if (isSlateEditor(state.memoizedState)) return state.memoizedState;
    const current = (state.memoizedState as { current?: unknown } | undefined)?.current;
    if (isSlateEditor(current)) return current;
    state = state.next as typeof state;
  }
  return null;
}

function findSlateEditor(): SlateLikeEditor | null {
  const editorNode = activeEditorDom();
  if (!editorNode) return null;
  const fiberKey = Object.keys(editorNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
  if (!fiberKey) return null;
  let fiber = (editorNode as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
  while (fiber) {
    const contextEditor = editorFromContext((fiber.dependencies as { firstContext?: unknown } | undefined)?.firstContext);
    if (contextEditor) return contextEditor;
    const stateEditor = editorFromHookState(fiber.memoizedState);
    if (stateEditor) return stateEditor;
    fiber = (fiber as { return?: typeof fiber }).return ?? null;
  }
  return null;
}

function focusEditorDom(): HTMLElement | null {
  const editorNode = activeEditorDom();
  editorNode?.focus();
  return editorNode;
}

function visible(element: Element): boolean {
  const rect = (element as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function elementText(element: Element | null): string {
  if (!element) return "";
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value || "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("[data-slate-placeholder]").forEach((node) => node.remove());
  return clone.textContent || "";
}

function isEditableElement(element: Element): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return true;
  if (!(element instanceof HTMLElement)) return false;
  return (
    element.getAttribute("contenteditable") === "true" ||
    element.getAttribute("data-slate-editor") === "true" ||
    element.getAttribute("role") === "textbox"
  );
}

function hasPromptHint(element: Element): boolean {
  const text = [
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("data-placeholder"),
    element.textContent
  ].filter(Boolean).join(" ");
  return /bạn muốn tạo gì|what do you want|prompt|describe|create|tạo gì/i.test(text);
}

function editableCandidates(): HTMLElement[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-slate-editor="true"], [contenteditable="true"], [role="textbox"], textarea, input[type="text"], input:not([type])'
    )
  );
  return elements.filter((element) => {
    if (!isEditableElement(element)) return false;
    if (!visible(element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 8) return false;
    return true;
  });
}

function activeEditorDom(): HTMLElement | null {
  const candidates = editableCandidates();
  if (candidates.length === 0) return null;
  const scored = candidates
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const text = elementText(element).trim();
      const composerLike = rect.bottom > window.innerHeight * 0.45 ? 40 : 0;
      const bottomBias = Math.min(40, rect.bottom / Math.max(1, window.innerHeight) * 40);
      const promptHint = hasPromptHint(element) ? 35 : 0;
      const wide = rect.width > 240 ? 15 : 0;
      const hasContent = text.length > 0 ? 8 : 0;
      const staleChatPenalty = /chatgpt|library|search|tìm kiếm/i.test(text) ? -60 : 0;
      return { element, score: composerLike + bottomBias + promptHint + wide + hasContent + staleChatPenalty };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.element || null;
}

function textSample(text: string): string {
  return (text.length > 30 ? text.substring(0, 30) : text).trim();
}

function verifyEditorDomText(text: string, editorNode = activeEditorDom()): boolean {
  const sample = textSample(text);
  if (!sample || !editorNode) return false;
  if (editorHasPlaceholder(editorNode)) return false;
  const domText = elementText(editorNode).replace(/\s+/g, " ").trim();
  return domText.includes(sample);
}

function dispatchEditableInput(element: HTMLElement, inputType = "insertText", data = ""): void {
  try {
    element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, composed: true, inputType, data }));
  } catch {}
  try {
    element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType, data }));
  } catch {
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
}

function visibleEditorText(editorNode = activeEditorDom()): string {
  return editorNode ? elementText(editorNode).replace(/\s+/g, " ").trim() : "";
}

function editorHasPlaceholder(editorNode = activeEditorDom()): boolean {
  return !!editorNode?.querySelector("[data-slate-placeholder]");
}

// ---------------------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------------------

function getEndPoint(editor: SlateLikeEditor): { path: number[]; offset: number } {
  const path: number[] = [];
  let node: { children?: unknown[]; text?: string } = { children: editor.children as { children?: unknown[]; text?: string }[] };
  while (node.children && node.children.length > 0) {
    const idx = node.children.length - 1;
    path.push(idx);
    node = node.children[idx] as typeof node;
  }
  return { path, offset: (node.text || "").length };
}

function getAllText(node: { text?: string; children?: unknown[] }): string {
  if (node.text !== undefined) return node.text;
  if (node.children) return (node.children as typeof node[]).map(getAllText).join("");
  return "";
}

// ---------------------------------------------------------------------------
//  CLEAR EDITOR — 3-tier fallback (port from TobyFlow)
//  Tier 1: deleteFragment with selection
//  Tier 2: selectAllDelete with Slate #3605 cleanup
//  Tier 3: replaceChildren (schema-aware clone with new UUID id)
//  NO DOM FALLBACK — execCommand causes Slate/DOM desync → crash
// ---------------------------------------------------------------------------

function clearVisibleEditor(editorNode: HTMLElement | null): { ok: boolean; tier?: string; error?: string } {
  return { ok: false, error: editorNode ? "Flow prompt has no discoverable Slate editor model" : "Flow prompt editor not found" };
}

function finishSlateClear(editor: SlateLikeEditor, editorNode: HTMLElement | null, tier: string): { ok: boolean; tier?: string } | null {
  if (getAllText({ children: editor.children }).trim().length !== 0) return null;
  editor.onChange?.();
  return { ok: true, tier };
}

function clearSlateFragment(editor: SlateLikeEditor, editorNode: HTMLElement | null): { ok: boolean; tier?: string } | null {
  try {
    const endPt = getEndPoint(editor);
    if (endPt.offset > 0 || endPt.path.length > 2 || (endPt.path.length === 2 && endPt.path[0] > 0)) {
      (editor as { selection: unknown }).selection = { anchor: { path: [0, 0], offset: 0 }, focus: endPt };
      editor.deleteFragment?.();
    }
    editor.onChange?.();
    return finishSlateClear(editor, editorNode, "deleteFragment");
  } catch { return null; }
}

function clearSlateAllBlocks(editor: SlateLikeEditor, editorNode: HTMLElement | null): { ok: boolean; tier?: string } | null {
  try {
    const endPt = getEndPoint(editor);
    const startPt = { path: [0, 0], offset: 0 };
    (editor as { selection: unknown }).selection = { anchor: startPt, focus: endPt };
    editor.deleteFragment?.();
    // Cleanup leftover empty blocks (Slate issue #3605)
    if (editor.children && editor.children.length > 1 && editor.withoutNormalizing) {
      editor.withoutNormalizing(() => {
        for (let i = (editor.children?.length ?? 1) - 1; i >= 1; i--) {
          try {
            editor.apply?.({
              type: "remove_node",
              path: [i],
              node: JSON.parse(JSON.stringify((editor.children as unknown[])[i]))
            });
          } catch {}
        }
      });
    }
    editor.onChange?.();
    return finishSlateClear(editor, editorNode, "selectAllDelete");
  } catch { return null; }
}

function emptySlateClone(node: Record<string, unknown>): Record<string, unknown> {
      if (node.text !== undefined) return { text: "" };
      const clone: Record<string, unknown> = {};
      for (const k in node) {
        if (k === "children") continue;
        if (k === "id") {
          // Generate new UUID for stable React key (TobyFlow: without id → 2000ms lag)
          if (typeof crypto !== "undefined" && crypto.randomUUID) {
            clone.id = crypto.randomUUID();
          }
          continue;
        }
        clone[k] = node[k];
      }
      const children = node.children as Record<string, unknown>[] | undefined;
      clone.children = children?.[0] ? [emptySlateClone(children[0])] : [{ text: "" }];
      return clone;
}

function replaceSlateChildren(editor: SlateLikeEditor, editorNode: HTMLElement | null): { ok: boolean; tier?: string } | null {
  try {
    const firstChild = (editor.children as Record<string, unknown>[])[0];
    const blueprint = firstChild
      ? emptySlateClone(firstChild)
      : { type: "PARAGRAPH", children: [{ text: "" }] };

    (editor as { children: unknown[] }).children = [blueprint];
    (editor as { selection: unknown }).selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 }
    };
    editor.onChange?.();
    return finishSlateClear(editor, editorNode, "replaceChildren");
  } catch { return null; }
}

function clearEditor(): { ok: boolean; tier?: string; error?: string } {
  const editor = findSlateEditor();
  const editorNode = focusEditorDom();
  if (!editor) return clearVisibleEditor(editorNode);
  const ready = clearSlateFragment(editor, editorNode) || clearSlateAllBlocks(editor, editorNode) || replaceSlateChildren(editor, editorNode);
  if (ready) return ready;
  return { ok: false, error: `All clear tiers failed; model="${getAllText({ children: editor.children }).slice(0, 80)}"; dom="${visibleEditorText(editorNode).slice(0, 80)}"` };
}

// ---------------------------------------------------------------------------
//  INSERT TEXT — 3-tier fallback (port from TobyFlow)
//  Tier 1: insertText (high-level Slate API)
//  Tier 2: apply insert_text operation (low-level)
//  Tier 3: insertData via DataTransfer (paste handler)
//  Model verification after each tier.
//  NO DOM FALLBACK — execCommand causes Slate/DOM desync → crash
// ---------------------------------------------------------------------------

function insertDomFallback(text: string, editorNode = activeEditorDom()): { ok: boolean; tier?: string; error?: string } {
  if (!editorNode) return { ok: false, error: "Visible Flow prompt editor not found" };
  try {
    editorNode.focus();
    if (editorNode instanceof HTMLInputElement || editorNode instanceof HTMLTextAreaElement) {
      setNativeValue(editorNode, `${editorNode.value || ""}${text}`);
      dispatchEditableInput(editorNode, "insertText", text);
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorNode);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const inserted = document.execCommand("insertText", false, text);
      if (!inserted) return { ok: false, error: "Flow DOM editor rejected native text insertion" };
      dispatchEditableInput(editorNode, "insertText", text);
    }
    triggerBlurFocus(editorNode);
    return verifyEditorDomText(text, editorNode)
      ? { ok: true, tier: "domComposer" }
      : { ok: false, error: "DOM insert did not appear in the visible Flow prompt editor" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function finishSlateInsert(editor: SlateLikeEditor, editorNode: HTMLElement | null, text: string, tier: string): { ok: boolean; tier?: string } | null {
  const sample = textSample(text);
  if (!getAllText({ children: editor.children }).includes(sample)) return null;
  // Slate may paint the DOM on the next React turn. Never synthesize
  // paragraph/span nodes here: those detached nodes make Flow's Slate mapper
  // throw "Cannot resolve a Slate node from DOM node" when the picker opens.
  triggerBlurFocus(editorNode);
  return { ok: true, tier };
}

function insertThroughSlateText(editor: SlateLikeEditor, editorNode: HTMLElement | null, text: string) {
  try {
    if (!editor.selection) {
      const endPt = getEndPoint(editor);
      (editor as { selection: unknown }).selection = { anchor: endPt, focus: endPt };
    }
    editor.insertText?.(text);
    editor.onChange?.();
    return finishSlateInsert(editor, editorNode, text, "insertText");
  } catch { return null; }
}

function insertThroughSlateOperation(editor: SlateLikeEditor, editorNode: HTMLElement | null, text: string) {
  try {
    const pt = getEndPoint(editor);
    editor.apply?.({ type: "insert_text", path: pt.path, offset: pt.offset, text });
    editor.onChange?.();
    return finishSlateInsert(editor, editorNode, text, "applyOp");
  } catch { return null; }
}

function insertThroughSlateData(editor: SlateLikeEditor, editorNode: HTMLElement | null, text: string) {
  try {
    if (typeof editor.insertData !== "function") return null;
    const pt = getEndPoint(editor);
    (editor as { selection: unknown }).selection = { anchor: pt, focus: pt };
    const data = new DataTransfer();
    data.setData("text/plain", text);
    editor.insertData(data);
    editor.onChange?.();
    return finishSlateInsert(editor, editorNode, text, "insertData");
  } catch { return null; }
}

function insertText(text: string): { ok: boolean; tier?: string; error?: string } {
  const editor = findSlateEditor();
  const editorNode = focusEditorDom();
  if (!editor) return insertDomFallback(text, editorNode || undefined);
  const ready = insertThroughSlateText(editor, editorNode, text)
    || insertThroughSlateOperation(editor, editorNode, text)
    || insertThroughSlateData(editor, editorNode, text);
  if (ready) return ready;

  const fallback = insertDomFallback(text, editorNode || undefined);
  if (fallback.ok) return fallback;
  return { ok: false, error: `All insert tiers failed; ${fallback.error || "DOM fallback failed"}` };
}

function triggerBlurFocus(slateEl: HTMLElement | null): void {
  if (!slateEl) return;
  setTimeout(() => {
    try {
      slateEl.blur();
      slateEl.focus();
    } catch {}
  }, 0);
}

// ---------------------------------------------------------------------------
//  SUBMIT PROMPT — React internal submit (port from TobyFlow)
//  Method 1: reactPropsClick — __reactProps$.onClick with spoofed isTrusted
//  Method 2: fiberOnSubmit — walk fiber tree for onSubmit/handleSubmit
//  Method 3: DOM button.click + Enter key chain (last resort)
//
//  Google has tightened trusted event checks (2026):
//  button.click() and dispatched events may be blocked.
//  reactPropsClick bypasses this by calling the handler directly.
// ---------------------------------------------------------------------------

function findSubmitButton(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
    // Flow frequently exposes its transient submit state through ARIA rather
    // than the boolean `disabled` attribute. Calling React props on an
    // aria-disabled control can return ok=true without dispatching a request.
    .filter((btn) => visible(btn) && !btn.hasAttribute("disabled") && btn.getAttribute("aria-disabled") !== "true")
    .reverse();

  const submitBtn = buttons.find((btn) => {
    const label = `${btn.innerText || ""} ${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
    return /tạo|generate|create|submit|send|gửi/i.test(label);
  }) || buttons.find((btn) => {
    const rect = btn.getBoundingClientRect();
    return rect.bottom > window.innerHeight * 0.55 && rect.right > window.innerWidth * 0.55;
  });

  // Also find the icon-based submit button (arrow_forward)
  const iconSubmitBtn = !submitBtn ? buttons.find((btn) => {
    const icons = Array.from(btn.querySelectorAll("i, span"));
    for (const icon of icons) {
      if (icon.textContent?.trim() === "arrow_forward") return true;
    }
    return false;
  }) : null;

  return submitBtn || iconSubmitBtn || null;
}

function submitThroughReactProps(targetBtn: HTMLElement): { ok: boolean; method?: string } | null {
  try {
    const propsKey = Object.keys(targetBtn).find((k) => k.startsWith("__reactProps$"));
    if (propsKey) {
      const props = (targetBtn as unknown as Record<string, Record<string, unknown>>)[propsKey];
      if (typeof props.onClick === "function") {
        const rect = targetBtn.getBoundingClientRect();
        const fakeEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          persist: () => {},
          nativeEvent: { isTrusted: true },
          isTrusted: true,
          target: targetBtn,
          currentTarget: targetBtn,
          bubbles: true,
          cancelable: true,
          defaultPrevented: false,
          eventPhase: 3,
          timeStamp: Date.now(),
          type: "click",
          button: 0,
          buttons: 1,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        };
        (props.onClick as (e: unknown) => void)(fakeEvent);
        return { ok: true, method: "reactPropsClick" };
      }
    }
  } catch {}
  return null;
}

function submitThroughFiber(targetBtn: HTMLElement): { ok: boolean; method?: string } | null {
  try {
    const fiberKey = Object.keys(targetBtn).find((k) => k.startsWith("__reactFiber$"));
    if (fiberKey) {
      let fiber = (targetBtn as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
      let depth = 0;
      while (fiber && depth < 50) {
        const pendingProps = fiber.pendingProps as Record<string, unknown> | undefined;
        if (pendingProps && typeof pendingProps.onSubmit === "function") {
          (pendingProps.onSubmit as (e: unknown) => void)({
            preventDefault: () => {},
            stopPropagation: () => {}
          });
          return { ok: true, method: "fiberOnSubmit" };
        }
        const stateNode = fiber.stateNode as Record<string, unknown> | undefined;
        if (stateNode && typeof stateNode.handleSubmit === "function") {
          (stateNode.handleSubmit as () => void)();
          return { ok: true, method: "fiberHandleSubmit" };
        }
        fiber = (fiber as { return?: typeof fiber }).return ?? null;
        depth++;
      }
    }
  } catch {}
  return null;
}

function attemptDomSubmission(targetBtn: HTMLElement): void {
  // DOM fallback is diagnostic only because Flow can ignore untrusted events.
  // Do not report success from this branch. Flow can ignore untrusted DOM events,
  // so returning ok=true here makes the desktop app believe generation started.
  // Native click
  targetBtn.click();

  // simulateClick with full pointer/mouse event chain
  const rect = targetBtn.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
  targetBtn.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "mouse" }));
  targetBtn.dispatchEvent(new MouseEvent("mousedown", opts));
  targetBtn.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "mouse" }));
  targetBtn.dispatchEvent(new MouseEvent("mouseup", opts));
  targetBtn.dispatchEvent(new MouseEvent("click", opts));

  // Enter key on editor as final fallback
  const slateEl = activeEditorDom();
  if (slateEl) {
    setTimeout(() => {
      slateEl.focus();
      slateEl.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true, composed: true })
      );
      slateEl.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, composed: true })
      );
    }, 100);
  }

}

function submitPrompt(): { ok: boolean; method?: string; error?: string } {
  const targetBtn = findSubmitButton();
  if (!targetBtn) return { ok: false, error: "Submit button not found" };
  const reactResult = submitThroughReactProps(targetBtn);
  if (reactResult) return reactResult;
  const fiberResult = submitThroughFiber(targetBtn);
  if (fiberResult) return fiberResult;
  attemptDomSubmission(targetBtn);
  return { ok: false, method: "domFallback", error: "React submit handler was not found; DOM fallback was attempted but cannot be trusted." };
}

// ---------------------------------------------------------------------------
//  REFRESH SESSION — silent Next.js data re-fetch (port from TobyFlow)
//  Force Next.js re-fetch session data → re-auth Bearer token.
//  Solves expired session without full page reload.
// ---------------------------------------------------------------------------

function refreshSession(): { ok: boolean; error?: string } {
  try {
    const nextData = (window as unknown as { __NEXT_DATA__?: { buildId?: string; locale?: string } }).__NEXT_DATA__;
    if (!nextData?.buildId) return { ok: false, error: "__NEXT_DATA__ unavailable" };

    const buildId = nextData.buildId;
    const locale = nextData.locale || "en";
    const path = window.location.pathname;
    // Strip /fx/{locale} prefix from path for Next.js data URL
    const dataPath = path.replace(new RegExp(`^/fx/${locale}(/|$)`), "/") || "/";
    const url = `/fx/_next/data/${buildId}/${locale}${dataPath}.json`;

    // Fire-and-forget fetch to refresh session
    fetch(url, { credentials: "include", cache: "no-store" })
      .then(() => console.log("[Studio Bridge] Session refresh OK:", url))
      .catch((e) => console.warn("[Studio Bridge] Session refresh failed:", e?.message));

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
//  MESSAGE HANDLER
// ---------------------------------------------------------------------------

window.addEventListener("message", (event: MessageEvent<BridgeRequest>) => {
  if (event.source !== window || event.data?.source !== "studio-flow-bridge") return;
  const { requestId, action, text = "" } = event.data;

  let result: { ok: boolean; error?: string; tier?: string; method?: string };

  try {
    switch (action) {
      case "clear":
        result = clearEditor();
        break;
      case "insert":
        result = insertText(text);
        break;
      case "submit": {
        // Pre-submit validation: verify editor has content
        const editor = findSlateEditor();
        const slateEl = activeEditorDom();
        const domText = slateEl ? elementText(slateEl).trim() : "";
        const hasPlaceholder = slateEl ? !!slateEl.querySelector("[data-slate-placeholder]") : true;
        if (editor) {
          const editorText = getAllText({ children: editor.children }).trim();
          const hasContent = editorText.length > 0 && domText.length > 0 && !hasPlaceholder;
          if (!hasContent) {
            result = { ok: false, error: "Editor empty, cannot submit" };
            break;
          }
        } else if (!domText || hasPlaceholder) {
          result = { ok: false, error: "Visible Flow prompt editor empty, cannot submit" };
          break;
        }
        result = submitPrompt();
        break;
      }
      case "refreshSession":
        result = refreshSession();
        break;
      default:
        result = { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (caught) {
    result = { ok: false, error: caught instanceof Error ? caught.message : String(caught) };
  }

  const response: BridgeResponse = {
    source: "studio-flow-bridge-result",
    requestId,
    ok: result.ok,
    error: result.error,
    tier: result.tier,
    method: result.method
  };
  window.postMessage(response, "*");
});

export {};
