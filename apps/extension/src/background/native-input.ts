let requestDesktopNativeClick: (tabUrl: string, x: number, y: number, expectedText?: string, confirmIfUnchanged?: boolean) => Promise<void>;

// chrome.debugger permits only one attached debugger per tab. Settings,
// prompt, picker and upload operations can overlap when a bounded caller times
// out while its underlying promise is still unwinding, so serialize sessions
// per tab instead of surfacing "Another debugger is already attached".
const debuggerSessionTails = new Map<number, Promise<void>>();
const pendingFileChooserNodes = new Map<number, number>();

if (chrome.debugger?.onEvent) {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method !== "Page.fileChooserOpened") return;
    const tabId = Number(source.tabId || 0);
    const backendNodeId = Number((params as { backendNodeId?: number })?.backendNodeId || 0);
    if (tabId && backendNodeId) pendingFileChooserNodes.set(tabId, backendNodeId);
  });
}

async function withDebuggerSession<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  const previous = debuggerSessionTails.get(tabId) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const next = previous.catch(() => undefined).then(() => gate);
  debuggerSessionTails.set(tabId, next);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (debuggerSessionTails.get(tabId) === next) debuggerSessionTails.delete(tabId);
  }
}

  async function dispatchDirectCdpClick(tabUrl: string, x: number, y: number): Promise<void> {
    const targets = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json()) as Array<{
      type?: string;
      url?: string;
      webSocketDebuggerUrl?: string;
    }>;
    const target = targets.find((candidate) => {
      if (candidate.type !== "page" || !candidate.webSocketDebuggerUrl || !candidate.url) return false;
      if (candidate.url === tabUrl) return true;
      try {
        const expected = new URL(tabUrl);
        const actual = new URL(candidate.url);
        return actual.origin === expected.origin && actual.pathname === expected.pathname;
      } catch { return false; }
    });
    if (!target?.webSocketDebuggerUrl) throw new Error(`No direct CDP target matched ${tabUrl}.`);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let sequence = 0;
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string } };
      if (!message.id || !pending.has(message.id)) return;
      const request = pending.get(message.id)!;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || "Direct CDP command failed."));
      else request.resolve(message.result);
    };
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Direct CDP WebSocket connection failed."));
    });
    const command = (method: string, params: Record<string, unknown> = {}) => new Promise<unknown>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    try {
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", clickCount: 0 });
      await command("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
      await new Promise((resolve) => setTimeout(resolve, 120));
      await command("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    } finally {
      await new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        const timer = setTimeout(resolve, 1000);
        ws.onclose = () => {
          clearTimeout(timer);
          resolve();
        };
        ws.close();
      });
    }
  }

async function focusNativeTab(tabId: number): Promise<chrome.tabs.Tab> {
    // Reading the target is enough for background debugger input. Calling
    // windows.update/tabs.update here causes Chrome to steal the foreground.
    return chrome.tabs.get(tabId);
}

async function tryExternalClick(tabUrl: string, x: number, y: number, expectedText: string, confirmIfUnchanged: boolean): Promise<boolean> {
  // The extension service worker cannot open a WebSocket to Chrome's CDP
  // target, even though it can read /json/list. Route the trusted click
  // through the paired desktop Playwright/CDP bridge instead. Its provider
  // implementation is background-safe and must not call Page.bringToFront.
  try {
    // The content-side label may include Material icon text (for example
    // `arrow_forward Bắt đầu tạo`) that is absent from the desktop DOM's
    // innerText. The desktop bridge still verifies the live hit element and
    // coordinates; let it perform that geometry check without the brittle
    // cross-context label comparison.
    await requestDesktopNativeClick(tabUrl, x, y, "", confirmIfUnchanged);
    return true;
  } catch {
    return false;
  }
}

async function debuggerHitTarget(target: chrome.debugger.Debuggee, x: number, y: number, expectedText: string): Promise<{ x: number; y: number }> {
  const result = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
    expression: `(() => { const hit = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)}); const clickable = hit?.closest?.("button, [role='button'], [role='option'], [role='menuitem']") || hit; if (!clickable) return null; const rect = clickable.getBoundingClientRect(); return { text: String(clickable.innerText || clickable.getAttribute?.("aria-label") || "").replace(/\\s+/g, " ").trim(), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
    returnByValue: true
  });
  const hit = (result as { result?: { value?: { text?: string; x?: number; y?: number } } })?.result?.value;
  const expected = expectedText.replace(/\s+/g, " ").trim().toLowerCase();
  const actual = String(hit?.text || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!hit || (expected && !actual.includes(expected) && !expected.includes(actual))) throw new Error(`Native click target changed before press (expected=${expected || "any"}, actual=${actual || "none"}).`);
  return { x: Number(hit.x), y: Number(hit.y) };
}

async function debuggerMousePress(target: chrome.debugger.Debuggee, x: number, y: number): Promise<void> {
  await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 120));
  await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function dispatchDebuggerClick(tabId: number, x: number, y: number, expectedText: string, confirmIfUnchanged: boolean): Promise<void> {
    const target = { tabId };
    await chrome.debugger.attach(target, "1.3");
    try {
      // Keep chooser interception on the same debugger session as the
      // trusted click. Detaching between Page.setInterceptFileChooserDialog
      // and Input.dispatchMouseEvent cancels the interception in Chrome.
      await chrome.debugger.sendCommand(target, "Page.setInterceptFileChooserDialog", { enabled: true }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 180));
      for (let step = 0; step <= 4; step += 1) {
        const progress = step / 4;
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: x - 12 * (1 - progress),
          y: y - 8 * (1 - progress),
          button: "none",
          clickCount: 0
        });
        await new Promise((resolve) => setTimeout(resolve, 35));
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
      const press = await debuggerHitTarget(target, x, y, expectedText);
      await debuggerMousePress(target, press.x, press.y);
      if (confirmIfUnchanged) {
        await new Promise((resolve) => setTimeout(resolve, 380));
        const unchangedResult = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
          expression: `(() => {
            const hit = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
            const clickable = hit?.closest?.("button, [role='button'], [role='option'], [role='menuitem']") || hit;
            return String(clickable?.innerText || clickable?.getAttribute?.("aria-label") || "").replace(/\\s+/g, " ").trim();
          })()`,
          returnByValue: true
        });
        const unchangedText = String((unchangedResult as { result?: { value?: string } })?.result?.value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        const expected = expectedText.replace(/\s+/g, " ").trim().toLowerCase();
        if (unchangedText && (!expected || unchangedText.includes(expected) || expected.includes(unchangedText))) await debuggerMousePress(target, press.x, press.y);
      }
    } finally {
      await chrome.debugger.detach(target).catch(() => undefined);
    }
}

async function dispatchNativeMouseClick(tabId: number, x: number, y: number, expectedText = "", confirmIfUnchanged = false): Promise<{ method: string; directError?: string }> {
  if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
  const tab = await focusNativeTab(tabId);
  if (tab.url && await tryExternalClick(tab.url, x, y, expectedText, confirmIfUnchanged)) return { method: "external" };
  // Chrome debugger input can report success while a background Flow tab
  // ignores the event. The direct CDP websocket is the background-safe path
  // proven by the live Flow test, so prefer it before debugger input.
  let directError = "";
  if (tab.url) {
    try { await dispatchDirectCdpClick(tab.url, x, y); return { method: "direct-cdp" }; }
    catch (error) { directError = error instanceof Error ? error.message : String(error); }
  }
  try {
    await withDebuggerSession(tabId, () => dispatchDebuggerClick(tabId, x, y, expectedText, confirmIfUnchanged));
    return { method: "chrome-debugger", directError: directError || undefined };
  } catch (error) {
    // A second debugger owner (for example TobyFlow's short-lived picker
    // session) can reject chrome.debugger.attach even though the page CDP
    // target is healthy. Use one direct-CDP click against the same tab as a
    // background-only fallback; never activate the tab or retry blindly.
    if (!tab.url) throw error;
    await dispatchDirectCdpClick(tab.url, x, y);
    return { method: "direct-cdp-fallback", directError: directError || undefined };
  }
}

  async function dispatchNativeTextInsert(tabId: number, x: number, y: number, text: string, focusOnly = false): Promise<void> {
    if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
    await withDebuggerSession(tabId, async () => {
      const target = { tabId };
      await chrome.debugger.attach(target, "1.3");
      try {
      // Flow can reflow the bottom composer while a settings menu closes. The
      // content-script rectangle may then be stale even though the editor is
      // visible. Resolve the current editor rectangle in the same debugger
      // target before sending trusted input, and use it when the original
      // point no longer hits a contenteditable/editor node.
      const resolvedPoint = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: `(() => {
          const point = { x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)} };
          const hit = document.elementFromPoint(point.x, point.y);
          const isEditor = (node) => Boolean(node?.closest?.('[data-slate-editor="true"], [contenteditable="true"], textarea, input'));
          if (isEditor(hit)) return point;
          const editor = [...document.querySelectorAll('[data-slate-editor="true"], [contenteditable="true"], textarea, input')]
            .filter((node) => { const r = node.getBoundingClientRect(); return r.width >= 120 && r.height >= 8 && r.bottom > innerHeight * .45 && getComputedStyle(node).visibility !== 'hidden'; })
            .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
          if (!editor) return null;
          const r = editor.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`,
        returnByValue: true
      }) as { result?: { value?: { x?: number; y?: number } | null } };
      const point = resolvedPoint?.result?.value;
      const inputX = Number(point?.x ?? x);
      const inputY = Number(point?.y ?? y);
      if (!focusOnly) {
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mouseMoved", x: inputX, y: inputY, button: "none", clickCount: 0
        });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mousePressed", x: inputX, y: inputY, button: "left", buttons: 1, clickCount: 1
        });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mouseReleased", x: inputX, y: inputY, button: "left", buttons: 0, clickCount: 1
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: 4
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: 4
      });
      await chrome.debugger.sendCommand(target, "Input.insertText", { text });
      } finally {
        await chrome.debugger.detach(target).catch(() => undefined);
      }
    });
  }

  async function dispatchDirectTobyFlowTextInsert(tabId: number, text: string): Promise<boolean> {
    const tabs = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json()) as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>;
    const tab = await chrome.tabs.get(tabId);
    const target = tabs.find((candidate) => candidate.type === "page" && candidate.url === tab.url && candidate.webSocketDebuggerUrl);
    if (!target?.webSocketDebuggerUrl) return false;
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let sequence = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const contexts: Array<{ id: number; name?: string }> = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.executionContextCreated") {
        const context = message.params?.context;
        if (context?.id) contexts.push({ id: context.id, name: context.name });
      }
      if (!message.id || !pending.has(message.id)) return;
      const request = pending.get(message.id)!; pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || "Direct Toby CDP command failed.")); else request.resolve(message.result);
    };
    await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error("Direct Toby CDP connection failed.")); });
    const command = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
    try {
      await command("Runtime.enable"); await new Promise((resolve) => setTimeout(resolve, 180));
      for (const context of contexts) {
        const probe = await command("Runtime.evaluate", { contextId: context.id, expression: "typeof getEditor === 'function' && typeof clearEditor === 'function' && typeof insertText === 'function'", returnByValue: true });
        if (probe?.result?.value !== true) continue;
        const result = await command("Runtime.evaluate", { contextId: context.id, awaitPromise: true, returnByValue: true, expression: `(async()=>{const editor=getEditor();if(!editor)return false;const cleared=await clearEditor(editor);if(!cleared)return false;return await insertText(getEditor(),${JSON.stringify(text)})})()` });
        if (result?.result?.value === true) return true;
      }
      return false;
    } finally { ws.close(); }
  }

  async function dispatchTobyFlowTextInsert(tabId: number, text: string): Promise<boolean> {
    if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
    try { return await withDebuggerSession(tabId, async () => {
      const target = { tabId };
      const contexts: Array<{ id: number; name?: string }> = [];
      const listener = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
        if (source.tabId !== tabId || method !== "Runtime.executionContextCreated") return;
        const context = (params as { context?: { id?: number; name?: string } } | undefined)?.context;
        if (context?.id) contexts.push({ id: context.id, name: context.name });
      };
      chrome.debugger.onEvent.addListener(listener);
      await chrome.debugger.attach(target, "1.3");
      try {
        await chrome.debugger.sendCommand(target, "Runtime.enable");
        await new Promise((resolve) => setTimeout(resolve, 120));
        for (const context of contexts) {
          const probe = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
            contextId: context.id, expression: "typeof getEditor === 'function' && typeof clearEditor === 'function' && typeof insertText === 'function'", returnByValue: true
          }) as { result?: { value?: boolean } };
          if (probe.result?.value !== true) continue;
          const result = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
            contextId: context.id, awaitPromise: true, returnByValue: true,
            expression: `(async()=>{const editor=getEditor();if(!editor)return false;const cleared=await clearEditor(editor);if(!cleared)return false;return await insertText(getEditor(),${JSON.stringify(text)})})()`
          }) as { result?: { value?: boolean } };
          if (result.result?.value === true) return true;
        }
        return false;
      } finally {
        chrome.debugger.onEvent.removeListener(listener);
        await chrome.debugger.detach(target).catch(() => undefined);
      }
    }); } catch { return dispatchDirectTobyFlowTextInsert(tabId, text); }
  }

  async function dispatchNativeFileInput(tabId: number, filePaths: string[]): Promise<void> {
    if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
    await withDebuggerSession(tabId, async () => {
      const target = { tabId };
      await chrome.debugger.attach(target, "1.3");
      try {
      const documentResult = await chrome.debugger.sendCommand(target, "DOM.getDocument", { depth: 1 }) as { root?: { nodeId?: number } };
      const rootNodeId = Number(documentResult.root?.nodeId || 0);
      if (!rootNodeId) throw new Error("Flow document root was not available.");
      const queryResult = await chrome.debugger.sendCommand(target, "DOM.querySelector", {
        nodeId: rootNodeId,
        selector: 'input[type="file"][accept*="image"]'
      }) as { nodeId?: number };
      const nodeId = Number(queryResult.nodeId || 0);
      const backendNodeId = pendingFileChooserNodes.get(tabId) || 0;
      if (!nodeId && !backendNodeId) throw new Error("Flow image upload input was not found.");
      await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", { files: filePaths, ...(nodeId ? { nodeId } : { backendNodeId }) });
      pendingFileChooserNodes.delete(tabId);
      } finally {
        await chrome.debugger.detach(target).catch(() => undefined);
      }
    });
  }

  async function dispatchNativeFileChooserUpload(tabId: number, x: number, y: number, filePaths: string[]): Promise<void> {
    if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
    await withDebuggerSession(tabId, async () => {
      const target = { tabId };
      await chrome.debugger.attach(target, "1.3");
      let chooserNode = 0;
      const onEvent = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
        if (Number(source.tabId) === tabId && method === "Page.fileChooserOpened") chooserNode = Number((params as { backendNodeId?: number })?.backendNodeId || 0);
      };
      chrome.debugger.onEvent.addListener(onEvent);
      try {
        await chrome.debugger.sendCommand(target, "Page.enable");
        await chrome.debugger.sendCommand(target, "DOM.enable");
        await chrome.debugger.sendCommand(target, "Page.setInterceptFileChooserDialog", { enabled: true });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
        const startedAt = Date.now();
        while (!chooserNode && Date.now() - startedAt < 5000) await new Promise((resolve) => setTimeout(resolve, 100));
        if (!chooserNode) throw new Error("Flow upload file chooser did not open after the native upload click.");
        await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", { backendNodeId: chooserNode, files: filePaths });
      } finally {
        chrome.debugger.onEvent.removeListener(onEvent);
        await chrome.debugger.detach(target).catch(() => undefined);
      }
    });
  }

  async function dispatchNativeCanvasDrag(
    tabId: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
    await withDebuggerSession(tabId, async () => {
      const target = { tabId };
      await chrome.debugger.attach(target, "1.3");
      try {
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseMoved", x: startX, y: startY, button: "none", clickCount: 0
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1, clickCount: 1
      });
      for (let step = 1; step <= 8; step += 1) {
        const progress = step / 8;
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: startX + (endX - startX) * progress,
          y: startY + (endY - startY) * progress,
          button: "left",
          buttons: 1,
          clickCount: 1
        });
        await new Promise((resolve) => setTimeout(resolve, 24));
      }
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: endX, y: endY, button: "left", buttons: 0, clickCount: 1
      });
      } finally {
        await chrome.debugger.detach(target).catch(() => undefined);
      }
    });
  }

export function createNativeInput(requestClick: typeof requestDesktopNativeClick) {
  requestDesktopNativeClick = requestClick;
  return { dispatchNativeMouseClick, dispatchNativeTextInsert, dispatchTobyFlowTextInsert, dispatchNativeFileInput, dispatchNativeFileChooserUpload, dispatchNativeCanvasDrag };
}
