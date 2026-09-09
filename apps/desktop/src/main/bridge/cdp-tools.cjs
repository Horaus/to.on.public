const http = require("node:http");
const { WebSocket } = require("ws");

function isFlowCustomToolUrl(value) {
  return /\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)[^/]+/i.test(String(value || ""));
}

function readCdpTargets() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json/list", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

async function openCdpClient(tabUrl) {
  const targets = await readCdpTargets();
  const target = targets.find((candidate) => {
    if (candidate.type !== "page" || !candidate.webSocketDebuggerUrl || !candidate.url) return false;
    if (candidate.url === tabUrl) return true;
    try {
      const expected = new URL(tabUrl);
      const actual = new URL(candidate.url);
      return actual.origin === expected.origin && actual.pathname === expected.pathname;
    } catch { return false; }
  });
  if (!target?.webSocketDebuggerUrl) throw new Error(`No CDP page matched ${tabUrl}.`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message || "CDP command failed."));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const close = () => new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    const timer = setTimeout(resolve, 1000);
    ws.once("close", () => { clearTimeout(timer); resolve(); });
    ws.close();
  });
  return { command, close };
}

async function verifiedClickPoint(command, x, y, expectedText) {
    const hitResult = await command("Runtime.evaluate", {
      expression: `(() => {
        const hit = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
        const clickable = hit?.closest?.("button, [role='button'], [role='option'], [role='menuitem']") || hit;
        if (!clickable) return null;
        const rect = clickable.getBoundingClientRect();
        return {
          text: String(clickable.innerText || clickable.getAttribute?.("aria-label") || "").replace(/\\s+/g, " ").trim(),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      })()`,
      returnByValue: true
    });
    const verifiedHit = hitResult?.result?.value;
    const expected = String(expectedText || "").replace(/\s+/g, " ").trim().toLowerCase();
    const actual = String(verifiedHit?.text || "").replace(/\s+/g, " ").trim().toLowerCase();
    const expectedKey = expected.replace(/\s+/g, "");
    const actualKey = actual.replace(/\s+/g, "");
    if (!verifiedHit || (expectedKey && !actualKey.includes(expectedKey) && !expectedKey.includes(actualKey))) {
      throw new Error(`Desktop CDP click target changed before press (expected=${expected || "any"}, actual=${actual || "none"}).`);
    }
    return { x: Number(verifiedHit.x), y: Number(verifiedHit.y) };
}

async function cdpMouseClick(command, x, y, move = false) {
    if (move) await command("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", clickCount: 0 });
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function repeatUnchangedClick(command, press, expectedText) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const hitResult = await command("Runtime.evaluate", {
        expression: `(() => {
          const dialogOpen = [...document.querySelectorAll('[role="dialog"], [data-state="open"]')].some((node) => {
            const rect = node.getBoundingClientRect();
            const text = String(node.innerText || '').replace(/\\s+/g, ' ').trim();
            return rect.width > 0 && rect.height > 0 && /thêm vào câu lệnh|add to prompt|tìm kiếm thành phần|search (assets|components)|search media/i.test(text);
          });
          if (dialogOpen) return '__FLOW_DIALOG_OPEN__';
          const hit = document.elementFromPoint(${JSON.stringify(press.x)}, ${JSON.stringify(press.y)});
          const clickable = hit?.closest?.("button, [role='button'], [role='option'], [role='menuitem']") || hit;
          return String(clickable?.innerText || clickable?.getAttribute?.("aria-label") || "").replace(/\\s+/g, " ").trim();
        })()`,
        returnByValue: true
      });
      const actual = String(hitResult?.result?.value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const expected = String(expectedText || "").replace(/\s+/g, " ").trim().toLowerCase();
      const actualKey = actual.replace(/\s+/g, "");
      const expectedKey = expected.replace(/\s+/g, "");
      if (actual !== "__flow_dialog_open__" && actualKey && (!expectedKey || actualKey.includes(expectedKey) || expectedKey.includes(actualKey))) {
        await cdpMouseClick(command, press.x, press.y);
      }
}

async function dispatchDesktopNativeClick(tabUrl, x, y, expectedText = "", confirmIfUnchanged = false) {
  const client = await openCdpClient(tabUrl);
  try {
    // Flow gates its submit handler on page focus. Emulate focus inside the
    // target without activating Chrome's window; Page.bringToFront is
    // intentionally forbidden because it steals the user's foreground.
    await client.command("Page.enable").catch(() => undefined);
    await client.command("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
    const press = await verifiedClickPoint(client.command, x, y, expectedText);
    await cdpMouseClick(client.command, press.x, press.y, true);
    if (confirmIfUnchanged) await repeatUnchangedClick(client.command, press, expectedText);
  } finally {
    await client.close();
  }
}

async function confirmFlowMediaInPage(targetFilename) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; };
    const findAddButton = () => [...document.querySelectorAll("button")].filter(visible).find((button) => /^(Thêm nội dung nghe nhìn|Add media)$/i.test((button.textContent || "").trim()));
    const findMediaLabel = () => [...document.querySelectorAll("button, [role='button'], [role='option'], div, span")]
      .filter(visible)
      .filter((element) => (element.textContent || "").trim() === targetFilename)
      .at(-1);
    const waitFor = async (predicate, attempts) => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const value = predicate();
        if (value) return value;
        await sleep(100);
      }
      return null;
    };
    const mediaLabel = await waitFor(findMediaLabel, 300);
    if (!mediaLabel) return { ok: false, error: `Flow media tile ${targetFilename} is not visible.` };
    const mediaTile = mediaLabel.closest("[role='option'], button, [role='button']") || mediaLabel;
    mediaTile.click();
    await waitFor(() => mediaTile.getAttribute("role") !== "option" || mediaTile.getAttribute("aria-selected") === "true", 50);
    // This function is serialized into the provider page by CDP. Do not call
    // a module-scoped helper here: it does not exist in the page context.
    if (mediaTile.getAttribute("role") === "option" && mediaTile.getAttribute("aria-selected") !== "true") {
      return { ok: false, error: `Flow media tile ${targetFilename} did not become selected.` };
    }
    const addButton = await waitFor(() => { const button = findAddButton(); return button && !button.disabled ? button : null; }, 300);
    addButton?.click();
    return addButton ? { ok: true } : { ok: false, error: `Flow did not enable Add media after selecting ${targetFilename}.` };
}

function isUnselectedFlowMediaTile(tile) {
  return tile.getAttribute("role") === "option" && tile.getAttribute("aria-selected") !== "true";
}

async function confirmFlowMedia(flowPage, filename) {
  const confirmation = await flowPage.evaluate(confirmFlowMediaInPage, filename);
  if (!confirmation?.ok) throw new Error(confirmation?.error || `Could not confirm Flow media ${filename}.`);
}

async function handleFlowPageCommand(flowPage, expression) {
    if (expression.startsWith("__STUDIO_CLICK_FLOW_PAGE_BUTTON__:")) {
      const label = expression.slice("__STUDIO_CLICK_FLOW_PAGE_BUTTON__:".length);
      await flowPage.getByRole("button", { name: new RegExp(label, "i") }).last().click({ timeout: 20000 });
      return { handled: true, value: true };
    }
    if (expression.startsWith("__STUDIO_CLICK_FLOW_MEDIA__:")) {
      const filename = expression.slice("__STUDIO_CLICK_FLOW_MEDIA__:".length);
      await flowPage.getByText(filename, { exact: true }).last().click({ timeout: 20000 });
      return { handled: true, value: true };
    }
    if (expression.startsWith("__STUDIO_CONFIRM_FLOW_MEDIA__:")) {
      const filename = expression.slice("__STUDIO_CONFIRM_FLOW_MEDIA__:".length);
      await confirmFlowMedia(flowPage, filename);
      return { handled: true, value: true };
    }
    if (expression.startsWith("__STUDIO_PRESS_FLOW_PAGE__:")) {
      await flowPage.keyboard.press(expression.slice("__STUDIO_PRESS_FLOW_PAGE__:".length));
      return { handled: true, value: true };
    }
    if (expression === "__STUDIO_DISMISS_FLOW_MEDIA_PICKER__") {
      const backdrop = flowPage.locator('[data-state="open"][aria-hidden="true"]');
      if (await backdrop.count()) await backdrop.last().click({ position: { x: 2, y: 2 }, force: true });
      return { handled: true, value: true };
    }
    return { handled: false };
}

async function evaluateFlowCustomTool(expression) {
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    // Flow can expose both an editable `/tool/` draft and a published
    // `/tool-version/` runtime at the same time. Always prefer the published
    // route; using the first matching page made a healthy runtime appear
    // connected while clicks were sent to an unrelated draft.
    const flowPage = pages
      .filter((page) => isFlowCustomToolUrl(page.url()))
      .sort((left, right) => {
        const runtimeScore = (page) => /\/tool-version\/[^/]+(?:[/?#]|$)/i.test(page.url()) ? 100 : 0;
        return runtimeScore(right) - runtimeScore(left);
      })[0];
    if (!flowPage) throw new Error("No Google Flow custom-tool page is connected through Chrome DevTools.");
    const pageCommand = await handleFlowPageCommand(flowPage, expression);
    if (pageCommand.handled) return pageCommand.value;
    const appFrames = flowPage.frames().filter((frame) => frame !== flowPage.mainFrame());
    const candidates = [];
    for (const frame of appFrames) {
      if (await frame.title().catch(() => "") !== "Flow App") continue;
      const text = await frame.locator("body").innerText().catch(() => "");
      candidates.push({ frame, score: /relay bridge/i.test(text) ? 10 : 0 });
    }
    const toolFrame = candidates.sort((left, right) => right.score - left.score)[0]?.frame;
    if (!toolFrame) throw new Error("Studio Shot Bridge frame is not ready.");
    if (expression.startsWith("__STUDIO_CLICK_BUTTON__:")) {
      const label = expression.slice("__STUDIO_CLICK_BUTTON__:".length);
      // Use the applet's own button node instead of a coordinate click. The
      // Flow sandbox is a nested srcdoc document; Playwright's role click can
      // report success while dispatching the event to a stale accessibility
      // snapshot after a React re-render. Resolving and clicking the live DOM
      // node keeps the command bound to the canonical iframe.
      const clicked = await toolFrame.evaluate((needle) => {
        const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; };
        const textOf = (element) => String(element.innerText || element.textContent || element.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
        const target = [...document.querySelectorAll("button, [role='button']")]
          .filter((element) => visible(element) && !element.disabled && new RegExp(needle, "i").test(textOf(element)))
          .at(-1);
        if (!target) return false;
        target.click();
        return true;
      }, label);
      if (!clicked) throw new Error(`No enabled Flow Bridge button matched ${label}.`);
      return true;
    }
    return await toolFrame.evaluate((source) => (0, eval)(source), expression);
  } finally {
    await browser.close();
  }
}

module.exports = { readCdpTargets, dispatchDesktopNativeClick, evaluateFlowCustomTool, isFlowCustomToolUrl };
