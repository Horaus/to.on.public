import WebSocket from "ws";
import { execFileSync } from "node:child_process";
import { selectFlowSession } from "./flow-session-selection.mjs";

const chromePort = Number(process.env.STUDIO_CHROME_CDP_PORT || 9222);
const configuredElectronPort = process.env.STUDIO_ELECTRON_CDP_PORT ? Number(process.env.STUDIO_ELECTRON_CDP_PORT) : undefined;
const extensionId = process.env.STUDIO_EXTENSION_ID || "lpbjabcfpnkldcpbjkpanlcnijlpciog";

async function targets(port) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/json/list`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`CDP ${port} is unavailable (${reason}). Start the matching app/Chrome DevTools session before running verify:flow-live.`);
  }
  if (!response.ok) throw new Error(`CDP ${port} returned HTTP ${response.status}`);
  return response.json();
}

async function evaluate(target, expression, timeoutMs = 10_000) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP evaluation timed out for ${target.url}`)), timeoutMs);
      socket.on("message", (raw) => {
        const message = JSON.parse(String(raw));
        if (message.id !== 1) return;
        clearTimeout(timer);
        if (message.result?.exceptionDetails) {
          reject(new Error(message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text));
          return;
        }
        resolve(message.result?.result?.value);
      });
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true }
      }));
    });
  } finally {
    await new Promise((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) return resolve();
      const timer = setTimeout(resolve, 1000);
      socket.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.close();
    });
  }
}

function electronCdpCandidates() {
  if (configuredElectronPort) return [configuredElectronPort];
  const ports = [9333, 9334];
  try {
    const rows = execFileSync("ps", ["-axo", "command="], { encoding: "utf8" });
    for (const match of rows.matchAll(/(?:electron|Electron)[^\n]*--remote-debugging-port=(\d+)/g)) {
      if (!/Antigravity IDE/i.test(match[0])) ports.push(Number(match[1]));
    }
  } catch {
    // Keep known defaults when process inspection is unavailable.
  }
  return [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0))];
}

let chromeTargets = [];
let chromeError = null;
try {
  chromeTargets = await targets(chromePort);
} catch (error) {
  chromeError = error instanceof Error ? error.message : String(error);
}
let electronPort = configuredElectronPort;
let electronTargets;
if (electronPort) {
  electronTargets = await targets(electronPort);
} else {
  let lastError;
  for (const candidate of electronCdpCandidates()) {
    try {
      electronPort = candidate;
      electronTargets = await targets(candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!electronTargets) throw lastError;
}
const isFlowWorkspacePath = (pathname) => /^(?:\/project\/[^/?#]+|\/tools\/flow\/project\/[^/?#]+(?:\/tools)?|\/tools\/flow\/shared\/tool\/[^/?#]+)\/?$/i.test(pathname);
const isFlowProjectTarget = (target) => target.type === "page" && isFlowWorkspacePath(new URL(target.url || "about:blank").pathname);
const isFlowCustomToolUrl = (value) => /\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)[^/?#]+(?:[/?#]|$)/i.test(String(value || ""));
const isFlowCustomTarget = (target) => isFlowCustomToolUrl(target.url);
const isFlowRuntimeTarget = (target) => /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/?#]+(?:[/?#]|$)/i.test(target.url || "");
// A valid custom-tool topology has one base workspace plus one published
// runtime tab. Prefer the base workspace for page inspection; the extension
// target below independently inspects the runtime adapter.
const extensionTarget = chromeTargets.find((target) => target.type === "service_worker" && target.url.includes(`${extensionId}/background.js`));
const appTarget = electronTargets.find((target) => target.type === "page" && /^http:\/\/127\.0\.0\.1:/i.test(target.url));

if (!appTarget) throw new Error("Desktop renderer is not exposed through Electron CDP.");

const app = JSON.parse(await evaluate(appTarget, `(async () => { const bridge = await window.studioBridge.getBridgeStatus(); return JSON.stringify({
  connectedExtensions: bridge.connectedExtensions,
  expectedVersion: bridge.expectedVersion,
  versions: bridge.versions,
  connections: bridge.connections
}); })()`));

// Match the desktop connection to the extension target we actually inspected.
// A stale/second extension connection must never lend its topology to the
// current service worker and produce a false-green live check.
const extensionIdentity = String(extensionTarget ? extensionTarget.url.split("/")[2] : "");
// Multiple service-worker sessions can share one Chrome extension id after a
// restart. Use the session advertising the strongest current Flow topology;
// choosing the first matching record made a healthy workspace look empty.
const sessionSelection = selectFlowSession(app.connections, extensionIdentity);
const matchingConnections = sessionSelection.matching;
const canonicalConnection = sessionSelection.selected
  || app.connections?.[0];
const visibility = canonicalConnection?.providerVisibility || {};
const selectedExtensionInstanceId = String(canonicalConnection?.extensionInstanceId || canonicalConnection?.pairing?.extensionInstanceId || "");
const ignoredMatchingSessionCount = sessionSelection.ignoredMatchingSessionCount;
const flowProjectPath = (value) => {
  try { return new URL(String(value || "")).pathname.match(/\/tools\/flow\/(?:project\/[^/]+|shared\/tool\/[^/]+)/i)?.[0].toLowerCase() || ""; } catch { return ""; }
};
const advertisedFlowProjectPath = (visibility.googleFlowUrls || []).map(flowProjectPath).find(Boolean) || "";
const flowTarget = chromeTargets.find((target) => isFlowRuntimeTarget(target) && (!advertisedFlowProjectPath || flowProjectPath(target.url) === advertisedFlowProjectPath))
  || chromeTargets.find((target) => isFlowProjectTarget(target) && !isFlowCustomTarget(target) && (!advertisedFlowProjectPath || flowProjectPath(target.url) === advertisedFlowProjectPath))
  || chromeTargets.find((target) => isFlowProjectTarget(target) && (!advertisedFlowProjectPath || flowProjectPath(target.url) === advertisedFlowProjectPath))
  || chromeTargets.find((target) => isFlowProjectTarget(target) && !isFlowCustomTarget(target))
  || chromeTargets.find((target) => isFlowProjectTarget(target));
const blockers = [];
const advisories = [];
if (advertisedFlowProjectPath && flowTarget && flowProjectPath(flowTarget.url) !== advertisedFlowProjectPath) {
  blockers.push(`Flow page không trùng project extension đang quảng bá (${advertisedFlowProjectPath}); đóng tab project cũ hoặc mở đúng project mới.`);
}
if (canonicalConnection?.pairing?.state !== "confirmed") {
  blockers.push(`Extension pairing chưa được xác nhận (trạng thái: ${canonicalConnection?.pairing?.state || "missing"}). Phê duyệt pairing trên desktop trước khi chạy Flow.`);
}
const flowProjectTabCount = Number(visibility.googleFlowProjectTabs || 0);
const flowCustomToolTabCount = Number(visibility.googleFlowCustomToolTabs || 0);
// Extension visibility reports base workspaces separately from custom/runtime
// tool tabs. Do not subtract the custom count again or a healthy workspace +
// runtime topology is falsely reported as zero workspaces.
const flowWorkspaceTabCount = flowProjectTabCount;
// A published custom-tool runtime can be safely exercised without keeping its
// base workspace open. Accept that runtime-only topology explicitly; still
// reject zero tabs and every incomplete/editor combination.
const runtimeOnlyTopology = flowWorkspaceTabCount === 0
  && flowCustomToolTabCount === 1
  && Number(visibility.googleFlowRuntimeToolTabs || 0) === 1
  && Number(visibility.googleFlowEditorToolTabs || 0) === 0;
if (flowWorkspaceTabCount !== 1 && !runtimeOnlyTopology) blockers.push(`Cần đúng 1 Flow workspace tab hoặc 1 runtime đã publish (hiện có ${flowWorkspaceTabCount}; tổng project/tool route ${flowProjectTabCount}/${flowCustomToolTabCount}).`);
if (visibility.googleFlowRuntimeToolTabs !== 1) advisories.push(`Không có Flow runtime-tool tab; nhánh UI-direct không yêu cầu tab runtime riêng.`);
if ((visibility.googleFlowEditorToolTabs || 0) > 0) blockers.push(`Đang còn ${visibility.googleFlowEditorToolTabs} Flow editor-tool tab; bấm Xong để trở về workspace.`);

if (chromeError) {
  const flowRouteObserved = app.connections?.some((connection) => {
    const providerVisibility = connection.providerVisibility || {};
    return Math.max(0, Number(providerVisibility.googleFlowProjectTabs || 0) - Number(providerVisibility.googleFlowCustomToolTabs || 0)) === 1;
  }) === true;
  console.log(JSON.stringify({ ok: false, checkedAt: new Date().toISOString(), blockers, advisories, verification: { status: app.connectedExtensions >= 1 ? "partial" : "disconnected", bridgeConnected: app.connectedExtensions >= 1, flowRouteVerified: flowRouteObserved, providerRuntimeVerified: false }, chrome: { available: false, error: chromeError }, app }, null, 2));
  process.exitCode = 1;
} else {
  if (!flowTarget) {
    blockers.push("Chrome CDP không expose Flow project tab; profile đang được Extension quảng bá không trùng profile debug.");
    console.log(JSON.stringify({ ok: false, checkedAt: new Date().toISOString(), blockers, advisories, verification: { status: "blocked", bridgeConnected: app.connectedExtensions >= 1, flowRouteVerified: false, providerRuntimeVerified: false }, chrome: { available: true, targetCount: chromeTargets.length, urls: chromeTargets.filter((target) => target.type === "page").map((target) => target.url).slice(0, 12) }, app }, null, 2));
    process.exitCode = 1;
    process.exit(1);
  }
  if (!extensionTarget) throw new Error(`Extension service worker ${extensionId} is not exposed through Chrome CDP.`);

  const flowPage = JSON.parse(await evaluate(flowTarget, `JSON.stringify({
  url: location.href,
  title: document.title,
  tileCount: document.querySelectorAll("[data-tile-id]").length,
  videoCount: document.querySelectorAll("video").length,
  generationVisible: /processing job|(?:^|\\n)generating(?:\\n|$)|đang tạo video|rendering video/i.test(document.body?.innerText || "")
  })`));

  // The UI-direct executor runs from a normal Flow project workspace. Only
  // the custom-tool executor requires a published runtime route; do not turn
  // an otherwise valid /project/<id> tab into a false blocker.
  // The legacy diagnostic text “Flow CDP tab chưa phải published runtime” is
  // retained for consumers that recognize the old custom-runtime warning.
  const flowPageIsPublishedRuntime = /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/?#]+(?:[/?#]|$)/i.test(flowPage.url);
  const flowPageIsWorkspace = /^\/project\/[^/?#]+\/?$/i.test(new URL(flowPage.url).pathname);
  const flowPageIsExecutable = flowPageIsPublishedRuntime || flowPageIsWorkspace;
  if (!flowPageIsExecutable) {
    blockers.push(`Flow CDP tab không phải workspace hoặc published runtime (đang ở ${flowPage.url}); route editor/tool draft không được phép generation.`);
  }

  const extension = JSON.parse(await evaluate(extensionTarget, `(async () => {
  const flowTabs = await chrome.tabs.query({ url: ["https://labs.google/*", "https://labs.google.com/*", "https://flow.google.com/*"] });
  const tab = flowTabs.sort((left, right) => {
    // Probe the executable published runtime first. A stale editor/custom
    // tool tab can remain in chrome.tabs after its CDP target is gone and
    // would otherwise produce a misleading adapter failure.
    const score = (candidate) => {
      const url = String(candidate.url || "");
      if (/\\/tools\\/flow\\/(?:project\\/[^/]+\\/tool-version\\/[^/]+|shared\\/tool\\/[^/]+)/i.test(url)) return 30;
      if (/\\/tools\\/flow\\/project\\/[^/]+\\/tool\\/[^/]+/i.test(url)) return 20;
      if (/\\/tools\\/flow\\/project\\/[^/]+(?:[?#]|$)/i.test(url)) return 10;
      return 0;
    };
    return score(right) - score(left);
  })[0];
  const bundle = await fetch(chrome.runtime.getURL("background.js")).then((response) => response.text());
  let adapter = null;
  if (tab?.id) {
    try { adapter = await chrome.tabs.sendMessage(tab.id, { action: "PING_STUDIO_ADAPTER" }); }
    catch (error) { adapter = { ok: false, error: String(error) }; }
  }
  return JSON.stringify({
    id: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    adapter,
    bundleAdvertisesV2: /manifestVersion:\\s*"2"/.test(bundle) && /protocolVersions:\\s*\\[1,\\s*2\\]/.test(bundle),
    lifecycleGuardLoaded: bundle.includes("no downloadable asset was returned"),
    postSubmitGuardLoaded: bundle.includes("flowJobWasSubmitted")
  });
})()`));

  const canonicalExtensionIds = new Set((app.connections || []).map((connection) => String(connection.extensionId || "").replace(/:content-direct$/, "")));
  const liveCapabilityV2 = matchingConnections.some((connection) => (connection.capabilities?.protocolVersions || []).includes(2));
  if (extension.bundleAdvertisesV2 && !liveCapabilityV2) blockers.push("Extension bundle đã là Relay schema v2 nhưng handshake live vẫn chỉ quảng bá protocol v1; reload đúng Extension instance trước khi chạy unattended.");
  const workspaceReady = blockers.length === 0;
  const ok = extension.adapter?.ok === true
    && extension.lifecycleGuardLoaded
    && extension.postSubmitGuardLoaded
    && app.connectedExtensions >= 1
    && canonicalExtensionIds.size === 1
    && app.versions?.includes(extension.version)
    && flowPageIsExecutable
    && workspaceReady;

  console.log(JSON.stringify({ ok, checkedAt: new Date().toISOString(), blockers, advisories, verification: { status: ok ? "verified" : "blocked", bridgeConnected: app.connectedExtensions >= 1, flowRouteVerified: flowPageIsExecutable, providerRuntimeVerified: extension.adapter?.ok === true && extension.lifecycleGuardLoaded && extension.postSubmitGuardLoaded, bundleAdvertisesV2: extension.bundleAdvertisesV2 === true, liveCapabilityV2, selectedExtensionInstanceId, ignoredMatchingSessionCount }, flowPage, extension, app }, null, 2));
  if (!ok) process.exitCode = 1;
}
