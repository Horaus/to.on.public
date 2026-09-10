(function() {
	//#region ../../packages/extension-providers/src/chatgpt/text-normalization.ts
	function extractBalancedJsonObject$1(text) {
		const start = text.indexOf("{");
		if (start < 0) return "";
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let index = start; index < text.length; index += 1) {
			const char = text[index];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\" && inString) {
				escaped = true;
				continue;
			}
			if (char === "\"") inString = !inString;
			if (inString) continue;
			if (char === "{") depth += 1;
			if (char === "}") depth -= 1;
			if (depth === 0) return text.slice(start, index + 1);
		}
		return "";
	}
	function normalizeAssistantText$1(text) {
		return text.split("\n").map((line) => line.trim()).filter(Boolean).filter((line) => {
			const lower = line.toLowerCase();
			return ![
				/^thought for\b/,
				/^thinking\b/,
				/^đã suy nghĩ\b/,
				/^đang suy nghĩ\b/,
				/^suy nghĩ\b/,
				/^xem thêm$/,
				/^read aloud$/,
				/^copy$/,
				/^good response$/,
				/^bad response$/,
				/^chỉnh sửa$/,
				/^share$/,
				/^chia sẻ$/
			].some((pattern) => pattern.test(lower));
		}).join("\n").trim();
	}
	function hasDegenerateStructuredTail(text) {
		return /(?:_?\]\(\)){4,}$/.test(text.slice(-240).replace(/\s+/g, ""));
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/structured-recovery.ts
	function storyCandidateIsSchemaEcho(parsed) {
		const placeholders = new Set([
			"one concise sentence",
			"primary subject name or stable label",
			"short scene title",
			"one visually observable action"
		]);
		const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
		const characters = Array.isArray(parsed?.characters) ? parsed.characters : [];
		const requirements = Array.isArray(parsed?.visualRequirements) ? parsed.visualRequirements : [];
		return placeholders.has(String(parsed?.logline || "").trim().toLowerCase()) || characters.some((character) => placeholders.has(String(character?.name || "").trim().toLowerCase())) || scenes.some((scene) => placeholders.has(String(scene?.title || "").trim().toLowerCase()) || (scene?.shots || []).some((shot) => placeholders.has(String(shot?.description || "").trim().toLowerCase()))) || requirements.some((requirement) => String(requirement?.role || "").includes(","));
	}
	function validStoryCandidateShape(parsed) {
		return Boolean(parsed.logline && parsed.story && Array.isArray(parsed.scenes) && parsed.scenes.length >= 1 && parsed.scenes.every((scene) => Array.isArray(scene?.shots) && scene.shots.length >= 1));
	}
	function isCompleteStoryJsonCandidate(candidate) {
		if (!candidate) return false;
		try {
			const parsed = JSON.parse(candidate);
			return Boolean(parsed && typeof parsed === "object" && validStoryCandidateShape(parsed) && !storyCandidateIsSchemaEcho(parsed));
		} catch {
			return false;
		}
	}
	var structuredTaskValidators = {
		story_foundation: (parsed) => Boolean(parsed.sourceAnalysis && Array.isArray(parsed.adaptationDecisions) && parsed.narrativeContract && Array.isArray(parsed.characters) && parsed.logline && parsed.story),
		story_architecture: (parsed) => {
			const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
			return Boolean(Array.isArray(parsed.visualRequirements) && parsed.visualRequirements.length > 0 && scenes.length > 0 && scenes.every((scene) => scene.shots === void 0));
		},
		shot_breakdown: (parsed) => Array.isArray(parsed.shots) && parsed.shots.length > 0,
		screenplay_scene: (parsed) => Boolean(parsed.screenplayScene)
	};
	function isCompleteStructuredJsonCandidate(candidate, task = "story_development") {
		if (!candidate) return false;
		if (task === "story_development") return isCompleteStoryJsonCandidate(candidate);
		try {
			const parsed = JSON.parse(candidate);
			return Boolean(parsed && typeof parsed === "object" && (structuredTaskValidators[task]?.(parsed) ?? true));
		} catch {
			return false;
		}
	}
	function isStructuredTask(task = "") {
		return [
			"story_development",
			"story_foundation",
			"story_architecture",
			"screenplay_scene",
			"shot_breakdown"
		].includes(task);
	}
	function hasCompleteStructuredJson(text, task) {
		const balanced = extractBalancedJsonObject$1(text);
		if (isCompleteStructuredJsonCandidate(balanced, task)) return true;
		const candidates = [];
		for (let index = 0; index < text.length; index++) if (text[index] === "{") candidates.push(extractBalancedJsonObject$1(text.slice(index)));
		if (candidates.some((candidate) => isCompleteStructuredJsonCandidate(candidate, task))) return true;
		if (task === "story_development" || Object.hasOwn(structuredTaskValidators, task)) return false;
		return [balanced, ...candidates].some((candidate) => candidate.length >= 200 && candidate.trim().startsWith("{") && candidate.trim().endsWith("}"));
	}
	function extractLatestCompleteStructuredJson$1(text, task) {
		const starts = [];
		for (let index = 0; index < text.length; index++) if (text[index] === "{") starts.push(index);
		for (let index = starts.length - 1; index >= 0; index--) {
			const candidate = extractBalancedJsonObject$1(text.slice(starts[index]));
			if (isCompleteStructuredJsonCandidate(candidate, task)) return candidate;
		}
		return "";
	}
	function extractLatestCompleteStoryJson$1(text) {
		const starts = Array.from(text, (character, index) => character === "{" ? index : -1).filter((index) => index >= 0);
		for (const start of starts.reverse()) {
			const candidate = extractBalancedJsonObject$1(text.slice(start));
			if (isCompleteStoryJsonCandidate(candidate)) return candidate;
		}
		return "";
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/reference-registry.ts
	var REGISTRY_KEY = "studio.chatgpt.referenceRegistry.v1";
	function referenceFingerprint(reference) {
		const normalizedBase64 = String(reference.base64 || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
		let hash = 2166136261;
		for (let index = 0; index < normalizedBase64.length; index += 1) {
			hash ^= normalizedBase64.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return `${reference.mimeType || "image/png"}:fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}:${normalizedBase64.length}`;
	}
	function readChatGptReferenceRegistry() {
		try {
			return JSON.parse(window.localStorage.getItem(REGISTRY_KEY) || "{}");
		} catch {
			return {};
		}
	}
	function writeChatGptReferenceRegistry(registry) {
		try {
			const entries = Object.entries(registry).sort(([, left], [, right]) => right.confirmedAt - left.confirmedAt).slice(0, 200);
			window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(Object.fromEntries(entries)));
		} catch {}
	}
	function markChatGptReferenceConfirmed(reference) {
		const fingerprint = referenceFingerprint(reference);
		if (!reference.base64 || !fingerprint) return;
		const registry = readChatGptReferenceRegistry();
		registry[fingerprint] = {
			fingerprint,
			filename: reference.filename || `${reference.assetId}.png`,
			conversationUrl: location.href,
			confirmedAt: Date.now()
		};
		writeChatGptReferenceRegistry(registry);
	}
	function registeredChatGptReference(reference) {
		if (!reference.base64) return void 0;
		return readChatGptReferenceRegistry()[referenceFingerprint(reference)];
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/text-wait-policy.ts
	function resolveTextWaitPolicy(task = "", promptLength = 0, maxWaitMs = 12e4) {
		const instantTasks = new Set([
			"connection_test",
			"quick_visual_analysis",
			"translation",
			"prompt_enhance",
			"story_foundation",
			"story_architecture",
			"screenplay_scene",
			"shot_breakdown"
		]);
		const mediumTasks = new Set(["production_graph_revision"]);
		const tier = instantTasks.has(task) ? "instant" : mediumTasks.has(task) ? "medium" : promptLength >= 16e3 ? "high" : "medium";
		const defaults = tier === "high" ? {
			hardWaitMs: 12e5,
			inactiveWaitMs: 48e4
		} : tier === "medium" ? {
			hardWaitMs: 6e5,
			inactiveWaitMs: 24e4
		} : {
			hardWaitMs: 12e4,
			inactiveWaitMs: 6e4
		};
		return {
			tier,
			hardWaitMs: Math.max(maxWaitMs, defaults.hardWaitMs),
			inactiveWaitMs: defaults.inactiveWaitMs
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/image-recovery.ts
	function finalizeImageRecovery$1(input) {
		const { jobId, candidates, providerError, turn, markerExists, isGenerating, reportStatus, reportResult, reportRecoveredImage } = input;
		if ([
			candidates.length === 0,
			providerError,
			turn,
			turn && !isGenerating(turn)
		].every(Boolean)) {
			reportResult(jobId, "failed_retryable", void 0, `${providerError}: ${(turn.innerText || "").slice(0, 400)}`);
			return;
		}
		if (candidates.length === 0) {
			if (turn && isGenerating(turn) || isGenerating()) {
				reportStatus(jobId, "generating", "Matching ChatGPT response found; waiting for the image to finish.");
				return;
			}
			reportStatus(jobId, "waiting_manual_action", markerExists ? "The matching response is open, but its generated image is not mounted yet. Keep this chat visible." : "The saved conversation is open, but its request marker is not mounted yet. Recovery will keep checking this exact URL.");
			return;
		}
		reportRecoveredImage(jobId, candidates[0]);
	}
	function recoveredImageAsset(jobId, candidate, conversationUrl) {
		return [{
			type: "image",
			filename: `chatgpt_${jobId}_recovered.png`,
			downloadPath: candidate.src,
			mimeType: "image/png",
			metadata: {
				altPrompt: candidate.alt.replace(/^Generated image:\s*/i, ""),
				fileId: candidate.fileId,
				conversationUrl,
				recovered: true
			}
		}];
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/reasoning-control.ts
	var REASONING_LABELS = {
		instant: ["Instant", "Tức thì"],
		medium: ["Medium", "Vừa"],
		high: ["High", "Cao"]
	};
	var targetValue = (tier) => tier === "instant" ? 0 : tier === "medium" ? 1 : 2;
	async function setSlider(slider, target, sleep) {
		let current = Number(slider.getAttribute("aria-valuenow"));
		slider.focus();
		while (Number.isFinite(current) && current !== target) {
			const key = current > target ? "ArrowLeft" : "ArrowRight";
			slider.dispatchEvent(new KeyboardEvent("keydown", {
				key,
				code: key,
				bubbles: true,
				cancelable: true
			}));
			slider.dispatchEvent(new KeyboardEvent("keyup", {
				key,
				code: key,
				bubbles: true,
				cancelable: true
			}));
			await sleep(120);
			const next = Number(slider.getAttribute("aria-valuenow"));
			if (!Number.isFinite(next) || next === current) break;
			current = next;
		}
		return Number(slider.getAttribute("aria-valuenow")) === target;
	}
	function menuItem(tier, normalizedUiLabel) {
		const labels = REASONING_LABELS[tier].map(normalizedUiLabel);
		return Array.from(document.querySelectorAll("[role=\"menuitemradio\"]")).find((item) => labels.includes(normalizedUiLabel(item.querySelector("span.truncate")?.innerText || item.innerText || "")));
	}
	async function selectReasoningTier(jobId, tier, deps) {
		const { normalizedUiLabel, simulateUiClick, visibleElement, sleep, reportStatus } = deps;
		const knownLabels = Object.values(REASONING_LABELS).flat().map(normalizedUiLabel);
		const control = Array.from(document.querySelectorAll("button[aria-haspopup=\"menu\"]")).find((button) => knownLabels.includes(normalizedUiLabel(button.innerText || "")));
		if (!control) {
			reportStatus(jobId, "opening_provider", `ChatGPT reasoning control was not available; keeping the provider setting and using ${tier} timeout policy.`);
			return false;
		}
		const labels = REASONING_LABELS[tier].map(normalizedUiLabel);
		if (labels.includes(normalizedUiLabel(control.innerText || ""))) return true;
		simulateUiClick(control);
		const startedAt = Date.now();
		while (Date.now() - startedAt < 5e3) {
			const slider = Array.from(document.querySelectorAll("[role=\"slider\"][aria-valuenow]")).find(visibleElement);
			if (slider) {
				const selected = await setSlider(slider, targetValue(tier), sleep);
				reportStatus(jobId, "opening_provider", selected ? `ChatGPT reasoning slider set to ${tier} for this job.` : `ChatGPT reasoning slider did not reach ${tier}; using the provider's visible setting.`);
				document.dispatchEvent(new KeyboardEvent("keydown", {
					key: "Escape",
					code: "Escape",
					bubbles: true,
					cancelable: true
				}));
				return selected;
			}
			const target = menuItem(tier, normalizedUiLabel);
			if (target) {
				simulateUiClick(target);
				await sleep(350);
				const selected = target.getAttribute("aria-checked") === "true" || labels.includes(normalizedUiLabel(control.innerText || ""));
				reportStatus(jobId, "opening_provider", selected ? `ChatGPT reasoning set to ${tier} for this job.` : `ChatGPT reasoning selection for ${tier} was not confirmed; continuing with the matching timeout policy.`);
				return selected;
			}
			await sleep(150);
		}
		reportStatus(jobId, "opening_provider", `ChatGPT reasoning menu did not expose ${tier}; continuing with the matching timeout policy.`);
		return false;
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/reference-library.ts
	async function openLibrary(deps) {
		let launcher = deps.findLauncher();
		if (!launcher) {
			const menuButton = Array.from(document.querySelectorAll("button")).find((element) => {
				const label = `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`.toLowerCase();
				return element.getBoundingClientRect().width > 0 && /attach|add files|thêm tệp|đính kèm|thêm tệp và nhiều nội dung khác/.test(label);
			});
			if (!menuButton) return false;
			deps.simulateClick(menuButton);
			await deps.sleep(450);
			launcher = deps.findLauncher();
		}
		if (!launcher) return false;
		deps.simulateClick(launcher);
		await deps.sleep(650);
		return true;
	}
	async function searchLibrary(deps, filename) {
		const searchInput = deps.visibleRoots().flatMap((root) => Array.from(root.querySelectorAll("input[type=\"search\"], input[placeholder*=\"search\" i], input[placeholder*=\"tìm\" i]"))).find((input) => !input.disabled);
		if (searchInput) {
			searchInput.focus();
			searchInput.value = filename;
			searchInput.dispatchEvent(new Event("input", {
				bubbles: true,
				composed: true
			}));
			searchInput.dispatchEvent(new Event("change", {
				bubbles: true,
				composed: true
			}));
			await deps.sleep(500);
		}
		return deps.findTile(filename);
	}
	function createReuseReference(deps) {
		return async function reuseReference(reference, jobId) {
			const registryEntry = deps.registeredReference(reference);
			const filename = reference.filename || registryEntry?.filename || `${reference.assetId}.png`;
			if (!registryEntry || registryEntry.filename !== filename) return false;
			if (deps.composerHasFilename(filename)) {
				deps.reportStatus(jobId, "submitting", `Reusing already attached ChatGPT reference ${filename}.`);
				return true;
			}
			if (!await openLibrary(deps)) {
				await deps.closePicker();
				return false;
			}
			const exactTile = await searchLibrary(deps, filename);
			if (!exactTile) {
				await deps.closePicker();
				return false;
			}
			const beforeCount = deps.attachmentCount([reference]);
			deps.simulateClick(exactTile);
			try {
				await deps.waitForUpload(jobId, [reference], beforeCount);
				deps.reportStatus(jobId, "submitting", `Reused verified ChatGPT library reference ${filename}.`);
				deps.confirmReference(reference);
				return true;
			} catch {
				await deps.closePicker();
				return false;
			}
		};
	}
	function createChatGptReferenceLibrary(deps) {
		return { reuseReference: createReuseReference(deps) };
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/visual-runtime.ts
	var extractBalancedJsonObject;
	var extractLatestCompleteStoryJson;
	var extractLatestCompleteStructuredJson;
	var findElement$1;
	var findElements$1;
	var hasCompleteStoryJson$1;
	var hasQuickVisualAnalysis$1;
	var normalizeAssistantText;
	var normalizeQuickVisualAnalysisText$1;
	var randomDelay$1;
	var reportResult$1;
	var reportStatus$1;
	var sleep$1;
	var visibleElement$1;
	var SELECTORS$1;
	var RetryableImageWaitError$1;
	function configureChatGptVisualRuntime(next) {
		extractBalancedJsonObject = next.extractBalancedJsonObject;
		extractLatestCompleteStoryJson = next.extractLatestCompleteStoryJson;
		extractLatestCompleteStructuredJson = next.extractLatestCompleteStructuredJson;
		findElement$1 = next.findElement;
		findElements$1 = next.findElements;
		hasCompleteStoryJson$1 = next.hasCompleteStoryJson;
		hasQuickVisualAnalysis$1 = next.hasQuickVisualAnalysis;
		normalizeAssistantText = next.normalizeAssistantText;
		normalizeQuickVisualAnalysisText$1 = next.normalizeQuickVisualAnalysisText;
		randomDelay$1 = next.randomDelay;
		reportResult$1 = next.reportResult;
		reportStatus$1 = next.reportStatus;
		sleep$1 = next.sleep;
		visibleElement$1 = next.visibleElement;
		SELECTORS$1 = next.SELECTORS;
		RetryableImageWaitError$1 = next.RetryableImageWaitError;
	}
	function getAssistantTurns() {
		const roleTurns = Array.from(document.querySelectorAll("[data-message-author-role=\"assistant\"]"));
		if (roleTurns.length > 0) return roleTurns;
		const direct = findElements$1(SELECTORS$1.resultContainer).filter((element, index, values) => values.indexOf(element) === index);
		if (direct.length > 0) return direct;
		return getConversationTurns().filter((turn) => {
			if (turn.getAttribute("data-message-author-role") === "assistant") return true;
			if (turn.querySelector("[data-message-author-role=\"assistant\"]")) return true;
			const buttons = (turn.innerText || "").toLowerCase();
			return buttons.includes("good response") || buttons.includes("bad response") || buttons.includes("copy");
		});
	}
	function getConversationTurns() {
		const outerTurns = Array.from(document.querySelectorAll("[data-testid^=\"conversation-turn-\"]"));
		if (outerTurns.length > 0) return outerTurns;
		return Array.from(document.querySelectorAll("[data-message-author-role]"));
	}
	function getReadableChatTextSources() {
		const selectors = [
			"[data-message-author-role=\"assistant\"]",
			"[data-testid^=\"conversation-turn-\"]",
			"article",
			"main .markdown",
			".markdown",
			"[class*=\"agent-turn\"]",
			"[class*=\"assistant\"]"
		];
		const sources = [];
		const seen = /* @__PURE__ */ new Set();
		const add = (text) => {
			const normalized = normalizeAssistantText(text || "");
			if (!normalized || seen.has(normalized)) return;
			seen.add(normalized);
			sources.push(normalized);
		};
		for (const turn of getAssistantTurns()) add(turn.innerText);
		for (const turn of getConversationTurns()) add(turn.innerText);
		for (const selector of selectors) for (const element of Array.from(document.querySelectorAll(selector))) add(element.innerText);
		add(document.body.innerText || "");
		return sources;
	}
	function getLatestCompleteStoryText() {
		for (const source of getReadableChatTextSources().slice().reverse()) {
			const json = extractLatestCompleteStoryJson(source);
			if (json) return json;
		}
		return "";
	}
	function getLatestAssistantText() {
		const storyJson = getLatestCompleteStoryText();
		if (storyJson) return storyJson;
		const assistantTexts = getAssistantTurns().map((turn) => normalizeAssistantText(turn.innerText || "")).filter(Boolean);
		const assistantStoryJson = assistantTexts.slice().reverse().find((text) => hasCompleteStoryJson$1(text));
		if (assistantStoryJson) return assistantStoryJson;
		const conversationTexts = getConversationTurns().map((turn) => normalizeAssistantText(turn.innerText || "")).filter(Boolean);
		const structuredResponse = conversationTexts.slice().reverse().find((text) => hasCompleteStoryJson$1(text));
		if (structuredResponse) return structuredResponse;
		const pageText = document.body.innerText || "";
		const pageStoryJson = extractLatestCompleteStoryJson(pageText);
		if (pageStoryJson) return pageStoryJson;
		const assistantText = assistantTexts.at(-1);
		if (assistantText) return assistantText;
		return conversationTexts.at(-1) || getReadableChatTextSources().at(-1) || "";
	}
	function getLatestAssistantOnlyText() {
		return getAssistantTurns().map((turn) => normalizeAssistantText(turn.innerText || "")).filter(Boolean).at(-1) || "";
	}
	function getLatestMountedAssistantText() {
		const latest = Array.from(document.querySelectorAll("[data-testid^=\"conversation-turn-\"] [data-message-author-role=\"assistant\"], .agent-turn [data-message-author-role=\"assistant\"], [data-message-author-role=\"assistant\"]")).at(-1);
		if (!latest) return "";
		const inner = normalizeAssistantText(latest.innerText || "");
		const content = normalizeAssistantText(latest.textContent || "");
		return content.length > inner.length ? content : inner;
	}
	function getLatestQuickVisualAnalysisText() {
		const quickVisualText = getAssistantTurns().map((turn) => normalizeQuickVisualAnalysisText$1(turn.innerText || "")).filter(Boolean).slice().reverse().find((text) => hasQuickVisualAnalysis$1(text));
		if (quickVisualText) return quickVisualText;
		return getConversationTurns().map((turn) => normalizeQuickVisualAnalysisText$1(turn.innerText || "")).filter(Boolean).slice().reverse().find((text) => hasQuickVisualAnalysis$1(text)) || extractLatestQuickVisualAnalysisFromPage() || normalizeQuickVisualAnalysisText$1(getLatestAssistantText());
	}
	function extractLatestQuickVisualAnalysisFromPage(jobId = "") {
		const pageText = document.body.innerText || "";
		const marker = jobId ? `studio_request_id: ${jobId}`.toLowerCase() : "studio_request_id:";
		const markerIndex = pageText.toLowerCase().lastIndexOf(marker);
		const source = markerIndex >= 0 ? pageText.slice(markerIndex) : pageText;
		const matches = Array.from(source.matchAll(/\b(SUBJECTS|STYLE|CHARACTER DIRECTION|BACKGROUND DIRECTION|RISKS)\s*[:：]/gi));
		for (let index = matches.length - 1; index >= 0; index--) {
			const match = matches[index];
			if (match.index === void 0) continue;
			const candidate = normalizeQuickVisualAnalysisText$1(source.slice(match.index));
			if (hasQuickVisualAnalysis$1(candidate)) return candidate;
		}
		return "";
	}
	function getImageFileId(src) {
		return (src.match(/[?&]id=(file_[a-z0-9]+)/i) || src.match(/(file_[a-z0-9]+)/i))?.[1] || src;
	}
	function generatedImageAlt(alt, largeResult) {
		const lower = alt.toLowerCase();
		return lower.startsWith("generated image") || lower.startsWith("image generated") || lower.startsWith("ảnh đã tạo") || lower.startsWith("hình ảnh đã tạo") || lower.startsWith("tạo ảnh") || lower === "image" || alt === "" || largeResult;
	}
	function chatGptAssetUrl(src) {
		return src.startsWith("blob:") || src.includes("/backend-api/") || src.includes("oaiusercontent.com") || src.includes("oaidalleapiprodscus.blob.core.windows.net") || src.includes("estuary") || src.includes("files");
	}
	function isGeneratedImage(image) {
		if (!image.src || image.src.startsWith("data:")) return false;
		if (image.classList.contains("blur-2xl")) return false;
		const alt = image.getAttribute("alt") || "";
		const lowerAlt = alt.toLowerCase();
		const src = image.src;
		const rect = image.getBoundingClientRect();
		const looksLikeLargeResult = rect.width >= 220 && rect.height >= 220;
		const looksLikeReference = lowerAlt.includes("uploaded image") || lowerAlt.includes("user uploaded");
		return chatGptAssetUrl(src) && generatedImageAlt(alt, looksLikeLargeResult) && !looksLikeReference;
	}
	function generatedImageSortWeight(image) {
		const alt = (image.getAttribute("alt") || "").toLowerCase();
		return alt.startsWith("generated image") || alt.startsWith("ảnh đã tạo") ? 0 : 1;
	}
	function imageCandidateAllowed(image, scope, baseline) {
		if (!isGeneratedImage(image)) return null;
		const fileId = getImageFileId(image.src);
		if (baseline?.imageFileIds.has(fileId)) return null;
		return {
			src: image.src,
			alt: image.getAttribute("alt") || "",
			fileId
		};
	}
	function getImageCandidates(scope = document, baseline) {
		const byFileId = /* @__PURE__ */ new Map();
		const images = findElements$1(SELECTORS$1.images, scope).sort((a, b) => generatedImageSortWeight(a) - generatedImageSortWeight(b) || b.getBoundingClientRect().top - a.getBoundingClientRect().top);
		for (const image of images) {
			const candidate = imageCandidateAllowed(image, scope, baseline);
			if (candidate && !byFileId.has(candidate.fileId)) byFileId.set(candidate.fileId, candidate);
		}
		return Array.from(byFileId.values());
	}
	function isGenerating(scope = document) {
		if (findElement$1(SELECTORS$1.stopButton)) return true;
		const selectors = scope === document ? SELECTORS$1.generatingIndicator.filter((selector) => selector.includes("aria-label")) : SELECTORS$1.generatingIndicator;
		return findElements$1(selectors, scope).length > 0;
	}
	async function waitForGenerationIdle(maxWaitMs) {
		const start = Date.now();
		while (Date.now() - start < maxWaitMs) {
			if (!isGenerating()) return;
			await sleep$1(1e3);
		}
	}
	function captureBaseline(options = {}) {
		const imageFileIds = /* @__PURE__ */ new Set();
		if (!options.ignoreImages) for (const candidate of getImageCandidates(document)) imageFileIds.add(candidate.fileId);
		return {
			assistantCount: getAssistantTurns().length,
			turnCount: getConversationTurns().length,
			latestAssistantText: normalizeAssistantText(getLatestAssistantText()),
			imageFileIds,
			url: location.href,
			capturedAt: Date.now()
		};
	}
	function getNewestAssistantTurn(baseline) {
		const turns = getAssistantTurns();
		if (turns.length > baseline.assistantCount) return turns[turns.length - 1];
		for (let index = turns.length - 1; index >= 0; index--) {
			const turn = turns[index];
			if (getImageCandidates(turn, baseline).length > 0 || isGenerating(turn)) return turn;
		}
		return turns[turns.length - 1];
	}
	function getAssistantTurnForJob(jobId) {
		const turns = getConversationTurns();
		const marker = `studio_request_id: ${jobId}`.toLowerCase();
		const markerIndex = findJobMarkerIndex(turns, marker);
		if (markerIndex < 0) return void 0;
		const assistantTurns = assistantTurnsAfterMarker(turns.slice(markerIndex + 1), marker);
		const selectedTurn = [...assistantTurns].reverse().find((turn) => normalizeAssistantText(turn.innerText || "").length > 20 && !isGenerating(turn)) ?? assistantTurns.at(-1);
		if (!selectedTurn) return void 0;
		return selectedTurn.matches("[data-message-author-role=\"assistant\"]") ? selectedTurn : selectedTurn.querySelector("[data-message-author-role=\"assistant\"]") ?? selectedTurn;
	}
	function findJobMarkerIndex(turns, marker) {
		return turns.findIndex((turn) => {
			return (turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role")) === "user" && (turn.innerText || "").toLowerCase().includes(marker);
		});
	}
	function assistantTurnsAfterMarker(turns, marker) {
		const explicit = turns.filter((turn) => {
			return (turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role")) === "assistant" || Boolean(turn.querySelector("[data-message-author-role=\"assistant\"]"));
		});
		if (explicit.length) return explicit;
		return turns.filter((turn) => {
			const role = turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
			const text = (turn.innerText || "").trim();
			return role !== "user" && text.length > 0 && !text.toLowerCase().includes(marker);
		});
	}
	function getCompleteStructuredTextForJob(jobId, task) {
		const turns = getConversationTurns();
		const marker = `studio_request_id: ${jobId}`.toLowerCase();
		const markerIndex = turns.findIndex((turn) => {
			return (turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role")) === "user" && (turn.innerText || "").toLowerCase().includes(marker);
		});
		if (markerIndex < 0) return "";
		for (let index = turns.length - 1; index > markerIndex; index--) {
			const turn = turns[index];
			if ((turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role")) !== "assistant" && !turn.querySelector("[data-message-author-role=\"assistant\"]")) continue;
			const normalized = normalizeAssistantText(turn.innerText || "");
			const json = task === "story_development" ? extractLatestCompleteStoryJson(normalized) : extractLatestCompleteStructuredJson(normalized, task);
			if (json) return json;
		}
		return "";
	}
	function isNewAssistantTextSinceBaseline(text, baseline) {
		const normalized = normalizeAssistantText(text);
		if (!normalized) return false;
		if (!baseline.latestAssistantText) return true;
		if (normalized === baseline.latestAssistantText) return false;
		return !baseline.latestAssistantText.includes(normalized) && !normalized.includes(baseline.latestAssistantText);
	}
	var PROVIDER_ERROR_CHECKS = [
		["RATE_LIMIT", [
			"usage cap",
			"too many requests",
			"rate limit",
			"message cap",
			"sending requests too quickly",
			"đã đạt giới hạn",
			"hết lượt",
			"quá nhiều yêu cầu",
			"bạn đang gửi yêu cầu quá nhanh",
			"tạm thời hạn chế quyền truy cập"
		]],
		["CONTENT_BLOCKED", [
			"content policy",
			"cannot help create",
			"không thể hỗ trợ",
			"vi phạm"
		]],
		["LOGIN_REQUIRED", [
			"log in",
			"sign in",
			"đăng nhập"
		]],
		["IMAGE_REFERENCE_REQUIRED", [
			"upload the reference image",
			"usable reference image",
			"vui lòng upload",
			"chỉ rõ hình ảnh tham chiếu",
			"please either upload",
			"interpreted as an edit",
			"hiểu nhầm yêu cầu là chỉnh sửa ảnh",
			"không tạo được ảnh",
			"không thể tạo ảnh",
			"không cần upload ảnh"
		]],
		["NETWORK", [
			"network error",
			"something went wrong",
			"đã xảy ra lỗi"
		]]
	];
	function isStructuredProviderPayload(rawText) {
		if (/^[{[]/.test(rawText)) return true;
		const candidate = extractBalancedJsonObject(rawText);
		if (!candidate) return false;
		try {
			const parsed = JSON.parse(candidate);
			return Boolean(parsed && typeof parsed === "object" && (parsed.logline && parsed.story || parsed.sourceAnalysis || Array.isArray(parsed.shots) && parsed.shots.length > 0));
		} catch {
			return false;
		}
	}
	function firstProviderError(text) {
		return PROVIDER_ERROR_CHECKS.find(([, patterns]) => patterns.some((pattern) => text.includes(pattern)))?.[0] || null;
	}
	function detectProviderError(scope) {
		const rawText = (scope.innerText || "").trim();
		if (isStructuredProviderPayload(rawText)) return null;
		return firstProviderError(rawText.toLowerCase());
	}
	function conversationPath(value) {
		try {
			return new URL(value).pathname.replace(/\/+$/, "");
		} catch {
			return "";
		}
	}
	function isLoginPage() {
		const path = location.pathname.toLowerCase();
		const text = (document.body.innerText || "").toLowerCase();
		return path.includes("/auth/") || !findElement$1(SELECTORS$1.promptInput) && [
			"log in",
			"sign in",
			"đăng nhập"
		].some((value) => text.includes(value));
	}
	async function waitForImageResults(jobId, baseline, maxWaitMs = 18e4) {
		const startTime = Date.now();
		const state = {
			lastProgressAt: 0,
			generationSeen: false,
			lastGeneratingAt: startTime,
			stableCandidateKey: "",
			stableCandidateSeenAt: 0,
			lastCandidateChangeAt: startTime,
			providerRetryAttempts: 0
		};
		while (Date.now() - startTime < maxWaitMs) {
			await sleep$1(1e3);
			if (await pollImageResult(jobId, baseline, state, startTime, maxWaitMs)) return;
		}
		throw new RetryableImageWaitError$1("Timeout waiting for ChatGPT image response");
	}
	function visibleChatGptRetryButton() {
		return Array.from(document.querySelectorAll("button")).find((element) => {
			const label = `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`.trim().toLowerCase();
			return visibleElement$1(element) && /try again|retry|thử lại/.test(label);
		});
	}
	async function retryTransientImageError(jobId, state, candidates, error) {
		const retryButton = visibleChatGptRetryButton();
		if (candidates.length || error !== "NETWORK" || !retryButton || state.providerRetryAttempts >= 2) return false;
		state.providerRetryAttempts++;
		reportStatus$1(jobId, "generating", `ChatGPT returned a temporary generation error. Retrying the same request (${state.providerRetryAttempts}/2)...`);
		retryButton.click();
		state.generationSeen = false;
		state.lastGeneratingAt = Date.now();
		await sleep$1(2500);
		return true;
	}
	function assertImageProviderHealthy(candidates, error, generating, latestTurn) {
		if (candidates.length || !error || generating && error !== "IMAGE_REFERENCE_REQUIRED") return;
		throw new RetryableImageWaitError$1(`${error}: ${((latestTurn || document.body).innerText || "").slice(0, 400)}`);
	}
	function assertImageWaitNotStalled(state, generating) {
		if (state.generationSeen && !generating && Date.now() - state.lastGeneratingAt > 9e4) throw new RetryableImageWaitError$1("ChatGPT generation stopped but no new image appeared.");
		if (state.stableCandidateKey && generating && Date.now() - state.lastCandidateChangeAt > 45e3) throw new RetryableImageWaitError$1("ChatGPT image result appeared but never became idle for capture.");
	}
	function reportImageWaitProgress(jobId, state, startTime, maxWaitMs) {
		if (Date.now() - state.lastProgressAt <= 3e3) return;
		const progress = Math.min((Date.now() - startTime) / maxWaitMs, .95);
		reportStatus$1(jobId, "generating", `Waiting for new ChatGPT image result... ${Math.round(progress * 100)}%`, progress);
		state.lastProgressAt = Date.now();
	}
	async function pollImageResult(jobId, baseline, state, startTime, maxWaitMs) {
		const latestTurn = getNewestAssistantTurn(baseline);
		const generating = isGenerating();
		const scopedCandidates = latestTurn ? getImageCandidates(latestTurn, baseline) : [];
		const candidates = scopedCandidates.length ? scopedCandidates : getImageCandidates(document, baseline);
		const error = latestTurn ? detectProviderError(latestTurn) : detectProviderError(document.body);
		if (await retryTransientImageError(jobId, state, candidates, error)) return false;
		assertImageProviderHealthy(candidates, error, generating, latestTurn ?? null);
		updateImageWaitState(state, candidates, generating);
		if (await reportStableImageCandidates(jobId, candidates, generating, state)) return true;
		assertImageWaitNotStalled(state, generating);
		reportImageWaitProgress(jobId, state, startTime, maxWaitMs);
		return false;
	}
	function updateImageWaitState(state, candidates, generating) {
		if (generating) {
			state.generationSeen = true;
			state.lastGeneratingAt = Date.now();
		}
		const key = candidates.map((candidate) => candidate.fileId).join("|");
		if (!key || key === state.stableCandidateKey) return;
		state.stableCandidateKey = key;
		state.stableCandidateSeenAt = Date.now();
		state.lastCandidateChangeAt = Date.now();
	}
	async function reportStableImageCandidates(jobId, candidates, generating, state) {
		const stableMs = state.stableCandidateKey ? Date.now() - state.stableCandidateSeenAt : 0;
		if (candidates.length === 0 || generating && stableMs <= 12e3) return false;
		reportStatus$1(jobId, "downloading", "Found new ChatGPT image result; sending result to extension...");
		await randomDelay$1(900, 1600);
		const assets = await Promise.all(candidates.map(async (candidate, index) => {
			const mounted = await mountedImageDataUrl(candidate.src);
			return {
				type: "image",
				filename: `chatgpt_${jobId}_${index}.png`,
				filePath: mounted || void 0,
				downloadPath: candidate.src,
				mimeType: "image/png",
				metadata: {
					altPrompt: candidate.alt.replace(/^Generated image:\s*/i, ""),
					fileId: candidate.fileId,
					conversationUrl: location.href
				}
			};
		}));
		await reportResult$1(jobId, "done", assets);
		return true;
	}
	async function mountedImageDataUrl(src) {
		const image = Array.from(document.images).find((candidate) => candidate.src === src);
		if (image?.complete && image.naturalWidth > 0) try {
			const canvas = document.createElement("canvas");
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			canvas.getContext("2d")?.drawImage(image, 0, 0);
			const dataUrl = canvas.toDataURL("image/png");
			if (dataUrl.startsWith("data:image/")) return dataUrl;
		} catch {}
		try {
			const response = await fetch(src, { credentials: "include" });
			if (!response.ok) return void 0;
			const blob = await response.blob();
			return await new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(typeof reader.result === "string" && reader.result.startsWith("data:image/") ? reader.result : void 0);
				reader.onerror = () => resolve(void 0);
				reader.readAsDataURL(blob);
			});
		} catch {
			return;
		}
	}
	//#endregion
	//#region ../../packages/extension-providers/src/chatgpt/content.ts
	console.log("[Studio] ChatGPT adapter loaded");
	var ADAPTER_VERSION = "chatgpt-result-baseline-v12+verified-reference-upload-v25+asset-library-reuse+structured-json-tail-recovery-v23+mounted-assistant-v24";
	function hasReferenceMedia(reference) {
		return Boolean(reference.base64 || reference.filePath);
	}
	function normalizedUiLabel(value) {
		return value.replace(/\s+/g, " ").trim().toLowerCase();
	}
	function simulateUiClick(element) {
		const target = element;
		target.scrollIntoView({
			block: "center",
			inline: "center"
		});
		const rect = target.getBoundingClientRect();
		const clientX = rect.left + rect.width / 2;
		const clientY = rect.top + rect.height / 2;
		target.dispatchEvent(new PointerEvent("pointerdown", {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: 1,
			clientX,
			clientY,
			pointerType: "mouse"
		}));
		target.dispatchEvent(new MouseEvent("mousedown", {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: 1,
			clientX,
			clientY
		}));
		target.dispatchEvent(new PointerEvent("pointerup", {
			bubbles: true,
			cancelable: true,
			button: 0,
			clientX,
			clientY,
			pointerType: "mouse"
		}));
		target.dispatchEvent(new MouseEvent("mouseup", {
			bubbles: true,
			cancelable: true,
			button: 0,
			clientX,
			clientY
		}));
		target.dispatchEvent(new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			button: 0,
			clientX,
			clientY
		}));
	}
	var selectChatGptReasoningTier = (jobId, tier) => selectReasoningTier(jobId, tier, {
		normalizedUiLabel,
		simulateUiClick,
		visibleElement: (element) => Boolean(visibleElement(element)),
		sleep,
		reportStatus: (jobId, status, message) => reportStatus(jobId, status, message)
	});
	var { reuseReference: tryReuseReferenceFromChatGptLibrary } = createChatGptReferenceLibrary({
		findLauncher: () => findChatGptLibraryPickerLauncher() ?? null,
		findTile: (filename) => findChatGptLibraryTile(filename) ?? null,
		visibleRoots: () => visibleMenuOrDialogRoots(),
		closePicker: closeChatGptPicker,
		composerHasFilename: (filename) => composerContainsReferenceFilename(filename),
		attachmentCount: () => composerVisualReferenceCount(),
		waitForUpload: (jobId, references, beforeCount) => waitForReferenceUpload(jobId, references, beforeCount),
		registeredReference: (reference) => registeredChatGptReference(reference),
		confirmReference: (reference) => markChatGptReferenceConfirmed(reference),
		simulateClick: simulateUiClick,
		sleep,
		reportStatus: (jobId, status, message) => reportStatus(jobId, status, message)
	});
	var RetryableImageWaitError = class extends Error {
		constructor(message) {
			super(message);
			this.name = "RetryableImageWaitError";
		}
	};
	var SELECTORS = {
		promptInput: [
			"#prompt-textarea",
			"div[contenteditable=\"true\"].ProseMirror",
			"div[contenteditable=\"true\"]",
			"textarea[placeholder*=\"Message\"]"
		],
		submitButton: [
			"[data-testid=\"send-button\"]",
			"button[aria-label=\"Send message\"]",
			"button[aria-label*=\"Send\" i]",
			"button[type=\"submit\"]"
		],
		resultContainer: [
			"div[data-message-author-role=\"assistant\"]",
			"[data-testid^=\"conversation-turn-\"] [data-message-author-role=\"assistant\"]",
			"[data-testid^=\"conversation-turn-\"]:has([data-message-author-role=\"assistant\"])",
			".agent-turn"
		],
		conversationTurn: ["[data-testid^=\"conversation-turn-\"]", "[data-message-author-role]"],
		images: [
			"img[alt^=\"Generated image\"]",
			"img[src^=\"blob:\"]",
			"img[src*=\"/backend-api/\"]",
			"img[src*=\"oaiusercontent.com\"]",
			"img[src*=\"oaidalleapiprodscus.blob.core.windows.net\"]",
			"img[src*=\"estuary\"]",
			"img[src*=\"files\"]"
		],
		stopButton: [
			"button[aria-label=\"Stop generating\"]",
			"[data-testid=\"stop-button\"]",
			"button[aria-label*=\"Stop\"]"
		],
		generatingIndicator: [
			"[aria-label*=\"Generating\"]",
			"[aria-label*=\"Đang tạo\"]",
			"[class*=\"animate-pulse\"]",
			"[class*=\"skeleton\"]",
			"[class*=\"shimmer\"]"
		],
		newChat: [
			"button[data-testid=\"create-new-chat-button\"]",
			"[aria-label=\"Đoạn chat mới\"]",
			"a[aria-label=\"New chat\"]",
			"button[aria-label=\"New chat\"]",
			"a[href=\"/\"]",
			"a[href=\"/?model=auto\"]"
		],
		fileInput: [
			"#upload-files",
			"#upload-photos",
			"[data-testid=\"upload-photos-input\"]",
			"input[type=\"file\"][accept*=\"image\"]",
			"input[type=\"file\"]"
		]
	};
	function findElement(selectors, scope = document) {
		for (const selector of selectors) try {
			const element = scope.querySelector(selector);
			if (element) return element;
		} catch {}
		return null;
	}
	function findElements(selectors, scope = document) {
		const elements = [];
		const seen = /* @__PURE__ */ new Set();
		for (const selector of selectors) try {
			for (const element of Array.from(scope.querySelectorAll(selector))) if (!seen.has(element)) {
				seen.add(element);
				elements.push(element);
			}
		} catch {}
		return elements;
	}
	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	async function randomDelay(min, max) {
		await sleep(Math.floor(Math.random() * (max - min + 1)) + min);
	}
	async function typeText(element, text) {
		const isContentEditable = element.getAttribute("contenteditable") === "true";
		element.focus();
		element.dispatchEvent(new Event("focus", { bubbles: true }));
		if (isContentEditable) {
			document.getSelection()?.selectAllChildren(element);
			document.execCommand("delete");
			document.execCommand("insertText", false, text);
			if (!composerText(element).includes(text.slice(0, Math.min(80, text.length)))) element.textContent = text;
			element.dispatchEvent(new InputEvent("input", {
				bubbles: true,
				inputType: "insertText",
				data: text
			}));
		} else {
			const textarea = element;
			(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set)?.call(textarea, text);
			textarea.dispatchEvent(new InputEvent("input", {
				bubbles: true,
				inputType: "insertText",
				data: text
			}));
		}
		element.dispatchEvent(new Event("change", { bubbles: true }));
	}
	function composerText(element) {
		if (!element) return "";
		if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value;
		return (element.textContent || "").trim();
	}
	function requestExists(jobId) {
		const marker = `studio_request_id: ${jobId}`.toLowerCase();
		return getConversationTurns().some((turn) => {
			return (turn.getAttribute("data-message-author-role") || turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role")) === "user" && (turn.innerText || "").toLowerCase().includes(marker);
		});
	}
	async function triggerPromptSubmission() {
		const readyStartedAt = Date.now();
		while (Date.now() - readyStartedAt < 3e4) {
			const button = findElement(SELECTORS.submitButton);
			if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
				button.click();
				return;
			}
			await sleep(400);
		}
		const input = findElement(SELECTORS.promptInput);
		input?.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Enter",
			code: "Enter",
			keyCode: 13,
			which: 13,
			bubbles: true,
			cancelable: true
		}));
		input?.dispatchEvent(new KeyboardEvent("keyup", {
			key: "Enter",
			code: "Enter",
			keyCode: 13,
			which: 13,
			bubbles: true,
			cancelable: true
		}));
	}
	async function verifyPromptSubmission(jobId, marker, requireVisibleMarker, initialTurnCount) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < 8e3) {
			if (requireVisibleMarker && requestExists(jobId)) return true;
			const input = findElement(SELECTORS.promptInput);
			if (!requireVisibleMarker && (getConversationTurns().length > initialTurnCount || composerText(input).length === 0 && (isGenerating() || getAssistantTurns().length > 0))) return true;
			if (requireVisibleMarker && !composerText(input).includes(marker) && isGenerating()) return true;
			await sleep(350);
		}
		return false;
	}
	async function submitPromptAttempt(jobId, fullPrompt, marker, requireVisibleMarker, initialTurnCount, attempt, recoverComposer) {
		if (requireVisibleMarker && requestExists(jobId)) return true;
		const input = findElement(SELECTORS.promptInput);
		if (!input) {
			if (recoverComposer && attempt === 1) {
				reportStatus(jobId, "submitting", "ChatGPT composer is still mounting; opening a fresh conversation automatically...");
				try {
					await openNewConversation(jobId);
				} catch {
					if (!/^https:\/\/chatgpt\.com\/?(?:\?.*)?$/i.test(location.href)) location.href = "https://chatgpt.com/";
				}
				await sleep(2500);
			} else {
				reportStatus(jobId, "waiting_manual_action", "ChatGPT composer is unavailable. Sign in or reopen the saved chat.");
				await sleep(1500);
			}
			return false;
		}
		const expected = requireVisibleMarker ? marker : fullPrompt.slice(0, Math.min(80, fullPrompt.length));
		if (!composerText(input).includes(expected)) {
			reportStatus(jobId, "submitting", attempt === 1 ? "Preparing ChatGPT request..." : `Restoring interrupted request (${attempt}/3)...`);
			await typeText(input, fullPrompt);
		}
		await triggerPromptSubmission();
		return verifyPromptSubmission(jobId, marker, requireVisibleMarker, initialTurnCount);
	}
	async function submitPrompt(jobId, fullPrompt, options = {}) {
		const marker = `STUDIO_REQUEST_ID: ${jobId}`;
		const requireVisibleMarker = options.visibleMarker ?? true;
		const initialTurnCount = getConversationTurns().length;
		for (let attempt = 1; attempt <= 3; attempt++) if (await submitPromptAttempt(jobId, fullPrompt, marker, requireVisibleMarker, initialTurnCount, attempt, Boolean(options.recoverComposer))) return true;
		return false;
	}
	async function executeJob(payload) {
		const { jobId, prompt, task, settings } = payload;
		try {
			reportStatus(jobId, "submitting", "ChatGPT adapter received the job.");
			await randomDelay(600, 1200);
			if (settings?.newConversation) await openNewConversation(jobId);
			const requestMarker = `STUDIO_REQUEST_ID: ${jobId}`;
			const isImageTask = task === "image" || task === "text_to_image";
			if (!isImageTask) await selectChatGptReasoningTier(jobId, resolveTextWaitPolicy(task, prompt.length).tier);
			const fullPrompt = isImageTask ? prompt : `${requestMarker}\n${prompt}`;
			if (isImageTask) await executeImageJobWithRecovery(payload, fullPrompt);
			else {
				reportStatus(jobId, "opening_provider", "Waiting for previous ChatGPT generation to finish...");
				await waitForGenerationIdle(12e4);
				if (payload.references?.some(hasReferenceMedia)) {
					reportStatus(jobId, "submitting", `Uploading ${payload.references.filter(hasReferenceMedia).length} visual reference(s)...`);
					await uploadReferences(payload.references, jobId);
				}
				const baseline = captureBaseline();
				if (!await submitPrompt(jobId, fullPrompt, {
					visibleMarker: true,
					recoverComposer: Boolean(settings?.newConversation || settings?.freshConversationNavigated)
				})) {
					reportResult(jobId, "failed_retryable", void 0, "PROMPT_NOT_SUBMITTED: ChatGPT kept the request in the composer after three verified attempts.");
					return;
				}
				reportStatus(jobId, "generating", "Waiting for ChatGPT text response...");
				await waitForTextResult(jobId, baseline, {
					task,
					promptLength: prompt.length
				});
			}
		} catch (error) {
			reportResult(jobId, "failed_retryable", void 0, `ChatGPT error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	async function executeImageJobWithRecovery(payload, fullPrompt) {
		const maxAttempts = 3;
		let lastError = "";
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			if (attempt > 1) {
				reportStatus(payload.jobId, "opening_provider", `Retrying ChatGPT image request in a fresh chat (${attempt}/${maxAttempts})...`, .05);
				await openNewConversation(payload.jobId);
				await sleep(1500);
			}
			try {
				reportStatus(payload.jobId, "opening_provider", attempt === 1 ? "Waiting for previous ChatGPT generation to finish..." : "Preparing recovered ChatGPT image request...");
				await waitForGenerationIdle(6e4);
				const baseline = captureBaseline({ ignoreImages: Boolean(payload.settings?.newConversation || payload.settings?.freshConversationNavigated) });
				if (payload.references?.some(hasReferenceMedia)) {
					reportStatus(payload.jobId, "submitting", `Uploading ${payload.references.filter(hasReferenceMedia).length} visual reference(s)...`);
					await uploadReferences(payload.references, payload.jobId);
				}
				if (!await submitPrompt(payload.jobId, fullPrompt, {
					visibleMarker: false,
					recoverComposer: Boolean(payload.settings?.newConversation || payload.settings?.freshConversationNavigated)
				})) throw new Error("PROMPT_NOT_SUBMITTED: ChatGPT kept the image request in the composer after three verified attempts.");
				reportStatus(payload.jobId, "generating", `Waiting for ChatGPT image result (${attempt}/${maxAttempts})...`);
				await waitForImageResults(payload.jobId, baseline);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
				reportStatus(payload.jobId, "generating", `${lastError} Retrying if attempts remain...`, Math.min(attempt / maxAttempts, .9));
			}
		}
		reportResult(payload.jobId, "failed_retryable", void 0, `ChatGPT image generation failed after ${maxAttempts} attempts. ${lastError}`);
	}
	function visibleElement(element) {
		const rect = element.getBoundingClientRect();
		const style = window.getComputedStyle(element);
		return rect.width > 8 && rect.height > 8 && style.visibility !== "hidden" && style.display !== "none";
	}
	function composerRoot() {
		const input = findElement(SELECTORS.promptInput);
		return input?.closest("form") || input?.closest("[data-testid*=\"composer\" i]") || input?.parentElement?.parentElement || document.body;
	}
	function composerVisualReferenceCount() {
		return composerImageCount(composerRoot());
	}
	function composerImageCount(root) {
		return Array.from(root.querySelectorAll("img")).filter((image) => {
			if (!visibleElement(image)) return false;
			const rect = image.getBoundingClientRect();
			if (rect.width < 32 || rect.height < 32) return false;
			const src = image.getAttribute("src") || "";
			const alt = (image.getAttribute("alt") || "").toLowerCase();
			return [
				"blob:",
				"data:image/",
				"/backend-api/",
				"oaiusercontent.com"
			].some((prefix) => src.includes(prefix)) || alt.includes("uploaded") || alt.includes("image");
		}).length;
	}
	async function waitForReferenceUpload(jobId, references, beforeCount) {
		const expectedCount = references.filter(hasReferenceMedia).length;
		if (expectedCount === 0) return;
		const start = Date.now();
		while (Date.now() - start < 2e4) {
			if (composerVisualReferenceCount() >= beforeCount + expectedCount) {
				reportStatus(jobId, "submitting", `Confirmed ${expectedCount} visual reference upload(s).`, void 0, references.filter(hasReferenceMedia).map((reference) => reference.assetId));
				await sleep(1200);
				return;
			}
			reportStatus(jobId, "submitting", "Waiting for ChatGPT to show uploaded visual reference...");
			await sleep(600);
		}
		throw new Error("REFERENCE_UPLOAD_NOT_CONFIRMED: ChatGPT did not show the uploaded image in the composer. Reload ChatGPT/extension and retry before submitting.");
	}
	async function dismissDuplicateReferenceDialog() {
		const duplicateText = /(?:you(?:'|’)ve uploaded this file before|already uploaded this file|bạn đã tải lên tệp này từ trước)/i;
		const dialog = visibleMenuOrDialogRoots().find((root) => duplicateText.test(root.innerText || ""));
		if (!dialog) return false;
		const confirm = Array.from(dialog.querySelectorAll("button, [role=\"button\"]")).find((element) => visibleElement(element) && /^(?:ok|đồng ý|đóng)$/i.test((element.innerText || element.getAttribute("aria-label") || "").trim()));
		if (confirm) simulateUiClick(confirm);
		else await closeChatGptPicker();
		await sleep(300);
		return true;
	}
	function composerContainsReferenceFilename(filename) {
		const normalized = normalizedUiLabel(filename);
		if (!normalized) return false;
		const root = composerRoot();
		return Array.from(root.querySelectorAll("[aria-label], [title], [data-testid], img")).some((element) => normalizedUiLabel([
			element.getAttribute("aria-label"),
			element.getAttribute("title"),
			element.getAttribute("alt"),
			element.innerText
		].filter(Boolean).join(" ")).includes(normalized));
	}
	function visibleMenuOrDialogRoots() {
		return Array.from(document.querySelectorAll("[role=\"menu\"], [role=\"dialog\"], [data-state=\"open\"]")).filter(visibleElement);
	}
	async function closeChatGptPicker() {
		document.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			code: "Escape",
			bubbles: true,
			cancelable: true
		}));
		document.dispatchEvent(new KeyboardEvent("keyup", {
			key: "Escape",
			code: "Escape",
			bubbles: true,
			cancelable: true
		}));
		await sleep(250);
	}
	function findChatGptLibraryPickerLauncher() {
		return visibleMenuOrDialogRoots().flatMap((root) => Array.from(root.querySelectorAll("button, [role=\"menuitem\"], a"))).find((element) => {
			const label = (element.innerText || element.getAttribute("aria-label") || "").trim();
			const href = element instanceof HTMLAnchorElement ? element.href : "";
			return !/\/library(?:[/?#]|$)/i.test(href) && /^(?:library|thư viện|add from library|chọn từ thư viện|photos|ảnh)$/i.test(label);
		});
	}
	function findChatGptLibraryTile(filename) {
		const normalizedFilename = normalizedUiLabel(filename);
		return visibleMenuOrDialogRoots().flatMap((root) => Array.from(root.querySelectorAll("button, [role=\"option\"], [data-testid*=\"asset\" i], [data-testid*=\"image\" i]"))).find((element) => normalizedUiLabel([
			element.getAttribute("aria-label"),
			element.getAttribute("title"),
			element.querySelector("img")?.getAttribute("alt"),
			element.innerText
		].filter(Boolean).join(" ")).includes(normalizedFilename));
	}
	async function uploadReferencesNatively(references, jobId) {
		for (const reference of references) {
			if (await tryReuseReferenceFromChatGptLibrary(reference, jobId)) continue;
			const beforeCount = composerVisualReferenceCount();
			if (!(await chrome.runtime.sendMessage({
				source: "content-script",
				action: "NATIVE_CHATGPT_UPLOAD_REFERENCES",
				jobId,
				assetId: reference.assetId
			}).catch(() => void 0))?.ok) return false;
			try {
				await waitForReferenceUpload(jobId, [reference], beforeCount);
			} catch (error) {
				if (!await dismissDuplicateReferenceDialog()) throw error;
				if (!await tryReuseReferenceFromChatGptLibrary(reference, jobId)) throw new Error(`CHATGPT_DUPLICATE_REFERENCE_NOT_REUSABLE: ${reference.filename || reference.assetId} already exists in ChatGPT but could not be attached from Library. The adapter stopped without uploading another copy.`);
				continue;
			}
			markChatGptReferenceConfirmed(reference);
		}
		return true;
	}
	function referenceFile(reference) {
		if (!reference.base64) return null;
		const normalizedBase64 = reference.base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
		const binary = atob(normalizedBase64);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
		return new File([bytes], reference.filename || `${reference.assetId}.png`, { type: reference.mimeType || "image/png" });
	}
	async function uploadReferencesThroughInput(references, jobId) {
		const input = SELECTORS.fileInput.flatMap((selector) => Array.from(document.querySelectorAll(selector))).find((candidate) => !candidate.disabled) || null;
		if (!input) throw new Error("Cannot find ChatGPT image upload input.");
		const seen = /* @__PURE__ */ new Set();
		for (const reference of references) {
			const file = referenceFile(reference);
			if (!file || seen.has(referenceFingerprint(reference))) continue;
			seen.add(referenceFingerprint(reference));
			const beforeCount = composerVisualReferenceCount();
			const transfer = new DataTransfer();
			transfer.items.add(file);
			input.files = transfer.files;
			input.dispatchEvent(new Event("input", {
				bubbles: true,
				composed: true
			}));
			input.dispatchEvent(new Event("change", {
				bubbles: true,
				composed: true
			}));
			await waitForReferenceUpload(jobId, [reference], beforeCount);
			markChatGptReferenceConfirmed(reference);
		}
		if (seen.size === 0) throw new Error("No image reference data was available to upload.");
	}
	async function uploadReferences(references, jobId) {
		const expectedReferences = references.filter(hasReferenceMedia);
		const initialVisualCount = composerVisualReferenceCount();
		const attachmentMenuButton = Array.from(document.querySelectorAll("button")).find((element) => {
			const label = `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`.toLowerCase();
			return visibleElement(element) && /attach|add files|thêm tệp|đính kèm/.test(label);
		});
		if (attachmentMenuButton) {
			simulateUiClick(attachmentMenuButton);
			await sleep(400);
		}
		if (!await uploadReferencesNatively(references, jobId)) await uploadReferencesThroughInput(references, jobId);
		const finalVisualCount = composerVisualReferenceCount();
		if (finalVisualCount < initialVisualCount + expectedReferences.length) throw new Error(`REFERENCE_SET_INCOMPLETE: Expected ${expectedReferences.length} new image preview(s) in the active ChatGPT composer, but confirmed ${Math.max(0, finalVisualCount - initialVisualCount)}. Prompt submission was blocked.`);
	}
	function findNewConversationTarget() {
		return findElement(SELECTORS.newChat) || Array.from(document.querySelectorAll("a, button")).find((element) => {
			const text = (element.textContent || "").trim().toLowerCase();
			return text.includes("new chat") || text.includes("đoạn chat mới");
		}) || null;
	}
	function isBlankRootConversation(url, turnCount) {
		return turnCount === 0 && /^https:\/\/chatgpt\.com\/?(?:\?.*)?$/i.test(url) && Boolean(findElement(SELECTORS.promptInput));
	}
	function newConversationReady(beforeUrl, beforeTurnCount) {
		const conversationCleared = beforeTurnCount > 0 && getConversationTurns().length === 0;
		return Boolean(findElement(SELECTORS.promptInput) && (location.href !== beforeUrl || conversationCleared || beforeTurnCount === 0));
	}
	async function openNewConversation(jobId) {
		const beforeUrl = location.href;
		const beforeTurnCount = getConversationTurns().length;
		if (isBlankRootConversation(beforeUrl, beforeTurnCount)) return;
		const target = findNewConversationTarget();
		if (!target) throw new Error("NEW_CONVERSATION_NOT_CONFIRMED: ChatGPT did not expose the New Chat control. Refusing to write this project into the currently open conversation.");
		target.click();
		const start = Date.now();
		while (Date.now() - start < 15e3) {
			await sleep(500);
			if (newConversationReady(beforeUrl, beforeTurnCount)) return;
		}
		throw new Error("NEW_CONVERSATION_NOT_CONFIRMED: ChatGPT did not switch away from the previous conversation within 15 seconds.");
	}
	configureChatGptVisualRuntime({
		extractBalancedJsonObject: extractBalancedJsonObject$1,
		extractLatestCompleteStoryJson: extractLatestCompleteStoryJson$1,
		extractLatestCompleteStructuredJson: extractLatestCompleteStructuredJson$1,
		findElement,
		findElements,
		hasCompleteStoryJson,
		hasQuickVisualAnalysis,
		normalizeAssistantText: normalizeAssistantText$1,
		normalizeQuickVisualAnalysisText,
		randomDelay,
		reportResult,
		reportStatus,
		sleep,
		visibleElement,
		SELECTORS,
		RetryableImageWaitError
	});
	function hasCompleteStoryJson(text) {
		return isCompleteStoryJsonCandidate(extractLatestCompleteStoryJson$1(text) || extractBalancedJsonObject$1(text));
	}
	function hasQuickVisualAnalysis(text) {
		const normalized = normalizeQuickVisualAnalysisText(text);
		if (normalized.length < 140) return false;
		if (/^(thought for|thinking|đã suy nghĩ|đang suy nghĩ|suy nghĩ|risks?\s*:)/i.test(normalized)) return false;
		const lower = normalized.toLowerCase();
		if ([
			"i don't see an attached image",
			"i do not see an attached image",
			"don't see the attached image",
			"do not see the attached image",
			"there is no attached image",
			"without the image",
			"missing image",
			"please re-upload",
			"cannot assess",
			"can't reliably identify",
			"không thấy ảnh",
			"không có ảnh",
			"thiếu ảnh"
		].some((value) => lower.includes(value))) return false;
		if ([
			"local fallback",
			"provider visual analysis was unavailable",
			"general note from user text only",
			"without the uploaded image",
			"without the image"
		].some((value) => lower.includes(value))) return false;
		const hasRequiredSections = [
			[
				"subjects:",
				"subject:",
				"chủ thể:",
				"nhân vật:"
			],
			["style:", "phong cách:"],
			["character direction:", "định hướng nhân vật:"],
			[
				"background direction:",
				"định hướng bối cảnh:",
				"bối cảnh:"
			]
		].every((group) => group.some((value) => lower.includes(value)));
		const hasUsefulStructure = normalized.split("\n").length >= 3 || /[:：-]/.test(normalized);
		return hasRequiredSections && hasUsefulStructure;
	}
	function normalizeQuickVisualAnalysisText(text) {
		const normalized = normalizeAssistantText$1(text);
		const matches = Array.from(normalized.matchAll(/\b(SUBJECTS|STYLE|CHARACTER DIRECTION|BACKGROUND DIRECTION|RISKS)\s*[:：]/gi));
		if (matches.length === 0) return normalized;
		const firstContentHeading = matches.find((match) => {
			const afterHeading = normalized.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 180);
			return !/^\s*(visible subject|rendering style|what the future|whether the background|ambiguity|subject\(s\))/i.test(afterHeading);
		}) ?? matches[matches.length - 1];
		if (firstContentHeading.index === void 0) return normalized;
		return normalized.slice(firstContentHeading.index).trim();
	}
	function waitTextFallback(jobId, options, structuredTask) {
		return normalizeAssistantText$1(options.task === "quick_visual_analysis" ? extractLatestQuickVisualAnalysisFromPage(jobId) || getLatestQuickVisualAnalysisText() : structuredTask ? getLatestAssistantOnlyText() : "");
	}
	function chooseWaitText(primaryText, fallbackText, mountedText, scopedStoryText, options, structuredTask) {
		if (structuredTask && scopedStoryText) return scopedStoryText;
		if (structuredTask && mountedText.length > Math.max(primaryText.length, fallbackText.length)) return mountedText;
		if (structuredTask && fallbackText.length > primaryText.length) return fallbackText;
		if (options.task === "quick_visual_analysis" && !hasQuickVisualAnalysis(primaryText) && hasQuickVisualAnalysis(fallbackText)) return fallbackText;
		return primaryText;
	}
	function currentWaitText(jobId, baseline, options, structuredTask) {
		const jobMessage = getAssistantTurnForJob(jobId);
		const primaryText = normalizeAssistantText$1((jobMessage ?? getNewestAssistantTurn(baseline))?.innerText || "");
		const scopedStoryText = structuredTask ? getCompleteStructuredTextForJob(jobId, options.task || "") : "";
		const fallbackText = waitTextFallback(jobId, options, structuredTask);
		const requestVisible = requestExists(jobId) || (document.body.innerText || "").toLowerCase().includes(`studio_request_id: ${jobId}`.toLowerCase());
		const rawText = chooseWaitText(primaryText, fallbackText, structuredTask && requestVisible ? getLatestMountedAssistantText() : "", scopedStoryText, options, structuredTask);
		return {
			jobMessage,
			requestVisible,
			text: options.task === "quick_visual_analysis" ? normalizeQuickVisualAnalysisText(rawText) : rawText
		};
	}
	function waitTextIsReady({ baseline, jobMessage, options, providerGenerating, quickVisualReady, requestVisible, stableTicks, storyJsonReady, structuredTask, text }) {
		const hasNewTurn = getAssistantTurns().length > baseline.assistantCount || getConversationTurns().length > baseline.turnCount;
		const newStableText = isNewAssistantTextSinceBaseline(text, baseline) && !providerGenerating;
		const trustedStructuredText = [
			structuredTask,
			storyJsonReady,
			requestVisible || newStableText
		].every(Boolean);
		const trustedQuickVisualText = [
			options.task === "quick_visual_analysis",
			quickVisualReady,
			requestVisible || newStableText
		].every(Boolean);
		const trustedGraphText = [
			options.task === "production_graph_revision",
			requestVisible,
			jobMessage
		].every(Boolean);
		const stableTarget = options.task === "quick_visual_analysis" && quickVisualReady ? 2 : isGenerating() ? 8 : 3;
		return [
			[
				hasNewTurn,
				trustedStructuredText,
				trustedQuickVisualText,
				trustedGraphText
			].some(Boolean),
			text.length,
			storyJsonReady,
			quickVisualReady,
			stableTicks >= stableTarget
		].every(Boolean);
	}
	function finalWaitText(jobId, options, structuredTask) {
		const rawText = options.task === "quick_visual_analysis" ? extractLatestQuickVisualAnalysisFromPage(jobId) || getLatestQuickVisualAnalysisText() : structuredTask ? getCompleteStructuredTextForJob(jobId, options.task || "") || getLatestAssistantOnlyText() : normalizeAssistantText$1(getAssistantTurnForJob(jobId)?.innerText || getLatestAssistantText());
		return options.task === "quick_visual_analysis" ? normalizeQuickVisualAnalysisText(rawText) : normalizeAssistantText$1(rawText);
	}
	async function rejectDegenerateText(jobId, text, structuredTask, providerGenerating, progress) {
		if (structuredTask && hasDegenerateStructuredTail(text)) {
			if (!progress.degenerateTailSince) progress.degenerateTailSince = Date.now();
		} else progress.degenerateTailSince = 0;
		if (!structuredTask || !progress.degenerateTailSince || providerGenerating && Date.now() - progress.degenerateTailSince < 8e3) return false;
		findElement(SELECTORS.stopButton)?.click();
		await sleep(350);
		reportResult(jobId, "failed_retryable", void 0, "PROVIDER_OUTPUT_DEGENERATED: ChatGPT entered a repeated-token loop while writing structured JSON. Split this packet into a smaller batch before retrying.");
		return true;
	}
	function updateTextWaitProgress(text, providerGenerating, progress) {
		if (text.length > 0 && text.length === progress.lastLength) progress.stableTicks++;
		else {
			progress.stableTicks = 0;
			progress.lastLength = text.length;
			progress.lastTextChangeAt = Date.now();
			progress.inactiveSince = Date.now();
		}
		if (providerGenerating) progress.inactiveSince = Date.now();
	}
	function reportTextWaitProgress(jobId, text, storyJsonReady, quickVisualReady, structuredTask, options, waitPolicy, startTime, progress) {
		if (Date.now() - progress.lastProgressAt <= 3e3) return;
		const completion = Math.min((Date.now() - startTime) / waitPolicy.hardWaitMs, .95);
		const jsonNote = structuredTask && text.length > 0 && !storyJsonReady ? " Waiting for complete structured JSON." : "";
		const visualNote = options.task === "quick_visual_analysis" && text.length > 0 && !quickVisualReady ? " Waiting for visual analysis headings/content." : "";
		reportStatus(jobId, "generating", `Waiting for stable ChatGPT text response (${waitPolicy.tier} policy)... ${text.length} chars.${jsonNote}${visualNote}`, completion);
		progress.lastProgressAt = Date.now();
	}
	function reportInactiveTextFailure(jobId, text, providerGenerating, waitPolicy, progress) {
		if (providerGenerating || text.length >= 200 || Date.now() - progress.inactiveSince < waitPolicy.inactiveWaitMs) return false;
		reportResult(jobId, "failed_retryable", void 0, `Provider became inactive before producing usable output (${waitPolicy.tier} policy, ${Math.round(waitPolicy.inactiveWaitMs / 1e3)}s inactive).`);
		return true;
	}
	async function waitForTextResult(jobId, baseline, options = {}) {
		const maxWaitMs = options.maxWaitMs ?? 18e4;
		const structuredTask = isStructuredTask(options.task);
		const waitPolicy = resolveTextWaitPolicy(options.task, options.promptLength, maxWaitMs);
		const hardWaitMs = waitPolicy.hardWaitMs;
		const startTime = Date.now();
		const progress = {
			degenerateTailSince: 0,
			inactiveSince: startTime,
			lastLength: 0,
			lastProgressAt: 0,
			lastTextChangeAt: startTime,
			stableTicks: 0
		};
		while (Date.now() - startTime < hardWaitMs) {
			await sleep(700);
			const tick = await processTextWaitTick(jobId, baseline, options, structuredTask, waitPolicy, startTime, progress);
			if (tick === "done") return;
			if (tick === "break") break;
		}
		const finalText = finalWaitText(jobId, options, structuredTask);
		const finalStoryReady = structuredTask ? hasCompleteStructuredJson(finalText, options.task || "") : true;
		const finalVisualReady = options.task === "quick_visual_analysis" ? hasQuickVisualAnalysis(finalText) : true;
		if (finalText.length > 0 && finalStoryReady && finalVisualReady) {
			reportTextResult(jobId, finalText);
			return;
		}
		reportResult(jobId, "failed_retryable", void 0, "Timeout waiting for ChatGPT text response");
	}
	async function processTextWaitTick(jobId, baseline, options, structuredTask, waitPolicy, startTime, progress) {
		const { jobMessage, requestVisible, text } = currentWaitText(jobId, baseline, options, structuredTask);
		const error = jobMessage ? detectProviderError(jobMessage) : detectProviderError(document.body);
		if (error && !isGenerating(jobMessage)) {
			reportResult(jobId, "failed_retryable", void 0, `${error}: ${text.slice(0, 400)}`);
			return "done";
		}
		const providerGenerating = isGenerating();
		if (await rejectDegenerateText(jobId, text, structuredTask, providerGenerating, progress)) return "done";
		updateTextWaitProgress(text, providerGenerating, progress);
		if (reportInactiveTextFailure(jobId, text, providerGenerating, waitPolicy, progress)) return "done";
		const storyJsonReady = structuredTask ? hasCompleteStructuredJson(text, options.task || "") : true;
		const quickVisualReady = options.task === "quick_visual_analysis" ? hasQuickVisualAnalysis(text) : true;
		if (waitTextIsReady({
			baseline,
			jobMessage,
			options,
			providerGenerating,
			quickVisualReady,
			requestVisible,
			stableTicks: progress.stableTicks,
			storyJsonReady,
			structuredTask,
			text
		})) {
			reportTextResult(jobId, text);
			return "done";
		}
		reportTextWaitProgress(jobId, text, storyJsonReady, quickVisualReady, structuredTask, options, waitPolicy, startTime, progress);
		return !providerGenerating && Date.now() - progress.lastTextChangeAt >= waitPolicy.inactiveWaitMs ? "break" : "continue";
	}
	function reportStatus(jobId, status, message, progress, providerReferenceAssetIds) {
		const providerConversationUrl = /^\/c\/[^/]+/.test(location.pathname) ? location.href : void 0;
		chrome.runtime.sendMessage({
			source: "content-script",
			data: {
				type: "JOB_STATUS",
				jobId,
				status,
				message,
				progress,
				providerConversationUrl,
				providerReferenceAssetIds
			}
		});
	}
	function reportResult(jobId, status, assets, error) {
		const message = {
			source: "content-script",
			data: {
				type: "JOB_RESULT",
				jobId,
				status,
				assets,
				error
			}
		};
		return new Promise((resolve, reject) => {
			const deliver = (attempt) => {
				let settled = false;
				const timeout = setTimeout(() => {
					if (settled) return;
					settled = true;
					if (attempt < 3) setTimeout(() => deliver(attempt + 1), 800 * attempt);
					else reject(/* @__PURE__ */ new Error("CHATGPT_RESULT_DELIVERY_TIMEOUT: extension did not acknowledge the result message"));
				}, 8e3);
				chrome.runtime.sendMessage(message, () => {
					if (settled) return;
					settled = true;
					clearTimeout(timeout);
					if (!Boolean(chrome.runtime.lastError)) {
						reportStatus(jobId, "downloading", "ChatGPT result delivered to extension; finalizing asset import...");
						resolve();
					} else if (attempt < 3) setTimeout(() => deliver(attempt + 1), 800 * attempt);
					else reject(/* @__PURE__ */ new Error("CHATGPT_RESULT_DELIVERY_FAILED: extension did not acknowledge the result message"));
				});
			};
			deliver(1);
		});
	}
	function reportTextResult(jobId, text) {
		const message = {
			source: "content-script",
			data: {
				type: "JOB_RESULT",
				jobId,
				status: "done",
				assets: [],
				output: {
					kind: "text",
					encoding: "utf8",
					text
				},
				providerMetadata: { conversationUrl: location.href }
			}
		};
		const deliver = (attempt) => {
			chrome.runtime.sendMessage(message, () => {
				if (chrome.runtime.lastError && attempt < 3) setTimeout(() => deliver(attempt + 1), 800 * attempt);
			});
		};
		deliver(1);
	}
	function capturedTextForJob(jobId, task, jobTurn) {
		const completeStructuredText = isStructuredTask(task) ? getCompleteStructuredTextForJob(jobId, task) : "";
		if (completeStructuredText) return completeStructuredText;
		if (task === "quick_visual_analysis") return capturedQuickVisualText(jobId, jobTurn);
		if (structuredFallbackText(task, jobTurn)) return getLatestAssistantOnlyText();
		return normalizeAssistantText$1(jobTurn?.innerText || getLatestAssistantText());
	}
	function capturedQuickVisualText(jobId, jobTurn) {
		const turnText = jobTurn?.innerText || "";
		return jobTurn && hasQuickVisualAnalysis(turnText) ? normalizeAssistantText$1(turnText) : extractLatestQuickVisualAnalysisFromPage(jobId) || getLatestQuickVisualAnalysisText();
	}
	function structuredFallbackText(task, jobTurn) {
		return isStructuredTask(task) && Boolean(jobTurn) && !hasCompleteStructuredJson(jobTurn?.innerText || "", task) && hasCompleteStructuredJson(getLatestAssistantOnlyText(), task);
	}
	function captureLatestText(jobId, task = "") {
		const rawText = capturedTextForJob(jobId, task, getAssistantTurnForJob(jobId));
		const text = task === "quick_visual_analysis" ? normalizeQuickVisualAnalysisText(rawText) : rawText;
		const storyReady = !isStructuredTask(task) || hasCompleteStructuredJson(text, task);
		if (text && storyReady) {
			reportTextResult(jobId, text);
			return;
		}
		const turnCount = getConversationTurns().length;
		const markerExists = (document.body.innerText || "").toLowerCase().includes(`studio_request_id: ${jobId}`.toLowerCase());
		const reason = turnCount === 0 ? "Waiting for the saved ChatGPT conversation messages to load..." : markerExists ? isStructuredTask(task) && text ? "Matching ChatGPT request found; ignoring schema echo and waiting for complete structured JSON..." : "Matching ChatGPT request found; waiting for assistant text to become readable..." : "Saved ChatGPT conversation is open, but the matching request marker is not visible yet...";
		reportStatus(jobId, markerExists ? "generating" : "waiting_manual_action", reason, .35);
	}
	function imageRecoveryContext(jobId, expectedConversationUrl) {
		const expectedPath = conversationPath(expectedConversationUrl);
		const currentPath = conversationPath(location.href);
		const marker = `studio_request_id: ${jobId}`.toLowerCase();
		return {
			expectedPath,
			currentPath,
			markerExists: [getConversationTurns().some((turn) => (turn.innerText || "").toLowerCase().includes(marker)), (document.body.innerText || "").toLowerCase().includes(marker)].some(Boolean),
			turn: getAssistantTurnForJob(jobId)
		};
	}
	async function captureImageForJob(jobId, expectedConversationUrl = "") {
		if (isLoginPage()) return void reportStatus(jobId, "waiting_login", "ChatGPT sign-in is required before this saved image can be recovered.");
		const context = imageRecoveryContext(jobId, expectedConversationUrl);
		if (context.expectedPath && context.currentPath !== context.expectedPath) {
			reportStatus(jobId, "waiting_manual_action", `Open the saved conversation ${context.expectedPath}; the current tab is ${context.currentPath || location.pathname}.`);
			return;
		}
		const { expectedPath, currentPath, markerExists, turn } = context;
		if (!turn && markerExists && isGenerating()) {
			reportStatus(jobId, "generating", "Matching ChatGPT request found; image generation is still running.");
			return;
		}
		finalizeImageRecovery(jobId, {
			candidates: await recoverImageCandidates(turn, expectedPath === currentPath),
			providerError: turn ? detectProviderError(turn) : null,
			turn,
			markerExists
		});
	}
	function finalizeImageRecovery(jobId, input) {
		finalizeImageRecovery$1({
			jobId,
			...input,
			isGenerating,
			reportStatus,
			reportResult,
			reportRecoveredImage
		});
	}
	async function recoverImageCandidates(turn, useDocumentFallback) {
		let candidates = turn ? getImageCandidates(turn) : [];
		if (candidates.length === 0 && !isGenerating()) {
			turn?.scrollIntoView({
				block: "center",
				behavior: "instant"
			});
			await sleep(1200);
			candidates = turn ? getImageCandidates(turn) : getImageCandidates(document);
		}
		return candidates.length === 0 && useDocumentFallback ? getImageCandidates(document) : candidates;
	}
	function reportRecoveredImage(jobId, candidate) {
		reportResult(jobId, "done", recoveredImageAsset(jobId, candidate, location.href));
	}
	if (window.__studioChatGptAdapterListener) chrome.runtime.onMessage.removeListener(window.__studioChatGptAdapterListener);
	function handleChatGptExecution(message, sendResponse) {
		if (message.action !== "EXECUTE_CHATGPT_JOB_V2") return false;
		const payload = message.job;
		const acceptedJobIds = window.__studioChatGptAcceptedJobIds || /* @__PURE__ */ new Set();
		window.__studioChatGptAcceptedJobIds = acceptedJobIds;
		if (acceptedJobIds.has(payload.jobId)) {
			sendResponse({
				ok: true,
				duplicate: true
			});
			return true;
		}
		acceptedJobIds.add(payload.jobId);
		if (acceptedJobIds.size > 200) acceptedJobIds.delete(acceptedJobIds.values().next().value);
		executeJob(payload).finally(() => acceptedJobIds.delete(payload.jobId));
		sendResponse({
			ok: true,
			duplicate: false
		});
		return true;
	}
	function handleChatGptCapture(message, sendResponse) {
		if (message.action === "CAPTURE_LATEST_CHATGPT_TEXT_V2") {
			captureLatestText(String(message.jobId || ""), String(message.task || ""));
			sendResponse({ ok: true });
			return true;
		}
		if (message.action === "CAPTURE_CHATGPT_IMAGE_FOR_JOB_V2") {
			captureImageForJob(String(message.jobId || ""), String(message.expectedConversationUrl || ""));
			sendResponse({ ok: true });
			return true;
		}
		return false;
	}
	async function readChatGptAssetForBackground(url) {
		try {
			const response = await fetch(url, { credentials: "include" });
			if (!response.ok) {
				const mounted = Array.from(document.images).find((image) => image.src === url && image.complete && image.naturalWidth > 0);
				if (mounted) try {
					const canvas = document.createElement("canvas");
					canvas.width = mounted.naturalWidth;
					canvas.height = mounted.naturalHeight;
					canvas.getContext("2d")?.drawImage(mounted, 0, 0);
					const dataUrl = canvas.toDataURL("image/png");
					return {
						ok: true,
						dataUrl,
						mimeType: "image/png",
						byteSize: Math.max(0, Math.round(dataUrl.length * .75)),
						recoveredFromMountedImage: true
					};
				} catch (error) {
					return {
						ok: false,
						error: `HTTP_${response.status}; DOM_IMAGE_READ_FAILED: ${error instanceof Error ? error.message : String(error)}`
					};
				}
				return {
					ok: false,
					error: `HTTP_${response.status}`
				};
			}
			const blob = await response.blob();
			return {
				ok: true,
				dataUrl: await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result || ""));
					reader.onerror = () => reject(/* @__PURE__ */ new Error("READ_ERROR"));
					reader.readAsDataURL(blob);
				}),
				mimeType: blob.type || "application/octet-stream",
				byteSize: blob.size
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
	var chatGptMessageListener = (message, _sender, sendResponse) => {
		if (window.__studioChatGptAdapterVersion !== ADAPTER_VERSION) return false;
		if (message.action === "PING_STUDIO_ADAPTER") {
			sendResponse({
				ok: true,
				provider: "chatgpt",
				version: ADAPTER_VERSION
			});
			return true;
		}
		if (handleChatGptExecution(message, sendResponse)) return true;
		if (handleChatGptCapture(message, sendResponse)) return true;
		if (message.action === "READ_CHATGPT_ASSET_FOR_BACKGROUND") {
			readChatGptAssetForBackground(String(message.url || "")).then(sendResponse);
			return true;
		}
		if (message.action === "CANCEL_JOB") sendResponse({ ok: true });
		return true;
	};
	window.__studioChatGptAdapterVersion = ADAPTER_VERSION;
	window.__studioChatGptAdapterListener = chatGptMessageListener;
	chrome.runtime.onMessage.addListener(chatGptMessageListener);
	//#endregion
})();

//# sourceMappingURL=chatgpt.js.map