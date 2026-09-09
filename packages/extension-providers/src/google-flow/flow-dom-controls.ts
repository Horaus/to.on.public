type Visibility = (element: Element) => boolean;
type Pause = (minMs?: number, maxMs?: number) => Promise<void>;
type Text = (element: Element) => string;

export function createFlowDomControls(deps: { isVisible: Visibility; humanPause: Pause; visibleText: Text }) {
  const pointerControls = createPointerControls();
  const mediaControls = createMediaControls(deps);
  return {
    ...pointerControls,
    ...mediaControls,
    ...createOverlayControls({ ...deps, mediaPickerDialogs: mediaControls.mediaPickerDialogs, simulateClick: pointerControls.simulateClick })
  };
}

function createPointerControls() {
  function simulateClick(element: Element): void {
    const target = element as HTMLElement;
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true, clientX, clientY, pointerType: "mouse" }));
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, clientX, clientY }));
    target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX, clientY, pointerType: "mouse" }));
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX, clientY }));
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX, clientY, pointerType: "mouse" }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX, clientY }));
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX, clientY, pointerType: "mouse" }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX, clientY }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX, clientY }));
  }
  function elementCenter(element: Element): { clientX: number; clientY: number } {
    const rect = (element as HTMLElement).getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }
  function simulatePointerDrag(source: Element, target: Element): void {
    const sourceElement = source as HTMLElement;
    const targetElement = target as HTMLElement;
    sourceElement.scrollIntoView({ block: "center", inline: "center" });
    targetElement.scrollIntoView({ block: "center", inline: "center" });
    const from = elementCenter(sourceElement);
    const to = elementCenter(targetElement);
    sourceElement.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true, ...from, pointerType: "mouse" }));
    sourceElement.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, ...from }));
    sourceElement.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, ...from, pointerType: "mouse" }));
    sourceElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1, ...from }));
    for (let step = 1; step <= 8; step++) {
      const clientX = from.clientX + ((to.clientX - from.clientX) * step) / 8;
      const clientY = from.clientY + ((to.clientY - from.clientY) * step) / 8;
      const hoverTarget = document.elementFromPoint(clientX, clientY) || targetElement;
      hoverTarget.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, buttons: 1, clientX, clientY, pointerType: "mouse" }));
      hoverTarget.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 1, clientX, clientY }));
    }
    targetElement.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, buttons: 0, ...to, pointerType: "mouse" }));
    targetElement.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0, ...to }));
  }

  return { simulateClick, elementCenter, simulatePointerDrag };
}

function createMediaControls({ isVisible, humanPause }: { isVisible: Visibility; humanPause: Pause }) {
  return {
    mediaPickerDialogs: () => mediaPickerDialogs(isVisible),
    mediaUploadMenus: () => mediaUploadMenus(isVisible),
    closeMediaPickerIfOpen: () => closeMediaPickerIfOpen({ isVisible, humanPause })
  };
}

function mediaPickerDialogs(isVisible: Visibility): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="listbox"], .cdk-overlay-pane, [data-radix-popper-content-wrapper], [data-state="open"]')).filter((element) => isMediaPickerDialog(element, isVisible));
}
function isMediaPickerDialog(element: HTMLElement, isVisible: Visibility): boolean {
  const text = element.innerText || "";
  const rect = element.getBoundingClientRect();
  const looksLikeWholePage = rect.width > window.innerWidth * 0.9 && rect.height > window.innerHeight * 0.75;
  const hasPickerText = /chọn một hình ảnh khung|thêm vào câu lệnh|add to prompt|tìm kiếm thành phần|search assets|tệp tải lên|uploaded files|gần đây|recent/i.test(text);
  const isPromptClearAction = /arrow_forward\s*tạo|create|generate/i.test(text) && /x(?:oá|óa|oa) câu lệnh|clear prompt/i.test(text);
  return isVisible(element) && !looksLikeWholePage && rect.width > 240 && rect.height > 120 && hasPickerText && !isPromptClearAction;
}
function mediaUploadMenus(isVisible: Visibility): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"], [data-state="open"]')).filter((element) => {
    const rect = element.getBoundingClientRect();
    return isVisible(element) && rect.width >= 120 && rect.height >= 80 && /tải nội dung nghe nhìn lên|upload media|upload/i.test(element.innerText || "");
  });
}
async function closeMediaPickerIfOpen({ isVisible, humanPause }: { isVisible: Visibility; humanPause: Pause }): Promise<void> {
  if (!mediaPickerDialogs(isVisible).length && !mediaUploadMenus(isVisible).length) return;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await humanPause(450, 850);
}

function createOverlayControls({ isVisible, humanPause, visibleText, mediaPickerDialogs, simulateClick }: { isVisible: Visibility; humanPause: Pause; visibleText: Text; mediaPickerDialogs: () => HTMLElement[]; simulateClick: (element: Element) => void }) {
  function findFloatingFlowCloseButtons(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']")).filter((button) => {
      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.right > window.innerWidth * 0.65 && rect.top < 90 && /close|đóng/i.test(`${button.getAttribute("aria-label") || ""} ${visibleText(button)}`.trim());
    });
  }
  function visibleTransientOverlays(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], [data-state="open"]')).filter((element) => {
      if (!isVisible(element) || mediaPickerDialogs().includes(element)) return false;
      return /tạo hình đại diện|avatar|tín dụng google flow|credits?|đăng xuất|account|profile|nâng cấp|upgrade/i.test(element.innerText || "");
    });
  }
  async function closeOverlay(overlay: HTMLElement): Promise<void> {
    const closeButton = Array.from(overlay.querySelectorAll<HTMLElement>("button, [role='button']")).filter(isVisible).find((button) => /close|đóng|cancel|huỷ|hủy/i.test(`${button.getAttribute("aria-label") || ""} ${visibleText(button)}`));
    if (!closeButton) return;
    // Flow's account/profile side panel occasionally ignores a synthetic
    // pointer sequence on the first pass (the button is partially clipped at
    // the viewport edge). Keep this bounded, then use the element's native
    // activation as a second signal so the panel cannot remain over the
    // component picker and hide the submit/result surface.
    simulateClick(closeButton);
    await humanPause(250, 450);
    if (overlay.isConnected && isVisible(overlay)) {
      closeButton.click();
      await humanPause(250, 450);
    }
  }

  return { findFloatingFlowCloseButtons, visibleTransientOverlays, closeOverlay };
}
