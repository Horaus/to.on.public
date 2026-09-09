const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

test("Flow result policy rejects every identity that existed before submit", async () => {
  const { isFreshFlowTile } = await import("../../../../packages/extension-providers/src/google-flow/flow-result-policy.ts");
  const baseline = {
    beforeTileIds: ["old-tile"],
    beforeTileTextById: {},
    beforeTileMediaById: {},
    beforeEditIds: ["old-edit"],
    beforeMediaUrls: ["old.mp4"],
    submittedAt: Date.now(),
  };
  assert.equal(isFreshFlowTile({ tileId: "old-tile", mediaUrls: [] }, baseline), false);
  assert.equal(isFreshFlowTile({ tileId: "new-tile", editId: "old-edit", mediaUrls: [] }, baseline), false);
  assert.equal(isFreshFlowTile({ tileId: "new-tile", mediaUrls: ["old.mp4"] }, baseline), false);
  assert.equal(isFreshFlowTile({ tileId: "new-tile", editId: "new-edit", mediaUrls: ["new.mp4"] }, baseline), true);
  assert.equal(isFreshFlowTile({ tileId: "new-tile", mediaUrls: [] }, undefined), false);
});

test("Flow reference hydration converts local media URLs in memory without changing the persisted object", async () => {
  const { hydrateReference, hasUsableReference } = await import("../../../../packages/extension-providers/src/google-flow/flow-reference-data.ts");
  const persisted = { assetId: "asset-local", filePath: "http://127.0.0.1:3768/media/%2Ftmp%2Fframe.png", mimeType: "image/png" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  try {
    const hydrated = await hydrateReference(persisted);
    assert.equal(hasUsableReference(persisted), false);
    assert.equal(hasUsableReference(hydrated), true);
    assert.match(hydrated.base64, /^data:image\/png;base64,/);
    assert.equal("base64" in persisted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Flow relay result wait covers slow real generations without adding a retry", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /const FLOW_RESULT_TIMEOUT_MS = 15 \* 60_000/);
  assert.equal((source.match(/FLOW_RESULT_TIMEOUT_MS, "(?:fresh Flow relay result|Flow SDK result)"/g) || []).length, 2);
  assert.doesNotMatch(source, /FLOW_RESULT_TIMEOUT_MS[^\n]*retry/i);
});

test("Flow generation acceptance rejects duplicated start-frame hydration for video", async () => {
  const { isFlowGenerationEvidence } = await import("../../../../packages/extension-providers/src/google-flow/flow-result-policy.ts");
  const imageHydration = {
    expectVideo: true,
    hasProgressControl: true,
    percent: null,
    hasVideoMedia: false,
    hasAnyMedia: true,
    isImageOnlyResult: true,
    visibleText: "",
  };
  assert.equal(isFlowGenerationEvidence(imageHydration), false);
  assert.equal(isFlowGenerationEvidence({ ...imageHydration, hasProgressControl: false, visibleText: "Đang tạo" }), false);
  assert.equal(isFlowGenerationEvidence({ ...imageHydration, isImageOnlyResult: false, hasAnyMedia: false }), true);
  assert.equal(isFlowGenerationEvidence({ ...imageHydration, isImageOnlyResult: false, visibleText: "Đang tạo video" }), true);
  assert.equal(isFlowGenerationEvidence({ ...imageHydration, hasVideoMedia: true }), true);
});

test("Flow workspace contract normalizes edit routes without crossing projects", async () => {
  const { flowProjectBaseUrl, flowWorkspaceMatches } = await import("../../../../packages/extension-providers/src/google-flow/flow-workspace.ts");
  assert.equal(flowProjectBaseUrl("https://labs.google/fx/tools/flow/project/p1/edit/e1"), "https://labs.google/fx/tools/flow/project/p1");
  assert.equal(flowProjectBaseUrl("https://labs.google/fx/vi/tools/flow/project/p1/tool-version/v75"), "https://labs.google/fx/vi/tools/flow/project/p1");
  assert.equal(flowWorkspaceMatches("https://labs.google/fx/tools/flow/project/p1", "https://labs.google/fx/tools/flow/project/p1/edit/e2"), true);
  assert.equal(flowWorkspaceMatches("https://labs.google/fx/vi/tools/flow/project/p1", "https://labs.google/fx/vi/tools/flow/project/p1/tool-version/v76"), true);
  assert.equal(flowWorkspaceMatches("https://labs.google/fx/tools/flow/project/p1", "https://labs.google/fx/tools/flow/project/p2"), false);
});

test("Flow provider defaults to the stable workspace instead of a stale account tool route", () => {
  const adapter = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow.cjs"), "utf8");
  const catalog = fs.readFileSync(path.resolve(__dirname, "../../../desktop/src/main/providers/catalog.cjs"), "utf8");
  assert.match(adapter, /targetUrl:\s*"https:\/\/labs\.google\/fx\/vi\/tools\/flow"/);
  assert.match(catalog, /targetUrl:\s*"https:\/\/labs\.google\/fx\/vi\/tools\/flow"/);
  assert.doesNotMatch(adapter, /\/project\/[^\"]+\/tool\//);
});

test("Flow project selection prefers the base workspace over the active custom tool", async () => {
  const { chooseFlowProjectTab, isFlowProjectUrl, isFlowRuntimeToolUrl } = await import("../background/provider-tabs.ts");
  const workspace = { id: 1, url: "https://labs.google/fx/vi/tools/flow/project/p1", status: "complete", active: false };
  assert.equal(isFlowProjectUrl("https://labs.google/fx/tools/flow/project/p1/tools"), true);
  assert.equal(isFlowProjectUrl("https://labs.google/fx/tools/flow/project/p1/tool-version/v75"), true);
  assert.equal(isFlowRuntimeToolUrl("https://labs.google/fx/tools/flow/project/p1/tool/draft"), false);
  assert.equal(isFlowRuntimeToolUrl("https://labs.google/fx/tools/flow/project/p1/tool-version/v75"), true);
  assert.equal(isFlowRuntimeToolUrl("https://labs.google/fx/tools/flow/shared/tool/shared1"), true);
  assert.equal(isFlowProjectUrl("https://flow.google.com/project/p1"), true);
  assert.equal(isFlowRuntimeToolUrl("https://flow.google.com/project/p1/tool/fb030780-41d2-48a6-8fa5-bc94538e60c1"), true);
  assert.equal(isFlowRuntimeToolUrl("https://flow.google.com/project/p1/tool/draft"), false);
  const runtimeTool = { id: 2, url: "https://labs.google/fx/vi/tools/flow/project/p1/tool-version/v75", status: "complete", active: true };
  assert.equal(chooseFlowProjectTab(runtimeTool, [runtimeTool, workspace]).id, workspace.id);
  assert.equal(chooseFlowProjectTab(workspace, [runtimeTool, workspace]).id, workspace.id);
});

test("Flow tab accounting keeps the runtime out of the workspace count", async () => {
  const { createProviderTabs } = await import("../background/provider-tabs.ts");
  const tabs = createProviderTabs({
    existingTabProviders: new Set(), flowTabPatterns: ["https://labs.google/*"], providerUrls: {},
    inferProviderFromUrl: () => "google-flow", normalizeProvider: (value) => value,
    providerAdapter: () => ({ matchesTab: (url) => Boolean(url && url.includes("labs.google")) }),
    rememberedStudioChatGptTab: async () => undefined, rememberStudioChatGptTab: async () => undefined,
    sendStatus: () => undefined
  });
  const originalQuery = globalThis.chrome?.tabs?.query;
  globalThis.chrome = { tabs: { query: async () => [
    { id: 1, url: "https://labs.google/fx/vi/tools/flow/project/p1/tools", status: "complete", active: true },
    { id: 2, url: "https://labs.google/fx/vi/tools/flow/project/p1/tool-version/app1", status: "complete", active: false }
  ] } };
  const snapshot = await tabs.findFlowProjectTab();
  assert.equal(snapshot.projectTabCount, 1);
  assert.equal(snapshot.customToolTabCount, 1);
  assert.equal(snapshot.runtimeToolTabCount, 1);
  if (originalQuery) globalThis.chrome.tabs.query = originalQuery;
});

test("Flow workspace never treats the live composer source control as a grid entrypoint", () => {
  const gates = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-workspace-gates.ts"), "utf8");
  const content = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(gates, /form\?\.querySelector\('\[role="textbox"\], \[contenteditable="true"\], textarea'\)/);
  assert.match(content, /getComposerRoot\(\) \|\| activeFlowPromptEditor\(\)/);
});

test("Flow picker recognizes the localized composer upload entrypoint without broad create matching", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts"), "utf8");
  assert.match(source, /thêm nội dung nghe nhìn lên/);
  assert.match(source, /upload media/);
  assert.match(source, /tạo video/);
});

test("Studio Shot Bridge accepts localized reference-count previews", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /VISUAL REFERENCES\|TÀI NGUYÊN TRỰC QUAN/);
  assert.match(source, /closeButtons >= expected/);
});

test("Studio Shot Bridge DRAFT badge is not mistaken for a Flow editor draft", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /bridgeShell = \/studio shot bridge\/i/);
  assert.match(source, /parsed\.draft && !parsed\.bridgeShell/);
  assert.match(source, /Flow editor bản DRAFT/);
});

test("Flow bridge-unavailable diagnostics fail fast instead of entering recovery", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/dispatch-runtime.ts"), "utf8");
  assert.match(source, /function isFlowBridgeUnavailableError/);
  assert.match(source, /reCAPTCHA\|about:srcdoc/);
  assert.match(source, /Timed out waiting for Studio Shot Bridge controls/);
  const handler = fs.readFileSync(path.resolve(__dirname, "../background/result-handler.ts"), "utf8");
  assert.match(handler, /deps\.isFlowBridgeUnavailableError\(error\)\) return false/);
});

test("late Flow recovery prefers the published Relay runtime before the workspace", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(source, /const runtimeTab = await activeFlowCustomToolTab\(\)/);
  assert.match(source, /valid in-memory COMPLETED result/);
  assert.match(source, /runtimeProjectId === expectedProjectId/);
  assert.match(source, /await findOrCreateTab\(PROVIDER_URLS\["google-flow"\]/);
});

test("Flow late-result recovery materializes sandbox blob video URLs", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/result-runtime.ts"), "utf8");
  assert.match(source, /if \(\/\^blob:/);
  assert.match(source, /await fetch\(source\)/);
  assert.match(source, /source = "data:" \+ \(response\.headers\.get/);
});

test("Flow adapter recovery is bounded to one same-tab reload", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/dispatch-runtime.ts"), "utf8");
  const ensure = source.match(/async function ensureContentScript\([\s\S]*?\n}\n\nasync function probeContentScript/)?.[0] || "";
  assert.match(ensure, /currentTab\.status !== "complete"/);
  assert.match(ensure, /chrome\.tabs\.reload\(job\.tabId, \{ bypassCache: true \}\)/);
  assert.match(ensure, /Recovering \$\{file\} in tab/);
  assert.match(ensure, /await pingGoogleFlowAdapter\(job\.tabId\)/);
});

test("video regeneration does not reject a shot only because its prompt is rebuilt", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/workflow/src/orchestration/video-provider-actions.ts"), "utf8");
  const queue = source.match(/function queueVideoJob\([\s\S]*?\n  }\n  \nfunction preflightVideoJob/)?.[0] || "";
  assert.doesNotMatch(queue, /targetShotHasPrompt/);
  assert.match(queue, /targetShotHasKeyframe/);
});

test("targeted Flow one-shot bypasses unrelated project-wide gates only when self-contained", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/workflow/src/orchestration/video-provider-actions.ts"), "utf8");
  assert.match(source, /selfContainedFlowShot\s*=\s*isFlowVideoProvider[^;]+shot\.prompt\?\.trim\(\)[^;]+targetAssets\.length\s*>\s*0[^;]+missingRequirements\.length\s*===\s*0/);
  assert.match(source, /if \(selfContainedFlowShot\) return false;\s*return pipelineReadinessBlock/);
});

test("fresh Flow relay resolves keyframes through the base workspace instead of the runtime picker", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /chrome\.tabs\.query\(\{\s*url:\s*\["https:\/\/labs\.google\/fx\/\*",\s*"https:\/\/labs\.google\.com\/fx\/\*"\]/);
  assert.match(source, /chrome\.tabs\.sendMessage\(base\.id,\s*\{\s*action:\s*"RESOLVE_FLOW_REFERENCE"/);
  assert.doesNotMatch(source, /chrome\.runtime\.sendMessage\(\{\s*source:\s*"google-flow-adapter",\s*type:\s*"RESOLVE_FLOW_REFERENCE_IN_WORKSPACE"/);
  assert.doesNotMatch(source, /chrome\.tabs\.sendMessage\(this\.tabId,\s*\{\s*action:\s*"RESOLVE_FLOW_REFERENCE"/);
});

test("Flow project API canonicalizes UUID media and only disambiguates exact duplicate uploads", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /function canonicalFlowSdkMediaId/);
  assert.match(source, /`fe_id_\$\{id\}`/);
  assert.doesNotMatch(source, /candidateBytes\s*===\s*referenceBytes/);
  assert.match(source, /dimensions\?\.width\)\s*===\s*referenceDimensions\.width/);
  assert.match(source, /ledgerEntry\?\.source\s*===\s*"upload-dispatched"/);
  assert.match(source, /Math\.abs\(createdAt\s*-\s*Number\(ledgerEntry\.updatedAt/);
  assert.match(source, /explicitDomMediaId\s*=\s*canonicalFlowSdkMediaId\(domTile\?\.dataset\.mediaId/);
  assert.match(source, /ledgerEntry\?\.source\s*===\s*"upload-dispatched"\)\s*return\s*""/);
  assert.match(source, /Date\.now\(\)\s*-\s*workflowCreatedAt\s*<\s*10\s*\*\s*60_000/);
  assert.match(source, /decodeURIComponent\(image\.src\)\.includes\(rawPrimaryMediaId\)/);
  assert.doesNotMatch(source, /if \(\/\^fe_id_\/i\.test\(domTileId\)\) return domTileId/);
});

test("fresh Flow relay parses only a standalone SDK result instead of the enclosing app body", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /querySelectorAll\("pre, code"\)/);
  assert.doesNotMatch(source, /querySelectorAll\("pre, code, textarea, body \*"\)/);
  assert.match(source, /typeof value\?\.base64 === "string"/);
});

test("fresh Flow relay preserves bounded provider failure detail", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /Fresh Flow Video Relay Bridge reported FAILED\$\{compact \? `: \$\{compact\}`/);
  assert.match(source, /slice\(0, 1200\)/);
  assert.match(source, /pre, code, textarea, \[role='status'\]/);
});

test("fresh Flow relay fallback dimensions honor portrait output", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /fallbackWidth\s*=\s*aspectRatio\s*===\s*"9:16"\s*\?\s*720\s*:\s*1280/);
  assert.match(source, /fallbackHeight\s*=\s*aspectRatio\s*===\s*"9:16"\s*\?\s*1280\s*:\s*720/);
});

test("fresh Flow relay can start a new job while the previous COMPLETED result remains visible", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /parsed\?\.jobId\s*===/);
  assert.match(source, /String\(media\.value\s*\|\|\s*""\)/);
  assert.match(source, /manifestMediaId\s*=\s*String\(parsed\?\.fe_id/);
  assert.match(source, /Boolean\(generate\s*&&\s*!generate\.disabled\)/);
  assert.doesNotMatch(source, /waitInner\("\/\\\\bREADY\\\\b\/i\.test\(document\.body\.innerText\)/);
});

test("fresh Flow relay preserves preflight-only as a non-generation terminal state", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /preflightOnly.*intentionally returns no media/);
  assert.match(source, /if \(!result\) return;/);
});

test("Flow keyframe preflight reads large PNG geometry without embedding it in CDP", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /function pngDimensions\(reference/);
  assert.match(source, /encoded\.length > 900_000/);
  assert.match(source, /validate it locally and reserve CDP/);
});

test("fresh Flow relay puts the resolved provider media identity into both manifest and input", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /const resolvedMediaId = await this\.resolveFreshRelayMediaId\(this\.job\.settings \|\| \{\}, keyframe\)/);
  assert.match(source, /this\.manifest\(keyframe, references, resolvedMediaId\)/);
  assert.match(source, /configureFreshRelay\(configured\.value, configured\.durationSeconds, keyframe, resolvedMediaId\)/);
  assert.match(source, /fe_id: String\(resolvedMediaId \|\| settings\.flowMediaId/);
  assert.match(source, /imageMediaId: String\(resolvedMediaId \|\| settings\.flowMediaId/);
});

test("Flow workspace resolver never promotes a filename-only workflow to media identity", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /const candidates = correlatedUploads\.length/);
  assert.match(source, /exactUploadWorkflows\.length === 1 \? exactUploadWorkflows/);
  assert.doesNotMatch(source, /matchingWorkflows\.length === 1 \? matchingWorkflows : \[\]/);
});

test("UI-direct Flow jobs bind an observed project workspace instead of the catalog", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(source, /UI-direct Flow jobs must target the signed-in project workspace/);
  assert.match(source, /job\.conversationUrl = url\.toString\(\)/);
  assert.match(source, /providerWorkspaceUrl: job\.conversationUrl/);
  assert.match(source, /No signed-in Google Flow project workspace was observed/);
});

test("Flow queue tolerates a briefly stale renderer extension count", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/workflow/src/orchestration/video-provider-actions.ts"), "utf8");
  assert.match(source, /provider\.platform === "google-flow" && Boolean\(getWorkflowBridge\(\)\)/);
});

test("UI-direct Flow dispatch uses the locked project tab without catalog fallback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  const open = source.match(/async function openProviderJob\([\s\S]*?\n}\n\nasync function handleRunFailure/)?.[0] || "";
  assert.match(open, /findExactFlowProjectTab\(job\.conversationUrl\)/);
  assert.match(open, /return dispatchToContentScript\(job\)/);
  assert.match(open, /Never\n\s*\/\/ fall back to the catalog/);
});

test("Flow tab discovery includes the canonical base project workspace route", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/index.ts"), "utf8");
  assert.ok(source.includes('"https://flow.google.com/project/*"'));
});

test("Flow native composer normalizes the short project route in-place", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-dom.ts"), "utf8");
  assert.ok(source.includes("const shortProject"));
  assert.ok(source.includes("Using the authenticated Flow short project route"));
});

test("Flow prompt surface accepts the tall ProseMirror composer", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-surface.ts"), "utf8");
  assert.ok(source.includes("proseMirrorComposerGeometryFits"));
  assert.ok(source.includes("element.classList.contains(\"ProseMirror\")"));
});

test("Flow Slate prompt insertion tries the main-world bridge after native input misses", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-prompt-editor.ts"), "utf8");
  const branch = source.match(/if \(editor\?\.getAttribute\("data-slate-editor"\) === "true"\)[\s\S]*?return slateInsertionFailure\(state\);/)?.[0] || "";
  assert.match(branch, /stagePromptTextViaBridge\(text, clearFirst, deps\)/);
  assert.match(branch, /promptTextMatches\(text, deps\)/);
});

test("Flow recovery diagnostics do not nest the same failure prefix", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(source, /const conciseError = originalError\.replace/);
  assert.match(source, /conciseError \|\| originalError/);
});

test("Flow pre-submit crash recovery never redispatches automatically", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/dispatch-runtime.ts"), "utf8");
  const branch = source.match(/async function reloadAndRedispatchFlowJob[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(branch, /pre-submit Flow crash/);
  assert.match(branch, /deliberate user retry/);
  assert.match(branch, /return false/);
  assert.doesNotMatch(branch, /dispatchToContentScript\(job\)/);
});

test("Flow content setup crash fails closed without page reload", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  const branch = source.match(/async function recoverFlowPageIfCrashed[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(branch, /Flow setup stopped before submit/);
  assert.match(branch, /deliberate user retry/);
  assert.doesNotMatch(branch, /location\.reload\(\)/);
});

test("Flow Slate bridge never synthesizes DOM nodes outside the Slate model", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/slate-bridge.ts"), "utf8");
  assert.doesNotMatch(source, /forceVisibleEditor(?:Clear|Text)/);
  assert.doesNotMatch(source, /editorNode\.replaceChildren\(/);
  assert.doesNotMatch(source, /editorNode\.textContent\s*=/);
});

test("Flow prompt editor skips DOM fallback for Slate-controlled editors", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-prompt-editor.ts"), "utf8");
  assert.match(source, /editor\.getAttribute\("data-slate-editor"\) === "true"/);
  assert.match(source, /if \(editor\.getAttribute\("data-slate-editor"\) === "true"\) return false;/);
});

test("Flow picker accepts large uploaded image thumbnails within picker bounds", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-media-picker-options.ts"), "utf8");
  assert.match(source, /largePickerImage/);
  assert.match(source, /pickerRect\.height \* 0\.9/);
  assert.match(source, /element instanceof HTMLImageElement \? element : element\.querySelector\("img"\)/);
});

test("Studio Shot Bridge hydrates durable local media paths only in memory", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /hydrateFlowReferences\(this\.job\.references\)/);
  assert.match(source, /never write it back to[\s\S]*studio-state\.json/);
  assert.match(source, /127\.0\.0\.1:3768\/media/);
  assert.match(source, /base64: `data:\$\{mimeType\};base64,/);
});

test("Studio Shot Bridge falls back after one unavailable desktop evaluator", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /desktopFlowEvaluateUnavailable/);
  assert.match(source, /this\.desktopFlowEvaluateUnavailable = true/);
  assert.match(source, /8_000/);
});

test("Studio Shot Bridge discovery tolerates a body-text hydration race", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /document\.querySelector\("#root"\)\?\.innerText/);
  assert.match(source, /document\.documentElement\?\.innerText/);
  assert.match(source, /flowApp/);
  assert.match(source, /bridgeShell && \(controls \|\|/);
  assert.match(source, /isFreshRelayRuntime\(this\.trustedRuntimeUrl\)/);
  assert.match(source, /freshly reloaded published Relay/);
  assert.match(source, /Chrome DevTools debugger attach timed out/);
  assert.match(source, /Prefer a hydrated Relay target when several srcdoc frames coexist/);
});

test("Studio Shot Bridge reuses a live sandbox before reloading Flow", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /Reuse an already hydrated Studio Shot Bridge before reloading Flow/);
  assert.match(source, /await this\.discoverChildSandbox\(String\(existingRootFrame/);
  assert.match(source, /catch \{\n      this\.innerSessionId = ""/);
});

test("Flow SDK relay accepts host-window MessageEvent sources from srcdoc tools", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /srcdoc\/custom-tool bridge can report the host WindowProxy/);
  assert.doesNotMatch(source, /event\.source === window \|\| event\.data\?\.type !== "FLOW_SELECT_MEDIA"/);
});

test("Flow custom-tool dispatch preserves a separate base workspace tab", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(source, /Never repurpose a custom-tool tab as the workspace/);
  assert.match(source, /const activeRuntimeUrl = isFlowCustomToolUrl\(flow\.activeFlowTab\?\.url\)/);
  assert.match(source, /explicit workspace route\n\s*\/\/ is authoritative/);
  assert.match(source, /flow\.tab\?\.url \|\| flow\.activeFlowTab\?\.url/);
  assert.match(source, /chrome\.tabs\.create\(\{ url: baseUrl, active: false \}\)/);
  assert.match(source, /isFlowCustomToolUrl\(flow\.tab\.url\)/);
});

test("Flow image-to-video defaults to exact start-frame mode while preserving explicit component mode", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(source, /flowVideoMode: message\.settings\?\.flowVideoMode \|\| "frames"/);
  assert.match(source, /sourceMode: message\.settings\?\.sourceMode \|\| "frames"/);
  assert.match(source, /selected image is the exact opening frame/);
});

test("Flow composer honors frames mode without a legacy workflow flag", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-settings.ts"), "utf8");
  assert.doesNotMatch(source, /if \(!explicitFrameWorkflow\) return "components"/);
  assert.match(source, /if \(\/frame\|khung\/i\.test\(requested\)\) return "frames"/);
});

test("Flow submit uses only trusted native coordinates and fails closed", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  const submit = source.indexOf("async function clickFlowSubmitButton");
  const native = source.indexOf("requestNativeMouseClick(center.clientX", submit);
  const submitBlock = source.match(/async function clickFlowSubmitButton[\s\S]*?\n}\n/)?.[0] || "";
  assert.ok(submit >= 0 && native > submit);
  assert.doesNotMatch(submitBlock, /bridgeCall\("submit"/);
  assert.match(source, /Never issue a second synthetic\/React click/);
  assert.match(source, /Trusted Flow submit click failed/);
  assert.match(source, /type FlowSubmitAttempt/);
  assert.match(source, /provider acceptance remains unconfirmed until a new generation tile appears/);
  assert.match(source, /method=\$\{submitAttempt\.method/);
  assert.match(source, /startFrames=\$\{submitAttempt\.startFrameCount\}/);
});

test("Flow V2 skips the incompatible Toby Slate submit bridge", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /!document\.querySelector\("\.ProseMirror"\) && await requestTobyFlowSubmit\(\)/);
});

test("Flow submit ignores controls disabled through ARIA", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  const finder = source.match(/function findFlowSubmitButton\(\)[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(finder, /button\.getAttribute\("aria-disabled"\) === "true"/);
  assert.match(finder, /button\.disabled/);
});

test("Flow custom-tool jobs persist the exact project workspace", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(source, /provider catalog URL \(`\/tools\/flow`\)/);
  assert.match(source, /job\.settings = \{ \.\.\.\(job\.settings \|\| \{\}\), providerWorkspaceUrl: exactWorkspaceUrl \}/);
  assert.match(source, /job\.conversationUrl = exactWorkspaceUrl/);
});

test("Flow composer route fallback receives the project-composer dependency alias", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /openNewFlowProjectComposer: openFlowComposerFromProjectGrid/);
});

test("Flow fresh-project route fallback uses the native click path", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /await clickElementNative\(newProjectButton\)/);
});

test("Flow custom-tool readiness requires one base workspace and one runtime", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/renderer/src/studio-application-composition.ts"), "utf8");
  assert.match(source, /export function flowConnectionSummary\(bridgeStatus: any\)/);
  assert.match(source, /const flowProjectTabCount = count\("googleFlowProjectTabs"\)/);
  assert.match(source, /const flowCustomToolTabCount = count\("googleFlowCustomToolTabs"\)/);
  assert.match(source, /const flowRuntimeToolTabCount = count\("googleFlowRuntimeToolTabs"\)/);
  assert.match(source, /const flowEditorToolTabCount = count\("googleFlowEditorToolTabs"\)/);
  assert.match(source, /flowWorkspaceTabCount > 0/);
  assert.match(source, /flowWorkspaceTabCount === 1/);
  assert.match(source, /flowCustomToolTabCount === 1/);
  assert.match(source, /flowRuntimeToolTabCount === 1/);
});

test("Flow workspace relay probes the base adapter before sending a reference", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/runtime-messages.ts"), "utf8");
  assert.match(source, /PING_STUDIO_ADAPTER/);
  assert.match(source, /chrome\.tabs\.reload\(base\.id/);
  assert.match(source, /const sendReference = \(\) => chrome\.tabs\.sendMessage\(base\.id!, \{ action: "RESOLVE_FLOW_REFERENCE"/);
  assert.match(source, /preferDirectUpload: true/);
  const content = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(content, /selection\.preferDirectUpload \|\| isStudioRuntimeTool/);
});

test("Flow tool attach does not block iframe discovery on SPA loading state", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /waitForTabComplete\(this\.tabId, 20_000\)/);
  assert.match(source, /tiếp tục kiểm tra iframe Studio Shot Bridge/);
});

test("Flow overlay close retries native activation when a clipped profile panel ignores synthetic input", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-dom-controls.ts"), "utf8");
  assert.match(source, /if \(overlay\.isConnected && isVisible\(overlay\)\)/);
  assert.match(source, /closeButton\.click\(\)/);
});

test("Flow account-gate probe does not reopen the profile panel after a negative probe", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  const probe = source.match(/async function checkVisibleFlowAccountGate[\s\S]*?\n}\n/)?.[0] || "";
  assert.doesNotMatch(probe, /if \(!openedGate && accountTarget\)/);
  assert.match(probe, /await closeTransientFlowOverlays\(jobId\)/);
});

test("Flow picker may trust one explicitly selected exact filename when virtualization hides geometry", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /selectedExactOption\.length === 1/);
  assert.match(source, /candidate\.getAttribute\("aria-selected"\) === "true"/);
  assert.match(source, /querySelectorAll<HTMLElement>\('\[role="option"\]'\)/);
  const picker = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts"), "utf8");
  assert.match(picker, /selectedPickerTargetMatchesReference/);
  assert.match(picker, /!selectedPickerTargetMatchesReference\(reference, target\)/);
  assert.match(picker, /aria-selected=true` can mean the row is/);
  assert.match(picker, /confirming it with one native selection/);
  assert.match(picker, /already selected with a ready add-to-prompt action/);
  assert.match(picker, /waitForAddToPromptMenuItem\(500, selectedPicker\)/);
});

test("Flow late progress cannot regress a terminal manual/error result", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /const flowTerminalJobIds = new Set<string>\(\)/);
  assert.match(source, /if \(flowTerminalJobIds\.has\(jobId\)\) return;/);
  assert.match(source, /flowTerminalJobIds\.delete\(payload\.jobId\)/);
});

test("Flow Slate native insertion always restores the browser-native editor focus", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-prompt-editor.ts"), "utf8");
  assert.match(source, /text, focusOnly: false/);
  assert.match(source, /DOM focus is not sufficient for CDP Input\.insertText/);
});

test("native Flow CDP sessions serialize per tab", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/native-input.ts"), "utf8");
  assert.match(source, /const debuggerSessionTails = new Map<number, Promise<void>>\(\)/);
  assert.match(source, /async function withDebuggerSession/);
  assert.match(source, /withDebuggerSession\(tabId, async \(\) =>/);
  assert.match(source, /dispatchDebuggerClick\(tabId, x, y, expectedText, confirmIfUnchanged\)/);
  assert.match(source, /Page\.setInterceptFileChooserDialog/);
});

test("Flow picker exact hydration stays bounded before selected-row fallback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts"), "utf8");
  assert.match(source, /waitForExactReferenceOptionInPicker\(reference, picker, 8000\)/);
  assert.match(source, /selected-row fallback/);
  assert.doesNotMatch(source, /waitForExactReferenceOptionInPicker\(reference, picker, 120000\)/);
});

test("Flow frame picker has a narrow main-world fallback for div-type frame slots", () => {
  const actions = fs.readFileSync(path.resolve(__dirname, "../background/flow-main-world-actions.ts"), "utf8");
  const picker = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts"), "utf8");
  assert.match(actions, /open-start-frame-picker/);
  assert.match(actions, /\[type='button'\]\[aria-haspopup='dialog'\]/);
  assert.match(actions, /\^\(\?:bắt đầu\|start\)\$/i);
  assert.match(picker, /runFlowMainWorldAction\("open-start-frame-picker"\)/);
  assert.match(picker, /bounded click fallback/);
});

test("Flow picker recognizes Angular CDK image-frame overlays", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-dom-controls.ts"), "utf8");
  assert.match(source, /\.cdk-overlay-pane/);
  assert.match(source, /chọn một hình ảnh khung/);
});

test("Flow frame attachment detector accepts the thumbnail cancel card below the old viewport cutoff", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-frame-dom.ts"), "utf8");
  assert.match(source, /const hasFrameMedia = Boolean\(element\.querySelector\("img, video, canvas"\)\)/);
  assert.match(source, /rect\.top < window\.innerHeight \* 0\.9/);
  assert.match(source, /\(isRemoveLabel \|\| hasFrameMedia\)/);
});

test("Flow frame picker waits for an enabled add action after row selection", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts"), "utf8");
  assert.match(source, /Re-resolve the live dialog on every bounded observation/);
  assert.match(source, /item\.getAttribute\("aria-disabled"\) !== "true"/);
  assert.match(source, /item instanceof HTMLButtonElement && item\.disabled/);
  assert.match(source, /const addStartedAt = Date\.now\(\)/);
});

test("Flow settings close explicitly dismisses the compact composer menu", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-dom.ts"), "utf8");
  assert.match(source, /button\.getAttribute\("aria-expanded"\) === "true"/);
  assert.match(source, /const composerMenu = getComposerSettingsMenu\(\)/);
  assert.match(source, /clickElementNative\(trigger\)/);
  assert.match(source, /trigger\.click\(\)/);
  assert.match(source, /clickElementNative\(editor\)/);
  assert.match(source, /if \(getComposerSettingsMenu\(\)\)/);
});

test("Flow composer recovery recognizes the live Agent shell and localized prompt clear control", () => {
  const composer = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-dom.ts"), "utf8");
  const references = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-reference-helpers.ts"), "utf8");
  const content = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(composer, /hướng dẫn cho tác nhân\|agent instructions/);
  assert.match(composer, /const agentShellVisible = isFlowAgentShellVisible\(\)/);
  assert.match(composer, /clickElementNative\(agentButton\)/);
  assert.match(references, /x\(\?:oá\|óa\|oa\) câu lệnh/);
  assert.match(content, /await ensureFlowAgentModeOff\(context\.jobId\)/);
  assert.match(content, /await clearPersistedFlowPrompt\(context\.jobId\)/);
  assert.match(content, /150_000/);
});

test("Flow prompt targeting excludes oversized recommendation-card Slate editors", () => {
  const surface = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-surface.ts"), "utf8");
  assert.match(surface, /function promptEditorGeometryFits/);
  assert.match(surface, /rect\.height <= Math\.min\(720, window\.innerHeight \* 0\.75\)/);
  assert.match(surface, /rect\.top > window\.innerHeight \* 0\.45/);
  assert.match(surface, /promptEditorGeometryFits\(element\.getBoundingClientRect\(\)\)/);
});

test("Flow workspace closes the Tool Builder drawer before touching the project composer", () => {
  const content = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(content, /await closeFlowToolBuilderDrawerIfOpen\(jobId\)/);
  assert.match(content, /trình tạo công cụ\|tool builder/);
  assert.match(content, /Closing the Flow Tool Builder drawer/);
});

test("native Flow text insertion re-resolves a stale editor hit point", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/native-input.ts"), "utf8");
  assert.match(source, /document\.elementFromPoint\(point\.x, point\.y\)/);
  assert.match(source, /data-slate-editor/);
  assert.match(source, /const inputX = Number\(point\?\.x/);
});

test("Flow picker prefers semantic selection before asset-viewer navigation", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts"), "utf8");
  const highlighted = source.indexOf('if (target.getAttribute("aria-selected") === "true")');
  const semantic = source.indexOf('runFlowMainWorldAction("select-reference"', highlighted);
  const native = source.indexOf('clickElementStrictNative(target)', highlighted);
  assert.ok(highlighted >= 0 && semantic > highlighted && semantic < native);
});

test("Flow semantic picker selection matches filename identity across option text and data attributes", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/flow-main-world-actions.ts"), "utf8");
  assert.match(source, /data-filename/);
  assert.match(source, /data-name/);
  assert.match(source, /requestedIdentity\.length >= 6/);
  assert.match(source, /candidate\.identity\.includes\(requestedIdentity\)/);
});

test("Flow menu close can run in the page main world", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/flow-main-world-actions.ts"), "utf8");
  assert.match(source, /close-settings-menu/);
  assert.match(source, /aria-expanded='true'/);
  assert.match(source, /trigger\.getAttribute\("aria-expanded"\) !== "true"/);
});

test("Flow settings-panel close is bounded before provider submission", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-composer-dom.ts"), "utf8");
  assert.match(source, /closeFlowSettingsPanelIfOpenUnbounded/);
  assert.match(source, /Promise\.race\(\[/);
  assert.match(source, /setTimeout\(resolve, 8_000\)/);
  assert.match(source, /without creating a hidden retry loop/);
});

test("Flow picker tries the toolbar media entrypoint after stale compact add buttons", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts"), "utf8");
  const start = source.indexOf("async function openFlowMediaPicker");
  const end = source.indexOf("async function openFlowMediaPickerFromButton", start);
  const section = source.slice(start, end);
  assert.match(section, /Always try the explicit toolbar control/);
  assert.match(section, /const mediaButton = Array\.from/);
  assert.match(section, /tải nội dung nghe nhìn lên/i);
  assert.ok(section.indexOf("const mediaButton") > section.indexOf("for (const button of orderedButtons"));
});

test("Flow picker falls back to a direct image file input only when the ledger is clear", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /direct image file input/);
  assert.match(source, /!knownPresent && directImageInput/);
  assert.match(source, /waitForFileInput\(jobId, 1_500, document\)/);
});

test("Flow prompt staging closes the main-world menu immediately before editor focus", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  const stage = source.indexOf("async function stageFlowJobPrompt");
  const close = source.indexOf('runFlowMainWorldAction("close-settings-menu")', stage);
  const wait = source.indexOf("waitForFlowPromptEditor", stage);
  assert.ok(stage >= 0 && close > stage && close < wait);
});

test("Flow validation closes menus reopened by component attachment", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  const validate = source.indexOf("async function validateFlowBeforeSubmit");
  const close = source.indexOf("closeFlowSettingsPanelIfOpen(jobId)", validate);
  const action = source.indexOf('runFlowMainWorldAction("close-settings-menu")', validate);
  const prompt = source.indexOf("validateFlowPromptAndReference", validate);
  assert.ok(validate >= 0 && close > validate && action > close && action < prompt);
});

test("Flow re-syncs the prompt model after component attachment without dropping media", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /async function syncPromptModelWithoutClearingMedia/);
  assert.match(source, /Syncing Flow prompt model after source attach without clearing media/);
  assert.match(source, /syncPromptModelWithoutClearingMedia\(jobId, payload\.prompt\)/);
});

test("Flow custom-tool attach restores the runtime route after a workspace fallback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /restore the exact runtime route/);
  assert.match(source, /chrome\.tabs\.update\(this\.tabId, \{ url: runtimeUrl \}\)/);
  assert.doesNotMatch(source, /chrome\.tabs\.update\(this\.tabId, \{ url: runtimeUrl, active: true \}\)/);
});

test("Flow custom-tool rejects an unpublished draft route before waiting for the picker", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /đang mở ở bản DRAFT \/tool\//i);
  assert.match(source, /mở bản runtime \/tool-version\/ đã publish/i);
  assert.match(source, /chrome\.debugger\.attach\(this\.debugTarget, "1\.3"\)/);
});

test("Flow draft-route failures are classified as unavailable before recovery", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/dispatch-runtime.ts"), "utf8");
  assert.match(source, /DRAFT/);
  assert.match(source, /unpublished draft route/i);
  const coordinator = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(coordinator, /Never bind a job to Flow's editable `\/tool\/` draft/);
  assert.match(coordinator, /tool-version/);
});

test("Flow custom-tool revalidates frame and document epoch before authorization", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/adapters/google-flow-custom-tool.ts"), "utf8");
  assert.match(source, /private async rootDocumentIdentity/);
  assert.match(source, /loaderId\?: string/);
  assert.match(source, /expectedDocumentEpoch: this\.trustedDocumentEpoch/);
  assert.match(source, /currentDocumentEpoch: currentDocument\.documentEpoch/);
  assert.match(source, /expectedFrameId: this\.trustedFrameId/);
  assert.match(source, /currentFrameId: currentDocument\.frameId/);
  assert.match(source, /private async captureTrustedDocumentIdentity/);
});

test("Flow custom-tool revalidates the published route and project immediately before submit", async () => {
  const { validateFlowSubmitContext } = await import("../../../../packages/extension-providers/src/google-flow/flow-workspace.ts");
  const runtime = "https://labs.google/fx/vi/tools/flow/project/p1/tool-version/v75";
  const workspace = "https://labs.google/fx/vi/tools/flow/project/p1";
  assert.deepEqual(validateFlowSubmitContext({ expectedRuntimeUrl: runtime, currentUrl: `${runtime}?tab=active`, expectedWorkspaceUrl: workspace }), { ok: true });
  assert.deepEqual(validateFlowSubmitContext({ expectedRuntimeUrl: runtime, currentUrl: "https://labs.google/fx/vi/tools/flow/project/p2/tool-version/v75", expectedWorkspaceUrl: workspace }), { ok: false, code: "runtime_route_changed" });
  assert.deepEqual(validateFlowSubmitContext({ expectedRuntimeUrl: runtime, currentUrl: "https://labs.google/fx/vi/tools/flow/project/p1/tool/v75", expectedWorkspaceUrl: workspace }), { ok: false, code: "runtime_route_not_published" });
  assert.deepEqual(validateFlowSubmitContext({ expectedRuntimeUrl: runtime, currentUrl: runtime, expectedWorkspaceUrl: "https://labs.google/fx/vi/tools/flow/project/p2" }), { ok: false, code: "provider_project_changed" });
});

test("Flow pre-submit identity rejects same-route reloads and account drift", async () => {
  const { validateFlowSubmitContext } = await import("../../../../packages/extension-providers/src/google-flow/flow-workspace.ts");
  const runtime = "https://labs.google/fx/vi/tools/flow/project/p1/tool-version/v75";
  const stable = {
    expectedRuntimeUrl: runtime,
    currentUrl: runtime,
    expectedWorkspaceUrl: "https://labs.google/fx/vi/tools/flow/project/p1",
    expectedFrameId: "frame-a",
    currentFrameId: "frame-a",
    expectedDocumentEpoch: "loader-a",
    currentDocumentEpoch: "loader-a"
  };
  assert.deepEqual(validateFlowSubmitContext(stable), { ok: true });
  assert.deepEqual(validateFlowSubmitContext({ ...stable, currentDocumentEpoch: "loader-b" }), { ok: false, code: "document_epoch_changed" });
  assert.deepEqual(validateFlowSubmitContext({ ...stable, currentFrameId: "frame-b" }), { ok: false, code: "frame_changed" });
  assert.deepEqual(validateFlowSubmitContext({ ...stable, expectedAccountHint: "account-a", currentAccountHint: "account-b" }), { ok: false, code: "account_changed" });
  assert.deepEqual(validateFlowSubmitContext({ ...stable, expectedAccountHint: "account-a", currentAccountHint: "" }), { ok: false, code: "account_hint_missing" });
});

test("Flow runtime media relay falls back to strict local resolution", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /direct runtime reference resolution also failed/);
  assert.match(source, /resolveFlowSdkReference\(selection\)/);
});

test("Flow media relay prefers provider media identity over edit tile identity", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /data-media-id/);
  assert.match(source, /if \(\/\^fe_id_\/i\.test\(explicit\)\) return explicit/);
  assert.match(source, /if \(\/\^fe_id_\/i\.test\(direct\)\) return direct/);
  assert.match(source, /const direct = tile\.dataset\.tileId \|\| tile\.getAttribute\("data-tile-id"\)/);
  assert.match(source, /searchParams\.get\("name"\)/);
  assert.match(source, /Successful Flow results identify media with `fe_id_\*`/);
});

test("Flow workspace media relay has a bounded fallback timeout", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /Flow workspace reference relay timed out after 45 seconds/);
  assert.match(source, /Promise\.race\(\[/);
});

test("Flow media relay fans response out to reachable non-reCAPTCHA frames", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../packages/extension-providers/src/google-flow/content.ts"), "utf8");
  assert.match(source, /const targets = new Set<Window>\(\)/);
  assert.match(source, /if \(\/recaptcha\/i\.test\(frame\.src/);
  assert.match(source, /const postResponse = \(payload: Record<string, unknown>\)/);
});

test("Flow custom-tool opening has a bounded runtime-load wait", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../background/job-coordinator.ts"), "utf8");
  assert.match(source, /waitForTabComplete\(reusable\.id, 20_000\)/);
  assert.match(source, /did not finish loading within 20 seconds/);
  assert.match(source, /savedRuntimeUrl = job\.flowRuntimeUrl/);
  assert.match(source, /Never navigate the user's\n    \/\/ workspace to that catalog URL/);
});

test("Flow diagnostics classify page state from observed provider text", async () => {
  const { flowPageErrorText, flowDebugSnapshot } = await import("../../../../packages/extension-providers/src/google-flow/flow-diagnostics.ts");
  const crash = (value) => /crash/i.test(value) ? "crashed" : null;
  assert.equal(flowPageErrorText({ href: "https://labs.google/flow", title: "", bodyText: "client crash", crash, chrome: () => null, auth: () => null }), "crashed");
  assert.match(flowDebugSnapshot({ pageError: null, pathname: "/flow", title: "Flow", promptInfo: "none", buttons: ["Generate"], panels: [], fileInputs: [] }), /buttons=\[Generate\]/);
});

test("ChatGPT wait policy assigns bounded tiers deterministically", async () => {
  const { resolveTextWaitPolicy } = await import("../../../../packages/extension-providers/src/chatgpt/text-wait-policy.ts");
  assert.equal(resolveTextWaitPolicy("story_foundation", 100).tier, "instant");
  assert.equal(resolveTextWaitPolicy("story_foundation", 100).hardWaitMs, 120000);
  assert.equal(resolveTextWaitPolicy("story_foundation", 100).inactiveWaitMs, 60000);
  assert.equal(resolveTextWaitPolicy("unknown", 20000).tier, "high");
  assert.ok(resolveTextWaitPolicy("unknown", 20000).hardWaitMs >= 1200000);
});

test("Flow media policy never treats an image-only tile as a completed video", async () => {
  const { createFlowResultMedia } = await import("../../../../packages/extension-providers/src/google-flow/flow-result-policy.ts");
  const image = { tagName: "IMG", src: "https://flow.test/frame.png", getAttribute: () => null };
  const tile = {
    innerText: "play",
    querySelector: () => null,
    querySelectorAll: () => [],
    dataset: { tileId: "tile-1" }
  };
  const policy = createFlowResultMedia({
    mediaElementsIn: () => [image],
    flowTileLinks: () => ["https://labs.google/fx/tools/flow/edit/edit-1"],
    visibleText: (element) => element.innerText || ""
  });
  assert.equal(policy.flowTileHasVideoMedia(tile), false);
  assert.equal(policy.flowTileIsImageOnlyResult(tile), true);
  assert.match(policy.flowImageOnlyVideoError(1), /image-only/);
});

test("Flow media policy recognizes a video source and a recoverable result tile", async () => {
  const { createFlowResultMedia } = await import("../../../../packages/extension-providers/src/google-flow/flow-result-policy.ts");
  const video = { tagName: "VIDEO", currentSrc: "https://flow.test/result.mp4", getAttribute: () => null };
  const tile = { innerText: "play", querySelector: () => null, dataset: { tileId: "tile-2" } };
  const policy = createFlowResultMedia({ mediaElementsIn: () => [video], flowTileLinks: () => [], visibleText: (element) => element.innerText || "" });
  assert.equal(policy.flowTileHasVideoMedia(tile), true);
  assert.equal(policy.flowTileIsImageOnlyResult(tile), false);
  assert.equal(policy.flowTileMayRevealMedia(tile), true);
});
