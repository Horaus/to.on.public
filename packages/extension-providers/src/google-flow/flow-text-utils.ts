/** Shared, provider-local DOM text primitives. Keeping these outside the
 * content orchestrator makes selector/recovery code depend on one small
 * contract instead of reimplementing normalization in each flow. */
export function visibleText(element: Element): string {
  return ((element.textContent || "") + " " + (element.getAttribute("aria-label") || "") + " " + (element.getAttribute("title") || "")).trim();
}

export function isVisible(element: Element): boolean {
  const rect = (element as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function compactText(value: string, maxLength = 160): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function flowEditableText(element: Element): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value || "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("[data-slate-placeholder]").forEach((node) => node.remove());
  return clone.textContent || "";
}

export function normalizedFlowControlText(element: Element): string {
  return visibleText(element)
    .replace(/play_circle|image|crop_[a-z0-9_]+|arrow_drop_down/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
