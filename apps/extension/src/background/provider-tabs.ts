import type { StudioJob } from "./job-types";
import type { ProviderAdapter } from "./adapters/types";

type ProviderTabDependencies = {
  existingTabProviders: Set<string>; flowTabPatterns: string[]; providerUrls: Record<string, string>;
  inferProviderFromUrl: (url: string) => string; normalizeProvider: (provider: string) => string;
  providerAdapter: (provider: string) => ProviderAdapter | undefined;
  rememberedStudioChatGptTab: () => Promise<chrome.tabs.Tab | undefined>; rememberStudioChatGptTab: (tabId: number) => Promise<void>;
  sendStatus: (jobId: string, status: string, message: string, progress?: number) => void;
};

let EXISTING_TAB_PROVIDERS: ProviderTabDependencies["existingTabProviders"];
let FLOW_TAB_PATTERNS: ProviderTabDependencies["flowTabPatterns"];
let PROVIDER_URLS: ProviderTabDependencies["providerUrls"];
let inferProviderFromUrl: ProviderTabDependencies["inferProviderFromUrl"];
let normalizeProvider: ProviderTabDependencies["normalizeProvider"];
let providerAdapter: ProviderTabDependencies["providerAdapter"];
let rememberedStudioChatGptTab: ProviderTabDependencies["rememberedStudioChatGptTab"];
let rememberStudioChatGptTab: ProviderTabDependencies["rememberStudioChatGptTab"];
let sendStatus: ProviderTabDependencies["sendStatus"];

export function createProviderTabs(deps: ProviderTabDependencies) {
  ({ existingTabProviders: EXISTING_TAB_PROVIDERS, flowTabPatterns: FLOW_TAB_PATTERNS, providerUrls: PROVIDER_URLS, inferProviderFromUrl, normalizeProvider, providerAdapter, rememberedStudioChatGptTab, rememberStudioChatGptTab, sendStatus } = deps);
  return { activeFlowCustomToolTab, chatGptPageHasFatalShellError, chatGptPageHasRateLimit, findExistingProviderTab, findFlowProjectTab, findExactFlowProjectTab, findOrCreateTab, isFlowCustomToolUrl, isFlowProjectUrl, isProviderErrorPage, providerTabMatches, retryProviderTabAfterErrorPage, waitForTabComplete };
}

function providerTabMatches(provider: string, urlValue?: string): boolean {
  const registered = providerAdapter(provider);
  if (registered) return registered.matchesTab(urlValue);
  if (!urlValue) return false;
  try {
    const url = new URL(urlValue);
    return providerHostnameMatches(provider, url);
  } catch {
    return false;
  }
  return false;
}

function providerHostnameMatches(provider: string, url: URL): boolean {
  if (provider === "google-flow") return url.hostname === "labs.google" || url.hostname === "labs.google.com" || url.hostname === "flow.google.com";
  if (provider === "grok") return url.hostname === "grok.com" || (url.hostname === "x.com" && url.pathname.startsWith("/i/grok"));
  if (provider === "freepik") return url.hostname.endsWith("freepik.com");
  if (provider === "chatgpt") return url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com";
  return provider === "elevenlabs-flows" && url.hostname === "elevenlabs.io" && url.pathname.startsWith("/app/flows/");
}

export function isFlowProjectUrl(urlValue?: string): boolean {
  if (!urlValue) return false;
  try {
    const url = new URL(urlValue);
    return (url.hostname === "labs.google" || url.hostname === "labs.google.com" || url.hostname === "flow.google.com") &&
      // Flow currently emits both /tool/ and /tool-version/ routes for the
      // project workspace, and /shared/tool/ for public shared tools.
      /(?:\/fx\/(?:[^/]+\/)?tools\/flow\/(?:project\/[^/]+(?:\/tools|\/edit\/[^/]+|\/(?:tool|tool-version)\/[^/]+)?|shared\/tool\/[^/]+)|\/project\/[^/]+(?:\/edit\/[^/]+|\/tool\/[^/]+)?)\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Prefer the real project workspace over a custom-tool iframe route.
 * Both routes satisfy isFlowProjectUrl for workspace matching, but only the
 * base project page owns the composer/media picker used for uploads.
 */
export function chooseFlowProjectTab(activeFlowTab: chrome.tabs.Tab | undefined, projectTabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined {
  const workspaceTabs = projectTabs.filter((tab) => !isFlowCustomToolUrl(tab.url));
  if (activeFlowTab && isFlowProjectUrl(activeFlowTab.url) && !isFlowCustomToolUrl(activeFlowTab.url)) return activeFlowTab;
  return (workspaceTabs.length ? workspaceTabs : projectTabs)
    .sort((a, b) => providerTabScore("google-flow", b) - providerTabScore("google-flow", a))[0];
}

function isFlowCustomToolUrl(urlValue?: string): boolean {
  if (!urlValue) return false;
  try {
    const url = new URL(urlValue);
      return (url.hostname === "labs.google" || url.hostname === "labs.google.com" || url.hostname === "flow.google.com") &&
      (/(?:\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)[^/]+)/i.test(url.pathname) ||
       /\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1)(?:[/?#]|$)/i.test(url.pathname));
  } catch {
    return false;
  }
}

export function isFlowRuntimeToolUrl(urlValue?: string): boolean {
  if (!urlValue) return false;
  try {
    const url = new URL(urlValue);
    return (url.hostname === "labs.google" || url.hostname === "labs.google.com" || url.hostname === "flow.google.com") && (/(?:\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+(?:\/?$))/i.test(url.pathname) || /\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1)(?:\/?$)/i.test(url.pathname));
  } catch { return false; }
}

async function activeFlowCustomToolTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabs = await chrome.tabs.query({ url: FLOW_TAB_PATTERNS });
  const customTabs = tabs.filter((tab) => tab.id && isFlowCustomToolUrl(tab.url));
  if (active?.id && isFlowCustomToolUrl(active.url) && (isFlowRuntimeToolUrl(active.url) || !customTabs.some((tab) => isFlowRuntimeToolUrl(tab.url)))) return active;
  // A stale draft `/tool/` can remain ahead of the published runtime in
  // chrome.tabs after Flow redirects/reloads. Always choose `/tool-version/`
  // first so video dispatch cannot navigate the runtime back to the Flow root.
  return customTabs
    .sort((left, right) => Number(isFlowRuntimeToolUrl(right.url)) - Number(isFlowRuntimeToolUrl(left.url))
      || providerTabScore("google-flow", right) - providerTabScore("google-flow", left))[0];
}

function providerTabScore(provider: string, tab: chrome.tabs.Tab): number {
  const urlValue = tab.url || "";
  let score = tab.active ? 10 : 0;
  try {
    const url = new URL(urlValue);
    score += providerRouteScore(provider, url.pathname);
  } catch {}
  if (tab.status === "complete") score += 5;
  return score;
}

function providerRouteScore(provider: string, pathname: string): number {
  if (provider === "google-flow") return googleFlowRouteScore(pathname);
  if (provider === "grok") return pathname.startsWith("/imagine/post/") ? 95 : pathname.startsWith("/imagine") ? 100 : 0;
  return provider === "elevenlabs-flows" && pathname.startsWith("/app/flows/") ? 100 : 0;
}

function googleFlowRouteScore(pathname: string): number {
  if (/\/fx\/[^/]+\/tools\/flow\/(?:project\/[^/]+(?:\/tools|\/(?:tool|tool-version)\/[^/]+)?|shared\/tool\/[^/]+)\/?$/i.test(pathname)) return 100;
  if (/\/fx\/tools\/flow\/(?:project\/[^/]+(?:\/tools|\/(?:tool|tool-version)\/[^/]+)?|shared\/tool\/[^/]+)\/?$/i.test(pathname)) return 95;
  if (/\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)[^/]+/i.test(pathname)) return -100;
  return pathname.includes("/tools/flow") ? 20 : 0;
}

async function findExistingProviderTab(provider: string): Promise<chrome.tabs.Tab | undefined> {
  const normalizedProvider = normalizeProvider(provider);
  const tabs = normalizedProvider === "google-flow"
    ? await chrome.tabs.query({ url: FLOW_TAB_PATTERNS })
    : await chrome.tabs.query({});
  const matchingTabs = tabs.filter((tab) => providerTabMatches(normalizedProvider, tab.url));
  return matchingTabs.sort((a, b) => providerTabScore(normalizedProvider, b) - providerTabScore(normalizedProvider, a))[0];
}

async function findFlowProjectTab(): Promise<{ tab?: chrome.tabs.Tab; activeFlowTab?: chrome.tabs.Tab; flowTabCount: number; projectTabCount: number; customToolTabCount: number; runtimeToolTabCount: number; editorToolTabCount: number; urls: string[] }> {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const [patternTabs, allTabs] = await Promise.all([
    chrome.tabs.query({ url: FLOW_TAB_PATTERNS }),
    chrome.tabs.query({})
  ]);
  const seen = new Map<number, chrome.tabs.Tab>();
  if (activeTab?.id && providerTabMatches("google-flow", activeTab.url)) seen.set(activeTab.id, activeTab);
  for (const tab of [...patternTabs, ...allTabs]) {
    if (tab.id) seen.set(tab.id, tab);
  }
  const flowTabs = Array.from(seen.values()).filter((tab) => providerTabMatches("google-flow", tab.url));
  // Keep the workspace count distinct from custom/runtime tool tabs. A
  // healthy topology is one base workspace plus one runtime; counting the
  // runtime in projectTabs makes discovery incorrectly report duplicates.
  const projectTabs = flowTabs.filter((tab) => isFlowProjectUrl(tab.url) && !isFlowCustomToolUrl(tab.url));
  const customToolTabs = flowTabs.filter((tab) => isFlowCustomToolUrl(tab.url));
  const runtimeToolTabs = customToolTabs.filter((tab) => isFlowRuntimeToolUrl(tab.url));
  const editorToolTabs = customToolTabs.filter((tab) => !isFlowRuntimeToolUrl(tab.url));
  const activeFlowTab = activeTab?.id && providerTabMatches("google-flow", activeTab.url) ? activeTab : undefined;
  return {
    tab: chooseFlowProjectTab(activeFlowTab, projectTabs),
    activeFlowTab,
    flowTabCount: flowTabs.length,
    projectTabCount: projectTabs.length,
    customToolTabCount: customToolTabs.length,
    runtimeToolTabCount: runtimeToolTabs.length,
    editorToolTabCount: editorToolTabs.length,
    urls: flowTabs.map((tab) => tab.url || "").filter(Boolean).slice(0, 4)
  };
}

async function findChatGptTab(targetUrl: string, isConversation: boolean): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] });
  const targetPath = isConversation ? new URL(targetUrl).pathname.replace(/\/+$/, "") : "";
  const exact = isConversation ? tabs.find((tab) => {
    try { return Boolean(tab.url) && new URL(tab.url!).pathname.replace(/\/+$/, "") === targetPath; } catch { return false; }
  }) : undefined;
  if (exact?.id) { await rememberStudioChatGptTab(exact.id); return chrome.tabs.get(exact.id); }
  // Prefer an already-open landing tab for a new production request. A
  // remembered conversation can be rate-limited or still rendering an older
  // result; reusing the landing tab keeps the request on an operator-owned
  // tab without opening another one.
  if (!isConversation) {
    const landing = tabs.find((tab) => {
      try { return Boolean(tab.id) && new URL(String(tab.url || "")).pathname === "/"; } catch { return false; }
    });
    if (landing?.id) {
      await rememberStudioChatGptTab(landing.id);
      return updateProviderTabUrl(landing.id, targetUrl);
    }
  }
  const remembered = await rememberedStudioChatGptTab();
  if (remembered?.id) {
    // A remembered landing tab is already the signed-in blank workspace. Do
    // not navigate it to the same URL again: Chromium can reject a redundant
    // navigation while the ChatGPT shell is hydrating, which used to surface
    // as a false "Navigation rejected" failure on the next step.
    if (!isConversation) {
      try {
        const current = new URL(String(remembered.url || ""));
        const target = new URL(targetUrl);
        if (current.origin === target.origin && current.pathname === "/" && target.pathname === "/") return chrome.tabs.get(remembered.id);
        // ChatGPT is an SPA and the operator requires tab reuse. Navigate the
        // remembered tab in place; never create a fresh background tab for a
        // new production request.
        if (current.origin === target.origin) {
          return updateProviderTabUrl(remembered.id, targetUrl);
        }
      } catch {}
    }
    return updateProviderTabUrl(remembered.id, targetUrl);
  }
  if (!isConversation && tabs.length === 1 && tabs[0]?.id) { await rememberStudioChatGptTab(tabs[0].id); return updateProviderTabUrl(tabs[0].id, targetUrl); }
  const reusable = tabs.find((tab) => {
    // ChatGPT appends account/model/session query parameters to its blank
    // landing page. Those parameters do not make the tab a conversation and
    // should not force the user to open another tab.
    try { const url = new URL(tab.url!); return Boolean(tab.url) && url.pathname === "/"; } catch { return false; }
  });
  if (reusable?.id) {
    await rememberStudioChatGptTab(reusable.id);
    return updateProviderTabUrl(reusable.id, targetUrl);
  }
  // The operator may explicitly require reuse of the already-open browser
  // tab. If no landing tab exists, use an existing ChatGPT page rather than
  // creating a new tab. The normal conversation preparation path will reset
  // that page to the requested provider route before dispatching the job.
  const existing = tabs.find((tab) => tab.id && tab.status !== "loading") || tabs.find((tab) => tab.id);
  if (!existing?.id) throw new Error("Open one signed-in ChatGPT tab first. No existing ChatGPT tab is available for reuse.");
  await rememberStudioChatGptTab(existing.id);
  return updateProviderTabUrl(existing.id, targetUrl);
}

async function updateProviderTabUrl(tabId: number, targetUrl: string): Promise<chrome.tabs.Tab> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const current = await chrome.tabs.get(tabId);
      if (current.url === targetUrl) return current;
      return await chrome.tabs.update(tabId, { url: targetUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/navigation rejected|being navigated|tabs\.update/i.test(message) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw new Error(`Unable to navigate provider tab to ${targetUrl}.`);
}

async function findExactFlowProjectTab(targetUrl: string): Promise<chrome.tabs.Tab> {
  // Match without the /edit/ or /tool-version/ or /shared/tool/ specific segments
  const targetPath = new URL(targetUrl).pathname.replace(/\/(?:tool|tool-version|shared\/tool)\/[^/]+$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "");
  const providers = await chrome.tabs.query({ url: FLOW_TAB_PATTERNS });
  const exact = providers.find((tab) => {
    try { return Boolean(tab.url) && new URL(tab.url!).pathname.replace(/\/(?:tool|tool-version|shared\/tool)\/[^/]+$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "") === targetPath; } catch { return false; }
  });
  if (!exact?.id) throw new Error(`The Google Flow job is locked to ${targetUrl}, but that exact project is not open in the current signed-in account. Open the original Flow project before recovery; the extension will not submit in another project.`);
  // Native Flow jobs run against the already-open project. Do not activate
  // the tab: activation steals the user's foreground window and is not
  // required for content-script or debugger input on the target tab.
  return exact;
}

async function findFlowWorkspaceTab(jobId?: string): Promise<chrome.tabs.Tab> {
  const flow = await findFlowProjectTab();
  if (flow.activeFlowTab?.id && !isFlowProjectUrl(flow.activeFlowTab.url)) {
    if (jobId) sendStatus(jobId, "opening_provider", `Using the active Flow tab, but it is not a project URL yet: ${flow.activeFlowTab.url}`, 0.18);
    return chrome.tabs.get(flow.activeFlowTab.id);
  }
  if (flow.tab?.id) {
    if (jobId) sendStatus(jobId, "opening_provider", `Using Flow project tab: ${flow.tab.url}`, 0.18);
    return chrome.tabs.get(flow.tab.id);
  }
  const seen = flow.urls.length ? ` Seen Flow tabs: ${flow.urls.join(" | ")}` : " No Flow tabs were visible to the extension.";
  throw new Error(`No open Google Flow project tab found. Open https://labs.google/fx/vi/tools/flow/project/... then retry.${seen}`);
}

async function findRequiredProviderTab(provider: string): Promise<chrome.tabs.Tab> {
  const existing = await findExistingProviderTab(provider);
  if (!existing?.id) throw new Error(`No open ${provider} tab found. Open the signed-in provider/workspace tab, then retry this job.`);
  if (provider === "grok" && !(existing.url || "").includes("/imagine")) return chrome.tabs.update(existing.id, { url: PROVIDER_URLS.grok });
  return chrome.tabs.get(existing.id);
}

async function findGenericTab(targetUrl: string, isConversation: boolean): Promise<chrome.tabs.Tab> {
  const tabs = isConversation ? await chrome.tabs.query({ url: "https://chatgpt.com/*" }) : await chrome.tabs.query({ url: `${targetUrl}*` });
  const targetPath = isConversation ? new URL(targetUrl).pathname.replace(/\/+$/, "") : "";
  const existing = isConversation ? tabs.find((tab) => {
    try { return Boolean(tab.url) && new URL(tab.url!).pathname.replace(/\/+$/, "") === targetPath; } catch { return false; }
  }) : tabs[0];
  return existing?.id ? chrome.tabs.get(existing.id) : chrome.tabs.create({ url: targetUrl, active: false });
}

async function findOrCreateTab(targetUrl: string, provider = "", jobId?: string): Promise<chrome.tabs.Tab> {
  provider = normalizeProvider(provider) || inferProviderFromUrl(targetUrl);
  const isConversation = targetUrl.startsWith("https://chatgpt.com/c/");
  if (provider === "chatgpt") return findChatGptTab(targetUrl, isConversation);
  if (!isConversation && provider && EXISTING_TAB_PROVIDERS.has(provider)) {
    if (provider === "google-flow") return isFlowProjectUrl(targetUrl) ? findExactFlowProjectTab(targetUrl) : findFlowWorkspaceTab(jobId);
    return findRequiredProviderTab(provider);
  }
  return findGenericTab(targetUrl, isConversation);
}

function isProviderErrorPage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /showing error page|chrome-error:\/\/|cannot access contents/i.test(message);
}

async function waitForTabComplete(tabId: number, timeoutMs = 45000): Promise<chrome.tabs.Tab> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return tab;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for provider tab to finish loading.");
}

async function retryProviderTabAfterErrorPage(job: StudioJob, error: unknown): Promise<boolean> {
  if (!job.tabId || !isProviderErrorPage(error)) return false;
  const targetUrl = job.conversationUrl || PROVIDER_URLS[job.provider];
  if (!targetUrl) return false;
  sendStatus(job.jobId, "opening_provider", `${job.provider} opened an error page. Reloading provider tab once...`, 0.18);
  await chrome.tabs.update(job.tabId, { url: targetUrl });
  await waitForTabComplete(job.tabId);
  return true;
}

async function chatGptPageHasFatalShellError(tabId: number): Promise<boolean> {
  const [{ result = false } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const text = String(document.body?.innerText || "").slice(0, 12_000);
      return /(?:ôi[,!]?\s*hỏng rồi|something went wrong|aw,?\s*snap|application error|page isn['’]t responding|đã xảy ra lỗi)/i.test(text);
    }
  }).catch(() => [] as chrome.scripting.InjectionResult<boolean>[]);
  return result === true;
}

async function chatGptPageHasRateLimit(tabId: number): Promise<boolean> {
  const [{ result = false } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const text = String(document.body?.innerText || "").slice(-12_000);
      return /quá nhiều yêu cầu|bạn đang gửi yêu cầu quá nhanh|sending requests too quickly|too many requests|temporarily limited/i.test(text);
    }
  }).catch(() => [] as chrome.scripting.InjectionResult<boolean>[]);
  return result === true;
}
