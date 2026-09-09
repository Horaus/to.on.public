type Visibility = (element: Element) => boolean;
type Text = (element: Element) => string;

export function flowGateFromText(text: string): string | null {
  if (/sign in|log in|choose an account|chọn tài khoản|đăng nhập/i.test(text)) return "Google Flow requires sign-in or account selection before automation can continue.";
  const creditBalance = text.match(/(?<!\d)(\d+)\s*(?:tín dụng\s*google\s*flow|tín dụng|tin dung|credits?)\b/i);
  if (creditBalance && Number(creditBalance[1]) > 0) return null;
  if (/(?<!\d)0(?!\d)\s*(tín dụng|tin dung|credits?)\b|hết\s*(credit|tín dụng)|không đủ\s*(credit|tín dụng)|insufficient credits?|not enough credits?|out of credits?|credit balance|buy credits?|purchase credits?|quota|usage limit|generation limit|đã đạt giới hạn|giới hạn sử dụng/i.test(text)) return "Google Flow reports that this account has no available credits/quota for video generation. Switch to an account with credits in the visible Flow tab, open a Flow project, then retry this shot.";
  if (/subscription|not available|region|waitlist|upgrade required|cần nâng cấp|không khả dụng/i.test(text)) return "Google Flow is showing an availability/subscription gate. Resolve it in the browser tab, then retry.";
  return null;
}
export function isManualGate(scope: ParentNode, isVisible: Visibility): string | null {
  const text = scope instanceof HTMLElement ? scope.innerText || scope.textContent || "" : document.body?.innerText || "";
  const gate = flowGateFromText(text);
  if (gate) return gate;
  const visibleDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="alert"], [data-state="open"]')).filter(isVisible).map((element) => element.innerText || element.textContent || "").join("\n");
  return visibleDialogs ? flowGateFromText(visibleDialogs) : null;
}
export function findFlowAccountTarget(isVisible: Visibility, visibleText: Text): Element | null {
  const controls = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], a, [tabindex], [aria-label]")).filter(isVisible).map((element) => ({ element, rect: element.getBoundingClientRect(), text: `${element.getAttribute("aria-label") || ""} ${visibleText(element)}`.trim() })).filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.right > window.innerWidth - 170 && rect.top < 130).sort((left, right) => right.rect.right - left.rect.right || left.rect.top - right.rect.top);
  return controls.find(({ text, rect }) => !/settings|cài đặt|help|trợ giúp|menu|more|thêm|\+/.test(text.toLowerCase()) && (/account|profile|hồ sơ|tài khoản|avatar/i.test(text) || (rect.width <= 72 && rect.height <= 72)))?.element || document.elementFromPoint(window.innerWidth - 56, 52);
}
export function flowGridCreateButton(isVisible: Visibility, visibleText: Text): HTMLElement | undefined {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [role='presentation'], [aria-label]")).filter((element) => flowGridCreateCandidate(element, isVisible, visibleText));
  return candidates.sort((left, right) => flowGridCreateScore(right) - flowGridCreateScore(left) || right.getBoundingClientRect().top - left.getBoundingClientRect().top)[0];
}
function flowGridCreateCandidate(element: HTMLElement, isVisible: Visibility, visibleText: Text): boolean {
  if (!isVisible(element)) return false;
  // The current Flow composer has its own `add_2 / Tạo` source-mode control.
  // It lives in the same form as the prompt textbox and must never be treated
  // as a project-grid entrypoint; clicking it repeatedly collapses the live
  // composer and eventually sends recovery back to the Flow root.
  const form = element.closest("form");
  if (form?.querySelector('[role="textbox"], [contenteditable="true"], textarea')) return false;
  const rect = element.getBoundingClientRect();
  const text = visibleText(element);
  return rect.width >= 28 && rect.height >= 28 && rect.top > window.innerHeight * 0.55 && rect.left > window.innerWidth * 0.2 && rect.left < window.innerWidth * 0.65 && /add_2|add\b|thêm thành phần|add component|tạo|create/i.test(text) && !/thêm nội dung nghe nhìn|add media|upload|tải nội dung nghe nhìn|drive_folder_upload|delete|trash|settings|help|tất cả nội dung|xem hình ảnh|xem video/i.test(text);
}
function flowGridCreateScore(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return (rect.top < window.innerHeight * 0.4 ? 20 : 0) + (rect.left > window.innerWidth * 0.45 ? 10 : 0);
}
export function createFlowWorkspaceGates(deps: { isVisible: Visibility; visibleText: Text }) {
  return {
    flowGateFromText,
    isManualGate: (scope: ParentNode = document.body) => isManualGate(scope, deps.isVisible),
    findFlowAccountTarget: () => findFlowAccountTarget(deps.isVisible, deps.visibleText),
    flowGridCreateButton: () => flowGridCreateButton(deps.isVisible, deps.visibleText)
  };
}
