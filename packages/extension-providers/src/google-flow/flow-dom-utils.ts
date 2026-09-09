export function findElement(selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) return element;
    } catch {}
  }
  return null;
}

export function findElements(selectors: string[]): Element[] {
  const results = new Set<Element>();
  for (const selector of selectors) {
    try {
      document.querySelectorAll(selector).forEach((element) => results.add(element));
    } catch {}
  }
  return Array.from(results);
}

export function humanDelay(minMs = 650, maxMs = 1250): number {
  return Math.round(minMs + Math.random() * Math.max(0, maxMs - minMs));
}

export function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
}

export function dispatchFlowInput(element: HTMLElement, inputType = "insertText", data = ""): void {
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

export function promptCompareKey(text: string): string {
  return text.replace(/\s+/g, "").trim();
}
