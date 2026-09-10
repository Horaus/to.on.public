//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region src/background/adapters/base.cjs
var require_base = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function hostnameMatches(urlValue, predicate) {
		if (!urlValue) return false;
		try {
			return predicate(new URL(urlValue));
		} catch {
			return false;
		}
	}
	function createProviderDescriptor(config, normalizeProvider) {
		return {
			...config,
			canHandle: (job) => normalizeProvider(job.provider) === config.provider
		};
	}
	module.exports = {
		createProviderDescriptor,
		hostnameMatches
	};
}));
//#endregion
//#region ../../packages/domain/src/conversation-url.cjs
var require_conversation_url = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function isSavedChatGptConversationUrl(value) {
		if (typeof value !== "string") return false;
		try {
			const url = new URL(value);
			return url.origin === "https://chatgpt.com" && /^\/c\/(?!WEB:)[^/]+\/?$/i.test(url.pathname);
		} catch {
			return false;
		}
	}
	module.exports = { isSavedChatGptConversationUrl };
}));
//#endregion
//#region src/background/adapters/chatgpt.cjs
var require_chatgpt = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { hostnameMatches } = require_base();
	module.exports = {
		provider: "chatgpt",
		targetUrl: "https://chatgpt.com/",
		contentScript: "content/chatgpt.js",
		matchesTab: (value) => hostnameMatches(value, (url) => ["chatgpt.com", "chat.openai.com"].includes(url.hostname))
	};
}));
//#endregion
//#region src/background/adapters/google-flow.cjs
var require_google_flow = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { hostnameMatches } = require_base();
	module.exports = {
		provider: "google-flow",
		targetUrl: "https://labs.google/fx/vi/tools/flow",
		contentScript: "content/google-flow.js",
		mainWorldScript: "content/flow-slate-bridge.js",
		matchesTab: (value) => hostnameMatches(value, (url) => [
			"labs.google",
			"labs.google.com",
			"flow.google.com"
		].includes(url.hostname))
	};
}));
//#endregion
//#region src/background/adapters/elevenlabs-flows.cjs
var require_elevenlabs_flows = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { hostnameMatches } = require_base();
	module.exports = {
		provider: "elevenlabs-flows",
		targetUrl: "https://elevenlabs.io/app/flows/",
		contentScript: "content/elevenlabs-flows.js",
		matchesTab: (value) => hostnameMatches(value, (url) => url.hostname === "elevenlabs.io" && url.pathname.startsWith("/app/flows/"))
	};
}));
//#endregion
//#region src/background/adapters/grok.cjs
var require_grok = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { hostnameMatches } = require_base();
	module.exports = {
		provider: "grok",
		targetUrl: "https://grok.com/imagine",
		contentScript: "content/grok.js",
		matchesTab: (value) => hostnameMatches(value, (url) => url.hostname === "grok.com" || url.hostname === "x.com" && url.pathname.startsWith("/i/grok"))
	};
}));
//#endregion
//#region src/background/adapters/freepik.cjs
var require_freepik = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { hostnameMatches } = require_base();
	module.exports = {
		provider: "freepik",
		targetUrl: "https://www.freepik.com/pikaso/ai-image-generator",
		matchesTab: (value) => hostnameMatches(value, (url) => url.hostname.endsWith("freepik.com"))
	};
}));
//#endregion
//#region src/background/adapters/registry.ts
var import_registry = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	function normalizeProvider(provider) {
		if (provider === "flow" || provider === "google-flow-web") return "google-flow";
		if (provider === "grok-web") return "grok";
		if (provider === "chatgpt-web") return "chatgpt";
		if (provider === "elevenlabs-flows-web" || provider === "elevenlabs-flow") return "elevenlabs-flows";
		return provider;
	}
	var { createProviderDescriptor } = require_base();
	var { isSavedChatGptConversationUrl } = require_conversation_url();
	var providerAdapters = [
		require_chatgpt(),
		require_google_flow(),
		require_elevenlabs_flows(),
		require_grok(),
		require_freepik()
	].map((descriptor) => createProviderDescriptor(descriptor, normalizeProvider));
	function providerAdapter(provider) {
		const normalized = normalizeProvider(provider);
		return providerAdapters.find((candidate) => candidate.provider === normalized);
	}
	module.exports = {
		isSavedChatGptConversationUrl,
		normalizeProvider,
		providerAdapter,
		providerAdapters
	};
})))(), 1);
var providerAdapters = import_registry.default.providerAdapters;
var normalizeProvider$2 = import_registry.default.normalizeProvider;
var providerAdapter$3 = import_registry.default.providerAdapter;
var isSavedChatGptConversationUrl$2 = import_registry.default.isSavedChatGptConversationUrl;
var planProviderAdmission$1 = (/* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	function planProviderAdmission(job, activeJobs, hasAdapter) {
		const duplicate = activeJobs.find((candidate) => candidate.jobId === job.jobId);
		if (duplicate) return {
			action: "duplicate",
			activeJobId: duplicate.jobId
		};
		if (!hasAdapter) return { action: "reject_unknown" };
		if (job.provider === "chatgpt") {
			const conflicting = activeJobs.find((candidate) => candidate.provider === "chatgpt" && candidate.jobId !== job.jobId);
			if (conflicting) return {
				action: "reject_serial",
				activeJobId: conflicting.jobId
			};
		}
		return { action: "accept" };
	}
	module.exports = { planProviderAdmission };
})))(), 1)).default.planProviderAdmission;
//#endregion
//#region src/background/session-store.ts
var ACTIVE_JOB_SNAPSHOT_PREFIX = "studio.activeJob.v1.";
function createChatGptSessionStore(activeJobs) {
	const snapshotKey = (jobId) => `${ACTIVE_JOB_SNAPSHOT_PREFIX}${jobId}`;
	return {
		async persist(job) {
			if (job.provider !== "chatgpt") return;
			const references = (job.references || []).map(({ base64: _base64, ...reference }) => reference);
			const snapshot = {
				jobId: job.jobId,
				provider: job.provider,
				task: job.task,
				prompt: job.prompt,
				conversationUrl: job.conversationUrl,
				references,
				settings: { ...job.settings || {} },
				download: {
					auto: false,
					filenameTemplate: job.download.filenameTemplate || "recovered-response"
				},
				tabId: job.tabId,
				lastStatus: job.lastStatus,
				lastStatusMessage: job.lastStatusMessage,
				lastProgress: job.lastProgress,
				lastActivityAt: job.lastActivityAt,
				chatGptTextRecoveryActive: job.chatGptTextRecoveryActive
			};
			await chrome.storage.session.set({ [snapshotKey(job.jobId)]: snapshot });
		},
		async restore(jobId) {
			const key = snapshotKey(jobId);
			const snapshot = (await chrome.storage.session.get(key))[key];
			if (!snapshot?.jobId || snapshot.provider !== "chatgpt") return void 0;
			activeJobs.set(jobId, snapshot);
			return snapshot;
		},
		forget(jobId) {
			chrome.storage.session.remove(snapshotKey(jobId));
		}
	};
}
function createChatGptBrowserState(rateLimitKey, tabKey, matchesTab) {
	let inMemoryRateLimit = 0;
	return {
		async rateLimitedUntil() {
			const stored = await chrome.storage.local.get(rateLimitKey);
			inMemoryRateLimit = Math.max(inMemoryRateLimit, Number(stored[rateLimitKey] || 0));
			return inMemoryRateLimit;
		},
		async persistRateLimit(until) {
			inMemoryRateLimit = Math.max(inMemoryRateLimit, until);
			await chrome.storage.local.set({ [rateLimitKey]: inMemoryRateLimit });
		},
		currentRateLimit: () => inMemoryRateLimit,
		async rememberTab(tabId) {
			await chrome.storage.session.set({ [tabKey]: tabId });
		},
		async rememberedTab() {
			const stored = await chrome.storage.session.get(tabKey);
			const tabId = Number(stored[tabKey] || 0);
			if (!tabId) return void 0;
			const tab = await chrome.tabs.get(tabId).catch(() => void 0);
			if (tab?.id && matchesTab(tab)) return tab;
			await chrome.storage.session.remove(tabKey);
		}
	};
}
//#endregion
//#region src/background/flow-main-world-actions.ts
async function flowActionMainWorld(requestedAction, requestedValue) {
	const visible = (element) => {
		const rect = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return element instanceof HTMLElement && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
	};
	const text = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();
	const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
	const identity = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
	if (requestedAction === "clear-prompt" || requestedAction === "set-prompt") {
		const editor = visibleElements(".ProseMirror[contenteditable='true'], [contenteditable='true'][role='textbox']")[0];
		const value = requestedValue.trim();
		if (!editor || requestedAction === "set-prompt" && !value) return false;
		editor.focus();
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(editor);
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.execCommand("delete", false);
		await new Promise((resolve) => setTimeout(resolve, 100));
		const remaining = editor.cloneNode(true);
		remaining.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
		if ((remaining.innerText || remaining.textContent || "").trim()) {
			editor.focus();
			document.execCommand("selectAll", false);
			document.execCommand("delete", false);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		selection?.removeAllRanges();
		if (requestedAction === "clear-prompt") return true;
		await new Promise((resolve) => setTimeout(resolve, 100));
		editor.focus();
		const end = document.createRange();
		end.selectNodeContents(editor);
		end.collapse(false);
		selection?.addRange(end);
		document.execCommand("insertText", false, value);
		selection?.removeAllRanges();
		const insertedProbe = editor.cloneNode(true);
		insertedProbe.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
		const normalizedEditorText = (insertedProbe.innerText || insertedProbe.textContent || "").replace(/\s+/g, " ").trim();
		const normalizedValue = value.replace(/\s+/g, " ").trim();
		return normalizedEditorText.includes(normalizedValue);
	}
	if (requestedAction === "close-settings-menu") {
		const trigger = visibleElements("button[aria-haspopup='menu'][aria-expanded='true']").find((element) => /video|hình ảnh|image|nano|veo|\d+\s*s/i.test(text(element)));
		if (!trigger) return false;
		trigger.click();
		return trigger.getAttribute("aria-expanded") !== "true" && !document.querySelector("[role='menu'][data-state='open']");
	}
	const spec = {
		"open-component-picker": {
			selector: "button[aria-haspopup='dialog']",
			pattern: /add_2|\+|^add$/i
		},
		"open-start-frame-picker": {
			selector: "[type='button'][aria-haspopup='dialog'], button.empty-chip, [role='button'].empty-chip",
			pattern: /^(?:bắt đầu|start)$/i
		},
		"submit": {
			selector: "button[type='submit'].generate-icon-button, button[aria-label='Bắt đầu tạo'], button[aria-label='Generate']",
			pattern: /arrow_forward|bắt đầu tạo|generate|create/i
		},
		"select-component-menu": {
			selector: "button, [role='button'], [role='menuitem'], [role='option']",
			pattern: /thêm thành phần|add component|component|ingredient/i
		},
		"add-to-prompt": {
			selector: "button, [role='button'], [role='option']",
			pattern: /^(?:thêm vào câu lệnh|add to prompt|use in prompt)$/i
		},
		"close-settings-menu": {
			selector: "button[aria-haspopup='menu'][aria-expanded='true']",
			pattern: /video|hình ảnh|image|nano|veo|\d+\s*s/i
		}
	}[requestedAction];
	const requestedIdentity = identity(requestedValue);
	const target = (requestedAction === "select-reference" ? visibleElements("[role='dialog'] [role='option'], [role='dialog'] [data-tile-id], [role='dialog'] button, [role='dialog'] [role='button']").map((element) => ({
		element,
		identity: identity([
			text(element),
			element.getAttribute("aria-label") || "",
			element.getAttribute("data-filename") || "",
			element.getAttribute("data-name") || "",
			element.querySelector("img[alt]")?.getAttribute("alt") || ""
		].join(" "))
	})).find((candidate) => requestedIdentity.length >= 6 && candidate.identity.includes(requestedIdentity))?.element || null : null) || (spec ? visibleElements(spec.selector).find((element) => spec.pattern.test(text(element))) : null);
	if (!target) return false;
	target.click();
	return true;
}
//#endregion
//#region src/background/runtime-messages.ts
function respondTo(promise, sendResponse) {
	promise.then(() => sendResponse({ ok: true })).catch((error) => sendResponse({
		ok: false,
		error: error instanceof Error ? error.message : String(error)
	}));
	return true;
}
function respondWithValue(promise, sendResponse) {
	promise.then((value) => sendResponse({
		ok: true,
		value
	})).catch((error) => sendResponse({
		ok: false,
		error: error instanceof Error ? error.message : String(error)
	}));
	return true;
}
function handleFlowAppDiagnostic(deps, message, sendResponse) {
	if (message.source !== "extension-diagnostic" || message.type !== "PROBE_FLOW_APP_INTAKE") return false;
	return respondWithValue(deps.probeFlowAppIntake(message.payload), sendResponse);
}
function handleFlowProjectInitialData(message, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "FLOW_PROJECT_INITIAL_DATA") return false;
	const projectId = String(message.projectId || "").trim();
	if (!projectId || !/^[a-z0-9_-]+$/i.test(projectId)) {
		sendResponse({
			ok: false,
			error: "Invalid Flow project id."
		});
		return true;
	}
	const input = encodeURIComponent(JSON.stringify({ json: { projectId } }));
	const readOnSignedInFlowOrigin = async () => {
		const tab = await chrome.tabs.create({
			url: `https://labs.google/fx/vi/tools/flow/project/${encodeURIComponent(projectId)}`,
			active: false
		});
		if (!tab.id) throw new Error("Could not open temporary signed-in Flow metadata tab.");
		try {
			const startedAt = Date.now();
			while (Date.now() - startedAt < 2e4) {
				if ((await chrome.tabs.get(tab.id)).status === "complete") break;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			const [result] = await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				world: "MAIN",
				func: async (query) => {
					const response = await fetch(`/fx/api/trpc/flow.projectInitialData?input=${query}`, {
						credentials: "include",
						cache: "no-store"
					});
					return {
						ok: response.ok,
						status: response.status,
						body: await response.json()
					};
				},
				args: [input]
			});
			const value = result?.result;
			if (!value?.ok) throw new Error(`Flow project data request failed (${value?.status || "unknown"}).`);
			return value.body;
		} finally {
			await chrome.tabs.remove(tab.id).catch(() => void 0);
		}
	};
	return respondWithValue(readOnSignedInFlowOrigin(), sendResponse);
}
function handleBridgeMessage(deps, message, sendResponse) {
	if (message.source === "google-flow-adapter" && message.type === "ENSURE_BRIDGE_CONNECTION") {
		deps.ensureBridgeConnection();
		sendResponse({ ok: true });
		return true;
	}
	if (message.source === "popup" && message.type === "GET_BRIDGE_STATUS") {
		deps.ensureBridgeConnection();
		deps.providerVisibilitySnapshot().then((providerVisibility) => sendResponse({
			...deps.bridgeStatus(),
			providerVisibility
		})).catch((error) => sendResponse({
			...deps.bridgeStatus(),
			error: error instanceof Error ? error.message : String(error)
		}));
		return true;
	}
	return false;
}
function handleCustomToolMessage(deps, message, sender, sendResponse) {
	if (message.source !== "google-flow-custom-tool-host" || message.type !== "RUN_CUSTOM_TOOL_JOB") return false;
	const payload = message.payload;
	const tab = sender.tab;
	if (!payload?.jobId || !tab?.id) {
		sendResponse({
			ok: false,
			error: "Custom-tool relay payload is incomplete."
		});
		return true;
	}
	const job = deps.activeJobs.get(payload.jobId) || {
		jobId: payload.jobId,
		provider: "google-flow",
		task: payload.task,
		prompt: payload.prompt,
		references: payload.references,
		settings: payload.settings,
		download: {
			auto: true,
			filenameTemplate: `studio-shot-bridge-${payload.jobId}`
		}
	};
	return respondTo(deps.enqueueCustomToolJob(job, tab), sendResponse);
}
function handleNativeClick(deps, message, sender, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "NATIVE_MOUSE_CLICK") return false;
	const tabId = sender.tab?.id;
	const x = Number(message.x);
	const y = Number(message.y);
	if (!tabId || !Number.isFinite(x) || !Number.isFinite(y)) {
		sendResponse({
			ok: false,
			error: "Missing tab id or click coordinates."
		});
		return true;
	}
	return respondWithValue(deps.dispatchNativeMouseClick(tabId, x, y, String(message.expectedText || ""), message.confirmIfUnchanged === true), sendResponse);
}
function clickMainWorld(clientX, clientY) {
	const hit = document.elementFromPoint(clientX, clientY);
	const clickable = hit?.closest("button, [role='button'], [role='option'], [role='menuitem']") || hit;
	if (!clickable) return false;
	clickable.click();
	return true;
}
function handleMainWorldClick(message, sender, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "MAIN_WORLD_CLICK") return false;
	const tabId = sender.tab?.id;
	const x = Number(message.x);
	const y = Number(message.y);
	if (!tabId || !Number.isFinite(x) || !Number.isFinite(y)) {
		sendResponse({
			ok: false,
			error: "Missing tab id or click coordinates."
		});
		return true;
	}
	chrome.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: clickMainWorld,
		args: [x, y]
	}).then((results) => sendResponse({ ok: results.some((result) => result.result === true) })).catch((error) => sendResponse({
		ok: false,
		error: error instanceof Error ? error.message : String(error)
	}));
	return true;
}
function handleFlowAction(message, sender, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "MAIN_WORLD_FLOW_ACTION") return false;
	const tabId = sender.tab?.id;
	const action = String(message.action || "");
	if (!tabId || !action) {
		sendResponse({
			ok: false,
			error: "Missing tab id or Flow action."
		});
		return true;
	}
	chrome.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: flowActionMainWorld,
		args: [action, String(message.value || "")]
	}).then((results) => sendResponse({ ok: results.some((result) => result.result === true) })).catch((error) => sendResponse({
		ok: false,
		error: error instanceof Error ? error.message : String(error)
	}));
	return true;
}
function handleNativeText(deps, message, sender, sendResponse) {
	if (!["google-flow-adapter", "elevenlabs-flows-adapter"].includes(message.source) || message.type !== "NATIVE_INSERT_TEXT") return false;
	const tabId = sender.tab?.id;
	const x = Number(message.x);
	const y = Number(message.y);
	if (!tabId || !Number.isFinite(x) || !Number.isFinite(y)) {
		sendResponse({
			ok: false,
			error: "Missing tab id or insertion coordinates."
		});
		return true;
	}
	return respondTo(deps.dispatchNativeTextInsert(tabId, x, y, String(message.text ?? ""), message.focusOnly === true), sendResponse);
}
function handleTobyText(deps, message, sender, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "TOBY_FLOW_INSERT_TEXT") return false;
	const tabId = sender.tab?.id;
	if (!tabId) {
		sendResponse({
			ok: false,
			error: "Missing tab id."
		});
		return true;
	}
	return respondWithValue(deps.dispatchTobyFlowTextInsert(tabId, String(message.text ?? "")), sendResponse);
}
function handleNativeFile(deps, message, sender, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "NATIVE_SET_FILE_INPUT") return false;
	const tabId = sender.tab?.id;
	const paths = Array.isArray(message.filePaths) ? message.filePaths.map(String).filter(Boolean) : [];
	if (!tabId || !paths.length) {
		sendResponse({
			ok: false,
			error: "Missing tab id or local file path."
		});
		return true;
	}
	return respondTo(deps.dispatchNativeFileInput(tabId, paths), sendResponse);
}
function handleNativeFileChooserUpload(deps, message, sender, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "NATIVE_UPLOAD_FILE_CHOOSER") return false;
	const tabId = sender.tab?.id;
	const x = Number(message.x);
	const y = Number(message.y);
	const paths = Array.isArray(message.filePaths) ? message.filePaths.map(String).filter(Boolean) : [];
	if (!tabId || !Number.isFinite(x) || !Number.isFinite(y) || !paths.length) {
		sendResponse({
			ok: false,
			error: "Missing tab id, click coordinates or local file path."
		});
		return true;
	}
	return respondTo(deps.dispatchNativeFileChooserUpload(tabId, x, y, paths), sendResponse);
}
function handleNativeDrag(deps, message, sender, sendResponse) {
	if (message.source !== "elevenlabs-flows-adapter" || message.type !== "NATIVE_DRAG_CANVAS") return false;
	const tabId = sender.tab?.id;
	const coordinates = [
		message.startX,
		message.startY,
		message.endX,
		message.endY
	].map(Number);
	if (!tabId || coordinates.some((value) => !Number.isFinite(value))) {
		sendResponse({
			ok: false,
			error: "Missing tab id or canvas drag coordinates."
		});
		return true;
	}
	return respondTo(deps.dispatchNativeCanvasDrag(tabId, coordinates[0], coordinates[1], coordinates[2], coordinates[3]), sendResponse);
}
function handleNativeUpload(deps, message, sendResponse) {
	if (message.source !== "content-script" || message.action !== "NATIVE_CHATGPT_UPLOAD_REFERENCES") return false;
	const job = deps.activeJobs.get(String(message.jobId || ""));
	if (!job) {
		sendResponse({
			ok: false,
			error: "Active ChatGPT job was not found for native upload."
		});
		return true;
	}
	return respondTo(deps.uploadChatGptReferencesNatively(job, typeof message.assetId === "string" ? message.assetId : void 0), sendResponse);
}
function handleFlowWorkspaceReference(deps, message, sendResponse) {
	if (message.source !== "google-flow-adapter" || message.type !== "RESOLVE_FLOW_REFERENCE_IN_WORKSPACE") return false;
	const jobId = String(message.jobId || "");
	const reference = message.reference;
	if (!jobId || !reference?.assetId) {
		sendResponse({
			ok: false,
			error: "Missing Flow job or reference for workspace picker relay."
		});
		return true;
	}
	const projectId = String(message.projectId || "");
	const senderTabId = Number(message.senderTabId || 0);
	const resolve = async () => {
		const base = (await chrome.tabs.query({ url: ["https://labs.google/fx/*", "https://labs.google.com/fx/*"] })).find((tab) => {
			if (!tab.id || tab.id === senderTabId || !tab.url || /\/project\/[^/]+\/(?:tool|tool-version)\//i.test(tab.url)) return false;
			try {
				const pathname = new URL(tab.url).pathname.replace(/\/$/, "");
				return !projectId || pathname.endsWith(`/project/${projectId}`);
			} catch {
				return false;
			}
		});
		if (!base?.id) throw new Error("Flow workspace base tab was not found; keep the project page open beside Studio Shot Bridge.");
		const sendReference = () => chrome.tabs.sendMessage(base.id, {
			action: "RESOLVE_FLOW_REFERENCE",
			jobId,
			reference,
			preferDirectUpload: true
		});
		const sendReferenceWithReconnect = async () => {
			try {
				return await sendReference();
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				if (!/message channel closed|receiving end does not exist/i.test(detail)) throw error;
				await chrome.tabs.reload(base.id).catch(() => void 0);
				await new Promise((resolve) => setTimeout(resolve, 1500));
				await chrome.tabs.sendMessage(base.id, { action: "PING_STUDIO_ADAPTER" });
				return sendReference();
			}
		};
		return chrome.tabs.sendMessage(base.id, { action: "PING_STUDIO_ADAPTER" }).catch(async () => {
			await chrome.tabs.reload(base.id).catch(() => void 0);
			await new Promise((resolve) => setTimeout(resolve, 1500));
			return chrome.tabs.sendMessage(base.id, { action: "PING_STUDIO_ADAPTER" });
		}).then(() => sendReferenceWithReconnect());
	};
	resolve().then((result) => sendResponse(result || {
		ok: false,
		error: "Flow workspace returned no reference result."
	})).catch((error) => sendResponse({
		ok: false,
		error: error instanceof Error ? error.message : String(error)
	}));
	return true;
}
async function restoreForwardJob(deps, message, sender) {
	const jobId = String(message.data?.jobId || "");
	const active = deps.activeJobs.get(jobId);
	const job = active || await deps.restoreActiveJobSnapshot(jobId);
	if (!active && job) deps.activeJobs.set(jobId, job);
	if (job && sender.tab?.id) job.tabId = sender.tab.id;
	await persistConversationContext(deps, job, message, sender);
	normalizeHydratingChatGptStatus(job, message);
	return {
		job,
		jobId
	};
}
function hasDurableChatGptAssets(message, job) {
	const provider = String(job?.provider || "").toLowerCase();
	return Boolean((provider === "chatgpt" || provider === "chatgpt-web") && message.data?.status === "done" && Array.isArray(message.data.assets) && message.data.assets.length > 0 && message.data.assets.every((asset) => String(asset?.filePath || asset?.downloadPath || "").startsWith("data:")));
}
function forwardDurableChatGptResult(deps, message, jobId) {
	deps.sendToDesktop({
		type: "JOB_RESULT",
		jobId,
		status: "done",
		assets: message.data.assets.map((asset) => ({
			...asset,
			filePath: asset.filePath || asset.downloadPath,
			metadata: {
				...asset.metadata || {},
				storage: asset.filePath?.startsWith("data:") ? "data_url" : "provider_url_fallback"
			}
		}))
	});
	deps.activeJobs.delete(jobId);
	deps.forgetActiveJobSnapshot(jobId);
}
async function hydrateChatGptResultAssets(message, senderTabId) {
	if (message.data?.type !== "JOB_RESULT" || message.data?.status !== "done" || !Array.isArray(message.data.assets) || !senderTabId) return message;
	const assets = await Promise.all(message.data.assets.map(async (asset) => {
		const source = String(asset?.filePath || asset?.downloadPath || "");
		if (!/^https?:\/\//i.test(source)) return asset;
		try {
			const captured = await chrome.tabs.sendMessage(senderTabId, {
				action: "READ_CHATGPT_ASSET_FOR_BACKGROUND",
				url: source
			});
			if (captured?.ok && typeof captured.dataUrl === "string" && captured.dataUrl.startsWith("data:")) return {
				...asset,
				filePath: captured.dataUrl,
				downloadPath: captured.dataUrl,
				metadata: {
					...asset.metadata || {},
					storage: "data_url",
					originalUrl: source,
					byteSize: captured.byteSize
				}
			};
		} catch {}
		return asset;
	}));
	return {
		...message,
		data: {
			...message.data,
			assets
		}
	};
}
async function forwardContentResult(deps, message, jobId, job, senderTabId) {
	if (message.data?.type === "JOB_RESULT") {
		message = await hydrateChatGptResultAssets(message, senderTabId);
		deps.sendToDesktop({
			type: "JOB_STATUS",
			jobId,
			status: "downloading",
			message: "Extension received ChatGPT result; finalizing asset import..."
		});
		if (hasDurableChatGptAssets(message, job)) {
			forwardDurableChatGptResult(deps, message, jobId);
			return;
		}
		let timer;
		try {
			await Promise.race([deps.handleContentResult(message.data), new Promise((_, reject) => {
				timer = setTimeout(() => reject(/* @__PURE__ */ new Error("RESULT_PROCESSING_TIMEOUT: extension did not finalize the provider result within 30 seconds")), 3e4);
			})]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	} else deps.sendToDesktop(message.data);
}
async function forwardContentData(deps, message, sender) {
	const { job, jobId } = await restoreForwardJob(deps, message, sender);
	await forwardContentResult(deps, message, jobId, job, sender.tab?.id);
}
async function persistConversationContext(deps, job, message, sender) {
	const conversationUrl = [message.data?.providerConversationUrl, sender.tab?.url].map((value) => String(value || "")).find(deps.isSavedChatGptConversationUrl) || "";
	if (!job || !conversationUrl) return;
	job.conversationUrl = conversationUrl;
	message.data.providerConversationUrl = conversationUrl;
	await deps.persistActiveJobSnapshot(job);
}
function normalizeHydratingChatGptStatus(job, message) {
	if (!job?.chatGptTextRecoveryActive || message.data?.type !== "JOB_STATUS" || message.data?.status !== "waiting_manual_action") return;
	message.data.status = "generating";
	message.data.message = `Reloaded saved ChatGPT conversation is still hydrating; checking again without resubmitting. ${String(message.data.message || "")}`.trim();
}
function handleContentData(deps, message, sender, sendResponse) {
	if (message.source !== "content-script" || !message.data) return false;
	return respondTo(forwardContentData(deps, message, sender).catch((error) => {
		console.error("[extension] failed to forward content data", error);
		if (message.data?.type === "JOB_RESULT") deps.sendToDesktop({
			type: "JOB_RESULT",
			jobId: String(message.data.jobId || ""),
			status: "failed_retryable",
			assets: [],
			error: error instanceof Error ? error.message : String(error)
		});
	}), sendResponse);
}
function dispatchRuntimeMessage(deps, message, sender, sendResponse) {
	const handlers = [
		() => handleBridgeMessage(deps, message, sendResponse),
		() => handleFlowAppDiagnostic(deps, message, sendResponse),
		() => handleFlowProjectInitialData(message, sendResponse),
		() => handleCustomToolMessage(deps, message, sender, sendResponse),
		() => handleFlowWorkspaceReference(deps, {
			...message,
			senderTabId: sender.tab?.id
		}, sendResponse),
		() => handleNativeClick(deps, message, sender, sendResponse),
		() => handleMainWorldClick(message, sender, sendResponse),
		() => handleFlowAction(message, sender, sendResponse),
		() => handleNativeText(deps, message, sender, sendResponse),
		() => handleTobyText(deps, message, sender, sendResponse),
		() => handleNativeFile(deps, message, sender, sendResponse),
		() => handleNativeFileChooserUpload(deps, message, sender, sendResponse),
		() => handleNativeDrag(deps, message, sender, sendResponse),
		() => handleNativeUpload(deps, message, sendResponse),
		() => handleContentData(deps, message, sender, sendResponse)
	];
	for (const handle of handlers) if (handle()) return true;
	sendResponse({ ok: true });
	return true;
}
function registerRuntimeMessageListener(deps) {
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => dispatchRuntimeMessage(deps, message, sender, sendResponse));
}
//#endregion
//#region src/background/discovery-state.cjs
var require_discovery_state = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var SEARCH_DELAYS_MS = Object.freeze([
		1e3,
		2e3,
		4e3
	]);
	function initialDiscovery(nowMs = Date.now()) {
		return {
			phase: "searching",
			scanAttempt: 0,
			candidateCount: 0,
			canonical: false,
			budgetExhausted: false,
			lastObservedAt: Number(nowMs)
		};
	}
	function countVisibility(visibility) {
		return ["googleFlowTabs", "elevenLabsFlowsTabs"].reduce((total, key) => total + Math.max(0, Number(visibility?.[key] || 0)), 0);
	}
	function isCanonicalFlow(visibility) {
		const project = Number(visibility?.googleFlowProjectTabs || 0);
		const workspaceTools = Number(visibility?.googleFlowCustomToolTabs || 0);
		const runtimeTools = Number(visibility?.googleFlowRuntimeToolTabs || 0);
		const editorTools = Number(visibility?.googleFlowEditorToolTabs || 0);
		return project === 1 && workspaceTools <= 1 && runtimeTools <= 1 && editorTools === 0;
	}
	function observeDiscovery(previous, visibility, nowMs = Date.now()) {
		const prior = previous || initialDiscovery(nowMs);
		const candidateCount = countVisibility(visibility);
		const canonical = isCanonicalFlow(visibility);
		const scanAttempt = Math.min(Number(prior.scanAttempt || 0) + 1, SEARCH_DELAYS_MS.length);
		return {
			phase: canonical ? "low_energy" : candidateCount > 0 ? "candidate" : prior.phase === "reacquiring" ? "reacquiring" : "searching",
			scanAttempt,
			candidateCount,
			canonical,
			budgetExhausted: !canonical && scanAttempt >= SEARCH_DELAYS_MS.length,
			lastObservedAt: Number(nowMs)
		};
	}
	function reacquireDiscovery(nowMs = Date.now()) {
		return {
			...initialDiscovery(nowMs),
			phase: "reacquiring"
		};
	}
	function nextSearchDelayMs(state) {
		if (!state || state.phase === "low_energy" || state.budgetExhausted) return null;
		return SEARCH_DELAYS_MS[Math.max(0, Math.min(Number(state.scanAttempt || 0), SEARCH_DELAYS_MS.length - 1))];
	}
	module.exports = {
		SEARCH_DELAYS_MS,
		initialDiscovery,
		observeDiscovery,
		reacquireDiscovery,
		nextSearchDelayMs
	};
}));
//#endregion
//#region src/background/pairing-runtime.cjs
var require_pairing_runtime = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	async function derivePairingConfirmation(secret, fields) {
		const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
			name: "HMAC",
			hash: "SHA-256"
		}, false, ["sign"]);
		const input = [
			fields.pairingId,
			fields.nonce,
			fields.extensionInstanceId,
			fields.sessionId
		].map((value) => String(value || "")).join("\0");
		const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
		return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, "0")).join("");
	}
	function pairingMatches(context, message) {
		return Boolean(context.pairing && String(message.pairingId || "") === context.pairing.pairingId);
	}
	function updatePairingState(context, state) {
		if (context.pairing) context.pairing = {
			...context.pairing,
			state
		};
	}
	function beginPairing(context, message) {
		context.challenge = {
			pairingId: String(message.pairingId || ""),
			nonce: String(message.nonce || ""),
			extensionInstanceId: context.options.extensionInstanceId(),
			sessionId: context.options.extensionSessionId
		};
		context.pairing = {
			pairingId: context.challenge.pairingId,
			code: String(message.code || ""),
			state: "pending",
			expiresAt: Number(message.expiresAt || 0) || void 0
		};
		resumePairing(context, context.challenge);
	}
	function acceptPairingApproval(context, message) {
		if (pairingMatches(context, message)) updatePairingState(context, "secret_sent");
		confirmPairing(context, message);
	}
	function resolvePairing(context, message) {
		if (!pairingMatches(context, message)) return;
		updatePairingState(context, message.type === "BRIDGE_PAIRING_CONFIRMED" ? "confirmed" : "rejected");
	}
	async function resumePairing(context, challenge) {
		const storage = chrome.storage?.local;
		if (!challenge.pairingId || !storage?.get) return;
		try {
			const stored = await storage.get(context.options.pairingSecretStorageKey);
			const secret = String(stored?.[context.options.pairingSecretStorageKey] || "");
			if (!/^[a-f0-9]{64}$/i.test(secret) || context.challenge?.pairingId !== challenge.pairingId) return;
			const proof = await derivePairingConfirmation(secret, challenge);
			updatePairingState(context, "secret_sent");
			context.options.send({
				type: "BRIDGE_PAIRING_RESUME",
				pairingId: challenge.pairingId,
				extensionId: context.options.extensionId,
				extensionInstanceId: challenge.extensionInstanceId,
				sessionId: challenge.sessionId,
				proof
			});
		} catch (error) {
			context.options.onError(error instanceof Error ? error.message : String(error));
		}
	}
	async function confirmPairing(context, message) {
		const secret = String(message.secret || "");
		const challenge = context.challenge;
		const storage = chrome.storage?.local;
		if (!challenge || !secret || String(message.pairingId || "") !== challenge.pairingId || !storage?.set) {
			context.options.onError("Bridge pairing approval is missing a valid challenge or secure extension storage.");
			if (pairingMatches(context, message)) updatePairingState(context, "rejected");
			return;
		}
		try {
			await storage.set({ [context.options.pairingSecretStorageKey]: secret });
			const proof = await derivePairingConfirmation(secret, challenge);
			context.options.send({
				type: "BRIDGE_PAIRING_CONFIRM",
				pairingId: challenge.pairingId,
				proof
			});
		} catch (error) {
			context.options.onError(error instanceof Error ? error.message : String(error));
			if (pairingMatches(context, message)) updatePairingState(context, "rejected");
		}
	}
	function handlePairingMessage(context, message) {
		if (message.type === "BRIDGE_PAIRING_CHALLENGE") {
			beginPairing(context, message);
			return true;
		}
		if (message.type === "BRIDGE_PAIRING_APPROVED") {
			acceptPairingApproval(context, message);
			return true;
		}
		if (message.type === "BRIDGE_PAIRING_CONFIRMED" || message.type === "BRIDGE_PAIRING_REJECTED") {
			resolvePairing(context, message);
			return true;
		}
		return false;
	}
	function createPairingRuntime(options) {
		const context = {
			options,
			challenge: void 0,
			pairing: void 0
		};
		return {
			handleMessage: (message) => handlePairingMessage(context, message),
			status: () => context.pairing ? { ...context.pairing } : void 0
		};
	}
	module.exports = { createPairingRuntime };
}));
//#endregion
//#region src/background/bridge-runtime.ts
var import_discovery_state = /* @__PURE__ */ __toESM(require_discovery_state(), 1);
var { createPairingRuntime } = (/* @__PURE__ */ __toESM(require_pairing_runtime(), 1)).default;
function settleNativeResult(message, clickRequests, flowToolRequests) {
	const requestId = String(message.requestId || "");
	const collection = message.type === "NATIVE_CLICK_RESULT" ? clickRequests : message.type === "NATIVE_FLOW_TOOL_EVALUATE_RESULT" ? flowToolRequests : void 0;
	const pending = collection?.get(requestId);
	if (!pending) return false;
	clearTimeout(pending.timer);
	collection.delete(requestId);
	if (message.ok === true) pending.resolve(message.value);
	else pending.reject(new Error(String(message.error || "Desktop native operation failed.")));
	return true;
}
function extensionIdentity(options) {
	return options.extensionInstanceId?.() || chrome.runtime.id;
}
function createDiscoveryController(options, state, send) {
	let discovery = import_discovery_state.default.initialDiscovery();
	let discoveryTimer = null;
	const socketIsOpen = () => state.socket?.readyState === 1;
	function clearDiscoveryTimer() {
		if (!discoveryTimer) return;
		clearTimeout(discoveryTimer);
		discoveryTimer = null;
	}
	function scheduleDiscoveryProbe() {
		if (discoveryTimer || !socketIsOpen()) return;
		const delayMs = import_discovery_state.default.nextSearchDelayMs(discovery);
		if (delayMs === null) return;
		discoveryTimer = setTimeout(() => {
			discoveryTimer = null;
			refreshStatus();
		}, delayMs);
	}
	function sendTopologyStatus(providerVisibility) {
		discovery = import_discovery_state.default.observeDiscovery(discovery, providerVisibility);
		send({
			type: "EXTENSION_STATUS",
			extensionId: chrome.runtime.id,
			extensionInstanceId: extensionIdentity(options),
			sessionId: options.extensionSessionId,
			version: chrome.runtime.getManifest().version,
			capabilities: options.capabilities || {},
			providerVisibility,
			discovery
		});
		scheduleDiscoveryProbe();
	}
	function refreshStatus() {
		let visibilityPromise;
		try {
			visibilityPromise = options.providerVisibility();
		} catch {
			visibilityPromise = Promise.resolve({});
		}
		visibilityPromise.then(sendTopologyStatus).catch(() => {
			discovery = import_discovery_state.default.observeDiscovery(discovery, {});
			send({
				type: "EXTENSION_STATUS",
				extensionId: chrome.runtime.id,
				extensionInstanceId: extensionIdentity(options),
				sessionId: options.extensionSessionId,
				version: chrome.runtime.getManifest().version,
				capabilities: options.capabilities || {},
				providerVisibility: {},
				discovery
			});
			scheduleDiscoveryProbe();
		});
	}
	return {
		clearDiscoveryTimer,
		refreshStatus,
		reset: () => {
			discovery = import_discovery_state.default.initialDiscovery();
		},
		reacquire: () => {
			discovery = import_discovery_state.default.reacquireDiscovery();
		},
		snapshot: () => ({ ...discovery }),
		scheduleDiscoveryProbe
	};
}
function createNativeRequests(options, isOpen, send, clickRequests, flowToolRequests) {
	function requestNativeClick(tabUrl, x, y, expectedText = "", confirmIfUnchanged = false) {
		if (!isOpen()) return Promise.reject(/* @__PURE__ */ new Error("Desktop bridge is not connected."));
		const requestId = `native-click-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				clickRequests.delete(requestId);
				reject(/* @__PURE__ */ new Error("Desktop native click timed out."));
			}, 5e3);
			clickRequests.set(requestId, {
				resolve,
				reject,
				timer
			});
			send({
				type: "NATIVE_CLICK_REQUEST",
				requestId,
				tabUrl,
				x,
				y,
				expectedText,
				confirmIfUnchanged
			});
		});
	}
	function requestFlowToolEvaluate(expression) {
		if (!isOpen()) return Promise.reject(/* @__PURE__ */ new Error("Desktop bridge is not connected."));
		const requestId = `flow-tool-evaluate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				flowToolRequests.delete(requestId);
				reject(/* @__PURE__ */ new Error("Desktop Flow tool evaluation timed out."));
			}, options.flowToolTimeoutMs ?? 9e4);
			flowToolRequests.set(requestId, {
				resolve,
				reject,
				timer
			});
			send({
				type: "NATIVE_FLOW_TOOL_EVALUATE_REQUEST",
				requestId,
				expression
			});
		});
	}
	return {
		requestFlowToolEvaluate,
		requestNativeClick
	};
}
function createSocketController(options, state, send, pairingRuntime, discovery) {
	function hello() {
		send({
			type: "EXTENSION_HELLO",
			extensionId: chrome.runtime.id,
			sessionId: options.extensionSessionId,
			extensionInstanceId: extensionIdentity(options),
			version: chrome.runtime.getManifest().version,
			providers: options.providers,
			providerVisibility: {},
			capabilities: options.capabilities || {},
			discovery: discovery.snapshot()
		});
		discovery.refreshStatus();
	}
	function scheduleReconnect() {
		if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
		const baseDelay = Math.max(1e3, options.reconnectDelayMs ?? 3e3);
		const delay = Math.min(baseDelay * 2 ** Math.min(state.reconnectAttempt, 4), 3e4);
		state.reconnectAttempt += 1;
		state.reconnectTimer = setTimeout(connect, delay);
	}
	function connect() {
		if (state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) return;
		discovery.clearDiscoveryTimer();
		discovery.reset();
		state.socket = new WebSocket(options.bridgeUrl);
		state.socket.addEventListener("open", () => {
			state.connected = true;
			state.reconnectAttempt = 0;
			state.lastError = null;
			hello();
		});
		state.socket.addEventListener("message", (event) => {
			try {
				const message = JSON.parse(String(event.data));
				if (pairingRuntime.handleMessage(message)) {
					if (String(options.capabilities?.manifestVersion || "") === "2") discovery.refreshStatus();
					return;
				}
				options.handleDesktopMessage(message);
			} catch (error) {
				state.lastError = error instanceof Error ? error.message : String(error);
			}
		});
		state.socket.addEventListener("close", () => {
			state.connected = false;
			discovery.clearDiscoveryTimer();
			discovery.reacquire();
			state.socket = null;
			scheduleReconnect();
		});
		state.socket.addEventListener("error", () => {
			state.connected = false;
			state.lastError = "WebSocket connection failed";
			state.socket?.close();
		});
	}
	function ensureConnection() {
		if (state.socket?.readyState !== WebSocket.OPEN && state.socket?.readyState !== WebSocket.CONNECTING) connect();
	}
	return {
		connect,
		ensureConnection,
		hello
	};
}
function createBridgeRuntime(options) {
	const state = {
		socket: null,
		reconnectTimer: null,
		reconnectAttempt: 0,
		connected: false,
		lastError: null
	};
	const clickRequests = /* @__PURE__ */ new Map();
	const flowToolRequests = /* @__PURE__ */ new Map();
	const isOpen = () => state.socket?.readyState === 1;
	const send = (message) => {
		if (isOpen()) state.socket.send(JSON.stringify(message));
	};
	const pairingRuntime = createPairingRuntime({
		pairingSecretStorageKey: options.pairingSecretStorageKey || "studio.bridge.pairingSecret.v1",
		extensionId: chrome.runtime.id,
		extensionInstanceId: () => extensionIdentity(options),
		extensionSessionId: options.extensionSessionId,
		send,
		onError: (message) => {
			state.lastError = message;
		}
	});
	const discovery = createDiscoveryController(options, state, send);
	const sockets = createSocketController(options, state, send, pairingRuntime, discovery);
	const native = createNativeRequests(options, isOpen, send, clickRequests, flowToolRequests);
	return {
		...sockets,
		refreshStatus: discovery.refreshStatus,
		isOpen,
		...native,
		send,
		settleNativeResult: (message) => settleNativeResult(message, clickRequests, flowToolRequests),
		status: () => ({
			connected: state.connected,
			lastError: state.lastError,
			discovery: discovery.snapshot(),
			pairing: pairingRuntime.status()
		}),
		discovery: discovery.snapshot
	};
}
//#endregion
//#region ../../packages/extension-providers/src/google-flow/flow-workspace.ts
function canonicalFlowRoute(value) {
	try {
		const url = new URL(String(value || ""));
		url.search = "";
		url.hash = "";
		url.pathname = url.pathname.replace(/\/+$/, "");
		return url.toString();
	} catch {
		return "";
	}
}
/**
* Revalidate the exact published runtime and project immediately before an
* authorization click. Flow may navigate a hydrated tool back to a workspace
* or draft route without destroying the iframe that the extension is using.
*/
function validateFlowSubmitContext(context) {
	const expected = canonicalFlowRoute(context.expectedRuntimeUrl);
	const current = canonicalFlowRoute(context.currentUrl);
	if (!expected || !current) return {
		ok: false,
		code: "route_missing"
	};
	if (!isPublishedFlowRuntimeRoute(current)) return {
		ok: false,
		code: "runtime_route_not_published"
	};
	if (expected !== current) return {
		ok: false,
		code: "runtime_route_changed"
	};
	const expectedProject = flowProjectId(context.expectedWorkspaceUrl || expected);
	const currentProject = flowProjectId(current);
	if (!expectedProject || !currentProject || expectedProject !== currentProject) return {
		ok: false,
		code: "provider_project_changed"
	};
	if (context.expectedFrameId && !context.currentFrameId) return {
		ok: false,
		code: "frame_missing"
	};
	if (context.expectedFrameId && context.expectedFrameId !== context.currentFrameId) return {
		ok: false,
		code: "frame_changed"
	};
	if (context.expectedDocumentEpoch && !context.currentDocumentEpoch) return {
		ok: false,
		code: "document_epoch_missing"
	};
	if (context.expectedDocumentEpoch && context.expectedDocumentEpoch !== context.currentDocumentEpoch) return {
		ok: false,
		code: "document_epoch_changed"
	};
	if (context.expectedAccountHint && !context.currentAccountHint) return {
		ok: false,
		code: "account_hint_missing"
	};
	if (context.expectedAccountHint && context.expectedAccountHint !== context.currentAccountHint) return {
		ok: false,
		code: "account_changed"
	};
	return { ok: true };
}
function isPublishedFlowRuntimeRoute(value) {
	return /^https:\/\/labs\.google(?:\.com)?\/fx\/[^/]*\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+$/i.test(value) || /^https:\/\/labs\.google(?:\.com)?\/fx\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+$/i.test(value);
}
function flowProjectId(value) {
	return String(value || "").match(/\/tools\/flow\/project\/([^/]+)/i)?.[1] || "";
}
var identities = new Set([
	"61af9773-1ce9-4f36-a624-d010f05a53f2",
	"6c907eac-e8e8-4040-8e46-e38e6cd0662b",
	"4b879882-e1c1-4414-9e05-4202b33f1f31",
	"08ee45bf-f7fc-4e9a-a097-940a16ecf03a",
	"8ff19cad-99ce-4213-abea-9f316663255c",
	"578615c4-cc20-42f4-b3b3-5ae1b1454e94",
	"fb030780-41d2-48a6-8fa5-bc94538e60c1",
	"64a29df4-340e-44ae-8a9e-3bf77056f9a7",
	"d8011bb8-81b8-460f-b0a0-164455f6bfac",
	"f84d4d6a-ac30-4bfe-89fc-44e62c09f99e",
	"1f79134e-f6ad-4589-903a-8fead23a6379"
]);
var host = /^(?:labs\.google(?:\.com)?|flow\.google\.com)$/i;
var canonical = /^\/fx\/(?:[^/]+\/)?tools\/flow\/(?:project\/([^/]+)\/tool-version\/([^/]+)|shared\/tool\/([^/]+))\/?$/i;
var legacy = /^(?:\/project\/([^/]+)\/tool\/([^/]+)|\/shared\/tool\/([^/]+))\/?$/i;
function parse(value) {
	if (!value) return null;
	try {
		const url = new URL(value);
		if (!host.test(url.hostname)) return null;
		const match = url.pathname.match(canonical) || url.pathname.match(legacy);
		if (!match) return null;
		return {
			url,
			identity: match[2] || match[3] || "",
			published: Boolean(url.pathname.includes("tool-version") || url.pathname.includes("/shared/tool/") || identities.has((match[2] || match[3] || "").toLowerCase()))
		};
	} catch {
		return null;
	}
}
function isFlowCustomToolUrl$2(value) {
	return Boolean(parse(value));
}
function isFlowRuntimeToolUrl(value) {
	return Boolean(parse(value)?.published);
}
//#endregion
//#region src/background/flow-app-diagnostic.ts
function normalizeFlowAppDiagnosticPayload(value) {
	const payload = value && typeof value === "object" ? value : {};
	const diagnosticId = String(payload.diagnosticId || "").trim();
	const expectedRuntimeUrl = String(payload.expectedRuntimeUrl || "").trim();
	const manifest = payload.manifest && typeof payload.manifest === "object" && !Array.isArray(payload.manifest) ? payload.manifest : void 0;
	if (!diagnosticId || !expectedRuntimeUrl || !manifest) throw new Error("Flow diagnostic requires diagnosticId, expectedRuntimeUrl, and manifest.");
	const aspectRatio = payload.aspectRatio === "9:16" ? "9:16" : "16:9";
	const requestedDuration = Number(payload.durationSec || 4);
	const durationSec = [
		4,
		6,
		8
	].includes(requestedDuration) ? requestedDuration : 4;
	return {
		diagnosticId,
		expectedRuntimeUrl,
		manifest: {
			...manifest,
			diagnosticId
		},
		mediaId: String(payload.mediaId || ""),
		aspectRatio,
		durationSec
	};
}
function evaluateFlowAppDiagnosticReceipt(payload, observed) {
	const checks = {
		diagnosticId: String(observed.parsedManifest?.diagnosticId || "") === payload.diagnosticId,
		manifest: JSON.stringify(observed.parsedManifest || null) === JSON.stringify(payload.manifest),
		mediaId: observed.mediaId === String(payload.mediaId || ""),
		aspectRatio: observed.aspectRatio === payload.aspectRatio,
		durationSec: observed.durationSec === payload.durationSec
	};
	const ok = Object.values(checks).every(Boolean);
	return {
		...observed,
		ok,
		stage: ok ? "flow_app_received" : "flow_app_mismatch",
		checks
	};
}
//#endregion
//#region src/background/flow-relay-result.ts
function normalizeFlowRelayIntegration(value) {
	const source = value && typeof value === "object" ? value : {};
	const mediaId = String(source.mediaId || source.media_id || "");
	const explicitProviderId = String(source.providerJobId || source.provider_id || source.providerId || "");
	const rawSourceMode = String(source.sourceMode || source.source_mode || "").toLowerCase();
	const sourceMode = rawSourceMode === "frames" ? "frames" : rawSourceMode === "components" || rawSourceMode === "experimental" ? "components" : void 0;
	const rawQuality = String(source.quality || "").toLowerCase();
	const quality = rawQuality === "fast" || rawQuality === "quality" ? rawQuality : void 0;
	const rawAudioPolicy = String(source.audioPolicy || source.audio_policy || "").toLowerCase();
	const audioPolicy = rawAudioPolicy === "native_audio" || rawAudioPolicy === "separate_audio_pass" ? rawAudioPolicy : void 0;
	const rawVoice = source.voiceLock && typeof source.voiceLock === "object" ? source.voiceLock : void 0;
	const voiceLock = rawVoice && String(rawVoice.characterId || "").trim() && String(rawVoice.voiceSignature || "").trim() ? {
		characterId: String(rawVoice.characterId),
		...String(rawVoice.voiceId || "").trim() ? { voiceId: String(rawVoice.voiceId) } : {},
		voiceSignature: String(rawVoice.voiceSignature)
	} : void 0;
	const outputLanguage = String(source.outputLanguage || source.output_language || "").trim() || void 0;
	const rawResolution = String(source.outputResolution || source.output_resolution || "").toLowerCase();
	const outputResolution = rawResolution === "720p" || rawResolution === "1080p" ? rawResolution : void 0;
	return {
		base64: typeof source.base64 === "string" ? source.base64.replace(/^data:[^,]+,/, "") : void 0,
		mimeType: String(source.mimeType || source.mime_type || "video/mp4"),
		mediaId: mediaId || void 0,
		providerJobId: explicitProviderId || (mediaId ? `flow_relay_${mediaId}` : void 0),
		sourceMode,
		quality,
		audioPolicy,
		voiceLockVerified: typeof source.voiceLockVerified === "boolean" ? source.voiceLockVerified : void 0,
		voiceLock,
		outputLanguage,
		outputResolution,
		metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : void 0
	};
}
var { createFlowRelayRequest } = (/* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	function createFlowRelayRequest({ sessionId, correlationId, idempotencyKey, manifest }) {
		const base = {
			source: "rtk-ai-video-studio",
			protocolVersion: 2,
			type: "STUDIO_SHOT_REQUEST",
			sessionId: String(sessionId || ""),
			correlationId: String(correlationId || ""),
			idempotencyKey: String(idempotencyKey || "")
		};
		return {
			...base,
			manifest,
			payload: {
				...base,
				manifest
			}
		};
	}
	function normalizeFlowRelayMessage(message) {
		const root = message && typeof message === "object" ? message : {};
		const nested = root.payload && typeof root.payload === "object" ? root.payload : {};
		const value = (key) => root[key] !== void 0 ? root[key] : nested[key];
		return {
			source: String(value("source") || ""),
			protocolVersion: Number(value("protocolVersion") || 0),
			type: String(value("type") || ""),
			sessionId: String(value("sessionId") || ""),
			correlationId: String(value("correlationId") || ""),
			idempotencyKey: String(value("idempotencyKey") || ""),
			manifest: value("manifest")
		};
	}
	module.exports = {
		createFlowRelayRequest,
		normalizeFlowRelayMessage
	};
})))(), 1)).default;
var runtime;
var customToolDispatchTail = Promise.resolve();
var customToolScheduledJobs = /* @__PURE__ */ new Set();
var customToolSessions = /* @__PURE__ */ new Map();
function createGoogleFlowCustomToolAdapter(deps) {
	runtime = deps;
	return {
		dispatch: enqueueCustomToolJob$2,
		cancel: cancelCustomToolJob$1,
		probeIntake: probeFlowAppIntake$1
	};
}
function enqueueCustomToolJob$2(job, tab) {
	const { sendStatus } = runtime;
	if (customToolScheduledJobs.has(job.jobId)) {
		sendStatus(job.jobId, "submitting", "Duplicate Studio Shot Bridge dispatch ignored; this job was already queued or completed in this extension session.", .3);
		return Promise.resolve();
	}
	customToolScheduledJobs.add(job.jobId);
	const run = customToolDispatchTail.catch(() => void 0).then(() => dispatchCustomToolJob(job, tab));
	customToolDispatchTail = run.catch(() => void 0);
	return run;
}
var LOCAL_MEDIA_ORIGIN = "http://127.0.0.1:3768/media/";
var FLOW_RESULT_TIMEOUT_MS = 15 * 6e4;
var relayToolReadyExpression = `(() => { const text = String(document.body?.innerText || document.documentElement?.innerText || ""); return (/RELAY BRIDGE/i.test(text) && /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(text)) || (/STUDIO-TO-PROVIDER PROTOCOL PROXY/i.test(text) && /(?:IDLE \/ WAITING|AWAITING STUDIO_SHOT_REQUEST)/i.test(text)); })()`;
function isFreshRelayRuntime(url) {
	return isFlowRuntimeToolUrl(url);
}
function cancelCustomToolJob$1(jobId) {
	customToolSessions.get(jobId)?.cancel();
}
function isFlowSandboxTarget(target) {
	return target.type === "iframe" || target.type === "other" && target.url === "about:srcdoc" || Boolean(target.url && /\/flow-applet-runner\/shim\.html(?:[?#]|$)/i.test(target.url));
}
function localMediaUrl(filePath) {
	if (/^https?:\/\/127\.0\.0\.1:\d+\/media\//i.test(filePath)) return filePath;
	if (filePath.startsWith("/")) return `${LOCAL_MEDIA_ORIGIN}${encodeURIComponent(filePath)}`;
	return "";
}
async function hydrateReference(reference) {
	if (reference.base64) return reference;
	const source = localMediaUrl(String(reference.filePath || ""));
	if (!source) return reference;
	const response = await fetch(source);
	if (!response.ok) throw new Error(`Could not read Flow reference ${reference.assetId} from local media server (HTTP ${response.status}).`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (!bytes.length) throw new Error(`Local Flow reference ${reference.assetId} was empty.`);
	let binary = "";
	for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
	const mimeType = reference.mimeType || response.headers.get("content-type")?.split(";", 1)[0] || "image/png";
	return {
		...reference,
		mimeType,
		base64: `data:${mimeType};base64,${btoa(binary)}`
	};
}
async function hydrateFlowReferences(references) {
	return Promise.all((references || []).map(hydrateReference));
}
var bridgePreviewReadyExpression = `(() => { const visible = (item) => { const rect = item.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; }; const body = String(document.body?.innerText || ""); const root = String(document.querySelector("#root")?.innerText || ""); const pageText = [body, root, String(document.documentElement?.innerText || "")].join("\\n"); const flowApp = /^Flow App(?:\\s|$)/i.test(String(document.title || "")); const freshRelay = /relay bridge/i.test(pageText) && /(?:generate video|execute relay job|trigger relay)/i.test(pageText); const shellRelay = /STUDIO-TO-PROVIDER PROTOCOL PROXY/i.test(pageText) && /(?:IDLE \/ WAITING|AWAITING STUDIO_SHOT_REQUEST)/i.test(pageText); const bridgeShell = /studio shot bridge/i.test(pageText) || freshRelay || shellRelay || (flowApp && Boolean(document.querySelector("#root"))); const controls = [...document.querySelectorAll("button, [role='button'], [class*='cursor-pointer']")].some((item) => /(?:select|connect) storyboard|add reference|(?:generate video|execute relay job|trigger relay)/i.test(String(item.innerText || item.getAttribute("aria-label") || "").trim()) && visible(item)); return bridgeShell && (controls || shellRelay || /(?:connect storyboard|select storyboard|add reference|storyboard keyframe|visual references|(?:generate video|execute relay job|trigger relay))/i.test(pageText)); })()`;
function localFlowCommandExpression(expression) {
	if (expression.startsWith("__STUDIO_CLICK_BUTTON__:")) return `(() => { const needle = ${JSON.stringify(expression.slice(24).trim().toLowerCase())}; const visible = (item) => { const rect = item.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; }; const textOf = (item) => String(item.innerText || item.textContent || item.getAttribute("aria-label") || "").trim().toLowerCase(); const candidates = [...document.querySelectorAll("button, [role='button'], .cursor-pointer, div")].filter((item) => visible(item) && textOf(item).includes(needle)); const exact = candidates.find((item) => textOf(item) === needle); const smallest = [...candidates].sort((a, b) => textOf(a).length - textOf(b).length)[0]; const iconAdd = needle === "add reference" ? [...document.querySelectorAll("button, [role='button']")].find((item) => { if (!visible(item) || !/^(?:add|\\+)$/i.test(textOf(item))) return false; let context = ""; let ancestor = item.parentElement; for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) context += " " + String(ancestor.innerText || ancestor.textContent || ""); return /(?:visual references|tài nguyên trực quan)/i.test(context); }) : undefined; const target = (exact || smallest)?.closest?.("button, [role='button'], .cursor-pointer") || exact || smallest || iconAdd; if (!target) return false; const rect = target.getBoundingClientRect(); const eventInit = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerType: "mouse" }; target.dispatchEvent(new PointerEvent("pointerdown", eventInit)); target.dispatchEvent(new MouseEvent("mousedown", eventInit)); target.dispatchEvent(new PointerEvent("pointerup", eventInit)); target.dispatchEvent(new MouseEvent("mouseup", eventInit)); target.dispatchEvent(new MouseEvent("click", eventInit)); target.click(); return true; })()`;
	if (expression.startsWith("__STUDIO_CONFIRM_FLOW_MEDIA__:")) return `(async () => { const name = ${JSON.stringify(expression.slice(30))}; const visible = (item) => { const rect = item.getBoundingClientRect(); return rect.width > 2 && rect.height > 2; }; const tile = [...document.querySelectorAll("button, [role='button'], [role='option'], div")].filter(visible).findLast((item) => (item.textContent || "").trim() === name); if (tile) { tile.click(); await new Promise((resolve) => setTimeout(resolve, 120)); } const add = [...document.querySelectorAll("button, [role='button']")].find((item) => /^(Thêm nội dung nghe nhìn|Add media)$/i.test((item.textContent || "").trim()) && !item.disabled); add?.click(); return Boolean(add); })()`;
	if (expression === "__STUDIO_DISMISS_FLOW_MEDIA_PICKER__") return `(() => { const backdrop = [...document.querySelectorAll('[data-state="open"][aria-hidden="true"]')].find((item) => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }); backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 2, clientY: 2 })); return Boolean(backdrop); })()`;
	return expression;
}
var StudioBridgeSession = class {
	job;
	tabId;
	cancelled = false;
	childSessions = /* @__PURE__ */ new Map();
	childTargets = /* @__PURE__ */ new Map();
	debugTarget;
	innerCommandId = 0;
	innerPending = /* @__PURE__ */ new Map();
	innerSessionId = "";
	remotePending = /* @__PURE__ */ new Map();
	remoteSocket = null;
	desktopFlowEvaluateUnavailable = false;
	trustedRuntimeUrl = "";
	trustedFrameId = "";
	trustedDocumentEpoch = "";
	topLevelRelay = false;
	constructor(job, tabId, extensionOnly = false) {
		this.job = job;
		this.tabId = tabId;
		this.debugTarget = { tabId };
		this.desktopFlowEvaluateUnavailable = extensionOnly;
	}
	command(method, params) {
		return Promise.race([chrome.debugger.sendCommand(this.debugTarget, method, params), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error(`CDP command ${method} timed out`)), 1e4))]);
	}
	async evaluate(expression, contextId) {
		const result = await this.command("Runtime.evaluate", {
			expression,
			contextId,
			awaitPromise: true,
			returnByValue: true
		});
		if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "CDP evaluation failed.");
		return result?.result?.value;
	}
	handleTargetEvent = (source, method, params) => {
		if (source.tabId !== this.tabId) return;
		if (method === "Target.attachedToTarget") {
			const event = params;
			if (!event?.sessionId || !event.targetInfo?.targetId) return;
			this.childSessions.set(event.targetInfo.targetId, event.sessionId);
			this.childTargets.set(event.targetInfo.targetId, {
				targetId: event.targetInfo.targetId,
				type: String(event.targetInfo.type || ""),
				url: event.targetInfo.url,
				parentId: event.targetInfo.parentId
			});
			return;
		}
		if (method !== "Target.receivedMessageFromTarget") return;
		try {
			const response = JSON.parse(String(params?.message || "{}"));
			const pending = this.innerPending.get(Number(response.id));
			if (!pending) return;
			this.innerPending.delete(Number(response.id));
			if (response.error) pending.reject(new Error(response.error.message || "Sandbox CDP command failed."));
			else pending.resolve(response.result || {});
		} catch {}
	};
	innerCommand(method, params) {
		if (this.remoteSocket?.readyState === WebSocket.OPEN) {
			const id = ++this.innerCommandId;
			return new Promise((resolve, reject) => {
				this.remotePending.set(id, {
					resolve,
					reject
				});
				this.remoteSocket.send(JSON.stringify({
					id,
					method,
					params
				}));
			});
		}
		if (!this.innerSessionId) return Promise.reject(/* @__PURE__ */ new Error("No inner session selected."));
		const id = ++this.innerCommandId;
		return new Promise((resolve, reject) => {
			let timeoutId;
			const wrappedResolve = (value) => {
				clearTimeout(timeoutId);
				resolve(value);
			};
			const wrappedReject = (error) => {
				clearTimeout(timeoutId);
				reject(error);
			};
			timeoutId = setTimeout(() => {
				this.innerPending.delete(id);
				wrappedReject(/* @__PURE__ */ new Error(`Inner CDP command ${method} timed out`));
			}, 5e3);
			this.innerPending.set(id, {
				resolve: wrappedResolve,
				reject: wrappedReject
			});
			this.command("Target.sendMessageToTarget", {
				sessionId: this.innerSessionId,
				message: JSON.stringify({
					id,
					method,
					params: params || {}
				})
			}).catch((error) => {
				this.innerPending.delete(id);
				wrappedReject(error);
			});
		});
	}
	async evaluateInner(expression) {
		if (runtime.bridgeIsOpen() && !this.desktopFlowEvaluateUnavailable) try {
			return await Promise.race([runtime.requestDesktopFlowToolEvaluate(expression), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("Desktop Flow tool evaluation did not answer promptly.")), 8e3))]);
		} catch (error) {
			this.desktopFlowEvaluateUnavailable = true;
			if (!this.innerSessionId && !this.remoteSocket && !await this.connectRemoteSandbox()) await this.discoverChildSandbox("");
		}
		return this.evaluateAttachedInner(localFlowCommandExpression(expression));
	}
	async evaluateAttachedInner(expression) {
		const result = await this.innerCommand("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true
		});
		if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Sandbox CDP evaluation failed.");
		return result.result?.value;
	}
	async waitInner(expression, timeoutMs, label) {
		const startedAt = Date.now();
		let rebound = false;
		while (Date.now() - startedAt < timeoutMs) {
			try {
				if (await this.evaluateInner(expression)) return;
			} catch (error) {
				if (!rebound && /Studio Shot Bridge controls|storyboard media|continuity reference/i.test(label)) {
					rebound = true;
					this.innerSessionId = "";
					this.childSessions.clear();
					this.childTargets.clear();
					await this.discoverChildSandbox("").catch(() => void 0);
					continue;
				}
				throw error;
			}
			if (!rebound && Date.now() - startedAt >= 3e3 && /Studio Shot Bridge controls/i.test(label)) {
				rebound = true;
				this.innerSessionId = "";
				this.childSessions.clear();
				this.childTargets.clear();
				await this.discoverChildSandbox("").catch(() => void 0);
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error(`Timed out waiting for ${label}.`);
	}
	async connectRemoteSandbox() {
		try {
			const target = await findRemoteSandboxTarget();
			if (!target?.webSocketDebuggerUrl) return false;
			this.remoteSocket = new WebSocket(target.webSocketDebuggerUrl);
			this.remoteSocket.addEventListener("message", (event) => this.resolveRemoteMessage(event));
			await waitForRemoteSocket(this.remoteSocket);
			await this.innerCommand("Runtime.enable");
			if (/^Flow App(?:\s|$)/i.test(String(await this.evaluateInner("document.title"))) && Boolean(await this.evaluateInner(bridgePreviewReadyExpression))) return true;
		} catch {}
		this.remoteSocket?.close();
		this.remoteSocket = null;
		return false;
	}
	resolveRemoteMessage(event) {
		try {
			const response = JSON.parse(String(event.data || "{}"));
			const pending = this.remotePending.get(Number(response.id));
			if (!pending) return;
			this.remotePending.delete(Number(response.id));
			if (response.error) pending.reject(new Error(response.error.message || "Remote sandbox CDP command failed."));
			else pending.resolve(response.result || {});
		} catch {}
	}
	async discoverChildSandbox(rootTargetId) {
		const diagnostics = /* @__PURE__ */ new Set();
		for (let attempt = 0; attempt < 60; attempt++) {
			if (attempt === 0) {
				const targetResult = await this.command("Target.getTargets").catch(() => ({}));
				for (const target of targetResult.targetInfos || []) {
					if (!isFlowSandboxTarget(target) || rootTargetId && target.parentFrameId && target.parentFrameId !== rootTargetId || !target.targetId) continue;
					if (this.childSessions.has(target.targetId)) continue;
					const attached = await this.command("Target.attachToTarget", {
						targetId: target.targetId,
						flatten: false
					}).catch((error) => {
						diagnostics.add(`${target.url || "iframe"}: attach failed: ${error instanceof Error ? error.message : String(error)}`);
					});
					const sessionId = String(attached?.sessionId || "");
					if (!sessionId) continue;
					this.childSessions.set(target.targetId, sessionId);
					this.childTargets.set(target.targetId, {
						targetId: target.targetId,
						type: "iframe",
						url: target.url,
						parentId: target.parentFrameId
					});
				}
			}
			const candidates = Array.from(this.childTargets.values()).filter((info) => isFlowSandboxTarget(info) && (!rootTargetId || !info.parentId || info.parentId === rootTargetId));
			let freshEmptyCandidate;
			for (const candidate of candidates) {
				this.innerSessionId = String(this.childSessions.get(candidate.targetId) || "");
				if (!this.innerSessionId) continue;
				try {
					await this.innerCommand("Runtime.enable");
					const title = String(await this.evaluateInner("document.title").catch(() => ""));
					const body = String(await this.evaluateInner("document.body?.innerText?.slice(0, 800) || ''").catch(() => ""));
					diagnostics.add(`${candidate.url}: ${title} ${body}`.trim());
					if (/^Flow App(?:\s|$)/i.test(title) || title === "" || title === "about:srcdoc") {
						if (await this.evaluateInner(bridgePreviewReadyExpression) || /studio shot bridge/i.test(body) || /relay bridge/i.test(body)) return;
						if (isFreshRelayRuntime(this.trustedRuntimeUrl) && title !== "") freshEmptyCandidate = candidate;
					}
				} catch (error) {
					diagnostics.add(`${candidate.url || "iframe"}: evaluate failed: ${error instanceof Error ? error.message : String(error)}`);
				}
				this.innerSessionId = "";
			}
			if (freshEmptyCandidate) {
				this.innerSessionId = String(this.childSessions.get(freshEmptyCandidate.targetId) || "");
				if (this.innerSessionId) return;
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error(`Studio Shot Bridge sandbox target was not found: ${JSON.stringify(Array.from(diagnostics).slice(0, 5))}`);
	}
	async rootDocumentIdentity() {
		const frame = (await this.command("Page.getFrameTree").catch(() => ({}))).frameTree?.frame;
		return {
			frameId: String(frame?.id || ""),
			documentEpoch: String(frame?.loaderId || "")
		};
	}
	async captureTrustedDocumentIdentity() {
		const identity = await this.rootDocumentIdentity();
		this.trustedFrameId = identity.frameId;
		this.trustedDocumentEpoch = identity.documentEpoch;
	}
	async attachAndDiscover() {
		console.log("[DEBUG] attachAndDiscover started");
		const initialTab = await chrome.tabs.get(this.tabId).catch(() => void 0);
		const runtimeUrl = String(initialTab?.url || "");
		if (/\/tools\/flow\/project\/[^/]+\/tool\//i.test(runtimeUrl) && !/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)/i.test(runtimeUrl)) throw new Error("Studio Shot Bridge đang mở ở bản DRAFT /tool/. Hãy mở Công cụ → PDL Studio Shot Bridge, hoàn tất chỉnh sửa và bấm Xong để mở bản runtime /tool-version/ đã publish trước khi tạo video.");
		this.trustedRuntimeUrl = canonicalFlowRoute(runtimeUrl);
		await Promise.race([chrome.debugger.attach(this.debugTarget, "1.3"), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("Chrome DevTools debugger attach timed out; another debugger may still own the Flow tab.")), 1e4))]);
		chrome.debugger.onEvent.addListener(this.handleTargetEvent);
		await this.command("Runtime.enable");
		await this.command("Page.enable");
		await this.command("Target.setAutoAttach", {
			autoAttach: true,
			waitForDebuggerOnStart: false,
			flatten: false
		});
		if (await this.evaluate(`(() => [...document.querySelectorAll('iframe')].some((frame) => /\/flow-applet-runner\/shim\.html(?:[?#]|$)/i.test(String(frame.src || ''))))()`).catch(() => false) || isFreshRelayRuntime(runtimeUrl)) {
			this.topLevelRelay = true;
			await this.captureTrustedDocumentIdentity();
			return;
		}
		const existingRootFrame = await this.command("Page.getFrameTree").catch(() => ({}));
		try {
			await this.discoverChildSandbox(String(existingRootFrame.frameTree?.frame?.id || ""));
			await this.captureTrustedDocumentIdentity();
			return;
		} catch {
			this.innerSessionId = "";
			this.childSessions.clear();
			this.childTargets.clear();
		}
		await chrome.tabs.reload(this.tabId);
		try {
			await runtime.waitForTabComplete(this.tabId, 2e4);
		} catch {
			runtime.sendStatus(this.job.jobId, "opening_provider", "Flow vẫn đang tải nền; tiếp tục kiểm tra iframe Studio Shot Bridge...", .2);
		}
		const afterReload = await chrome.tabs.get(this.tabId).catch(() => void 0);
		if (/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+/i.test(runtimeUrl) && !/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+/i.test(String(afterReload?.url || ""))) {
			runtime.sendStatus(this.job.jobId, "opening_provider", "Flow đã chuyển về workspace; đang mở lại đúng Studio Shot Bridge runtime...", .22);
			await chrome.tabs.update(this.tabId, { url: runtimeUrl });
			await runtime.waitForTabComplete(this.tabId, 3e4).catch(() => void 0);
		}
		console.log("[DEBUG] attachAndDiscover: Waiting 1800ms before discovering iframe");
		await new Promise((resolve) => setTimeout(resolve, 1800));
		await new Promise((resolve) => setTimeout(resolve, 500));
		if (await this.connectRemoteSandbox()) {
			await this.captureTrustedDocumentIdentity();
			return;
		}
		const rootFrame = await this.command("Page.getFrameTree");
		console.log("[DEBUG] attachAndDiscover: discoverChildSandbox called");
		await this.discoverChildSandbox(String(rootFrame.frameTree?.frame?.id || ""));
		console.log("[DEBUG] attachAndDiscover: discoverChildSandbox finished");
		await this.captureTrustedDocumentIdentity();
		console.log("[DEBUG] attachAndDiscover: done");
	}
	async primeMedia(references) {
		const response = await chrome.tabs.sendMessage(this.tabId, {
			action: "PRIME_FLOW_MEDIA",
			jobId: this.job.jobId,
			references
		}).catch((error) => ({
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		}));
		if (!response?.ok) {
			const detail = String(response?.error || "content script did not respond");
			if (/primeFlowSdkMedia\([^)]*\)\.then is not a function/i.test(detail)) throw new Error("Studio Shot Bridge is running an older media-selection implementation. Open the Flow tool in Edit, apply the latest update, click Xong, then reopen the canonical tool before retrying.");
			throw new Error(`Studio Shot Bridge could not prepare Flow media selection: ${detail}`);
		}
	}
	async validateSelectedStoryboard(keyframe) {
		const expected = `data:${keyframe.mimeType || "image/png"};base64,${String(keyframe.base64).replace(/^data:[^,]+,/, "")}`;
		const validation = await this.evaluateInner(`(async () => {
      const actual = document.querySelector('img[alt="Storyboard"]'); if (!actual?.src) return { passed: false, error: "preview missing" };
      const load = (source) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
      try { const source = await load(${JSON.stringify(expected)}); const pixels = (image) => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 32, 18); return context.getImageData(0, 0, 32, 18).data; };
        const first = pixels(source); const second = pixels(actual); let difference = 0; for (let index = 0; index < first.length; index += 4) for (let channel = 0; channel < 3; channel++) difference += Math.abs(first[index + channel] - second[index + channel]);
        const normalizedMae = difference / (32 * 18 * 3 * 255); return { passed: normalizedMae <= 0.08, normalizedMae };
      } catch (error) { return { passed: false, error: String(error) }; }
    })()`);
		if (!validation?.passed) throw new Error(`Studio Shot Bridge selected storyboard does not match the requested keyframe (${JSON.stringify(validation)}).`);
		runtime.sendStatus(this.job.jobId, "submitting", `Verified selected storyboard fingerprint (MAE ${Number(validation.normalizedMae || 0).toFixed(4)}).`, .5);
	}
	async attachStoryboardMedia() {
		if (!await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Select Storyboard Image")) await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Connect Storyboard");
		try {
			await this.waitInner("Boolean(document.querySelector('img[alt=\"Storyboard\"]'))", 9e4, "storyboard media");
		} catch (error) {
			const selectionError = await this.evaluateInner(`(() => { const errors = globalThis.__studioFlowSelectionErrors; return errors && typeof errors === "object" ? errors[${JSON.stringify(this.job.jobId)}] || "" : ""; })()`).catch(() => "");
			if (selectionError) throw new Error(`Studio Shot Bridge media selection failed: ${selectionError}`);
			const runtimeState = await this.evaluateInner(`(() => { const text = String(document.body?.innerText || ""); const bridgeShell = /studio shot bridge/i.test(text); return JSON.stringify({ draft: /\\bDRAFT\\b/i.test(text), bridgeShell, storyboardReady: Boolean(document.querySelector('img[alt=\\"Storyboard\\"]')), references: document.querySelectorAll('img[alt^=\\"Reference\\"]').length }); })()`).catch(() => "{}");
			let parsed = {};
			try {
				parsed = JSON.parse(String(runtimeState));
			} catch {}
			if (parsed.draft && !parsed.bridgeShell && !parsed.storyboardReady && Number(parsed.references || 0) === 0) throw new Error("Studio Shot Bridge đang chạy trong Flow editor bản DRAFT. Hãy mở Công cụ → PDL Studio Shot Bridge, bấm Xong để lưu, rồi mở lại bản runtime /tool-version/ trước khi tạo video.");
			throw error;
		}
	}
	async clearStaleVisualReferences() {
		await this.evaluateInner(`(async () => {
      const section = () => [...document.querySelectorAll('div,section')].find((item) => /(?:VISUAL REFERENCES|TÀI NGUYÊN TRỰC QUAN)\\s*\\(\\s*\\d+\\s*\\//i.test(String(item.innerText || '')));
      const closeLabels = /^(?:close|đóng|x)$/i;
      for (let pass = 0; pass < 12; pass += 1) {
        const root = section();
        if (!root) break;
        const buttons = [...root.querySelectorAll('button, [role="button"]')].filter((item) => {
          const label = String(item.getAttribute('aria-label') || item.getAttribute('title') || item.innerText || '').trim();
          return closeLabels.test(label) && item.getBoundingClientRect().width > 2;
        });
        if (!buttons.length) break;
        buttons[buttons.length - 1].click();
        await new Promise((resolve) => setTimeout(resolve, 320));
      }
      return true;
    })()`);
	}
	async prepareMedia(keyframe, references) {
		await this.waitInner(bridgePreviewReadyExpression, 2e4, "Studio Shot Bridge controls");
		await this.evaluateInner(`(() => {
      const errors = globalThis.__studioFlowSelectionErrors || (globalThis.__studioFlowSelectionErrors = {});
      window.addEventListener("message", (event) => { const payload = event.data?.payload; if (event.data?.type === "FLOW_RESPONSE" && payload?.error) errors[${JSON.stringify(this.job.jobId)}] = String(payload.error); }, true);
      const flow = globalThis.Flow;
      if (!flow?.media || typeof flow.media.select !== "function" || flow.media.select.__studioBridgeShim) return Boolean(flow?.media?.select);
      const select = () => new Promise((resolve, reject) => {
        const id = "studio-media-" + Math.random().toString(36).slice(2);
        const onMessage = (event) => {
          if (event.data?.type !== "FLOW_RESPONSE" || event.data?.id !== id) return;
          window.removeEventListener("message", onMessage);
          const payload = event.data?.payload || {};
          payload.error ? reject(new Error(String(payload.error))) : resolve(payload);
        };
        window.addEventListener("message", onMessage);
        window.parent.postMessage({ type: "FLOW_SELECT_MEDIA", id, payload: { filter: "image" } }, "*");
        setTimeout(() => { window.removeEventListener("message", onMessage); reject(new Error("Studio media selection timed out.")); }, 30_000);
      });
      select.__studioBridgeShim = true;
      flow.media.select = select;
      return true;
    })()`);
		await this.attachStoryboardMedia();
		await this.validateSelectedStoryboard(keyframe);
		await this.clearStaleVisualReferences();
		for (let index = 0; index < references.length; index++) {
			await this.waitInner(`(() => [...document.querySelectorAll('button, [role="button"]')].some((item) => {
        const text = String(item.innerText || item.textContent || item.getAttribute('aria-label') || '').trim();
        const rect = item.getBoundingClientRect();
        const labelled = /(?:add reference|thêm tham chiếu)/i.test(text);
        // Flow renders this control as a Material icon in some locales/builds
        // (the text "add") and changes the number of wrapper elements when a selected
        // tile hydrates. Walk a few ancestors instead of assuming a fixed
        // parent depth, while still requiring the Visual References section
        // context so unrelated add buttons cannot satisfy the wait.
        let context = '';
        let ancestor = item.parentElement;
        for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) context += ' ' + String(ancestor.innerText || ancestor.textContent || '');
        const iconAdd = (text === 'add' || text === '+') && /(?:visual references|tài nguyên trực quan)/i.test(context);
        return (labelled || iconAdd) && !item.disabled && item.getAttribute('aria-disabled') !== 'true' && rect.width > 2 && rect.height > 2;
      }))()`, 2e4, "Add Reference control");
			await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Add Reference");
			if (!/\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)/i.test(String(this.job.providerWorkspaceUrl || this.job.settings?.providerWorkspaceUrl || this.job.flowRuntimeUrl || ""))) {
				const reference = references[index];
				chrome.tabs.sendMessage(this.tabId, {
					action: "CONFIRM_FLOW_MEDIA",
					filename: reference.filename || reference.filePath || ""
				}).catch(() => void 0);
			}
			await this.waitInner(`(() => {
        const expected = ${index + 1};
        const labelled = document.querySelectorAll('img[alt^="Reference"]').length;
        const body = String(document.body?.innerText || "");
        const countMatch = body.match(/(?:VISUAL REFERENCES|TÀI NGUYÊN TRỰC QUAN)\\s*\\(\\s*(\\d+)\\s*\\//i);
        const counted = countMatch ? Number(countMatch[1]) : 0;
        const closeButtons = [...document.querySelectorAll('button, [role="button"]')].filter((item) => /^(?:close|đóng|x)$/i.test(String(item.innerText || item.getAttribute('aria-label') || '').trim())).length;
        return labelled >= expected || counted >= expected || closeButtons >= expected;
      })()`, 2e4, `continuity reference ${index + 1}`);
		}
	}
	manifest(keyframe, references, resolvedMediaId = "") {
		const durationSeconds = manifestDuration(this.job.settings);
		const settings = this.job.settings || {};
		const voice = settings.characterVoice && typeof settings.characterVoice === "object" ? settings.characterVoice : null;
		const voiceLock = voice && String(voice.characterId || "").trim() && String(voice.voiceId || "").trim() && String(voice.lockedAt || "").trim() ? {
			characterId: String(voice.characterId),
			voiceId: String(voice.voiceId),
			voiceSignature: String(voice.voiceSignature || `${voice.voiceId}:${voice.characterId}:${settings.outputLanguage || ""}`),
			lockedAt: String(voice.lockedAt || "")
		} : null;
		const sourceMode = String(settings.sourceMode || settings.flowVideoMode || "frames");
		const componentReferences = [keyframe, ...references].map((reference) => String(reference.assetId || "").trim()).filter(Boolean);
		return {
			durationSeconds,
			value: {
				schemaVersion: 2,
				jobId: this.job.jobId,
				projectId: String(settings.projectId || "studio_project"),
				shotId: String(settings.shotId || this.job.jobId),
				prompt: this.job.prompt,
				aspectRatio: String(settings.aspectRatio || "16:9"),
				durationSeconds,
				idempotencyKey: String(settings.idempotencyKey || `${this.job.jobId}:studio-shot-bridge:v1`),
				sourceMode,
				flowVideoMode: sourceMode,
				componentIds: sourceMode === "components" ? componentReferences : void 0,
				quality: String(settings.quality || "fast"),
				modelDisplayName: String(settings.modelDisplayName || "Omni Flash"),
				outputResolution: String(settings.outputResolution || "720p"),
				generateAudio: settings.generateAudio === true,
				characterVoice: settings.characterVoice || null,
				audioPolicy: String(settings.audioPolicy || (settings.generateAudio === true ? "native_audio" : "separate_audio_pass")),
				voiceLock,
				fe_id: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || keyframe.flowMediaId || ""),
				imageMediaId: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || keyframe.flowMediaId || ""),
				references: [{
					assetId: String(keyframe.assetId || ""),
					mediaId: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || keyframe.flowMediaId || ""),
					imageMediaId: String(resolvedMediaId || settings.flowMediaId || settings.imageMediaId || keyframe.flowMediaId || ""),
					role: "storyboard"
				}],
				outputLanguage: String(settings.outputLanguage || "Vietnamese"),
				shotSpec: settings.shotSpec || null,
				referenceRoles: Object.fromEntries([keyframe, ...references].map((reference) => [reference.assetId, reference.referenceRole || "style"]))
			}
		};
	}
	async configure(manifest, durationSeconds) {
		await this.evaluateInner(`(() => {
      const setValue = (element, value) => { const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); };
      const textareas = [...document.querySelectorAll("textarea")]; setValue(textareas[0], ${JSON.stringify(JSON.stringify(manifest, null, 2))});
      setValue(textareas.find((item) => /cinematic action/i.test(item.placeholder)), ${JSON.stringify(this.job.prompt)});
      const durationInput = document.querySelector('input[type="number"]'); if (durationInput) setValue(durationInput, ${JSON.stringify(String(durationSeconds))}); return true;
    })()`);
		await this.waitInner("/\\bREADY\\b/.test(document.body.innerText) && /MODE:\\s*I2V/i.test(document.body.innerText)", 2e4, "I2V preflight");
		const voice = this.job.settings?.characterVoice;
		if (!voice) return;
		if (!await this.evaluateInner(`(() => { try { const value = document.querySelector('textarea')?.value || ''; const manifest = JSON.parse(value); return manifest.characterVoice?.voiceId === ${JSON.stringify(voice.voiceId)} && manifest.characterVoice?.characterId === ${JSON.stringify(voice.characterId)}; } catch { return false; } })()`)) throw new Error(`Studio Shot Bridge did not retain requested voice ${voice.voiceId} for character ${voice.characterId}.`);
	}
	async resolveFreshRelayMediaId(settings, keyframe) {
		let mediaId = String(settings.flowMediaId || settings.imageMediaId || keyframe.flowMediaId || "");
		if (mediaId) return mediaId;
		const runtimeUrl = String(this.job.providerWorkspaceUrl || this.job.settings?.providerWorkspaceUrl || this.job.flowRuntimeUrl || "");
		const projectId = (() => {
			try {
				return new URL(runtimeUrl).pathname.match(/\/project\/([^/]+)/i)?.[1] || "";
			} catch {
				return "";
			}
		})();
		const base = (await chrome.tabs.query({ url: [
			"https://labs.google/fx/*",
			"https://labs.google.com/fx/*",
			"https://flow.google.com/project/*"
		] })).filter((tab) => {
			if (!tab.id || !tab.url || /\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)/i.test(tab.url)) return false;
			try {
				return !projectId || new URL(tab.url).pathname.replace(/\/$/, "").endsWith(`/project/${projectId}`);
			} catch {
				return false;
			}
		}).sort((left, right) => Number(new URL(String(right.url)).hostname === "flow.google.com") - Number(new URL(String(left.url)).hostname === "flow.google.com"))[0];
		if (!base?.id) throw new Error("Fresh Flow Video Relay Bridge needs a project media id for I2V: Flow workspace base tab was not found beside the published relay runtime.");
		try {
			try {
				await chrome.tabs.sendMessage(base.id, { action: "PING_STUDIO_ADAPTER" });
			} catch {
				await chrome.tabs.reload(base.id, { bypassCache: false });
				await runtime.waitForTabComplete(base.id, 2e4);
				await chrome.tabs.sendMessage(base.id, { action: "PING_STUDIO_ADAPTER" });
			}
			const resolved = await chrome.tabs.sendMessage(base.id, {
				action: "RESOLVE_FLOW_REFERENCE",
				jobId: this.job.jobId,
				reference: keyframe,
				preferDirectUpload: true
			});
			if (resolved?.ok && resolved.mediaId) mediaId = String(resolved.mediaId);
			else throw new Error(String(resolved?.error || "workspace reference resolver returned no media id"));
		} catch (error) {
			throw new Error(`Fresh Flow Video Relay Bridge needs a project media id for I2V: ${error instanceof Error ? error.message : String(error)}`);
		}
		return mediaId;
	}
	/** Configure the fresh Flow Video Relay Bridge form.  Its contract is
	* deliberately smaller than the removed picker-based app: manifest JSON,
	* optional Gallery media id, aspect ratio, and duration. */
	async configureFreshRelay(manifest, durationSeconds, keyframe, resolvedMediaId = "") {
		const settings = this.job.settings || {};
		if (!await this.evaluateInner(`(async () => {
      const root = document.getElementById("root");
      if (!root || root.childElementCount > 0) return true;
      try {
        const appModule = await import("@app");
        const react = await import("react");
        const renderer = await import("react-dom/client");
        const component = appModule.default || appModule.App;
        if (!component) return false;
        renderer.createRoot(root).render(react.createElement(component));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return root.childElementCount > 0;
      } catch (error) {
        console.warn("[Studio] Flow relay applet mount fallback failed", error);
        return false;
      }
    })()`)) throw new Error("Flow Video Relay Bridge applet did not mount in the runtime preview.");
		const mediaId = resolvedMediaId || await this.resolveFreshRelayMediaId(settings, keyframe);
		const aspectRatio = String(settings.aspectRatio || "16:9");
		await this.evaluateInner(`(() => {
      const setValue = (element, value) => {
        if (!element) return false;
        const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      const area = document.querySelector("textarea");
      setValue(area, ${JSON.stringify(JSON.stringify(manifest, null, 2))});
      const media = [...document.querySelectorAll("input")].find((item) => /media.?id/i.test(String(item.placeholder || item.getAttribute("aria-label") || "")));
      if (${JSON.stringify(mediaId)}) setValue(media, ${JSON.stringify(mediaId)});
      const clickText = (value) => [...document.querySelectorAll("button")].find((item) => String(item.textContent || "").trim() === value)?.click();
      clickText(${JSON.stringify(aspectRatio)});
      clickText(${JSON.stringify(`${durationSeconds}s`)});
      // Relay v2 accepts the request through the iframe parent channel. Keep
      // the fields both top-level and inside payload so published tool
      // revisions with either envelope shape remain interoperable. This is
      // intake only; the separate authorize/generate action remains gated in
      // the tool and is still issued at most once by generateFreshRelay().
      const request = ${JSON.stringify(createFlowRelayRequest({
			sessionId: String(this.job.settings?.sessionId || "studio-session"),
			correlationId: `${this.job.jobId}:relay-v2`,
			idempotencyKey: String(manifest.idempotencyKey || ""),
			manifest
		}))};
      const runner = [...document.querySelectorAll("iframe")].find((item) => /flow-applet-runner\/shim\.html/i.test(String(item.getAttribute("src") || "")));
      if (!runner?.contentWindow) return false;
      runner.contentWindow.postMessage(request, "*");
      // The published v3 relay has an explicit two-step guard: intake ACK is
      // not authorization. Send the matching authorization only after the
      // request has been delivered, so its Generate control can become ready
      // without weakening the tool's no-credit-on-request invariant.
      const authorize = {
        source: "rtk-ai-video-studio",
        protocolVersion: 2,
        type: "STUDIO_SHOT_AUTHORIZE",
        sessionId: String(${JSON.stringify(String(this.job.settings?.sessionId || "studio-session"))}),
        correlationId: ${JSON.stringify(`${this.job.jobId}:relay-v2`)},
        jobId: ${JSON.stringify(String(manifest.jobId || ""))},
        idempotencyKey: ${JSON.stringify(String(manifest.idempotencyKey || ""))},
        payload: { jobId: ${JSON.stringify(String(manifest.jobId || ""))}, idempotencyKey: ${JSON.stringify(String(manifest.idempotencyKey || ""))} }
      };
      // Let the relay commit its validating/ready state and emit its ACK
      // before the second protocol message is delivered. This avoids batching
      // request and authorization against the same stale React closure.
      setTimeout(() => {
        const liveRunner = [...document.querySelectorAll("iframe")].find((item) => /flow-applet-runner\/shim\.html/i.test(String(item.getAttribute("src") || "")));
        liveRunner?.contentWindow?.postMessage(authorize, "*");
      }, 350);
      return Boolean(area && runner?.contentWindow);
    })()`);
		await this.waitInner(`(() => {
      const area = document.querySelector("textarea");
      const media = [...document.querySelectorAll("input")].find((item) => /media.?id/i.test(String(item.placeholder || item.getAttribute("aria-label") || "")));
      let parsed = null; try { parsed = JSON.parse(area?.value || ""); } catch {}
      const generate = [...document.querySelectorAll("button")].find((item) => /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(String(item.textContent || "")));
      // V3 exposes the accepted manifest as read-only JSON rather than the
      // legacy textarea/media-input pair. Its enabled Generate control is the
      // authoritative post-authorize readiness signal.
      if (!area) return Boolean(generate && !generate.disabled && /(?:READY|AUTHORIZED|GENERATE VIDEO)/i.test(String(document.body?.innerText || "")));
      const manifestMediaId = String(parsed?.fe_id || parsed?.imageMediaId || parsed?.flowMediaId || "");
      const mediaMatches = !media ? manifestMediaId === ${JSON.stringify(mediaId)} : String(media.value || "") === ${JSON.stringify(mediaId)};
      return parsed?.jobId === ${JSON.stringify(String(manifest.jobId || ""))} && mediaMatches && Boolean(generate && !generate.disabled);
    })()`, 2e4, "fresh Flow relay controls");
	}
	async generateFreshRelay() {
		if (this.job.settings?.preflightOnly === true) {
			runtime.sendToDesktop({
				type: "JOB_RESULT",
				jobId: this.job.jobId,
				status: "waiting_manual_action",
				assets: [],
				error: "Fresh Flow relay preflight passed without submitting or spending credit."
			});
			return null;
		}
		const baseline = await this.evaluateInner(`(() => {
      const candidates = [...document.querySelectorAll("pre, code, textarea")].map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "")).filter((value) => value.includes("base64") || value.includes("mediaId") || value.includes("media_id"));
      let parsed = null; for (const value of candidates) { try { const next = JSON.parse(value); if (next?.base64 || next?.mediaId || next?.media_id) { parsed = next; break; } } catch {} }
      const encoded = typeof parsed?.base64 === "string" ? parsed.base64.replace(/^data:[^,]+,/, "") : "";
      return { mediaId: String(parsed?.mediaId || parsed?.media_id || ""), bytesFingerprint: encoded ? encoded.length + ":" + encoded.slice(0, 24) + ":" + encoded.slice(-24) : "", videoReady: Boolean(document.querySelector("video")?.currentSrc) };
    })()`);
		await this.waitInner(`(() => [...document.querySelectorAll("button")].some((item) => /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(String(item.textContent || "")) && !item.disabled && item.getBoundingClientRect().width > 2 && item.getBoundingClientRect().height > 2))()`, 1e4, "fresh Flow relay generate control");
		if (!await this.evaluateInner(`(() => {
      const buttons = [...document.querySelectorAll("button")];
      const target = buttons.find((item) => /(?:GENERATE VIDEO|EXECUTE RELAY JOB|TRIGGER RELAY)/i.test(String(item.textContent || "")) && !item.disabled && item.getBoundingClientRect().width > 2 && item.getBoundingClientRect().height > 2);
      if (!target) return false;
      target.click();
      return true;
    })()`)) throw new Error("Fresh Flow Video Relay Bridge generate control was not ready.");
		runtime.sendStatus(this.job.jobId, "generating", "Generating through the new Flow Video Relay Bridge...", .75);
		await this.waitInner(`(() => {
      // Do not scan body.innerText here: the SDK result can contain a multi-MB
      // base64 payload and makes every CDP poll needlessly expensive. Read the
      // small status label outside the result payload instead.
      const statusText = [...document.querySelectorAll("[role='status'], span, h1, h2, h3, p, label")]
        .map((item) => String(item.textContent || "").trim()).filter((value) => value.length < 120).join(" ");
      if (/\\bFAILED\\b/i.test(statusText)) return true; if (!/\\bCOMPLETED\\b/i.test(statusText)) return false;
      const candidates = [...document.querySelectorAll("pre, code, textarea")].map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "")).filter((value) => value.includes("base64") || value.includes("mediaId") || value.includes("media_id"));
      let parsed = null; for (const value of candidates) { try { const next = JSON.parse(value); if (next?.base64 || next?.mediaId || next?.media_id) { parsed = next; break; } } catch {} }
      const mediaId = String(parsed?.mediaId || parsed?.media_id || ""); const encoded = typeof parsed?.base64 === "string" ? parsed.base64.replace(/^data:[^,]+,/, "") : "";
      const fingerprint = encoded ? encoded.length + ":" + encoded.slice(0, 24) + ":" + encoded.slice(-24) : "";
      return Boolean((mediaId && mediaId !== ${JSON.stringify(String(baseline?.mediaId || ""))}) || (fingerprint && fingerprint !== ${JSON.stringify(String(baseline?.bytesFingerprint || ""))}) || (document.querySelector("video")?.currentSrc && !${JSON.stringify(Boolean(baseline?.videoReady))}));
    })()`, FLOW_RESULT_TIMEOUT_MS, "fresh Flow relay result");
		if (await this.evaluateInner(`(() => [...document.querySelectorAll("[role='status'], span, h1, h2, h3, p, label")]
      .map((item) => String(item.textContent || "").trim()).filter((value) => value.length < 120).join(" ")
      .match(/\\bFAILED\\b/i))()`)) {
			const detail = await this.evaluateInner(`(() => {
        const values = [...document.querySelectorAll("pre, code, textarea, [role='status']")]
          .map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "").trim())
          .filter((value) => value && /error|failed|message|reason|code/i.test(value));
        return values.sort((left, right) => right.length - left.length)[0] || "";
      })()`).catch(() => "");
			const compact = String(detail || "").replace(/\\s+/g, " ").trim().slice(0, 1200);
			throw new Error(`Fresh Flow Video Relay Bridge reported FAILED${compact ? `: ${compact}` : "."}`);
		}
		return await this.evaluateInner(`(async () => {
      const video = document.querySelector("video");
      let videoUrl = video?.currentSrc || video?.src || video?.getAttribute("src") || "";
      // Flow renders the real result as a blob:null URL inside the sandbox.
      // That URL is not readable by Electron or the extension after the CDP
      // session closes, so materialize it in the sandbox before handoff.
      if (/^blob:/i.test(videoUrl)) {
        try {
          const response = await fetch(videoUrl);
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
          videoUrl = "data:" + (response.headers.get("content-type") || "video/mp4") + ";base64," + btoa(binary);
        } catch {}
      }
      const candidates = [...document.querySelectorAll("pre, code")]
        .map((item) => item instanceof HTMLTextAreaElement ? item.value : String(item.textContent || "").trim())
        .filter((value) => value.includes("base64") && value.length > 100);
      let payload = "", parsed = null;
      for (const raw of candidates.sort((a, b) => b.length - a.length)) {
        const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
        const candidate = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
        try { const value = JSON.parse(candidate); if (typeof value?.base64 === "string" || value?.mediaId || value?.media_id) { payload = candidate; parsed = value; break; } } catch {}
      }
      const encoded = typeof parsed?.base64 === "string" ? parsed.base64.replace(/^data:[^,]+,/, "") : "";
      return { video: videoUrl || (encoded ? "data:video/mp4;base64," + encoded : ""), payload };
    })()`);
	}
	async generate() {
		if (this.job.settings?.preflightOnly === true) {
			runtime.sendToDesktop({
				type: "JOB_RESULT",
				jobId: this.job.jobId,
				status: "waiting_manual_action",
				assets: [],
				error: "Studio Shot Bridge I2V preflight passed without submitting or spending credit."
			});
			return null;
		}
		if (!await this.evaluateInner("__STUDIO_CLICK_BUTTON__:Authorize Generation")) throw new Error("Studio Shot Bridge authorization control was not ready.");
		runtime.sendStatus(this.job.jobId, "generating", "Generating through Flow SDK in Studio Shot Bridge...", .75);
		await this.waitInner("/\\bCOMPLETED\\b|\\bFAILED\\b/.test(document.body.innerText)", FLOW_RESULT_TIMEOUT_MS, "Flow SDK result");
		if (await this.evaluateInner("/\\bFAILED\\b/.test(document.body.innerText)")) throw new Error("Google Flow SDK failed after authorization.");
		const result = await this.evaluateInner(`(() => {
      const video = document.querySelector("video");
      // Flow may expose the generated artifact through currentSrc/blob URL
      // without retaining a literal src attribute on the element.
      const videoUrl = video?.currentSrc || video?.src || video?.getAttribute("src") || "";
      const textNodes = [...document.querySelectorAll("pre, code, textarea, [data-testid], [role='status']")]
        .map((item) => item instanceof HTMLTextAreaElement ? item.value : item.textContent || "");
      const payload = textNodes.find((text) => text.includes('"media_id"') || text.includes('"provider_id"')) || "";
      return { video: videoUrl, payload };
    })()`);
		if (!result?.video) throw new Error("Studio Shot Bridge completed without video data.");
		return result;
	}
	async revalidateBeforeSubmit(manifest) {
		const currentTab = await chrome.tabs.get(this.tabId).catch(() => void 0);
		const currentDocument = await this.rootDocumentIdentity();
		const route = validateFlowSubmitContext({
			expectedRuntimeUrl: this.trustedRuntimeUrl || this.job.flowRuntimeUrl,
			currentUrl: String(currentTab?.url || ""),
			expectedWorkspaceUrl: String(this.job.providerWorkspaceUrl || this.job.settings?.providerWorkspaceUrl || ""),
			expectedFrameId: this.trustedFrameId,
			currentFrameId: currentDocument.frameId,
			expectedDocumentEpoch: this.trustedDocumentEpoch,
			currentDocumentEpoch: currentDocument.documentEpoch,
			expectedAccountHint: String(this.job.settings?.accountHint || ""),
			currentAccountHint: String(this.job.settings?.currentAccountHint || "")
		});
		if (!route.ok) throw new Error(`Flow submit blocked before authorization (${route.code}). The published Studio Shot Bridge route changed; no provider submit was attempted.`);
		const observed = await this.evaluateInner(`(() => { try { const value = document.querySelector("textarea")?.value || ""; const parsed = JSON.parse(value); return { jobId: String(parsed.jobId || ""), idempotencyKey: String(parsed.idempotencyKey || "") }; } catch { return null; } })()`);
		if (!observed || observed.jobId !== String(manifest.jobId || "") || observed.idempotencyKey !== String(manifest.idempotencyKey || "")) throw new Error("Flow submit blocked before authorization (manifest_changed). The composer no longer contains this job identity; no provider submit was attempted.");
	}
	async validateGeneratedStartFrame(keyframe) {
		const expected = `data:${keyframe.mimeType || "image/png"};base64,${String(keyframe.base64).replace(/^data:[^,]+,/, "")}`;
		return this.evaluateInner(`(async () => {
      const video = document.querySelector('video[src]'); if (!video?.src) return { passed: false, error: "video missing" };
      try { const storyboard = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = ${JSON.stringify(expected)}; });
        if (video.readyState < 2) await new Promise((resolve, reject) => { video.addEventListener('loadeddata', resolve, { once: true }); video.addEventListener('error', reject, { once: true }); });
        if (video.currentTime !== 0) await new Promise((resolve) => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0; });
        const luma = (media) => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18; const context = canvas.getContext('2d'); context.drawImage(media, 0, 0, 32, 18); const pixels = context.getImageData(0, 0, 32, 18).data; const values = []; for (let index = 0; index < pixels.length; index += 4) values.push(.299 * pixels[index] + .587 * pixels[index + 1] + .114 * pixels[index + 2]); return values; };
        const correlation = (a, b) => { const am = a.reduce((sum, value) => sum + value, 0) / a.length; const bm = b.reduce((sum, value) => sum + value, 0) / b.length; let n = 0, av = 0, bv = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - am, y = b[i] - bm; n += x * y; av += x * x; bv += y * y; } return n / Math.sqrt(av * bv); };
        const edges = (values) => values.map((value, index) => index % 32 === 31 || index >= values.length - 32 ? 0 : Math.abs(values[index + 1] - value) + Math.abs(values[index + 32] - value));
        const first = luma(storyboard), second = luma(video); const lumaCorrelation = correlation(first, second), edgeCorrelation = correlation(edges(first), edges(second)); return { passed: lumaCorrelation >= .55 && edgeCorrelation >= .4, lumaCorrelation, edgeCorrelation };
      } catch (error) { return { passed: false, error: String(error) }; }
    })()`);
	}
	async deliverResult(result, keyframe, durationSeconds, startFrameValidation, executor = "chrome-cdp-v1") {
		let rawIntegration = {};
		try {
			rawIntegration = JSON.parse(result.payload || "{}");
		} catch {}
		const integration = normalizeFlowRelayIntegration(rawIntegration);
		const hasProviderMetadata = Boolean(integration.providerJobId && integration.mediaId);
		const aspectRatio = String(this.job.settings?.aspectRatio || "16:9");
		const fallbackWidth = aspectRatio === "9:16" ? 720 : 1280;
		const fallbackHeight = aspectRatio === "9:16" ? 1280 : 720;
		const videoSource = /^blob:/i.test(String(result.video || "")) && typeof integration.base64 === "string" ? `data:video/mp4;base64,${integration.base64}` : result.video;
		await runtime.handleContentResult({
			type: "JOB_RESULT",
			jobId: this.job.jobId,
			status: hasProviderMetadata ? "done" : "review_required",
			assets: [{
				type: "video",
				filePath: videoSource,
				mimeType: "video/mp4",
				provider: "google-flow",
				filename: `studio-shot-bridge-${this.job.jobId}.mp4`,
				metadata: {
					studioJobId: this.job.jobId,
					currentJobOnly: true,
					startFrameAssetId: keyframe.assetId,
					aspectRatio,
					width: Number(integration.metadata?.width || fallbackWidth),
					height: Number(integration.metadata?.height || fallbackHeight),
					durationSeconds: Number(integration.metadata?.duration || durationSeconds),
					providerJobId: integration.providerJobId,
					flowMediaId: integration.mediaId,
					flowCustomToolExecutor: executor,
					storage: "data_url",
					startFrameValidation,
					...integration.sourceMode ? { sourceMode: integration.sourceMode } : {},
					...integration.quality ? { quality: integration.quality } : {},
					...integration.audioPolicy ? { audioPolicy: integration.audioPolicy } : {},
					...typeof integration.voiceLockVerified === "boolean" ? { voiceLockVerified: integration.voiceLockVerified } : {},
					...integration.voiceLock ? { voiceLock: integration.voiceLock } : {},
					...integration.outputLanguage ? { outputLanguage: integration.outputLanguage } : {},
					...integration.outputResolution ? { outputResolution: integration.outputResolution } : {},
					providerIdentitySource: rawIntegration.provider_id || rawIntegration.providerJobId ? "provider-run-id" : "flow-relay-media-id",
					providerMetadataComplete: hasProviderMetadata,
					...hasProviderMetadata ? {} : { reviewReason: "Fresh Flow relay returned video bytes but no provider_id/media_id metadata." }
				}
			}]
		});
	}
	cleanup() {
		for (const pending of this.remotePending.values()) pending.reject(/* @__PURE__ */ new Error("Remote sandbox CDP connection closed."));
		this.remotePending.clear();
		this.remoteSocket?.close();
		chrome.debugger.onEvent.removeListener(this.handleTargetEvent);
		return chrome.debugger.detach(this.debugTarget).catch(() => void 0);
	}
	cancel() {
		this.cancelled = true;
		this.cleanup();
	}
	async run() {
		this.job = {
			...this.job,
			references: await hydrateFlowReferences(this.job.references)
		};
		const { keyframe, references } = this.validateRunInputs();
		try {
			await this.executeRun(keyframe, references);
		} finally {
			await this.cleanup();
		}
	}
	async diagnoseIntake(payload) {
		try {
			await this.attachAndDiscover();
			const runtimeUrl = canonicalFlowRoute(String((await chrome.tabs.get(this.tabId)).url || ""));
			if (runtimeUrl !== canonicalFlowRoute(payload.expectedRuntimeUrl)) throw new Error("Flow diagnostic attached to a different runtime URL.");
			if (!await this.evaluateInner(`(async () => {
        const root = document.getElementById("root");
        if (!root) return false;
        if (root.childElementCount > 0) return true;
        try {
          const appModule = await import("@app"), react = await import("react"), renderer = await import("react-dom/client");
          const component = appModule.default || appModule.App; if (!component) return false;
          renderer.createRoot(root).render(react.createElement(component));
          await new Promise((resolve) => requestAnimationFrame(resolve)); return root.childElementCount > 0;
        } catch { return false; }
      })()`)) throw new Error("Flow diagnostic found the runtime iframe but its app did not mount.");
			const manifestText = JSON.stringify(payload.manifest, null, 2);
			const observed = await this.evaluateInner(`(() => {
        const setValue = (element, value) => { if (!element) return false; const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); return true; };
        const area = document.querySelector("textarea");
        const media = [...document.querySelectorAll("input")].find((item) => /media.?id/i.test(String(item.placeholder || item.getAttribute("aria-label") || "")));
        if (!setValue(area, ${JSON.stringify(manifestText)})) return { appMissing: true };
        setValue(media, ${JSON.stringify(String(payload.mediaId || ""))});
        const clickText = (value) => [...document.querySelectorAll("button")].find((item) => String(item.textContent || "").trim() === value)?.click();
        clickText(${JSON.stringify(payload.aspectRatio)}); clickText(${JSON.stringify(`${payload.durationSec}s`)});
        let parsedManifest = null; try { parsedManifest = JSON.parse(area.value); } catch {}
        const selected = [...document.querySelectorAll("button")].filter((item) => item.getAttribute("aria-pressed") === "true" || item.getAttribute("data-state") === "on" || /selected|active|text-black/i.test(String(item.className || ""))).map((item) => String(item.textContent || "").trim());
        return { appMissing: false, manifestText: area.value, parsedManifest, mediaId: media?.value || "", selected, body: String(document.body?.innerText || "") };
      })()`);
			if (observed?.appMissing) return {
				ok: false,
				diagnosticId: payload.diagnosticId,
				stage: "flow_app_missing",
				runtimeUrl,
				manifestText: "",
				mediaId: "",
				aspectRatio: "",
				durationSec: 0,
				checks: {
					diagnosticId: false,
					manifest: false,
					mediaId: false,
					aspectRatio: false,
					durationSec: false
				}
			};
			const selected = Array.isArray(observed?.selected) ? observed.selected : [];
			const aspectRatio = payload.aspectRatio || "16:9";
			const durationSec = payload.durationSec || 4;
			return evaluateFlowAppDiagnosticReceipt(payload, {
				diagnosticId: payload.diagnosticId,
				runtimeUrl,
				manifestText: String(observed?.manifestText || ""),
				parsedManifest: observed?.parsedManifest || void 0,
				mediaId: String(observed?.mediaId || ""),
				aspectRatio: selected.includes(aspectRatio) ? aspectRatio : "",
				durationSec: selected.includes(`${durationSec}s`) ? durationSec : 0
			});
		} finally {
			await this.cleanup();
		}
	}
	validateRunInputs() {
		const keyframe = findKeyframeReference(this.job.references);
		if (!keyframe?.base64) throw new Error("Studio Shot Bridge requires the encoded shot keyframe.");
		const references = continuityReferences(this.job.references, keyframe);
		validateVoiceInput(this.job.settings);
		return {
			keyframe,
			references
		};
	}
	async validateKeyframeAspect(keyframe) {
		const expected = String(this.job.settings?.aspectRatio || "16:9");
		const [expectedWidth, expectedHeight] = expected.split(":").map(Number);
		if (!expectedWidth || !expectedHeight || !keyframe.base64) return;
		const encoded = String(keyframe.base64).replace(/^data:[^,]+,/, "");
		const localDimensions = pngDimensions(keyframe);
		if (localDimensions && encoded.length > 9e5) {
			const actualRatio = localDimensions.width / localDimensions.height;
			const targetRatio = expectedWidth / expectedHeight;
			if (Math.abs(actualRatio - targetRatio) / targetRatio > .04) throw new Error(`Flow I2V preflight blocked: shot keyframe is ${localDimensions.width}×${localDimensions.height} (${actualRatio.toFixed(4)}), but the job requires ${expected}. Reframe/regenerate the keyframe before submitting; no provider request was sent.`);
			return;
		}
		const actual = await this.evaluateInner(`(async () => {
      const image = new Image();
      const loaded = new Promise((resolve) => { image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => resolve(null); });
      image.src = ${JSON.stringify(`data:${keyframe.mimeType || "image/png"};base64,${encoded}`)};
      return await loaded;
    })()`).catch(() => null);
		const width = Number(actual?.width || 0), height = Number(actual?.height || 0);
		if (!width || !height) throw new Error(`Flow I2V preflight could not read the shot keyframe dimensions for ${expected}.`);
		const actualRatio = width / height;
		const targetRatio = expectedWidth / expectedHeight;
		if (Math.abs(actualRatio - targetRatio) / targetRatio > .04) throw new Error(`Flow I2V preflight blocked: shot keyframe is ${width}×${height} (${actualRatio.toFixed(4)}), but the job requires ${expected}. Reframe/regenerate the keyframe before submitting; no provider request was sent.`);
	}
	async restorePublishedRuntime() {
		const runtimeUrl = String(this.trustedRuntimeUrl || this.job.flowRuntimeUrl || "").trim();
		if (!runtimeUrl || !this.tabId) return;
		const current = await chrome.tabs.get(this.tabId).catch(() => void 0);
		if (!current?.url || /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+/i.test(current.url)) return;
		await chrome.tabs.update(this.tabId, { url: runtimeUrl });
		await runtime.waitForTabComplete(this.tabId, 2e4).catch(() => void 0);
	}
	async runTopLevelRelay(manifest, durationSeconds, mediaId) {
		const correlationId = `${this.job.jobId}:relay-v2`;
		const sessionId = String(this.job.settings?.sessionId || "studio-session");
		const request = createFlowRelayRequest({
			sessionId,
			correlationId,
			idempotencyKey: String(manifest.idempotencyKey || ""),
			manifest
		});
		if (!await this.evaluate(`(() => {
      const key = "__studioRelayMessages";
      window[key] = [];
      window.addEventListener("message", (event) => {
        const value = event.data;
        if (value && value.source === "studio-shot-bridge" && value.protocolVersion === 2) window[key].push(value);
      });
      const frames = [...document.querySelectorAll("iframe")].map((item) => item.contentWindow).filter(Boolean);
      for (const frame of frames) frame.postMessage(${JSON.stringify(request)}, "*");
      return frames.length > 0;
    })()`)) throw new Error("Flow Relay Bridge runner iframe was not found; intake was not dispatched.");
		const readMessages = () => this.evaluate(`(() => window.__studioRelayMessages || [])()`);
		const waitFor = async (types, timeoutMs) => {
			const startedAt = Date.now();
			while (Date.now() - startedAt < timeoutMs) {
				const messages = await readMessages().catch(() => []);
				const match = (Array.isArray(messages) ? messages : []).find((value) => types.includes(String(value?.type || "")) && String(value?.correlationId || "") === correlationId && String(value?.jobId || "") === String(manifest.jobId || ""));
				if (match) return match;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			throw new Error(`Timed out waiting for Flow Relay Bridge ${types.join("/")}.`);
		};
		const ack = await waitFor(["STUDIO_SHOT_ACK"], 2e4);
		if (String(ack.status || "") !== "ready") throw new Error(`Flow Relay Bridge intake rejected the manifest: ${String(ack.error || ack.message || "unknown error")}`);
		const authorize = {
			source: "rtk-ai-video-studio",
			protocolVersion: 2,
			type: "STUDIO_SHOT_AUTHORIZE",
			sessionId,
			correlationId,
			jobId: String(manifest.jobId || ""),
			idempotencyKey: String(manifest.idempotencyKey || ""),
			payload: {
				jobId: String(manifest.jobId || ""),
				idempotencyKey: String(manifest.idempotencyKey || "")
			}
		};
		await this.evaluate(`(() => {
      const frames = [...document.querySelectorAll("iframe")].map((item) => item.contentWindow).filter(Boolean);
      for (const frame of frames) frame.postMessage(${JSON.stringify(authorize)}, "*");
      return frames.length > 0;
    })()`);
		await this.waitInner(`(() => [...document.querySelectorAll("button")].some((item) => /GENERATE VIDEO/i.test(String(item.textContent || "")) && !item.disabled))()`, 2e4, "authorized Flow Relay generate control");
		if (this.job.settings?.preflightOnly === true) {
			runtime.sendToDesktop({
				type: "JOB_RESULT",
				jobId: this.job.jobId,
				status: "waiting_manual_action",
				assets: [],
				error: "Flow Relay protocol preflight passed without submitting or spending credit."
			});
			return null;
		}
		if (!await this.evaluateInner(`(() => {
      const target = [...document.querySelectorAll("button")].find((item) => /GENERATE VIDEO/i.test(String(item.textContent || "")) && !item.disabled);
      if (!target) return false;
      target.click();
      return true;
    })()`)) throw new Error("Flow Relay generate control was not ready after authorization.");
		runtime.sendStatus(this.job.jobId, "generating", "Generating through the published Flow Relay Bridge...", .75);
		const resultMessage = await waitFor(["STUDIO_SHOT_RESULT", "STUDIO_SHOT_ERROR"], FLOW_RESULT_TIMEOUT_MS);
		if (String(resultMessage.type) === "STUDIO_SHOT_ERROR") throw new Error(`Flow Relay Bridge returned ${String(resultMessage.payload?.code || resultMessage.error || "STUDIO_SHOT_ERROR")}.`);
		const payload = resultMessage.payload && typeof resultMessage.payload === "object" ? resultMessage.payload : {};
		const encoded = typeof payload.base64 === "string" ? payload.base64.replace(/^data:[^,]+,/, "") : "";
		const resultVideo = encoded ? `data:${String(payload.mimeType || "video/mp4")};base64,${encoded}` : String(payload.videoUrl || "");
		if (!resultVideo || !String(payload.mimeType || "").toLowerCase().startsWith("video/") || !(payload.providerJobId || payload.mediaId || payload.flowMediaId)) throw new Error("Flow Relay Bridge returned result_unconfirmed: missing real MP4/video bytes or provider metadata.");
		return {
			video: resultVideo,
			payload: JSON.stringify({
				...payload,
				mediaId: payload.mediaId || payload.flowMediaId,
				durationSeconds,
				sourceMode: payload.sourceMode || manifest.sourceMode
			})
		};
	}
	async executeRun(keyframe, references) {
		console.log("[DEBUG] executeRun started");
		await this.attachAndDiscover();
		console.log("[DEBUG] attachAndDiscover finished in executeRun");
		await this.validateKeyframeAspect(keyframe);
		console.log("[DEBUG] validateKeyframeAspect finished");
		const runtimeUrl = String(this.job.flowRuntimeUrl || this.job.settings?.flowRuntimeUrl || "");
		if (this.topLevelRelay) {
			runtime.sendStatus(this.job.jobId, "submitting", "Preparing the Flow Relay Bridge parent-window protocol...", .32);
			const resolvedMediaId = await this.resolveFreshRelayMediaId(this.job.settings || {}, keyframe);
			const configured = this.manifest(keyframe, references, resolvedMediaId);
			const result = await this.runTopLevelRelay(configured.value, configured.durationSeconds, resolvedMediaId);
			if (!result) return;
			await this.deliverResult(result, keyframe, configured.durationSeconds, {
				passed: true,
				mode: "parent-window-relay"
			}, "flow-relay-v2");
			return;
		}
		if (isFreshRelayRuntime(runtimeUrl) || Boolean(await this.evaluateInner(relayToolReadyExpression).catch(() => false))) {
			runtime.sendStatus(this.job.jobId, "submitting", "Preparing the fresh Flow Video Relay Bridge...", .32);
			const resolvedMediaId = await this.resolveFreshRelayMediaId(this.job.settings || {}, keyframe);
			const configured = this.manifest(keyframe, references, resolvedMediaId);
			await this.configureFreshRelay(configured.value, configured.durationSeconds, keyframe, resolvedMediaId);
			const result = await this.generateFreshRelay();
			if (!result) return;
			if (!result?.video) throw new Error("Fresh Flow Video Relay Bridge completed without video data.");
			await this.deliverResult(result, keyframe, configured.durationSeconds, {
				passed: true,
				mode: "relay-runtime"
			}, "flow-relay-v1");
			await this.restorePublishedRuntime();
			return;
		}
		runtime.sendStatus(this.job.jobId, "submitting", "Preparing Studio Shot Bridge in strict I2V mode...", .32);
		await this.primeMedia([keyframe, ...references]);
		await this.prepareMedia(keyframe, references);
		const configured = this.manifest(keyframe, references);
		await this.configure(configured.value, configured.durationSeconds);
		await this.revalidateBeforeSubmit(configured.value);
		const result = await this.generate();
		if (result) await this.deliverResult(result, keyframe, configured.durationSeconds, await this.validateGeneratedStartFrame(keyframe));
	}
};
async function probeFlowAppIntake$1(value) {
	const payload = normalizeFlowAppDiagnosticPayload(value);
	const tabs = await chrome.tabs.query({ url: ["https://labs.google/fx/*", "https://labs.google.com/fx/*"] });
	const expected = canonicalFlowRoute(payload.expectedRuntimeUrl);
	const matches = tabs.filter((tab) => tab.id && canonicalFlowRoute(String(tab.url || "")) === expected);
	if (matches.length !== 1) throw new Error(`Flow diagnostic requires exactly one matching runtime tab; found ${matches.length}.`);
	return new StudioBridgeSession({
		jobId: payload.diagnosticId,
		provider: "google-flow",
		task: "connection_test",
		prompt: "",
		references: [],
		settings: {},
		download: {
			auto: false,
			filenameTemplate: payload.diagnosticId
		}
	}, matches[0].id, true).diagnoseIntake(payload);
}
async function findRemoteSandboxTarget() {
	return (await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json())).find((item) => item.type === "iframe" && item.url === "about:srcdoc" && item.webSocketDebuggerUrl);
}
function waitForRemoteSocket(socket) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(/* @__PURE__ */ new Error("Remote sandbox CDP connection timed out.")), 5e3);
		socket.addEventListener("open", () => {
			clearTimeout(timer);
			resolve();
		}, { once: true });
		socket.addEventListener("error", () => {
			clearTimeout(timer);
			reject(/* @__PURE__ */ new Error("Remote sandbox CDP connection failed."));
		}, { once: true });
	});
}
function manifestDuration(settings) {
	const timelineDuration = Number(settings?.timelineDurationSec || settings?.durationSec || 8);
	return [
		4,
		6,
		8,
		10
	].find((duration) => timelineDuration <= duration) || 10;
}
function pngDimensions(reference) {
	const encoded = String(reference.base64 || "").replace(/^data:[^,]+,/, "");
	if (!encoded || !/^iVBORw0KGgo/i.test(encoded)) return null;
	try {
		const bytes = Uint8Array.from(atob(encoded.slice(0, 32)), (value) => value.charCodeAt(0));
		if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
		const view = new DataView(bytes.buffer);
		return {
			width: view.getUint32(16),
			height: view.getUint32(20)
		};
	} catch {
		return null;
	}
}
function findKeyframeReference(references) {
	return (references || []).find((reference) => reference.referenceRole === "shot_keyframe") || references?.[0];
}
function continuityReferences(references, keyframe) {
	return (references || []).filter((reference) => reference.assetId !== keyframe.assetId && reference.referenceRole !== "shot_keyframe" && reference.base64).slice(0, 7);
}
function validateVoiceInput(settings) {
	const voice = settings?.characterVoice;
	if (settings?.generateAudio === true && voice && (voice.provider !== "google-flow" || !voice.characterId || !voice.voiceId || !voice.lockedAt)) throw new Error("Âm thanh thoại cần được xử lý ở bước âm thanh riêng để giữ giọng nhân vật nhất quán giữa các shot.");
}
async function dispatchCustomToolJob(job, tab) {
	if (!tab.id) throw new Error("Studio Shot Bridge tab has no id.");
	if (runtime.customToolActiveJobs.has(job.jobId)) {
		runtime.sendStatus(job.jobId, "submitting", "Duplicate Studio Shot Bridge dispatch ignored; this job is already active.", .3);
		return;
	}
	runtime.customToolActiveJobs.add(job.jobId);
	job.tabId = tab.id;
	runtime.activeJobs.set(job.jobId, job);
	runtime.sendStatus(job.jobId, "opening_provider", "Connecting to Studio Shot Bridge through Chrome DevTools...", .18);
	console.log("[DEBUG] dispatchCustomToolJob: session.run starting");
	const session = new StudioBridgeSession(job, tab.id);
	customToolSessions.set(job.jobId, session);
	try {
		await session.run();
		console.log("[DEBUG] dispatchCustomToolJob: session.run finished");
	} catch (err) {
		console.error("[DEBUG] dispatchCustomToolJob error:", err);
		throw err;
	} finally {
		customToolSessions.delete(job.jobId);
		runtime.customToolActiveJobs.delete(job.jobId);
		customToolScheduledJobs.delete(job.jobId);
	}
}
globalThis._dispatchCustomToolJob = dispatchCustomToolJob;
globalThis._customToolScheduledJobs = customToolScheduledJobs;
//#endregion
//#region src/background/result-handler.ts
var RESULT_ASSET_PROCESSING_TIMEOUT_MS = 2e4;
async function recoverChatGptFailure(deps, job, data) {
	await recordChatGptRateLimit(deps, data);
	const savedConversation = job.tabId && deps.isSavedChatGptConversationUrl(job.conversationUrl);
	if (await recoverSavedChatGptImage(deps, job, data, savedConversation)) return true;
	return recoverSavedChatGptText(deps, job, data, savedConversation);
}
async function recordChatGptRateLimit(deps, data) {
	const error = String(data.error || "");
	if (!/RATE_LIMIT|sending requests too quickly|bạn đang gửi yêu cầu quá nhanh|tạm thời hạn chế quyền truy cập/i.test(error)) return;
	await deps.persistChatGptRateLimit(Date.now() + deps.chatGptRateLimitCooldownMs);
	data.error = `CHATGPT_RATE_LIMIT_COOLDOWN: ChatGPT temporarily limited this account. The extension stopped without resubmitting and will reject new ChatGPT jobs for 15 minutes. Provider detail: ${error}`;
}
async function recoverSavedChatGptImage(deps, job, data, savedConversation) {
	if (!(job.task === "image" || job.task === "text_to_image") || data.status === "failed_manual" || !savedConversation || job.chatGptImageRecoveryActive) return false;
	job.chatGptImageRecoveryActive = true;
	deps.sendStatus(job.jobId, "opening_provider", "ChatGPT image request ended ambiguously. Reloading its exact conversation and checking for a completed image before failing...", .2);
	deps.retryRecoveredCapture(job, job.tabId);
	return true;
}
async function recoverSavedChatGptText(deps, job, data, savedConversation) {
	const hydrationFailure = /timeout waiting|became inactive|complete structured json|provider job timed out|did not return a result in time|active[- ]timeout/i.test(String(data.error || ""));
	if (job.task === "image" || job.task === "text_to_image" || data.status !== "failed_retryable" || !hydrationFailure || !savedConversation || job.chatGptTextRecoveryActive) return false;
	job.chatGptTextRecoveryActive = true;
	deps.sendStatus(job.jobId, "opening_provider", "ChatGPT text ended ambiguously. Reloading the exact saved conversation once and capturing its server-stored response without resubmitting...", .2);
	retrySavedChatGptText(deps, job);
	return true;
}
async function retrySavedChatGptText(deps, job) {
	try {
		await chrome.tabs.update(job.tabId, { url: job.conversationUrl });
		await deps.waitForTabComplete(job.tabId, 45e3);
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await deps.retryRecoveredCapture(job, job.tabId);
	} catch (error) {
		deps.sendToDesktop({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: `Automatic saved-conversation text recovery failed without resubmitting: ${error instanceof Error ? error.message : String(error)}`
		});
		deps.activeJobs.delete(job.jobId);
	}
}
async function recoverFlowFailure(deps, job, error) {
	if (deps.isFlowDefinitiveProviderFailure(error)) return false;
	if (deps.isFlowBridgeUnavailableError(error)) return false;
	if (deps.isFlowPostSubmitInspectionError(error) || deps.isFlowAmbiguousCustomToolError(error) || deps.flowJobWasSubmitted(job)) return deps.withTimeout(deps.reloadAndRecoverFlowResult(job, error), deps.flowRecoveryTimeoutMs, "Google Flow refresh recovery").catch((error) => {
		console.warn("[Studio] Flow refresh recovery timed out", error);
		return false;
	});
	if (deps.isFlowPageCrashError(error)) {
		if (await deps.withTimeout(deps.reloadAndRecoverFlowResult(job, error), deps.flowRecoveryTimeoutMs, "Google Flow crash refresh recovery").catch((reason) => {
			console.warn("[Studio] Flow crash refresh recovery timed out", reason);
			return false;
		})) return true;
	}
	if (await deps.reloadAndRedispatchFlowJob(job, error)) return true;
	return deps.withTimeout(deps.recoverLatestFlowResult(job, String(error || ""), deps.isFlowPostSubmitInspectionError(error)), deps.flowRecoveryTimeoutMs, "Google Flow recovery").catch((reason) => {
		console.warn("[Studio] Flow automatic recovery timed out", reason);
		return false;
	});
}
async function handleFailedResult(deps, job, jobId, data) {
	const provider = String(job?.provider || "").toLowerCase();
	if (job && (provider === "chatgpt" || provider === "chatgpt-web") && await recoverChatGptFailure(deps, job, data)) return true;
	if (job?.provider === "google-flow" && data.status === "failed_retryable" && job.tabId && await recoverFlowFailure(deps, job, data.error)) return true;
	deps.activeJobs.delete(jobId);
	deps.forgetActiveJobSnapshot(jobId);
	return false;
}
async function downloadResultAssets(deps, job, assets) {
	const downloaded = [];
	const errors = [];
	for (const asset of assets) try {
		const result = await deps.downloadAsset(asset, job);
		if (!result) errors.push(`Generated ${asset.type} could not be downloaded from the provider`);
		else if (job?.task?.includes("video") && deps.resolvedResultAssetType(result, job) !== "video") errors.push(`Flow returned ${deps.resolvedResultAssetType(result, job)} media for a video job`);
		else if ((job?.task === "image" || job?.task === "text_to_image") && deps.resolvedResultAssetType(result, job) === "video") errors.push("Flow returned video media for an image job; refusing to store it as a keyframe");
		else downloaded.push(result);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}
	return {
		assets: downloaded,
		errors
	};
}
function resultAssetPayload(deps, job, jobId, assets) {
	return assets.map((asset) => {
		const type = deps.resolvedResultAssetType(asset, job);
		return {
			type,
			filePath: asset.filePath || asset.downloadPath || asset.filename || `${jobId}.${type === "video" ? "mp4" : "png"}`,
			provider: job?.provider || "browser",
			mimeType: asset.mimeType,
			filename: asset.filename,
			metadata: deps.flowResultMetadata(job, asset)
		};
	});
}
async function handleCompletedAssets(deps, job, jobId, data) {
	const { markCompletedResultJob, processingResultJobs, sendStatus, sendToDesktop } = deps;
	if (job?.task === "story_development" || job?.task === "connection_test") {
		sendToDesktop({
			type: "JOB_RESULT",
			jobId,
			status: "done",
			assets: data.assets.map((asset) => ({
				type: asset.type,
				filePath: asset.filename || `${jobId}.md`,
				provider: job.provider,
				metadata: asset.metadata || {}
			}))
		});
		markCompletedResultJob(jobId);
		return;
	}
	sendStatus(jobId, "downloading", "Downloading generated assets...", .9);
	sendStatus(jobId, "downloading", `Processing ${Array.isArray(data.assets) ? data.assets.length : 0} generated asset(s)...`, .91);
	const { assets, errors: downloadErrors } = await Promise.race([downloadResultAssets(deps, job, data.assets), new Promise((resolve) => setTimeout(() => resolve({
		assets: [],
		errors: [`Provider asset processing exceeded ${RESULT_ASSET_PROCESSING_TIMEOUT_MS / 1e3}s`]
	}), RESULT_ASSET_PROCESSING_TIMEOUT_MS))]);
	sendStatus(jobId, "downloading", `Asset processing returned ${assets.length} asset(s)${downloadErrors.length ? `; ${downloadErrors.length} warning(s)` : ""}.`, .96);
	if (assets.length === 0) {
		processingResultJobs.delete(jobId);
		sendToDesktop({
			type: "JOB_RESULT",
			jobId,
			status: "failed_retryable",
			assets: [],
			error: `Generated media was detected, but the extension could not download it into the app: ${downloadErrors.join("; ") || "no downloadable asset was returned"}`
		});
		deps.activeJobs.delete(jobId);
		deps.forgetActiveJobSnapshot(jobId);
		return;
	}
	sendToDesktop({
		type: "JOB_RESULT",
		jobId,
		status: "done",
		assets: resultAssetPayload(deps, job, jobId, assets)
	});
	markCompletedResultJob(jobId);
}
function updateContentJobStatus(job, data) {
	if (!job || data.type !== "JOB_STATUS") return;
	job.lastStatus = String(data.status || "");
	job.lastStatusMessage = String(data.message || "");
	job.lastProgress = Number(data.progress || 0);
	job.lastActivityAt = Date.now();
}
function beginResultProcessing(deps, jobId, data) {
	if (data.type !== "JOB_RESULT") return {
		done: false,
		skip: false
	};
	if (deps.completedResultJobs.has(jobId)) return {
		done: false,
		skip: true
	};
	const done = data.status === "done";
	if (done && deps.processingResultJobs.has(jobId)) return {
		done,
		skip: true
	};
	if (done) deps.processingResultJobs.add(jobId);
	return {
		done,
		skip: false
	};
}
function deliverStructuredOutput(deps, jobId, data) {
	if (data.status !== "done" || !data.output || typeof data.output !== "object") return false;
	deps.sendToDesktop({
		type: "JOB_RESULT",
		jobId,
		status: "done",
		assets: [],
		output: data.output,
		providerMetadata: data.providerMetadata
	});
	deps.markCompletedResultJob(jobId);
	return true;
}
async function handleContentResult$3(deps, data) {
	const jobId = String(data.jobId ?? "");
	const job = deps.activeJobs.get(jobId);
	updateContentJobStatus(job, data);
	const processing = beginResultProcessing(deps, jobId, data);
	if (processing.skip) return;
	if (await handleFailedResult(deps, job, jobId, data)) return;
	if (deliverStructuredOutput(deps, jobId, data)) return;
	if (data.status === "done" && Array.isArray(data.assets)) {
		await handleCompletedAssets(deps, job, jobId, data);
		return;
	}
	deps.sendToDesktop({
		type: "JOB_RESULT",
		...data
	});
	if (processing.done) deps.processingResultJobs.delete(jobId);
}
function createResultHandler(deps) {
	return { handleContentResult: (data) => handleContentResult$3(deps, data) };
}
//#endregion
//#region src/background/asset-downloader.ts
var ASSET_FETCH_TIMEOUT_MS = 8e3;
var MAX_BINARY_BYTES = Object.freeze({
	image: 25 * 1024 * 1024,
	video: 200 * 1024 * 1024,
	audio: 200 * 1024 * 1024
});
var PROVIDER_ASSET_HOSTS = {
	"google-flow": [
		"labs.google",
		"labs.google.com",
		"flow.google.com",
		"flow-content.google",
		"googleusercontent.com",
		"googleapis.com",
		"googlevideo.com"
	],
	chatgpt: [
		"chatgpt.com",
		"chat.openai.com",
		"openai.com",
		"oaiusercontent.com",
		"oaistatic.com",
		"estuary.dev"
	],
	grok: [
		"grok.com",
		"x.com",
		"xusercontent.com"
	],
	"elevenlabs-flows": ["elevenlabs.io", "elevenlabs.dev"]
};
function providerAssetHosts(provider) {
	return PROVIDER_ASSET_HOSTS[String(provider || "").toLowerCase()] || [];
}
function hostMatchesAllowlist(hostname, allowedHosts) {
	const normalized = String(hostname || "").toLowerCase().replace(/\.$/, "");
	return allowedHosts.some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
}
function isAllowedProviderAssetUrl(value, provider) {
	try {
		const url = new URL(String(value || ""));
		if (url.protocol === "blob:") {
			const embedded = new URL(url.pathname);
			return embedded.protocol === "https:" && hostMatchesAllowlist(embedded.hostname, providerAssetHosts(provider));
		}
		if (url.protocol !== "https:") return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
		return hostMatchesAllowlist(url.hostname, providerAssetHosts(provider));
	} catch {
		return false;
	}
}
function assertAllowedProviderAssetUrl(value, provider) {
	if (!isAllowedProviderAssetUrl(value, provider)) throw new Error(`MEDIA_REDIRECT_NOT_ALLOWED: ${provider || "provider"} asset URL is outside the provider allowlist.`);
}
async function withDeadline(promise, timeoutMs) {
	let timer;
	try {
		return await Promise.race([promise, new Promise((resolve) => {
			timer = setTimeout(() => resolve(void 0), timeoutMs);
		})]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
function sanitizeFilename(value) {
	return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 180);
}
function mediaKindFromMime(mimeType) {
	const normalized = String(mimeType || "").toLowerCase().split(";", 1)[0];
	if (normalized.startsWith("image/")) return "image";
	if (normalized.startsWith("video/")) return "video";
	if (normalized.startsWith("audio/")) return "audio";
	return "";
}
function hasMediaSignature(bytes, kind) {
	if (bytes.length < 4) return false;
	if (kind === "image") return bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 || bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 || bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
	if (kind === "video") return bytes.length >= 8 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp" || bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
	return true;
}
/**
* Validate a provider response before it is expanded into a durable data URL.
* Redirect policy alone is insufficient: a trusted host can still return an
* HTML error page, an oversized body, or a MIME/type mismatch.
*/
function validateDownloadedBinary({ bytes, mimeType, assetType }) {
	const byteSize = Number(bytes?.byteLength || 0);
	const maxBytes = MAX_BINARY_BYTES[assetType];
	if (!byteSize) return {
		ok: false,
		code: "empty_media"
	};
	if (byteSize > maxBytes) return {
		ok: false,
		code: "media_too_large"
	};
	const declaredKind = mediaKindFromMime(mimeType || "");
	if (declaredKind && declaredKind !== assetType) return {
		ok: false,
		code: "media_type_mismatch"
	};
	if (!hasMediaSignature(bytes, assetType)) return {
		ok: false,
		code: "invalid_media_signature"
	};
	return {
		ok: true,
		byteSize,
		mimeType: String(mimeType || "application/octet-stream")
	};
}
function responseContentLength(response) {
	const value = Number(response.headers.get("content-length"));
	return Number.isFinite(value) && value >= 0 ? value : void 0;
}
/** Read a response without ever retaining more than the provider's byte cap. */
async function readResponseBytes(response, maxBytes) {
	const reader = response.body?.getReader();
	if (!reader) {
		const bytes = new Uint8Array(await response.arrayBuffer());
		return bytes.byteLength <= maxBytes ? bytes : null;
	}
	const chunks = [];
	let total = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
			total += chunk.byteLength;
			if (total > maxBytes) {
				await reader.cancel("media_too_large").catch(() => void 0);
				return null;
			}
			chunks.push(chunk);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}
async function fetchAssetInBackground(url, provider, assetType) {
	assertAllowedProviderAssetUrl(url, provider);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), ASSET_FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			credentials: "include",
			signal: controller.signal
		});
		if (!response.ok || response.url && !isAllowedProviderAssetUrl(response.url, provider)) return null;
		const contentLength = responseContentLength(response);
		if (contentLength !== void 0 && contentLength > MAX_BINARY_BYTES[assetType]) return null;
		const bytes = await readResponseBytes(response, MAX_BINARY_BYTES[assetType]);
		if (!bytes) return null;
		const validation = validateDownloadedBinary({
			bytes,
			mimeType: response.headers.get("content-type") || "application/octet-stream",
			assetType
		});
		if (!validation.ok) return null;
		let binary = "";
		for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
		return {
			dataUrl: `data:${validation.mimeType};base64,${btoa(binary)}`,
			mimeType: validation.mimeType,
			byteSize: validation.byteSize
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
async function fetchInProviderTab(url, tabId, provider, assetType) {
	assertAllowedProviderAssetUrl(url, provider);
	const allowedHosts = providerAssetHosts(provider);
	try {
		const [result] = await chrome.scripting.executeScript({
			target: { tabId },
			func: async (assetUrl, providerHosts, expectedType, maxBytes) => {
				const hostAllowed = (value) => {
					try {
						const parsed = new URL(value);
						if (parsed.protocol === "blob:") {
							const embedded = new URL(parsed.pathname);
							return embedded.protocol === "https:" && providerHosts.some((allowed) => embedded.hostname.toLowerCase() === allowed || embedded.hostname.toLowerCase().endsWith(`.${allowed}`));
						}
						const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
						return parsed.protocol === "https:" && providerHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
					} catch {
						return false;
					}
				};
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 8e3);
				try {
					const response = await fetch(assetUrl, {
						credentials: "include",
						signal: controller.signal
					});
					if (!response.ok || response.url && !hostAllowed(response.url)) return { ok: false };
					const contentLength = Number(response.headers.get("content-length"));
					if (Number.isFinite(contentLength) && contentLength > maxBytes) return {
						ok: false,
						code: "media_too_large"
					};
					const reader = response.body?.getReader();
					const chunks = [];
					let total = 0;
					if (reader) try {
						while (true) {
							const next = await reader.read();
							if (next.done) break;
							const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
							total += chunk.byteLength;
							if (total > maxBytes) {
								await reader.cancel("media_too_large").catch(() => void 0);
								return {
									ok: false,
									code: "media_too_large"
								};
							}
							chunks.push(chunk);
						}
					} finally {
						reader.releaseLock();
					}
					else {
						const fallback = new Uint8Array(await response.arrayBuffer());
						if (fallback.byteLength > maxBytes) return {
							ok: false,
							code: "media_too_large"
						};
						chunks.push(fallback);
						total = fallback.byteLength;
					}
					const bytes = new Uint8Array(total);
					let offset = 0;
					for (const chunk of chunks) {
						bytes.set(chunk, offset);
						offset += chunk.byteLength;
					}
					const mime = String(response.headers.get("content-type") || "application/octet-stream").toLowerCase().split(";", 1)[0];
					const declaredKind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "";
					const signature = expectedType === "image" ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 || bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 || bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" : expectedType === "video" ? bytes.length >= 8 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp" || bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163 : bytes.length > 0;
					if (!bytes.length || bytes.length > maxBytes || declaredKind && declaredKind !== expectedType || !signature) return { ok: false };
					const blob = new Blob([bytes], { type: mime });
					return {
						ok: true,
						dataUrl: await new Promise((resolve, reject) => {
							const reader = new FileReader();
							reader.onload = () => resolve(String(reader.result || ""));
							reader.onerror = () => reject(/* @__PURE__ */ new Error("READ_ERROR"));
							reader.readAsDataURL(blob);
						}),
						mimeType: blob.type || "application/octet-stream",
						byteSize: bytes.length
					};
				} catch {
					return { ok: false };
				} finally {
					clearTimeout(timeout);
				}
			},
			args: [
				url,
				allowedHosts,
				assetType,
				MAX_BINARY_BYTES[assetType]
			]
		});
		const value = result?.result;
		return value?.ok && value.dataUrl ? value : null;
	} catch {
		return null;
	}
}
async function fetchThroughChatGptContentScript(url, tabId, provider, assetType) {
	assertAllowedProviderAssetUrl(url, provider);
	try {
		const response = await chrome.tabs.sendMessage(tabId, {
			action: "READ_CHATGPT_ASSET_FOR_BACKGROUND",
			url
		});
		if (!response?.ok || !response.dataUrl) return null;
		const encoded = String(response.dataUrl);
		const payload = encoded.match(/^data:[^;]+;base64,([A-Za-z0-9+/=\s]+)$/i)?.[1];
		if (!payload) return null;
		const binary = atob(payload.replace(/\s+/g, ""));
		const validation = validateDownloadedBinary({
			bytes: Uint8Array.from(binary, (value) => value.charCodeAt(0)),
			mimeType: String(response.mimeType || "application/octet-stream"),
			assetType
		});
		return validation.ok ? {
			dataUrl: encoded,
			mimeType: validation.mimeType,
			byteSize: validation.byteSize
		} : null;
	} catch {
		return null;
	}
}
async function firstDownloadedAsset(tasks) {
	try {
		return await Promise.any(tasks.map((task) => task.then((value) => value || Promise.reject(/* @__PURE__ */ new Error("asset unavailable")))));
	} catch {
		return null;
	}
}
function waitForDownload(downloadId) {
	return new Promise((resolve, reject) => {
		const cleanup = () => chrome.downloads.onChanged.removeListener(listener);
		const timeout = setTimeout(() => {
			cleanup();
			reject(/* @__PURE__ */ new Error(`Timed out waiting for download ${downloadId}`));
		}, 12e4);
		const finish = async () => {
			clearTimeout(timeout);
			cleanup();
			const [item] = await chrome.downloads.search({ id: downloadId });
			item?.filename ? resolve(item) : reject(/* @__PURE__ */ new Error(`Download ${downloadId} completed without a filename`));
		};
		const listener = (delta) => {
			if (delta.id !== downloadId) return;
			if (delta.error?.current) {
				clearTimeout(timeout);
				cleanup();
				reject(new Error(delta.error.current));
			}
			if (delta.state?.current === "complete") finish().catch(reject);
		};
		chrome.downloads.onChanged.addListener(listener);
	});
}
async function downloadViaChrome(asset, source, filename, provider) {
	assertAllowedProviderAssetUrl(source, provider);
	const downloadId = await chrome.downloads.download({
		url: source,
		filename: `AI Video Studio/${sanitizeFilename(filename)}`,
		saveAs: false,
		conflictAction: "uniquify"
	});
	const item = await waitForDownload(downloadId);
	return {
		...asset,
		filename: item.filename.split("/").pop() || filename,
		filePath: item.filename,
		downloadPath: item.filename,
		metadata: {
			...asset.metadata || {},
			originalUrl: source,
			storage: "download",
			downloadId
		}
	};
}
async function persistChatGptImageViaChrome(asset, dataUrl, filename) {
	if (dataUrl.startsWith("data:")) return {
		...asset,
		filename,
		filePath: dataUrl,
		downloadPath: dataUrl,
		metadata: {
			...asset.metadata || {},
			storage: "data_url",
			byteSize: Math.max(0, Math.round(dataUrl.length * .75))
		}
	};
	const downloadId = await chrome.downloads.download({
		url: dataUrl,
		filename: `AI Video Studio/${sanitizeFilename(filename)}`,
		saveAs: false,
		conflictAction: "uniquify"
	});
	const item = await waitForDownload(downloadId);
	return {
		...asset,
		filename: item.filename.split("/").pop() || filename,
		filePath: item.filename,
		downloadPath: item.filename,
		metadata: {
			...asset.metadata || {},
			storage: "download",
			downloadId,
			byteSize: void 0
		}
	};
}
async function downloadChatGptImage(asset, job, source) {
	const result = await firstDownloadedAsset([
		withDeadline(fetchAssetInBackground(source, job.provider, "image"), ASSET_FETCH_TIMEOUT_MS),
		withDeadline(fetchInProviderTab(source, job.tabId, job.provider, "image"), ASSET_FETCH_TIMEOUT_MS),
		withDeadline(fetchThroughChatGptContentScript(source, job.tabId, job.provider, "image"), ASSET_FETCH_TIMEOUT_MS)
	]);
	if (!result) return void 0;
	const filename = asset.filename || `chatgpt_${job.jobId}.png`;
	try {
		return await persistChatGptImageViaChrome(asset, result.dataUrl, filename);
	} catch (error) {
		console.warn("[Studio] ChatGPT image local download failed; retaining data URL fallback:", error);
		return {
			...asset,
			filename,
			filePath: result.dataUrl,
			downloadPath: result.dataUrl,
			mimeType: result.mimeType,
			metadata: {
				...asset.metadata || {},
				storage: "data_url",
				byteSize: result.byteSize,
				originalUrl: source
			}
		};
	}
}
async function downloadFlowVideo(asset, job, source) {
	const filename = asset.filename || `google_flow_${job.jobId}.mp4`;
	try {
		return {
			...await downloadViaChrome(asset, source, filename, job.provider),
			type: "video",
			mimeType: asset.mimeType || "video/mp4"
		};
	} catch (downloadError) {
		console.warn("[Studio] Flow video chrome.downloads failed, trying tab fetch:", downloadError);
		const fetched = await fetchInProviderTab(source, job.tabId, job.provider, "video");
		if (!fetched) throw downloadError;
		return {
			...asset,
			type: "video",
			filename,
			filePath: fetched.dataUrl,
			downloadPath: fetched.dataUrl,
			mimeType: fetched.mimeType || "video/mp4",
			metadata: {
				...asset.metadata || {},
				storage: "data_url",
				byteSize: fetched.byteSize,
				originalUrl: source
			}
		};
	}
}
function isChatGptImage(job, asset) {
	const provider = String(job?.provider || "").toLowerCase();
	return Boolean((provider === "chatgpt" || provider === "chatgpt-web") && job?.tabId && asset.type === "image");
}
function isFlowVideo(job, asset) {
	return Boolean(job?.provider === "google-flow" && job.tabId && (asset.type === "video" || asset.mimeType?.startsWith("video/")));
}
async function downloadAsset(asset, job) {
	const source = asset.downloadPath || asset.filePath || "";
	const direct = directAssetResult(asset, job, asset.filePath || source);
	if (direct) return direct;
	const lateResult = lateChatGptResult(asset, job, source);
	if (lateResult) return lateResult;
	if (!job && asset.type === "image" && asset.metadata?.conversationUrl) throw new Error("CHATGPT_JOB_SNAPSHOT_UNAVAILABLE: refusing to relay an expiring provider URL without the active job snapshot.");
	if (/^https?:/i.test(source)) assertAllowedProviderAssetUrl(source, job?.provider || "");
	const providerResult = await downloadProviderAsset(asset, job, source);
	if (providerResult) return providerResult;
	if (isChatGptImage(job, asset) || isFlowVideo(job, asset)) throw new Error(`Provider asset capture failed for ${job?.jobId || "unknown-job"}; generic browser download was skipped.`);
	return downloadGenericAsset(asset, job, source);
}
function lateChatGptResult(asset, job, source) {
	if (job || asset.type !== "image" || !asset.metadata?.conversationUrl || !source) return void 0;
}
function downloadGenericAsset(asset, job, source) {
	const base = sanitizeFilename((job?.download?.filenameTemplate || asset.filename || `studio_${Date.now()}`).replace("[provider]", job?.provider || "provider").replace("[index]", "0"));
	return downloadViaChrome(asset, source, asset.filename || `${base}${asset.type === "video" ? ".mp4" : ".png"}`, job?.provider || "");
}
async function downloadProviderAsset(asset, job, source) {
	if (isChatGptImage(job, asset)) return downloadChatGptOrFallback(asset, job, source);
	if (isFlowVideo(job, asset)) return downloadFlowVideo(asset, job, source);
}
async function downloadChatGptOrFallback(asset, job, source) {
	const downloaded = await downloadChatGptImage(asset, job, source);
	if (downloaded) return downloaded;
}
function directAssetResult(asset, job, source) {
	if (asset.mimeType?.startsWith("text/") || asset.type === "subtitle") return {
		...asset,
		filePath: asset.filename || source || `${job?.jobId || "chatgpt-response"}.md`
	};
	if (!source || source.startsWith("file://") || source.startsWith("data:")) return {
		...asset,
		filePath: source
	};
}
function createAssetDownloader() {
	return { downloadAsset };
}
//#endregion
//#region src/background/result-runtime.ts
function resolvedResultAssetType(asset, job) {
	return asset.type || (asset.mimeType?.startsWith("video/") ? "video" : void 0) || (asset.mimeType?.startsWith("image/") ? "image" : void 0) || (/\.mp4$|\.webm$|\.mov$/i.test(String(asset.filePath || asset.filename || "")) ? "video" : void 0) || (job?.task?.includes("video") ? "video" : "image");
}
function markCompletedResultJob(deps, jobId) {
	deps.processingResultJobs.delete(jobId);
	deps.completedResultJobs.add(jobId);
	deps.activeJobs.delete(jobId);
	deps.forgetActiveJobSnapshot(jobId);
	if (deps.completedResultJobs.size <= 200) return;
	const oldest = deps.completedResultJobs.values().next().value;
	if (oldest) deps.completedResultJobs.delete(oldest);
}
async function recoverFlowCustomToolAsset(deps, job) {
	if (job.provider !== "google-flow" || !job.tabId) return void 0;
	const result = await deps.requestDesktopFlowToolEvaluate(`(async () => {
    const expectedJobId = ${JSON.stringify(job.jobId)};
    const body = document.body?.innerText || "";
    const payloadText = [...document.querySelectorAll("pre, code, textarea")].map((item) => item.value || item.innerText || item.textContent || "").join("\\n");
    // Bridge revisions have used both camelCase and snake_case identity keys.
    // Require the exact current job id in a serialized payload before accepting
    // any visible video, so a prior Flow result can never be attached here.
    const identity = (text) => text.includes('"job_id": "' + expectedJobId + '"') || text.includes('"jobId": "' + expectedJobId + '"');
    if ((!identity(payloadText) && !identity(body)) || !/\\bCOMPLETED\\b/.test(body)) return null;
    const video = [...document.querySelectorAll("video")].find((item) => item.currentSrc || item.src);
    let source = video?.currentSrc || video?.src || "";
    // Relay results are commonly exposed as blob:null URLs inside the
    // sandbox. Materialize the bytes while the runtime is still alive so the
    // extension can download/import them after recovery; never pass an
    // unreadable blob URL across the CDP boundary.
    if (/^blob:/i.test(source)) {
      try {
        const response = await fetch(source);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        source = "data:" + (response.headers.get("content-type") || "video/mp4") + ";base64," + btoa(binary);
      } catch { return null; }
    }
    if (!/^data:video\\/[^;]+;base64,|^https?:\\/\\//i.test(source)) return null;
    const resultText = [...document.querySelectorAll("pre, code")]
      .map((item) => String(item.textContent || "").trim())
      .find((text) => text.includes("mediaId") || text.includes("media_id") || text.includes("providerJobId") || text.includes("provider_id")) || "";
    let parsed = null;
    try { parsed = JSON.parse(resultText); } catch {}
    const mediaId = String(parsed?.mediaId || parsed?.media_id || "");
    const providerId = String(parsed?.providerJobId || parsed?.provider_id || parsed?.providerId || (mediaId ? "flow_relay_" + mediaId : ""));
    const reference = ${JSON.stringify(job.references?.find((item) => item.referenceRole === "shot_keyframe") || job.references?.[0] || null)};
    const expected = reference?.base64 ? "data:" + String(reference.mimeType || "image/png") + ";base64," + String(reference.base64).replace(/^data:[^,]+,/, "") : "";
    let startFrameValidation = { passed: false, error: "Recovery reference bytes unavailable." };
    if (expected && video) {
      try {
        const image = await new Promise((resolve, reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = expected; });
        if (video.readyState < 2) await new Promise((resolve, reject) => { video.addEventListener("loadeddata", resolve, { once: true }); video.addEventListener("error", reject, { once: true }); });
        if (video.currentTime !== 0) { video.currentTime = 0; await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true })); }
        const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 18; const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, 32, 18); const expectedPixels = context.getImageData(0, 0, 32, 18).data;
        context.clearRect(0, 0, 32, 18); context.drawImage(video, 0, 0, 32, 18); const actualPixels = context.getImageData(0, 0, 32, 18).data;
        let error = 0; for (let index = 0; index < expectedPixels.length; index += 4) for (let channel = 0; channel < 3; channel++) error += Math.abs(expectedPixels[index + channel] - actualPixels[index + channel]);
        const normalizedMae = error / (32 * 18 * 3 * 255); startFrameValidation = { passed: normalizedMae <= 0.08, normalizedMae, mode: "recovery-runtime" };
      } catch (error) { startFrameValidation = { passed: false, error: String(error) }; }
    }
    return { source, providerId, mediaId, width: Number(video?.videoWidth || 0), height: Number(video?.videoHeight || 0), durationSeconds: Number(video?.duration || 0), startFrameValidation, sourceMode: parsed?.sourceMode, quality: parsed?.quality, audioPolicy: parsed?.audioPolicy, voiceLockVerified: parsed?.voiceLockVerified };
  })()`);
	if (!result?.source) return void 0;
	return {
		type: "video",
		filePath: result.source,
		downloadPath: result.source,
		filename: `google_flow_${job.jobId}.mp4`,
		mimeType: "video/mp4",
		metadata: {
			currentJobOnly: true,
			flowStrictCurrentJobRecovery: true,
			recoveredFromStudioShotBridge: true,
			providerJobId: result.providerId || void 0,
			flowMediaId: result.mediaId || void 0,
			flowCustomToolExecutor: "flow-relay-v1",
			width: result.width || void 0,
			height: result.height || void 0,
			durationSeconds: result.durationSeconds || void 0,
			aspectRatio: job.settings?.aspectRatio || void 0,
			startFrameValidation: result.startFrameValidation,
			providerMetadataComplete: Boolean(result.providerId && result.mediaId && result.startFrameValidation?.passed === true),
			...result.sourceMode ? { sourceMode: result.sourceMode } : {},
			...result.quality ? { quality: result.quality } : {},
			...result.audioPolicy ? { audioPolicy: result.audioPolicy } : {},
			...typeof result.voiceLockVerified === "boolean" ? { voiceLockVerified: result.voiceLockVerified } : {}
		}
	};
}
function recoveredAssetPayload(deps, job, asset, originalError) {
	const type = resolvedResultAssetType(asset, job);
	const recoveredAfterFlowCrash = deps.isFlowPageCrashError(originalError);
	return {
		type,
		filePath: asset.filePath || asset.downloadPath || asset.filename || `${job.jobId}.${type === "video" ? "mp4" : "png"}`,
		provider: job.provider,
		mimeType: asset.mimeType,
		filename: asset.filename,
		metadata: deps.flowResultMetadata(job, asset, {
			recoveredFromAdjacentOlderBaseline: recoveredAfterFlowCrash ? void 0 : asset.metadata?.recoveredFromAdjacentOlderBaseline,
			recoveredAfterFlowWarning: true,
			recoveredAfterFlowCrash,
			originalFlowWarning: originalError
		})
	};
}
async function recoverLatestFlowResult$3(deps, downloadAsset, job, originalError, allowVisibleFallback = false) {
	deps.sendStatus(job.jobId, "downloading", allowVisibleFallback ? "Recovering strict current-job Google Flow video after refresh..." : "Flow reported a warning; checking only current-job Flow result media...", .92);
	try {
		const customToolAsset = await recoverFlowCustomToolAsset(deps, job).catch(() => void 0);
		let response = customToolAsset ? {
			ok: true,
			adapter: "studio-shot-bridge",
			assets: [customToolAsset]
		} : void 0;
		if (!response) {
			await deps.ensureContentScript(job);
			response = await chrome.tabs.sendMessage(job.tabId, {
				action: "CAPTURE_LATEST_FLOW_RESULT",
				allowVisibleFallback,
				job: {
					jobId: job.jobId,
					task: job.task,
					prompt: job.prompt,
					settings: job.settings || {},
					references: job.references || []
				}
			});
		}
		if (!response?.ok || !response.assets?.length) return false;
		const assets = await Promise.all(response.assets.map((asset) => downloadAsset(asset, job)));
		deps.sendToDesktop({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "done",
			assets: assets.map((asset) => recoveredAssetPayload(deps, job, asset, originalError))
		});
		markCompletedResultJob(deps, job.jobId);
		return true;
	} catch (error) {
		console.warn("[Studio] Flow result recovery failed", error);
		return false;
	}
}
function createResultRuntime(deps) {
	const { activeFlowCustomToolTab, activeJobs, chatGptRateLimitCooldownMs, completedResultJobs, ensureContentScript, flowJobWasSubmitted, flowRecoveryTimeoutMs, processingResultJobs, findFlowProjectTab, flowResultMetadata, flowStartFrameAssetId, forgetActiveJobSnapshot, inferProviderFromUrl, isFlowAmbiguousCustomToolError, isFlowBridgeUnavailableError, isFlowDefinitiveProviderFailure, isFlowPageCrashError, isFlowPostSubmitInspectionError, isSavedChatGptConversationUrl, persistChatGptRateLimit, reloadAndRecoverFlowResult, reloadAndRedispatchFlowJob, requestDesktopFlowToolEvaluate, retryRecoveredCapture, sendStatus, sendToDesktop, waitForTabComplete, withTimeout } = deps;
	const { downloadAsset } = createAssetDownloader();
	const recoverFlowResult = (job, error, allowFallback = false) => recoverLatestFlowResult$3(deps, downloadAsset, job, error, allowFallback);
	const completeResultJob = (jobId) => markCompletedResultJob(deps, jobId);
	const { handleContentResult } = createResultHandler({
		activeJobs,
		chatGptRateLimitCooldownMs,
		completedResultJobs,
		downloadAsset,
		flowJobWasSubmitted,
		flowRecoveryTimeoutMs,
		flowResultMetadata,
		forgetActiveJobSnapshot,
		isFlowAmbiguousCustomToolError,
		isFlowBridgeUnavailableError,
		isFlowDefinitiveProviderFailure,
		isFlowPageCrashError,
		isFlowPostSubmitInspectionError,
		isSavedChatGptConversationUrl,
		markCompletedResultJob: completeResultJob,
		persistChatGptRateLimit,
		processingResultJobs,
		resolvedResultAssetType,
		recoverLatestFlowResult: recoverFlowResult,
		reloadAndRecoverFlowResult,
		reloadAndRedispatchFlowJob,
		retryRecoveredCapture,
		sendStatus,
		sendToDesktop,
		waitForTabComplete,
		withTimeout
	});
	return {
		handleContentResult,
		recoverLatestFlowResult: recoverFlowResult
	};
}
//#endregion
//#region src/background/provider-tabs.ts
var EXISTING_TAB_PROVIDERS$1;
var FLOW_TAB_PATTERNS$1;
var PROVIDER_URLS$3;
var inferProviderFromUrl$1;
var normalizeProvider$1;
var providerAdapter$2;
var rememberedStudioChatGptTab$1;
var rememberStudioChatGptTab$1;
var sendStatus$3;
function createProviderTabs(deps) {
	({existingTabProviders: EXISTING_TAB_PROVIDERS$1, flowTabPatterns: FLOW_TAB_PATTERNS$1, providerUrls: PROVIDER_URLS$3, inferProviderFromUrl: inferProviderFromUrl$1, normalizeProvider: normalizeProvider$1, providerAdapter: providerAdapter$2, rememberedStudioChatGptTab: rememberedStudioChatGptTab$1, rememberStudioChatGptTab: rememberStudioChatGptTab$1, sendStatus: sendStatus$3} = deps);
	return {
		activeFlowCustomToolTab: activeFlowCustomToolTab$2,
		chatGptPageHasFatalShellError: chatGptPageHasFatalShellError$2,
		chatGptPageHasRateLimit: chatGptPageHasRateLimit$2,
		findExistingProviderTab: findExistingProviderTab$1,
		findFlowProjectTab: findFlowProjectTab$2,
		findExactFlowProjectTab: findExactFlowProjectTab$2,
		findOrCreateTab: findOrCreateTab$3,
		isFlowCustomToolUrl: isFlowCustomToolUrl$2,
		isFlowProjectUrl: isFlowProjectUrl$2,
		isProviderErrorPage: isProviderErrorPage$1,
		providerTabMatches: providerTabMatches$2,
		retryProviderTabAfterErrorPage: retryProviderTabAfterErrorPage$2,
		waitForTabComplete: waitForTabComplete$3
	};
}
function providerTabMatches$2(provider, urlValue) {
	const registered = providerAdapter$2(provider);
	if (registered) return registered.matchesTab(urlValue);
	if (!urlValue) return false;
	try {
		return providerHostnameMatches(provider, new URL(urlValue));
	} catch {
		return false;
	}
	return false;
}
function providerHostnameMatches(provider, url) {
	if (provider === "google-flow") return url.hostname === "labs.google" || url.hostname === "labs.google.com" || url.hostname === "flow.google.com";
	if (provider === "grok") return url.hostname === "grok.com" || url.hostname === "x.com" && url.pathname.startsWith("/i/grok");
	if (provider === "freepik") return url.hostname.endsWith("freepik.com");
	if (provider === "chatgpt") return url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com";
	return provider === "elevenlabs-flows" && url.hostname === "elevenlabs.io" && url.pathname.startsWith("/app/flows/");
}
function isFlowProjectUrl$2(urlValue) {
	if (!urlValue) return false;
	try {
		const url = new URL(urlValue);
		return (url.hostname === "labs.google" || url.hostname === "labs.google.com" || url.hostname === "flow.google.com") && /(?:\/fx\/(?:[^/]+\/)?tools\/flow\/(?:project\/[^/]+(?:\/tools|\/edit\/[^/]+|\/(?:tool|tool-version)\/[^/]+)?|shared\/tool\/[^/]+)|\/project\/[^/]+(?:\/edit\/[^/]+|\/tool\/[^/]+)?|\/shared\/tool\/[^/]+)\/?$/i.test(url.pathname);
	} catch {
		return false;
	}
}
/** Prefer the real project workspace over a custom-tool iframe route.
* Both routes satisfy isFlowProjectUrl for workspace matching, but only the
* base project page owns the composer/media picker used for uploads.
*/
function chooseFlowProjectTab(activeFlowTab, projectTabs) {
	const workspaceTabs = projectTabs.filter((tab) => !isFlowCustomToolUrl$2(tab.url));
	if (activeFlowTab && isFlowProjectUrl$2(activeFlowTab.url) && !isFlowCustomToolUrl$2(activeFlowTab.url)) return activeFlowTab;
	return (workspaceTabs.length ? workspaceTabs : projectTabs).sort((a, b) => providerTabScore("google-flow", b) - providerTabScore("google-flow", a))[0];
}
async function activeFlowCustomToolTab$2() {
	const [active] = await chrome.tabs.query({
		active: true,
		lastFocusedWindow: true
	});
	const customTabs = (await chrome.tabs.query({ url: FLOW_TAB_PATTERNS$1 })).filter((tab) => tab.id && isFlowCustomToolUrl$2(tab.url));
	if (active?.id && isFlowCustomToolUrl$2(active.url) && (isFlowRuntimeToolUrl(active.url) || !customTabs.some((tab) => isFlowRuntimeToolUrl(tab.url)))) return active;
	return customTabs.sort((left, right) => Number(isFlowRuntimeToolUrl(right.url)) - Number(isFlowRuntimeToolUrl(left.url)) || providerTabScore("google-flow", right) - providerTabScore("google-flow", left))[0];
}
function providerTabScore(provider, tab) {
	const urlValue = tab.url || "";
	let score = tab.active ? 10 : 0;
	try {
		const url = new URL(urlValue);
		score += providerRouteScore(provider, url.pathname);
	} catch {}
	if (tab.status === "complete") score += 5;
	return score;
}
function providerRouteScore(provider, pathname) {
	if (provider === "google-flow") return googleFlowRouteScore(pathname);
	if (provider === "grok") return pathname.startsWith("/imagine/post/") ? 95 : pathname.startsWith("/imagine") ? 100 : 0;
	return provider === "elevenlabs-flows" && pathname.startsWith("/app/flows/") ? 100 : 0;
}
function googleFlowRouteScore(pathname) {
	if (/\/fx\/[^/]+\/tools\/flow\/(?:project\/[^/]+(?:\/tools|\/(?:tool|tool-version)\/[^/]+)?|shared\/tool\/[^/]+)\/?$/i.test(pathname)) return 100;
	if (/\/fx\/tools\/flow\/(?:project\/[^/]+(?:\/tools|\/(?:tool|tool-version)\/[^/]+)?|shared\/tool\/[^/]+)\/?$/i.test(pathname)) return 95;
	if (/\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)[^/]+/i.test(pathname)) return -100;
	return pathname.includes("/tools/flow") ? 20 : 0;
}
async function findExistingProviderTab$1(provider) {
	const normalizedProvider = normalizeProvider$1(provider);
	return (normalizedProvider === "google-flow" ? await chrome.tabs.query({ url: FLOW_TAB_PATTERNS$1 }) : await chrome.tabs.query({})).filter((tab) => providerTabMatches$2(normalizedProvider, tab.url)).sort((a, b) => providerTabScore(normalizedProvider, b) - providerTabScore(normalizedProvider, a))[0];
}
async function findFlowProjectTab$2() {
	const [activeTab] = await chrome.tabs.query({
		active: true,
		lastFocusedWindow: true
	});
	const [patternTabs, allTabs] = await Promise.all([chrome.tabs.query({ url: FLOW_TAB_PATTERNS$1 }), chrome.tabs.query({})]);
	const seen = /* @__PURE__ */ new Map();
	if (activeTab?.id && providerTabMatches$2("google-flow", activeTab.url)) seen.set(activeTab.id, activeTab);
	for (const tab of [...patternTabs, ...allTabs]) if (tab.id) seen.set(tab.id, tab);
	const flowTabs = Array.from(seen.values()).filter((tab) => providerTabMatches$2("google-flow", tab.url));
	const projectTabs = flowTabs.filter((tab) => isFlowProjectUrl$2(tab.url) && !isFlowCustomToolUrl$2(tab.url));
	const customToolTabs = flowTabs.filter((tab) => isFlowCustomToolUrl$2(tab.url));
	const runtimeToolTabs = customToolTabs.filter((tab) => isFlowRuntimeToolUrl(tab.url));
	const editorToolTabs = customToolTabs.filter((tab) => !isFlowRuntimeToolUrl(tab.url));
	const activeFlowTab = activeTab?.id && providerTabMatches$2("google-flow", activeTab.url) ? activeTab : void 0;
	return {
		tab: chooseFlowProjectTab(activeFlowTab, projectTabs) || (activeFlowTab && isFlowCustomToolUrl$2(activeFlowTab.url) ? activeFlowTab : void 0),
		activeFlowTab,
		flowTabCount: flowTabs.length,
		projectTabCount: projectTabs.length,
		customToolTabCount: customToolTabs.length,
		runtimeToolTabCount: runtimeToolTabs.length,
		editorToolTabCount: editorToolTabs.length,
		urls: flowTabs.map((tab) => tab.url || "").filter(Boolean).slice(0, 4)
	};
}
async function findChatGptTab(targetUrl, isConversation) {
	const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] });
	const targetPath = isConversation ? new URL(targetUrl).pathname.replace(/\/+$/, "") : "";
	const exact = isConversation ? tabs.find((tab) => {
		try {
			return Boolean(tab.url) && new URL(tab.url).pathname.replace(/\/+$/, "") === targetPath;
		} catch {
			return false;
		}
	}) : void 0;
	if (exact?.id) {
		await rememberStudioChatGptTab$1(exact.id);
		return chrome.tabs.get(exact.id);
	}
	if (!isConversation) {
		const landing = tabs.find((tab) => {
			try {
				return Boolean(tab.id) && new URL(String(tab.url || "")).pathname === "/";
			} catch {
				return false;
			}
		});
		if (landing?.id) {
			await rememberStudioChatGptTab$1(landing.id);
			return updateProviderTabUrl(landing.id, targetUrl);
		}
	}
	const remembered = await rememberedStudioChatGptTab$1();
	if (remembered?.id) {
		if (!isConversation) try {
			const current = new URL(String(remembered.url || ""));
			const target = new URL(targetUrl);
			if (current.origin === target.origin && current.pathname === "/" && target.pathname === "/") return chrome.tabs.get(remembered.id);
			if (current.origin === target.origin) return updateProviderTabUrl(remembered.id, targetUrl);
		} catch {}
		return updateProviderTabUrl(remembered.id, targetUrl);
	}
	if (!isConversation && tabs.length === 1 && tabs[0]?.id) {
		await rememberStudioChatGptTab$1(tabs[0].id);
		return updateProviderTabUrl(tabs[0].id, targetUrl);
	}
	const reusable = tabs.find((tab) => {
		try {
			const url = new URL(tab.url);
			return Boolean(tab.url) && url.pathname === "/";
		} catch {
			return false;
		}
	});
	if (reusable?.id) {
		await rememberStudioChatGptTab$1(reusable.id);
		return updateProviderTabUrl(reusable.id, targetUrl);
	}
	const existing = tabs.find((tab) => tab.id && tab.status !== "loading") || tabs.find((tab) => tab.id);
	if (!existing?.id) throw new Error("Open one signed-in ChatGPT tab first. No existing ChatGPT tab is available for reuse.");
	await rememberStudioChatGptTab$1(existing.id);
	return updateProviderTabUrl(existing.id, targetUrl);
}
async function updateProviderTabUrl(tabId, targetUrl) {
	for (let attempt = 0; attempt < 3; attempt++) try {
		const current = await chrome.tabs.get(tabId);
		if (current.url === targetUrl) return current;
		return await chrome.tabs.update(tabId, { url: targetUrl });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!/navigation rejected|being navigated|tabs\.update/i.test(message) || attempt === 2) throw error;
		await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
	}
	throw new Error(`Unable to navigate provider tab to ${targetUrl}.`);
}
async function findExactFlowProjectTab$2(targetUrl) {
	const targetPath = new URL(targetUrl).pathname.replace(/\/(?:tool|tool-version|shared\/tool)\/[^/]+$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "");
	const exact = (await chrome.tabs.query({ url: FLOW_TAB_PATTERNS$1 })).find((tab) => {
		try {
			return Boolean(tab.url) && new URL(tab.url).pathname.replace(/\/(?:tool|tool-version|shared\/tool)\/[^/]+$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "") === targetPath;
		} catch {
			return false;
		}
	});
	if (!exact?.id) throw new Error(`The Google Flow job is locked to ${targetUrl}, but that exact project is not open in the current signed-in account. Open the original Flow project before recovery; the extension will not submit in another project.`);
	return exact;
}
async function findFlowWorkspaceTab(jobId) {
	const flow = await findFlowProjectTab$2();
	if (flow.activeFlowTab?.id && !isFlowProjectUrl$2(flow.activeFlowTab.url)) {
		if (jobId) sendStatus$3(jobId, "opening_provider", `Using the active Flow tab, but it is not a project URL yet: ${flow.activeFlowTab.url}`, .18);
		return chrome.tabs.get(flow.activeFlowTab.id);
	}
	if (flow.tab?.id) {
		if (jobId) sendStatus$3(jobId, "opening_provider", `Using Flow project tab: ${flow.tab.url}`, .18);
		return chrome.tabs.get(flow.tab.id);
	}
	const seen = flow.urls.length ? ` Seen Flow tabs: ${flow.urls.join(" | ")}` : " No Flow tabs were visible to the extension.";
	throw new Error(`No open Google Flow project tab found. Open https://labs.google/fx/vi/tools/flow/project/... then retry.${seen}`);
}
async function findRequiredProviderTab(provider) {
	const existing = await findExistingProviderTab$1(provider);
	if (!existing?.id) throw new Error(`No open ${provider} tab found. Open the signed-in provider/workspace tab, then retry this job.`);
	if (provider === "grok" && !(existing.url || "").includes("/imagine")) return chrome.tabs.update(existing.id, { url: PROVIDER_URLS$3.grok });
	return chrome.tabs.get(existing.id);
}
async function findGenericTab(targetUrl, isConversation) {
	const tabs = isConversation ? await chrome.tabs.query({ url: "https://chatgpt.com/*" }) : await chrome.tabs.query({ url: `${targetUrl}*` });
	const targetPath = isConversation ? new URL(targetUrl).pathname.replace(/\/+$/, "") : "";
	const existing = isConversation ? tabs.find((tab) => {
		try {
			return Boolean(tab.url) && new URL(tab.url).pathname.replace(/\/+$/, "") === targetPath;
		} catch {
			return false;
		}
	}) : tabs[0];
	return existing?.id ? chrome.tabs.get(existing.id) : chrome.tabs.create({
		url: targetUrl,
		active: false
	});
}
async function findOrCreateTab$3(targetUrl, provider = "", jobId) {
	provider = normalizeProvider$1(provider) || inferProviderFromUrl$1(targetUrl);
	const isConversation = targetUrl.startsWith("https://chatgpt.com/c/");
	if (provider === "chatgpt") return findChatGptTab(targetUrl, isConversation);
	if (!isConversation && provider && EXISTING_TAB_PROVIDERS$1.has(provider)) {
		if (provider === "google-flow") return isFlowProjectUrl$2(targetUrl) ? findExactFlowProjectTab$2(targetUrl) : findFlowWorkspaceTab(jobId);
		return findRequiredProviderTab(provider);
	}
	return findGenericTab(targetUrl, isConversation);
}
function isProviderErrorPage$1(error) {
	const message = error instanceof Error ? error.message : String(error);
	return /showing error page|chrome-error:\/\/|cannot access contents/i.test(message);
}
async function waitForTabComplete$3(tabId, timeoutMs = 45e3) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const tab = await chrome.tabs.get(tabId);
		if (tab.status === "complete") return tab;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error("Timed out waiting for provider tab to finish loading.");
}
async function retryProviderTabAfterErrorPage$2(job, error) {
	if (!job.tabId || !isProviderErrorPage$1(error)) return false;
	const targetUrl = job.conversationUrl || PROVIDER_URLS$3[job.provider];
	if (!targetUrl) return false;
	sendStatus$3(job.jobId, "opening_provider", `${job.provider} opened an error page. Reloading provider tab once...`, .18);
	await chrome.tabs.update(job.tabId, { url: targetUrl });
	await waitForTabComplete$3(job.tabId);
	return true;
}
async function chatGptPageHasFatalShellError$2(tabId) {
	const [{ result = false } = {}] = await chrome.scripting.executeScript({
		target: { tabId },
		func: () => {
			const text = String(document.body?.innerText || "").slice(0, 12e3);
			return /(?:ôi[,!]?\s*hỏng rồi|something went wrong|aw,?\s*snap|application error|page isn['’]t responding|đã xảy ra lỗi)/i.test(text);
		}
	}).catch(() => []);
	return result === true;
}
async function chatGptPageHasRateLimit$2(tabId) {
	const [{ result = false } = {}] = await chrome.scripting.executeScript({
		target: { tabId },
		func: () => {
			const text = String(document.body?.innerText || "").slice(-12e3);
			return /quá nhiều yêu cầu|bạn đang gửi yêu cầu quá nhanh|sending requests too quickly|too many requests|temporarily limited/i.test(text);
		}
	}).catch(() => []);
	return result === true;
}
//#endregion
//#region src/background/native-input.ts
var requestDesktopNativeClick$2;
var debuggerSessionTails = /* @__PURE__ */ new Map();
var pendingFileChooserNodes = /* @__PURE__ */ new Map();
var NATIVE_CHOOSER_TIMEOUT_MS = 12e3;
function boundedNativeChooser(operation) {
	return Promise.race([operation, new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("Flow native upload chooser timed out; no file was selected.")), NATIVE_CHOOSER_TIMEOUT_MS))]);
}
if (chrome.debugger?.onEvent) chrome.debugger.onEvent.addListener((source, method, params) => {
	if (method !== "Page.fileChooserOpened") return;
	const tabId = Number(source.tabId || 0);
	const backendNodeId = Number(params?.backendNodeId || 0);
	if (tabId && backendNodeId) pendingFileChooserNodes.set(tabId, backendNodeId);
});
async function withDebuggerSession(tabId, operation) {
	const previous = debuggerSessionTails.get(tabId) || Promise.resolve();
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	const next = previous.catch(() => void 0).then(() => gate);
	debuggerSessionTails.set(tabId, next);
	await previous.catch(() => void 0);
	try {
		return await operation();
	} finally {
		release();
		if (debuggerSessionTails.get(tabId) === next) debuggerSessionTails.delete(tabId);
	}
}
async function dispatchDirectCdpClick(tabUrl, x, y) {
	const target = (await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json())).find((candidate) => {
		if (candidate.type !== "page" || !candidate.webSocketDebuggerUrl || !candidate.url) return false;
		if (candidate.url === tabUrl) return true;
		try {
			const expected = new URL(tabUrl);
			const actual = new URL(candidate.url);
			return actual.origin === expected.origin && actual.pathname === expected.pathname;
		} catch {
			return false;
		}
	});
	if (!target?.webSocketDebuggerUrl) throw new Error(`No direct CDP target matched ${tabUrl}.`);
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	let sequence = 0;
	const pending = /* @__PURE__ */ new Map();
	ws.onmessage = (event) => {
		const message = JSON.parse(String(event.data));
		if (!message.id || !pending.has(message.id)) return;
		const request = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) request.reject(new Error(message.error.message || "Direct CDP command failed."));
		else request.resolve(message.result);
	};
	await new Promise((resolve, reject) => {
		ws.onopen = () => resolve();
		ws.onerror = () => reject(/* @__PURE__ */ new Error("Direct CDP WebSocket connection failed."));
	});
	const command = (method, params = {}) => new Promise((resolve, reject) => {
		const id = ++sequence;
		pending.set(id, {
			resolve,
			reject
		});
		ws.send(JSON.stringify({
			id,
			method,
			params
		}));
	});
	try {
		await command("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x,
			y,
			button: "none",
			clickCount: 0
		});
		await command("Input.dispatchMouseEvent", {
			type: "mousePressed",
			x,
			y,
			button: "left",
			buttons: 1,
			clickCount: 1
		});
		await new Promise((resolve) => setTimeout(resolve, 120));
		await command("Input.dispatchMouseEvent", {
			type: "mouseReleased",
			x,
			y,
			button: "left",
			buttons: 0,
			clickCount: 1
		});
	} finally {
		await new Promise((resolve) => {
			if (ws.readyState === WebSocket.CLOSED) return resolve();
			const timer = setTimeout(resolve, 1e3);
			ws.onclose = () => {
				clearTimeout(timer);
				resolve();
			};
			ws.close();
		});
	}
}
async function focusNativeTab(tabId) {
	return chrome.tabs.get(tabId);
}
async function tryExternalClick(tabUrl, x, y, expectedText, confirmIfUnchanged) {
	try {
		await requestDesktopNativeClick$2(tabUrl, x, y, "", confirmIfUnchanged);
		return true;
	} catch {
		return false;
	}
}
async function debuggerHitTarget(target, x, y, expectedText) {
	const hit = (await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
		expression: `(() => { const hit = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)}); const clickable = hit?.closest?.("button, [role='button'], [role='option'], [role='menuitem']") || hit; if (!clickable) return null; const rect = clickable.getBoundingClientRect(); return { text: String(clickable.innerText || clickable.getAttribute?.("aria-label") || "").replace(/\\s+/g, " ").trim(), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
		returnByValue: true
	}))?.result?.value;
	const expected = expectedText.replace(/\s+/g, " ").trim().toLowerCase();
	const actual = String(hit?.text || "").replace(/\s+/g, " ").trim().toLowerCase();
	if (!hit || expected && !actual.includes(expected) && !expected.includes(actual)) throw new Error(`Native click target changed before press (expected=${expected || "any"}, actual=${actual || "none"}).`);
	return {
		x: Number(hit.x),
		y: Number(hit.y)
	};
}
async function debuggerMousePress(target, x, y) {
	await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
		type: "mousePressed",
		x,
		y,
		button: "left",
		buttons: 1,
		clickCount: 1
	});
	await new Promise((resolve) => setTimeout(resolve, 120));
	await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x,
		y,
		button: "left",
		buttons: 0,
		clickCount: 1
	});
}
async function dispatchDebuggerClick(tabId, x, y, expectedText, confirmIfUnchanged) {
	const target = { tabId };
	await chrome.debugger.attach(target, "1.3");
	try {
		await chrome.debugger.sendCommand(target, "Page.setInterceptFileChooserDialog", { enabled: true }).catch(() => void 0);
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
			const unchangedText = String(unchangedResult?.result?.value || "").replace(/\s+/g, " ").trim().toLowerCase();
			const expected = expectedText.replace(/\s+/g, " ").trim().toLowerCase();
			if (unchangedText && (!expected || unchangedText.includes(expected) || expected.includes(unchangedText))) await debuggerMousePress(target, press.x, press.y);
		}
	} finally {
		await chrome.debugger.detach(target).catch(() => void 0);
	}
}
async function dispatchNativeMouseClick$2(tabId, x, y, expectedText = "", confirmIfUnchanged = false) {
	if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
	const tab = await focusNativeTab(tabId);
	if (tab.url && await tryExternalClick(tab.url, x, y, expectedText, confirmIfUnchanged)) return { method: "external" };
	let directError = "";
	if (tab.url) try {
		await dispatchDirectCdpClick(tab.url, x, y);
		return { method: "direct-cdp" };
	} catch (error) {
		directError = error instanceof Error ? error.message : String(error);
	}
	try {
		await withDebuggerSession(tabId, () => dispatchDebuggerClick(tabId, x, y, expectedText, confirmIfUnchanged));
		return {
			method: "chrome-debugger",
			directError: directError || void 0
		};
	} catch (error) {
		if (!tab.url) throw error;
		await dispatchDirectCdpClick(tab.url, x, y);
		return {
			method: "direct-cdp-fallback",
			directError: directError || void 0
		};
	}
}
async function dispatchNativeTextInsert$2(tabId, x, y, text, focusOnly = false) {
	if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
	await withDebuggerSession(tabId, async () => {
		const target = { tabId };
		await chrome.debugger.attach(target, "1.3");
		try {
			const point = (await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
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
			}))?.result?.value;
			const inputX = Number(point?.x ?? x);
			const inputY = Number(point?.y ?? y);
			if (!focusOnly) {
				await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
					type: "mouseMoved",
					x: inputX,
					y: inputY,
					button: "none",
					clickCount: 0
				});
				await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
					type: "mousePressed",
					x: inputX,
					y: inputY,
					button: "left",
					buttons: 1,
					clickCount: 1
				});
				await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
					type: "mouseReleased",
					x: inputX,
					y: inputY,
					button: "left",
					buttons: 0,
					clickCount: 1
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
			await chrome.debugger.detach(target).catch(() => void 0);
		}
	});
}
async function dispatchDirectTobyFlowTextInsert(tabId, text) {
	const tabs = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json());
	const tab = await chrome.tabs.get(tabId);
	const target = tabs.find((candidate) => candidate.type === "page" && candidate.url === tab.url && candidate.webSocketDebuggerUrl);
	if (!target?.webSocketDebuggerUrl) return false;
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	let sequence = 0;
	const pending = /* @__PURE__ */ new Map();
	const contexts = [];
	ws.onmessage = (event) => {
		const message = JSON.parse(String(event.data));
		if (message.method === "Runtime.executionContextCreated") {
			const context = message.params?.context;
			if (context?.id) contexts.push({
				id: context.id,
				name: context.name
			});
		}
		if (!message.id || !pending.has(message.id)) return;
		const request = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) request.reject(new Error(message.error.message || "Direct Toby CDP command failed."));
		else request.resolve(message.result);
	};
	await new Promise((resolve, reject) => {
		ws.onopen = () => resolve();
		ws.onerror = () => reject(/* @__PURE__ */ new Error("Direct Toby CDP connection failed."));
	});
	const command = (method, params = {}) => new Promise((resolve, reject) => {
		const id = ++sequence;
		pending.set(id, {
			resolve,
			reject
		});
		ws.send(JSON.stringify({
			id,
			method,
			params
		}));
	});
	try {
		await command("Runtime.enable");
		await new Promise((resolve) => setTimeout(resolve, 180));
		for (const context of contexts) {
			if ((await command("Runtime.evaluate", {
				contextId: context.id,
				expression: "typeof getEditor === 'function' && typeof clearEditor === 'function' && typeof insertText === 'function'",
				returnByValue: true
			}))?.result?.value !== true) continue;
			if ((await command("Runtime.evaluate", {
				contextId: context.id,
				awaitPromise: true,
				returnByValue: true,
				expression: `(async()=>{const editor=getEditor();if(!editor)return false;const cleared=await clearEditor(editor);if(!cleared)return false;return await insertText(getEditor(),${JSON.stringify(text)})})()`
			}))?.result?.value === true) return true;
		}
		return false;
	} finally {
		ws.close();
	}
}
async function dispatchTobyFlowTextInsert$2(tabId, text) {
	if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
	try {
		return await withDebuggerSession(tabId, async () => {
			const target = { tabId };
			const contexts = [];
			const listener = (source, method, params) => {
				if (source.tabId !== tabId || method !== "Runtime.executionContextCreated") return;
				const context = params?.context;
				if (context?.id) contexts.push({
					id: context.id,
					name: context.name
				});
			};
			chrome.debugger.onEvent.addListener(listener);
			await chrome.debugger.attach(target, "1.3");
			try {
				await chrome.debugger.sendCommand(target, "Runtime.enable");
				await new Promise((resolve) => setTimeout(resolve, 120));
				for (const context of contexts) {
					if ((await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
						contextId: context.id,
						expression: "typeof getEditor === 'function' && typeof clearEditor === 'function' && typeof insertText === 'function'",
						returnByValue: true
					})).result?.value !== true) continue;
					if ((await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
						contextId: context.id,
						awaitPromise: true,
						returnByValue: true,
						expression: `(async()=>{const editor=getEditor();if(!editor)return false;const cleared=await clearEditor(editor);if(!cleared)return false;return await insertText(getEditor(),${JSON.stringify(text)})})()`
					})).result?.value === true) return true;
				}
				return false;
			} finally {
				chrome.debugger.onEvent.removeListener(listener);
				await chrome.debugger.detach(target).catch(() => void 0);
			}
		});
	} catch {
		return dispatchDirectTobyFlowTextInsert(tabId, text);
	}
}
async function dispatchNativeFileInput$2(tabId, filePaths) {
	if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
	await withDebuggerSession(tabId, async () => {
		const target = { tabId };
		await chrome.debugger.attach(target, "1.3");
		try {
			const documentResult = await chrome.debugger.sendCommand(target, "DOM.getDocument", { depth: 1 });
			const rootNodeId = Number(documentResult.root?.nodeId || 0);
			if (!rootNodeId) throw new Error("Flow document root was not available.");
			const queryResult = await chrome.debugger.sendCommand(target, "DOM.querySelector", {
				nodeId: rootNodeId,
				selector: "input[type=\"file\"][accept*=\"image\"]"
			});
			const nodeId = Number(queryResult.nodeId || 0);
			const backendNodeId = pendingFileChooserNodes.get(tabId) || 0;
			if (!nodeId && !backendNodeId) throw new Error("Flow image upload input was not found.");
			await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
				files: filePaths,
				...nodeId ? { nodeId } : { backendNodeId }
			});
			pendingFileChooserNodes.delete(tabId);
		} finally {
			await chrome.debugger.detach(target).catch(() => void 0);
		}
	});
}
async function dispatchNativeFileChooserUpload$2(tabId, x, y, filePaths) {
	if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
	await boundedNativeChooser(withDebuggerSession(tabId, async () => {
		const target = { tabId };
		await chrome.debugger.attach(target, "1.3");
		let chooserEvent = null;
		let resolveChooser;
		const chooserOpened = new Promise((resolve) => {
			resolveChooser = resolve;
		});
		const onEvent = (source, method, params) => {
			if (Number(source.tabId) !== tabId || method !== "Page.fileChooserOpened") return;
			const event = params;
			chooserEvent = {
				backendNodeId: Number(event?.backendNodeId || 0),
				frameId: event?.frameId,
				mode: event?.mode
			};
			resolveChooser(chooserEvent);
		};
		chrome.debugger.onEvent.addListener(onEvent);
		try {
			await chrome.debugger.sendCommand(target, "Page.enable");
			await chrome.debugger.sendCommand(target, "DOM.enable");
			await chrome.debugger.sendCommand(target, "Page.setInterceptFileChooserDialog", { enabled: true });
			await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
				type: "mousePressed",
				x,
				y,
				button: "left",
				buttons: 1,
				clickCount: 1
			});
			await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
				type: "mouseReleased",
				x,
				y,
				button: "left",
				buttons: 0,
				clickCount: 1
			});
			chooserEvent = await Promise.race([chooserOpened, new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("Flow upload file chooser did not open after the native upload click.")), 5e3))]);
			if (chooserEvent.backendNodeId) await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
				backendNodeId: chooserEvent.backendNodeId,
				files: filePaths
			});
			else {
				const documentResult = await chrome.debugger.sendCommand(target, "DOM.getDocument", {
					depth: 1,
					pierce: true
				});
				const rootNodeId = Number(documentResult.root?.nodeId || 0);
				if (!rootNodeId) throw new Error("Flow chooser opened without a usable upload input.");
				const nodeIds = ((await chrome.debugger.sendCommand(target, "DOM.querySelectorAll", {
					nodeId: rootNodeId,
					selector: "input[type=\"file\"]"
				})).nodeIds || []).filter((nodeId) => Number(nodeId) > 0);
				if (nodeIds.length !== 1) throw new Error("Flow chooser opened without one exact upload input.");
				await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
					nodeId: nodeIds[0],
					files: filePaths
				});
			}
		} finally {
			chrome.debugger.onEvent.removeListener(onEvent);
			await chrome.debugger.detach(target).catch(() => void 0);
		}
	}));
}
async function dispatchNativeCanvasDrag$2(tabId, startX, startY, endX, endY) {
	if (!chrome.debugger) throw new Error("Chrome debugger permission is not available.");
	await withDebuggerSession(tabId, async () => {
		const target = { tabId };
		await chrome.debugger.attach(target, "1.3");
		try {
			await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: startX,
				y: startY,
				button: "none",
				clickCount: 0
			});
			await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
				type: "mousePressed",
				x: startX,
				y: startY,
				button: "left",
				buttons: 1,
				clickCount: 1
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
				type: "mouseReleased",
				x: endX,
				y: endY,
				button: "left",
				buttons: 0,
				clickCount: 1
			});
		} finally {
			await chrome.debugger.detach(target).catch(() => void 0);
		}
	});
}
function createNativeInput(requestClick) {
	requestDesktopNativeClick$2 = requestClick;
	return {
		dispatchNativeMouseClick: dispatchNativeMouseClick$2,
		dispatchNativeTextInsert: dispatchNativeTextInsert$2,
		dispatchTobyFlowTextInsert: dispatchTobyFlowTextInsert$2,
		dispatchNativeFileInput: dispatchNativeFileInput$2,
		dispatchNativeFileChooserUpload: dispatchNativeFileChooserUpload$2,
		dispatchNativeCanvasDrag: dispatchNativeCanvasDrag$2
	};
}
//#endregion
//#region src/background/dispatch-runtime.ts
var activeJobs$2;
var CHATGPT_MIN_DISPATCH_INTERVAL_MS$1;
var PROVIDER_MIN_DISPATCH_INTERVAL_MS$1;
var chatGptPageHasFatalShellError$1;
var chatGptPageHasRateLimit$1;
var CONTENT_SCRIPT_BY_PROVIDER$1;
var findOrCreateTab$2;
var handleContentResult$2;
var humanProviderPause$1;
var isSavedChatGptConversationUrl$1;
var MAIN_WORLD_SCRIPT_BY_PROVIDER$1;
var persistActiveJobSnapshot$2;
var persistedChatGptRateLimitedUntil$1;
var providerAdapter$1;
var providerTabMatches$1;
var PROVIDER_URLS$2;
var recoverLatestFlowResult$2;
var requestDesktopNativeClick$1;
var REQUIRED_CHATGPT_ADAPTER_CAPABILITIES$1;
var retryProviderTabAfterErrorPage$1;
var retryRecoveredCapture$2;
var sendStatus$2;
var sendToDesktop$2;
var uploadChatGptReferencesNatively$2;
var waitForTabComplete$2;
var withTimeout$2;
var dispatchNativeMouseClick$1;
var dispatchNativeTextInsert$1;
var dispatchTobyFlowTextInsert$1;
var dispatchNativeFileInput$1;
var dispatchNativeFileChooserUpload$1;
var dispatchNativeCanvasDrag$1;
var lastChatGptDispatchAt = 0;
var lastProviderDispatchAt = /* @__PURE__ */ new Map();
var providerDispatchTails = /* @__PURE__ */ new Map();
function createDispatchRuntime(deps) {
	({activeJobs: activeJobs$2, chatGptMinDispatchIntervalMs: CHATGPT_MIN_DISPATCH_INTERVAL_MS$1, providerMinDispatchIntervalMs: PROVIDER_MIN_DISPATCH_INTERVAL_MS$1, chatGptPageHasFatalShellError: chatGptPageHasFatalShellError$1, chatGptPageHasRateLimit: chatGptPageHasRateLimit$1, contentScripts: CONTENT_SCRIPT_BY_PROVIDER$1, findOrCreateTab: findOrCreateTab$2, handleContentResult: handleContentResult$2, humanProviderPause: humanProviderPause$1, isSavedChatGptConversationUrl: isSavedChatGptConversationUrl$1, mainWorldScripts: MAIN_WORLD_SCRIPT_BY_PROVIDER$1, persistActiveJobSnapshot: persistActiveJobSnapshot$2, persistedChatGptRateLimitedUntil: persistedChatGptRateLimitedUntil$1, providerAdapter: providerAdapter$1, providerTabMatches: providerTabMatches$1, providerUrls: PROVIDER_URLS$2, recoverLatestFlowResult: recoverLatestFlowResult$2, requestDesktopNativeClick: requestDesktopNativeClick$1, requiredChatGptCapabilities: REQUIRED_CHATGPT_ADAPTER_CAPABILITIES$1, retryProviderTabAfterErrorPage: retryProviderTabAfterErrorPage$1, retryRecoveredCapture: retryRecoveredCapture$2, sendStatus: sendStatus$2, sendToDesktop: sendToDesktop$2, uploadChatGptReferencesNatively: uploadChatGptReferencesNatively$2, waitForTabComplete: waitForTabComplete$2, withTimeout: withTimeout$2} = deps);
	({dispatchNativeMouseClick: dispatchNativeMouseClick$1, dispatchNativeTextInsert: dispatchNativeTextInsert$1, dispatchTobyFlowTextInsert: dispatchTobyFlowTextInsert$1, dispatchNativeFileInput: dispatchNativeFileInput$1, dispatchNativeFileChooserUpload: dispatchNativeFileChooserUpload$1, dispatchNativeCanvasDrag: dispatchNativeCanvasDrag$1} = createNativeInput(requestDesktopNativeClick$1));
	return {
		dispatchNativeCanvasDrag: dispatchNativeCanvasDrag$1,
		dispatchNativeFileChooserUpload: dispatchNativeFileChooserUpload$1,
		dispatchNativeFileInput: dispatchNativeFileInput$1,
		dispatchNativeMouseClick: dispatchNativeMouseClick$1,
		dispatchNativeTextInsert: dispatchNativeTextInsert$1,
		dispatchTobyFlowTextInsert: dispatchTobyFlowTextInsert$1,
		dispatchToContentScript: dispatchToContentScript$2,
		ensureContentScript: ensureContentScript$2,
		flowJobWasSubmitted: flowJobWasSubmitted$2,
		hardResetChatGptDispatch: hardResetChatGptDispatch$2,
		isFlowAmbiguousCustomToolError: isFlowAmbiguousCustomToolError$2,
		isFlowBridgeUnavailableError: isFlowBridgeUnavailableError$1,
		isFlowDefinitiveProviderFailure: isFlowDefinitiveProviderFailure$1,
		isFlowMidComposerFailure: isFlowMidComposerFailure$1,
		isFlowPageCrashError: isFlowPageCrashError$1,
		isFlowPostSubmitInspectionError: isFlowPostSubmitInspectionError$1,
		reloadAndRecoverFlowResult: reloadAndRecoverFlowResult$1,
		reloadAndRedispatchFlowJob: reloadAndRedispatchFlowJob$1
	};
}
async function hardResetChatGptDispatch$2(job) {
	if (!job.tabId) throw new Error("ChatGPT hard reset requires the original provider tab.");
	const attempts = Number(job.chatGptHardResetAttempts || 0);
	if (attempts >= 1) {
		sendToDesktop$2({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: "ChatGPT hard reset was already attempted once; the extension stopped without another submit."
		});
		activeJobs$2.delete(job.jobId);
		return;
	}
	job.chatGptHardResetAttempts = attempts + 1;
	const targetUrl = isSavedChatGptConversationUrl$1(job.conversationUrl) ? job.conversationUrl : PROVIDER_URLS$2.chatgpt;
	const fatalShell = await chatGptPageHasFatalShellError$1(job.tabId);
	sendStatus$2(job.jobId, "opening_provider", fatalShell ? "ChatGPT displayed a fatal error shell. Hard reloading the same tab without cache once..." : "ChatGPT dispatch stalled after ACK. Hard reloading the same tab without cache once...", .18);
	const current = await chrome.tabs.get(job.tabId).catch(() => void 0);
	if (!current || !providerTabMatches$1("chatgpt", current.url)) await chrome.tabs.update(job.tabId, { url: targetUrl });
	else await chrome.tabs.reload(job.tabId, { bypassCache: true });
	try {
		await waitForTabComplete$2(job.tabId, 15e3);
	} catch {
		if (!(await chrome.tabs.get(job.tabId).catch(() => void 0))?.url?.startsWith("https://chatgpt.com/")) throw new Error("ChatGPT hard reset left the provider tab unavailable.");
	}
	await new Promise((resolve) => setTimeout(resolve, 2200));
	await ensureContentScript$2(job);
	sendStatus$2(job.jobId, "opening_provider", "ChatGPT hard reset completed; retrying the same idempotent extension command once.", .22);
	await dispatchToContentScript$2(job);
}
function isFlowPageCrashError$1(error) {
	const message = error instanceof Error ? error.message : String(error || "");
	return /Google Flow crashed with a client-side exception|Flow browser tab is in a Chrome error state|Application error:\s*a client-side exception|left the project composer for an old media edit route|chrome-error:\/\/|Aw,\s*Snap|ERR_[A-Z_]+/i.test(message);
}
function isFlowMidComposerFailure$1(error) {
	const message = error instanceof Error ? error.message : String(error || "");
	return /upload input|source frame|start-frame|composer|keyframe|Prompt staged|Flow keyframe|Cannot find Google Flow upload input/i.test(message);
}
function isFlowPostSubmitInspectionError$1(error) {
	const message = error instanceof Error ? error.message : String(error || "");
	return /after submit|generation was accepted|checking whether generation started|accepted the prompt|Waiting for Google Flow result|Timeout waiting for Google Flow result/i.test(message);
}
function isFlowAmbiguousCustomToolError$2(error) {
	const message = error instanceof Error ? error.message : String(error || "");
	return /Desktop Flow tool evaluation timed out|Studio Shot Bridge sandbox target (?:was not found|is not attached)|Remote sandbox CDP (?:connection timed out|connection failed)|Studio Shot Bridge frame is not ready/i.test(message);
}
function isFlowBridgeUnavailableError$1(error) {
	const message = error instanceof Error ? error.message : String(error || "");
	return /Studio Shot Bridge sandbox target was not found:[\s\S]*(?:reCAPTCHA|about:srcdoc:\s*Flow App)|Timed out waiting for Studio Shot Bridge controls|Timed out waiting for storyboard media|Timed out waiting for continuity reference|bản DRAFT \/tool\/|unpublished draft route|runtime \/tool-version\/ đã publish/i.test(message);
}
function isFlowDefinitiveProviderFailure$1(error) {
	const message = error instanceof Error ? error.message : String(error || "");
	return /Google Flow generation failed after preflight and provider authorization|Google Flow SDK failed after authorization|GOOGLE_FLOW_PROVIDER_POLICY_REJECTED|vi phạm chính sách|\bVideo generation failed\b/i.test(message);
}
function flowJobWasSubmitted$2(job) {
	if (!job || job.provider !== "google-flow") return false;
	if (["generating", "downloading"].includes(String(job.lastStatus || ""))) return true;
	if (Number(job.lastProgress || 0) >= .7) return true;
	return /submit button clicked|generation was accepted|accepted the prompt|waiting for google flow result|generating in google flow/i.test(job.lastStatusMessage || "");
}
async function reloadAndRecoverFlowResult$1(job, originalError) {
	if (job.provider !== "google-flow" || !job.tabId) return false;
	sendStatus$2(job.jobId, "opening_provider", "Refreshing Google Flow to check for an already submitted video result before retrying...", .88);
	const tab = await chrome.tabs.get(job.tabId).catch(() => void 0);
	const targetUrl = (job.conversationUrl || tab?.url || PROVIDER_URLS$2["google-flow"]).replace(/\/edit\/.*$/i, "");
	await chrome.tabs.update(job.tabId, { url: targetUrl });
	await waitForTabComplete$2(job.tabId, 6e4);
	await new Promise((resolve) => setTimeout(resolve, 3500));
	await ensureContentScript$2(job);
	const startedAt = Date.now();
	const maxWaitMs = 18e4;
	let attempt = 0;
	while (Date.now() - startedAt < maxWaitMs) {
		attempt += 1;
		const elapsedSec = Math.round((Date.now() - startedAt) / 1e3);
		sendStatus$2(job.jobId, "downloading", `Checking refreshed Google Flow project for completed video (${attempt}, ${elapsedSec}s)...`, .9);
		if (await recoverLatestFlowResult$2(job, String(originalError || ""), true)) return true;
		if (isFlowPageCrashError$1(originalError) && await recoverLatestFlowResult$2(job, String(originalError || ""), true)) return true;
		await new Promise((resolve) => setTimeout(resolve, 12e3));
	}
	sendStatus$2(job.jobId, "downloading", "Strict Flow recovery found no current-job video; refusing to import visible project videos that cannot be tied to this job.", .94);
	return false;
}
async function reloadAndRedispatchFlowJob$1(job, originalError) {
	return false;
}
async function paceChatGptDispatch(job) {
	if (job.provider !== "chatgpt") return true;
	if (job.tabId && await chatGptPageHasRateLimit$1(job.tabId)) {
		sendToDesktop$2({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: "CHATGPT_RATE_LIMIT_COOLDOWN: ChatGPT is showing a request-rate limit. No prompt was submitted; wait for the provider cooldown before retrying."
		});
		activeJobs$2.delete(job.jobId);
		return false;
	}
	const nowMs = Date.now();
	const rateLimitedUntil = await persistedChatGptRateLimitedUntil$1();
	if (nowMs < rateLimitedUntil) {
		sendToDesktop$2({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: `CHATGPT_RATE_LIMIT_COOLDOWN: ChatGPT temporarily limited this account. No request was submitted; wait ${Math.ceil((rateLimitedUntil - nowMs) / 6e4)} minute(s).`
		});
		activeJobs$2.delete(job.jobId);
		return false;
	}
	const remaining = CHATGPT_MIN_DISPATCH_INTERVAL_MS$1 - (nowMs - lastChatGptDispatchAt);
	if (remaining > 0) await waitForChatGptDispatchPacing(job, remaining);
	return true;
}
async function waitForChatGptDispatchPacing(job, durationMs) {
	const deadline = Date.now() + durationMs;
	while (true) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return;
		sendStatus$2(job.jobId, "opening_provider", `ChatGPT safety pacing: waiting ${Math.ceil(remaining / 1e3)}s before the next submit.`, .2);
		await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 2e4)));
	}
}
async function paceProviderDispatch(job) {
	if (job.provider === "chatgpt") return paceChatGptDispatch(job);
	const remaining = Number(PROVIDER_MIN_DISPATCH_INTERVAL_MS$1[job.provider] || 0) - (Date.now() - (lastProviderDispatchAt.get(job.provider) || 0));
	if (remaining > 0) {
		sendStatus$2(job.jobId, "opening_provider", `${job.provider} safety pacing: waiting ${Math.ceil(remaining / 1e3)}s before the next submit.`, .2);
		await new Promise((resolve) => setTimeout(resolve, remaining));
	}
	return true;
}
async function ensureRecoverableContentScript(job) {
	try {
		await ensureContentScript$2(job);
	} catch (error) {
		if (!await retryProviderTabAfterErrorPage$1(job, error)) throw error;
		await ensureContentScript$2(job);
	}
}
function providerCommand(job) {
	return {
		action: job.provider === "chatgpt" ? "EXECUTE_CHATGPT_JOB_V2" : "EXECUTE_JOB",
		job: {
			jobId: job.jobId,
			prompt: job.prompt,
			task: job.task,
			references: job.references,
			settings: job.settings
		}
	};
}
async function sendProviderCommand(job) {
	const command = providerCommand(job);
	const timeoutMs = job.provider === "chatgpt" && (job.task === "image" || job.task === "text_to_image") ? 3e4 : 8e3;
	try {
		return await sendTabMessageWithTimeout(job.tabId, command, timeoutMs);
	} catch (error) {
		if (job.provider === "chatgpt") {
			sendStatus$2(job.jobId, "submitting", "ChatGPT acknowledgement timed out. Verifying the live adapter and resending the same idempotent job once...", .27);
			await pingChatGptAdapter(job.tabId);
			return sendTabMessageWithTimeout(job.tabId, command, timeoutMs);
		}
		if (job.provider !== "google-flow" || job.task !== "image_to_video") throw error;
		sendStatus$2(job.jobId, "submitting", "Flow acknowledgement timed out. Reloading the exact project tab, restoring the adapter, and retrying the same idempotent job once...", .27);
		await chrome.tabs.reload(job.tabId);
		await waitForTabComplete$2(job.tabId, 3e4);
		await ensureContentScript$2(job);
		return sendTabMessageWithTimeout(job.tabId, command, timeoutMs);
	}
}
async function handleDispatchFailure(job, error) {
	if (job.provider === "google-flow" && job.task === "image_to_video" && isFlowAmbiguousCustomToolError$2(error)) {
		await handleContentResult$2({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: `Studio Shot Bridge lost its control callback after the Flow command may have been accepted. Recovering the strict current-job result without resubmitting: ${error instanceof Error ? error.message : String(error)}`
		});
		return;
	}
	if (job.provider === "chatgpt" && (job.task === "image" || job.task === "text_to_image") && job.tabId && isSavedChatGptConversationUrl$1(job.conversationUrl)) {
		job.chatGptImageRecoveryActive = true;
		sendStatus$2(job.jobId, "opening_provider", `ChatGPT content bridge became unreadable. Reloading ${job.conversationUrl} and checking for the image before failing...`, .2);
		retryRecoveredCapture$2(job, job.tabId);
		return;
	}
	const message = error instanceof Error ? error.message : String(error);
	sendToDesktop$2({
		type: "JOB_RESULT",
		jobId: job.jobId,
		status: /Open one signed-in blank ChatGPT tab first/i.test(message) ? "failed_manual" : "failed_retryable",
		assets: [],
		error: `Failed to communicate with content script: ${message}`
	});
	activeJobs$2.delete(job.jobId);
}
async function dispatchToContentScript$2(job) {
	if (!job.tabId) return;
	const previous = providerDispatchTails.get(job.provider) || Promise.resolve();
	let release;
	const current = new Promise((resolve) => {
		release = resolve;
	});
	const tail = previous.then(() => current);
	providerDispatchTails.set(job.provider, tail);
	await previous;
	try {
		if (!await paceProviderDispatch(job)) return;
		await humanProviderPause$1(job.provider, "sending the next provider command", job.jobId);
		sendStatus$2(job.jobId, "submitting", "Sending prompt to provider content script...", .25);
		try {
			await ensureRecoverableContentScript(job);
			const response = await sendProviderCommand(job);
			const dispatchedAt = Date.now();
			if (job.provider === "chatgpt") lastChatGptDispatchAt = dispatchedAt;
			else lastProviderDispatchAt.set(job.provider, dispatchedAt);
			sendStatus$2(job.jobId, "submitting", response?.ok ? `${job.provider} content script accepted the job.` : `${job.provider} content script returned an empty acknowledgement.`, .3);
		} catch (error) {
			await handleDispatchFailure(job, error);
		}
	} finally {
		release();
		if (providerDispatchTails.get(job.provider) === tail) providerDispatchTails.delete(job.provider);
	}
}
function sendTabMessageWithTimeout(tabId, message, timeoutMs = 8e3) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(/* @__PURE__ */ new Error(`Timed out waiting for tab ${tabId} content script response after ${timeoutMs}ms`));
		}, timeoutMs);
		chrome.tabs.sendMessage(tabId, message).then((response) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(response);
		}).catch((error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		});
	});
}
async function ensureContentScript$2(job) {
	if (!job.tabId) return;
	const currentTab = await chrome.tabs.get(job.tabId).catch(() => void 0);
	if (!currentTab) throw new Error(`Provider tab ${job.tabId} is unavailable.`);
	if (currentTab.status !== "complete") await waitForTabComplete$2(job.tabId, 15e3);
	if (await probeContentScript(job)) return;
	const mainWorldFile = MAIN_WORLD_SCRIPT_BY_PROVIDER$1[job.provider];
	if (mainWorldFile) {
		sendStatus$2(job.jobId, "submitting", `Injecting ${job.provider} main-world bridge...`, .22);
		try {
			await withTimeout$2(chrome.scripting.executeScript({
				target: { tabId: job.tabId },
				files: [mainWorldFile],
				world: "MAIN"
			}), 1e4, `Injecting ${mainWorldFile} into tab ${job.tabId}`);
		} catch (error) {
			throw new Error(`Cannot inject ${mainWorldFile}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	const file = CONTENT_SCRIPT_BY_PROVIDER$1[job.provider];
	if (!file) return;
	sendStatus$2(job.jobId, "submitting", `Injecting ${job.provider} adapter...`, .24);
	try {
		await withTimeout$2(chrome.scripting.executeScript({
			target: { tabId: job.tabId },
			files: [file]
		}), 1e4, `Injecting ${file} into tab ${job.tabId}`);
		if (job.provider === "chatgpt") await pingChatGptAdapter(job.tabId);
		if (job.provider === "google-flow") await pingGoogleFlowAdapter(job.tabId);
		if (job.provider === "elevenlabs-flows") await pingElevenLabsFlowsAdapter(job.tabId);
	} catch (error) {
		if (job.provider === "google-flow") {
			sendStatus$2(job.jobId, "opening_provider", "Flow adapter receiver was stale; reloading the same workspace tab once...", .2);
			await chrome.tabs.reload(job.tabId, { bypassCache: true });
			await waitForTabComplete$2(job.tabId, 15e3);
			await withTimeout$2(chrome.scripting.executeScript({
				target: { tabId: job.tabId },
				files: [file]
			}), 1e4, `Recovering ${file} in tab ${job.tabId}`);
			await pingGoogleFlowAdapter(job.tabId);
			return;
		}
		throw new Error(`Cannot inject ${file}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
async function probeContentScript(job) {
	try {
		if (job.provider === "chatgpt") await pingChatGptAdapter(job.tabId);
		else if (job.provider === "google-flow") await pingGoogleFlowAdapter(job.tabId);
		else if (job.provider === "elevenlabs-flows") await pingElevenLabsFlowsAdapter(job.tabId);
		else {
			const response = await sendTabMessageWithTimeout(job.tabId, { action: "PING_STUDIO_ADAPTER" }, 3e3);
			if (!response?.ok) throw new Error(`Unexpected adapter response: ${JSON.stringify(response)}`);
		}
		return true;
	} catch {
		return false;
	}
}
async function pingElevenLabsFlowsAdapter(tabId) {
	const response = await sendTabMessageWithTimeout(tabId, { action: "PING_STUDIO_ADAPTER" }, 3e3);
	if (!response?.ok || response.adapter !== "elevenlabs-flows") throw new Error(`ElevenLabs Flows adapter did not respond: ${JSON.stringify(response)}`);
}
async function pingGoogleFlowAdapter(tabId) {
	for (let attempt = 0; attempt < 2; attempt++) try {
		const response = await sendTabMessageWithTimeout(tabId, { action: "PING_STUDIO_ADAPTER" }, 3e3);
		if (response?.ok && typeof response.adapter === "string") return;
		throw new Error(`Unexpected adapter response: ${JSON.stringify(response)}`);
	} catch (error) {
		if (attempt === 1) throw new Error(`Google Flow adapter did not respond: ${error instanceof Error ? error.message : String(error)}`);
		await new Promise((resolve) => setTimeout(resolve, 800));
	}
}
async function pingChatGptAdapter(tabId) {
	for (let attempt = 0; attempt < 2; attempt++) try {
		const response = await chrome.tabs.sendMessage(tabId, { action: "PING_STUDIO_ADAPTER" });
		if (response?.ok && typeof response.version === "string" && REQUIRED_CHATGPT_ADAPTER_CAPABILITIES$1.every((capability) => response.version.includes(capability))) return;
		throw new Error(`Unexpected adapter response: ${JSON.stringify(response)}`);
	} catch (error) {
		if (attempt === 1) throw new Error(`ChatGPT adapter lacks required capabilities ${REQUIRED_CHATGPT_ADAPTER_CAPABILITIES$1.join(", ")}: ${error instanceof Error ? error.message : String(error)}`);
		await new Promise((resolve) => setTimeout(resolve, 1e3));
	}
}
//#endregion
//#region src/background/job-coordinator.ts
var import_flow_executor_selection = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	var FLOW_EXECUTOR_CUSTOM_TOOL = "custom-tool-v1";
	var FLOW_EXECUTOR_UI_DIRECT = "flow-ui-direct-v2";
	function flowExecutorFromSettings(settings) {
		return settings?.flowExecutor === FLOW_EXECUTOR_CUSTOM_TOOL ? FLOW_EXECUTOR_CUSTOM_TOOL : FLOW_EXECUTOR_UI_DIRECT;
	}
	function shouldUseFlowCustomTool(job) {
		return flowExecutorFromSettings(job?.settings) === FLOW_EXECUTOR_CUSTOM_TOOL;
	}
	module.exports = {
		FLOW_EXECUTOR_CUSTOM_TOOL,
		FLOW_EXECUTOR_UI_DIRECT,
		flowExecutorFromSettings,
		shouldUseFlowCustomTool
	};
})))();
var activeFlowCustomToolTab$1;
var activeJobs$1;
var bridge$1;
var dispatchToContentScript$1;
var enqueueCustomToolJob$1;
var ensureContentScript$1;
var findFlowProjectTab$1;
var findExactFlowProjectTab$1;
var findOrCreateTab$1;
var flowJobWasSubmitted$1;
var handleCancelJob$1;
var handleContentResult$1;
var hardResetChatGptDispatch$1;
var isFlowAmbiguousCustomToolError$1;
var isFlowCustomToolUrl$1;
var isFlowProjectUrl$1;
var isSavedChatGptConversationUrl;
var normalizeProvider;
var persistActiveJobSnapshot$1;
var planProviderAdmission;
var providerAdapter;
var providerVisibilitySnapshot$1;
var pruneStaleChatGptJobs$1;
var recoverLatestFlowResult$1;
var restoreActiveJobSnapshot$1;
var sendStatus$1;
var sendToDesktop$1;
var waitForTabComplete$1;
var withTimeout$1;
var EXTENSION_SESSION_ID$1;
var FLOW_RECOVERY_TIMEOUT_MS$1;
var PROVIDER_URLS$1;
var queuedChatGptJobs = /* @__PURE__ */ new Map();
var queuedChatGptSince = /* @__PURE__ */ new Map();
var chatGptQueueTimer;
var CHATGPT_QUEUE_WAIT_STALE_MS = 5 * 6e4;
function createJobCoordinator(deps) {
	({activeFlowCustomToolTab: activeFlowCustomToolTab$1, activeJobs: activeJobs$1, bridge: bridge$1, dispatchToContentScript: dispatchToContentScript$1, enqueueCustomToolJob: enqueueCustomToolJob$1, ensureContentScript: ensureContentScript$1, extensionSessionId: EXTENSION_SESSION_ID$1, findFlowProjectTab: findFlowProjectTab$1, findExactFlowProjectTab: findExactFlowProjectTab$1, findOrCreateTab: findOrCreateTab$1, flowJobWasSubmitted: flowJobWasSubmitted$1, flowRecoveryTimeoutMs: FLOW_RECOVERY_TIMEOUT_MS$1, handleCancelJob: handleCancelJob$1, handleContentResult: handleContentResult$1, hardResetChatGptDispatch: hardResetChatGptDispatch$1, isFlowAmbiguousCustomToolError: isFlowAmbiguousCustomToolError$1, isFlowCustomToolUrl: isFlowCustomToolUrl$1, isFlowProjectUrl: isFlowProjectUrl$1, isSavedChatGptConversationUrl, normalizeProvider, persistActiveJobSnapshot: persistActiveJobSnapshot$1, planProviderAdmission, providerAdapter, providerUrls: PROVIDER_URLS$1, providerVisibilitySnapshot: providerVisibilitySnapshot$1, pruneStaleChatGptJobs: pruneStaleChatGptJobs$1, recoverLatestFlowResult: recoverLatestFlowResult$1, restoreActiveJobSnapshot: restoreActiveJobSnapshot$1, sendStatus: sendStatus$1, sendToDesktop: sendToDesktop$1, waitForTabComplete: waitForTabComplete$1, withTimeout: withTimeout$1} = deps);
	return {
		handleDesktopMessage: handleDesktopMessage$1,
		handleRecoverFlowResult,
		handleRecoverJob,
		handleRunJob,
		retryRecoveredCapture: retryRecoveredCapture$1,
		uploadChatGptReferencesNatively: uploadChatGptReferencesNatively$1
	};
}
async function handleDesktopMessage$1(message) {
	if (bridge$1.settleNativeResult(message)) return;
	switch (message.type) {
		case "PING":
			sendToDesktop$1({
				type: "PONG",
				nonce: message.nonce,
				sessionId: EXTENSION_SESSION_ID$1,
				timestamp: Date.now(),
				extensionVersion: chrome.runtime.getManifest().version,
				activeProviders: Object.keys(PROVIDER_URLS$1),
				providerVisibility: await providerVisibilitySnapshot$1()
			});
			break;
		case "RUN_JOB":
			sendToDesktop$1({
				type: "JOB_ACK",
				jobId: message.jobId,
				sessionId: EXTENSION_SESSION_ID$1,
				receivedAt: Date.now()
			});
			try {
				await handleRunJob(message);
			} catch (error) {
				const jobId = String(message.jobId || "");
				activeJobs$1.delete(jobId);
				sendToDesktop$1({
					type: "JOB_RESULT",
					jobId,
					status: "failed_retryable",
					assets: [],
					error: `Extension could not start the provider job after ACK: ${error instanceof Error ? error.message : String(error)}`
				});
			}
			break;
		case "RECOVER_JOB":
			await handleRecoverJob(message);
			break;
		case "HARD_RESET_CHATGPT_DISPATCH": {
			const jobId = String(message.jobId || "");
			const job = activeJobs$1.get(jobId) || await restoreActiveJobSnapshot$1(jobId);
			if (!job || job.provider !== "chatgpt") {
				sendToDesktop$1({
					type: "JOB_RESULT",
					jobId,
					status: "failed_retryable",
					assets: [],
					error: "ChatGPT hard reset could not recover the active extension job."
				});
				break;
			}
			hardResetChatGptDispatch$1(job).catch((error) => {
				sendToDesktop$1({
					type: "JOB_RESULT",
					jobId,
					status: "failed_retryable",
					assets: [],
					error: `ChatGPT cache-bypassing hard reset failed without another retry: ${error instanceof Error ? error.message : String(error)}`
				});
				activeJobs$1.delete(jobId);
			});
			break;
		}
		case "RECOVER_FLOW_RESULT":
			await handleRecoverFlowResult(message);
			break;
		case "CANCEL_JOB":
			queuedChatGptJobs.delete(String(message.jobId ?? ""));
			queuedChatGptSince.delete(String(message.jobId ?? ""));
			handleCancelJob$1(String(message.jobId ?? ""));
			break;
		case "QUERY_STATUS":
			sendToDesktop$1({
				type: "EXTENSION_STATUS",
				connected: bridge$1.isOpen(),
				version: chrome.runtime.getManifest().version,
				activeJobs: activeJobs$1.size,
				availableProviders: Object.keys(PROVIDER_URLS$1),
				lastError: bridge$1.status().lastError,
				providerVisibility: await providerVisibilitySnapshot$1()
			});
			break;
	}
}
function nativeUploadCandidates(job, assetId) {
	return (job.references || []).filter((reference) => !assetId || reference.assetId === assetId);
}
async function setChatGptNativeFiles(target, files) {
	await chrome.debugger.attach(target, "1.3");
	try {
		const rootNodeId = (await chrome.debugger.sendCommand(target, "DOM.getDocument", {
			depth: -1,
			pierce: true
		})).root?.nodeId;
		if (!rootNodeId) throw new Error("ChatGPT document root is unavailable.");
		const query = await chrome.debugger.sendCommand(target, "DOM.querySelector", {
			nodeId: rootNodeId,
			selector: "#upload-files:not([disabled])"
		});
		if (!query.nodeId) throw new Error("Enabled ChatGPT #upload-files input was not found.");
		await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
			nodeId: query.nodeId,
			files: []
		});
		await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
			nodeId: query.nodeId,
			files
		});
		const dispatched = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
			expression: `(() => { const composer = document.querySelector('#prompt-textarea')?.closest('form'); const input = composer?.querySelector('#upload-files:not([disabled])'); if (!input) return { ok: false, files: [] }; const names = Array.from(input.files || [], file => file.name); input.dispatchEvent(new Event('input', { bubbles: true, composed: true })); input.dispatchEvent(new Event('change', { bubbles: true, composed: true })); return { ok: true, files: names }; })()`,
			returnByValue: true
		});
		const stagedFiles = dispatched.result?.value?.files || [];
		if (!dispatched.result?.value?.ok || stagedFiles.length !== files.length) throw new Error(`ChatGPT composer file staging failed: expected ${files.length}, observed ${stagedFiles.length}.`);
	} finally {
		await chrome.debugger.detach(target).catch(() => void 0);
	}
}
async function uploadChatGptReferencesNatively$1(job, assetId) {
	if (!job.tabId) throw new Error("ChatGPT tab is unavailable for native reference upload.");
	if (String(job.settings?.referenceTransport || "") === "conversation_context") return;
	const files = nativeUploadCandidates(job, assetId).map((reference) => reference.filePath).filter((value) => Boolean(value));
	if (files.length === 0) throw new Error("No local reference paths are available for native upload.");
	await setChatGptNativeFiles({ tabId: job.tabId }, files);
}
async function handleRecoverFlowResult(message) {
	const jobId = String(message.jobId || "");
	if (!jobId) return;
	const job = {
		jobId,
		provider: "google-flow",
		task: String(message.task || "image_to_video"),
		prompt: String(message.prompt || ""),
		references: Array.isArray(message.references) ? message.references : [],
		settings: typeof message.settings === "object" && message.settings ? message.settings : {},
		download: {
			auto: true,
			filenameTemplate: `google-flow-${jobId}`
		}
	};
	activeJobs$1.set(jobId, job);
	sendStatus$1(jobId, "downloading", "Recovering only strict current-job Google Flow video media...", .9);
	try {
		const expectedWorkspaceUrl = String(job.settings?.providerWorkspaceUrl || message.providerWorkspaceUrl || "");
		const projectIdFromUrl = (value) => value.match(/\/project\/([^/]+)/i)?.[1] || "";
		const expectedProjectId = projectIdFromUrl(expectedWorkspaceUrl);
		const runtimeTab = await activeFlowCustomToolTab$1();
		const runtimeProjectId = projectIdFromUrl(String(runtimeTab?.url || ""));
		const tab = runtimeTab?.id && (!expectedProjectId || runtimeProjectId === expectedProjectId) ? runtimeTab : await findOrCreateTab$1(PROVIDER_URLS$1["google-flow"], "google-flow", jobId);
		if (!tab.id) throw new Error("Flow project tab has no id");
		job.tabId = tab.id;
		await persistActiveJobSnapshot$1(job);
		if (!await withTimeout$1(recoverLatestFlowResult$1(job, String(message.originalError || "manual recovery"), true), FLOW_RECOVERY_TIMEOUT_MS$1, "Google Flow recovery")) {
			const originalError = String(message.originalError || "").trim();
			const conciseError = originalError.replace(/^(?:No recoverable Google Flow video was found for this job\.\s*Original provider failure:\s*)+/i, "").trim();
			sendToDesktop$1({
				type: "JOB_RESULT",
				jobId,
				status: "failed_retryable",
				assets: [],
				error: originalError ? `No recoverable Google Flow video was found for this job. Original provider failure: ${conciseError || originalError}` : "No recoverable Google Flow video was found in the current project tab."
			});
			activeJobs$1.delete(jobId);
		}
	} catch (error) {
		sendToDesktop$1({
			type: "JOB_RESULT",
			jobId,
			status: "failed_retryable",
			assets: [],
			error: `Cannot recover Google Flow result: ${error instanceof Error ? error.message : String(error)}`
		});
		activeJobs$1.delete(jobId);
	}
}
async function handleRecoverJob(message) {
	const jobId = String(message.jobId || "");
	const conversationUrl = String(message.conversationUrl || "");
	if (!jobId || !conversationUrl.startsWith("https://chatgpt.com/")) {
		sendToDesktop$1({
			type: "JOB_RESULT",
			jobId,
			status: "failed_retryable",
			assets: [],
			error: "No saved ChatGPT conversation URL is available."
		});
		return;
	}
	const job = {
		jobId,
		provider: "chatgpt",
		task: String(message.task || "connection_test"),
		prompt: "",
		conversationUrl,
		references: [],
		settings: { resultType: String(message.resultType || "") },
		download: {
			auto: false,
			filenameTemplate: "recovered-response"
		}
	};
	activeJobs$1.set(jobId, job);
	sendStatus$1(jobId, "opening_provider", "Opening the saved ChatGPT conversation...", .2);
	try {
		const tab = await findOrCreateTab$1(conversationUrl);
		if (!tab.id) throw new Error("Recovered tab has no id");
		const recoveredTabId = tab.id;
		job.tabId = recoveredTabId;
		retryRecoveredCapture$1(job, recoveredTabId);
	} catch (error) {
		sendToDesktop$1({
			type: "JOB_RESULT",
			jobId,
			status: "failed_retryable",
			assets: [],
			error: `Cannot recover conversation: ${error instanceof Error ? error.message : String(error)}`
		});
		activeJobs$1.delete(jobId);
	}
}
async function retryRecoveredCapture$1(job, tabId) {
	const startedAt = Date.now();
	let lastReloadAt = 0;
	const action = recoveryCaptureAction(job);
	const recoveryTimeoutMs = action === "CAPTURE_LATEST_CHATGPT_TEXT_V2" ? 6e4 : 900 * 1e3;
	while (activeJobs$1.has(job.jobId) && Date.now() - startedAt < recoveryTimeoutMs) {
		let tab;
		try {
			tab = await chrome.tabs.get(tabId);
		} catch {
			sendStatus$1(job.jobId, "waiting_manual_action", "The saved ChatGPT tab is closed. Use Recover again to reopen it.", .2);
			return;
		}
		lastReloadAt = await performRecoveryCapture(job, tabId, tab, action, lastReloadAt);
		await new Promise((resolve) => setTimeout(resolve, 5e3));
	}
	if (activeJobs$1.has(job.jobId)) {
		sendToDesktop$1({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: "Recovery timed out before the saved ChatGPT result became available."
		});
		activeJobs$1.delete(job.jobId);
	}
}
function recoveryCaptureAction(job) {
	return job.task === "image" || job.task === "text_to_image" || job.settings?.resultType === "image" ? "CAPTURE_CHATGPT_IMAGE_FOR_JOB_V2" : "CAPTURE_LATEST_CHATGPT_TEXT_V2";
}
async function performRecoveryCapture(job, tabId, tab, action, lastReloadAt) {
	if (isSavedChatGptConversationUrl(job.conversationUrl) && tab.url !== job.conversationUrl) {
		sendStatus$1(job.jobId, "opening_provider", "Returning to the exact saved ChatGPT conversation before checking its result...", .22);
		await chrome.tabs.update(tabId, { url: job.conversationUrl });
		await waitForTabComplete$1(tabId, 45e3);
		return Date.now();
	}
	try {
		if (tab.status === "complete" && tab.url?.startsWith("https://chatgpt.com/")) {
			await ensureContentScript$1(job);
			await chrome.tabs.sendMessage(tabId, {
				action,
				jobId: job.jobId,
				task: job.task,
				expectedConversationUrl: job.conversationUrl
			});
		} else sendStatus$1(job.jobId, "waiting_manual_action", "Waiting for the saved ChatGPT conversation to open. Sign in if required.", .2);
	} catch (error) {
		if (isSavedChatGptConversationUrl(job.conversationUrl) && Date.now() - lastReloadAt >= 15e3) {
			sendStatus$1(job.jobId, "opening_provider", `ChatGPT page is not readable yet. Reloading the saved conversation and checking again: ${error instanceof Error ? error.message : String(error)}`, .24);
			await chrome.tabs.update(tabId, { url: job.conversationUrl }).catch(() => void 0);
			await waitForTabComplete$1(tabId, 45e3).catch(() => void 0);
			return Date.now();
		}
		sendStatus$1(job.jobId, "generating", "Saved ChatGPT conversation is still loading; checking again without resubmitting.", .3);
	}
	return lastReloadAt;
}
function buildStudioJob(message) {
	const settings = message.task === "image_to_video" ? {
		...message.settings || {},
		resultType: "video",
		mode: "video",
		providerMode: "video",
		flowResultType: "video",
		flowVideoMode: message.settings?.flowVideoMode || "frames",
		sourceMode: message.settings?.sourceMode || "frames"
	} : message.settings;
	const conversationUrl = message.conversationUrl || (typeof settings?.providerWorkspaceUrl === "string" ? settings.providerWorkspaceUrl : void 0);
	return {
		jobId: message.jobId,
		provider: normalizeProvider(message.provider),
		task: message.task,
		prompt: message.prompt,
		conversationUrl,
		references: message.references,
		settings,
		download: message.download
	};
}
function admitJob(job) {
	if (job.provider === "chatgpt") pruneStaleChatGptJobs$1();
	const admission = planProviderAdmission(job, Array.from(activeJobs$1.values()), Boolean(providerAdapter(job.provider)));
	if (admission.action === "duplicate") {
		const active = activeJobs$1.get(admission.activeJobId);
		sendStatus$1(job.jobId, active?.lastStatus || "opening_provider", "Duplicate envelope ignored; this provider job is already active.", active?.lastProgress || .1);
		return false;
	}
	if (admission.action === "reject_serial") {
		queuedChatGptJobs.set(job.jobId, job);
		queuedChatGptSince.set(job.jobId, Date.now());
		sendStatus$1(job.jobId, "opening_provider", "Waiting for the previous ChatGPT job to finish; no second tab or submission was created.", .1);
		scheduleChatGptQueueFlush();
		return false;
	}
	if (admission.action === "reject_unknown") {
		sendToDesktop$1({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_manual",
			assets: [],
			error: `Unknown provider: ${job.provider}`
		});
		return false;
	}
	job.lastActivityAt = Date.now();
	activeJobs$1.set(job.jobId, job);
	sendStatus$1(job.jobId, "opening_provider", `Opening ${job.provider}...`, .1);
	return true;
}
async function bindFlowWorkspace(job, targetUrl, flow) {
	const workspaceTab = flow.tab && !isFlowCustomToolUrl$1(flow.tab.url) ? flow.tab : void 0;
	if (workspaceTab?.url && isFlowProjectUrl$1(workspaceTab.url)) try {
		const workspaceUrl = new URL(workspaceTab.url);
		workspaceUrl.pathname = workspaceUrl.pathname.replace(/\/tool-version\/[^/]+\/?$/i, "").replace(/\/tool\/[^/]+\/?$/i, "").replace(/\/edit\/[^/]+\/?$/i, "").replace(/\/+$/, "");
		workspaceUrl.search = "";
		workspaceUrl.hash = "";
		if (/\/project\/[^/]+$/i.test(workspaceUrl.pathname)) {
			const exactWorkspaceUrl = workspaceUrl.toString();
			job.conversationUrl = exactWorkspaceUrl;
			job.settings = {
				...job.settings || {},
				providerWorkspaceUrl: exactWorkspaceUrl
			};
			await persistActiveJobSnapshot$1(job);
		}
	} catch {}
	if (flow.tab?.id && !isFlowCustomToolUrl$1(flow.tab.url)) return;
	const requestedWorkspace = String(job.settings?.flowProjectUrl || job.settings?.providerWorkspaceUrl || job.providerWorkspaceUrl || "").trim();
	const activeRuntimeUrl = isFlowCustomToolUrl$1(flow.activeFlowTab?.url) ? String(flow.activeFlowTab?.url || "") : "";
	let baseUrl = /\/project\/[^/]+/i.test(requestedWorkspace) ? requestedWorkspace : /\/project\/[^/]+/i.test(activeRuntimeUrl) ? activeRuntimeUrl : /\/project\/[^/]+/i.test(targetUrl) ? targetUrl : String(flow.tab?.url || flow.activeFlowTab?.url || targetUrl);
	try {
		const parsed = new URL(baseUrl);
		parsed.pathname = parsed.pathname.replace(/\/tool-version\/[^/]+\/?$/i, "").replace(/\/tool\/[^/]+\/?$/i, "").replace(/\/+$/, "");
		parsed.search = "";
		parsed.hash = "";
		baseUrl = parsed.toString();
	} catch {}
	try {
		const workspaceUrl = new URL(baseUrl);
		if (/\/project\/[^/]+$/i.test(workspaceUrl.pathname)) {
			const exactWorkspaceUrl = workspaceUrl.toString();
			job.conversationUrl = exactWorkspaceUrl;
			job.settings = {
				...job.settings || {},
				flowProjectUrl: exactWorkspaceUrl,
				providerWorkspaceUrl: exactWorkspaceUrl
			};
			await persistActiveJobSnapshot$1(job);
		}
	} catch {}
	const workspace = await chrome.tabs.create({
		url: baseUrl,
		active: false
	});
	if (workspace.id) await waitForTabComplete$1(workspace.id, 2e4).catch(() => void 0);
}
function scheduleChatGptQueueFlush() {
	if (chatGptQueueTimer || queuedChatGptJobs.size === 0) return;
	chatGptQueueTimer = setTimeout(() => {
		chatGptQueueTimer = void 0;
		flushChatGptQueue();
	}, 3e3);
}
async function flushChatGptQueue() {
	if (queuedChatGptJobs.size === 0) return;
	pruneStaleChatGptJobs$1();
	const now = Date.now();
	for (const [jobId, queued] of queuedChatGptJobs) {
		if (now - (queuedChatGptSince.get(jobId) || now) <= CHATGPT_QUEUE_WAIT_STALE_MS) continue;
		queuedChatGptJobs.delete(jobId);
		queuedChatGptSince.delete(jobId);
		sendToDesktop$1({
			type: "JOB_RESULT",
			jobId,
			status: "failed_retryable",
			assets: [],
			error: "ChatGPT queue wait exceeded 5 minutes; the older provider job did not release the single-flight slot. Retry after refreshing the provider tab."
		});
	}
	if (queuedChatGptJobs.size === 0) return;
	if (Array.from(activeJobs$1.values()).some((job) => job.provider === "chatgpt")) {
		scheduleChatGptQueueFlush();
		return;
	}
	const next = queuedChatGptJobs.values().next().value;
	if (!next) return;
	queuedChatGptJobs.delete(next.jobId);
	queuedChatGptSince.delete(next.jobId);
	await startAdmittedJob(next);
	if (queuedChatGptJobs.size > 0) scheduleChatGptQueueFlush();
}
async function dispatchCustomFlowJob(job, targetUrl) {
	if (job.provider !== "google-flow" || job.task !== "image_to_video") return false;
	if (!(0, import_flow_executor_selection.shouldUseFlowCustomTool)(job)) {
		sendStatus$1(job.jobId, "opening_provider", "Using the Flow UI-direct v2 executor; Studio Shot Bridge is bypassed for this job.", .11);
		return false;
	}
	const flow = await findFlowProjectTab$1();
	sendStatus$1(job.jobId, "opening_provider", `Flow tab scan: ${flow.flowTabCount} tabs, ${flow.projectTabCount} project, ${flow.customToolTabCount} custom-tool.`, .105);
	if (String(job.settings?.flowMediaId || job.settings?.imageMediaId || "").trim() && String(job.settings?.sourceMode || job.settings?.flowVideoMode || "frames") === "frames" && isFlowCustomToolUrl$1(flow.activeFlowTab?.url)) {
		const runtimeUrl = new URL(String(flow.activeFlowTab?.url));
		runtimeUrl.pathname = runtimeUrl.pathname.replace(/\/tool\/[^/]+\/?$/i, "").replace(/\/+$/, "");
		runtimeUrl.search = "";
		runtimeUrl.hash = "";
		job.conversationUrl = runtimeUrl.toString();
		job.settings = {
			...job.settings || {},
			flowProjectUrl: job.conversationUrl,
			providerWorkspaceUrl: job.conversationUrl
		};
		await persistActiveJobSnapshot$1(job);
	} else await bindFlowWorkspace(job, targetUrl, flow);
	let tab = await activeFlowCustomToolTab$1();
	if (tab && !/(?:\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+|\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1|64a29df4-340e-44ae-8a9e-3bf77056f9a7|f84d4d6a-ac30-4bfe-89fc-44e62c09f99e|1f79134e-f6ad-4589-903a-8fead23a6379)|\/shared\/tool\/f84d4d6a-ac30-4bfe-89fc-44e62c09f99e)(?:[/?#]|$)/i.test(String(tab.url || ""))) {
		sendStatus$1(job.jobId, "opening_provider", "Flow đang mở bản DRAFT /tool/; bỏ qua tab chỉnh sửa và chỉ chấp nhận runtime /tool-version/ hoặc /shared/tool/ đã publish.", .108);
		tab = void 0;
	}
	sendStatus$1(job.jobId, "opening_provider", `Flow runtime candidate: ${tab?.url || "none"}.`, .108);
	if (!tab) {
		const savedRuntimeUrl = job.flowRuntimeUrl || String(job.settings?.flowRuntimeUrl || "");
		if (!isFlowCustomToolUrl$1(savedRuntimeUrl)) throw new Error("Studio Shot Bridge runtime is not open. In Flow, open Công cụ → PDL Studio Shot Bridge and open the published /tool-version/ runtime, then retry this shot.");
		const refreshed = await findFlowProjectTab$1();
		const reusable = refreshed.tab || refreshed.activeFlowTab;
		if (!reusable?.id) throw new Error("Open one signed-in Google Flow project tab before running Studio Shot Bridge.");
		sendStatus$1(job.jobId, "opening_provider", "Opening Studio Shot Bridge in the existing signed-in Flow tab...", .11);
		tab = await chrome.tabs.update(reusable.id, { url: savedRuntimeUrl });
		try {
			await waitForTabComplete$1(reusable.id, 2e4);
		} catch {
			throw new Error("Studio Shot Bridge runtime did not finish loading within 20 seconds. Keep the Flow workspace and runtime tabs open, then reload the runtime tool before retrying.");
		}
		tab = await chrome.tabs.get(reusable.id);
		if (!isFlowCustomToolUrl$1(tab.url)) throw new Error("Google Flow is open, but Studio Shot Bridge is not attached. Open the shared Studio Shot Bridge tool in this signed-in Flow workspace, then retry.");
	}
	if (tab.url && /(?:\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+|\/project\/[^/]+\/tool\/(?:578615c4-cc20-42f4-b3b3-5ae1b1454e94|fb030780-41d2-48a6-8fa5-bc94538e60c1|64a29df4-340e-44ae-8a9e-3bf77056f9a7|f84d4d6a-ac30-4bfe-89fc-44e62c09f99e)|\/shared\/tool\/f84d4d6a-ac30-4bfe-89fc-44e62c09f99e)(?:[/?#]|$)/i.test(tab.url)) job.flowRuntimeUrl = tab.url;
	if (tab.id) {
		job.tabId = tab.id;
		await ensureContentScript$1(job);
	}
	sendStatus$1(job.jobId, "submitting", "Waiting for the previous Studio Shot Bridge command to release the Flow tab...", .12);
	await enqueueCustomToolJob$1(job, tab);
	return true;
}
async function openProviderJob(job, targetUrl) {
	if (job.provider === "google-flow" && job.task === "image_to_video" && !job.conversationUrl) throw new Error("No signed-in Google Flow project workspace was observed. Open the target project in one Flow tab, then run this shot again.");
	if (job.provider === "google-flow" && job.task === "image_to_video" && job.conversationUrl) {
		const tab = await findExactFlowProjectTab$1(job.conversationUrl);
		if (!tab.id) throw new Error("The locked Google Flow project tab has no browser id.");
		await persistProviderTab(job, tab);
		return dispatchToContentScript$1(job);
	}
	let tab = await findOrCreateTab$1(job.conversationUrl || targetUrl, job.provider, job.jobId);
	if (!tab.id) throw new Error("Provider tab has no id");
	tab = await prepareFreshConversation(job, tab, targetUrl);
	await persistProviderTab(job, tab);
	if (tab.status === "complete") return dispatchToContentScript$1(job);
	if (job.provider === "chatgpt") {
		await new Promise((resolve) => setTimeout(resolve, 2500));
		return dispatchToContentScript$1(job);
	}
	await waitForProviderTab(job, tab.id);
}
async function prepareFreshConversation(job, tab, targetUrl) {
	if (job.provider !== "chatgpt" || !job.settings?.newConversation || job.conversationUrl || !tab.id) return tab;
	sendStatus$1(job.jobId, "opening_provider", "Opening a clean ChatGPT conversation for this production session...", .16);
	job.settings = {
		...job.settings,
		newConversation: false,
		freshConversationNavigated: true
	};
	return tab;
}
async function persistProviderTab(job, tab) {
	job.tabId = tab.id;
	if (job.provider === "google-flow" && isFlowProjectUrl$1(tab.url)) {
		job.conversationUrl = String(tab.url).replace(/\/edit\/.*$/i, "");
		job.settings = {
			...job.settings || {},
			providerWorkspaceUrl: job.conversationUrl
		};
	}
	await persistActiveJobSnapshot$1(job);
}
async function waitForProviderTab(job, tabId) {
	let tab;
	try {
		tab = await waitForTabComplete$1(tabId, 6e4);
	} catch (error) {
		const current = await chrome.tabs.get(tabId).catch(() => void 0);
		if (job.provider !== "chatgpt" || !current?.url?.startsWith("https://chatgpt.com/")) throw error;
		sendStatus$1(job.jobId, "submitting", "ChatGPT tab reports loading; probing the live adapter before retrying.", .24);
		await dispatchToContentScript$1(job);
		return;
	}
	if (tab.status !== "complete") {
		const current = await chrome.tabs.get(tabId).catch(() => void 0);
		if (job.provider !== "chatgpt" || !current?.url?.startsWith("https://chatgpt.com/")) throw new Error(`Timed out waiting for ${job.provider} provider tab to finish loading.`);
		sendStatus$1(job.jobId, "submitting", "ChatGPT tab reports loading; probing the live adapter before retrying.", .24);
	}
	await new Promise((resolve) => setTimeout(resolve, 1500));
	await dispatchToContentScript$1(job);
}
async function handleRunFailure(job, error) {
	const flowVideo = job.provider === "google-flow" && job.task === "image_to_video";
	const message = error instanceof Error ? error.message : String(error);
	if (flowVideo && flowJobWasSubmitted$1(job)) {
		sendToDesktop$1({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: `Google Flow generation failed after preflight and provider authorization. Prompt delivery and Studio Shot Bridge succeeded; Flow did not return a video. This can be caused by provider capacity, quota, safety, or model availability. Wait for the provider condition to clear, or change the authorized Flow workspace/model, then retry this shot without rewriting it. Technical detail: ${message}`
		});
		activeJobs$1.delete(job.jobId);
		return;
	}
	if (flowVideo && isFlowAmbiguousCustomToolError$1(error)) {
		await handleContentResult$1({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: `Studio Shot Bridge lost its control callback after the Flow command may have been accepted. Recovering the strict current-job result without resubmitting: ${message}`
		});
		return;
	}
	if (job.provider === "chatgpt" && (job.task === "image" || job.task === "text_to_image") && job.tabId && isSavedChatGptConversationUrl(job.conversationUrl)) {
		job.chatGptImageRecoveryActive = true;
		sendStatus$1(job.jobId, "opening_provider", `ChatGPT tab became unreadable after submission. Reloading ${job.conversationUrl} and checking for the image before failing...`, .2);
		retryRecoveredCapture$1(job, job.tabId);
		return;
	}
	sendToDesktop$1({
		type: "JOB_RESULT",
		jobId: job.jobId,
		status: /Open one signed-in blank ChatGPT tab first/i.test(message) ? "failed_manual" : "failed_retryable",
		assets: [],
		error: `Failed to open provider tab: ${message}`
	});
	activeJobs$1.delete(job.jobId);
}
async function startAdmittedJob(job) {
	activeJobs$1.set(job.jobId, job);
	job.lastActivityAt = Date.now();
	sendStatus$1(job.jobId, "opening_provider", `Opening ${job.provider}...`, .1);
	const targetUrl = providerAdapter(job.provider).targetUrl;
	try {
		if (job.provider === "google-flow" && job.task === "image_to_video" && !job.conversationUrl) {
			const requestedWorkspace = String(job.settings?.flowProjectUrl || job.settings?.providerWorkspaceUrl || "").trim();
			if (/^https:\/\/labs\.google\/fx\/[^/]+\/tools\/flow\/project\/[^/]+(?:\/|$)/i.test(requestedWorkspace)) try {
				const url = new URL(requestedWorkspace);
				url.pathname = url.pathname.replace(/\/(?:tool|tool-version)\/[^/]+\/?$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "");
				url.search = "";
				url.hash = "";
				job.conversationUrl = url.toString();
				job.settings = {
					...job.settings || {},
					providerWorkspaceUrl: job.conversationUrl
				};
				await persistActiveJobSnapshot$1(job);
			} catch {}
		}
		if (job.provider === "google-flow" && job.task === "image_to_video" && !(0, import_flow_executor_selection.shouldUseFlowCustomTool)(job) && !job.conversationUrl) {
			const flow = await findFlowProjectTab$1();
			const workspace = flow.tab && !isFlowCustomToolUrl$1(flow.tab.url) ? flow.tab : void 0;
			if (workspace?.url && isFlowProjectUrl$1(workspace.url)) try {
				const url = new URL(workspace.url);
				url.pathname = url.pathname.replace(/\/tool-version\/[^/]+\/?$/i, "").replace(/\/tool\/[^/]+\/?$/i, "").replace(/\/edit\/[^/]+\/?$/i, "").replace(/\/+$/, "");
				url.search = "";
				url.hash = "";
				if (/\/project\/[^/]+$/i.test(url.pathname)) {
					job.conversationUrl = url.toString();
					job.settings = {
						...job.settings || {},
						providerWorkspaceUrl: job.conversationUrl
					};
					await persistActiveJobSnapshot$1(job);
				}
			} catch {}
		}
		if (!await dispatchCustomFlowJob(job, targetUrl)) await openProviderJob(job, targetUrl);
	} catch (error) {
		await handleRunFailure(job, error);
	}
}
async function handleRunJob(message) {
	const job = buildStudioJob(message);
	if (!admitJob(job)) return;
	await startAdmittedJob(job);
}
//#endregion
//#region src/background/runtime-utils.ts
function flowStartFrameAssetId(job) {
	return String(job?.settings?.startFrameAssetId || job?.references?.[0]?.assetId || "");
}
function flowResultMetadata(job, asset, extra = {}) {
	const metadata = asset.metadata || {};
	if (job?.provider !== "google-flow") return {
		...metadata,
		...extra,
		filename: asset.filename,
		mimeType: asset.mimeType
	};
	const startFrameAssetId = flowStartFrameAssetId(job);
	return {
		...metadata,
		...extra,
		studioJobId: job.jobId,
		currentJobOnly: metadata.currentJobOnly === false ? false : true,
		startFrameAssetId: startFrameAssetId || metadata.startFrameAssetId,
		filename: asset.filename,
		mimeType: asset.mimeType
	};
}
function withTimeout(promise, timeoutMs, label) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`${label} timed out after ${Math.round(timeoutMs / 1e3)}s`)), timeoutMs);
	});
	return Promise.race([promise, timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}
function randomDelay([minMs, maxMs]) {
	return Math.round(minMs + Math.random() * Math.max(0, maxMs - minMs));
}
function inferProviderFromUrl(urlValue) {
	try {
		const url = new URL(urlValue);
		if ([
			"labs.google",
			"labs.google.com",
			"flow.google.com"
		].includes(url.hostname)) return "google-flow";
		if (url.hostname === "grok.com" || url.hostname === "x.com" && url.pathname.startsWith("/i/grok")) return "grok";
		if (["chatgpt.com", "chat.openai.com"].includes(url.hostname)) return "chatgpt";
		if (url.hostname === "elevenlabs.io" && url.pathname.startsWith("/app/flows/")) return "elevenlabs-flows";
	} catch {}
	return "";
}
//#endregion
//#region src/background/installation-identity.cjs
var require_installation_identity = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var STORAGE_KEY = "studio.extensionInstanceId.v1";
	async function loadOrCreateInstallationId(storage, randomUUID = () => crypto.randomUUID()) {
		const stored = await storage.get(STORAGE_KEY);
		const existing = typeof stored?.[STORAGE_KEY] === "string" ? stored[STORAGE_KEY].trim() : "";
		if (existing) return existing;
		const generated = String(randomUUID()).trim();
		if (!generated) throw new Error("Extension installation identity generator returned an empty value.");
		await storage.set({ [STORAGE_KEY]: generated });
		return generated;
	}
	module.exports = {
		STORAGE_KEY,
		loadOrCreateInstallationId
	};
}));
//#endregion
//#region ../../packages/protocol/src/capabilities.cjs
var require_capabilities = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var DEFAULT_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
	function strings(value) {
		return Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].sort() : [];
	}
	function numbers(value) {
		return Array.isArray(value) ? [...new Set(value.map(Number).filter((item) => Number.isSafeInteger(item) && item > 0))].sort((a, b) => a - b) : [];
	}
	function normalizeCapabilityManifest(value) {
		const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
		const maxMessageBytes = Number(input.maxMessageBytes);
		return {
			manifestVersion: String(input.manifestVersion || "1"),
			protocolVersions: numbers(input.protocolVersions),
			providers: strings(input.providers),
			executors: strings(input.executors),
			tasks: strings(input.tasks),
			maxMessageBytes: Number.isFinite(maxMessageBytes) && maxMessageBytes >= 1024 ? Math.floor(maxMessageBytes) : DEFAULT_MAX_MESSAGE_BYTES,
			binaryTransfer: String(input.binaryTransfer || "none")
		};
	}
	function capabilityIssues(manifestValue, requirement = {}, messageBytes = 0) {
		const manifest = normalizeCapabilityManifest(manifestValue);
		const issues = [];
		const protocolVersion = Number(requirement.protocolVersion || 1);
		const provider = String(requirement.provider || "");
		const executor = String(requirement.executor || "");
		const task = String(requirement.task || "");
		if (manifest.protocolVersions.length && !manifest.protocolVersions.includes(protocolVersion)) issues.push("protocol_version_unsupported");
		if (provider && manifest.providers.length && !manifest.providers.includes(provider)) issues.push("provider_unsupported");
		if (executor && manifest.executors.length && !manifest.executors.includes(executor)) issues.push("executor_unsupported");
		if (task && manifest.tasks.length && !manifest.tasks.includes(task)) issues.push("task_unsupported");
		if (Number(messageBytes) > manifest.maxMessageBytes) issues.push("message_too_large");
		if (requirement.binaryTransfer && String(requirement.binaryTransfer) !== manifest.binaryTransfer) issues.push("binary_transfer_unsupported");
		return {
			ok: issues.length === 0,
			issues,
			manifest
		};
	}
	module.exports = {
		DEFAULT_MAX_MESSAGE_BYTES,
		normalizeCapabilityManifest,
		capabilityIssues
	};
}));
//#endregion
//#region src/background/index.ts
var import_installation_identity = /* @__PURE__ */ __toESM(require_installation_identity(), 1);
var import_capabilities = /* @__PURE__ */ __toESM(require_capabilities(), 1);
var configuredBridgePort = 3767;
var BRIDGE_URL = `ws://127.0.0.1:${Number.isInteger(configuredBridgePort) && true ? configuredBridgePort : 3767}`;
var REQUIRED_CHATGPT_ADAPTER_CAPABILITIES = [
	"chatgpt-result-baseline-v12",
	"verified-reference-upload-v22",
	"structured-json-tail-recovery-v23"
];
var KEEPALIVE_ALARM = "studio-bridge-keepalive";
var EXTENSION_SESSION_ID = crypto.randomUUID();
var EXTENSION_INSTANCE_ID = `${chrome.runtime.id}:${EXTENSION_SESSION_ID}`;
var extensionIdentityReady = import_installation_identity.default.loadOrCreateInstallationId(chrome.storage.local, () => crypto.randomUUID()).then((value) => {
	EXTENSION_INSTANCE_ID = value;
	return value;
}).catch(() => EXTENSION_INSTANCE_ID);
var FLOW_RECOVERY_TIMEOUT_MS = 9e5;
var CHATGPT_MIN_DISPATCH_INTERVAL_MS = 12e4;
var PROVIDER_MIN_DISPATCH_INTERVAL_MS = {
	"google-flow": 8e3,
	"elevenlabs-flows": 4e3,
	grok: 5e3
};
var CHATGPT_RATE_LIMIT_COOLDOWN_MS = 15 * 6e4;
var CHATGPT_ACTIVE_JOB_STALE_MS = 5 * 6e4;
var CHATGPT_OPENING_NO_ACK_STALE_MS = 9e4;
var CHATGPT_DOWNLOADING_STALE_MS = 9e4;
var CHATGPT_RATE_LIMIT_STORAGE_KEY = "studio.chatgpt.rateLimitedUntil.v1";
var CHATGPT_STUDIO_TAB_STORAGE_KEY = "studio.chatgpt.tabId.v1";
var PROVIDER_DISPATCH_DELAY_MS = {
	chatgpt: [2e4, 3e4],
	"google-flow": [7e3, 14e3],
	"elevenlabs-flows": [3500, 7e3],
	grok: [4e3, 9e3]
};
var PROVIDER_URLS = Object.fromEntries(providerAdapters.map((adapter) => [adapter.provider, adapter.targetUrl]));
var EXTENSION_CAPABILITIES = import_capabilities.default.normalizeCapabilityManifest({
	manifestVersion: "2",
	protocolVersions: [1, 2],
	providers: Object.keys(PROVIDER_URLS),
	executors: ["custom-tool-v1", "flow-ui-direct-v2"],
	tasks: [
		"connection_test",
		"quick_visual_analysis",
		"story_development",
		"story_foundation",
		"story_architecture",
		"screenplay_scene",
		"shot_breakdown",
		"production_graph_revision",
		"translation",
		"prompt_enhance",
		"text_to_image",
		"image_to_video",
		"download"
	],
	maxMessageBytes: 4 * 1024 * 1024,
	binaryTransfer: "loopback-file"
});
var CONTENT_SCRIPT_BY_PROVIDER = Object.fromEntries(providerAdapters.filter((adapter) => adapter.contentScript).map((adapter) => [adapter.provider, adapter.contentScript]));
var MAIN_WORLD_SCRIPT_BY_PROVIDER = Object.fromEntries(providerAdapters.filter((adapter) => adapter.mainWorldScript).map((adapter) => [adapter.provider, adapter.mainWorldScript]));
var EXISTING_TAB_PROVIDERS = new Set([
	"google-flow",
	"elevenlabs-flows",
	"grok"
]);
var FLOW_TAB_PATTERNS = [
	"https://labs.google/fx/*",
	"https://labs.google.com/fx/*",
	"https://flow.google.com/fx/*",
	"https://flow.google.com/project/*",
	"https://flow.google.com/project/*/tool/*"
];
var activeJobs = /* @__PURE__ */ new Map();
var latestProviderVisibility = {};
var completedResultJobs = /* @__PURE__ */ new Set();
var processingResultJobs = /* @__PURE__ */ new Set();
var customToolActiveJobs = /* @__PURE__ */ new Set();
var chatGptSessions = createChatGptSessionStore(activeJobs);
var chatGptBrowserState = createChatGptBrowserState(CHATGPT_RATE_LIMIT_STORAGE_KEY, CHATGPT_STUDIO_TAB_STORAGE_KEY, (tab) => providerTabMatches("chatgpt", tab.url));
var persistedChatGptRateLimitedUntil = chatGptBrowserState.rateLimitedUntil;
var persistChatGptRateLimit = chatGptBrowserState.persistRateLimit;
var rememberStudioChatGptTab = chatGptBrowserState.rememberTab;
var rememberedStudioChatGptTab = chatGptBrowserState.rememberedTab;
var persistActiveJobSnapshot = chatGptSessions.persist;
var restoreActiveJobSnapshot = chatGptSessions.restore;
var forgetActiveJobSnapshot = chatGptSessions.forget;
async function humanProviderPause(provider, phase, jobId) {
	const delay = randomDelay(PROVIDER_DISPATCH_DELAY_MS[provider] || [2500, 6e3]);
	sendStatus(jobId, "opening_provider", `Waiting ${Math.round(delay / 1e3)}s before ${phase} to keep browser automation human-paced...`, .2);
	await new Promise((resolve) => setTimeout(resolve, delay));
}
async function providerVisibilitySnapshot() {
	let flowVisibilityError = "";
	const flow = await findFlowProjectTab().catch((error) => {
		flowVisibilityError = error instanceof Error ? error.message : String(error);
		return {
			flowTabCount: 0,
			projectTabCount: 0,
			customToolTabCount: 0,
			runtimeToolTabCount: 0,
			editorToolTabCount: 0,
			urls: []
		};
	});
	const elevenLabsFlowsTabs = (await chrome.tabs.query({ url: "https://elevenlabs.io/app/flows/*" }).catch(() => [])).filter((tab) => providerTabMatches("elevenlabs-flows", tab.url));
	const snapshot = {
		googleFlowTabs: flow.flowTabCount,
		googleFlowProjectTabs: flow.projectTabCount,
		googleFlowCustomToolTabs: flow.customToolTabCount,
		googleFlowRuntimeToolTabs: flow.runtimeToolTabCount,
		googleFlowEditorToolTabs: flow.editorToolTabCount,
		googleFlowUrls: flow.urls,
		...flowVisibilityError ? { googleFlowVisibilityError: flowVisibilityError } : {},
		elevenLabsFlowsTabs: elevenLabsFlowsTabs.length,
		elevenLabsFlowsUrls: elevenLabsFlowsTabs.map((tab) => tab.url || "").filter(Boolean).slice(0, 4)
	};
	latestProviderVisibility = snapshot;
	return snapshot;
}
var bridge = createBridgeRuntime({
	bridgeUrl: BRIDGE_URL,
	extensionSessionId: EXTENSION_SESSION_ID,
	extensionInstanceId: () => EXTENSION_INSTANCE_ID,
	capabilities: EXTENSION_CAPABILITIES,
	providers: Object.keys(PROVIDER_URLS),
	providerVisibility: providerVisibilitySnapshot,
	handleDesktopMessage: (message) => handleDesktopMessage(message)
});
var connect = () => {
	extensionIdentityReady.finally(() => bridge.connect());
};
var ensureBridgeConnection = bridge.ensureConnection;
bridge.hello;
var refreshExtensionStatus = bridge.refreshStatus;
var sendToDesktop = bridge.send;
var requestDesktopNativeClick = bridge.requestNativeClick;
var requestDesktopFlowToolEvaluate = bridge.requestFlowToolEvaluate;
function sendStatus(jobId, status, message, progress = 0) {
	const job = activeJobs.get(jobId);
	if (job) {
		job.lastStatus = status;
		job.lastStatusMessage = message;
		job.lastProgress = progress;
		job.lastActivityAt = Date.now();
	}
	sendToDesktop({
		type: "JOB_STATUS",
		jobId,
		status,
		message,
		progress
	});
}
function pruneStaleChatGptJobs(nowMs = Date.now()) {
	for (const [jobId, candidate] of activeJobs) {
		if (candidate.provider !== "chatgpt") continue;
		const lastActivityAt = Number(candidate.lastActivityAt || 0);
		const staleOpening = candidate.lastStatus === "opening_provider" && Number(candidate.lastProgress || 0) <= .2 && (!lastActivityAt || nowMs - lastActivityAt > CHATGPT_OPENING_NO_ACK_STALE_MS);
		const staleDownloading = candidate.lastStatus === "downloading" && (!lastActivityAt || nowMs - lastActivityAt > CHATGPT_DOWNLOADING_STALE_MS);
		if (staleOpening || staleDownloading || !lastActivityAt || nowMs - lastActivityAt > CHATGPT_ACTIVE_JOB_STALE_MS) {
			activeJobs.delete(jobId);
			processingResultJobs.delete(jobId);
			forgetActiveJobSnapshot(jobId);
			sendToDesktop({
				type: "JOB_RESULT",
				jobId,
				status: "failed_retryable",
				assets: [],
				error: staleDownloading ? "ChatGPT asset handoff became stale and was released; retry after reloading the provider tab." : "ChatGPT provider dispatch became stale after the bridge acknowledgement and was released; retry without resubmitting the old request."
			});
			continue;
		}
	}
}
setInterval(() => pruneStaleChatGptJobs(), 15e3);
var coordinator;
var enqueueCustomToolJob;
var cancelCustomToolJob;
var probeFlowAppIntake;
var handleDesktopMessage = (message) => coordinator.handleDesktopMessage(message);
var retryRecoveredCapture = (job, tabId) => coordinator.retryRecoveredCapture(job, tabId);
var uploadChatGptReferencesNatively = (job, assetId) => coordinator.uploadChatGptReferencesNatively(job, assetId);
var { activeFlowCustomToolTab, chatGptPageHasFatalShellError, chatGptPageHasRateLimit, findExistingProviderTab, findFlowProjectTab, findExactFlowProjectTab, findOrCreateTab, isFlowCustomToolUrl, isFlowProjectUrl, isProviderErrorPage, providerTabMatches, retryProviderTabAfterErrorPage, waitForTabComplete } = createProviderTabs({
	existingTabProviders: EXISTING_TAB_PROVIDERS,
	flowTabPatterns: FLOW_TAB_PATTERNS,
	providerUrls: PROVIDER_URLS,
	inferProviderFromUrl,
	normalizeProvider: normalizeProvider$2,
	providerAdapter: providerAdapter$3,
	rememberedStudioChatGptTab,
	rememberStudioChatGptTab,
	sendStatus
});
var flowCustomToolAdapter = createGoogleFlowCustomToolAdapter({
	activeJobs,
	bridgeIsOpen: bridge.isOpen,
	customToolActiveJobs,
	handleContentResult: (data) => handleContentResult(data),
	requestDesktopFlowToolEvaluate,
	sendStatus,
	sendToDesktop,
	waitForTabComplete
});
enqueueCustomToolJob = flowCustomToolAdapter.dispatch;
cancelCustomToolJob = flowCustomToolAdapter.cancel;
probeFlowAppIntake = flowCustomToolAdapter.probeIntake;
var { dispatchNativeCanvasDrag, dispatchNativeFileChooserUpload, dispatchNativeFileInput, dispatchNativeMouseClick, dispatchNativeTextInsert, dispatchTobyFlowTextInsert, dispatchToContentScript, ensureContentScript, flowJobWasSubmitted, hardResetChatGptDispatch, isFlowAmbiguousCustomToolError, isFlowBridgeUnavailableError, isFlowDefinitiveProviderFailure, isFlowMidComposerFailure, isFlowPageCrashError, isFlowPostSubmitInspectionError, reloadAndRecoverFlowResult, reloadAndRedispatchFlowJob } = createDispatchRuntime({
	activeJobs,
	chatGptPageHasFatalShellError,
	chatGptPageHasRateLimit,
	contentScripts: CONTENT_SCRIPT_BY_PROVIDER,
	findOrCreateTab,
	handleContentResult: (data) => handleContentResult(data),
	humanProviderPause,
	isSavedChatGptConversationUrl: isSavedChatGptConversationUrl$2,
	mainWorldScripts: MAIN_WORLD_SCRIPT_BY_PROVIDER,
	providerMinDispatchIntervalMs: PROVIDER_MIN_DISPATCH_INTERVAL_MS,
	chatGptMinDispatchIntervalMs: CHATGPT_MIN_DISPATCH_INTERVAL_MS,
	persistActiveJobSnapshot,
	providerAdapter: providerAdapter$3,
	providerUrls: PROVIDER_URLS,
	persistedChatGptRateLimitedUntil,
	providerTabMatches,
	requestDesktopNativeClick,
	recoverLatestFlowResult: (job, error, allowVisibleFallback) => recoverLatestFlowResult(job, error, allowVisibleFallback),
	requiredChatGptCapabilities: REQUIRED_CHATGPT_ADAPTER_CAPABILITIES,
	retryProviderTabAfterErrorPage,
	retryRecoveredCapture,
	sendStatus,
	sendToDesktop,
	uploadChatGptReferencesNatively,
	waitForTabComplete,
	withTimeout
});
function handleCancelJob(jobId) {
	const job = activeJobs.get(jobId);
	cancelCustomToolJob?.(jobId);
	if (job?.tabId) chrome.tabs.sendMessage(job.tabId, {
		action: "CANCEL_JOB",
		jobId
	}).catch(() => void 0);
	activeJobs.delete(jobId);
}
var resultRuntime = createResultRuntime({
	activeFlowCustomToolTab,
	activeJobs,
	completedResultJobs,
	processingResultJobs,
	findFlowProjectTab,
	flowResultMetadata,
	flowStartFrameAssetId,
	forgetActiveJobSnapshot,
	inferProviderFromUrl,
	requestDesktopFlowToolEvaluate,
	sendToDesktop,
	chatGptRateLimitCooldownMs: CHATGPT_RATE_LIMIT_COOLDOWN_MS,
	ensureContentScript,
	flowJobWasSubmitted,
	isFlowBridgeUnavailableError,
	flowRecoveryTimeoutMs: FLOW_RECOVERY_TIMEOUT_MS,
	isFlowAmbiguousCustomToolError,
	isFlowDefinitiveProviderFailure,
	isFlowPageCrashError,
	isFlowPostSubmitInspectionError,
	isSavedChatGptConversationUrl: isSavedChatGptConversationUrl$2,
	persistChatGptRateLimit,
	reloadAndRecoverFlowResult,
	reloadAndRedispatchFlowJob,
	retryRecoveredCapture,
	sendStatus,
	waitForTabComplete,
	withTimeout
});
var handleContentResult = resultRuntime.handleContentResult;
var recoverLatestFlowResult = resultRuntime.recoverLatestFlowResult;
coordinator = createJobCoordinator({
	activeFlowCustomToolTab,
	activeJobs,
	bridge,
	dispatchToContentScript,
	enqueueCustomToolJob,
	ensureContentScript,
	extensionSessionId: EXTENSION_SESSION_ID,
	findFlowProjectTab,
	findExactFlowProjectTab,
	findOrCreateTab,
	flowJobWasSubmitted,
	flowRecoveryTimeoutMs: FLOW_RECOVERY_TIMEOUT_MS,
	handleCancelJob,
	handleContentResult,
	hardResetChatGptDispatch,
	isFlowAmbiguousCustomToolError,
	isFlowCustomToolUrl,
	isFlowProjectUrl,
	isSavedChatGptConversationUrl: isSavedChatGptConversationUrl$2,
	normalizeProvider: normalizeProvider$2,
	persistActiveJobSnapshot,
	planProviderAdmission: planProviderAdmission$1,
	providerAdapter: providerAdapter$3,
	providerUrls: PROVIDER_URLS,
	providerVisibilitySnapshot,
	pruneStaleChatGptJobs,
	recoverLatestFlowResult,
	restoreActiveJobSnapshot,
	sendStatus,
	sendToDesktop,
	waitForTabComplete,
	withTimeout
});
registerRuntimeMessageListener({
	activeJobs,
	bridgeStatus: () => ({
		connected: bridge.isOpen(),
		activeJobs: activeJobs.size,
		availableProviders: Object.keys(PROVIDER_URLS),
		lastError: bridge.status().lastError,
		pairing: bridge.status().pairing,
		providerVisibility: latestProviderVisibility,
		discovery: bridge.discovery(),
		capabilities: EXTENSION_CAPABILITIES
	}),
	providerVisibilitySnapshot,
	dispatchNativeCanvasDrag,
	dispatchNativeFileChooserUpload,
	dispatchNativeFileInput,
	dispatchNativeMouseClick,
	dispatchNativeTextInsert,
	dispatchTobyFlowTextInsert,
	enqueueCustomToolJob,
	ensureBridgeConnection,
	handleContentResult,
	probeFlowAppIntake,
	isSavedChatGptConversationUrl: isSavedChatGptConversationUrl$2,
	forgetActiveJobSnapshot,
	persistActiveJobSnapshot,
	restoreActiveJobSnapshot,
	sendToDesktop,
	uploadChatGptReferencesNatively
});
connect();
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: .5 });
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name !== KEEPALIVE_ALARM) return;
	ensureBridgeConnection();
	if (bridge.isOpen()) refreshExtensionStatus();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.tabs.onUpdated.addListener((tabId, info) => {
	if (info.url || info.status === "complete") chrome.tabs.get(tabId).then((tab) => {
		if (providerTabMatches("google-flow", tab.url)) refreshExtensionStatus();
	}).catch(() => void 0);
	const crashedJob = Array.from(activeJobs.values()).find((candidate) => candidate.provider === "google-flow" && candidate.tabId === tabId);
	const flowCrashVisible = /application error:\s*a client-side exception|aw,\s*snap|err_[a-z_]+/i.test(String(info.title || info.url || ""));
	const unexpectedEditRoute = /\/tools\/flow\/project\/[^/]+\/edit\/[^/]+/i.test(String(info.url || "")) && !/generation was accepted|waiting for google flow result/i.test(crashedJob?.lastStatusMessage || "");
	if (crashedJob && (flowCrashVisible || unexpectedEditRoute) && !crashedJob.flowReloadRecoveryActive) {
		crashedJob.flowReloadRecoveryActive = true;
		const submitWasClicked = /submit button clicked|generation was accepted|waiting for google flow result/i.test(crashedJob.lastStatusMessage || "");
		(submitWasClicked ? reloadAndRecoverFlowResult(crashedJob, "Flow crashed immediately after submit; recover without resubmitting.") : reloadAndRedispatchFlowJob(crashedJob, unexpectedEditRoute ? "Google Flow left the project composer for an old media edit route before submit." : "Google Flow crashed with a client-side exception before submit.")).then((recovered) => {
			if (recovered) return;
			sendToDesktop({
				type: "JOB_RESULT",
				jobId: crashedJob.jobId,
				status: "failed_retryable",
				assets: [],
				error: submitWasClicked ? "Flow crashed after submit, but strict recovery could not find a video tied to this job. The adapter did not resubmit." : "Flow crashed before submit and could not be safely redispatched."
			});
			activeJobs.delete(crashedJob.jobId);
		}).finally(() => {
			crashedJob.flowReloadRecoveryActive = false;
		});
		return;
	}
	if (info.status !== "complete") return;
	const job = Array.from(activeJobs.values()).find((candidate) => candidate.provider === "google-flow" && candidate.tabId === tabId && Number(candidate.lastProgress || 0) >= .7 && !candidate.flowReloadRecoveryActive);
	if (!job) return;
	job.flowReloadRecoveryActive = true;
	reloadAndRecoverFlowResult(job, "Flow tab reloaded after submit; recover the accepted result without resubmitting.").then((recovered) => {
		if (recovered) return;
		sendToDesktop({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: "Flow reloaded after submit, but strict recovery could not tie a completed video to this job. The adapter did not resubmit."
		});
		activeJobs.delete(job.jobId);
	}).catch((error) => {
		sendToDesktop({
			type: "JOB_RESULT",
			jobId: job.jobId,
			status: "failed_retryable",
			assets: [],
			error: `Flow post-submit reload recovery failed without resubmitting: ${error instanceof Error ? error.message : String(error)}`
		});
		activeJobs.delete(job.jobId);
	});
});
//#endregion

//# sourceMappingURL=background.js.map