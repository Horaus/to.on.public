import type { TextReasoningTier } from "./text-wait-policy";
type Deps = { normalizedUiLabel: (value: string) => string; simulateUiClick: (element: Element) => void; visibleElement: (element: Element) => boolean; sleep: (ms: number) => Promise<void>; reportStatus: (jobId: string, status: string, message: string) => void };
const REASONING_LABELS: Record<TextReasoningTier, string[]> = { instant: ["Instant", "Tức thì"], medium: ["Medium", "Vừa"], high: ["High", "Cao"] };
const targetValue = (tier: TextReasoningTier) => tier === "instant" ? 0 : tier === "medium" ? 1 : 2;
async function setSlider(slider: HTMLElement, target: number, sleep: Deps["sleep"]): Promise<boolean> {
  let current = Number(slider.getAttribute("aria-valuenow"));
  slider.focus();
  while (Number.isFinite(current) && current !== target) {
    const key = current > target ? "ArrowLeft" : "ArrowRight";
    slider.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
    slider.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true, cancelable: true }));
    await sleep(120);
    const next = Number(slider.getAttribute("aria-valuenow"));
    if (!Number.isFinite(next) || next === current) break;
    current = next;
  }
  return Number(slider.getAttribute("aria-valuenow")) === target;
}
function menuItem(tier: TextReasoningTier, normalizedUiLabel: Deps["normalizedUiLabel"]): HTMLElement | undefined {
  const labels = REASONING_LABELS[tier].map(normalizedUiLabel);
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find((item) => labels.includes(normalizedUiLabel(item.querySelector<HTMLElement>("span.truncate")?.innerText || item.innerText || "")));
}
export async function selectReasoningTier(jobId: string, tier: TextReasoningTier, deps: Deps): Promise<boolean> {
  const { normalizedUiLabel, simulateUiClick, visibleElement, sleep, reportStatus } = deps;
  const knownLabels = Object.values(REASONING_LABELS).flat().map(normalizedUiLabel);
  const control = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')).find((button) => knownLabels.includes(normalizedUiLabel(button.innerText || "")));
  if (!control) { reportStatus(jobId, "opening_provider", `ChatGPT reasoning control was not available; keeping the provider setting and using ${tier} timeout policy.`); return false; }
  const labels = REASONING_LABELS[tier].map(normalizedUiLabel);
  if (labels.includes(normalizedUiLabel(control.innerText || ""))) return true;
  simulateUiClick(control);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const slider = Array.from(document.querySelectorAll<HTMLElement>('[role="slider"][aria-valuenow]')).find(visibleElement);
    if (slider) {
      const selected = await setSlider(slider, targetValue(tier), sleep);
      reportStatus(jobId, "opening_provider", selected ? `ChatGPT reasoning slider set to ${tier} for this job.` : `ChatGPT reasoning slider did not reach ${tier}; using the provider's visible setting.`);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      return selected;
    }
    const target = menuItem(tier, normalizedUiLabel);
    if (target) {
      simulateUiClick(target); await sleep(350);
      const selected = target.getAttribute("aria-checked") === "true" || labels.includes(normalizedUiLabel(control.innerText || ""));
      reportStatus(jobId, "opening_provider", selected ? `ChatGPT reasoning set to ${tier} for this job.` : `ChatGPT reasoning selection for ${tier} was not confirmed; continuing with the matching timeout policy.`);
      return selected;
    }
    await sleep(150);
  }
  reportStatus(jobId, "opening_provider", `ChatGPT reasoning menu did not expose ${tier}; continuing with the matching timeout policy.`);
  return false;
}
