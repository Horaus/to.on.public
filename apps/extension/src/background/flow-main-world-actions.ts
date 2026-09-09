export async function flowActionMainWorld(requestedAction: string, requestedValue: string): Promise<boolean> {
  const visible = (element: Element): element is HTMLElement => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return element instanceof HTMLElement && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const text = (element: Element) => (element.textContent || "").replace(/\s+/g, " ").trim();
  const visibleElements = (selector: string) => Array.from(document.querySelectorAll(selector)).filter(visible);
  const identity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (requestedAction === "clear-prompt" || requestedAction === "set-prompt") {
    const editor = visibleElements(".ProseMirror[contenteditable='true'], [contenteditable='true'][role='textbox']")[0] as HTMLElement | undefined;
    const value = requestedValue.trim();
    if (!editor || (requestedAction === "set-prompt" && !value)) return false;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand("delete", false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const remaining = editor.cloneNode(true) as HTMLElement;
    remaining.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
    if ((remaining.innerText || remaining.textContent || "").trim()) {
      editor.focus();
      document.execCommand("selectAll", false);
      document.execCommand("delete", false);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    selection?.removeAllRanges();
    if (requestedAction === "clear-prompt") {
      // ProseMirror may render its placeholder/model update on the next
      // microtask. The caller deliberately waits before inserting; returning
      // false here would incorrectly fall into the isolated-world append path.
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    editor.focus();
    const end = document.createRange();
    end.selectNodeContents(editor);
    end.collapse(false);
    selection?.addRange(end);
    document.execCommand("insertText", false, value);
    selection?.removeAllRanges();
    const insertedProbe = editor.cloneNode(true) as HTMLElement;
    insertedProbe.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
    const normalizedEditorText = (insertedProbe.innerText || insertedProbe.textContent || "").replace(/\s+/g, " ").trim();
    const normalizedValue = value.replace(/\s+/g, " ").trim();
    return normalizedEditorText.includes(normalizedValue);
  }
  if (requestedAction === "close-settings-menu") {
    const trigger = visibleElements("button[aria-haspopup='menu'][aria-expanded='true']")
      .find((element) => /video|hình ảnh|image|nano|veo|\d+\s*s/i.test(text(element))) as HTMLButtonElement | undefined;
    if (!trigger) return false;
    trigger.click();
    return trigger.getAttribute("aria-expanded") !== "true"
      && !document.querySelector("[role='menu'][data-state='open']");
  }
  const targetSpec: Record<string, { selector: string; pattern: RegExp }> = {
    "open-component-picker": { selector: "button[aria-haspopup='dialog']", pattern: /add_2|\+|^add$/i },
    // Flow's Vietnamese frame slots are div[type=button], not <button>.
    // Keep this action separate from the component picker so a frame-mode
    // job cannot accidentally open the project component menu.
    "open-start-frame-picker": { selector: "[type='button'][aria-haspopup='dialog'], button.empty-chip, [role='button'].empty-chip", pattern: /^(?:bắt đầu|start)$/i },
    "submit": { selector: "button[type='submit'].generate-icon-button, button[aria-label='Bắt đầu tạo'], button[aria-label='Generate']", pattern: /arrow_forward|bắt đầu tạo|generate|create/i },
    "select-component-menu": { selector: "button, [role='button'], [role='menuitem'], [role='option']", pattern: /thêm thành phần|add component|component|ingredient/i },
    "add-to-prompt": { selector: "button, [role='button'], [role='option']", pattern: /^(?:thêm vào câu lệnh|add to prompt|use in prompt)$/i },
    "close-settings-menu": { selector: "button[aria-haspopup='menu'][aria-expanded='true']", pattern: /video|hình ảnh|image|nano|veo|\d+\s*s/i }
  };
  const spec = targetSpec[requestedAction];
  const requestedIdentity = identity(requestedValue);
  const referenceTarget = requestedAction === "select-reference"
    ? visibleElements("[role='dialog'] [role='option'], [role='dialog'] [data-tile-id], [role='dialog'] button, [role='dialog'] [role='button']")
      .map((element) => ({ element, identity: identity([
        text(element), element.getAttribute("aria-label") || "", element.getAttribute("data-filename") || "",
        element.getAttribute("data-name") || "", element.querySelector("img[alt]")?.getAttribute("alt") || ""
      ].join(" ")) }))
      .find((candidate) => requestedIdentity.length >= 6 && candidate.identity.includes(requestedIdentity))?.element || null
    : null;
  const target = referenceTarget || (spec ? visibleElements(spec.selector).find((element) => spec.pattern.test(text(element))) : null);
  if (!target) return false;
  target.click();
  return true;
}
