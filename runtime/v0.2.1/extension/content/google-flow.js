(function() {
	//#region ../../packages/extension-providers/src/google-flow/flow-composer-reference-helpers.ts
	var deps;
	function configureFlowComposerReferenceHelpers(next) {
		deps = next;
	}
	function composerHasReferenceSource() {
		if (deps.promptAttachmentElements().length > 0) return true;
		if (composerReferenceRemoveButtons().length > 0) return true;
		return false;
	}
	function composerContainsMediaUrls(attachments, composerUrls, expectedUrls) {
		if (composerUrls.some((url) => expectedUrls.includes(url))) return true;
		return attachments.some((attachment) => deps.tileMediaUrls(attachment).some((url) => expectedUrls.includes(url)));
	}
	async function composerReferenceMatches(reference) {
		if (!reference) return composerHasReferenceSource();
		const attachments = deps.promptAttachmentElements();
		const fingerprint = deps.referenceFingerprint(reference);
		const expectedUrls = fingerprint ? deps.expectedComposerMediaUrlsByReference.get(fingerprint) || [] : [];
		const composerRoot = deps.composerPanelRoot();
		const composerUrls = composerRoot ? deps.tileMediaUrls(composerRoot) : [];
		if (!attachments.length && !composerUrls.length) return false;
		if (expectedUrls.length) {
			if (composerContainsMediaUrls(attachments, composerUrls, expectedUrls)) return true;
		}
		const exactTile = deps.findExistingUploadedReferenceTile(reference);
		const exactTileUrls = exactTile ? deps.tileMediaUrls(exactTile) : [];
		if (exactTileUrls.length) {
			if (composerContainsMediaUrls(attachments, composerUrls, exactTileUrls)) return true;
		}
		await deps.revealReadyImageTileLabels(attachments.slice(0, 4));
		for (const attachment of attachments) {
			if (deps.tileMatchesReference(reference, attachment)) return true;
			if (await deps.tileVisuallyMatchesReference(reference, attachment)) return true;
		}
		return false;
	}
	async function waitForPromptAttachmentIncrease$1(beforeCount, timeoutMs = 8e3) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			if (deps.promptAttachmentCount() > beforeCount || composerReferenceRemoveButtons().length > beforeCount || beforeCount === 0 && composerHasReferenceSource()) return true;
			await deps.sleep(300);
		}
		return false;
	}
	async function waitForComposerReference$1(jobId, timeoutMs = 6e3, sourceMode = "components", reference) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			if (sourceMode === "frames" ? deps.directFrameAttachmentCount() > 0 || deps.flowStartFrameAttachmentRemoveButtons().length > 0 : composerHasReferenceSource()) {
				if (sourceMode === "components" && reference && !await composerReferenceMatches(reference)) {
					await deps.sleep(300);
					continue;
				}
				deps.flowTrace(jobId, `Flow composer ${sourceMode === "frames" ? "start-frame" : "component"} source verified.`, .5);
				return true;
			}
			await deps.sleep(300);
		}
		return false;
	}
	async function waitForVerifiedComposerSource(jobId, timeoutMs, sourceMode, reference, expectedReferenceCount = 1) {
		if (sourceMode === "frames") return waitForComposerReference$1(jobId, timeoutMs, sourceMode, reference);
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const attachmentCount = Math.max(deps.promptAttachmentCount(), composerReferenceRemoveButtons().length);
			if (attachmentCount >= expectedReferenceCount && composerHasReferenceSource()) {
				deps.flowTrace(jobId, `Flow component source manifest remains attached (${attachmentCount}/${expectedReferenceCount}); identities were verified in the exact picker before attach.`, .5);
				return true;
			}
			await deps.sleep(300);
		}
		return false;
	}
	function isFlowRemoveButton(button) {
		if (!deps.isVisible(button)) return false;
		const label = [
			button.getAttribute("aria-label") || "",
			button.getAttribute("title") || "",
			deps.visibleText(button)
		].join(" ");
		return /remove (?:media|reference|attachment)|delete (?:media|reference|attachment)|x[oó]a (?:nội dung|tệp|ảnh)|^cancel$/i.test(label.trim());
	}
	function isDetachedCancelLabel(button) {
		return /^cancel$/i.test(`${button.getAttribute("aria-label") || ""} ${button.innerText || ""}`.trim());
	}
	function isDetachedCancelShape(button) {
		const rect = button.getBoundingClientRect();
		return rect.width >= 36 && rect.width <= 80 && rect.height >= 36 && rect.height <= 80;
	}
	function isDetachedCancelInComposer(button, composerRect) {
		const rect = button.getBoundingClientRect();
		return rect.top >= composerRect.top - 140 && rect.bottom <= composerRect.bottom + 16 && rect.left >= composerRect.left - 24 && rect.right <= composerRect.right + 24;
	}
	function isDetachedFlowCancelButton(button, composerRect) {
		if (!deps.isVisible(button) || button.closest("[role=\"dialog\"], [role=\"listbox\"]")) return false;
		return isDetachedCancelLabel(button) && isDetachedCancelShape(button) && isDetachedCancelInComposer(button, composerRect);
	}
	function composerReferenceRemoveButtons() {
		const composerRoot = deps.getComposerRoot();
		if (!composerRoot) return [];
		const composerRect = composerRoot.getBoundingClientRect();
		const thumbnailButtons = Array.from(composerRoot.querySelectorAll("img, video")).filter((media) => deps.promptAttachmentElements().includes(media)).map((media) => media.closest("button, [role='button']")).filter((button) => Boolean(button && deps.isVisible(button)));
		const labelledButtons = Array.from(composerRoot.querySelectorAll("button, [role='button']")).filter(isFlowRemoveButton);
		const detachedThumbnailButtons = Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => isDetachedFlowCancelButton(button, composerRect));
		return Array.from(new Set([
			...thumbnailButtons,
			...labelledButtons,
			...detachedThumbnailButtons
		]));
	}
	async function clearComposerReferences(jobId, timeoutMs = 45e3) {
		const startedAt = Date.now();
		let emptySince = 0;
		while (Date.now() - startedAt < timeoutMs) {
			const before = composerReferenceCounts();
			if (before.empty) {
				emptySince ||= Date.now();
				if (Date.now() - emptySince >= 12e3) return true;
				await deps.sleep(250);
				continue;
			}
			emptySince = 0;
			if (!await removeOneComposerReference(jobId, before)) break;
		}
		const remaining = composerReferenceCounts();
		if (!remaining.empty) deps.flowTrace(jobId, `Flow composer still has ${remaining.prompt} prompt source attachment(s), ${remaining.frames} frame attachment(s), and ${remaining.removeButtons.length} visible attachment remove control(s) after cleanup.`, .24);
		return remaining.empty;
	}
	function composerReferenceCounts() {
		const prompt = deps.promptAttachmentCount();
		const frames = deps.directFrameAttachmentCount();
		const removeButtons = composerReferenceRemoveButtons();
		return {
			prompt,
			frames,
			removeButtons,
			empty: prompt === 0 && frames === 0 && removeButtons.length === 0
		};
	}
	function discardFlowPromptButton() {
		return Array.from(document.querySelectorAll("button, [role='button']")).filter(deps.isVisible).find((button) => /x(?:oá|óa|oa) câu lệnh|clear prompt|discard prompt/i.test([
			button.getAttribute("aria-label") || "",
			button.getAttribute("title") || "",
			deps.visibleText(button),
			button.textContent || ""
		].join(" "))) || null;
	}
	async function removeOneComposerReference(jobId, before) {
		const discard = discardFlowPromptButton();
		if (discard) {
			deps.flowTrace(jobId, "Clearing the complete Flow draft to remove all persisted component attachments.", .235);
			if (await deps.clickElementStrictNative(discard)) {
				await deps.humanPause(500, 850);
				return true;
			}
		}
		const frameRemove = deps.flowStartFrameAttachmentRemoveButtons()[0];
		if (frameRemove) {
			if (!await deps.clickElementStrictNative(frameRemove)) return false;
			await deps.humanPause(450, 850);
			return true;
		}
		if (before.removeButtons.length > 0) {
			if (!await deps.clickElementStrictNative(before.removeButtons[0])) return false;
			const startedAt = Date.now();
			while (Date.now() - startedAt < 1800 && composerReferenceRemoveButtons().length >= before.removeButtons.length) await deps.sleep(120);
			await deps.humanPause(180, 320);
			return true;
		}
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		await deps.humanPause(450, 850);
		const after = composerReferenceCounts();
		return after.prompt < before.prompt || after.frames < before.frames;
	}
	async function clearFlowDraftBeforeRetry(jobId) {
		const editor = deps.activeFlowPromptEditor();
		if (editor) await deps.clearFlowPromptEditor(editor);
		await clearComposerReferences(jobId, 45e3);
		await deps.closeMediaPickerIfOpen();
		if (!deps.getComposerRoot()) {
			deps.flowTrace(jobId, "Flow composer is closed after draft cleanup; reopening it before reference inventory.", .245);
			await deps.openFlowComposerFromProjectGrid(jobId);
		}
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-picker-helpers.ts
	var acceptFlowUploadConsentIfPresent$1;
	var clickElementCenterNative$2;
	var clickElementNative$2;
	var clickElementStrictNative$2;
	var clickFlowFrameSlot$2;
	var closeMediaPickerIfOpen$2;
	var compactText$1;
	var compareStartFrameOptions$1;
	var composerPanelRoot$2;
	var dataUrlToFile$1;
	var directFrameAttachmentCount$2;
	var dragTileToComposer$2;
	var exactReferenceOptionInOpenPicker$2;
	var flowDebugSnapshot$2;
	var flowStartFrameSlotLooksAttached$2;
	var flowStartFrameSlots$2;
	var flowStartOrEndFrameSlots$2;
	var flowTrace$1;
	var humanPause$1;
	var isVisible$1;
	var lastNativeMouseClickDiagnostic$2;
	var lastStartFramePickerDiagnostic$1;
	var mediaPickerDialogs$2;
	var mediaPickerReferenceOptions$1;
	var mediaUploadMenus$2;
	var normalizedToken$1;
	var pickerHasReadySelectedPreview$1;
	var promptAttachmentCount$1;
	var referenceRequiredLabel$2;
	var referenceSearchTokens$2;
	var rememberFlowTileForReference$1;
	var reportFlowPageError$1;
	var revealReadyImageTileLabels$2;
	var runFlowMainWorldAction$2;
	var simulateClick$1;
	var sleep$1;
	var tileHasReadyMedia$2;
	var tileLooksBusy$2;
	var tileMatchesReference$2;
	var tileSearchText$2;
	var tileVisuallyMatchesReference$2;
	var visibleText$1;
	var waitForComposerReference;
	var waitForFileInput$2;
	var waitForPromptAttachmentIncrease;
	var waitForTileReady$1;
	var referenceLocalFilePath$1;
	function configureFlowPickerHelpers(next) {
		acceptFlowUploadConsentIfPresent$1 = next.acceptFlowUploadConsentIfPresent;
		clickElementCenterNative$2 = next.clickElementCenterNative;
		clickElementNative$2 = next.clickElementNative;
		clickElementStrictNative$2 = next.clickElementStrictNative;
		clickFlowFrameSlot$2 = next.clickFlowFrameSlot;
		closeMediaPickerIfOpen$2 = next.closeMediaPickerIfOpen;
		compactText$1 = next.compactText;
		compareStartFrameOptions$1 = next.compareStartFrameOptions;
		composerPanelRoot$2 = next.composerPanelRoot;
		dataUrlToFile$1 = next.dataUrlToFile;
		directFrameAttachmentCount$2 = next.directFrameAttachmentCount;
		dragTileToComposer$2 = next.dragTileToComposer;
		exactReferenceOptionInOpenPicker$2 = next.exactReferenceOptionInOpenPicker;
		flowDebugSnapshot$2 = next.flowDebugSnapshot;
		flowStartFrameSlotLooksAttached$2 = next.flowStartFrameSlotLooksAttached;
		flowStartFrameSlots$2 = next.flowStartFrameSlots;
		flowStartOrEndFrameSlots$2 = next.flowStartOrEndFrameSlots;
		flowTrace$1 = next.flowTrace;
		humanPause$1 = next.humanPause;
		isVisible$1 = next.isVisible;
		lastNativeMouseClickDiagnostic$2 = next.lastNativeMouseClickDiagnostic;
		lastStartFramePickerDiagnostic$1 = next.lastStartFramePickerDiagnostic;
		mediaPickerDialogs$2 = next.mediaPickerDialogs;
		mediaPickerReferenceOptions$1 = next.mediaPickerReferenceOptions;
		mediaUploadMenus$2 = next.mediaUploadMenus;
		normalizedToken$1 = next.normalizedToken;
		pickerHasReadySelectedPreview$1 = next.pickerHasReadySelectedPreview;
		promptAttachmentCount$1 = next.promptAttachmentCount;
		referenceRequiredLabel$2 = next.referenceRequiredLabel;
		referenceSearchTokens$2 = next.referenceSearchTokens;
		rememberFlowTileForReference$1 = next.rememberFlowTileForReference;
		reportFlowPageError$1 = next.reportFlowPageError;
		revealReadyImageTileLabels$2 = next.revealReadyImageTileLabels;
		runFlowMainWorldAction$2 = next.runFlowMainWorldAction;
		simulateClick$1 = next.simulateClick;
		sleep$1 = next.sleep;
		tileHasReadyMedia$2 = next.tileHasReadyMedia;
		tileLooksBusy$2 = next.tileLooksBusy;
		tileMatchesReference$2 = next.tileMatchesReference;
		tileSearchText$2 = next.tileSearchText;
		tileVisuallyMatchesReference$2 = next.tileVisuallyMatchesReference;
		visibleText$1 = next.visibleText;
		waitForComposerReference = next.waitForComposerReference;
		waitForFileInput$2 = next.waitForFileInput;
		waitForPromptAttachmentIncrease = next.waitForPromptAttachmentIncrease;
		waitForTileReady$1 = next.waitForTileReady;
		referenceLocalFilePath$1 = next.referenceLocalFilePath;
	}
	async function waitForAddToPromptMenuItem(timeoutMs = 2500, root = document) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const menuItems = Array.from(root.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], button, [role=\"button\"]")).filter((element) => isVisible$1(element));
			const exactAddItem = menuItems.find((item) => /thêm vào câu lệnh|add to prompt|use in prompt/i.test(visibleText$1(item)));
			if (exactAddItem) return exactAddItem;
			const addItem = menuItems.find((item) => /add to|khung bắt đầu|start frame|first frame|add as start/i.test(visibleText$1(item)));
			if (addItem) return addItem;
			await sleep$1(150);
		}
		return null;
	}
	async function waitForMediaPickerContent(root, timeoutMs = 6500) {
		const startedAt = Date.now();
		let currentRoot = root;
		while (Date.now() - startedAt < timeoutMs) {
			currentRoot = mediaPickerDialogs$2().at(-1) || currentRoot;
			const options = mediaPickerReferenceOptions$1(currentRoot);
			if (options.length > 0) return {
				picker: currentRoot,
				options
			};
			if (await waitForAddToPromptMenuItem(250, currentRoot)) return {
				picker: currentRoot,
				options: mediaPickerReferenceOptions$1(currentRoot)
			};
			await sleep$1(250);
		}
		currentRoot = mediaPickerDialogs$2().at(-1) || currentRoot;
		return {
			picker: currentRoot,
			options: mediaPickerReferenceOptions$1(currentRoot)
		};
	}
	async function waitForPickerReference(jobId, picker, reference, timeoutMs = 5e3) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const options = mediaPickerReferenceOptions$1(mediaPickerDialogs$2().at(-1) || picker);
			if (reference ? options.some((option) => tileMatchesReference$2(reference, option)) : options.some((option) => /\.(png|jpe?g|webp)/i.test(tileSearchText$2(option)))) return true;
			await sleep$1(250);
		}
		return false;
	}
	async function ensureFlowPickerInventoryCategory(jobId, picker, reference) {
		const inventoryCategory = Array.from(picker.querySelectorAll("button, [role='button'], [role='tab']")).filter(isVisible$1).find((element) => /^(?:dashboard\s*)?(?:tất cả|all)$/i.test(compactText$1(visibleText$1(element), 40))) || null;
		if (!inventoryCategory) return;
		if (inventoryCategory.getAttribute("aria-selected") === "true" || inventoryCategory.getAttribute("data-state") === "active") return;
		flowTrace$1(jobId, `Switching Flow component picker inventory to "${compactText$1(visibleText$1(inventoryCategory), 40)}".`, .328);
		if (!await clickElementStrictNative$2(inventoryCategory)) return;
		if (await waitForPickerReference(jobId, picker, reference)) return;
		const livePicker = mediaPickerDialogs$2().at(-1) || picker;
		const uploadsCategory = Array.from(livePicker.querySelectorAll("button, [role='button'], [role='tab']")).filter(isVisible$1).find((element) => /(?:tệp tải lên|uploads?|uploaded files?)/i.test(compactText$1(visibleText$1(element), 50))) || null;
		if (!uploadsCategory) return;
		flowTrace$1(jobId, `Flow all-assets inventory did not expose uploaded filenames; switching to "${compactText$1(visibleText$1(uploadsCategory), 50)}".`, .329);
		if (!await clickElementStrictNative$2(uploadsCategory)) return;
		await waitForPickerReference(jobId, livePicker, reference);
	}
	async function waitForExactReferenceOptionInPicker(reference, initialPicker, timeoutMs = 3e4, requiredStableObservations = 3) {
		const startedAt = Date.now();
		let picker = initialPicker;
		let stableObservations = 0;
		while (Date.now() - startedAt < timeoutMs) {
			picker = mediaPickerDialogs$2().at(-1) || picker;
			const options = mediaPickerReferenceOptions$1(picker);
			const textMatches = options.filter((candidate) => tileMatchesReference$2(reference, candidate));
			let exactOption = exactReferenceOptionInOpenPicker$2(reference) || (textMatches.length === 1 ? textMatches[0] : null);
			if (!exactOption) {
				for (const candidate of textMatches.length > 1 ? textMatches : options) if (await tileVisuallyMatchesReference$2(reference, candidate)) {
					exactOption = candidate;
					break;
				}
			}
			if (exactOption && isReadyExactReferenceOption(exactOption, picker)) {
				stableObservations++;
				if (stableObservations >= requiredStableObservations) return {
					picker,
					option: exactOption
				};
			} else stableObservations = 0;
			await sleep$1(400);
		}
		return null;
	}
	function isReadyExactReferenceOption(option, picker) {
		return document.contains(option) && isVisible$1(option) && !tileLooksBusy$2(option) && (tileHasReadyMedia$2(option) || pickerHasReadySelectedPreview$1(picker));
	}
	async function waitForStartFrameAttachment(jobId, beforeFrameCount, timeoutMs = 5e3) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			if (directFrameAttachmentCount$2() > beforeFrameCount || flowStartFrameSlotLooksAttached$2()) {
				flowTrace$1(jobId, "Flow start-frame slot shows an attached keyframe.", .5);
				return true;
			}
			await sleep$1(250);
		}
		return false;
	}
	function flowComposerComponentAddButtons() {
		const composerRoot = composerPanelRoot$2();
		const buttons = Array.from(document.querySelectorAll("button, [role='button'], [aria-haspopup='dialog']")).filter((element) => isFlowComponentAddButton(element, composerRoot)).sort((left, right) => compareFlowComponentAddButtons(left, right, composerRoot));
		return Array.from(new Set(buttons));
	}
	function flowComponentButtonMatchesText(text) {
		return /add_2|\+|^add$|thêm thành phần|add component|thêm vào câu lệnh|thêm nội dung nghe nhìn lên|tải nội dung nghe nhìn lên|upload media/i.test(text) && !/arrow_forward|send|gửi|generate|create(?!.*media)|tạo video|submit/i.test(text);
	}
	function flowComponentButtonPlacement(element, composerRoot) {
		const rect = element.getBoundingClientRect();
		return Boolean(composerRoot?.contains(element)) || rect.top > window.innerHeight * .5 && rect.left > window.innerWidth * .18 && rect.left < window.innerWidth * .75;
	}
	function flowComponentButtonShape(element, text) {
		const rect = element.getBoundingClientRect();
		const exact = element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "dialog" && rect.width <= 56 && rect.height <= 56 && /add_2|\+|^add$/i.test(text);
		const labelled = /thêm thành phần|add component|thêm nội dung nghe nhìn lên|tải nội dung nghe nhìn lên|upload media/i.test(text) && rect.width <= 520 && rect.height <= 120;
		return exact || labelled;
	}
	function isFlowComponentAddButton(element, composerRoot) {
		if (!isVisible$1(element)) return false;
		const text = `${element.getAttribute("aria-label") || ""} ${visibleText$1(element)}`.trim();
		if (!flowComponentButtonMatchesText(text)) return false;
		return flowComponentButtonPlacement(element, composerRoot) && flowComponentButtonShape(element, text);
	}
	function compareFlowComponentAddButtons(left, right, composerRoot) {
		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();
		const composerRank = (element) => composerRoot?.contains(element) ? 0 : 1;
		const exactRank = (element) => element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "dialog" ? 0 : 1;
		return exactRank(left) - exactRank(right) || composerRank(left) - composerRank(right) || rightRect.top - leftRect.top || leftRect.left - rightRect.left;
	}
	async function openFlowMediaPicker(jobId) {
		const existing = mediaPickerDialogs$2().at(-1);
		if (existing) return existing;
		if (mediaUploadMenus$2().length) {
			flowTrace$1(jobId, "Closing Flow upload menu before opening the component picker.", .43);
			await closeMediaPickerIfOpen$2();
			await humanPause$1(350, 650);
		}
		const orderedButtons = flowComposerComponentAddButtons().slice(0, 4);
		for (const button of orderedButtons) {
			const dialog = await openFlowMediaPickerFromButton(jobId, button);
			if (dialog) return dialog;
			await humanPause$1(450, 800);
		}
		{
			const mediaButton = Array.from(document.querySelectorAll("button, [role='button'], [aria-label]")).filter(isVisible$1).find((element) => {
				const ariaLabel = String(element.getAttribute("aria-label") || "").trim();
				const labelText = visibleText$1(element).trim();
				return /add media|thêm nội dung nghe nhìn|tải nội dung nghe nhìn lên/i.test(ariaLabel) || /thêm nội dung nghe nhìn|tải nội dung nghe nhìn lên/i.test(labelText);
			});
			if (mediaButton) {
				flowTrace$1(jobId, `Opening Flow media picker via ${compactText$1(visibleText$1(mediaButton), 80)}.`, .43);
				if (await clickElementStrictNative$2(mediaButton, true) || await runFlowMainWorldAction$2("open-component-picker")) return waitForFlowComponentDialog(jobId, 12e3);
			}
		}
		if (!orderedButtons.length) flowTrace$1(jobId, `Flow composer add button was not visible; refusing toolbar upload path. ${flowDebugSnapshot$2()}`, .43);
		else flowTrace$1(jobId, `Flow component picker did not open after ${orderedButtons.length} add-button attempt(s). ${flowDebugSnapshot$2()}`, .43);
		return null;
	}
	async function openFlowMediaPickerFromButton(jobId, button) {
		flowTrace$1(jobId, `Opening Flow component picker via ${compactText$1(visibleText$1(button), 80) || button.tagName}...`, .43);
		let opened = await clickElementStrictNative$2(button, true);
		if (opened) await waitForMediaPickerDialog(3e3);
		else if (!mediaPickerDialogs$2().length) opened = await runFlowMainWorldAction$2("open-component-picker");
		if (!opened) {
			flowTrace$1(jobId, `Native click was unavailable for the exact Flow component add button (${lastNativeMouseClickDiagnostic$2 || "no diagnostic"}).`, .43);
			return null;
		}
		return waitForFlowComponentDialog(jobId, 12e3);
	}
	async function waitForMediaPickerDialog(timeoutMs) {
		const startedAt = Date.now();
		while (!mediaPickerDialogs$2().length && Date.now() - startedAt < timeoutMs) await sleep$1(250);
	}
	async function waitForFlowComponentDialog(jobId, timeoutMs) {
		const startedAt = Date.now();
		let selected = false;
		while (Date.now() - startedAt < timeoutMs) {
			const dialog = mediaPickerDialogs$2().at(-1);
			if (dialog) return dialog;
			const menuItem = selected ? null : flowComponentMenuItem();
			if (menuItem) {
				selected = true;
				flowTrace$1(jobId, `Selecting Flow component menu item "${compactText$1(visibleText$1(menuItem), 80)}".`, .43);
				if (!(await clickElementStrictNative$2(menuItem) || await runFlowMainWorldAction$2("select-component-menu"))) flowTrace$1(jobId, `Native click was unavailable for the Flow component menu item (${lastNativeMouseClickDiagnostic$2 || "no diagnostic"}).`, .43);
			}
			await sleep$1(250);
		}
		return null;
	}
	function flowComponentMenuItem() {
		return Array.from(document.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option'], div")).filter(isVisible$1).find((element) => {
			const rect = element.getBoundingClientRect();
			const text = visibleText$1(element);
			return rect.top > window.innerHeight * .45 && rect.width >= 80 && rect.width <= 520 && rect.height >= 28 && rect.height <= 120 && /thêm thành phần|add component|component|ingredient|thành phần/i.test(text) && !/tải nội dung nghe nhìn|upload|delete|trash|settings|help|video|hình ảnh|image|khung hình/i.test(text);
		}) || null;
	}
	async function openFlowLibraryUploadMenu(jobId) {
		const existing = mediaUploadMenus$2().at(-1);
		if (existing) return existing;
		const uploadButtons = flowLibraryUploadButtons();
		for (const button of uploadButtons.slice(0, 3)) {
			flowTrace$1(jobId, `Opening Flow library upload menu via ${compactText$1(visibleText$1(button), 80) || button.tagName}...`, .36);
			simulateClick$1(button);
			const startedAt = Date.now();
			while (Date.now() - startedAt < 3500) {
				const menu = mediaUploadMenus$2().at(-1);
				if (menu) return menu;
				if (await waitForFileInput$2(jobId, 300)) return document.body;
				const addMedia = Array.from(document.querySelectorAll("button, [role='button'], [aria-label]")).filter(isVisible$1).find((element) => /^(?:add media|thêm nội dung nghe nhìn)$/i.test(`${element.getAttribute("aria-label") || ""} ${visibleText$1(element)}`.trim())) || null;
				if (addMedia && addMedia !== button) {
					simulateClick$1(addMedia);
					await humanPause$1(350, 650);
					const opened = mediaUploadMenus$2().at(-1);
					if (opened) return opened;
				}
				await sleep$1(250);
			}
			await humanPause$1(450, 800);
		}
		return null;
	}
	function flowLibraryUploadButtons() {
		return Array.from(document.querySelectorAll("button, [role='button'], [aria-label]")).filter(isFlowLibraryUploadButton).sort((left, right) => {
			const leftRect = left.getBoundingClientRect();
			const rightRect = right.getBoundingClientRect();
			return leftRect.top - rightRect.top || rightRect.left - leftRect.left;
		});
	}
	function isFlowLibraryUploadButton(element) {
		if (!isVisible$1(element)) return false;
		const rect = element.getBoundingClientRect();
		const text = `${element.getAttribute("aria-label") || ""} ${visibleText$1(element)}`.trim();
		return rect.top < window.innerHeight * .22 && rect.width <= 180 && rect.height <= 90 && /thêm nội dung nghe nhìn|add media|tệp tải lên|uploaded media/i.test(text);
	}
	async function openFlowStartFramePicker(jobId) {
		const existingPicker = mediaPickerDialogs$2().at(-1);
		if (existingPicker) {
			const existingOptions = mediaPickerReferenceOptions$1(existingPicker);
			const existingAdd = await waitForAddToPromptMenuItem(300, existingPicker);
			if (existingOptions.length > 0 || existingAdd) {
				flowTrace$1(jobId, `Using already-open Flow start-frame picker with ${existingOptions.length} option(s).`, .43);
				return existingPicker;
			}
			await closeMediaPickerIfOpen$2();
			await humanPause$1(250, 500);
		}
		const startSlot = flowStartFrameSlots$2()[0] || null;
		if (!startSlot) {
			flowTrace$1(jobId, "No visible Flow start-frame slot matched the composer picker selector.", .43);
			return null;
		}
		flowTrace$1(jobId, `Opening Flow start-frame picker via ${compactText$1(visibleText$1(startSlot), 60) || startSlot.tagName}...`, .43);
		await clickFlowFrameSlot$2(startSlot);
		const startedAt = Date.now();
		while (Date.now() - startedAt < 6e3) {
			const dialog = mediaPickerDialogs$2().at(-1);
			if (dialog) return dialog;
			await sleep$1(250);
		}
		if (await runFlowMainWorldAction$2("open-start-frame-picker")) {
			const fallbackStartedAt = Date.now();
			while (Date.now() - fallbackStartedAt < 3100) {
				const dialog = mediaPickerDialogs$2().at(-1);
				if (dialog) return dialog;
				await sleep$1(250);
			}
		}
		flowTrace$1(jobId, `Flow start-frame slot click did not open the media picker (${compactText$1(visibleText$1(startSlot), 80) || startSlot.tagName}).`, .43);
		return null;
	}
	function tileSimilarity(left, right) {
		const leftText = tileSearchText$2(left);
		const rightText = tileSearchText$2(right);
		const leftImage = left.querySelector("img")?.currentSrc || left.querySelector("img")?.src || "";
		const rightImage = right.querySelector("img")?.currentSrc || right.querySelector("img")?.src || "";
		return Boolean(leftImage && rightImage && leftImage === rightImage || leftText && rightText && (leftText.includes(rightText.slice(0, 48)) || rightText.includes(leftText.slice(0, 48))));
	}
	function findTileInMediaPicker(tile, picker) {
		const tileId = tile.dataset.tileId || "";
		const candidates = mediaPickerReferenceOptions$1(picker);
		if (tileId) {
			const byId = candidates.find((element) => element.dataset.tileId === tileId);
			if (byId) return byId;
		}
		return candidates.find((element) => tileSimilarity(tile, element)) || null;
	}
	async function exactStartFrameOption(jobId, reference, allOptions) {
		const exact = allOptions.filter((candidate) => !reference || tileMatchesReference$2(reference, candidate)).sort(compareStartFrameOptions$1)[0];
		if (exact || !reference) return exact || null;
		for (const candidate of allOptions) {
			if (!await tileVisuallyMatchesReference$2(reference, candidate)) continue;
			flowTrace$1(jobId, `Flow start-frame picker matched ${referenceRequiredLabel$2(reference)} visually because the visible Flow filename differs from the app asset id.`, .45);
			rememberFlowTileForReference$1(reference, candidate);
			return candidate;
		}
		return null;
	}
	async function confirmStartFrameOption(jobId, picker, option) {
		const beforeFrameCount = directFrameAttachmentCount$2();
		flowTrace$1(jobId, `Selecting exact start-frame picker option "${compactText$1(visibleText$1(option), 90)}".`, .47);
		await clickElementNative$2(option);
		await humanPause$1(700, 1100);
		if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 1400)) {
			await closeMediaPickerIfOpen$2();
			return true;
		}
		let livePicker = mediaPickerDialogs$2().at(-1) || picker;
		let addItem = null;
		const addStartedAt = Date.now();
		while (Date.now() - addStartedAt < 4500) {
			livePicker = mediaPickerDialogs$2().at(-1) || livePicker;
			addItem = Array.from(livePicker.querySelectorAll("[role=\"menuitem\"], [role=\"option\"], button, [role=\"button\"]")).filter((item) => isVisible$1(item)).find((item) => /thêm vào câu lệnh|add to prompt|use in prompt/i.test(visibleText$1(item)) && item.getAttribute("aria-disabled") !== "true" && !(item instanceof HTMLButtonElement && item.disabled)) || null;
			if (addItem) break;
			await sleep$1(150);
		}
		if (addItem) {
			const rect = addItem.getBoundingClientRect();
			flowTrace$1(jobId, `Confirming exact start-frame picker add action at ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} via "${compactText$1(visibleText$1(addItem), 90)}".`, .49);
			await clickElementCenterNative$2(addItem);
			await humanPause$1(900, 1400);
		}
		return waitForStartFrameAttachment(jobId, beforeFrameCount, 5500);
	}
	async function attachReferenceThroughVisibleStartPicker(jobId, reference) {
		lastStartFramePickerDiagnostic$1 = "";
		let picker = await openFlowStartFramePicker(jobId);
		if (!picker) {
			lastStartFramePickerDiagnostic$1 = "picker did not open";
			flowTrace$1(jobId, "Flow start-frame picker did not open from the visible Bắt đầu slot.", .44);
			return false;
		}
		const hydrated = await waitForMediaPickerContent(picker, 7e3);
		picker = hydrated.picker;
		const hydratedOptions = hydrated.options;
		await revealReadyImageTileLabels$2(hydratedOptions.slice(0, 16));
		const allOptions = mediaPickerReferenceOptions$1(picker);
		const option = await exactStartFrameOption(jobId, reference, allOptions);
		if (!option) {
			lastStartFramePickerDiagnostic$1 = `picker opened with ${allOptions.length} option(s), but none matched ${referenceRequiredLabel$2(reference)} by text or visual`;
			flowTrace$1(jobId, `Flow start-frame picker opened, but no exact option matched ${referenceRequiredLabel$2(reference)}.`, .44);
			await closeMediaPickerIfOpen$2();
			return false;
		}
		lastStartFramePickerDiagnostic$1 = `picker matched option "${compactText$1(visibleText$1(option), 120)}" among ${allOptions.length} option(s)`;
		const attached = await confirmStartFrameOption(jobId, picker, option);
		if (!attached) {
			lastStartFramePickerDiagnostic$1 = `${lastStartFramePickerDiagnostic$1}; picker confirmation did not attach (${lastNativeMouseClickDiagnostic$2 || "no native diagnostic"})`;
			flowTrace$1(jobId, `Flow did not attach after picker confirmation (${lastNativeMouseClickDiagnostic$2 || "no native diagnostic"}). ${flowDebugSnapshot$2()}`, .49);
		}
		if (attached) await closeMediaPickerIfOpen$2();
		return attached;
	}
	async function uploadReferenceThroughStartFramePicker(jobId, reference) {
		const file = dataUrlToFile$1(reference);
		if (!file) throw new Error(`No usable keyframe file data was available for ${referenceRequiredLabel$2(reference)}.`);
		let picker = await openFlowStartFramePicker(jobId);
		if (!picker) throw new Error(`Flow start-frame picker did not open, so the app will not upload ${referenceRequiredLabel$2(reference)} through the media-grid fallback. ${flowDebugSnapshot$2()}`);
		await revealReadyImageTileLabels$2(mediaPickerReferenceOptions$1(picker).slice(0, 16));
		if (mediaPickerReferenceOptions$1(picker).some((candidate) => tileMatchesReference$2(reference, candidate))) return await attachReferenceThroughVisibleStartPicker(jobId, reference);
		try {
			await stageStartFramePickerUpload(jobId, picker, file, reference);
		} catch (error) {
			if (!/no file input/i.test(error instanceof Error ? error.message : String(error))) throw error;
			flowTrace$1(jobId, `Flow start-frame picker has no upload input; using the single media-library upload path for ${referenceRequiredLabel$2(reference)}.`, .44);
			await closeMediaPickerIfOpen$2();
			await humanPause$1(350, 650);
			const uploadMenu = await openFlowLibraryUploadMenu(jobId);
			let chooserUploadAccepted = false;
			if (uploadMenu) {
				const uploadItem = Array.from(uploadMenu.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option'], div")).filter(isVisible$1).find((element) => /(?:tải lên|upload)/i.test(compactText$1(visibleText$1(element), 40)) && !/(?:bộ sưu tập|collection|tạo nhân vật|character|cảnh mới|new scene)/i.test(compactText$1(visibleText$1(element), 80))) || null;
				if (uploadItem) {
					const uploadRect = uploadItem.getBoundingClientRect();
					const localFilePath = String(referenceLocalFilePath$1?.(reference) || reference?.localFilePath || "");
					chooserUploadAccepted = (localFilePath ? await chrome.runtime.sendMessage({
						source: "google-flow-adapter",
						type: "NATIVE_UPLOAD_FILE_CHOOSER",
						x: uploadRect.left + uploadRect.width / 2,
						y: uploadRect.top + uploadRect.height / 2,
						filePaths: [localFilePath]
					}).catch(() => ({ ok: false })) : { ok: false })?.ok === true;
					if (!chooserUploadAccepted) {
						await clickElementNative$2(uploadItem);
						await humanPause$1(450, 750);
					} else await humanPause$1(900, 1400);
				}
			}
			if (chooserUploadAccepted) {
				await humanPause$1(900, 1400);
				picker = await openFlowStartFramePicker(jobId);
				if (!picker) throw new Error(`Flow media-library upload completed, but the start-frame picker did not reopen for ${referenceRequiredLabel$2(reference)}. ${flowDebugSnapshot$2()}`);
			}
			const input = chooserUploadAccepted ? null : await waitForFileInput$2(jobId, 5e3, document);
			if (chooserUploadAccepted) {} else if (input) {
				const transfer = new DataTransfer();
				transfer.items.add(file);
				const nativeFilesSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files")?.set;
				if (nativeFilesSetter) nativeFilesSetter.call(input, transfer.files);
				else input.files = transfer.files;
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new Event("change", { bubbles: true }));
			} else {
				const localFilePath = String(referenceLocalFilePath$1?.(reference) || reference?.localFilePath || "");
				if (!(localFilePath ? await chrome.runtime.sendMessage({
					source: "google-flow-adapter",
					type: "NATIVE_SET_FILE_INPUT",
					filePaths: [localFilePath]
				}).catch(() => ({ ok: false })) : { ok: false })?.ok) throw error;
				flowTrace$1(jobId, `Flow native file chooser accepted ${referenceRequiredLabel$2(reference)} through the background CDP file target.`, .45);
			}
			await humanPause$1(900, 1400);
			if (!chooserUploadAccepted) {
				picker = await openFlowStartFramePicker(jobId);
				if (!picker) throw new Error(`Flow media-library upload completed, but the start-frame picker did not reopen for ${referenceRequiredLabel$2(reference)}. ${flowDebugSnapshot$2()}`);
			}
		}
		flowTrace$1(jobId, `Uploaded exactly one keyframe through the start-frame picker: ${referenceRequiredLabel$2(reference)}.`, .45);
		await acceptFlowUploadConsentIfPresent$1(jobId);
		const beforeFrameCount = directFrameAttachmentCount$2();
		if (await waitForUploadedStartFrame(jobId, picker, reference, beforeFrameCount)) return true;
		await closeMediaPickerIfOpen$2();
		throw new Error(`Uploaded ${referenceRequiredLabel$2(reference)} through the start-frame picker, but Flow did not expose or attach the exact uploaded option within 45s. ${flowDebugSnapshot$2()}`);
	}
	async function stageStartFramePickerUpload(jobId, picker, file, reference) {
		const uploadControl = Array.from(picker.querySelectorAll("button, [role='button'], [role='menuitem'], div")).filter(isVisible$1).find((element) => /tải nội dung nghe nhìn lên|upload media|upload/i.test(visibleText$1(element)));
		if (uploadControl) {
			await clickElementNative$2(uploadControl);
			await humanPause$1(500, 900);
		}
		const input = await waitForFileInput$2(jobId, 5e3);
		if (!input) throw new Error(`Flow start-frame picker has no file input for ${referenceRequiredLabel$2(reference)}. ${flowDebugSnapshot$2()}`);
		const transfer = new DataTransfer();
		transfer.items.add(file);
		const nativeFilesSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files")?.set;
		if (nativeFilesSetter) nativeFilesSetter.call(input, transfer.files);
		else input.files = transfer.files;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}
	async function waitForUploadedStartFrame(jobId, picker, reference, beforeFrameCount) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < 45e3) {
			if (reportFlowPageError$1(jobId)) throw new Error(`Google Flow crashed while uploading ${referenceRequiredLabel$2(reference)} through the start-frame picker. ${flowDebugSnapshot$2()}`);
			if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 600)) {
				await closeMediaPickerIfOpen$2();
				rememberFlowTileForReference$1(reference, flowStartOrEndFrameSlots$2()[0] || document.body);
				return true;
			}
			const livePicker = mediaPickerDialogs$2().at(-1) || picker;
			await revealReadyImageTileLabels$2(mediaPickerReferenceOptions$1(livePicker).slice(0, 16));
			const exactOption = mediaPickerReferenceOptions$1(livePicker).find((candidate) => tileMatchesReference$2(reference, candidate));
			if (exactOption) {
				await clickElementNative$2(exactOption);
				await humanPause$1(800, 1300);
				const addItem = await waitForAddToPromptMenuItem(4500, livePicker);
				if (addItem) await clickElementNative$2(addItem);
				if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 7e3)) {
					await closeMediaPickerIfOpen$2();
					return true;
				}
			}
			await sleep$1(800);
		}
		return false;
	}
	function exactPickerTarget(reference, tile, livePicker, pickerRoots, hydratedOption) {
		if (!reference) return findTileInMediaPicker(tile, livePicker);
		const referenceTokens = reference ? referenceSearchTokens$2(reference) : [];
		const selectedExactOption = pickerRoots.flatMap((root) => Array.from(root.querySelectorAll("[role='option'][aria-selected='true']"))).find((option) => referenceTokens.includes(normalizedToken$1(option.querySelector("img[alt]")?.alt || "")));
		return hydratedOption || selectedExactOption || mediaPickerReferenceOptions$1(livePicker).find((candidate) => tileMatchesReference$2(reference, candidate)) || findTileInMediaPicker(tile, livePicker) || pickerRoots.flatMap((root) => Array.from(root.querySelectorAll("img[alt]"))).find((image) => referenceTokens.includes(normalizedToken$1(image.alt || ""))) || null;
	}
	function selectedPickerTargetMatchesReference(reference, target) {
		if (!reference || !target || target.getAttribute("aria-selected") !== "true") return false;
		const tokens = referenceSearchTokens$2(reference);
		const label = normalizedToken$1(`${visibleText$1(target)} ${target.querySelector("img[alt]")?.alt || ""}`);
		return tokens.some((token) => label.includes(token) || token.includes(label));
	}
	async function waitForExactPickerSelection(reference, timeoutMs) {
		if (!reference) return true;
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			if (mediaPickerDialogs$2().flatMap((root) => Array.from(root.querySelectorAll("[role='option'][aria-selected='true']"))).some((option) => tileMatchesReference$2(reference, option))) return true;
			await sleep$1(150);
		}
		return false;
	}
	async function selectExactPickerTarget(jobId, target, reference) {
		if (target.getAttribute("aria-selected") === "true") {
			const selectedPicker = mediaPickerDialogs$2().at(-1);
			if (selectedPicker ? await waitForAddToPromptMenuItem(500, selectedPicker) : null) {
				flowTrace$1(jobId, `Exact Flow picker reference is already selected with a ready add-to-prompt action (${referenceRequiredLabel$2(reference)}).`, .44);
				return true;
			}
			if ((reference ? await runFlowMainWorldAction$2("select-reference", referenceRequiredLabel$2(reference)) : false) && await waitForExactPickerSelection(reference, 5e3)) {
				flowTrace$1(jobId, "Exact Flow picker reference selected through the picker semantic action; keeping the composer route.", .44);
				await humanPause$1(500, 800);
				return true;
			}
			flowTrace$1(jobId, "Exact Flow picker reference is highlighted; confirming it with one native selection fallback before add-to-prompt.", .44);
			if (await clickElementStrictNative$2(target)) {
				await humanPause$1(500, 800);
				return true;
			}
		}
		const semanticSelection = reference ? await runFlowMainWorldAction$2("select-reference", referenceRequiredLabel$2(reference)) : false;
		const selected = semanticSelection && await waitForExactPickerSelection(reference, 5e3) || await clickElementStrictNative$2(target) && await waitForExactPickerSelection(reference, 8e3);
		if (!selected) flowTrace$1(jobId, `No trusted selection path was available for the exact Flow picker reference (${lastNativeMouseClickDiagnostic$2 || "no diagnostic"}).`, .44);
		else if (semanticSelection) flowTrace$1(jobId, `Confirmed the exact Flow picker reference selection before add-to-prompt (${referenceRequiredLabel$2(reference)}).`, .44);
		if (selected) await humanPause$1(500, 800);
		return selected;
	}
	async function commitPickerTarget(jobId, livePicker, beforeAttachmentCount, reference) {
		if (promptAttachmentCount$1() > beforeAttachmentCount || await waitForComposerReference(jobId, 1200, "components", reference)) {
			await closeMediaPickerIfOpen$2();
			return true;
		}
		return commitSelectedPickerItem(jobId, livePicker, beforeAttachmentCount, reference);
	}
	async function commitSelectedPickerItem(jobId, livePicker, beforeAttachmentCount, reference) {
		const currentPicker = mediaPickerDialogs$2().at(-1) || livePicker;
		const addItem = await waitForAddToPromptMenuItem(6500, currentPicker);
		if (!addItem) {
			flowTrace$1(jobId, `Flow component picker selected the matched keyframe, but no "Thêm vào câu lệnh" action appeared. picker="${compactText$1(visibleText$1(currentPicker), 180)}"`, .46);
			await closeMediaPickerIfOpen$2();
			return false;
		}
		flowTrace$1(jobId, `Selecting keyframe via "${compactText$1(visibleText$1(addItem), 90)}"...`, .46);
		let addClicked = await clickElementStrictNative$2(addItem);
		if (!addClicked) addClicked = await runFlowMainWorldAction$2("add-to-prompt");
		if (!addClicked) {
			flowTrace$1(jobId, `No trusted click path was available for Flow add-to-prompt (${lastNativeMouseClickDiagnostic$2 || "no diagnostic"}).`, .46);
			await closeMediaPickerIfOpen$2();
			return false;
		}
		await humanPause$1(900, 1400);
		if (await waitForPromptAttachmentIncrease(beforeAttachmentCount, 3500)) {
			await closeMediaPickerIfOpen$2();
			if (reference) flowTrace$1(jobId, `Flow attached the exact picker option for ${referenceRequiredLabel$2(reference)} through the semantic add action.`, .5);
			return true;
		}
		const retryPicker = mediaPickerDialogs$2().at(-1);
		if ((retryPicker ? await waitForAddToPromptMenuItem(1200, retryPicker) : null) && await runFlowMainWorldAction$2("add-to-prompt")) {
			flowTrace$1(jobId, "Flow native add action did not hydrate the composer; retrying the still-visible picker action once in the page world.", .48);
			await humanPause$1(900, 1400);
		}
		const attached = await waitForPromptAttachmentIncrease(beforeAttachmentCount, 75e3);
		await closeMediaPickerIfOpen$2();
		if (attached && reference) flowTrace$1(jobId, `Flow attached the exact picker option for ${referenceRequiredLabel$2(reference)}; accepting the confirmed 0-to-1 composer attachment transition.`, .5);
		return attached;
	}
	async function addTileToPromptViaPicker(jobId, tile, beforeAttachmentCount, reference) {
		const picker = await openFlowMediaPicker(jobId);
		if (!picker) {
			flowTrace$1(jobId, "Flow component picker was not available; skipping direct tile click to avoid crashing the project page.", .44);
			return false;
		}
		if (reference) await revealReadyImageTileLabels$2(mediaPickerReferenceOptions$1(picker).slice(0, 20));
		const exactHydrated = reference ? await waitForExactReferenceOptionInPicker(reference, picker, 8e3) : null;
		const livePicker = exactHydrated?.picker || mediaPickerDialogs$2().at(-1) || picker;
		const target = exactPickerTarget(reference, tile, livePicker, Array.from(new Set([...mediaPickerDialogs$2(), livePicker])), exactHydrated?.option);
		if (!target || reference && !tileMatchesReference$2(reference, target) && !selectedPickerTargetMatchesReference(reference, target)) {
			if (reference) flowTrace$1(jobId, `Flow component picker opened, but no picker item matched ${referenceRequiredLabel$2(reference)}.`, .44);
			await closeMediaPickerIfOpen$2();
			return false;
		}
		if (exactHydrated) flowTrace$1(jobId, `Flow component picker hydrated the exact reference before attach (${compactText$1(tileSearchText$2(target), 90)}).`, .44);
		flowTrace$1(jobId, "Selecting keyframe inside Flow component picker...", .44);
		if (!await selectExactPickerTarget(jobId, target, reference)) {
			await closeMediaPickerIfOpen$2();
			return false;
		}
		return commitPickerTarget(jobId, livePicker, beforeAttachmentCount, reference);
	}
	async function addTileToPromptViaStartFramePicker(jobId, tile, beforeAttachmentCount, reference) {
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		await humanPause$1(250, 450);
		const picker = await openFlowStartFramePicker(jobId);
		if (!picker) return false;
		if (reference) await revealReadyImageTileLabels$2(mediaPickerReferenceOptions$1(picker).slice(0, 16));
		const target = reference ? mediaPickerReferenceOptions$1(picker).find((candidate) => tileMatchesReference$2(reference, candidate)) || findTileInMediaPicker(tile, picker) : findTileInMediaPicker(tile, picker);
		if (!target || reference && !tileMatchesReference$2(reference, target)) {
			flowTrace$1(jobId, `Flow start-frame picker opened, but no tile matched ${referenceRequiredLabel$2(reference)}.`, .44);
			await closeMediaPickerIfOpen$2();
			return false;
		}
		flowTrace$1(jobId, `Selecting matched keyframe in Flow start-frame picker (${compactText$1(tileSearchText$2(target), 90)}).`, .46);
		const beforeFrameCount = directFrameAttachmentCount$2();
		await clickElementNative$2(target);
		await humanPause$1(650, 1050);
		if (await waitForStartFrameAttachment(jobId, beforeFrameCount, 1400)) {
			await closeMediaPickerIfOpen$2();
			return true;
		}
		const addItem = await waitForAddToPromptMenuItem(5500, mediaPickerDialogs$2().at(-1) || picker);
		if (!addItem) {
			await closeMediaPickerIfOpen$2();
			return false;
		}
		flowTrace$1(jobId, `Attaching matched keyframe via start-frame picker "${compactText$1(visibleText$1(addItem), 90)}"...`, .48);
		await clickElementNative$2(addItem);
		await humanPause$1(900, 1400);
		const attached = await waitForStartFrameAttachment(jobId, beforeFrameCount, 7e3) || await waitForPromptAttachmentIncrease(beforeAttachmentCount, 2e3);
		await closeMediaPickerIfOpen$2();
		return attached;
	}
	async function addExactReferenceTile(jobId, tile, beforeAttachmentCount, reference) {
		if (await addTileToPromptViaPicker(jobId, tile, beforeAttachmentCount, reference)) return true;
		if (promptAttachmentCount$1() > beforeAttachmentCount || await waitForComposerReference(jobId, 1200, "components", reference)) return true;
		flowTrace$1(jobId, `Flow component picker did not attach the exact ${referenceRequiredLabel$2(reference)}. Refusing tile-menu/grid fallback because it can create wrong-reference or text-only videos.`, .44);
		return false;
	}
	async function addTileWithFallbackStrategy(jobId, tile, beforeAttachmentCount, allowPickerFallback, reference) {
		for (let attempt = 1; attempt <= 3; attempt++) {
			if (!await waitForTileReady$1(tile, 5e3)) {
				flowTrace$1(jobId, `Keyframe tile is not ready for context menu yet (attempt ${attempt}/3).`, .42);
				continue;
			}
			if (!allowPickerFallback) {
				if (await attachReferenceThroughVisibleStartPicker(jobId, reference)) return true;
				if (await addTileToPromptViaStartFramePicker(jobId, tile, beforeAttachmentCount, reference)) return true;
				flowTrace$1(jobId, `Keyframe tile could not be attached through the video start-frame picker (attempt ${attempt}/3). Refusing direct drag because it does not match the verified manual Flow path.`, .44);
				await humanPause$1(900, 1400);
				return false;
			}
			if (await addTileToPromptViaPicker(jobId, tile, beforeAttachmentCount, reference)) return true;
			if (promptAttachmentCount$1() > beforeAttachmentCount || await waitForComposerReference(jobId, 1200, "components", reference)) return true;
			if (await dragTileToComposer$2(jobId, tile, beforeAttachmentCount, 5)) return true;
			flowTrace$1(jobId, `Flow component picker did not attach the keyframe (attempt ${attempt}/3); no verified tile-menu attach path succeeded.`, .44);
			return false;
		}
		return false;
	}
	async function addTileToPrompt(jobId, tile, beforeAttachmentCount, allowPickerFallback = true, reference) {
		if (allowPickerFallback && reference) return addExactReferenceTile(jobId, tile, beforeAttachmentCount, reference);
		return addTileWithFallbackStrategy(jobId, tile, beforeAttachmentCount, allowPickerFallback, reference);
	}
	//#endregion
	//#region ../../packages/domain/src/duration-policy.ts
	var DEFAULT_POLICY = {
		supportedDurationsSec: [],
		preferredDurationSec: 6
	};
	var POLICIES = { "google-flow": {
		supportedDurationsSec: [
			4,
			6,
			8,
			10
		],
		preferredDurationSec: 8
	} };
	function getProviderVideoDurationPolicy(provider) {
		return POLICIES[provider] ?? DEFAULT_POLICY;
	}
	function resolveProviderVideoDuration(provider, timelineDurationSec) {
		const requested = Number.isFinite(timelineDurationSec) && timelineDurationSec > 0 ? timelineDurationSec : 6;
		const ladder = getProviderVideoDurationPolicy(provider).supportedDurationsSec;
		if (!ladder.length) return requested;
		return ladder.find((duration) => requested <= duration) ?? ladder.at(-1) ?? requested;
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-composer-dom.ts
	var activeDeps$3;
	function getActiveSettingsPanel$1() {
		const candidates = Array.from(document.querySelectorAll("[role=\"dialog\"], [role=\"menu\"], [role=\"listbox\"], [data-radix-popper-content-wrapper], [data-state=\"open\"]")).filter((element) => {
			const text = element.innerText || "";
			return activeDeps$3.isVisible(element) && /khung hình|thành phần|hình ảnh|video|omni|4s|6s|8s|10s|x1|x2|x3|x4|9\s*:\s*16|16\s*:\s*9/i.test(text);
		});
		const sidePanel = Array.from(document.querySelectorAll("div, aside, section")).filter((element) => {
			const rect = element.getBoundingClientRect();
			const text = element.innerText || "";
			return activeDeps$3.isVisible(element) && rect.width >= 240 && rect.height >= 360 && rect.left > window.innerWidth * .55 && /cài đặt tác nhân|generation defaults|chế độ mặc định|tính năng tạo video|omni|9\s*:\s*16|16\s*:\s*9/i.test(text);
		}).at(-1);
		return candidates.at(-1) || sidePanel || null;
	}
	function getComposerSettingsMenu$1() {
		return Array.from(document.querySelectorAll("[role=\"menu\"], [data-radix-popper-content-wrapper], [data-state=\"open\"], flow-prompt-box-settings, .cdk-overlay-pane")).filter((element) => {
			const text = element.innerText || "";
			const rect = element.getBoundingClientRect();
			return activeDeps$3.isVisible(element) && rect.top > window.innerHeight * .35 && /hình ảnh|image/i.test(text) && /video/i.test(text) && /9\s*:\s*16|16\s*:\s*9|4\s*:\s*3|3\s*:\s*4|1\s*:\s*1/i.test(text) && /x\s*1|1x|x\s*2|x\s*3|x\s*4|(?:4|6|8|10)\s*(?:s|giây|seconds?)/i.test(text);
		}).at(-1) || null;
	}
	function getComposerSettingsButton$1() {
		const composerRoot = activeDeps$3.getComposerRoot();
		const directTriggers = Array.from(document.querySelectorAll("button.settings-trigger-button, button[aria-label*='cài đặt' i], button[aria-label*='settings' i]")).filter((button) => activeDeps$3.isVisible(button) && button.getBoundingClientRect().top > window.innerHeight * .55);
		if (directTriggers.length) return directTriggers.at(-1) || null;
		if (!composerRoot) return null;
		const buttons = Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => isComposerSettingsButton(button, composerRoot));
		const openTrigger = buttons.find((button) => button.getAttribute("aria-expanded") === "true" && button.getAttribute("aria-haspopup"));
		if (openTrigger) return openTrigger;
		return buttons.find((button) => {
			const rect = button.getBoundingClientRect();
			const text = activeDeps$3.visibleText(button);
			return rect.width >= 90 && rect.width <= 260 && rect.height >= 32 && rect.height <= 90 && /nano|veo|video|hình ảnh|image|\d+\s*s|x\s*1|1x/i.test(text);
		}) || buttons.at(-1) || null;
	}
	function isComposerSettingsButton(button, composerRoot) {
		if (!activeDeps$3.isVisible(button)) return false;
		const text = activeDeps$3.visibleText(button);
		const rect = button.getBoundingClientRect();
		return (composerRoot.contains(button) || Boolean(button.closest("[data-radix-popper-content-wrapper], [role='menu']"))) && rect.top > window.innerHeight * .55 && /video|hình ảnh|image|nano|veo|model/i.test(text) && /\d+\s*s|9\s*:\s*16|16\s*:\s*9|1\s*:\s*1|x\s*1|1x|nano|veo/i.test(text);
	}
	function composerSettingsText$1() {
		return [getComposerSettingsButton$1(), getComposerSettingsMenu$1()].filter(Boolean).map((element) => activeDeps$3.visibleText(element)).join(" ").replace(/\s+/g, " ").trim();
	}
	function flowIsImageEditorSurface() {
		return Boolean(document.querySelector("flow-image-editor, .image-editor, flow-edit-image-prompt-box"));
	}
	function composerShowsVideoMode$1() {
		const trigger = getComposerSettingsButton$1();
		const text = trigger ? activeDeps$3.visibleText(trigger) : "";
		const nativeTrigger = Array.from(document.querySelectorAll("button.settings-trigger-button, button[aria-label*='cài đặt' i], button[aria-label*='settings' i]")).filter((button) => activeDeps$3.isVisible(button)).at(-1);
		const nativeText = nativeTrigger ? activeDeps$3.visibleText(nativeTrigger).replace(/\s+/g, " ").trim() : "";
		if (/^video\b/i.test(nativeText) && !/nano\s+banana|hình ảnh|\bimage\b/i.test(nativeText)) return true;
		return Boolean(activeDeps$3.getComposerRoot()) && /(^|\s)(?:video|veo)(\s|·|$)/i.test(text) && !/nano\s+banana|hình ảnh|\bimage\b/i.test(text);
	}
	function composerShowsAspectRatio$1(aspectRatio) {
		if (!aspectRatio) return true;
		const text = composerSettingsText$1();
		const compactRatio = aspectRatio.replace(":", "_");
		const escapedRatio = aspectRatio.replace(":", "\\s*:?\\s*");
		return new RegExp(escapedRatio).test(text) || new RegExp(`crop_${compactRatio}`, "i").test(text);
	}
	function composerShowsDuration$1(durationSec) {
		if (!durationSec) return true;
		const flowDuration = activeDeps$3.resolveProviderVideoDuration("google-flow", durationSec);
		const settingsText = composerSettingsText$1();
		if (settingsText.includes(`${flowDuration} giây`) || settingsText.includes(`${flowDuration} seconds`)) return true;
		const localizedDuration = [
			4,
			6,
			8,
			10
		].find((value) => settingsText.includes(`${value} giây`) || settingsText.includes(`${value} seconds`));
		if (localizedDuration !== void 0 && localizedDuration === flowDuration) return true;
		if (new RegExp(`(^|\\D)${flowDuration}\\s*s(?=\\D|$)`, "i").test(settingsText)) return true;
		return Number(settingsText.match(/(^|\D)(4|6|8|10)\s*s(?=\D|$)/i)?.[2] || 0) === flowDuration;
	}
	function isFlowAgentShellVisible$1() {
		const bodyText = document.body?.innerText || "";
		return /bắt đầu tạo hoặc thả nội dung nghe nhìn|thả nội dung nghe nhìn|start creating or drop media|drop media|thêm thành phần|add component|cài đặt tác nhân|agent settings|hướng dẫn cho tác nhân|agent instructions/i.test(bodyText) && !getComposerSettingsButton$1() && !getComposerSettingsMenu$1();
	}
	async function ensureFlowProjectRoute$1(jobId) {
		const match = location.pathname.match(/^(\/fx\/(?:[^/]+\/)?tools\/flow\/project\/[^/]+)/i);
		if (!match) {
			const shortProject = location.pathname.match(/^(\/project\/[^/]+)(?:\/(?:edit|tool|tool-version)\/[^/]+)?\/?$/i);
			if (shortProject) {
				if (location.pathname !== shortProject[1] || flowIsImageEditorSurface()) {
					activeDeps$3.flowTrace(jobId, "Leaving the Flow image editor and restoring the project composer in the background.", .04, "opening_provider");
					location.assign(`${location.origin}${shortProject[1]}`);
					await activeDeps$3.sleep(6500);
				}
				activeDeps$3.flowTrace(jobId, "Using the authenticated Flow short project route in the background tab.", .04, "opening_provider");
				return true;
			}
			if (/^\/fx\/(?:[^/]+\/)?tools\/flow\/?$/i.test(location.pathname)) return activeDeps$3.openNewFlowProjectComposer(jobId);
			activeDeps$3.reportResult(jobId, "waiting_manual_action", void 0, "Google Flow must be opened on a project URL like /fx/vi/tools/flow/project/... before video automation can run.");
			return false;
		}
		const projectRoot = match[1];
		if (flowIsImageEditorSurface()) {
			activeDeps$3.flowTrace(jobId, "Leaving the Flow image editor and restoring the project composer in the background.", .04, "opening_provider");
			location.assign(`${location.origin}${projectRoot}`);
			await activeDeps$3.sleep(6500);
		}
		if (location.pathname !== projectRoot) {
			activeDeps$3.flowTrace(jobId, `Returning Google Flow from ${location.pathname} to the project workspace before running video automation.`, .04, "opening_provider");
			if (/\/edit\/|\/view\/|\/asset\//i.test(location.pathname)) {
				location.assign(projectRoot);
				await activeDeps$3.sleep(6500);
			} else {
				history.pushState({}, "", projectRoot);
				window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
				await activeDeps$3.sleep(2500);
			}
			if (location.pathname !== projectRoot) {
				location.assign(projectRoot);
				await activeDeps$3.sleep(6500);
			}
		}
		await activeDeps$3.closeMediaPickerIfOpen();
		await activeDeps$3.closeTransientFlowOverlays(jobId);
		return true;
	}
	async function openComposerSettingsMenu$1(jobId) {
		const openMenu = getComposerSettingsMenu$1();
		if (openMenu) return openMenu;
		const button = getComposerSettingsButton$1();
		if (!button) return null;
		activeDeps$3.flowTrace(jobId, `Opening Flow composer video controls (${activeDeps$3.compactText(activeDeps$3.visibleText(button), 80)}).`);
		await activeDeps$3.clickVisibleElement(button);
		return getComposerSettingsMenu$1();
	}
	async function ensureFlowVideoComposerMode$1(jobId) {
		if (composerShowsVideoMode$1()) {
			activeDeps$3.flowTrace(jobId, `Flow composer is already in Video mode (${activeDeps$3.compactText(composerSettingsText$1(), 80)}).`);
			return true;
		}
		for (let attempt = 0; attempt < 3; attempt++) {
			const menu = await openComposerSettingsMenu$1(jobId);
			if (!menu) {
				await activeDeps$3.humanPause(450, 850);
				continue;
			}
			const videoResult = await activeDeps$3.clickVisibleText([/^video$/i, /(^|\s)video$/i], menu);
			if (videoResult.ok) {
				activeDeps$3.flowTrace(jobId, `Flow composer switched to Video tab (${videoResult.text || "Video"}).`);
				await activeDeps$3.humanPause(700, 1200);
				if (composerShowsVideoMode$1()) return true;
			}
			const videoTab = Array.from(menu.querySelectorAll("button, [role='button'], [role='tab'], label")).filter(activeDeps$3.isVisible).find((element) => /(^|\s)video$/i.test(activeDeps$3.normalizedFlowControlText(element)) || /video$/i.test(activeDeps$3.visibleText(element).replace(/\s+/g, " ").trim()));
			if (videoTab) {
				activeDeps$3.simulateClick(videoTab);
				activeDeps$3.flowTrace(jobId, `Flow composer switched to Video tab via direct tab selector (${activeDeps$3.compactText(activeDeps$3.visibleText(videoTab), 40)}).`);
				await activeDeps$3.humanPause(700, 1200);
				if (composerShowsVideoMode$1()) return true;
			}
		}
		console.warn(`[Studio][Flow][${jobId}] Flow composer Video tab was not found.`, activeDeps$3.flowDebugSnapshot());
		return false;
	}
	function composerShowsImageMode$1() {
		const trigger = getComposerSettingsButton$1();
		const text = trigger ? activeDeps$3.visibleText(trigger) : "";
		const nativeTrigger = Array.from(document.querySelectorAll("button.settings-trigger-button, button[aria-label*='cài đặt' i], button[aria-label*='settings' i]")).filter((button) => activeDeps$3.isVisible(button)).at(-1);
		const visible = `${nativeTrigger ? activeDeps$3.visibleText(nativeTrigger).replace(/\s+/g, " ").trim() : ""} ${text}`;
		return /nano\s+banana|hình ảnh|\bimage\b/i.test(visible) && !/(^|\s)video(\s|·|$)|\bveo\b/i.test(visible);
	}
	async function ensureFlowImageComposerMode$1(jobId) {
		if (composerShowsImageMode$1()) {
			activeDeps$3.flowTrace(jobId, `Flow composer is already in Image mode (${activeDeps$3.compactText(composerSettingsText$1(), 80)}).`);
			return true;
		}
		for (let attempt = 0; attempt < 3; attempt++) {
			const menu = await openComposerSettingsMenu$1(jobId);
			if (!menu) {
				await activeDeps$3.humanPause(450, 850);
				continue;
			}
			const imageResult = await activeDeps$3.clickVisibleText([
				/^hình ảnh$/i,
				/^image$/i,
				/nano\s+banana/i
			], menu);
			if (imageResult.ok) {
				activeDeps$3.flowTrace(jobId, `Flow composer switched to Image tab (${imageResult.text || "Image"}).`);
				await activeDeps$3.humanPause(700, 1200);
				if (composerShowsImageMode$1()) return true;
			}
		}
		console.warn(`[Studio][Flow][${jobId}] Flow composer Image tab was not found.`, activeDeps$3.flowDebugSnapshot());
		return false;
	}
	async function closeFlowSettingsPanelIfOpenUnbounded(jobId) {
		if (getComposerSettingsMenu$1()) {
			const trigger = getComposerSettingsButton$1();
			if (trigger) {
				activeDeps$3.flowTrace(jobId, "Closing the open Flow composer settings menu before prompt input...");
				await activeDeps$3.clickElementNative(trigger);
				await activeDeps$3.humanPause(350, 650);
				if (getComposerSettingsMenu$1()) {
					trigger.click();
					await activeDeps$3.humanPause(250, 450);
				}
			}
			if (getComposerSettingsMenu$1()) {
				document.dispatchEvent(new KeyboardEvent("keydown", {
					key: "Escape",
					bubbles: true
				}));
				document.body.dispatchEvent(new KeyboardEvent("keydown", {
					key: "Escape",
					bubbles: true
				}));
				await activeDeps$3.humanPause(350, 650);
			}
			if (getComposerSettingsMenu$1()) {
				const editor = activeDeps$3.activeFlowPromptEditor?.();
				if (editor) {
					await activeDeps$3.clickElementNative(editor);
					await activeDeps$3.humanPause(250, 450);
				}
			}
			if (getComposerSettingsMenu$1() && activeDeps$3.runFlowMainWorldAction) {
				await activeDeps$3.runFlowMainWorldAction("close-settings-menu");
				await activeDeps$3.humanPause(250, 450);
			}
		}
		const panel = getActiveSettingsPanel$1();
		if (!panel) return;
		activeDeps$3.flowTrace(jobId, "Closing open Flow settings panel before continuing...");
		if ((await activeDeps$3.clickVisibleText([/^lưu$/i, /^save$/i], panel)).ok) {
			await activeDeps$3.humanPause(700, 1200);
			if (!getActiveSettingsPanel$1()) return;
		}
		const rightSideButtons = Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => {
			const rect = button.getBoundingClientRect();
			return activeDeps$3.isVisible(button) && rect.left > window.innerWidth * .55;
		});
		const closeButton = rightSideButtons.find((button) => /quay lại|back|đóng|close|^x$/i.test(activeDeps$3.visibleText(button))) || rightSideButtons.find((button) => {
			const label = activeDeps$3.visibleText(button);
			const iconText = (button.querySelector("svg")?.textContent || "").trim();
			return /arrow_back|chevron_left|close/i.test(label + " " + iconText);
		});
		if (closeButton) {
			activeDeps$3.simulateClick(closeButton);
			await activeDeps$3.humanPause(650, 1e3);
		}
		if (getActiveSettingsPanel$1()) {
			document.dispatchEvent(new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true
			}));
			document.body.dispatchEvent(new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true
			}));
			await activeDeps$3.humanPause(650, 1e3);
		}
	}
	async function closeFlowSettingsPanelIfOpen$1(jobId) {
		let timer;
		try {
			await Promise.race([closeFlowSettingsPanelIfOpenUnbounded(jobId), new Promise((resolve) => {
				timer = setTimeout(resolve, 8e3);
			})]);
			if (timer) clearTimeout(timer);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
	async function ensureFlowAgentModeOff$1(jobId) {
		const agentButtons = Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => activeDeps$3.isVisible(button) && /^(tác nhân|agent)$/i.test(activeDeps$3.visibleText(button).replace(/\s+/g, " ").trim()));
		const agentButton = agentButtons.find((button) => button.hasAttribute("aria-pressed") || button.hasAttribute("aria-selected")) || agentButtons.at(-1);
		if (!agentButton) return;
		const stateText = [
			agentButton.getAttribute("aria-pressed"),
			agentButton.getAttribute("aria-selected"),
			agentButton.getAttribute("data-state"),
			agentButton.getAttribute("aria-expanded"),
			agentButton.className
		].filter(Boolean).join(" ");
		if (!isFlowAgentShellVisible$1() && !/true|checked|selected|active|open/i.test(stateText)) return;
		activeDeps$3.flowTrace(jobId, "Flow agent mode is enabled; switching it off before running the classic composer automation.", .12);
		await activeDeps$3.clickElementNative(agentButton);
		await activeDeps$3.humanPause(700, 1200);
		const startedAt = Date.now();
		while (Date.now() - startedAt < 5e3 && isFlowAgentShellVisible$1()) await activeDeps$3.sleep(200);
	}
	async function clickByIdSuffix$1(suffix, scope = document) {
		const escaped = suffix.replace(/"/g, "\\\"");
		const match = Array.from(scope.querySelectorAll(`button[id$="-trigger-${escaped}"], [role="button"][id$="-trigger-${escaped}"]`)).filter(activeDeps$3.isVisible).at(-1);
		if (!match) return { ok: false };
		await activeDeps$3.clickElementNative(match);
		await activeDeps$3.humanPause();
		return {
			ok: true,
			via: `id:${suffix}`,
			text: activeDeps$3.compactText(activeDeps$3.visibleText(match), 90)
		};
	}
	async function clickInComposerSettings$1(jobId, label, patterns, retryCount = 3, suffixes = []) {
		for (let attempt = 0; attempt < retryCount; attempt++) {
			const menu = await openComposerSettingsMenu$1(jobId);
			if (menu) {
				for (const suffix of suffixes) {
					const suffixResult = await clickByIdSuffix$1(suffix, menu);
					if (suffixResult.ok) {
						activeDeps$3.flowTrace(jobId, `Flow composer setting "${label}" clicked via ${suffixResult.via}${suffixResult.text ? ` (${suffixResult.text})` : ""}.`);
						return suffixResult;
					}
				}
				const scopedResult = await activeDeps$3.clickVisibleText(patterns, menu);
				if (scopedResult.ok) {
					activeDeps$3.flowTrace(jobId, `Flow composer setting "${label}" clicked via ${scopedResult.via}${scopedResult.text ? ` (${scopedResult.text})` : ""}.`);
					return scopedResult;
				}
			}
			await activeDeps$3.humanPause(450, 850);
		}
		console.warn(`[Studio][Flow][${jobId}] Flow composer setting "${label}" was not found.`, activeDeps$3.flowDebugSnapshot());
		return { ok: false };
	}
	async function clickInComposerSettingsBounded$1(jobId, label, patterns, retryCount = 2, suffixes = [], timeoutMs = 8e3) {
		const result = await activeDeps$3.withTimeout(clickInComposerSettings$1(jobId, label, patterns, retryCount, suffixes), timeoutMs, {
			ok: false,
			via: "timeout"
		});
		if (!result.ok && result.via === "timeout") activeDeps$3.flowTrace(jobId, `Flow composer setting "${label}" timed out; continuing with visible composer state.`, .18);
		return result;
	}
	function createFlowComposerDom(deps) {
		activeDeps$3 = deps;
		return {
			getActiveSettingsPanel: getActiveSettingsPanel$1,
			getComposerSettingsMenu: getComposerSettingsMenu$1,
			getComposerSettingsButton: getComposerSettingsButton$1,
			composerSettingsText: composerSettingsText$1,
			composerShowsVideoMode: composerShowsVideoMode$1,
			composerShowsImageMode: composerShowsImageMode$1,
			composerShowsAspectRatio: composerShowsAspectRatio$1,
			composerShowsDuration: composerShowsDuration$1,
			isFlowAgentShellVisible: isFlowAgentShellVisible$1,
			ensureFlowProjectRoute: ensureFlowProjectRoute$1,
			openComposerSettingsMenu: openComposerSettingsMenu$1,
			ensureFlowVideoComposerMode: ensureFlowVideoComposerMode$1,
			ensureFlowImageComposerMode: ensureFlowImageComposerMode$1,
			closeFlowSettingsPanelIfOpen: closeFlowSettingsPanelIfOpen$1,
			ensureFlowAgentModeOff: ensureFlowAgentModeOff$1,
			clickByIdSuffix: clickByIdSuffix$1,
			clickInComposerSettings: clickInComposerSettings$1,
			clickInComposerSettingsBounded: clickInComposerSettingsBounded$1
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-composer-surface.ts
	function flowPromptEditorCandidates(deps) {
		return Array.from(document.querySelectorAll("[data-slate-editor=\"true\"], [contenteditable=\"true\"], [role=\"textbox\"], textarea")).filter((element) => {
			if (!deps.isVisible(element)) return false;
			const rect = element.getBoundingClientRect();
			const textHints = [
				element.getAttribute("aria-label"),
				element.getAttribute("placeholder"),
				element.getAttribute("data-placeholder"),
				element.getAttribute("data-testid"),
				element.id,
				element.className
			].filter(Boolean).join(" ");
			const dialog = element.closest("[role=\"dialog\"], [data-state=\"open\"]");
			if (/search|tìm kiếm|title|tiêu đề|filter|lọc/i.test(textHints)) return false;
			if (dialog?.innerText?.match(/thêm vào câu lệnh|add to prompt|tìm kiếm thành phần|search assets/i)) return false;
			return promptEditorGeometryFits(rect) || element.classList.contains("ProseMirror") && proseMirrorComposerGeometryFits(rect);
		});
	}
	function proseMirrorComposerGeometryFits(rect) {
		return rect.width >= 300 && rect.width <= 900 && rect.height >= 70 && rect.height <= Math.min(900, window.innerHeight) && rect.bottom > window.innerHeight * .45;
	}
	function promptEditorGeometryFits(rect) {
		return rect.width >= 120 && rect.height >= 8 && rect.height <= Math.min(720, window.innerHeight * .75) && rect.top > window.innerHeight * .45 && rect.top < window.innerHeight;
	}
	function activeFlowPromptEditor$1(deps) {
		const candidates = flowPromptEditorCandidates(deps);
		const visibleSlateEditors = Array.from(document.querySelectorAll("[data-slate-editor=\"true\"]")).filter((element) => deps.isVisible(element) && promptEditorGeometryFits(element.getBoundingClientRect())).filter((element) => !element.closest("[role=\"dialog\"], [role=\"menu\"], [role=\"listbox\"]"));
		if (visibleSlateEditors.length > 0) return visibleSlateEditors.sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0];
		return candidates.map((element) => {
			const rect = element.getBoundingClientRect();
			const hint = [
				element.getAttribute("aria-label"),
				element.getAttribute("placeholder"),
				element.getAttribute("data-placeholder"),
				element.textContent
			].filter(Boolean).join(" ");
			const bottom = rect.bottom > window.innerHeight * .45 ? 40 : 0;
			const proseMirror = element.classList.contains("ProseMirror") ? 60 : 0;
			const promptHint = /bạn muốn tạo gì|what do you want|prompt|describe|create|tạo gì/i.test(hint) ? 35 : 0;
			const wide = rect.width > 240 ? 15 : 0;
			const content = deps.flowEditableText(element).trim().length > 0 ? 8 : 0;
			return {
				element,
				score: proseMirror + bottom + promptHint + wide + content + rect.bottom / Math.max(1, window.innerHeight) * 20
			};
		}).sort((a, b) => b.score - a.score)[0]?.element || null;
	}
	function getComposerRoot$1(deps) {
		const textbox = Array.from(document.querySelectorAll("[role=\"textbox\"], [contenteditable=\"true\"], textarea")).filter((element) => isComposerRootTextbox(element, deps)).at(-1);
		let node = textbox?.parentElement || null;
		let best = null;
		while (node && node !== document.body) {
			const rect = node.getBoundingClientRect();
			if (rect.top > window.innerHeight * .4 && rect.width >= 300 && rect.width <= Math.min(820, window.innerWidth * .78) && rect.height >= 70 && rect.height <= Math.min(560, window.innerHeight * .7)) best = node;
			node = node.parentElement;
		}
		return best || textbox?.parentElement || null;
	}
	function isComposerRootTextbox(element, deps) {
		const rect = element.getBoundingClientRect();
		const dialog = element.closest("[role=\"dialog\"], [data-state=\"open\"]");
		return deps.isVisible(element) && promptEditorGeometryFits(rect) && !dialog?.innerText?.match(/thêm vào câu lệnh|add to prompt|tìm kiếm thành phần|search assets/i);
	}
	function composerPanelRoot$1(deps) {
		const textbox = activeFlowPromptEditor$1(deps);
		if (!textbox || !deps.isVisible(textbox)) return getComposerRoot$1(deps);
		let node = textbox.parentElement;
		let best = null;
		while (node && node !== document.body) {
			const rect = node.getBoundingClientRect();
			const text = deps.visibleText(node);
			const hasComposerControls = /tác nhân|agent|video|image|hình ảnh|khung hình|thành phần|component|1x|2x|4s|6s|8s|10s/i.test(text);
			if (rect.top > window.innerHeight * .42 && rect.width >= 320 && rect.height >= 70 && rect.height <= Math.min(680, window.innerHeight * .62) && hasComposerControls) best = node;
			node = node.parentElement;
		}
		return best || getComposerRoot$1(deps);
	}
	function attachmentGeometryFits(rect, rootRect) {
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		return rect.width > 36 && rect.height > 36 && rect.width <= Math.min(220, rootRect.width * .45) && rect.height <= Math.min(180, rootRect.height * .7) && rect.top >= rootRect.top - 8 && rect.bottom <= rootRect.bottom + 8 && rect.top >= window.innerHeight * .45 && centerX >= rootRect.left - 8 && centerX <= rootRect.right + 8 && centerY >= rootRect.top - 8 && centerY <= rootRect.bottom + 8;
	}
	function attachmentTileFits(element, rootRect) {
		const tileRect = element.closest("[data-tile-id]")?.getBoundingClientRect();
		return !tileRect || tileRect.width <= Math.min(260, rootRect.width * .5) && tileRect.height <= Math.min(220, rootRect.height * .75);
	}
	function elementLooksLikeComposerAttachment(element, root, deps) {
		if (!deps.isVisible(element) || element.closest("[role=\"dialog\"], [role=\"listbox\"], [data-radix-popper-content-wrapper]")) return false;
		const rootRect = root.getBoundingClientRect();
		return attachmentGeometryFits(element.getBoundingClientRect(), rootRect) && attachmentTileFits(element, rootRect);
	}
	function promptAttachmentElements$1(deps) {
		const composerRoot = composerPanelRoot$1(deps);
		if (!composerRoot) return [];
		const directRefs = Array.from(composerRoot.querySelectorAll("[data-slate-editor=\"true\"] img:not(.ProseMirror-separator), [contenteditable=\"true\"] img:not(.ProseMirror-separator), .prompt-ref, [data-ref-image], img[alt*=\"nội dung nghe nhìn\" i], img[alt*=\"media\" i]")).filter((element) => elementLooksLikeComposerAttachment(element, composerRoot, deps));
		const composerRefs = Array.from(composerRoot.querySelectorAll("img, video, canvas, [data-tile-id], [style*='background-image']")).filter((element) => elementLooksLikeComposerAttachment(element, composerRoot, deps));
		return Array.from(new Set([...directRefs, ...composerRefs]));
	}
	function createFlowComposerSurface(deps) {
		return {
			activeFlowPromptEditor: () => activeFlowPromptEditor$1(deps),
			getComposerRoot: () => getComposerRoot$1(deps),
			composerPanelRoot: () => composerPanelRoot$1(deps),
			promptAttachmentElements: () => promptAttachmentElements$1(deps),
			promptAttachmentCount: () => promptAttachmentElements$1(deps).length
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-reference-search.ts
	var activeDeps$2;
	function referenceTileGeometryLooksScoped$1(tile) {
		if (!activeDeps$2.isVisible(tile)) return false;
		const rect = tile.getBoundingClientRect();
		return activeDeps$2.referenceGeometryIsScoped(rect, {
			width: window.innerWidth,
			height: window.innerHeight
		});
	}
	function containsReferenceToken$1(reference, element) {
		const tokens = activeDeps$2.referenceSearchTokens(reference);
		if (!tokens.length) return false;
		const searchText = tileSearchText$1(element);
		const visible = activeDeps$2.normalizedToken(activeDeps$2.visibleText(element));
		return tokens.some((token) => searchText.includes(token) || visible.includes(token));
	}
	function referenceMediaTileCandidates$1(reference, root = document) {
		if (!activeDeps$2.referenceSearchTokens(reference).length) return [];
		return smallestReferenceCandidates$1(reference, referenceMediaElements$1(root).map((element) => {
			if (element instanceof HTMLImageElement) return activeDeps$2.flowImageTileRoot(element);
			return element.closest("[data-tile-id], listboxoption, [role='option'], button, [role='button'], a") || element;
		}).filter((element, index, list) => list.indexOf(element) === index).filter((element) => isReferenceMediaCandidate$1(reference, element))).sort(compareReferenceCandidates$1);
	}
	function referenceMediaElements$1(root) {
		return Array.from(root.querySelectorAll("[data-tile-id], listboxoption, [role='option'], button, [role='button'], a, img"));
	}
	function isReferenceMediaCandidate$1(reference, element) {
		return referenceTileGeometryLooksScoped$1(element) && containsReferenceToken$1(reference, element) && (activeDeps$2.tileMediaUrls(element).length > 0 || Boolean(element.querySelector("img, video, canvas, [style*='background-image']")));
	}
	function smallestReferenceCandidates$1(reference, candidates) {
		return candidates.filter((candidate) => {
			const candidateArea = candidate.getBoundingClientRect().width * candidate.getBoundingClientRect().height;
			return !candidates.some((other) => {
				if (other === candidate || !candidate.contains(other)) return false;
				const otherRect = other.getBoundingClientRect();
				const otherArea = otherRect.width * otherRect.height;
				return otherArea > 0 && otherArea < candidateArea && containsReferenceToken$1(reference, other);
			});
		});
	}
	function compareReferenceCandidates$1(left, right) {
		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();
		const leftHasTileId = left.dataset.tileId ? 0 : 1;
		const rightHasTileId = right.dataset.tileId ? 0 : 1;
		const leftArea = leftRect.width * leftRect.height;
		const rightArea = rightRect.width * rightRect.height;
		return leftHasTileId - rightHasTileId || leftArea - rightArea || leftRect.top - rightRect.top || leftRect.left - rightRect.left;
	}
	function tileMatchesReference$1(reference, tile) {
		if (!reference || !tile) return false;
		if (!referenceTileGeometryLooksScoped$1(tile)) return false;
		return containsReferenceToken$1(reference, tile);
	}
	function exactReferenceOptionInOpenPicker$1(reference) {
		const requiredFilename = (reference?.filename || "").trim().toLowerCase();
		const tokens = activeDeps$2.referenceSearchTokens(reference);
		if (!requiredFilename && !tokens.length) return null;
		const matches = activeDeps$2.mediaPickerDialogs().flatMap((picker) => activeDeps$2.mediaPickerReferenceOptions(picker)).filter((option) => {
			const rawLabel = [option.innerText || "", ...Array.from(option.querySelectorAll("img")).map((image) => image.alt || "")].join(" ").trim().toLowerCase();
			if (requiredFilename && rawLabel.includes(requiredFilename)) return true;
			const labels = [rawLabel].map(activeDeps$2.normalizedToken).filter(Boolean);
			return tokens.some((token) => labels.some((label) => label === token || label.includes(token)));
		});
		return matches.length === 1 ? matches[0] : null;
	}
	var imageFingerprintCache = /* @__PURE__ */ new Map();
	function loadComparableImage$1(src) {
		return new Promise((resolve, reject) => {
			const image = new Image();
			const timeout = window.setTimeout(() => {
				image.onload = null;
				image.onerror = null;
				reject(/* @__PURE__ */ new Error("Image timed out while loading for Flow visual matching."));
			}, 3500);
			image.crossOrigin = "anonymous";
			image.onload = () => {
				window.clearTimeout(timeout);
				resolve(image);
			};
			image.onerror = () => {
				window.clearTimeout(timeout);
				reject(/* @__PURE__ */ new Error("Image did not load for Flow visual matching."));
			};
			image.src = src;
		});
	}
	async function imageFingerprint$1(src) {
		if (!src) return null;
		if (imageFingerprintCache.has(src)) return imageFingerprintCache.get(src) || null;
		try {
			const image = await loadComparableImage$1(src);
			const width = 24;
			const height = 24;
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) return null;
			context.drawImage(image, 0, 0, width, height);
			const data = context.getImageData(0, 0, width, height).data;
			const values = [];
			for (let index = 0; index < data.length; index += 4) values.push(Math.round((data[index] + data[index + 1] + data[index + 2]) / 3));
			const fingerprint = {
				width,
				height,
				values
			};
			imageFingerprintCache.set(src, fingerprint);
			return fingerprint;
		} catch {
			imageFingerprintCache.set(src, null);
			return null;
		}
	}
	async function tileVisuallyMatchesReference$1(reference, tile) {
		if (!reference || !tile) return false;
		const referenceData = activeDeps$2.referenceDataUrl(reference);
		if (!referenceData) return false;
		const image = tile instanceof HTMLImageElement ? tile : tile.querySelector("img");
		const tileSrc = image?.currentSrc || image?.src || "";
		if (!tileSrc) return false;
		const [referenceFingerprintValue, tileFingerprintValue] = await Promise.all([imageFingerprint$1(referenceData), imageFingerprint$1(tileSrc)]);
		if (!referenceFingerprintValue || !tileFingerprintValue) return false;
		return activeDeps$2.compareImageFingerprints(referenceFingerprintValue, tileFingerprintValue) < .055;
	}
	function tileSearchText$1(tile) {
		const parts = [
			tile.innerText || "",
			tile.getAttribute("aria-label") || "",
			tile.getAttribute("title") || "",
			tile.dataset.tileId || ""
		];
		tile.querySelectorAll("img, a, video, source").forEach((element) => {
			parts.push(element.getAttribute("alt") || "");
			parts.push(element.getAttribute("title") || "");
			parts.push(element.getAttribute("aria-label") || "");
			parts.push(element.src || "");
			parts.push(element.href || "");
		});
		return parts.map(activeDeps$2.normalizedToken).join(" ");
	}
	function findExistingUploadedReferenceTile$1(reference) {
		const fingerprint = activeDeps$2.referenceFingerprint(reference);
		if (fingerprint) {
			const cached = activeDeps$2.readFlowReferenceCache()[fingerprint];
			if (cached?.tileId) {
				const cachedTile = document.querySelector(`[data-tile-id="${CSS.escape(cached.tileId)}"]`);
				if (cachedTile && activeDeps$2.visibleReadyImageTiles().includes(cachedTile) && tileMatchesReference$1(reference, cachedTile)) return cachedTile;
			}
		}
		const tiles = activeDeps$2.visibleReadyImageTiles();
		const exactTiles = referenceMediaTileCandidates$1(reference);
		return tiles.find((tile) => exactTiles.includes(tile) || containsReferenceToken$1(reference, tile)) || null;
	}
	async function findExistingUploadedReferenceTileByVisual$1(jobId, reference) {
		if (!reference) return null;
		const visibleCandidates = activeDeps$2.visibleReadyImageTiles();
		const hydratedCandidates = Array.from(document.querySelectorAll("img[src]")).filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.getBoundingClientRect().width > 72).map((image) => image.closest("[data-tile-id], listboxoption, button, [role='button'], a") || image).filter((tile, index, list) => list.indexOf(tile) === index);
		const candidates = [...visibleCandidates, ...hydratedCandidates].filter((tile, index, list) => list.indexOf(tile) === index).slice(0, 128);
		const labelOnlyCandidates = candidates.filter((tile) => activeDeps$2.tileMediaUrls(tile).length === 0 && !tile.querySelector("img[src], video[src], canvas, [style*='background-image']"));
		if (labelOnlyCandidates.length) await revealReadyImageTileLabels$1(labelOnlyCandidates.slice(0, 8));
		const textMatches = candidates.filter((tile) => tileMatchesReference$1(reference, tile));
		if (textMatches.length === 1) {
			const textMatched = textMatches[0];
			activeDeps$2.flowTrace(jobId, `Matched existing Flow media tile by revealed label for ${activeDeps$2.referenceRequiredLabel(reference)}.`, .34);
			activeDeps$2.rememberFlowTileForReference(reference, textMatched);
			return textMatched;
		}
		const visualCandidates = textMatches.length > 1 ? textMatches : candidates;
		for (let offset = 0; offset < visualCandidates.length; offset += 8) {
			const batch = visualCandidates.slice(offset, offset + 8);
			const visualMatch = (await Promise.all(batch.map(async (tile) => ({
				tile,
				matched: await tileVisuallyMatchesReference$1(reference, tile)
			})))).find((entry) => entry.matched)?.tile;
			if (visualMatch) {
				activeDeps$2.flowTrace(jobId, `Matched existing Flow media tile visually for ${activeDeps$2.referenceRequiredLabel(reference)}.`, .34);
				activeDeps$2.rememberFlowTileForReference(reference, visualMatch);
				return visualMatch;
			}
		}
		return null;
	}
	async function revealReadyImageTileLabels$1(tiles) {
		for (const tile of tiles) {
			const target = tile.querySelector("img, button, [role='button'], a") || tile;
			const rect = target.getBoundingClientRect();
			const clientX = rect.left + rect.width / 2;
			const clientY = rect.top + rect.height / 2;
			for (const element of [tile, target]) {
				element.dispatchEvent(new PointerEvent("pointermove", {
					bubbles: true,
					cancelable: true,
					clientX,
					clientY,
					pointerType: "mouse"
				}));
				element.dispatchEvent(new MouseEvent("mouseover", {
					bubbles: true,
					cancelable: true,
					clientX,
					clientY
				}));
				element.dispatchEvent(new MouseEvent("mouseenter", {
					bubbles: true,
					cancelable: true,
					clientX,
					clientY
				}));
			}
			await activeDeps$2.sleep(420);
		}
	}
	function createFlowReferenceSearch(deps) {
		activeDeps$2 = deps;
		return {
			referenceTileGeometryLooksScoped: referenceTileGeometryLooksScoped$1,
			containsReferenceToken: containsReferenceToken$1,
			referenceMediaTileCandidates: referenceMediaTileCandidates$1,
			referenceMediaElements: referenceMediaElements$1,
			isReferenceMediaCandidate: isReferenceMediaCandidate$1,
			smallestReferenceCandidates: smallestReferenceCandidates$1,
			compareReferenceCandidates: compareReferenceCandidates$1,
			tileMatchesReference: tileMatchesReference$1,
			exactReferenceOptionInOpenPicker: exactReferenceOptionInOpenPicker$1,
			loadComparableImage: loadComparableImage$1,
			imageFingerprint: imageFingerprint$1,
			tileVisuallyMatchesReference: tileVisuallyMatchesReference$1,
			tileSearchText: tileSearchText$1,
			findExistingUploadedReferenceTile: findExistingUploadedReferenceTile$1,
			findExistingUploadedReferenceTileByVisual: findExistingUploadedReferenceTileByVisual$1,
			revealReadyImageTileLabels: revealReadyImageTileLabels$1
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-native-input.ts
	var lastNativeMouseClickDiagnostic$1 = "";
	var activeDeps$1;
	async function requestTobyFlowTextInsert$1(text) {
		try {
			const response = await Promise.race([chrome.runtime.sendMessage({
				source: "google-flow-adapter",
				type: "TOBY_FLOW_INSERT_TEXT",
				text
			}), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("TobyFlow text insertion timed out after 5s.")), 5e3))]);
			return response?.ok === true && response?.value === true;
		} catch {
			return false;
		}
	}
	async function requestTobyFlowSubmit$1() {
		const requestId = `studio_toby_submit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
		return new Promise((resolve) => {
			let settled = false;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				window.removeEventListener("message", onMessage);
				resolve(value);
			};
			const onMessage = (event) => {
				if (event.source !== window || event.data?.source !== "flow-auto-slate-result" || event.data.requestId !== requestId) return;
				finish(event.data.success === true);
			};
			window.addEventListener("message", onMessage);
			window.postMessage({
				source: "flow-auto-slate",
				action: "clickSubmit",
				requestId,
				iconSelector: ""
			}, window.location.origin);
			window.setTimeout(() => finish(false), 5e3);
		});
	}
	async function waitForFileInput$1(jobId, timeoutMs = 8e3, root = document) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const pageError = activeDeps$1.flowPageErrorText();
			if (pageError) {
				activeDeps$1.flowTrace(jobId || "unknown", "Google Flow crashed while searching for the upload input; reloading the project tab before failing this attempt.", .31);
				try {
					location.reload();
				} catch {}
				if (jobId) activeDeps$1.reportResult(jobId, "failed_retryable", void 0, `${pageError} ${activeDeps$1.flowDebugSnapshot()}`);
				return null;
			}
			const scopedInputs = Array.from(root.querySelectorAll(activeDeps$1.SELECTORS.fileInput.join(",")));
			const inputs = (scopedInputs.length ? scopedInputs : Array.from(document.querySelectorAll(activeDeps$1.SELECTORS.fileInput.join(",")))).filter((input) => {
				const accept = input.getAttribute("accept") || "";
				return !accept || /image|\*/i.test(accept);
			});
			const input = inputs.find((candidate) => /image/i.test(candidate.getAttribute("accept") || "")) || inputs.at(-1) || null;
			if (input) return input;
			await activeDeps$1.sleep(500);
		}
		return null;
	}
	async function requestNativeMouseClick$1(clientX, clientY, expectedText = "", confirmIfUnchanged = false) {
		try {
			const response = await Promise.race([chrome.runtime.sendMessage({
				source: "google-flow-adapter",
				type: "NATIVE_MOUSE_CLICK",
				x: clientX,
				y: clientY,
				expectedText,
				confirmIfUnchanged
			}), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("Native Flow mouse click timed out after 5s.")), 5e3))]);
			if (response?.ok) {
				const detail = response.value;
				lastNativeMouseClickDiagnostic$1 = `${detail?.method || "ok"}${detail?.directError ? `;directError=${detail.directError}` : ""}`;
				return true;
			}
			lastNativeMouseClickDiagnostic$1 = `failed@${Math.round(clientX)},${Math.round(clientY)}:${String(response?.error || "unknown")}`;
			return false;
		} catch (error) {
			lastNativeMouseClickDiagnostic$1 = `threw@${Math.round(clientX)},${Math.round(clientY)}:${error instanceof Error ? error.message : String(error)}`;
			return false;
		}
	}
	async function runFlowMainWorldAction$1(action, value = "") {
		try {
			const response = await Promise.race([chrome.runtime.sendMessage({
				source: "google-flow-adapter",
				type: "MAIN_WORLD_FLOW_ACTION",
				action,
				value
			}), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error(`Main-world Flow action timed out: ${action}`)), 5e3))]);
			lastNativeMouseClickDiagnostic$1 = response?.ok ? `main-world-action-ok:${action}` : `main-world-action-failed:${action}:${String(response?.error || "unknown")}`;
			return Boolean(response?.ok);
		} catch (error) {
			lastNativeMouseClickDiagnostic$1 = `main-world-action-threw:${action}:${error instanceof Error ? error.message : String(error)}`;
			return false;
		}
	}
	async function clickFlowFrameSlot$1(slot) {
		slot.scrollIntoView({
			block: "center",
			inline: "center"
		});
		const center = activeDeps$1.elementCenter(slot);
		const target = document.elementFromPoint(center.clientX, center.clientY) || slot;
		if (await clickElementNative$1(target)) return;
		if (target !== slot) await clickElementNative$1(slot);
	}
	async function clickElementNative$1(element) {
		element.scrollIntoView({
			block: "center",
			inline: "center"
		});
		await activeDeps$1.sleep(80);
		const center = activeDeps$1.elementCenter(element);
		const target = document.elementFromPoint(center.clientX, center.clientY) || element;
		if (await requestNativeMouseClick$1(center.clientX, center.clientY)) return true;
		activeDeps$1.simulateClick(target);
		lastNativeMouseClickDiagnostic$1 = `${lastNativeMouseClickDiagnostic$1}; one DOM fallback dispatched`;
		return true;
	}
	async function clickElementCenterNative$1(element) {
		const rect = element.getBoundingClientRect();
		if (await requestNativeMouseClick$1(rect.left + rect.width / 2, rect.top + rect.height / 2)) return true;
		activeDeps$1.simulateClick(element);
		lastNativeMouseClickDiagnostic$1 = `${lastNativeMouseClickDiagnostic$1}; one DOM fallback dispatched`;
		return true;
	}
	async function clickElementStrictNative$1(element, confirmIfUnchanged = false) {
		element.scrollIntoView({
			block: "center",
			inline: "center"
		});
		await activeDeps$1.sleep(120);
		const rect = element.getBoundingClientRect();
		return requestNativeMouseClick$1(rect.left + rect.width / 2, rect.top + rect.height / 2, activeDeps$1.visibleText(element), confirmIfUnchanged);
	}
	async function dispatchReferenceDrop$1(jobId, files) {
		const transfer = new DataTransfer();
		for (const file of files.slice(0, 1)) transfer.items.add(file);
		const targets = [
			...activeDeps$1.flowStartOrEndFrameSlots(),
			activeDeps$1.getComposerRoot(),
			document.querySelector("[role=\"textbox\"], [contenteditable=\"true\"], textarea")
		].filter((element) => Boolean(element && activeDeps$1.isVisible(element)));
		for (const target of targets.slice(0, 5)) {
			const beforePromptCount = activeDeps$1.promptAttachmentCount();
			const beforeFrameCount = activeDeps$1.directFrameAttachmentCount();
			activeDeps$1.flowTrace(jobId, `Trying direct Flow media drop on ${activeDeps$1.compactText(activeDeps$1.visibleText(target), 70) || target.tagName}.`, .38);
			const rect = target.getBoundingClientRect();
			const clientX = rect.left + Math.max(8, Math.min(rect.width - 8, rect.width / 2));
			const clientY = rect.top + Math.max(8, Math.min(rect.height - 8, rect.height / 2));
			for (const type of [
				"dragenter",
				"dragover",
				"drop"
			]) {
				target.dispatchEvent(new DragEvent(type, {
					bubbles: true,
					cancelable: true,
					dataTransfer: transfer,
					clientX,
					clientY
				}));
				await activeDeps$1.sleep(120);
			}
			if (await activeDeps$1.waitForPromptAttachmentIncrease(beforePromptCount, 2500)) return true;
			const startedAt = Date.now();
			while (Date.now() - startedAt < 2500) {
				if (activeDeps$1.directFrameAttachmentCount() > beforeFrameCount || activeDeps$1.composerHasReferenceSource()) {
					activeDeps$1.flowTrace(jobId, "Flow accepted the keyframe directly into the video frame slot.", .48);
					return true;
				}
				await activeDeps$1.sleep(250);
			}
		}
		return false;
	}
	async function dragTileToComposer$1(jobId, tile, beforeAttachmentCount, maxTargets = 8) {
		const source = activeDeps$1.tileDragSource(tile);
		const targets = activeDeps$1.flowComposerDropTargets();
		if (!targets.length) {
			activeDeps$1.flowTrace(jobId, "Flow composer did not expose a visible drop target for the keyframe tile.", .45);
			return false;
		}
		for (const target of targets.slice(0, maxTargets)) {
			const transfer = new DataTransfer();
			activeDeps$1.addTileDataToTransfer(transfer, tile);
			const from = activeDeps$1.elementCenter(source);
			const to = activeDeps$1.elementCenter(target);
			activeDeps$1.flowTrace(jobId, `Dragging keyframe tile into Flow composer target ${target.tagName}@${Math.round(to.clientX)},${Math.round(to.clientY)}.`, .46);
			source.dispatchEvent(new DragEvent("dragstart", {
				bubbles: true,
				cancelable: true,
				dataTransfer: transfer,
				...from
			}));
			activeDeps$1.simulatePointerDrag(source, target);
			for (const type of [
				"dragenter",
				"dragover",
				"drop"
			]) {
				target.dispatchEvent(new DragEvent(type, {
					bubbles: true,
					cancelable: true,
					dataTransfer: transfer,
					...to
				}));
				await activeDeps$1.sleep(180);
			}
			source.dispatchEvent(new DragEvent("dragend", {
				bubbles: true,
				cancelable: true,
				dataTransfer: transfer,
				...to
			}));
			if (await activeDeps$1.waitForPromptAttachmentIncrease(beforeAttachmentCount, 3500) && await activeDeps$1.waitForComposerReference(jobId, 3500)) return true;
			await activeDeps$1.humanPause(350, 650);
		}
		return false;
	}
	function createFlowNativeInput(deps) {
		activeDeps$1 = deps;
		return {
			waitForFileInput: waitForFileInput$1,
			requestNativeMouseClick: requestNativeMouseClick$1,
			requestTobyFlowTextInsert: requestTobyFlowTextInsert$1,
			requestTobyFlowSubmit: requestTobyFlowSubmit$1,
			runFlowMainWorldAction: runFlowMainWorldAction$1,
			clickFlowFrameSlot: clickFlowFrameSlot$1,
			clickElementNative: clickElementNative$1,
			clickElementCenterNative: clickElementCenterNative$1,
			clickElementStrictNative: clickElementStrictNative$1,
			dispatchReferenceDrop: dispatchReferenceDrop$1,
			dragTileToComposer: dragTileToComposer$1
		};
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
	function isFlowCustomToolUrl(value) {
		return Boolean(parse(value));
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-direct-bridge.ts
	function sendSocketMessage(socket, message) {
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		try {
			socket.send(JSON.stringify(message));
		} catch {
			try {
				socket.close();
			} catch {}
		}
	}
	function sendRuntimeMessageSafely(message) {
		try {
			chrome.runtime.sendMessage(message).catch(() => void 0);
		} catch {}
	}
	function parseJob(message) {
		const provider = String(message.provider || "");
		if (provider && ![
			"google-flow",
			"flow",
			"google-flow-web"
		].includes(provider)) return null;
		const jobId = String(message.jobId || "");
		const task = String(message.task || "");
		if (!jobId || !task) return null;
		return {
			jobId,
			prompt: String(message.prompt || ""),
			task,
			settings: message.settings,
			references: message.references
		};
	}
	function bridgeHello(socket, options) {
		if (socket.readyState !== WebSocket.OPEN) return;
		let extensionId = "flow-content";
		try {
			extensionId = chrome.runtime.id || extensionId;
		} catch {}
		sendSocketMessage(socket, {
			type: "EXTENSION_HELLO",
			extensionId: `${extensionId}:content-direct`,
			version: options.extensionVersion,
			providers: ["google-flow"],
			providerVisibility: options.providerVisibility()
		});
	}
	function handleBridgeMessage(event, socket, options) {
		let message;
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (message.type === "PING") return sendSocketMessage(socket, {
			type: "PONG",
			timestamp: Date.now(),
			extensionVersion: options.extensionVersion,
			activeProviders: ["google-flow"],
			providerVisibility: options.providerVisibility()
		});
		if (message.type === "RUN_JOB") {
			const payload = parseJob(message);
			if (payload) options.onRunJob(payload);
			return;
		}
		if (message.type === "CANCEL_JOB") {
			const jobId = String(message.jobId || "");
			if (jobId) options.onCancelJob(jobId);
		}
	}
	function scheduleBridgeReconnect(socket, connect, options) {
		if (options.host.__studioFlowDirectBridgeSocket === socket) options.host.__studioFlowDirectBridgeSocket = null;
		window.clearTimeout(options.host.__studioFlowDirectBridgeReconnectTimer);
		options.host.__studioFlowDirectBridgeReconnectTimer = window.setTimeout(connect, 5e3);
	}
	function createDirectFlowBridge(options) {
		const sendMessage = (message) => sendSocketMessage(options.host.__studioFlowDirectBridgeSocket, message);
		const connect = () => {
			const shortProjectWorkspace = /^\/project\/[^/]+(?:\/edit\/[^/]+)?\/?$/i.test(location.pathname);
			if ((!/\/tools\/flow\/project\//i.test(location.pathname) || isFlowCustomToolUrl(location.href)) && !shortProjectWorkspace) return;
			const existing = options.host.__studioFlowDirectBridgeSocket;
			if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) return;
			const socket = new WebSocket(options.bridgeUrl);
			options.host.__studioFlowDirectBridgeSocket = socket;
			socket.addEventListener("open", () => {
				bridgeHello(socket, options);
				sendRuntimeMessageSafely({
					source: "google-flow-adapter",
					type: "ENSURE_BRIDGE_CONNECTION"
				});
			});
			socket.addEventListener("message", (event) => handleBridgeMessage(event, socket, options));
			const reconnect = () => scheduleBridgeReconnect(socket, connect, options);
			socket.addEventListener("close", reconnect);
			socket.addEventListener("error", reconnect);
		};
		const stop = () => {
			options.host.__studioFlowDirectBridgeSocket?.close();
			options.host.__studioFlowDirectBridgeSocket = null;
			window.clearTimeout(options.host.__studioFlowDirectBridgeReconnectTimer);
		};
		return {
			connect,
			stop,
			sendMessage
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-result-tiles.ts
	function tileLooksBusy$1(tile) {
		const text = tile.innerText || "";
		return /processing|uploading|loading|failed|error|đang tải|đang xử lý|đang tải lên|lỗi|thất bại/i.test(text) || Boolean(tile.querySelector("[role=\"progressbar\"], [aria-busy=\"true\"], progress, .loading, .spinner"));
	}
	function tileHasReadyMedia$1(tile) {
		const image = tile.querySelector("img");
		if (image) return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
		const video = tile.querySelector("video");
		if (video) return video.readyState >= 1;
		return Boolean(tile.querySelector("canvas, svg, [style*='background-image']"));
	}
	function isVisibleReadyImageTile$1(tile, deps) {
		const { imageLooksLikeFlowMedia, isVisible, visibleText } = deps;
		if (!isVisible(tile) || tileLooksBusy$1(tile) || tile.querySelector("video")) return false;
		const image = tile instanceof HTMLImageElement ? tile : tile.querySelector("img");
		if (!image || !imageLooksLikeFlowMedia(image)) return false;
		const rect = tile.getBoundingClientRect();
		if (rect.width < 96 || rect.height < 64) return false;
		if (/hỏi gemini|google dịch|devtools|redux/i.test(visibleText(tile))) return false;
		return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth + 16 && rect.bottom <= window.innerHeight + 16;
	}
	function visibleReadyImageTiles$1(root, deps) {
		const { flowImageTileRoot, tileCandidateScore, tileMediaUrls } = deps;
		const candidates = Array.from(root.querySelectorAll("[data-tile-id], listboxoption, button, [role='button'], a, img")).map((element) => element instanceof HTMLImageElement ? flowImageTileRoot(element) : element).filter((element, index, list) => list.indexOf(element) === index).filter((element) => isVisibleReadyImageTile$1(element, deps));
		const byTileKey = /* @__PURE__ */ new Map();
		for (const tile of candidates) {
			const rect = tile.getBoundingClientRect();
			const mediaKey = tileMediaUrls(tile).join("|");
			const key = tile.dataset.tileId || `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${mediaKey}`;
			const existing = byTileKey.get(key);
			if (!existing || tileCandidateScore(tile) > tileCandidateScore(existing)) byTileKey.set(key, tile);
		}
		return Array.from(byTileKey.values()).sort((a, b) => {
			const rectA = a.getBoundingClientRect();
			const rectB = b.getBoundingClientRect();
			return rectB.width * rectB.height - rectA.width * rectA.height;
		});
	}
	function createFlowResultTileInspector(deps) {
		return {
			tileLooksBusy: tileLooksBusy$1,
			tileHasReadyMedia: tileHasReadyMedia$1,
			isVisibleReadyImageTile: (tile) => isVisibleReadyImageTile$1(tile, deps),
			visibleReadyImageTiles: (root = document) => visibleReadyImageTiles$1(root, deps),
			findVisibleReadyImageTile: () => visibleReadyImageTiles$1(document, deps)[0] || null
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-prompt-editor.ts
	function resolveProseMirrorEditor(deps) {
		return Array.from(document.querySelectorAll(".ProseMirror")).filter((element) => {
			const rect = element.getBoundingClientRect();
			return element.isConnected && rect.width >= 300 && rect.height >= 70 && rect.bottom > window.innerHeight * .45;
		}).sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0] || deps.activeFlowPromptEditor();
	}
	function promptTextMatches$1(text, deps) {
		const editor = resolveProseMirrorEditor(deps) || deps.activeFlowPromptEditor();
		if (!editor) return false;
		const clone = editor.cloneNode(true);
		clone.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
		const actual = deps.promptCompareKey(clone.textContent || deps.flowEditableText(editor));
		const expected = deps.promptCompareKey(text);
		return Boolean(expected && actual === expected);
	}
	function promptMismatchDetail(text, deps) {
		const editor = resolveProseMirrorEditor(deps);
		if (!editor) return "editor=missing";
		const clone = editor.cloneNode(true);
		clone.querySelectorAll(".prosemirror-placeholder, [data-slate-placeholder]").forEach((node) => node.remove());
		const actual = deps.promptCompareKey(clone.textContent || deps.flowEditableText(editor));
		const expected = deps.promptCompareKey(text);
		const rect = editor.getBoundingClientRect();
		return `editor=${editor.className} rect=${Math.round(rect.width)}x${Math.round(rect.height)} actual=${actual.length} expected=${expected.length}`;
	}
	async function clearFlowPromptEditor$1(editor, deps) {
		if (editor.getAttribute("data-slate-editor") === "true") {
			if ((await deps.bridgeCall("clear", void 0, 4e3)).ok) return;
		}
		deps.simulateClick(editor);
		await deps.humanPause(200, 400);
		clearEditorValue(editor, deps);
		await deps.humanPause(250, 500);
	}
	function clearEditorValue(editor, deps) {
		if (editor.getAttribute("data-slate-editor") === "true") return;
		if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
			deps.setNativeInputValue(editor, "");
			deps.dispatchFlowInput(editor, "deleteContentBackward");
			return;
		}
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(editor);
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.execCommand("delete", false);
		editor.textContent = "";
		deps.dispatchFlowInput(editor, "deleteContentBackward");
	}
	async function stagePromptTextViaDom$1(text, clearFirst, deps) {
		let editor = resolveProseMirrorEditor(deps);
		if (!editor) return false;
		const isProseMirror = editor.classList.contains("ProseMirror");
		if (editor.getAttribute("data-slate-editor") === "true") return false;
		editor.focus();
		await deps.humanPause(350, 650);
		if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
			if (clearFirst) deps.setNativeInputValue(editor, "");
			deps.setNativeInputValue(editor, text);
			deps.dispatchFlowInput(editor, "insertText", text);
		} else {
			if (clearFirst) if (isProseMirror) {
				const selection = window.getSelection();
				const range = document.createRange();
				range.selectNodeContents(editor);
				selection?.removeAllRanges();
				selection?.addRange(range);
				document.execCommand("delete", false);
				selection?.removeAllRanges();
				await deps.sleep(100);
				editor = resolveProseMirrorEditor(deps) || editor;
				if (deps.flowEditableText(editor).trim()) {
					editor.focus();
					document.execCommand("selectAll", false);
					document.execCommand("delete", false);
					await deps.sleep(100);
				}
				editor = resolveProseMirrorEditor(deps) || editor;
			} else clearEditorValue(editor, deps);
			if (isProseMirror) {
				const selection = window.getSelection();
				const range = document.createRange();
				range.selectNodeContents(editor);
				range.collapse(false);
				selection?.removeAllRanges();
				selection?.addRange(range);
				document.execCommand("insertText", false, text);
				selection?.removeAllRanges();
				await deps.sleep(150);
				if (promptTextMatches$1(text, deps)) return true;
				await deps.sleep(100);
				return promptTextMatches$1(text, deps);
			}
			document.execCommand("insertText", false, text);
			deps.dispatchFlowInput(editor, "insertText", text);
		}
		await deps.humanPause(650, 1100);
		return promptTextMatches$1(text, deps);
	}
	async function stagePromptTextViaNative$1(text, deps, state) {
		state.lastNativeTextInsertError = "";
		const editor = deps.activeFlowPromptEditor();
		if (!editor) return false;
		editor.scrollIntoView({
			block: "center",
			inline: "center"
		});
		editor.focus({ preventScroll: true });
		deps.simulateClick(editor);
		await deps.sleep(180);
		const center = deps.elementCenter(editor);
		try {
			const response = await Promise.race([chrome.runtime.sendMessage({
				source: "google-flow-adapter",
				type: "NATIVE_INSERT_TEXT",
				x: center.clientX,
				y: center.clientY,
				text,
				focusOnly: false
			}), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("Native Flow text insertion timed out after 8s.")), 8e3))]);
			if (!response?.ok) {
				state.lastNativeTextInsertError = String(response?.error || "Native insert request was rejected.");
				return false;
			}
		} catch (error) {
			state.lastNativeTextInsertError = error instanceof Error ? error.message : String(error);
			return false;
		}
		await deps.humanPause(900, 1400);
		return promptTextMatches$1(text, deps);
	}
	function bridgeResultLabel(result) {
		return result.ok ? result.tier || result.method || "ok" : result.error || "failed";
	}
	async function stagePromptTextViaBridge(text, clearFirst, deps) {
		const clearResult = clearFirst ? await deps.bridgeCall("clear") : {
			ok: true,
			tier: "skipped-after-attachments",
			method: "skipped-after-attachments"
		};
		if (!clearFirst) await deps.humanPause(450, 850);
		const insertResult = await deps.bridgeCall("insert", { text }, 4e3);
		if (clearResult.ok && insertResult.ok) return {
			ok: true,
			method: "bridge",
			tier: insertResult.tier || insertResult.method
		};
		return {
			ok: false,
			method: "none",
			error: `bridge clear=${bridgeResultLabel(clearResult)}, insert=${bridgeResultLabel(insertResult)}`
		};
	}
	function slateInsertionFailure(state) {
		return {
			ok: false,
			method: "none",
			error: `Native text insertion did not update the visible Slate editor${state.lastNativeTextInsertError ? ` (${state.lastNativeTextInsertError})` : ""}; unsafe DOM and React-internal fallbacks were skipped.`
		};
	}
	async function stagePromptText$1(text, options, deps, state) {
		const clearFirst = options.clearFirst ?? true;
		if (deps.activeFlowPromptEditor()?.classList.contains("ProseMirror")) {
			if (promptTextMatches$1(text, deps)) return {
				ok: true,
				method: "dom",
				tier: "existing-prosemirror-text"
			};
			if (clearFirst && await stagePromptTextViaNative$1(text, deps, state)) return {
				ok: true,
				method: "native",
				tier: "cdp-insert-text-prosemirror"
			};
			if (deps.runTobyFlowTextInsert && await deps.runTobyFlowTextInsert(text)) {
				await deps.sleep(250);
				if (promptTextMatches$1(text, deps)) return {
					ok: true,
					method: "dom",
					tier: "tobyflow-execution-context"
				};
			}
			if (await stagePromptTextViaDom$1(text, clearFirst, deps)) return {
				ok: true,
				method: "dom",
				tier: "tobyflow-prosemirror"
			};
			if (deps.runFlowMainWorldAction && await deps.runFlowMainWorldAction("set-prompt", text)) {
				await deps.sleep(250);
				return {
					ok: true,
					method: "dom",
					tier: "main-world-prosemirror"
				};
			}
			return {
				ok: false,
				method: "none",
				error: `TobyFlow ProseMirror insertion did not update the visible editor (${promptMismatchDetail(text, deps)}).`
			};
		}
		if (clearFirst && await stagePromptTextViaNative$1(text, deps, state)) return {
			ok: true,
			method: "native",
			tier: "cdp-insert-text"
		};
		if (deps.activeFlowPromptEditor()?.getAttribute("data-slate-editor") === "true") {
			const bridged = await stagePromptTextViaBridge(text, clearFirst, deps);
			if (bridged.ok && promptTextMatches$1(text, deps)) return bridged;
			return slateInsertionFailure(state);
		}
		if (await stagePromptTextViaDom$1(text, clearFirst, deps)) return {
			ok: true,
			method: "dom",
			tier: "visible-editor"
		};
		return stagePromptTextViaBridge(text, clearFirst, deps);
	}
	async function refreshPromptEditorState$1(deps) {
		const editor = deps.activeFlowPromptEditor();
		if (!editor) return false;
		deps.simulateClick(editor);
		await deps.humanPause(250, 500);
		deps.dispatchFlowInput(editor, "insertText", deps.flowEditableText(editor));
		editor.dispatchEvent(new Event("change", { bubbles: true }));
		await deps.humanPause(600, 1e3);
		return true;
	}
	async function waitForFlowPromptEditor$1(timeoutMs, deps) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const editor = deps.activeFlowPromptEditor();
			if (editor) return editor;
			await deps.sleep(250);
		}
		return null;
	}
	function createFlowPromptEditor(deps) {
		const state = { lastNativeTextInsertError: "" };
		return {
			promptTextMatches: (text) => promptTextMatches$1(text, deps),
			clearFlowPromptEditor: (editor) => clearFlowPromptEditor$1(editor, deps),
			stagePromptTextViaDom: (text, clearFirst) => stagePromptTextViaDom$1(text, clearFirst, deps),
			stagePromptTextViaNative: (text) => stagePromptTextViaNative$1(text, deps, state),
			stagePromptText: (text, options = {}) => stagePromptText$1(text, options, deps, state),
			refreshPromptEditorState: () => refreshPromptEditorState$1(deps),
			waitForFlowPromptEditor: (timeoutMs = 15e3) => waitForFlowPromptEditor$1(timeoutMs, deps)
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-dom-controls.ts
	function createFlowDomControls(deps) {
		const pointerControls = createPointerControls();
		const mediaControls = createMediaControls(deps);
		return {
			...pointerControls,
			...mediaControls,
			...createOverlayControls({
				...deps,
				mediaPickerDialogs: mediaControls.mediaPickerDialogs,
				simulateClick: pointerControls.simulateClick
			})
		};
	}
	function createPointerControls() {
		function simulateClick(element) {
			const target = element;
			target.scrollIntoView({
				block: "center",
				inline: "center"
			});
			const rect = target.getBoundingClientRect();
			const clientX = rect.left + rect.width / 2;
			const clientY = rect.top + rect.height / 2;
			target.dispatchEvent(new PointerEvent("pointerover", {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY,
				pointerType: "mouse"
			}));
			target.dispatchEvent(new MouseEvent("mouseover", {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY
			}));
			target.dispatchEvent(new PointerEvent("pointermove", {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY,
				pointerType: "mouse"
			}));
			target.dispatchEvent(new MouseEvent("mousemove", {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY
			}));
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
				buttons: 0,
				clientX,
				clientY,
				pointerType: "mouse"
			}));
			target.dispatchEvent(new MouseEvent("mouseup", {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons: 0,
				clientX,
				clientY
			}));
			target.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons: 0,
				clientX,
				clientY
			}));
		}
		function elementCenter(element) {
			const rect = element.getBoundingClientRect();
			return {
				clientX: rect.left + rect.width / 2,
				clientY: rect.top + rect.height / 2
			};
		}
		function simulatePointerDrag(source, target) {
			const sourceElement = source;
			const targetElement = target;
			sourceElement.scrollIntoView({
				block: "center",
				inline: "center"
			});
			targetElement.scrollIntoView({
				block: "center",
				inline: "center"
			});
			const from = elementCenter(sourceElement);
			const to = elementCenter(targetElement);
			sourceElement.dispatchEvent(new PointerEvent("pointerover", {
				bubbles: true,
				cancelable: true,
				...from,
				pointerType: "mouse"
			}));
			sourceElement.dispatchEvent(new MouseEvent("mouseover", {
				bubbles: true,
				cancelable: true,
				...from
			}));
			sourceElement.dispatchEvent(new PointerEvent("pointerdown", {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons: 1,
				...from,
				pointerType: "mouse"
			}));
			sourceElement.dispatchEvent(new MouseEvent("mousedown", {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons: 1,
				...from
			}));
			for (let step = 1; step <= 8; step++) {
				const clientX = from.clientX + (to.clientX - from.clientX) * step / 8;
				const clientY = from.clientY + (to.clientY - from.clientY) * step / 8;
				const hoverTarget = document.elementFromPoint(clientX, clientY) || targetElement;
				hoverTarget.dispatchEvent(new PointerEvent("pointermove", {
					bubbles: true,
					cancelable: true,
					buttons: 1,
					clientX,
					clientY,
					pointerType: "mouse"
				}));
				hoverTarget.dispatchEvent(new MouseEvent("mousemove", {
					bubbles: true,
					cancelable: true,
					buttons: 1,
					clientX,
					clientY
				}));
			}
			targetElement.dispatchEvent(new PointerEvent("pointerup", {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons: 0,
				...to,
				pointerType: "mouse"
			}));
			targetElement.dispatchEvent(new MouseEvent("mouseup", {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons: 0,
				...to
			}));
		}
		return {
			simulateClick,
			elementCenter,
			simulatePointerDrag
		};
	}
	function createMediaControls({ isVisible, humanPause }) {
		return {
			mediaPickerDialogs: () => mediaPickerDialogs$1(isVisible),
			mediaUploadMenus: () => mediaUploadMenus$1(isVisible),
			closeMediaPickerIfOpen: () => closeMediaPickerIfOpen$1({
				isVisible,
				humanPause
			})
		};
	}
	function mediaPickerDialogs$1(isVisible) {
		return Array.from(document.querySelectorAll("[role=\"dialog\"], [role=\"listbox\"], .cdk-overlay-pane, [data-radix-popper-content-wrapper], [data-state=\"open\"]")).filter((element) => isMediaPickerDialog(element, isVisible));
	}
	function isMediaPickerDialog(element, isVisible) {
		const text = element.innerText || "";
		const rect = element.getBoundingClientRect();
		const looksLikeWholePage = rect.width > window.innerWidth * .9 && rect.height > window.innerHeight * .75;
		const hasPickerText = /chọn một hình ảnh khung|thêm vào câu lệnh|add to prompt|tìm kiếm thành phần|search assets|tệp tải lên|uploaded files|gần đây|recent/i.test(text);
		const isPromptClearAction = /arrow_forward\s*tạo|create|generate/i.test(text) && /x(?:oá|óa|oa) câu lệnh|clear prompt/i.test(text);
		return isVisible(element) && !looksLikeWholePage && rect.width > 240 && rect.height > 120 && hasPickerText && !isPromptClearAction;
	}
	function mediaUploadMenus$1(isVisible) {
		return Array.from(document.querySelectorAll("[role=\"menu\"], [data-state=\"open\"]")).filter((element) => {
			const rect = element.getBoundingClientRect();
			return isVisible(element) && rect.width >= 120 && rect.height >= 80 && /tải nội dung nghe nhìn lên|upload media|upload/i.test(element.innerText || "");
		});
	}
	async function closeMediaPickerIfOpen$1({ isVisible, humanPause }) {
		if (!mediaPickerDialogs$1(isVisible).length && !mediaUploadMenus$1(isVisible).length) return;
		document.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		await humanPause(450, 850);
	}
	function createOverlayControls({ isVisible, humanPause, visibleText, mediaPickerDialogs, simulateClick }) {
		function findFloatingFlowCloseButtons() {
			return Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => {
				const rect = button.getBoundingClientRect();
				if (rect.width <= 0 || rect.height <= 0) return false;
				return rect.right > window.innerWidth * .65 && rect.top < 90 && /close|đóng/i.test(`${button.getAttribute("aria-label") || ""} ${visibleText(button)}`.trim());
			});
		}
		function visibleTransientOverlays() {
			return Array.from(document.querySelectorAll("[role=\"dialog\"], [role=\"menu\"], [data-state=\"open\"]")).filter((element) => {
				if (!isVisible(element) || mediaPickerDialogs().includes(element)) return false;
				return /tạo hình đại diện|avatar|tín dụng google flow|credits?|đăng xuất|account|profile|nâng cấp|upgrade/i.test(element.innerText || "");
			});
		}
		async function closeOverlay(overlay) {
			const closeButton = Array.from(overlay.querySelectorAll("button, [role='button']")).filter(isVisible).find((button) => /close|đóng|cancel|huỷ|hủy/i.test(`${button.getAttribute("aria-label") || ""} ${visibleText(button)}`));
			if (!closeButton) return;
			simulateClick(closeButton);
			await humanPause(250, 450);
			if (overlay.isConnected && isVisible(overlay)) {
				closeButton.click();
				await humanPause(250, 450);
			}
		}
		return {
			findFloatingFlowCloseButtons,
			visibleTransientOverlays,
			closeOverlay
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-workspace-gates.ts
	function flowGateFromText$1(text) {
		if (/sign in|log in|choose an account|chọn tài khoản|đăng nhập/i.test(text)) return "Google Flow requires sign-in or account selection before automation can continue.";
		const creditBalance = text.match(/(?<!\d)(\d+)\s*(?:tín dụng\s*google\s*flow|tín dụng|tin dung|credits?)\b/i);
		if (creditBalance && Number(creditBalance[1]) > 0) return null;
		if (/(?<!\d)0(?!\d)\s*(tín dụng|tin dung|credits?)\b|hết\s*(credit|tín dụng)|không đủ\s*(credit|tín dụng)|insufficient credits?|not enough credits?|out of credits?|credit balance|buy credits?|purchase credits?|quota|usage limit|generation limit|đã đạt giới hạn|giới hạn sử dụng/i.test(text)) return "Google Flow reports that this account has no available credits/quota for video generation. Switch to an account with credits in the visible Flow tab, open a Flow project, then retry this shot.";
		if (/subscription|not available|region|waitlist|upgrade required|cần nâng cấp|không khả dụng/i.test(text)) return "Google Flow is showing an availability/subscription gate. Resolve it in the browser tab, then retry.";
		return null;
	}
	function isManualGate$1(scope, isVisible) {
		const gate = flowGateFromText$1(scope instanceof HTMLElement ? scope.innerText || scope.textContent || "" : document.body?.innerText || "");
		if (gate) return gate;
		const visibleDialogs = Array.from(document.querySelectorAll("[role=\"dialog\"], [role=\"alertdialog\"], [role=\"alert\"], [data-state=\"open\"]")).filter(isVisible).map((element) => element.innerText || element.textContent || "").join("\n");
		return visibleDialogs ? flowGateFromText$1(visibleDialogs) : null;
	}
	function findFlowAccountTarget$1(isVisible, visibleText) {
		return Array.from(document.querySelectorAll("button, [role='button'], a, [tabindex], [aria-label]")).filter(isVisible).map((element) => ({
			element,
			rect: element.getBoundingClientRect(),
			text: `${element.getAttribute("aria-label") || ""} ${visibleText(element)}`.trim()
		})).filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.right > window.innerWidth - 170 && rect.top < 130).sort((left, right) => right.rect.right - left.rect.right || left.rect.top - right.rect.top).find(({ text, rect }) => !/settings|cài đặt|help|trợ giúp|menu|more|thêm|\+/.test(text.toLowerCase()) && (/account|profile|hồ sơ|tài khoản|avatar/i.test(text) || rect.width <= 72 && rect.height <= 72))?.element || document.elementFromPoint(window.innerWidth - 56, 52);
	}
	function flowGridCreateButton$1(isVisible, visibleText) {
		return Array.from(document.querySelectorAll("button, [role='button'], [role='presentation'], [aria-label]")).filter((element) => flowGridCreateCandidate(element, isVisible, visibleText)).sort((left, right) => flowGridCreateScore(right) - flowGridCreateScore(left) || right.getBoundingClientRect().top - left.getBoundingClientRect().top)[0];
	}
	function flowGridCreateCandidate(element, isVisible, visibleText) {
		if (!isVisible(element)) return false;
		if (element.closest("form")?.querySelector("[role=\"textbox\"], [contenteditable=\"true\"], textarea")) return false;
		const rect = element.getBoundingClientRect();
		const text = visibleText(element);
		return rect.width >= 28 && rect.height >= 28 && rect.top > window.innerHeight * .55 && rect.left > window.innerWidth * .2 && rect.left < window.innerWidth * .65 && /add_2|add\b|thêm thành phần|add component|tạo|create/i.test(text) && !/thêm nội dung nghe nhìn|add media|upload|tải nội dung nghe nhìn|drive_folder_upload|delete|trash|settings|help|tất cả nội dung|xem hình ảnh|xem video/i.test(text);
	}
	function flowGridCreateScore(element) {
		const rect = element.getBoundingClientRect();
		return (rect.top < window.innerHeight * .4 ? 20 : 0) + (rect.left > window.innerWidth * .45 ? 10 : 0);
	}
	function createFlowWorkspaceGates(deps) {
		return {
			flowGateFromText: flowGateFromText$1,
			isManualGate: (scope = document.body) => isManualGate$1(scope, deps.isVisible),
			findFlowAccountTarget: () => findFlowAccountTarget$1(deps.isVisible, deps.visibleText),
			flowGridCreateButton: () => flowGridCreateButton$1(deps.isVisible, deps.visibleText)
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-job-dispatch.ts
	function relayCustomToolJob(payload, deps) {
		if (!/\/tools\/flow\/project\/[^/]+\/tool\/[^/]+/i.test(location.pathname)) return false;
		deps.reportStatus(payload.jobId, "opening_provider", "Routing this job to the Studio Shot Bridge iframe executor...", .16);
		chrome.runtime.sendMessage({
			source: "google-flow-custom-tool-host",
			type: "RUN_CUSTOM_TOOL_JOB",
			payload
		}).catch((error) => deps.reportResult(payload.jobId, "failed_retryable", void 0, `Studio Shot Bridge relay failed: ${error instanceof Error ? error.message : String(error)}`));
		return true;
	}
	function restoreProjectRoute(payload, deps) {
		if (!/(?:\/tools\/flow\/project\/[^/]+|\/project\/[^/]+)\/edit\//i.test(location.pathname)) return false;
		const basePath = location.pathname.replace(/\/edit\/.*$/i, "");
		sessionStorage.setItem(deps.routeHandoffKey, JSON.stringify({
			payload,
			savedAt: Date.now()
		}));
		deps.reportStatus(payload.jobId, "opening_provider", "Google Flow opened a media item; restoring the project workspace and resuming this job automatically...");
		location.assign(`${location.origin}${basePath}`);
		return true;
	}
	async function dispatchFlowJobOnce(payload, deps) {
		if (relayCustomToolJob(payload, deps) || restoreProjectRoute(payload, deps)) return;
		const runningJobs = deps.runningFlowJobIds();
		if (runningJobs.has(payload.jobId)) {
			deps.reportStatus(payload.jobId, "submitting", "Duplicate Google Flow dispatch ignored; the current job is already running in this tab.");
			return;
		}
		runningJobs.add(payload.jobId);
		const runToken = deps.nextFlowJobRunToken(payload.jobId);
		try {
			await deps.executeJob(payload, runToken);
		} finally {
			if (deps.flowJobRunTokens()[payload.jobId] === runToken) runningJobs.delete(payload.jobId);
		}
	}
	function createFlowJobDispatcher(deps) {
		return (payload) => dispatchFlowJobOnce(payload, deps);
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-text-utils.ts
	/** Shared, provider-local DOM text primitives. Keeping these outside the
	* content orchestrator makes selector/recovery code depend on one small
	* contract instead of reimplementing normalization in each flow. */
	function visibleText(element) {
		return ((element.textContent || "") + " " + (element.getAttribute("aria-label") || "") + " " + (element.getAttribute("title") || "")).trim();
	}
	function isVisible(element) {
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}
	function compactText(value, maxLength = 160) {
		const text = value.replace(/\s+/g, " ").trim();
		return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
	}
	function flowEditableText(element) {
		if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value || "";
		const clone = element.cloneNode(true);
		clone.querySelectorAll("[data-slate-placeholder]").forEach((node) => node.remove());
		return clone.textContent || "";
	}
	function normalizedFlowControlText(element) {
		return visibleText(element).replace(/play_circle|image|crop_[a-z0-9_]+|arrow_drop_down/gi, " ").replace(/\s+/g, " ").trim();
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-result-dom.ts
	function flowTilePercent$1(tile) {
		const match = (tile.innerText || "").match(/(\d{1,3})\s*%/);
		if (!match) return null;
		const value = Number(match[1]);
		return Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : null;
	}
	function mediaElementsIn$1(scope, selectors) {
		return selectors.flatMap((selector) => Array.from(scope.querySelectorAll(selector)));
	}
	/** Flow's current gallery uses custom elements instead of data-tile-id nodes. */
	var FLOW_RESULT_TILE_SELECTOR = "[data-tile-id], flow-grid-tile-container, flow-video-tile";
	function flowResultTiles(root = document) {
		return Array.from(root.querySelectorAll(FLOW_RESULT_TILE_SELECTOR));
	}
	function flowResultTileId(tile, mediaUrls = []) {
		const directId = tile.dataset.tileId || tile.getAttribute("data-tile-id") || tile.dataset.mediaId || tile.getAttribute("data-media-id") || "";
		if (directId) return directId;
		const mediaId = tile.querySelector("[data-media-id]")?.dataset.mediaId || "";
		if (mediaId) return mediaId;
		const mediaUrl = mediaUrls[0] || tile.querySelector("img")?.currentSrc || tile.querySelector("video")?.currentSrc || "";
		if (mediaUrl) return `media:${mediaUrl}`;
		const label = tile.getAttribute("aria-label") || tile.getAttribute("title") || "";
		return label ? `label:${label}` : "";
	}
	function closestFlowResultTile$1(element) {
		return element.closest(FLOW_RESULT_TILE_SELECTOR);
	}
	function flowTileLinks$1(tile) {
		if (!tile) return [];
		return Array.from(tile.querySelectorAll("a[href]")).map((anchor) => {
			try {
				return new URL(anchor.href, location.href).href;
			} catch {
				return anchor.href;
			}
		}).filter(Boolean);
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-tile-primitives.ts
	function flowImageTileRoot(element) {
		return element.closest(`[data-tile-id], flow-grid-tile-container, flow-video-tile, listboxoption, button, [role='button'], a`) || element;
	}
	function imageLooksLikeFlowMedia(image) {
		if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;
		const rect = image.getBoundingClientRect();
		if (rect.width < 72 || rect.height < 48) return false;
		const alt = image.alt || "";
		return !(/profile|avatar|hồ sơ người dùng|user/i.test(alt) && rect.width < 180);
	}
	function tileCandidateScore(tile) {
		const text = visibleText(tile);
		return (tile.dataset.tileId ? 100 : 0) + (tile.querySelector("[data-tile-id]") ? 30 : 0) + (/asset_[a-z0-9_-]+\.(png|jpe?g|webp)/i.test(text) ? 20 : 0) + (text ? 5 : 0);
	}
	function currentTileIds() {
		return new Set(flowResultTiles().map((tile) => flowResultTileId(tile, tileMediaUrls$1(tile, (scope) => Array.from(scope.querySelectorAll("img, video, source"))))).filter(Boolean));
	}
	function tileStableText(tile) {
		return compactText([
			tile.innerText || "",
			tile.getAttribute("aria-label") || "",
			tile.getAttribute("title") || "",
			tile.dataset.tileId || ""
		].join(" "), 600);
	}
	function tileMediaUrls$1(tile, mediaElementsIn) {
		const selfUrl = tile instanceof HTMLImageElement || tile instanceof HTMLVideoElement ? tile.currentSrc || tile.src : tile instanceof HTMLSourceElement ? tile.src : tile instanceof HTMLAnchorElement ? tile.href : "";
		return Array.from(new Set([selfUrl, ...mediaElementsIn(tile).map((element) => element.src || element.href || element.src)].filter(Boolean)));
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-media-picker-options.ts
	function mediaPickerReferenceOptions(picker) {
		const pickerRect = picker.getBoundingClientRect();
		const conventionalCandidates = conventionalMediaPickerOptions(picker, pickerRect);
		const structuralFilenameRows = structuralMediaPickerRows(picker, pickerRect);
		return [...conventionalCandidates, ...structuralFilenameRows].filter((element, index, list) => list.indexOf(element) === index).sort(compareMediaPickerOptions);
	}
	function conventionalMediaPickerOptions(picker, pickerRect) {
		return Array.from(picker.querySelectorAll("[data-tile-id], listboxoption, [role='option'], button, [role='button'], img")).map((element) => element.closest("[data-tile-id], listboxoption, [role='option']") || element.closest("button, [role='button']") || element).filter((element, index, list) => list.indexOf(element) === index).filter((element) => isConventionalMediaOption(element, pickerRect));
	}
	function isConventionalMediaOption(element, pickerRect) {
		if (!isVisible(element)) return false;
		const rect = element.getBoundingClientRect();
		if (!mediaOptionGeometryIsValid(rect, pickerRect)) return false;
		const image = element instanceof HTMLImageElement ? element : element.querySelector("img");
		const text = `${visibleText(element)} ${image?.alt || ""}`.trim();
		return !mediaOptionTextIsControl(text) && !mediaOptionTextNeedsImage(text, image) && (/\.(png|jpe?g|webp)|asset_/i.test(text) || Boolean(image && rect.height <= Math.max(80, pickerRect.height * .9)));
	}
	function mediaOptionGeometryIsValid(rect, pickerRect) {
		const largePickerImage = rect.width >= 36 && rect.height > 92 && rect.height <= Math.max(120, pickerRect.height * .9);
		if (rect.width < 36 || rect.height < 24 || rect.width > 340 || !largePickerImage && rect.height > 92) return false;
		return pickerRect.width <= 0 || pickerRect.height <= 0 || rect.left >= pickerRect.left - 4 && rect.right <= pickerRect.right + 4 && rect.top >= pickerRect.top - 4 && rect.bottom <= pickerRect.bottom + 4;
	}
	function mediaOptionTextIsControl(text) {
		return /arrow_back|quay lại|dashboard|tất cả nội dung|xem hình ảnh|xem video|google flow|cài đặt|settings|help|trash|delete/i.test(text);
	}
	function mediaOptionTextNeedsImage(text, image) {
		return /thêm vào câu lệnh|add to prompt|hình ảnh|tệp tải lên|search|gần đây/i.test(text) && !image;
	}
	function structuralMediaRowMatches(element, pickerRect) {
		if (!isVisible(element)) return false;
		const rect = element.getBoundingClientRect();
		if (rect.width < 220 || rect.height < 44 || rect.height > 110) return false;
		if (pickerRect.width > 0 && pickerRect.height > 0 && (rect.left < pickerRect.left - 4 || rect.right > pickerRect.right + 4 || rect.top < pickerRect.top - 4 || rect.bottom > pickerRect.bottom + 4)) return false;
		return (compactText(visibleText(element), 240).match(/[a-z0-9_.-]+\.(?:png|jpe?g|webp)/gi) || []).length === 1;
	}
	function structuralMediaRowIsNested(candidate, other) {
		if (other === candidate || !candidate.contains(other)) return false;
		const candidateRect = candidate.getBoundingClientRect();
		const otherRect = other.getBoundingClientRect();
		return otherRect.width * otherRect.height > 0 && otherRect.width * otherRect.height < candidateRect.width * candidateRect.height;
	}
	function structuralMediaPickerRows(picker, pickerRect) {
		return Array.from(picker.querySelectorAll("div")).filter((element) => structuralMediaRowMatches(element, pickerRect)).filter((candidate, _index, candidates) => !candidates.some((other) => structuralMediaRowIsNested(candidate, other)));
	}
	function compareMediaPickerOptions(left, right) {
		const leftNamed = /\.(png|jpe?g|webp)|asset_/i.test(visibleText(left)) ? 0 : 1;
		const rightNamed = /\.(png|jpe?g|webp)|asset_/i.test(visibleText(right)) ? 0 : 1;
		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();
		return leftNamed - rightNamed || leftRect.top - rightRect.top || leftRect.left - rightRect.left;
	}
	function compareStartFrameOptions(left, right) {
		const leftRole = left.getAttribute("role") === "option" ? 0 : 1;
		const rightRole = right.getAttribute("role") === "option" ? 0 : 1;
		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();
		return leftRole - rightRole || leftRect.height - rightRect.height || leftRect.top - rightRect.top || leftRect.left - rightRect.left;
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-reference-identity.ts
	function normalizedReferenceToken(value) {
		return value.toLowerCase().replace(/^data:[^;]+;base64,/i, "").split(/[?#]/)[0].split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/g, "");
	}
	function referenceSearchTokens$1(reference) {
		if (!reference) return [];
		const filePath = reference.filePath && !reference.filePath.startsWith("data:") ? reference.filePath : "";
		let decodedFilePath = filePath;
		try {
			decodedFilePath = decodeURIComponent(filePath);
		} catch {}
		const filePathBasename = decodedFilePath.split(/[/?#]/).filter(Boolean).pop() || "";
		return Array.from(new Set([
			reference.filename || "",
			reference.assetId || "",
			filePath,
			decodedFilePath,
			filePathBasename
		].map(normalizedReferenceToken).filter((token) => token.length >= 6)));
	}
	function referenceRequiredLabel$1(reference) {
		return reference?.filename || reference?.assetId || "unknown reference";
	}
	function referenceGeometryIsScoped(rect, viewport) {
		if (rect.width < 36 || rect.height < 24) return false;
		if (rect.width > viewport.width * .78 || rect.height > viewport.height * .72) return false;
		return rect.width * rect.height <= viewport.width * viewport.height * .42 && rect.top >= 0;
	}
	function fingerprintDistance(left, right) {
		if (left.width !== right.width || left.height !== right.height || left.values.length !== right.values.length) return Number.POSITIVE_INFINITY;
		let total = 0;
		for (let index = 0; index < left.values.length; index++) total += Math.abs(left.values[index] - right.values[index]);
		return total / Math.max(1, left.values.length) / 255;
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-composer-settings.ts
	function createFlowComposerSettings(runtime) {
		return {
			aspectRatioSuffix: (aspectRatio) => aspectRatioSuffix$1(runtime, aspectRatio),
			flowVideoSourceMode: (payload) => flowVideoSourceMode$1(runtime, payload),
			flowComposerShowsRequestedSource: (payload) => flowComposerShowsRequestedSource(runtime, payload),
			flowComposerLooksVideoReady: (payload) => flowComposerLooksVideoReady$1(runtime, payload),
			waitForFlowComposerVideoReady: (payload, timeoutMs = 5e3) => waitForFlowComposerVideoReady$1(runtime, payload, timeoutMs),
			selectFlowVideoSourceMode: (jobId, payload) => selectFlowVideoSourceMode$1(runtime, jobId, payload),
			focusFlowStartFrameSlot: (jobId) => focusFlowStartFrameSlot$1(runtime, jobId),
			applyFlowAspectRatio: (jobId, aspectRatio) => applyFlowAspectRatio$1(runtime, jobId, aspectRatio),
			applyFlowDuration: (jobId, payload, durationSec) => applyFlowDuration$1(runtime, jobId, payload, durationSec),
			applyFlowSettingsForJob: (jobId, payload) => applyFlowSettingsForJob$1(runtime, jobId, payload)
		};
	}
	function aspectRatioSuffix$1(runtime, aspectRatio) {
		const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		if (aspectRatio === "9:16") return "PORTRAIT";
		if (aspectRatio === "16:9") return "LANDSCAPE";
		if (aspectRatio === "1:1") return "SQUARE";
		return null;
	}
	function flowVideoSourceMode$1(runtime, payload) {
		const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		const requested = String(payload.settings?.flowVideoMode || payload.settings?.sourceMode || "").toLowerCase();
		if (/frame|khung/i.test(requested)) return "frames";
		return "components";
	}
	function flowComposerShowsRequestedSource(runtime, payload) {
		if (!runtime.isVideoJob(payload) || flowVideoSourceMode$1(runtime, payload) === "components") return true;
		return runtime.flowStartOrEndFrameSlots().length >= 2;
	}
	function flowComposerLooksVideoReady$1(runtime, payload) {
		const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		if (!isVideoJob(payload)) return true;
		const aspectRatio = String(payload.settings?.aspectRatio || "");
		const durationSec = Number(payload.settings?.durationSec || 0);
		return composerShowsVideoMode() && composerShowsAspectRatio(aspectRatio) && composerShowsDuration(durationSec) && flowComposerShowsRequestedSource(runtime, payload);
	}
	async function waitForFlowComposerVideoReady$1(runtime, payload, timeoutMs = 5e3) {
		const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			if (flowComposerLooksVideoReady$1(runtime, payload)) return true;
			await sleep(200);
		}
		return flowComposerLooksVideoReady$1(runtime, payload);
	}
	async function selectFlowVideoSourceMode$1(runtime, jobId, payload) {
		const { isVideoJob, composerShowsVideoMode, composerShowsImageMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, ensureFlowImageComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		const missing = [];
		if (!isVideoJob(payload)) {
			if (!await ensureFlowImageComposerMode(jobId)) missing.push("Image mode");
			return missing;
		}
		const sourceMode = flowVideoSourceMode$1(runtime, payload);
		const composerSurfaceReady = Boolean(getComposerRoot() || runtime.activeFlowPromptEditor?.());
		if (sourceMode === "frames" && !composerSurfaceReady) {
			if (!await openFlowComposerFromProjectGrid(jobId) || !getComposerRoot()) {
				flowTrace(jobId, "Flow frame-source mode needs the classic composer, but the project grid/agent shell did not expose one.", .17);
				missing.push("classic video composer");
				return missing;
			}
		}
		flowTrace(jobId, `Selecting Google Flow video source mode (${sourceMode === "components" ? "Thành phần" : "Khung hình"}).`);
		if (!await ensureFlowVideoComposerMode(jobId)) missing.push("Video mode");
		if (sourceMode === "frames") {
			if (flowStartOrEndFrameSlots().length >= 2) {
				flowTrace(jobId, "Flow V2 frame slots are already present; keeping native frame mode without opening the unavailable source-mode menu.", .17);
				return missing;
			}
			if (!(await clickInComposerSettingsBounded(jobId, "Frame source mode", [/khung hình/i, /^frames?$/i], 1, ["VIDEO_FRAMES"])).ok) {
				flowTrace(jobId, "Flow frame-source control was not visible and no native frame slots were present.", .17);
				missing.push("Frame source mode");
			} else {
				const startedAt = Date.now();
				while (Date.now() - startedAt < 4e3 && flowStartOrEndFrameSlots().length < 2) await sleep(200);
				if (flowStartOrEndFrameSlots().length < 2) {
					flowTrace(jobId, "Flow accepted the frame-source control but did not expose the Bắt đầu/Kết thúc slots.", .17);
					missing.push("Frame source mode");
				}
			}
		} else if (!(await clickInComposerSettingsBounded(jobId, "Component source mode", [
			/thành phần/i,
			/ingredient/i,
			/component/i,
			/reference/i
		], 1, ["VIDEO_REFERENCES"])).ok) flowTrace(jobId, "Flow component-source control was not visible; continuing with the current Video composer mode.", .17);
		document.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		await humanPause(500, 850);
		return missing;
	}
	async function focusFlowStartFrameSlot$1(runtime, jobId) {
		const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		const startedAt = Date.now();
		while (Date.now() - startedAt < 5e3) {
			const target = flowStartOrEndFrameSlots().find((element) => /^(bắt đầu|start)$/i.test(visibleText(element).replace(/\s+/g, " ").trim())) || null;
			if (target) {
				flowTrace(jobId, "Selecting Flow start-frame slot before attaching keyframe...", .41);
				await clickFlowFrameSlot(target);
				await humanPause(700, 1150);
				return true;
			}
			await sleep(250);
		}
		flowTrace(jobId, "Flow start-frame slot was not visible; continuing with frame mode active.", .41);
		return false;
	}
	async function applyFlowAspectRatio$1(runtime, jobId, aspectRatio) {
		const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		if (!aspectRatio || composerShowsAspectRatio(aspectRatio)) return void 0;
		const ratioPattern = new RegExp(`^${aspectRatio.replace(":", "\\s*:\\s*")}$`);
		const suffix = aspectRatioSuffix$1(runtime, aspectRatio);
		return (await clickInComposerSettingsBounded(jobId, `Frame ratio ${aspectRatio}`, [ratioPattern], 1, suffix ? [suffix] : [])).ok ? void 0 : `Frame ratio ${aspectRatio}`;
	}
	async function applyFlowDuration$1(runtime, jobId, payload, durationSec) {
		const { isVideoJob, composerShowsVideoMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		if (durationSec <= 0 || composerShowsDuration(durationSec)) return void 0;
		const flowDuration = resolveProviderVideoDuration("google-flow", durationSec);
		const durationPattern = new RegExp(`^${flowDuration}\\s*s(ec|econds)?$`, "i");
		if (!(await clickInComposerSettingsBounded(jobId, `${flowDuration}s duration`, [durationPattern, new RegExp(`^${flowDuration}\\s*giây$`, "i")], 1)).ok) return `Duration ${flowDuration}s`;
		if (!await waitForFlowComposerVideoReady$1(runtime, payload, 3500)) return `Duration ${flowDuration}s not confirmed`;
		flowTrace(jobId, `Flow duration mapped from ${Number(payload.settings?.timelineDurationSec || durationSec)}s timeline shot to supported ${flowDuration}s render and confirmed.`, .18);
	}
	async function applyFlowSettingsForJob$1(runtime, jobId, payload) {
		const { isVideoJob, composerShowsVideoMode, composerShowsImageMode, composerShowsAspectRatio, composerShowsDuration, sleep, getComposerRoot, openFlowComposerFromProjectGrid, flowTrace, ensureFlowVideoComposerMode, ensureFlowImageComposerMode, clickInComposerSettingsBounded, humanPause, flowStartOrEndFrameSlots, visibleText, clickFlowFrameSlot, closeFlowSettingsPanelIfOpen, resolveProviderVideoDuration } = runtime;
		const missing = [];
		const aspectRatio = String(payload.settings?.aspectRatio || "");
		const durationSec = Number(payload.settings?.durationSec || 0);
		missing.push(...await selectFlowVideoSourceMode$1(runtime, jobId, payload));
		if (!isVideoJob(payload) && (composerShowsVideoMode() || !composerShowsImageMode() || missing.includes("Image mode"))) {
			flowTrace(jobId, "Flow image mode was not confirmed; refusing to submit an image job into the Video composer.", .19);
			return Array.from(new Set([...missing, "Image mode not confirmed"]));
		}
		const missingAspectRatio = await applyFlowAspectRatio$1(runtime, jobId, aspectRatio);
		if (missingAspectRatio) missing.push(missingAspectRatio);
		if (composerShowsVideoMode() && (!aspectRatio || composerShowsAspectRatio(aspectRatio)) && (!durationSec || composerShowsDuration(durationSec))) {
			flowTrace(jobId, "Flow required video mode, ratio, and duration are already visible; skipping redundant settings clicks.", .19);
			document.dispatchEvent(new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true
			}));
			document.body.dispatchEvent(new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true
			}));
			await closeFlowSettingsPanelIfOpen(jobId);
			await humanPause(700, 1200);
			return missing;
		}
		const missingDuration = await applyFlowDuration$1(runtime, jobId, payload, durationSec);
		if (missingDuration) missing.push(missingDuration);
		await clickInComposerSettingsBounded(jobId, "Quantity x1", [
			/^x\s*1$/i,
			/^1x$/i,
			/^1$/
		], 1, ["1"], 8e3);
		document.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		await closeFlowSettingsPanelIfOpen(jobId);
		await humanPause(500, 850);
		return missing;
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-frame-dom.ts
	function isFlowFrameSlot$1(deps, element) {
		if (!deps.isVisible(element)) return false;
		const rect = element.getBoundingClientRect();
		const text = deps.visibleText(element).replace(/\s+/g, " ").trim();
		return frameLabelIsEligible(element, rect, text) && frameSlotGeometryIsEligible(rect) && /(^|\s)(bắt đầu|kết thúc|start|end)(\s|$)/i.test(text);
	}
	function frameLabelIsEligible(element, rect, text) {
		if (element.closest("[contenteditable=\"true\"], [role=\"textbox\"], textarea")) return false;
		return /^(bắt đầu|kết thúc|start|end)$/i.test(text) || text.length <= 80 && rect.top >= window.innerHeight * .62;
	}
	function frameSlotGeometryIsEligible(rect) {
		return rect.top > window.innerHeight * .35 && rect.top < window.innerHeight * .92 && rect.left < window.innerWidth * .55 && rect.width >= 36 && rect.width <= 220 && rect.height >= 26 && rect.height <= 90;
	}
	function compareFlowFrameSlots$1(deps, left, right) {
		const leftText = deps.visibleText(left);
		const rightText = deps.visibleText(right);
		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();
		const leftStart = /bắt đầu|start/i.test(leftText) ? 0 : 1;
		const rightStart = /bắt đầu|start/i.test(rightText) ? 0 : 1;
		const leftExact = /^(bắt đầu|start)$/i.test(leftText.trim()) ? 0 : 1;
		const rightExact = /^(bắt đầu|start)$/i.test(rightText.trim()) ? 0 : 1;
		const leftBottom = leftRect.top > window.innerHeight * .62 ? 0 : 1;
		const rightBottom = rightRect.top > window.innerHeight * .62 ? 0 : 1;
		return leftStart - rightStart || leftExact - rightExact || leftBottom - rightBottom || leftRect.width * leftRect.height - rightRect.width * rightRect.height || leftRect.left - rightRect.left || leftRect.top - rightRect.top;
	}
	function flowStartOrEndFrameSlots$1(deps) {
		const scoped = deps.getComposerRoot()?.querySelectorAll(".frame-trigger") || [];
		const slots = (scoped.length ? Array.from(scoped) : Array.from(document.querySelectorAll(".prompt-top-row .frame-trigger, flow-ingredient-bar .frame-trigger"))).filter((element) => {
			if (!deps.isVisible(element)) return false;
			const rect = element.getBoundingClientRect();
			const text = deps.visibleText(element).replace(/\s+/g, " ").trim();
			return frameSlotGeometryIsEligible(rect) && (/(^|\s)(bắt đầu|kết thúc|start|end)(\s|$)/i.test(text) || Boolean(element.querySelector(".chip-container, img, video, canvas")));
		}).sort((left, right) => {
			const leftRect = left.getBoundingClientRect();
			const rightRect = right.getBoundingClientRect();
			return leftRect.left - rightRect.left || compareFlowFrameSlots$1(deps, left, right);
		});
		return Array.from(new Set(slots)).slice(0, 2);
	}
	function flowStartFrameSlots$1(deps) {
		const slots = flowStartOrEndFrameSlots$1(deps);
		const labelled = slots.filter((slot) => /bắt đầu|start/i.test(deps.visibleText(slot)));
		return labelled.length ? labelled : slots.slice(0, 1);
	}
	function flowDirectFrameAttachmentElements$1(deps) {
		const slotMedia = flowStartOrEndFrameSlots$1(deps).flatMap((slot) => Array.from(slot.querySelectorAll("img, video, canvas, [style*='background-image']"))).filter((element) => deps.isVisible(element) && (element.matches("img, video, canvas") || Boolean(element.style.backgroundImage)));
		const composerRoot = deps.getComposerRoot();
		const nearbyMedia = Array.from((composerRoot || document.createDocumentFragment()).querySelectorAll("img, video, canvas, [style*='background-image']")).filter((element) => {
			if (!deps.isVisible(element)) return false;
			const rect = element.getBoundingClientRect();
			if (rect.top < window.innerHeight * .45 || rect.width < 40 || rect.height < 40) return false;
			const text = deps.visibleText(element.closest("button, [role='button'], section, div") || element);
			return /bắt đầu|kết thúc|start|end|video|khung hình/i.test(text);
		});
		return Array.from(new Set([...slotMedia, ...nearbyMedia]));
	}
	function flowStartFrameSlotLooksAttached$1(deps) {
		return flowStartFrameAttachmentRemoveButtons$1(deps).length > 0;
	}
	function flowStartFrameAttachmentRemoveButtons$1(deps) {
		return Array.from(document.querySelectorAll("button, [role='button'], [aria-label]")).filter((element) => {
			if (!deps.isVisible(element)) return false;
			const rect = element.getBoundingClientRect();
			const text = `${element.getAttribute("aria-label") || ""} ${deps.visibleText(element)}`.trim();
			const isRemoveLabel = /(^|\s)(cancel|remove|clear|x[oó]a|huỷ|hủy)(\s|$)/i.test(text);
			const hasFrameMedia = Boolean(element.querySelector("img, video, canvas"));
			const minimumTop = hasFrameMedia ? window.innerHeight * .35 : window.innerHeight * .45;
			return rect.top > minimumTop && rect.top < window.innerHeight * .9 && rect.left < window.innerWidth * .6 && rect.width >= 32 && rect.width <= 90 && rect.height >= 26 && rect.height <= 90 && (isRemoveLabel || hasFrameMedia);
		});
	}
	function directFrameAttachmentCount$1(deps) {
		return flowDirectFrameAttachmentElements$1(deps).length + (flowStartFrameSlotLooksAttached$1(deps) ? 1 : 0);
	}
	function flowComposerDropTargets$1(deps) {
		const targets = [...flowStartOrEndFrameSlots$1(deps)];
		const composerRoot = deps.getComposerRoot();
		if (composerRoot) {
			targets.push(composerRoot);
			let node = composerRoot.parentElement;
			while (node && node !== document.body && targets.length < 10) {
				const rect = node.getBoundingClientRect();
				if (rect.top > window.innerHeight * .45 && rect.width >= 300 && rect.height >= 70 && rect.height <= 320) targets.push(node);
				node = node.parentElement;
			}
		}
		const promptEditor = deps.activeFlowPromptEditor();
		if (promptEditor) targets.push(promptEditor);
		return Array.from(new Set(targets)).filter(deps.isVisible);
	}
	function tileDragSource$1(tile) {
		return tile.querySelector("[aria-roledescription=\"draggable\"], [draggable=\"true\"], [role=\"button\"], button, img, video, a") || tile;
	}
	function addTileDataToTransfer$1(transfer, tile) {
		const tileId = tile.dataset.tileId || tile.getAttribute("data-tile-id") || "";
		const image = tile.querySelector("img");
		const video = tile.querySelector("video");
		const source = tile.querySelector("source");
		const mediaUrl = image?.currentSrc || image?.src || video?.currentSrc || video?.src || source?.src || "";
		setTransferValue(transfer, "text/plain", tileId);
		setTransferValue(transfer, "text/uri-list", mediaUrl);
		setTransferValue(transfer, "text/html", tile.outerHTML);
		transfer.effectAllowed = "copyMove";
		transfer.dropEffect = "copy";
	}
	function setTransferValue(transfer, type, value) {
		if (!value) return;
		try {
			transfer.setData(type, value);
		} catch {}
	}
	function createFlowFrameDom(deps) {
		return {
			isFlowFrameSlot: (element) => isFlowFrameSlot$1(deps, element),
			compareFlowFrameSlots: (left, right) => compareFlowFrameSlots$1(deps, left, right),
			flowStartOrEndFrameSlots: () => flowStartOrEndFrameSlots$1(deps),
			flowStartFrameSlots: () => flowStartFrameSlots$1(deps),
			flowDirectFrameAttachmentElements: () => flowDirectFrameAttachmentElements$1(deps),
			flowStartFrameSlotLooksAttached: () => flowStartFrameSlotLooksAttached$1(deps),
			flowStartFrameAttachmentRemoveButtons: () => flowStartFrameAttachmentRemoveButtons$1(deps),
			directFrameAttachmentCount: () => directFrameAttachmentCount$1(deps),
			flowComposerDropTargets: () => flowComposerDropTargets$1(deps),
			tileDragSource: tileDragSource$1,
			addTileDataToTransfer: addTileDataToTransfer$1
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-result-policy.ts
	/**
	* A video submit is accepted only on video-specific evidence. Flow can briefly
	* render the attached start-frame as a duplicated image tile with a generic
	* spinner; that is composer hydration, not proof that video generation began.
	*/
	function isFlowGenerationEvidence(evidence) {
		if (evidence.expectVideo) {
			if (evidence.hasVideoMedia) return true;
			if (evidence.isImageOnlyResult) return false;
			if (evidence.percent !== null) return true;
			if (/đang tạo video|đang xử lý video|generating video|processing video|rendering video/i.test(evidence.visibleText)) return true;
			return evidence.hasProgressControl && !evidence.hasAnyMedia;
		}
		if (evidence.percent !== null || evidence.hasProgressControl) return true;
		return evidence.hasAnyMedia || /đang tạo|generating|processing|progress|rendering/i.test(evidence.visibleText);
	}
	/**
	* A Flow result is recoverable only when its identity is new relative to the
	* exact pre-submit snapshot. This deliberately rejects ambiguous old tiles so
	* recovery cannot attach another shot's output to the current job.
	*/
	function isFreshFlowTile(identity, baseline) {
		if (!baseline || !identity.tileId) return false;
		if (baseline.beforeTileIds.includes(identity.tileId)) return false;
		if (identity.editId && baseline.beforeEditIds.includes(identity.editId)) return false;
		if (identity.mediaUrls.length > 0 && identity.mediaUrls.every((url) => baseline.beforeMediaUrls.includes(url))) return false;
		return true;
	}
	var flowMediaUrl$1 = (element) => {
		return element.currentSrc || element.src || element.href || element.src || "";
	};
	var flowTileEditId$1 = (tile, flowTileLinks) => {
		return (flowTileLinks(tile).find((link) => /\/edit\//i.test(link)) || "").match(/\/edit\/([^/?#]+)/i)?.[1] || "";
	};
	var isFlowVideoMediaElement$1 = (element) => {
		const tagName = element.tagName.toLowerCase();
		const type = element.getAttribute("type") || "";
		return tagName === "video" || tagName === "source" || /video/i.test(type) || /\.(mp4|webm)(\?|#|$)/i.test(flowMediaUrl$1(element)) || Boolean(typeof element.closest === "function" && element.closest("flow-video-tile"));
	};
	var flowTileHasVideoMedia$1 = (tile, mediaElementsIn) => mediaElementsIn(tile).some(isFlowVideoMediaElement$1);
	var flowTileHasStaticImageMedia$1 = (tile, mediaElementsIn) => mediaElementsIn(tile).some((element) => element.tagName.toLowerCase() === "img" && !isFlowVideoMediaElement$1(element));
	var flowTileIsImageOnlyResult$1 = (tile, deps) => Boolean(flowTileEditId$1(tile, deps.flowTileLinks) && flowTileHasStaticImageMedia$1(tile, deps.mediaElementsIn) && !flowTileHasVideoMedia$1(tile, deps.mediaElementsIn));
	var flowImageOnlyVideoError$1 = (tileCount) => `Google Flow returned ${tileCount} image-only result tile(s) for a video job. The Flow composer is likely still in image/keyframe mode, so the app will not treat these images as completed videos. Switch Flow to Video mode with a start frame, then retry the video step.`;
	var flowTileMayRevealMedia$1 = (tile, deps) => Boolean(deps.mediaElementsIn(tile).length > 0 || flowTileEditId$1(tile, deps.flowTileLinks) || /play_circle|phát|play|sử dụng lại câu lệnh|reuse prompt/i.test(deps.visibleText(tile)) || tile.querySelector("button, [role=\"button\"], a[href*=\"/edit/\"], video, img"));
	/** Provider-local result media policy; DOM readers are injected for contract testing. */
	function createFlowResultMedia(deps) {
		return {
			flowMediaUrl: flowMediaUrl$1,
			flowTileEditId: (tile) => flowTileEditId$1(tile, deps.flowTileLinks),
			isFlowVideoMediaElement: isFlowVideoMediaElement$1,
			flowTileHasVideoMedia: (tile) => flowTileHasVideoMedia$1(tile, deps.mediaElementsIn),
			flowTileHasStaticImageMedia: (tile) => flowTileHasStaticImageMedia$1(tile, deps.mediaElementsIn),
			flowTileIsImageOnlyResult: (tile) => flowTileIsImageOnlyResult$1(tile, deps),
			flowImageOnlyVideoError: flowImageOnlyVideoError$1,
			flowTileMayRevealMedia: (tile) => flowTileMayRevealMedia$1(tile, deps)
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-result-recovery.ts
	var activeDeps;
	function newGenerationTiles$1(beforeTileIds, baseline) {
		const effectiveBaseline = baseline || {
			beforeTileIds: Array.from(beforeTileIds),
			beforeTileTextById: {},
			beforeTileMediaById: {},
			beforeEditIds: [],
			beforeMediaUrls: [],
			submittedAt: 0
		};
		const seen = /* @__PURE__ */ new Set();
		return Array.from(document.querySelectorAll(FLOW_RESULT_TILE_SELECTOR)).filter((tile) => {
			const tileId = flowResultTileId(tile, activeDeps.tileMediaUrls(tile));
			if (!tileId || !activeDeps.isVisible(tile)) return false;
			const rect = tile.getBoundingClientRect();
			const seenKey = `${tileId}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
			if (seen.has(seenKey)) return false;
			seen.add(seenKey);
			return isFreshFlowTile({
				tileId,
				editId: activeDeps.flowTileEditId(tile),
				mediaUrls: activeDeps.tileMediaUrls(tile)
			}, effectiveBaseline);
		});
	}
	function currentJobTiles$1(jobId, beforeTileIds) {
		return newGenerationTiles$1(beforeTileIds, activeDeps.flowJobBaselines()[jobId]);
	}
	function flowTileFailed$1(tile) {
		if (activeDeps.mediaElementsIn(tile).length > 0) return false;
		return /không thành công|failed|error|retry|thử lại|lỗi/i.test(tile.innerText || "");
	}
	function flowTileBlockingError$1(tile) {
		if (activeDeps.mediaElementsIn(tile).length > 0) return null;
		return activeDeps.isManualGate(tile);
	}
	function flowProviderFailureText() {
		const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
		if (!bodyText) return null;
		if (!/(?:không thành công|generation failed|could not generate|try a different prompt)/i.test(bodyText)) return null;
		if (!/(?:vi phạm chính sách|chính sách của chúng tôi|policy|celebrity|người nổi tiếng)/i.test(bodyText)) return null;
		return `GOOGLE_FLOW_PROVIDER_POLICY_REJECTED: Flow rejected the submitted prompt before creating a video tile. ${activeDeps.compactText(bodyText, 320)}`;
	}
	function flowTileHasGenerationSignal$1(tile, expectVideo) {
		if (!activeDeps.isVisible(tile)) return false;
		const media = activeDeps.mediaElementsIn(tile);
		return isFlowGenerationEvidence({
			expectVideo,
			hasProgressControl: Boolean(tile.querySelector("[role=\"progressbar\"], [aria-busy=\"true\"], progress, .loading, .spinner")),
			percent: activeDeps.flowTilePercent(tile),
			hasVideoMedia: activeDeps.flowTileHasVideoMedia(tile),
			hasAnyMedia: media.length > 0,
			isImageOnlyResult: activeDeps.flowTileIsImageOnlyResult(tile),
			visibleText: activeDeps.visibleText(tile)
		});
	}
	function reloadFlowForResultRecovery$1(job, message) {
		const key = activeDeps.FLOW_RESULT_RECOVERY_KEY;
		const attemptKey = `${key}:attempt:${job.jobId}`;
		try {
			if (sessionStorage.getItem(attemptKey) === "1") {
				activeDeps.reportStatus(job.jobId, "generating", "Flow recovery reload already used; continuing on the same page without another reload or resubmit.", .74);
				return;
			}
		} catch {}
		try {
			sessionStorage.setItem(attemptKey, "1");
		} catch {}
		if (sessionStorage.getItem(attemptKey) !== "1") {
			activeDeps.reportStatus(job.jobId, "generating", "Flow recovery storage is unavailable; continuing without another reload or resubmit.", .74);
			return;
		}
		sessionStorage.setItem(key, JSON.stringify({
			job,
			savedAt: Date.now(),
			attempts: 1
		}));
		activeDeps.reportStatus(job.jobId, "submitting", message, .74);
		location.reload();
	}
	async function waitForGenerationStart$1(job, beforeGenerationTileIds, expectVideo, timeoutMs = 36e3) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			await activeDeps.sleep(600);
			if (activeDeps.flowPageErrorText()) {
				reloadFlowForResultRecovery$1(job, "Flow crashed after submit; reloading once to recover the accepted generation without resubmitting...");
				return false;
			}
			if (activeDeps.reportFlowSubmitRejection(job.jobId)) return false;
			const gate = activeDeps.isManualGate();
			if (gate) {
				activeDeps.reportResult(job.jobId, "waiting_manual_action", void 0, gate);
				return false;
			}
			if (currentJobTiles$1(job.jobId, beforeGenerationTileIds).some((tile) => flowTileHasGenerationSignal$1(tile, expectVideo))) {
				activeDeps.reportStatus(job.jobId, "generating", "Flow generation tile detected; provider accepted submit.", .75);
				return true;
			}
			if (Date.now() - startedAt >= 15e3) activeDeps.reportStatus(job.jobId, "submitting", "Flow submit was clicked once; waiting for a generation tile before marking provider acceptance...", .73);
		}
		if (expectVideo) {
			reloadFlowForResultRecovery$1(job, "Flow submit returned without a visible generation tile; refreshing once to recover any accepted late-hydrate video without resubmitting...");
			return false;
		}
		activeDeps.reportResult(job.jobId, "failed_retryable", void 0, `Flow submit click returned, but no new generation tile or progress indicator appeared. The visible Flow page may have rejected the request before generation started. ${activeDeps.flowDebugSnapshot()}`);
		return false;
	}
	function blobToDataUrl(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ""));
			reader.onerror = () => reject(/* @__PURE__ */ new Error("Cannot read Flow blob media."));
			reader.readAsDataURL(blob);
		});
	}
	async function normalizeFlowMediaUrl$1(url, isVideo) {
		if (!url.startsWith("blob:")) return {
			url,
			metadata: {}
		};
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Flow blob fetch failed: HTTP ${response.status}`);
		const blob = await response.blob();
		return {
			url: await blobToDataUrl(blob),
			metadata: {
				originalUrl: url,
				storage: "data_url",
				byteSize: blob.size,
				mimeType: blob.type || (isVideo ? "video/mp4" : "image/png")
			}
		};
	}
	async function resultAssetsFromMedia$1(jobId, elements, expectVideo, contextTile) {
		const seen = /* @__PURE__ */ new Set();
		return (await Promise.all(elements.map(async (element, index) => {
			const thumbnailUrl = activeDeps.flowMediaUrl(element);
			if (!thumbnailUrl) return null;
			const tagName = element.tagName.toLowerCase();
			const isVideo = thumbnailUrl.includes(".mp4") || /\/video\//i.test(thumbnailUrl) || tagName.includes("video") || tagName === "source";
			if (expectVideo && !isVideo) return null;
			const url = thumbnailUrl;
			const tile = contextTile || activeDeps.closestFlowResultTile(element) || null;
			const tileId = tile?.dataset.tileId || "";
			const signature = `${tileId}:${url}`;
			if (seen.has(signature)) return null;
			seen.add(signature);
			const links = activeDeps.flowTileLinks(tile);
			const editUrl = links.find((link) => /\/edit\//i.test(link)) || links.find((link) => /\/project\//i.test(link));
			const normalized = await normalizeFlowMediaUrl$1(url, isVideo);
			return {
				type: isVideo ? "video" : "image",
				filename: `google_flow_${jobId}_${index}${isVideo ? ".mp4" : ".png"}`,
				downloadPath: normalized.url,
				mimeType: isVideo ? "video/mp4" : "image/png",
				metadata: {
					...normalized.metadata,
					studioJobId: jobId,
					currentJobOnly: true,
					flowStrictCurrentJobRecovery: true,
					providerUrl: location.href,
					flowProjectUrl: location.href,
					flowTileId: tileId,
					flowResultUrl: editUrl || "",
					flowTileLinks: links.slice(0, 8),
					...isVideo ? { providerMediaUrl: url } : {}
				}
			};
		}))).filter(Boolean);
	}
	async function revealMediaFromFlowTile$1(jobId, tile, expectVideo) {
		if (!activeDeps.flowTileMayRevealMedia(tile)) return [];
		if (isImageOnlyVideoReveal(tile, expectVideo)) {
			activeDeps.flowTrace(jobId, `Flow result tile ${tile.dataset.tileId || ""} is image-only; refusing to reveal it as a video result.`, .96, "generating");
			return [];
		}
		const editId = activeDeps.flowTileEditId(tile);
		const target = tile.querySelector("a[href*=\"/edit/\"], button[aria-label*=\"play\" i], [role=\"button\"][aria-label*=\"play\" i], video, button, [role=\"button\"], img") || tile;
		activeDeps.flowTrace(jobId, `Revealing Flow result tile ${tile.dataset.tileId || ""} before deciding failure...`, .96, "generating");
		activeDeps.simulateClick(target);
		const startedAt = Date.now();
		let playbackRequested = false;
		while (Date.now() - startedAt < 45e3) {
			await activeDeps.sleep(750);
			if (activeDeps.isManualGate()) return [];
			const tileAssets = await resultAssetsFromMedia$1(jobId, activeDeps.mediaElementsIn(tile), expectVideo, tile);
			if (tileAssets.length > 0) return tileAssets;
			if (/\/project\/[^/]+\/edit\/|\/tools\/flow\/project\/[^/]+\/edit\//i.test(location.pathname) && (!editId || location.href.includes(editId))) {
				if (!playbackRequested && !activeDeps.findElements([
					"video",
					"video source[src]",
					"video[src]"
				]).length) {
					const playButton = Array.from(document.querySelectorAll("button, [role=\"button\"]")).find((button) => activeDeps.isVisible(button) && /^(?:phát|play)$/i.test(button.getAttribute("aria-label") || ""));
					if (playButton) {
						playbackRequested = true;
						activeDeps.flowTrace(jobId, "Requesting playback once so Flow hydrates the native video resource in the edit route.", .97, "downloading");
						activeDeps.simulateClick(playButton);
					}
				}
				const performanceAssets = await resultAssetsFromMedia$1(jobId, performance.getEntriesByType("resource").map((entry) => String(entry.name || "")).filter((url) => /\/video\//i.test(url)).map((url) => ({
					tagName: "VIDEO",
					currentSrc: url
				})), true, tile);
				if (performanceAssets.length > 0) return performanceAssets;
				const pageAssets = await resultAssetsFromMedia$1(jobId, activeDeps.findElements(activeDeps.SELECTORS.resultMedia).filter(activeDeps.isVisible), expectVideo, tile);
				if (pageAssets.length > 0) return pageAssets;
			}
		}
		return [];
	}
	function isImageOnlyVideoReveal(tile, expectVideo) {
		return expectVideo && activeDeps.flowTileIsImageOnlyResult(tile);
	}
	async function resultAssetsFromCurrentJobTiles$1(jobId, tiles, expectVideo) {
		const providerFailure = flowProviderFailureText();
		if (providerFailure) throw new Error(providerFailure);
		const freshTiles = tiles.filter((tile) => isFreshTileForJob$1(jobId, tile));
		if (expectVideo && tiles.length > 0 && freshTiles.length === 0) activeDeps.flowTrace(jobId, "Skipped visible Flow video tiles because they existed before this job baseline.", .94, "generating");
		const directAssets = await resultAssetsFromMedia$1(jobId, freshTiles.flatMap((tile) => activeDeps.mediaElementsIn(tile)), expectVideo);
		if (directAssets.length > 0) return directAssets;
		for (const tile of freshTiles) {
			if (flowTileBlockingError$1(tile)) continue;
			const revealedAssets = await revealMediaFromFlowTile$1(jobId, tile, expectVideo);
			if (revealedAssets.length > 0) return revealedAssets;
		}
		return [];
	}
	function isFreshTileForJob$1(jobId, tile) {
		const baseline = activeDeps.flowJobBaselines()[jobId];
		return isFreshFlowTile({
			tileId: flowResultTileId(tile, activeDeps.tileMediaUrls(tile)),
			editId: activeDeps.flowTileEditId(tile),
			mediaUrls: activeDeps.tileMediaUrls(tile)
		}, baseline);
	}
	async function captureLatestFlowResult$1(jobId, expectVideo) {
		const baseline = activeDeps.flowJobBaselines()[jobId];
		if (!baseline) return [];
		return resultAssetsFromCurrentJobTiles$1(jobId, newGenerationTiles$1(new Set(baseline.beforeTileIds), baseline).reverse(), expectVideo);
	}
	function visibleFlowResultTiles$1() {
		const seen = /* @__PURE__ */ new Set();
		return Array.from(document.querySelectorAll(FLOW_RESULT_TILE_SELECTOR)).filter((tile) => {
			const tileId = flowResultTileId(tile, activeDeps.tileMediaUrls(tile));
			if (!tileId || !activeDeps.isVisible(tile) || activeDeps.mediaElementsIn(tile).length === 0 && !activeDeps.flowTileMayRevealMedia(tile)) return false;
			const rect = tile.getBoundingClientRect();
			const seenKey = `${tileId}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
			if (seen.has(seenKey)) return false;
			seen.add(seenKey);
			return true;
		}).sort((left, right) => {
			const a = left.getBoundingClientRect();
			const b = right.getBoundingClientRect();
			return a.y - b.y || a.x - b.x;
		});
	}
	function visibleFlowImageTiles$1() {
		const seen = /* @__PURE__ */ new Set();
		return Array.from(document.querySelectorAll(FLOW_RESULT_TILE_SELECTOR)).filter((tile) => {
			const tileId = flowResultTileId(tile, activeDeps.tileMediaUrls(tile));
			if (!tileId || !activeDeps.isVisible(tile) || activeDeps.mediaElementsIn(tile).length > 0 || !tile.querySelector("img")) return false;
			const rect = tile.getBoundingClientRect();
			const seenKey = `${tileId}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
			if (seen.has(seenKey)) return false;
			seen.add(seenKey);
			return true;
		});
	}
	async function revealVisibleFlowTileLabels$1() {
		for (const tile of visibleFlowImageTiles$1()) {
			const target = tile.querySelector("img, button, [role='button']") || tile;
			const rect = target.getBoundingClientRect();
			target.dispatchEvent(new PointerEvent("pointermove", {
				bubbles: true,
				cancelable: true,
				clientX: rect.left + rect.width / 2,
				clientY: rect.top + rect.height / 2,
				pointerType: "mouse"
			}));
			target.dispatchEvent(new MouseEvent("mouseover", {
				bubbles: true,
				cancelable: true
			}));
			target.dispatchEvent(new MouseEvent("mouseenter", {
				bubbles: true,
				cancelable: true
			}));
			await activeDeps.sleep(80);
		}
	}
	async function captureRecoverableVisibleFlowResult$1(job, expectVideo, allowVisibleFallback = false) {
		const baseline = activeDeps.flowJobBaselines()[job.jobId];
		const beforeTileIds = new Set(baseline?.beforeTileIds || []);
		const strictAssets = await captureLatestFlowResult$1(job.jobId, expectVideo);
		if (strictAssets.length > 0) return strictAssets;
		await revealVisibleFlowTileLabels$1();
		if (expectVideo) {
			const freshVideoTiles = currentJobTiles$1(job.jobId, beforeTileIds).filter(activeDeps.flowTileHasVideoMedia);
			const visibleVideoAssets = await resultAssetsFromCurrentJobTiles$1(job.jobId, freshVideoTiles.slice(0, 2), true);
			if (visibleVideoAssets.length > 0) {
				activeDeps.flowTrace(job.jobId, `Recovered visible Flow video from fresh job tiles only (${visibleVideoAssets.length}).`, .96, "downloading");
				return visibleVideoAssets;
			}
		}
		activeDeps.flowTrace(job.jobId, allowVisibleFallback ? "Strict Flow recovery found no fresh current-job media after refresh; visible project fallback is disabled to avoid attaching the wrong video." : "Strict Flow recovery found no fresh current-job media; visible/adjacent project fallback is disabled to avoid attaching the wrong video.", .94, "downloading");
		return [];
	}
	async function waitForResults$1(job, expectVideo, beforeGenerationTileIds, maxWaitMs = 6e5) {
		const start = Date.now();
		while (Date.now() - start < maxWaitMs) {
			await activeDeps.sleep(3e3);
			if (await pollFlowResult$1(job, expectVideo, beforeGenerationTileIds, start, maxWaitMs)) return;
		}
		if (expectVideo && await recoverLateFlowResult$1(job)) return;
		activeDeps.reportResult(job.jobId, "failed_retryable", void 0, "Timeout waiting for Google Flow result");
	}
	async function pollFlowResult$1(job, expectVideo, baseline, start, maxWaitMs) {
		if (activeDeps.flowPageErrorText()) {
			reloadFlowForResultRecovery$1(job, "Flow crashed while generation was active; reloading to recover this job without resubmitting...");
			return true;
		}
		const providerFailure = flowProviderFailureText();
		if (providerFailure) {
			activeDeps.reportResult(job.jobId, "failed_retryable", void 0, `${providerFailure} Use a neutral prompt without potentially sensitive public-figure wording, then retry.`);
			return true;
		}
		const gate = activeDeps.isManualGate();
		if (gate) {
			activeDeps.reportResult(job.jobId, "waiting_manual_action", void 0, gate);
			return true;
		}
		const tiles = currentJobTiles$1(job.jobId, baseline);
		const tilePercent = tiles.map((tile) => activeDeps.flowTilePercent(tile)).find((value) => value !== null);
		const progress = tilePercent === void 0 ? Math.min((Date.now() - start) / maxWaitMs, .95) : Math.max(.01, Math.min(tilePercent / 100, .95));
		const generationVisible = tiles.some((tile) => flowTileHasGenerationSignal$1(tile, expectVideo));
		activeDeps.reportStatus(job.jobId, generationVisible ? "generating" : "submitting", generationVisible ? `Flow generation tile detected; provider accepted submit. Generating... ${Math.round(progress * 100)}%` : "Flow submit was clicked, but no generation tile is visible yet; provider acceptance is not confirmed.", progress);
		if (activeDeps.findElement(activeDeps.SELECTORS.loadingIndicator)) return false;
		return handleSettledFlowPoll$1(job, expectVideo, tiles, Date.now() - start, progress);
	}
	async function handleSettledFlowPoll$1(job, expectVideo, tiles, waitedMs, progress) {
		const assets = await resultAssetsFromCurrentJobTiles$1(job.jobId, tiles, expectVideo);
		if (assets.length > 0) return finishFlowResult$1(job.jobId, assets, `Google Flow result media detected on current job tiles only (${assets.length} ${expectVideo ? "video" : "asset"}).`);
		const blockingError = tiles.map(flowTileBlockingError$1).find((error) => Boolean(error));
		if (blockingError) {
			activeDeps.reportResult(job.jobId, "waiting_manual_action", void 0, blockingError);
			return true;
		}
		if (expectVideo && waitedMs > 3e4 && await recoverSettledFlowVideo$1(job)) return true;
		reportLateFlowHydrationStatus$1(job.jobId, expectVideo, tiles.length, waitedMs, progress);
		if (shouldFailSettledVideo$1(expectVideo, tiles, waitedMs)) {
			activeDeps.reportResult(job.jobId, "failed_retryable", void 0, activeDeps.flowImageOnlyVideoError(tiles.length));
			return true;
		}
		const failedTile = tiles.find(flowTileFailed$1);
		if (!failedTile) return false;
		activeDeps.reportResult(job.jobId, "failed_retryable", void 0, `Google Flow reported generation failure and no usable media was found: ${activeDeps.compactText(failedTile.innerText || "", 220)}`);
		return true;
	}
	async function recoverSettledFlowVideo$1(job) {
		const recovered = await captureRecoverableVisibleFlowResult$1(job, true, true);
		if (recovered.length <= 0) return false;
		return finishFlowResult$1(job.jobId, recovered, `Recovered visible Google Flow video after generation start (${recovered.length}).`);
	}
	function shouldFailSettledVideo$1(expectVideo, tiles, waitedMs) {
		return expectVideo && tiles.length > 0 && tiles.every((tile) => flowTileFailed$1(tile) || flowTileBlockingError$1(tile) || activeDeps.flowTileIsImageOnlyResult(tile)) && visibleFlowResultTiles$1().filter(activeDeps.flowTileHasVideoMedia).length === 0 && waitedMs > 18e4;
	}
	function reportLateFlowHydrationStatus$1(jobId, expectVideo, tileCount, waitedMs, progress) {
		if (!expectVideo || tileCount > 0) return;
		if (waitedMs > 75e3) activeDeps.reportStatus(jobId, "submitting", "Flow has not exposed a generation tile; continuing the bounded wait without reload or resubmit.", progress);
		else if (waitedMs > 3e4) activeDeps.reportStatus(jobId, "submitting", "Flow submit click returned, but provider acceptance remains unconfirmed until a generation tile appears.", progress);
	}
	async function finishFlowResult$1(jobId, assets, message) {
		activeDeps.flowTrace(jobId, `${message} Downloading into the desktop app...`, .96, "downloading");
		await activeDeps.reportDoneAndClearFlowDraft(jobId, assets);
		return true;
	}
	async function recoverLateFlowResult$1(job) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < 12e4) {
			const assets = await captureRecoverableVisibleFlowResult$1(job, true, true);
			if (assets.length > 0) return finishFlowResult$1(job.jobId, assets, `Recovered visible Google Flow video during late-result grace (${assets.length}).`);
			activeDeps.reportStatus(job.jobId, "submitting", "Flow still has no strictly attributable video tile; waiting through the bounded late-result grace without resubmitting...", .95);
			await activeDeps.sleep(3e3);
		}
		return false;
	}
	function createFlowResultRecovery(deps) {
		activeDeps = deps;
		return {
			newGenerationTiles: newGenerationTiles$1,
			currentJobTiles: currentJobTiles$1,
			flowTileFailed: flowTileFailed$1,
			flowTileBlockingError: flowTileBlockingError$1,
			flowProviderFailureText,
			flowTileHasGenerationSignal: flowTileHasGenerationSignal$1,
			reloadFlowForResultRecovery: reloadFlowForResultRecovery$1,
			waitForGenerationStart: waitForGenerationStart$1,
			normalizeFlowMediaUrl: normalizeFlowMediaUrl$1,
			resultAssetsFromMedia: resultAssetsFromMedia$1,
			revealMediaFromFlowTile: revealMediaFromFlowTile$1,
			resultAssetsFromCurrentJobTiles: resultAssetsFromCurrentJobTiles$1,
			isFreshTileForJob: isFreshTileForJob$1,
			captureLatestFlowResult: captureLatestFlowResult$1,
			visibleFlowResultTiles: visibleFlowResultTiles$1,
			visibleFlowImageTiles: visibleFlowImageTiles$1,
			revealVisibleFlowTileLabels: revealVisibleFlowTileLabels$1,
			captureRecoverableVisibleFlowResult: captureRecoverableVisibleFlowResult$1,
			waitForResults: waitForResults$1,
			pollFlowResult: pollFlowResult$1,
			handleSettledFlowPoll: handleSettledFlowPoll$1,
			recoverSettledFlowVideo: recoverSettledFlowVideo$1,
			shouldFailSettledVideo: shouldFailSettledVideo$1,
			reportLateFlowHydrationStatus: reportLateFlowHydrationStatus$1,
			finishFlowResult: finishFlowResult$1,
			recoverLateFlowResult: recoverLateFlowResult$1
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-job-runtime.ts
	function readFlowJobBaselines(host, key) {
		if (!host.__studioFlowJobBaselines) try {
			host.__studioFlowJobBaselines = JSON.parse(host.localStorage.getItem(key) || host.sessionStorage.getItem(key) || "{}");
		} catch {
			host.__studioFlowJobBaselines = {};
		}
		return host.__studioFlowJobBaselines;
	}
	function persistFlowJobBaselines$1(host, key) {
		try {
			const entries = Object.entries(readFlowJobBaselines(host, key)).sort(([, left], [, right]) => right.submittedAt - left.submittedAt).slice(0, 30);
			const serialized = JSON.stringify(Object.fromEntries(entries));
			host.localStorage.setItem(key, serialized);
			host.sessionStorage.setItem(key, serialized);
		} catch {}
	}
	function runningFlowJobIds$1(host) {
		host.__studioFlowRunningJobIds ||= /* @__PURE__ */ new Set();
		return host.__studioFlowRunningJobIds;
	}
	function flowJobRunTokens$1(host) {
		host.__studioFlowJobRunTokens ||= {};
		return host.__studioFlowJobRunTokens;
	}
	function nextFlowJobRunToken$1(host, jobId) {
		const tokens = flowJobRunTokens$1(host);
		tokens[jobId] = Number(tokens[jobId] || 0) + 1;
		return tokens[jobId];
	}
	function throwIfFlowJobRunStale$1(host, jobId, runToken) {
		if (flowJobRunTokens$1(host)[jobId] !== runToken) {
			const error = /* @__PURE__ */ new Error("Google Flow job was cancelled or superseded by a newer retry.");
			error.name = "FlowJobCancelled";
			throw error;
		}
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-dom-utils.ts
	function findElement(selectors) {
		for (const selector of selectors) try {
			const element = document.querySelector(selector);
			if (element) return element;
		} catch {}
		return null;
	}
	function findElements(selectors) {
		const results = /* @__PURE__ */ new Set();
		for (const selector of selectors) try {
			document.querySelectorAll(selector).forEach((element) => results.add(element));
		} catch {}
		return Array.from(results);
	}
	function humanDelay(minMs = 650, maxMs = 1250) {
		return Math.round(minMs + Math.random() * Math.max(0, maxMs - minMs));
	}
	function setNativeInputValue(element, value) {
		const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
		(Object.getOwnPropertyDescriptor(proto, "value")?.set)?.call(element, value);
	}
	function dispatchFlowInput(element, inputType = "insertText", data = "") {
		try {
			element.dispatchEvent(new InputEvent("beforeinput", {
				bubbles: true,
				cancelable: true,
				composed: true,
				inputType,
				data
			}));
		} catch {}
		try {
			element.dispatchEvent(new InputEvent("input", {
				bubbles: true,
				composed: true,
				inputType,
				data
			}));
		} catch {
			element.dispatchEvent(new Event("input", {
				bubbles: true,
				composed: true
			}));
		}
		element.dispatchEvent(new Event("change", { bubbles: true }));
	}
	function promptCompareKey(text) {
		return text.replace(/\s+/g, "").trim();
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-page-errors.ts
	/** Pure classification of provider-page failures; DOM orchestration remains in content.ts. */
	function flowCrashMessage(value) {
		return /Application error:\s*a client-side exception has occurred/i.test(value) ? "Google Flow crashed with a client-side exception. Reload the Flow project tab, then retry the job." : null;
	}
	function flowChromeErrorMessage(value) {
		return /Aw,\s*Snap|This page isn'?t working|chrome-error:\/\/|ERR_[A-Z_]+/i.test(value) ? "Google Flow browser tab is in a Chrome error state. Reload the Flow project tab, then retry the job." : null;
	}
	function flowAuthMessage(value, href) {
		return /accounts\.google\.com|ServiceLogin|Đăng nhập|Sign in/i.test(value) && !/labs\.google\/fx\/vi\/tools\/flow\/project/i.test(href) ? "Google Flow needs sign-in before automation can continue." : null;
	}
	function flowSubmitRejectionMessage(value) {
		return /bạn phải cung cấp câu lệnh|you must provide (?:a )?prompt|prompt (?:is )?required|enter a prompt|nhập câu lệnh/i.test(value) ? "Google Flow rejected the submit because the prompt/source was not present after the click. Retry after clearing the composer; the app will not count this as a completed video." : null;
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-workspace.ts
	function flowProjectBaseUrl(urlValue = "") {
		try {
			const url = new URL(urlValue);
			return `${url.origin}${url.pathname.replace(/\/(?:tool|tool-version)\/[^/]+$/i, "").replace(/\/edit\/.*$/i, "").replace(/\/+$/, "")}`;
		} catch {
			return urlValue;
		}
	}
	function flowWorkspaceMatches(expectedUrl, activeUrl) {
		return !expectedUrl || flowProjectBaseUrl(expectedUrl) === flowProjectBaseUrl(activeUrl);
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-bridge-call.ts
	function bridgeCall$1(action, payload = {}, timeoutMs = 2500) {
		const requestId = `flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
		return new Promise((resolve) => {
			const timeout = window.setTimeout(() => {
				window.removeEventListener("message", onMessage);
				resolve({
					source: "studio-flow-bridge-result",
					requestId,
					ok: false,
					error: "Flow main-world bridge did not respond."
				});
			}, timeoutMs);
			function onMessage(event) {
				if (event.source !== window || event.data?.source !== "studio-flow-bridge-result" || event.data.requestId !== requestId) return;
				window.clearTimeout(timeout);
				window.removeEventListener("message", onMessage);
				resolve(event.data);
			}
			window.addEventListener("message", onMessage);
			window.postMessage({
				source: "studio-flow-bridge",
				requestId,
				action,
				...payload
			}, "*");
		});
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-async.ts
	async function withTimeout(promise, timeoutMs, fallback) {
		let timeoutId;
		const timeout = new Promise((resolve) => {
			timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
		});
		try {
			return await Promise.race([promise, timeout]);
		} finally {
			if (timeoutId !== void 0) window.clearTimeout(timeoutId);
		}
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-diagnostics.ts
	function flowPageErrorText$1(input) {
		const value = `${input.href} ${input.title} ${input.bodyText}`.replace(/\s+/g, " ").trim();
		return input.crash(value) || input.chrome(value) || input.auth(value, input.href);
	}
	function flowDebugSnapshot$1(input) {
		return `url=${input.pathname}; title=${input.title}; pageError=${input.pageError || "none"}; prompt=${input.promptInfo}; buttons=[${input.buttons.join(" | ")}]; panels=[${input.panels.join(" || ")}]; fileInputs=[${input.fileInputs.join(", ")}]`;
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-reference-ledger.ts
	function readLedgerJson(key) {
		try {
			return JSON.parse(window.localStorage.getItem(key) || "{}");
		} catch {
			return {};
		}
	}
	function writeLedgerJson(key, value, limit) {
		try {
			const entries = Object.entries(value).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, limit);
			window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
		} catch {}
	}
	function referenceFingerprint$1(deps, reference) {
		if (!reference) return null;
		const normalizedData = deps.referenceDataUrl(reference).replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
		const dataPart = normalizedData ? `${normalizedData.length}:${normalizedData.slice(0, 64)}:${normalizedData.slice(-64)}` : "";
		return deps.normalizedToken(`${[
			reference.assetId,
			reference.filename,
			reference.mimeType
		].filter(Boolean).join(":")}:${dataPart}`).slice(0, 220);
	}
	function createFlowReferenceLedger(deps) {
		const cacheKey = "studio.flow.referenceTileCache.v1";
		const ledgerKey = "studio.flow.referenceUploadLedger.v1";
		const expectedComposerMediaUrlsByReference = /* @__PURE__ */ new Map();
		const referenceFingerprintForLedger = (reference) => referenceFingerprint$1(deps, reference);
		const currentFlowProjectPath = () => location.pathname.replace(/\/edit\/.*$/i, "").replace(/\/$/, "");
		const markFlowReferencePresent = (reference, source) => {
			const fingerprint = referenceFingerprintForLedger(reference);
			if (!fingerprint || !reference) return;
			const ledger = readLedgerJson(ledgerKey);
			ledger[fingerprint] = {
				projectPath: currentFlowProjectPath(),
				filename: reference.filename || reference.assetId || "reference",
				source,
				updatedAt: Date.now()
			};
			writeLedgerJson(ledgerKey, ledger, 160);
		};
		const flowReferenceWasUploadedInCurrentProject = (reference) => {
			const fingerprint = referenceFingerprintForLedger(reference);
			if (!fingerprint) return false;
			const entry = readLedgerJson(ledgerKey)[fingerprint];
			return Boolean(entry && entry.projectPath === currentFlowProjectPath());
		};
		const flowReferenceUploadEntry = (reference) => {
			const fingerprint = referenceFingerprintForLedger(reference);
			if (!fingerprint) return null;
			const entry = readLedgerJson(ledgerKey)[fingerprint];
			return entry && entry.projectPath === currentFlowProjectPath() ? entry : null;
		};
		const rememberFlowTileForReference = (reference, tile) => {
			const fingerprint = referenceFingerprintForLedger(reference);
			if (!fingerprint) return;
			const urls = deps.tileMediaUrls(tile);
			if (urls.length) expectedComposerMediaUrlsByReference.set(fingerprint, urls);
			markFlowReferencePresent(reference, "verified-existing");
			let tileId = tile.dataset.tileId || tile.getAttribute("data-tile-id") || tile.dataset.mediaId || tile.getAttribute("data-media-id") || "";
			if (!tileId) {
				const image = tile.querySelector("img[src], img[currentSrc]");
				for (const source of [
					image?.currentSrc || "",
					image?.src || "",
					...urls
				]) try {
					const value = new URL(source, location.href).searchParams.get("name");
					if (value) {
						tileId = value;
						break;
					}
				} catch {}
			}
			if (!tileId) return;
			const cache = readLedgerJson(cacheKey);
			cache[fingerprint] = {
				tileId,
				updatedAt: Date.now()
			};
			writeLedgerJson(cacheKey, cache, 80);
		};
		const readFlowReferenceCache = () => readLedgerJson(cacheKey);
		return {
			expectedComposerMediaUrlsByReference,
			referenceFingerprint: referenceFingerprintForLedger,
			markFlowReferencePresent,
			flowReferenceWasUploadedInCurrentProject,
			flowReferenceUploadEntry,
			rememberFlowTileForReference,
			readFlowReferenceCache
		};
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-reference-data.ts
	function referenceDataUrl(reference) {
		return reference.base64 || reference.filePath || "";
	}
	function hasUsableReference(reference) {
		const data = referenceDataUrl(reference);
		return Boolean(data && (/^data:image\/[^;]+;base64,/i.test(data) || reference.base64));
	}
	function dataUrlToFile(reference) {
		const data = referenceDataUrl(reference);
		if (!data) return null;
		const mimeType = reference.mimeType || data.match(/^data:([^;]+);base64,/i)?.[1] || "image/png";
		const normalizedBase64 = data.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
		if (!normalizedBase64) return null;
		const binary = atob(normalizedBase64);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
		return new File([bytes], reference.filename || `${reference.assetId}.png`, { type: mimeType });
	}
	function referenceLocalFilePath(reference) {
		const filePath = String(reference.filePath || "");
		if (/^https?:\/\/127\.0\.0\.1:\d+\/media\//i.test(filePath)) try {
			return decodeURIComponent(new URL(filePath).pathname.replace(/^\/media\//, ""));
		} catch {
			return "";
		}
		if (filePath.startsWith("file://")) try {
			return decodeURIComponent(new URL(filePath).pathname);
		} catch {
			return filePath.slice(7);
		}
		return filePath.startsWith("/") ? filePath : "";
	}
	/**
	* Persisted jobs deliberately keep a durable filePath instead of image bytes.
	* Flow's picker contract needs bytes, so hydrate only the in-memory execution
	* copy. Callers must not write the returned object back to studio state.
	*/
	async function hydrateReference(reference) {
		if (reference?.base64) return reference;
		const filePath = String(reference?.filePath || "");
		const source = /^https?:\/\/127\.0\.0\.1:\d+\/media\//i.test(filePath) ? filePath : "";
		if (!source || typeof fetch !== "function") return reference;
		const response = await fetch(source);
		if (!response.ok) throw new Error(`Could not read Flow reference ${reference?.assetId || "unknown"} from local media server (HTTP ${response.status}).`);
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (!bytes.length) throw new Error(`Local Flow reference ${reference?.assetId || "unknown"} was empty.`);
		let binary = "";
		for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
		const mimeType = reference.mimeType || response.headers.get("content-type")?.split(";", 1)[0] || "image/png";
		return {
			...reference,
			mimeType,
			base64: `data:${mimeType};base64,${btoa(binary)}`
		};
	}
	async function hydrateReferences(references) {
		return Promise.all((references || []).map(hydrateReference));
	}
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/flow-selectors.ts
	var FLOW_SELECTORS = {
		promptInput: [
			"textarea[aria-label*=\"prompt\" i]",
			"textarea[placeholder*=\"Describe\" i]",
			"textarea[placeholder*=\"prompt\" i]",
			"[contenteditable=\"true\"][aria-label*=\"prompt\" i]",
			"[contenteditable=\"true\"]",
			".prompt-input textarea",
			"textarea"
		],
		fileInput: ["input[type=\"file\"][accept*=\"image\"]", "input[type=\"file\"]"],
		submitButton: [
			"button[aria-label*=\"Create\" i]",
			"button[aria-label*=\"Generate\" i]",
			"button[type=\"submit\"]"
		],
		loadingIndicator: [
			"[role=\"progressbar\"]",
			".loading",
			"[aria-busy=\"true\"]",
			".spinner"
		],
		resultMedia: [
			"video",
			"video source[src]",
			"video[src]",
			"a[href$=\".mp4\"]",
			"img[src*=\"generated\"]",
			"img[alt*=\"Generated\"]",
			"flow-video-tile img.thumbnail",
			"flow-video-tile img[alt*=\"video\" i]"
		],
		workspaceHints: [
			"textarea",
			"[contenteditable=\"true\"]",
			"[aria-label*=\"prompt\" i]",
			"[placeholder*=\"prompt\" i]"
		]
	};
	//#endregion
	//#region ../../packages/extension-providers/src/google-flow/content.ts
	console.log("[Studio] Google Flow adapter loaded");
	var FLOW_ADAPTER_INSTANCE_ID = "2026-07-19-flow-native-add-v124";
	var FLOW_ROUTE_HANDOFF_KEY = "studio.flow.route-handoff";
	var FLOW_RESULT_RECOVERY_KEY = "studio.flow.result-recovery";
	var FLOW_DIRECT_BRIDGE_URL = "ws://127.0.0.1:3767";
	var FLOW_EXTENSION_VERSION = chrome.runtime.getManifest().version;
	var flowWindow = window;
	var FLOW_JOB_BASELINES_KEY = "studio.flow.jobBaselines.v1";
	var lastNativeMouseClickDiagnostic = "";
	var lastStartFramePickerDiagnostic = "";
	var flowTerminalJobIds = /* @__PURE__ */ new Set();
	var flowJobBaselines = () => readFlowJobBaselines(flowWindow, FLOW_JOB_BASELINES_KEY);
	var persistFlowJobBaselines = () => persistFlowJobBaselines$1(flowWindow, FLOW_JOB_BASELINES_KEY);
	var runningFlowJobIds = () => runningFlowJobIds$1(flowWindow);
	var flowJobRunTokens = () => flowJobRunTokens$1(flowWindow);
	var nextFlowJobRunToken = (jobId) => nextFlowJobRunToken$1(flowWindow, jobId);
	var throwIfFlowJobRunStale = (jobId, runToken) => throwIfFlowJobRunStale$1(flowWindow, jobId, runToken);
	var mediaElementsIn = (scope) => mediaElementsIn$1(scope, SELECTORS.resultMedia);
	var flowTilePercent = flowTilePercent$1;
	var closestFlowResultTile = closestFlowResultTile$1;
	var flowTileLinks = flowTileLinks$1;
	var flowResultMedia = createFlowResultMedia({
		mediaElementsIn,
		flowTileLinks,
		visibleText
	});
	function tileMediaUrls(tile) {
		return tileMediaUrls$1(tile, mediaElementsIn);
	}
	var { flowMediaUrl, flowTileEditId, isFlowVideoMediaElement, flowTileHasVideoMedia, flowTileHasStaticImageMedia, flowTileIsImageOnlyResult, flowImageOnlyVideoError, flowTileMayRevealMedia } = flowResultMedia;
	var flowSdkSelectionQueue = [];
	var flowSdkSelectionErrors = /* @__PURE__ */ new Map();
	function flowMediaIdFromTile(tile) {
		if (!tile) return "";
		const explicit = tile.dataset.mediaId || tile.getAttribute("data-media-id") || "";
		if (/^fe_id_/i.test(explicit)) return explicit;
		const direct = tile.dataset.tileId || tile.getAttribute("data-tile-id") || "";
		if (/^fe_id_/i.test(direct)) return direct;
		const image = tile.querySelector("img[src]");
		if (image?.src) try {
			const value = new URL(image.src, location.href).searchParams.get("name");
			if (/^fe_id_/i.test(value || "")) return String(value);
		} catch {}
		return "";
	}
	function cancelFlowJobRun(jobId) {
		nextFlowJobRunToken(jobId);
		runningFlowJobIds().delete(jobId);
		if (runningFlowJobIds().size === 0) clearAcceptedFlowDraft(jobId);
	}
	var SELECTORS = FLOW_SELECTORS;
	var { activeFlowPromptEditor, getComposerRoot, composerPanelRoot, promptAttachmentElements, promptAttachmentCount } = createFlowComposerSurface({
		isVisible,
		flowEditableText,
		compactText,
		visibleText
	});
	var { simulateClick, elementCenter, simulatePointerDrag, mediaPickerDialogs, mediaUploadMenus, closeMediaPickerIfOpen, findFloatingFlowCloseButtons, visibleTransientOverlays, closeOverlay } = createFlowDomControls({
		isVisible,
		visibleText,
		humanPause: (minMs = 650, maxMs = 1250) => new Promise((resolve) => setTimeout(resolve, humanDelay(minMs, maxMs)))
	});
	var { flowGateFromText, isManualGate, findFlowAccountTarget, flowGridCreateButton } = createFlowWorkspaceGates({
		isVisible,
		visibleText
	});
	var { isFlowFrameSlot, compareFlowFrameSlots, flowStartOrEndFrameSlots, flowStartFrameSlots, flowDirectFrameAttachmentElements, flowStartFrameSlotLooksAttached, flowStartFrameAttachmentRemoveButtons, directFrameAttachmentCount, flowComposerDropTargets, tileDragSource, addTileDataToTransfer } = createFlowFrameDom({
		visibleText,
		isVisible,
		getComposerRoot,
		activeFlowPromptEditor
	});
	var bridgeCall = bridgeCall$1;
	var lastFlowValidationFailure = "";
	function isVideoJob(payload) {
		const requestedMode = String(payload.settings?.mode || payload.settings?.providerMode || payload.settings?.flowResultType || payload.settings?.resultType || "").toLowerCase();
		if (requestedMode === "image") return false;
		if (requestedMode === "video") return true;
		return String(payload.task || "").includes("video");
	}
	async function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	async function humanPause(minMs = 650, maxMs = 1250) {
		await sleep(humanDelay(minMs, maxMs));
	}
	function flowDebugSnapshot() {
		const pageError = flowPageErrorText();
		const visibleButtons = Array.from(document.querySelectorAll("button, [role='button']")).filter(isVisible).slice(-18).map((element) => compactText(visibleText(element), 70)).filter(Boolean);
		const panels = Array.from(document.querySelectorAll("[role=\"dialog\"], [role=\"menu\"], [role=\"listbox\"], [data-radix-popper-content-wrapper], [data-state=\"open\"]")).filter(isVisible).slice(-4).map((element) => compactText(element.innerText || "", 140)).filter(Boolean);
		const fileInputs = Array.from(document.querySelectorAll("input[type=\"file\"]")).map((input) => input.getAttribute("accept") || "any").slice(-8);
		const promptEditor = activeFlowPromptEditor();
		const promptRect = promptEditor?.getBoundingClientRect();
		const promptText = promptEditor ? compactText(flowEditableText(promptEditor), 120) : "";
		const promptInfo = promptEditor ? `${promptEditor.tagName}@${Math.round(promptRect?.x || 0)},${Math.round(promptRect?.y || 0)} ${Math.round(promptRect?.width || 0)}x${Math.round(promptRect?.height || 0)} "${promptText}"` : "none";
		return flowDebugSnapshot$1({
			pageError,
			pathname: location.pathname,
			title: document.title || "",
			promptInfo,
			buttons: visibleButtons,
			panels,
			fileInputs
		});
	}
	function flowPageErrorText() {
		return flowPageErrorText$1({
			href: location.href,
			title: document.title || "",
			bodyText: document.body?.innerText || "",
			crash: flowCrashMessage,
			chrome: flowChromeErrorMessage,
			auth: flowAuthMessage
		});
	}
	function reportFlowPageError(jobId, phase = "") {
		const pageError = flowPageErrorText();
		if (!pageError) return false;
		reportResult(jobId, "failed_retryable", void 0, `${pageError}${phase ? ` ${phase}` : ""} ${flowDebugSnapshot()}`);
		return true;
	}
	function flowSubmitRejectionText() {
		return flowSubmitRejectionMessage(Array.from(document.querySelectorAll("[role=\"alert\"], [aria-live=\"assertive\"], [aria-live=\"polite\"], .mat-mdc-snack-bar-container")).filter(isVisible).map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" "));
	}
	function reportFlowSubmitRejection(jobId) {
		const rejection = flowSubmitRejectionText();
		if (!rejection) return false;
		reportResult(jobId, "failed_retryable", void 0, `${rejection} ${flowDebugSnapshot()}`);
		return true;
	}
	function verifyLockedFlowWorkspace(payload) {
		const expected = String(payload.settings?.providerWorkspaceUrl || "");
		if (flowWorkspaceMatches(expected, location.href)) return true;
		reportResult(payload.jobId, "waiting_manual_action", void 0, `This job is locked to ${flowProjectBaseUrl(expected)}, but the active tab is ${flowProjectBaseUrl(location.href)}. Open the original Google Flow project/account and recover the job. The extension did not submit again.`);
		return false;
	}
	async function recoverFlowPageIfCrashed(payload) {
		const jobId = payload.jobId;
		const pageError = flowPageErrorText();
		if (!pageError) return true;
		reportResult(jobId, "failed_retryable", void 0, `${pageError} Flow setup stopped before submit; reopen the exact project and retry manually. ${flowDebugSnapshot()}`);
		return false;
	}
	function flowTrace(jobId, message, progress, status = "submitting") {
		console.log(`[Studio][Flow][${jobId}] ${message}`, flowDebugSnapshot());
		reportStatus(jobId, status, message, progress);
	}
	async function revealFlowImageLibrary(jobId) {
		await closeMediaPickerIfOpen();
		const imageTab = Array.from(document.querySelectorAll("button, [role='button'], [aria-label]")).filter((element) => {
			if (!isVisible(element)) return false;
			const rect = element.getBoundingClientRect();
			const text = `${element.getAttribute("aria-label") || ""} ${visibleText(element)}`.trim();
			return rect.left < window.innerWidth * .18 && rect.top > window.innerHeight * .18 && rect.top < window.innerHeight * .65 && /hình ảnh|image|xem hình ảnh/i.test(text);
		}).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
		if (imageTab) {
			flowTrace(jobId, "Returning to Flow image library before matching the uploaded keyframe.", .39);
			simulateClick(imageTab);
			await humanPause(650, 1100);
		}
		await waitForStableFlowTiles(2500);
		await revealReadyImageTileLabels(visibleReadyImageTiles().slice(0, 20));
	}
	async function closeTransientFlowOverlays(jobId) {
		const overlays = visibleTransientOverlays();
		if (overlays.length) flowTrace(jobId, `Closing ${overlays.length} transient Flow overlay(s) before continuing.`, .65);
		for (const overlay of overlays) await closeOverlay(overlay);
		const floatingCloseButtons = findFloatingFlowCloseButtons();
		if (!overlays.length && !floatingCloseButtons.length) return;
		if (!overlays.length && floatingCloseButtons.length) flowTrace(jobId, `Closing ${floatingCloseButtons.length} floating Flow overlay control(s) before continuing.`, .65);
		for (const button of floatingCloseButtons) {
			simulateClick(button);
			await humanPause(250, 450);
		}
		document.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		await humanPause(450, 800);
	}
	async function checkVisibleFlowAccountGate(jobId) {
		await closeTransientFlowOverlays(jobId);
		const existingGate = isManualGate();
		if (existingGate) {
			reportResult(jobId, "waiting_manual_action", void 0, existingGate);
			return true;
		}
		const accountTarget = findFlowAccountTarget();
		if (!accountTarget) return false;
		simulateClick(accountTarget);
		await sleep(900);
		const openedGate = isManualGate();
		document.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true
		}));
		await sleep(250);
		await closeTransientFlowOverlays(jobId);
		if (!openedGate) return false;
		reportResult(jobId, "waiting_manual_action", void 0, openedGate || void 0);
		return true;
	}
	async function ensureFlowWorkspace(jobId) {
		if (!/\/fx\/(?:[^/]+\/)?tools\/flow\/project\/[^/]+|^\/project\/[^/]+(?:\/(?:edit|tool|tool-version)\/[^/]+)?\/?$/i.test(location.pathname)) {
			reportResult(jobId, "waiting_manual_action", void 0, "Google Flow must be opened on a project URL like /fx/vi/tools/flow/project/... before video automation can run.");
			return false;
		}
		if (getComposerRoot() || activeFlowPromptEditor()) return true;
		for (let attempt = 0; attempt < 20; attempt++) {
			await sleep(500);
			if (getComposerRoot() || activeFlowPromptEditor()) return true;
			if (reportFlowPageError(jobId)) return false;
		}
		const gate = isManualGate();
		if (gate) {
			reportResult(jobId, "waiting_manual_action", void 0, gate);
			return false;
		}
		if (findElement(SELECTORS.workspaceHints) && getComposerRoot()) return true;
		if (/bắt đầu tạo hoặc thả nội dung nghe nhìn|start creating or drop media|cài đặt tác nhân|agent settings/i.test(document.body?.innerText || "")) {
			flowTrace(jobId, "Google Flow agent shell detected; continuing so media upload can prime the classic composer.", .08);
			return true;
		}
		if (await openFlowComposerFromProjectGrid(jobId)) return true;
		reportResult(jobId, "waiting_manual_action", void 0, `Google Flow project is open, but the video composer could not be opened from the project grid. ${flowDebugSnapshot()}`);
		return false;
	}
	async function openFlowComposerFromProjectGrid(jobId) {
		for (let attempt = 0; attempt < 3; attempt++) {
			const button = flowGridCreateButton();
			if (!button) break;
			flowTrace(jobId, `Opening Google Flow composer from project grid via ${compactText(visibleText(button), 80) || button.tagName}.`, .09, "opening_provider");
			simulateClick(button);
			const startedAt = Date.now();
			while (Date.now() - startedAt < 6e3) {
				if (getComposerRoot() || activeFlowPromptEditor()) return true;
				if (reportFlowPageError(jobId)) return false;
				await sleep(300);
			}
			await humanPause(500, 900);
		}
		return openNewFlowProjectComposer(jobId);
	}
	async function openNewFlowProjectComposer(jobId) {
		if (/^\/project\/[^/]+\/?$/i.test(location.pathname)) return false;
		const toolRoot = `${location.origin}/fx/vi/tools/flow`;
		if (!/^\/fx\/(?:[^/]+\/)?tools\/flow\/?$/i.test(location.pathname)) {
			flowTrace(jobId, "Flow project grid has no classic composer entrypoint; opening Flow root to create a fresh video project instead of clicking media-grid controls.", .09, "opening_provider");
			location.assign(toolRoot);
			await sleep(6500);
		}
		for (let attempt = 0; attempt < 3; attempt++) {
			const newProjectButton = Array.from(document.querySelectorAll("button, [role='button']")).filter(isVisible).find((button) => /dự án mới|new project|add_2/i.test(visibleText(button)));
			if (!newProjectButton) {
				await humanPause(500, 900);
				continue;
			}
			flowTrace(jobId, `Opening fresh Google Flow project via ${compactText(visibleText(newProjectButton), 80)}.`, .1, "opening_provider");
			await clickElementNative(newProjectButton);
			const startedAt = Date.now();
			while (Date.now() - startedAt < 9e3) {
				if (/\/fx\/(?:[^/]+\/)?tools\/flow\/project\/[^/]+/i.test(location.pathname) && getComposerRoot()) return true;
				if (reportFlowPageError(jobId)) return false;
				await sleep(300);
			}
		}
		return false;
	}
	async function clickVisibleText(patterns, scope = document) {
		const match = Array.from(scope.querySelectorAll("button, [role='button'], [role='tab'], [aria-haspopup], label")).find((element) => {
			const rect = element.getBoundingClientRect();
			const text = visibleText(element);
			return rect.width > 0 && rect.height > 0 && patterns.some((pattern) => pattern.test(text));
		});
		if (!match) return { ok: false };
		await clickElementNative(match);
		await humanPause();
		return {
			ok: true,
			via: "text",
			text: compactText(visibleText(match), 90)
		};
	}
	async function clickVisibleElement(element) {
		await clickElementNative(element);
		await humanPause();
	}
	async function acceptFlowUploadConsentIfPresent(jobId) {
		const scope = Array.from(document.querySelectorAll("[role=\"dialog\"], [role=\"alertdialog\"], [data-state=\"open\"]")).filter((element) => isVisible(element) && /thông báo|notice|rights|quyền|responsibly|trách nhiệm|tôi đồng ý|i agree/i.test(element.innerText || "")).at(-1);
		if (!scope) return false;
		if ((await clickVisibleText([
			/^tôi đồng ý$/i,
			/^i agree$/i,
			/^agree$/i,
			/^accept$/i
		], scope)).ok) {
			flowTrace(jobId, "Accepted Flow upload responsibility notice.", .39);
			await sleep(900);
			return true;
		}
		return false;
	}
	var { waitForFileInput, requestNativeMouseClick, requestTobyFlowTextInsert, requestTobyFlowSubmit, runFlowMainWorldAction, clickFlowFrameSlot, clickElementNative, clickElementCenterNative, clickElementStrictNative, dispatchReferenceDrop, dragTileToComposer } = createFlowNativeInput({
		SELECTORS,
		addTileDataToTransfer,
		compactText,
		composerHasReferenceSource,
		directFrameAttachmentCount,
		elementCenter,
		flowComposerDropTargets,
		flowDebugSnapshot,
		flowPageErrorText,
		flowStartOrEndFrameSlots,
		flowTrace,
		getComposerRoot,
		humanPause,
		isVisible,
		promptAttachmentCount,
		reportResult,
		simulateClick,
		simulatePointerDrag,
		sleep,
		tileDragSource,
		visibleText,
		waitForComposerReference: waitForComposerReference$1,
		waitForPromptAttachmentIncrease: waitForPromptAttachmentIncrease$1
	});
	var { getActiveSettingsPanel, getComposerSettingsMenu, getComposerSettingsButton, composerSettingsText, composerShowsVideoMode, composerShowsImageMode, composerShowsAspectRatio, composerShowsDuration, isFlowAgentShellVisible, ensureFlowProjectRoute, openComposerSettingsMenu, ensureFlowVideoComposerMode, ensureFlowImageComposerMode, closeFlowSettingsPanelIfOpen, ensureFlowAgentModeOff, clickByIdSuffix, clickInComposerSettings, clickInComposerSettingsBounded } = createFlowComposerDom({
		SELECTORS,
		activeFlowPromptEditor,
		clickElementNative,
		clickVisibleElement,
		clickVisibleText,
		runFlowMainWorldAction,
		closeMediaPickerIfOpen,
		closeTransientFlowOverlays,
		compactText,
		flowDebugSnapshot,
		flowTrace,
		getComposerRoot,
		humanPause,
		isVisible,
		normalizedFlowControlText,
		openFlowComposerFromProjectGrid,
		openNewFlowProjectComposer: openFlowComposerFromProjectGrid,
		reportResult,
		resolveProviderVideoDuration,
		simulateClick,
		sleep,
		visibleText,
		withTimeout
	});
	var { promptTextMatches, clearFlowPromptEditor, stagePromptTextViaDom, stagePromptTextViaNative, stagePromptText, refreshPromptEditorState, waitForFlowPromptEditor } = createFlowPromptEditor({
		activeFlowPromptEditor,
		flowEditableText,
		promptCompareKey,
		compactText,
		simulateClick,
		elementCenter,
		humanPause,
		setNativeInputValue,
		dispatchFlowInput,
		runFlowMainWorldAction,
		runTobyFlowTextInsert: requestTobyFlowTextInsert,
		bridgeCall,
		sleep
	});
	var { aspectRatioSuffix, flowVideoSourceMode, flowComposerLooksVideoReady, waitForFlowComposerVideoReady, selectFlowVideoSourceMode, focusFlowStartFrameSlot, applyFlowAspectRatio, applyFlowDuration, applyFlowSettingsForJob } = createFlowComposerSettings({
		isVideoJob,
		composerShowsVideoMode,
		composerShowsImageMode,
		composerShowsAspectRatio,
		composerShowsDuration,
		sleep,
		getComposerRoot,
		activeFlowPromptEditor,
		openFlowComposerFromProjectGrid,
		flowTrace,
		ensureFlowVideoComposerMode,
		ensureFlowImageComposerMode,
		clickInComposerSettingsBounded,
		humanPause,
		flowStartOrEndFrameSlots,
		visibleText,
		clickFlowFrameSlot,
		closeFlowSettingsPanelIfOpen,
		resolveProviderVideoDuration
	});
	async function waitForReferencePicker(jobId) {
		let picker = await openFlowMediaPicker(jobId);
		const startedAt = Date.now();
		while (!picker && Date.now() - startedAt < 3e4) {
			picker = mediaPickerDialogs().at(-1) || null;
			if (!picker) await sleep(300);
		}
		return picker;
	}
	function findReferenceOption(reference, picker) {
		return exactReferenceOptionInOpenPicker(reference) || Array.from(new Set([...mediaPickerDialogs(), picker])).flatMap((root) => mediaPickerReferenceOptions(root)).find((candidate) => tileMatchesReference(reference, candidate)) || null;
	}
	async function disambiguatePickerReference(reference, options) {
		if (options.length <= 1) return options[0] || null;
		for (let offset = 0; offset < Math.min(options.length, 32); offset += 8) {
			const batch = options.slice(offset, Math.min(offset + 8, 32));
			const match = (await Promise.all(batch.map(async (option) => ({
				option,
				matched: await tileVisuallyMatchesReference(reference, option)
			})))).find((entry) => entry.matched)?.option;
			if (match) return match;
		}
		return null;
	}
	async function waitForReferenceOption(reference, picker, timeoutMs = 12e3) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const exactOption = findReferenceOption(reference, picker);
			if (exactOption) return exactOption;
			await sleep(250);
		}
		return null;
	}
	async function findVisibleReferenceReuse(context) {
		const { jobId, reference } = context;
		const tile = await findExistingUploadedReferenceTileByVisual(jobId, reference);
		if (!tile || !await waitForTileReady(tile, 4e3)) return null;
		flowTrace(jobId, `Flow main-grid inventory found the exact existing reference (${compactText(tileSearchText(tile), 90)}); skipping picker upload preflight.`, .326);
		rememberFlowTileForReference(reference, tile);
		return {
			attachedDirectly: false,
			tile,
			reference,
			reused: true
		};
	}
	async function findPickerReferenceReuse(context, picker, knownPresent) {
		const { jobId, reference } = context;
		await ensureFlowPickerInventoryCategory(jobId, picker, reference);
		const exactOption = await waitForReferenceOption(reference, picker);
		const matchingOptions = Array.from(new Set([...mediaPickerDialogs(), picker])).flatMap((root) => mediaPickerReferenceOptions(root)).filter((candidate) => tileMatchesReference(reference, candidate));
		const requiredFilename = (reference.filename || "").trim().toLowerCase();
		const selectedFilenameMatches = requiredFilename ? Array.from(new Set([...mediaPickerDialogs(), picker])).flatMap((root) => mediaPickerReferenceOptions(root)).filter((candidate) => candidate.getAttribute("aria-selected") === "true").filter((candidate) => visibleText(candidate).trim().toLowerCase().includes(requiredFilename)) : [];
		const rawSelectedFilenameMatches = requiredFilename ? Array.from(new Set([...mediaPickerDialogs(), picker])).flatMap((root) => Array.from(root.querySelectorAll("[role=\"option\"]"))).filter((candidate) => candidate.getAttribute("aria-selected") === "true").filter((candidate) => (candidate.innerText || candidate.textContent || "").trim().toLowerCase().includes(requiredFilename)) : [];
		const selectedExactOption = [...new Set([...selectedFilenameMatches, ...rawSelectedFilenameMatches])];
		const lateExactOption = selectedExactOption.length === 1 ? selectedExactOption[0] : matchingOptions.length > 1 ? await disambiguatePickerReference(reference, matchingOptions) : matchingOptions[0] || (matchingOptions.length === 0 ? exactOption : null);
		if (lateExactOption) {
			flowTrace(jobId, `Flow picker preflight found the exact existing reference (${compactText(tileSearchText(lateExactOption), 90)}); skipping upload.`, .329);
			rememberFlowTileForReference(reference, lateExactOption);
			return {
				attachedDirectly: false,
				tile: lateExactOption,
				reference,
				reused: true
			};
		}
		if (knownPresent) flowTrace(jobId, `Flow picker no longer exposes ledgered reference ${referenceRequiredLabel(reference)}; treating the ledger entry as stale and allowing one verified upload.`, .329);
		return null;
	}
	async function preflightReferenceReuse(context) {
		const { files, jobId, reference, requireDirectFrameAttachment, skipReuse } = context;
		if (skipReuse || requireDirectFrameAttachment) return null;
		const visibleReuse = await findVisibleReferenceReuse(context);
		if (visibleReuse) return visibleReuse;
		if (/\/edit\//i.test(location.pathname)) throw new Error(`Flow left the project base route before component preflight. Refusing any media click. ${flowDebugSnapshot()}`);
		flowTrace(jobId, "Opening the Flow component picker for exact filename preflight before any upload.", .327);
		const picker = await waitForReferencePicker(jobId);
		const knownPresent = flowReferenceWasUploadedInCurrentProject(reference);
		if (!picker) {
			const directImageInput = document.querySelector("input[type=\"file\"][accept*=\"image\"], input[type=\"file\"][accept=\"image/*\"]");
			if (!knownPresent && directImageInput) {
				flowTrace(jobId, "Flow picker is absent but the composer exposes a direct image file input; using the bounded direct-upload fallback.", .328);
				return null;
			}
			throw new Error(`Flow component picker did not open during reference preflight. Refusing library upload because the existing exact reference cannot be ruled out${knownPresent ? " and the project ledger explicitly blocks a duplicate upload" : ""}. ${flowDebugSnapshot()}`);
		}
		context.preflightPicker = picker;
		const pickerReuse = await findPickerReferenceReuse(context, picker, knownPresent);
		if (pickerReuse) return pickerReuse;
		if (/\/edit\//i.test(location.pathname)) {
			location.assign(`${location.origin}${location.pathname.replace(/\/edit\/.*$/i, "")}`);
			throw new Error("Flow navigated to a media edit route while opening the component picker. The adapter restored the project base page and blocked further clicks.");
		}
		flowTrace(jobId, `Flow picker preflight confirmed ${files[0]?.name || "the exact reference"} is absent; continuing to the single-upload phase.`, .329);
		context.pickerConfirmedAbsent = true;
		return null;
	}
	async function findCachedReferenceTile(context) {
		const { reference, pickerConfirmedAbsent, requireDirectFrameAttachment, skipReuse } = context;
		if (skipReuse || pickerConfirmedAbsent || requireDirectFrameAttachment) return null;
		let tile = findExistingUploadedReferenceTile(reference);
		if (!tile) {
			await revealReadyImageTileLabels(visibleReadyImageTiles().slice(0, 16));
			tile = findExistingUploadedReferenceTile(reference);
		}
		return tile;
	}
	async function reuseCachedReference(context) {
		const { jobId, reference, requireDirectFrameAttachment, skipReuse } = context;
		if (!skipReuse && !requireDirectFrameAttachment) flowTrace(jobId, "Flow reference inventory phase: checking visible/cached keyframe before any upload.", .33);
		if (await findCachedReferenceTile(context) && !requireDirectFrameAttachment) {
			const readyTile = await waitForExactReferenceTileReady(reference, 8e3);
			if (!readyTile) throw new Error(`Exact keyframe is already present in Flow but is not ready after waiting. Refusing to upload a duplicate copy. ${flowDebugSnapshot()}`);
			rememberFlowTileForReference(reference, readyTile);
			return {
				attachedDirectly: false,
				tile: readyTile,
				reference,
				reused: true
			};
		}
		if (!skipReuse && !requireDirectFrameAttachment) flowTrace(jobId, "No exact Flow library match found; visual-only reuse is disabled before upload to prevent wrong-reference videos.", .34);
		return null;
	}
	async function openReferenceUploadTarget(context) {
		const { files, jobId, preflightPicker, reference, requireDirectFrameAttachment } = context;
		if (requireDirectFrameAttachment) {
			if (await withTimeout(dispatchReferenceDrop(jobId, files), 12e3, false)) return {
				attachedDirectly: true,
				reference,
				reused: false
			};
			throw new Error(`Direct Flow start-frame drop did not attach within 12s. Refusing file-input fallback because it can leave Flow in the project grid or crash the app. ${flowDebugSnapshot()}`);
		}
		const picker = preflightPicker || await openFlowMediaPicker(jobId);
		if (picker) {
			const pickerTile = await exactPickerReference(reference, picker);
			if (pickerTile) {
				rememberFlowTileForReference(reference, pickerTile);
				return {
					attachedDirectly: false,
					tile: pickerTile,
					reference,
					reused: true
				};
			}
			if (!preflightPicker) {
				await closeMediaPickerIfOpen();
				await humanPause(350, 650);
			}
		}
		const uploadMenu = await openReferenceUploadMenu(jobId, preflightPicker);
		if (uploadMenu) return uploadMenu;
		if (await waitForFileInput(jobId, 1500, document)) {
			flowTrace(jobId, "Flow upload menu is absent but the composer image file input is available; dispatching the single bounded upload.", .35);
			return document;
		}
		await revealFlowImageLibrary(jobId);
		const libraryTile = await readyLibraryReference(reference);
		if (libraryTile) {
			rememberFlowTileForReference(reference, libraryTile);
			return {
				attachedDirectly: false,
				tile: libraryTile,
				reference,
				reused: true
			};
		}
		throw new Error(`Flow library upload menu did not open, and no exact existing keyframe could be matched in the visible Flow library. ${flowDebugSnapshot()}`);
	}
	async function exactPickerReference(reference, picker) {
		const livePicker = (await waitForMediaPickerContent(picker, 6e3)).picker;
		await revealReadyImageTileLabels(mediaPickerReferenceOptions(livePicker).slice(0, 20));
		const matchingOptions = mediaPickerReferenceOptions(livePicker).filter((candidate) => tileMatchesReference(reference, candidate));
		if (matchingOptions.length > 1) return disambiguatePickerReference(reference, matchingOptions);
		return matchingOptions[0] || exactReferenceOptionInOpenPicker(reference) || null;
	}
	async function openReferenceUploadMenu(jobId, preflightPicker) {
		if (preflightPicker && mediaPickerDialogs().includes(preflightPicker)) {
			const control = Array.from(preflightPicker.querySelectorAll("button, [role='button'], [role='menuitem'], div")).filter(isVisible).find((element) => /tải nội dung nghe nhìn lên|upload media|upload/i.test(visibleText(element))) || null;
			if (control) {
				await clickElementNative(control);
				await humanPause(500, 900);
				return mediaPickerDialogs().at(-1) || preflightPicker;
			}
			await closeMediaPickerIfOpen();
			await humanPause(350, 650);
		}
		return openFlowLibraryUploadMenu(jobId);
	}
	async function readyLibraryReference(reference) {
		const tile = findExistingUploadedReferenceTile(reference);
		return tile && await waitForTileReady(tile, 5e3) ? tile : null;
	}
	async function dispatchReferenceFile(context, uploadRoot) {
		const { files, jobId, reference } = context;
		const input = await waitForFileInput(jobId, 8e3, uploadRoot);
		if (!input) throw new Error(`Cannot find Google Flow upload input. ${flowDebugSnapshot()}`);
		const localFilePath = referenceLocalFilePath(reference);
		if (!(localFilePath ? await chrome.runtime.sendMessage({
			source: "google-flow-adapter",
			type: "NATIVE_SET_FILE_INPUT",
			filePaths: [localFilePath]
		}).catch(() => ({ ok: false })) : { ok: false })?.ok) {
			const transfer = new DataTransfer();
			for (const file of files.slice(0, 1)) transfer.items.add(file);
			const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files")?.set;
			if (setter) setter.call(input, transfer.files);
			else input.files = transfer.files;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
		}
		markFlowReferencePresent(reference, "upload-dispatched");
		await acceptFlowUploadConsentIfPresent(jobId);
	}
	function referenceAttachedSince(promptCount, frameCount) {
		return promptAttachmentCount() > promptCount || directFrameAttachmentCount() > frameCount || composerHasReferenceSource();
	}
	async function resolveDispatchedReference(context, baseline, promptCount, frameCount) {
		const { jobId, preflightPicker, reference, requireDirectFrameAttachment } = context;
		const firstWait = Date.now();
		while (Date.now() - firstWait < 6e3) {
			if (referenceAttachedSince(promptCount, frameCount)) return {
				attachedDirectly: true,
				reference,
				reused: false
			};
			await sleep(250);
		}
		if (!requireDirectFrameAttachment) {
			const livePicker = mediaPickerDialogs().at(-1) || preflightPicker;
			const stable = livePicker ? await waitForExactReferenceOptionInPicker(reference, livePicker, 12e4, 8) : null;
			if (stable) {
				rememberFlowTileForReference(reference, stable.option);
				return {
					attachedDirectly: false,
					tile: stable.option,
					reference,
					reused: false
				};
			}
		}
		const secondWait = Date.now();
		while (Date.now() - secondWait < 12e3) {
			if (reportFlowPageError(jobId)) throw new Error(`Google Flow crashed while receiving the keyframe file. ${flowDebugSnapshot()}`);
			if (referenceAttachedSince(promptCount, frameCount)) return {
				attachedDirectly: true,
				reference,
				reused: false
			};
			await sleep(300);
		}
		if (requireDirectFrameAttachment) throw new Error(`Flow accepted the file picker event, but the keyframe did not attach to the video start-frame slot. ${flowDebugSnapshot()}`);
		const exactTile = await waitForExactUploadedReferenceTile(jobId, reference, baseline, 3e4);
		if (exactTile) {
			rememberFlowTileForReference(reference, exactTile);
			return {
				attachedDirectly: false,
				tile: exactTile,
				reference,
				reused: false
			};
		}
		return resolveNewReferenceTile(context, baseline);
	}
	async function resolveNewReferenceTile(context, baseline) {
		const { jobId, reference } = context;
		const newTiles = await waitForNewMediaTiles(jobId, baseline, 3e4);
		if (!newTiles.length) {
			await revealFlowImageLibrary(jobId);
			const fallback = findExistingUploadedReferenceTile(reference);
			if (fallback && await waitForTileReady(fallback, 5e3)) {
				rememberFlowTileForReference(reference, fallback);
				return {
					attachedDirectly: false,
					tile: fallback,
					reference,
					reused: true
				};
			}
			throw new Error(`Flow accepted the file picker event, but no new uploaded media tile appeared. ${flowDebugSnapshot()}`);
		}
		await revealReadyImageTileLabels(newTiles);
		let tile = newTiles.find((candidate) => tileMatchesReference(reference, candidate)) || null;
		for (const candidate of tile ? [] : newTiles) if (await tileVisuallyMatchesReference(reference, candidate)) {
			tile = candidate;
			break;
		}
		if (!tile) throw new Error(`Flow uploaded ${newTiles.length} media tile(s), but none matched ${referenceRequiredLabel(reference)}. Refusing to attach an ambiguous image. ${flowDebugSnapshot()}`);
		rememberFlowTileForReference(reference, tile);
		return {
			attachedDirectly: false,
			tile,
			reference,
			reused: false
		};
	}
	async function getOrUploadReferenceTile(jobId, references, requireDirectFrameAttachment = false, skipReuse = false) {
		const usableReferences = references.filter(hasUsableReference);
		const files = usableReferences.map(dataUrlToFile).filter((file) => Boolean(file));
		if (!files.length) throw new Error("No usable keyframe file data was available for Google Flow.");
		const context = {
			files,
			jobId,
			pickerConfirmedAbsent: false,
			preflightPicker: null,
			reference: usableReferences[0],
			requireDirectFrameAttachment,
			skipReuse
		};
		if (flowReferenceWasUploadedInCurrentProject(context.reference)) flowTrace(jobId, `Reference ledger confirms ${referenceRequiredLabel(context.reference)} already exists in this Flow project; duplicate upload is locked out.`, .326);
		const preflight = await preflightReferenceReuse(context);
		if (preflight) return preflight;
		const cached = await reuseCachedReference(context);
		if (cached) return cached;
		const baseline = currentTileBaseline();
		const promptCount = promptAttachmentCount();
		const frameCount = directFrameAttachmentCount();
		const target = await openReferenceUploadTarget(context);
		if ("attachedDirectly" in target) return target;
		await dispatchReferenceFile(context, target);
		return resolveDispatchedReference(context, baseline, promptCount, frameCount);
	}
	async function primeFlowSdkMedia(jobId, references) {
		flowSdkSelectionQueue.splice(0, flowSdkSelectionQueue.length);
		const primed = [];
		for (const reference of references.filter(hasUsableReference)) {
			const selection = {
				jobId,
				reference
			};
			flowSdkSelectionQueue.push(selection);
			primed.push({ assetId: reference.assetId });
		}
		return primed;
	}
	async function resolveFlowSdkReference(selection) {
		const isStudioRuntimeTool = /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+(?:\/?$)/i.test(location.pathname);
		if (selection.preferDirectUpload || isStudioRuntimeTool || !getComposerRoot()) {
			await revealFlowImageLibrary(selection.jobId).catch(() => void 0);
			const visualExisting = await findExistingUploadedReferenceTileByVisual(selection.jobId, selection.reference);
			if (visualExisting && await waitForTileReady(visualExisting, 5e3)) return {
				attachedDirectly: false,
				tile: visualExisting,
				reference: selection.reference,
				reused: true
			};
			const existing = findExistingUploadedReferenceTile(selection.reference);
			if (existing && await waitForTileReady(existing, 5e3)) return {
				attachedDirectly: false,
				tile: existing,
				reference: selection.reference,
				reused: true
			};
		}
		if ((selection.preferDirectUpload || isStudioRuntimeTool || !getComposerRoot()) && document.querySelector("input[type=\"file\"]")) {
			const file = dataUrlToFile(selection.reference);
			if (file) {
				const baseline = currentTileBaseline();
				const context = {
					files: [file],
					jobId: selection.jobId,
					pickerConfirmedAbsent: true,
					preflightPicker: null,
					reference: selection.reference,
					requireDirectFrameAttachment: false,
					skipReuse: true
				};
				try {
					await dispatchReferenceFile(context, document);
					await revealFlowImageLibrary(selection.jobId);
					const tile = await waitForExactUploadedReferenceTile(selection.jobId, selection.reference, baseline, 3e4);
					if (tile) return {
						attachedDirectly: false,
						tile,
						reference: selection.reference,
						reused: false
					};
				} catch {}
			}
		}
		if (selection.preferDirectUpload) {
			const localFilePath = referenceLocalFilePath(selection.reference);
			const uploadMenu = await openFlowLibraryUploadMenu(selection.jobId).catch(() => null);
			const chooserButton = (uploadMenu ? Array.from(uploadMenu.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option'], div")) : flowLibraryUploadButtons()).filter(isVisible).filter((element) => /(?:tải nội dung nghe nhìn lên|tệp tải lên|tải lên|upload media|uploaded media|upload)/i.test(`${element.getAttribute("aria-label") || ""} ${visibleText(element)}`)).sort((left, right) => visibleText(left).length - visibleText(right).length)[0];
			if (localFilePath && chooserButton) {
				const rect = chooserButton.getBoundingClientRect();
				if ((await chrome.runtime.sendMessage({
					source: "google-flow-adapter",
					type: "NATIVE_UPLOAD_FILE_CHOOSER",
					x: rect.left + rect.width / 2,
					y: rect.top + rect.height / 2,
					filePaths: [localFilePath]
				}).catch(() => ({ ok: false })))?.ok) {
					await humanPause(1200, 1800);
					const mediaId = await (async () => {
						for (let attempt = 0; attempt < 10; attempt += 1) {
							const id = await lookupFlowProjectMediaId(selection.reference, true);
							if (id) return id;
							await humanPause(350, 650);
						}
						return "";
					})();
					if (mediaId) {
						const tile = document.createElement("div");
						tile.setAttribute("data-media-id", mediaId);
						return {
							attachedDirectly: false,
							tile,
							reference: selection.reference,
							reused: false
						};
					}
				}
			}
			try {
				if (await uploadReferenceThroughStartFramePicker(selection.jobId, selection.reference)) {
					const tile = await waitForExactUploadedReferenceTile(selection.jobId, selection.reference, currentTileBaseline(), 8e3) || findExistingUploadedReferenceTile(selection.reference);
					const mediaId = tile && flowMediaIdFromTile(tile);
					if (tile && mediaId) return {
						attachedDirectly: false,
						tile,
						reference: selection.reference,
						reused: false
					};
				}
			} catch (error) {
				flowTrace(selection.jobId, `Flow native chooser fallback did not resolve ${referenceRequiredLabel(selection.reference)}: ${error instanceof Error ? error.message : String(error)}`, .46);
			}
		}
		try {
			return await getOrUploadReferenceTile(selection.jobId, [selection.reference], false, false);
		} catch (error) {
			if (!/component picker did not open|library upload menu did not open/i.test(String(error))) throw error;
			const file = dataUrlToFile(selection.reference);
			if (!file) throw error;
			const baseline = currentTileBaseline();
			await dispatchReferenceFile({
				files: [file],
				jobId: selection.jobId,
				pickerConfirmedAbsent: true,
				preflightPicker: null,
				reference: selection.reference,
				requireDirectFrameAttachment: false,
				skipReuse: true
			}, document);
			const tile = await waitForExactUploadedReferenceTile(selection.jobId, selection.reference, baseline, 3e4);
			if (!tile) throw error;
			return {
				attachedDirectly: false,
				tile,
				reference: selection.reference,
				reused: false
			};
		}
	}
	async function attachComponentReferences(jobId, references, preparedPrimary) {
		const usableReferences = references.filter(hasUsableReference);
		if (usableReferences.length > 1) throw new Error(`This Google Flow composer is stable with exactly 1 complete shot keyframe, but this job contains ${usableReferences.length} image components. Keep semantic character, location, and prop continuity in the complete keyframe and prompt.`);
		let attached = 0;
		for (let index = 0; index < usableReferences.length; index++) if (await attachOneComponent(jobId, usableReferences[index], index, usableReferences.length, index === 0 ? preparedPrimary : void 0)) attached += 1;
		if (attached !== usableReferences.length) throw new Error(`Flow attached ${attached}/${usableReferences.length} required components. Refusing partial video submission.`);
		return attached;
	}
	async function attachOneComponent(jobId, reference, index, total, preparedPrimary) {
		const prepared = index === 0 && preparedPrimary ? preparedPrimary : await getOrUploadReferenceTile(jobId, [reference], false, false);
		const label = reference.referenceLabel || referenceRequiredLabel(reference);
		if (prepared.attachedDirectly) {
			flowTrace(jobId, `Flow attached component ${index + 1}/${total} directly (${label}).`, .46);
			return true;
		}
		const beforeAttachmentCount = promptAttachmentCount();
		flowTrace(jobId, `Attaching component ${index + 1}/${total}: ${label}.`, .44);
		if (!await addTileToPrompt(jobId, prepared.tile, beforeAttachmentCount, true, reference)) throw new Error(`Flow could not attach component ${index + 1}/${total} (${label}). Refusing to continue with an incomplete reference manifest. ${flowDebugSnapshot()}`);
		const expectedAttachmentCount = index + 1;
		if (!await waitForComposerReference$1(jobId, 2500, "components") || Math.max(promptAttachmentCount(), composerReferenceRemoveButtons().length) < expectedAttachmentCount) throw new Error(`Flow exact picker selection did not produce attachment ${expectedAttachmentCount}/${total} (${label}). ${flowDebugSnapshot()}`);
		rememberFlowTileForReference(reference, prepared.tile);
		return true;
	}
	async function attachExistingStartFrame(jobId, reference) {
		if (await attachReferenceThroughVisibleStartPicker(jobId, reference)) {
			flowTrace(jobId, "Start frame attached through the visible Flow Bắt đầu picker.", .5);
			return 1;
		}
		flowTrace(jobId, `Visible start-frame picker did not expose/attach ${referenceRequiredLabel(reference)}; uploading the exact keyframe through that picker instead of using the media grid.`, .44);
		if (await uploadReferenceThroughStartFramePicker(jobId, reference)) {
			flowTrace(jobId, "Start frame attached after exact upload through the Flow Bắt đầu picker.", .5);
			return 1;
		}
		throw new Error(`Flow start-frame picker did not attach ${referenceRequiredLabel(reference)}. Refusing media-grid fallback because it repeatedly creates duplicate or wrong-reference videos. ${flowDebugSnapshot()}`);
	}
	async function attachPreparedStartFrame(jobId, prepared) {
		const beforeAttachmentCount = promptAttachmentCount();
		flowTrace(jobId, "Attaching the matched keyframe through Flow's start-frame picker.", .44);
		if (!await addTileToPrompt(jobId, prepared.tile, beforeAttachmentCount, false, prepared.reference)) throw new Error(`Matched keyframe tile appeared in Flow, but it could not be attached through the start-frame picker. Refusing upload/file-input fallback in frame mode. ${flowDebugSnapshot()}`);
		rememberFlowTileForReference(prepared.reference, prepared.tile);
		return 1;
	}
	async function attachStartFrameReference(jobId, references, preparedReferenceTile) {
		if ((promptAttachmentCount() > 0 || directFrameAttachmentCount() > 0 || composerReferenceRemoveButtons().length > 0) && !await clearComposerReferences(jobId)) throw new Error(`Flow composer already contains ${promptAttachmentCount()} prompt source attachment(s) and ${directFrameAttachmentCount()} frame attachment(s). Refusing to add a start frame on top of an existing reference. ${flowDebugSnapshot()}`);
		const existingReference = references.find(hasUsableReference);
		if (flowStartFrameSlots().length === 0) throw new Error(`Flow frame-mode composer is not open: no visible Bắt đầu/start-frame slot was found. Refusing to upload the keyframe into the media grid because that creates duplicate library images without a video submit path. ${flowDebugSnapshot()}`);
		if (existingReference) return attachExistingStartFrame(jobId, existingReference);
		if (preparedReferenceTile?.attachedDirectly) {
			flowTrace(jobId, "Start frame is already attached directly in Flow.", .5);
			return 1;
		}
		if (preparedReferenceTile && !preparedReferenceTile.attachedDirectly) return attachPreparedStartFrame(jobId, preparedReferenceTile);
		throw new Error(`Flow start-frame picker did not receive a usable keyframe reference. Refusing media-grid upload fallback because it creates duplicate images without a verified video submit path. ${flowDebugSnapshot()}`);
	}
	var normalizedToken = normalizedReferenceToken;
	var referenceSearchTokens = referenceSearchTokens$1;
	var referenceRequiredLabel = referenceRequiredLabel$1;
	var { tileLooksBusy, tileHasReadyMedia, isVisibleReadyImageTile, visibleReadyImageTiles, findVisibleReadyImageTile } = createFlowResultTileInspector({
		flowImageTileRoot,
		tileCandidateScore,
		tileMediaUrls,
		imageLooksLikeFlowMedia,
		isVisible,
		visibleText
	});
	var { expectedComposerMediaUrlsByReference, referenceFingerprint, markFlowReferencePresent, flowReferenceWasUploadedInCurrentProject, flowReferenceUploadEntry, rememberFlowTileForReference, readFlowReferenceCache } = createFlowReferenceLedger({
		referenceDataUrl,
		normalizedToken,
		tileMediaUrls
	});
	var flowReferenceSearch = createFlowReferenceSearch({
		createFlowReferenceLedger,
		flowImageTileRoot,
		visibleReadyImageTiles,
		revealReadyImageTileLabels: (...args) => flowReferenceSearch?.revealReadyImageTileLabels(...args),
		compareImageFingerprints: fingerprintDistance,
		flowTrace,
		mediaPickerDialogs,
		mediaPickerReferenceOptions,
		normalizedToken,
		readFlowReferenceCache,
		referenceDataUrl,
		referenceFingerprint,
		referenceGeometryIsScoped,
		referenceRequiredLabel,
		referenceSearchTokens,
		rememberFlowTileForReference,
		sleep,
		tileMediaUrls,
		visibleText,
		isVisible
	});
	var { referenceTileGeometryLooksScoped, containsReferenceToken, referenceMediaTileCandidates, referenceMediaElements, isReferenceMediaCandidate, smallestReferenceCandidates, compareReferenceCandidates, tileMatchesReference, exactReferenceOptionInOpenPicker, loadComparableImage, imageFingerprint, tileVisuallyMatchesReference, tileSearchText, findExistingUploadedReferenceTile, findExistingUploadedReferenceTileByVisual, revealReadyImageTileLabels: runtimeRevealReadyImageTileLabels } = flowReferenceSearch;
	var revealReadyImageTileLabels = runtimeRevealReadyImageTileLabels;
	function currentTileBaseline() {
		const beforeTileTextById = {};
		const beforeTileMediaById = {};
		const beforeEditIds = /* @__PURE__ */ new Set();
		const beforeMediaUrls = /* @__PURE__ */ new Set();
		const beforeTileIds = Array.from(currentTileIds());
		for (const tile of flowResultTiles()) {
			const mediaUrls = tileMediaUrls(tile);
			const tileId = flowResultTileId(tile, mediaUrls);
			if (!tileId) continue;
			beforeTileTextById[tileId] = tileStableText(tile);
			beforeTileMediaById[tileId] = mediaUrls;
			mediaUrls.forEach((url) => beforeMediaUrls.add(url));
			const editId = flowTileEditId(tile);
			if (editId) beforeEditIds.add(editId);
		}
		return {
			beforeTileIds,
			beforeTileTextById,
			beforeTileMediaById,
			beforeEditIds: Array.from(beforeEditIds),
			beforeMediaUrls: Array.from(beforeMediaUrls),
			submittedAt: Date.now()
		};
	}
	async function waitForStableFlowTiles(timeoutMs = 2500) {
		const startedAt = Date.now();
		let previous = "";
		let stableCount = 0;
		while (Date.now() - startedAt < timeoutMs) {
			const signature = flowResultTiles().filter(isVisible).map((tile) => [
				flowResultTileId(tile, tileMediaUrls(tile)),
				flowTileEditId(tile),
				tileMediaUrls(tile).join("|")
			].join(":")).sort().join("\n");
			if (signature && signature === previous) {
				stableCount++;
				if (stableCount >= 2) return;
			} else {
				stableCount = 0;
				previous = signature;
			}
			await sleep(350);
		}
	}
	function pickerHasReadySelectedPreview(picker) {
		if (!Array.from(picker.querySelectorAll("button, [role='button'], [role='option']")).filter(isVisible).some((element) => /^(?:thêm vào câu lệnh|add to prompt|use in prompt)$/i.test(visibleText(element)))) return false;
		return Array.from(picker.querySelectorAll("img, video, canvas, [style*='background-image']")).filter(isVisible).some((element) => {
			const rect = element.getBoundingClientRect();
			if (rect.width < 160 || rect.height < 90) return false;
			if (element instanceof HTMLImageElement) return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
			if (element instanceof HTMLVideoElement) return element.readyState >= 1;
			return element instanceof HTMLCanvasElement || Boolean(element.style.backgroundImage) || tileHasReadyMedia(element);
		});
	}
	async function waitForTileReady(tile, timeoutMs) {
		const startedAt = Date.now();
		let stableReadyCount = 0;
		while (Date.now() - startedAt < timeoutMs) {
			if (document.contains(tile) && isVisible(tile) && !tileLooksBusy(tile) && tileHasReadyMedia(tile)) {
				stableReadyCount++;
				if (stableReadyCount >= 2) return true;
			} else stableReadyCount = 0;
			await sleep(350);
		}
		return false;
	}
	async function waitForExactReferenceTileReady(reference, timeoutMs) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const freshTile = findExistingUploadedReferenceTile(reference);
			if (freshTile && isVisible(freshTile) && !tileLooksBusy(freshTile) && tileHasReadyMedia(freshTile)) return freshTile;
			await sleep(350);
		}
		return null;
	}
	async function waitForNewMediaTiles(jobId, beforeTileBaseline, timeoutMs) {
		const startedAt = Date.now();
		const readyTiles = [];
		let lastCandidateCount = 0;
		const beforeTileIds = new Set(beforeTileBaseline.beforeTileIds);
		const beforeMediaUrls = new Set(beforeTileBaseline.beforeMediaUrls);
		const beforeEditIds = new Set(beforeTileBaseline.beforeEditIds);
		while (Date.now() - startedAt < timeoutMs) {
			const tiles = visibleReadyImageTiles().filter((tile) => isNewMediaTile(tile, beforeTileIds, beforeMediaUrls, beforeEditIds));
			if (tiles.length > 0) {
				if (tiles.length !== lastCandidateCount) {
					flowTrace(jobId, `Flow media tile appeared; waiting until upload finishes (${tiles.length} candidate).`, .4);
					lastCandidateCount = tiles.length;
				}
				for (const tile of tiles) {
					if (readyTiles.includes(tile)) continue;
					if (await waitForTileReady(tile, 900)) readyTiles.push(tile);
				}
				if (readyTiles.length > 0) break;
			}
			await sleep(500);
		}
		return readyTiles;
	}
	function isNewMediaTile(tile, beforeTileIds, beforeMediaUrls, beforeEditIds) {
		const tileId = tile.dataset.tileId || "";
		const editId = flowTileEditId(tile);
		const mediaUrls = tileMediaUrls(tile);
		if (tileId && beforeTileIds.has(tileId)) return false;
		if (editId && beforeEditIds.has(editId)) return false;
		if (mediaUrls.length && mediaUrls.every((url) => beforeMediaUrls.has(url))) return false;
		return Boolean(tileSearchText(tile) || mediaUrls.join("|")) && isVisible(tile);
	}
	async function waitForExactUploadedReferenceTile(jobId, reference, beforeTileBaseline, timeoutMs) {
		const startedAt = Date.now();
		const beforeTileIds = new Set(beforeTileBaseline.beforeTileIds);
		const beforeMediaUrls = new Set(beforeTileBaseline.beforeMediaUrls);
		const beforeEditIds = new Set(beforeTileBaseline.beforeEditIds);
		while (Date.now() - startedAt < timeoutMs) {
			const freshTiles = visibleReadyImageTiles().filter((tile) => isFreshUploadedTile(tile, beforeTileIds, beforeMediaUrls, beforeEditIds));
			const textMatch = freshTiles.find((tile) => tileMatchesReference(reference, tile));
			if (textMatch && await waitForTileReady(textMatch, 1200)) {
				flowTrace(jobId, `Matched freshly uploaded Flow tile by exact reference label (${referenceRequiredLabel(reference)}).`, .42);
				return textMatch;
			}
			for (const tile of freshTiles.slice(0, 12)) if (await tileVisuallyMatchesReference(reference, tile) && await waitForTileReady(tile, 1200)) {
				flowTrace(jobId, `Matched freshly uploaded Flow tile by exact image fingerprint (${referenceRequiredLabel(reference)}).`, .42);
				return tile;
			}
			await sleep(500);
		}
		return null;
	}
	function isFreshUploadedTile(tile, beforeTileIds, beforeMediaUrls, beforeEditIds) {
		const tileId = tile.dataset.tileId || "";
		const editId = flowTileEditId(tile);
		const mediaUrls = tileMediaUrls(tile);
		return !(tileId && beforeTileIds.has(tileId)) && !(editId && beforeEditIds.has(editId)) && !(mediaUrls.length && mediaUrls.every((url) => beforeMediaUrls.has(url)));
	}
	configureFlowComposerReferenceHelpers({
		promptAttachmentElements,
		tileMediaUrls,
		referenceFingerprint,
		expectedComposerMediaUrlsByReference,
		composerPanelRoot,
		findExistingUploadedReferenceTile,
		revealReadyImageTileLabels,
		tileMatchesReference,
		tileVisuallyMatchesReference,
		promptAttachmentCount,
		sleep,
		directFrameAttachmentCount,
		flowTrace,
		isVisible,
		visibleText,
		getComposerRoot,
		flowStartFrameAttachmentRemoveButtons,
		clickElementStrictNative,
		humanPause,
		activeFlowPromptEditor,
		clearFlowPromptEditor,
		closeMediaPickerIfOpen,
		openFlowComposerFromProjectGrid
	});
	configureFlowPickerHelpers({
		acceptFlowUploadConsentIfPresent,
		clickElementCenterNative,
		clickElementNative,
		clickElementStrictNative,
		clickFlowFrameSlot,
		closeMediaPickerIfOpen,
		compactText,
		compareStartFrameOptions,
		composerPanelRoot,
		dataUrlToFile,
		directFrameAttachmentCount,
		dragTileToComposer,
		exactReferenceOptionInOpenPicker,
		flowDebugSnapshot,
		flowStartFrameSlotLooksAttached,
		flowStartFrameSlots,
		flowStartFrameAttachmentRemoveButtons,
		flowStartOrEndFrameSlots,
		flowTrace,
		humanPause,
		isVisible,
		lastNativeMouseClickDiagnostic,
		lastStartFramePickerDiagnostic,
		mediaPickerDialogs,
		mediaPickerReferenceOptions,
		mediaUploadMenus,
		normalizedToken,
		pickerHasReadySelectedPreview,
		promptAttachmentCount,
		referenceLocalFilePath,
		referenceRequiredLabel,
		referenceSearchTokens,
		rememberFlowTileForReference,
		reportFlowPageError,
		revealReadyImageTileLabels,
		runFlowMainWorldAction,
		simulateClick,
		sleep,
		tileHasReadyMedia,
		tileLooksBusy,
		tileMatchesReference,
		tileSearchText,
		tileVisuallyMatchesReference,
		visibleText,
		waitForComposerReference: waitForComposerReference$1,
		waitForFileInput,
		waitForPromptAttachmentIncrease: waitForPromptAttachmentIncrease$1,
		waitForTileReady
	});
	function findFlowSubmitButton() {
		return Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => {
			if (!isVisible(button)) return false;
			const rect = button.getBoundingClientRect();
			const text = visibleText(button);
			return !(button instanceof HTMLButtonElement && button.disabled || button.getAttribute("aria-disabled") === "true") && rect.top > window.innerHeight * .55 && rect.left > window.innerWidth * .45 && rect.width >= 28 && rect.height >= 28 && /arrow_forward|tạo|generate|create|send|gửi/i.test(text);
		}).sort((a, b) => {
			const rectA = a.getBoundingClientRect();
			const rectB = b.getBoundingClientRect();
			return rectB.top - rectA.top || rectB.left - rectA.left;
		})[0] || null;
	}
	function findDisabledFlowSubmitButton() {
		return Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => {
			if (!isVisible(button)) return false;
			const rect = button.getBoundingClientRect();
			const text = visibleText(button);
			return (button instanceof HTMLButtonElement && button.disabled || button.getAttribute("aria-disabled") === "true") && rect.top > window.innerHeight * .55 && rect.left > window.innerWidth * .45 && rect.width >= 28 && rect.height >= 28 && /arrow_forward|tạo|generate|create|send|gửi/i.test(text);
		}).sort((a, b) => {
			const rectA = a.getBoundingClientRect();
			const rectB = b.getBoundingClientRect();
			return rectB.top - rectA.top || rectB.left - rectA.left;
		})[0] || null;
	}
	function flowSubmitState(button) {
		const editor = activeFlowPromptEditor();
		return {
			target: button ? {
				text: compactText(visibleText(button), 80),
				disabled: button instanceof HTMLButtonElement ? button.disabled : false,
				ariaDisabled: button.getAttribute("aria-disabled")
			} : void 0,
			slateTextLength: editor ? flowEditableText(editor).trim().length : 0,
			startFrameCount: directFrameAttachmentCount()
		};
	}
	async function clickFlowSubmitButton(jobId, timeoutMs = 8e3) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			if (reportFlowPageError(jobId)) return {
				attempted: false,
				ok: false,
				error: "Flow page error",
				...flowSubmitState()
			};
			const button = findFlowSubmitButton();
			if (button) {
				flowTrace(jobId, `Submitting Google Flow via visible composer button (${compactText(visibleText(button), 80)}).`, .7);
				const center = elementCenter(button);
				if (!document.querySelector(".ProseMirror") && await requestTobyFlowSubmit()) {
					await humanPause(900, 1500);
					return {
						attempted: true,
						ok: true,
						method: "tobyFlowSubmitBridge",
						...flowSubmitState(button)
					};
				}
				if (await requestNativeMouseClick(center.clientX, center.clientY, visibleText(button))) {
					await humanPause(900, 1500);
					return {
						attempted: true,
						ok: true,
						method: "nativeCoordinateClick",
						...flowSubmitState(button)
					};
				}
				await sleep(500);
				if (await requestNativeMouseClick(center.clientX, center.clientY, "")) {
					await humanPause(900, 1500);
					return {
						attempted: true,
						ok: true,
						method: "nativeCoordinateClickRetry",
						...flowSubmitState(button)
					};
				}
				flowTrace(jobId, `Trusted native submit click failed twice; falling back once (no diagnostic).`, .7);
				if (await runFlowMainWorldAction("submit")) {
					await humanPause(900, 1500);
					return {
						attempted: true,
						ok: true,
						method: "mainWorldSingleFallback",
						...flowSubmitState(button)
					};
				}
				return {
					attempted: false,
					ok: false,
					method: "nativeCoordinateClick",
					error: `Trusted Flow submit click failed: no native diagnostic`,
					...flowSubmitState(button)
				};
			}
			await sleep(300);
		}
		return {
			attempted: false,
			ok: false,
			error: "No enabled Flow submit button",
			...flowSubmitState()
		};
	}
	async function verifyPromptReady(jobId, timeoutMs = 3e3) {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const promptEditor = activeFlowPromptEditor();
			if (promptEditor) {
				const hasPlaceholder = !!promptEditor.querySelector("[data-slate-placeholder]");
				const domText = flowEditableText(promptEditor).trim();
				if (!hasPlaceholder && domText.length > 0) {
					flowTrace(jobId, `Prompt verified: ${domText.length} chars, placeholder gone.`, .66);
					return true;
				}
			}
			await sleep(200);
		}
		console.warn(`[Studio][Flow][${jobId}] Prompt verification timed out after ${timeoutMs}ms`);
		return false;
	}
	async function ensurePromptMatchesJob(jobId, prompt) {
		const promptEditor = activeFlowPromptEditor();
		if (!promptEditor) return false;
		const domText = flowEditableText(promptEditor).replace(/\s+/g, " ").trim();
		const expected = prompt.replace(/\s+/g, " ").trim();
		const domKey = promptCompareKey(domText);
		const expectedKey = promptCompareKey(expected);
		if (!domText || !expected) return false;
		if (domText === expected || domKey === expectedKey) return true;
		const sampleKey = promptCompareKey(compactText(expected, 90));
		if ((sampleKey.length > 0 ? domKey.split(sampleKey).length - 1 : 0) > 1 || domKey.length > expectedKey.length + 80) {
			flowTrace(jobId, `Flow prompt contains stale or repeated text (${domText.length} chars vs ${expected.length}); clearing and restaging once.`, .69);
			if (!(await stagePromptText(prompt, { clearFirst: true })).ok) return false;
			await sleep(500);
			const nextEditor = activeFlowPromptEditor();
			if (!nextEditor) return false;
			const nextKey = promptCompareKey(flowEditableText(nextEditor).replace(/\s+/g, " ").trim());
			return nextKey === expectedKey || nextKey.includes(sampleKey) && nextKey.length <= expectedKey.length + 80;
		}
		return domKey.includes(sampleKey);
	}
	async function clearAcceptedFlowDraft(jobId) {
		flowTrace(jobId, "Flow accepted generation; clearing the composer draft so it cannot be submitted again.", .74, "generating");
		const editor = activeFlowPromptEditor();
		if (editor) await clearFlowPromptEditor(editor);
		await clearComposerReferences(jobId);
		await closeMediaPickerIfOpen();
	}
	async function reportDoneAndClearFlowDraft(jobId, assets) {
		await clearAcceptedFlowDraft(jobId);
		reportResult(jobId, "done", assets);
	}
	async function validateFlowExecutionInputs(jobId, payload, videoSourceMode, referenceCount) {
		if (isVideoJob(payload) && videoSourceMode === "frames" && !getComposerRoot() && !await openFlowComposerFromProjectGrid(jobId)) {
			reportResult(jobId, "failed_retryable", void 0, `Google Flow frame mode needs the classic video composer, but the project grid/agent shell did not open it. Reload the Flow project tab or click Tạo once, then retry. ${flowDebugSnapshot()}`);
			return false;
		}
		if (isVideoJob(payload) && referenceCount === 0) {
			reportResult(jobId, "failed_retryable", void 0, payload.references?.length ? "Flow video job received reference metadata, but no usable scene keyframe image data URL/base64 was found." : "Flow video jobs need a scene keyframe image. Generate/select the scene keyframe before queueing video.");
			return false;
		}
		return true;
	}
	async function prepareFlowExecution(payload, runToken) {
		const { jobId, prompt } = payload;
		if (!await prepareFlowWorkspace(payload)) return null;
		throwIfFlowJobRunStale(jobId, runToken);
		const referenceCount = payload.references?.filter(hasUsableReference).length || 0;
		const primaryReference = payload.references?.find((reference) => hasUsableReference(reference) && reference.referenceRole === "shot_keyframe") || payload.references?.find(hasUsableReference);
		const videoSourceMode = isVideoJob(payload) ? flowVideoSourceMode(payload) : "components";
		const sourceLabel = videoSourceMode === "frames" ? "start frame" : "visual reference";
		if (!await validateFlowExecutionInputs(jobId, payload, videoSourceMode, referenceCount)) return null;
		return {
			jobId,
			payload,
			preparedReference: null,
			primaryReference,
			prompt,
			referenceCount,
			runToken,
			sourceLabel,
			videoSourceMode
		};
	}
	async function prepareFlowWorkspace(payload) {
		const { jobId } = payload;
		if (!verifyLockedFlowWorkspace(payload)) return false;
		if (!await recoverFlowPageIfCrashed(payload)) return false;
		if (!await ensureFlowProjectRoute(jobId)) return false;
		if (!await ensureFlowWorkspace(jobId)) return false;
		await closeFlowToolBuilderDrawerIfOpen(jobId);
		if (isVideoJob(payload) && await checkVisibleFlowAccountGate(jobId)) return false;
		return recoverFlowPageIfCrashed(payload);
	}
	async function closeFlowToolBuilderDrawerIfOpen(jobId) {
		const builderHeading = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']")).filter(isVisible).find((element) => /^(?:trình tạo công cụ|tool builder)$/i.test(compactText(visibleText(element), 80)));
		if (!builderHeading) return;
		const closeButton = Array.from(document.querySelectorAll("button, [role='button']")).filter(isVisible).filter((button) => {
			const rect = button.getBoundingClientRect();
			return rect.right > window.innerWidth * .9 && rect.top < 150;
		}).find((button) => /(?:^|\s)(?:close|đóng)(?:\s|$)/i.test(`${button.getAttribute("aria-label") || ""} ${visibleText(button)}`));
		if (!closeButton) {
			flowTrace(jobId, "Flow Tool Builder drawer is covering the project composer, but its close control was not found.", .075);
			return;
		}
		flowTrace(jobId, "Closing the Flow Tool Builder drawer before configuring the project video composer.", .075);
		await clickElementNative(closeButton);
		await humanPause(350, 650);
		if (builderHeading.isConnected && isVisible(builderHeading)) {
			closeButton.click();
			await humanPause(350, 650);
		}
	}
	async function clearFlowComposerForJob(context) {
		const { jobId, runToken } = context;
		await ensureFlowAgentModeOff(jobId);
		throwIfFlowJobRunStale(jobId, runToken);
		await closeFlowSettingsPanelIfOpen(jobId);
		if (!await clearComposerReferences(jobId)) {
			reportResult(jobId, "failed_retryable", void 0, `Flow composer still contains old source attachment(s). Clear the Flow composer or reload the project tab, then retry. ${flowDebugSnapshot()}`);
			return false;
		}
		await clearPersistedFlowPrompt(jobId);
		await sleep(200);
		throwIfFlowJobRunStale(jobId, runToken);
		return true;
	}
	async function clearPersistedFlowPrompt(jobId) {
		let editor = activeFlowPromptEditor();
		if (editor && flowEditableText(editor).trim()) {
			const discard = discardFlowPromptButton();
			if (discard && await clickElementStrictNative(discard)) {
				flowTrace(jobId, "Cleared the persisted Flow prompt with the composer discard control.", .245);
				await humanPause(450, 750);
				editor = activeFlowPromptEditor();
			}
			if (editor && flowEditableText(editor).trim()) {
				if ((await bridgeCall("clear", void 0, 4e3).catch(() => ({ ok: false })))?.ok) {
					flowTrace(jobId, "Cleared the Flow Slate prompt model through the main-world bridge.", .247);
					await humanPause(350, 650);
					editor = activeFlowPromptEditor();
				}
			}
			if (editor && flowEditableText(editor).trim()) await stagePromptTextViaDom("", true);
		}
	}
	async function primeFlowReference(context, reason) {
		flowTrace(context.jobId, reason, .31);
		const prepared = await withTimeout(getOrUploadReferenceTile(context.jobId, context.payload.references || [], false, false), 15e4, null);
		if (!prepared) throw new Error(`Timed out preparing the Google Flow component keyframe source. Reload Flow, then retry this video job. ${flowDebugSnapshot()}`);
		throwIfFlowJobRunStale(context.jobId, context.runToken);
		await ensureFlowAgentModeOff(context.jobId);
		await clearPersistedFlowPrompt(context.jobId);
		throwIfFlowJobRunStale(context.jobId, context.runToken);
		await closeFlowSettingsPanelIfOpen(context.jobId);
		await humanPause(900, 1500);
		return prepared;
	}
	function normalizeMissingFlowSettings(payload, missing) {
		return missing.some((item) => /timed out/i.test(item)) && flowComposerLooksVideoReady(payload) ? [] : missing;
	}
	async function prepareInitialComponentReference(context) {
		const { jobId, payload, referenceCount, videoSourceMode } = context;
		if (![
			isVideoJob(payload),
			videoSourceMode === "components",
			referenceCount > 0,
			!findVisibleReadyImageTile(),
			!flowComposerLooksVideoReady(payload)
		].every(Boolean)) return;
		context.preparedReference = await primeFlowReference(context, "Preparing Google Flow component source by uploading/reusing the keyframe before composer settings...");
	}
	async function retryAgentShellSettings(context, missing) {
		const { jobId, payload, referenceCount, runToken } = context;
		if (![
			isVideoJob(payload),
			missing.length,
			referenceCount > 0,
			isFlowAgentShellVisible()
		].every(Boolean)) return missing;
		reportStatus(jobId, "submitting", "Preparing Google Flow keyframe so the classic video controls become available...");
		context.preparedReference = await primeFlowReference(context, `Flow is in the agent shell; priming the classic composer before retrying settings (${missing.join(", ")}).`);
		const retried = await withTimeout(applyFlowSettingsForJob(jobId, payload), 12e3, ["Flow settings timed out after keyframe upload/reuse"]);
		throwIfFlowJobRunStale(jobId, runToken);
		return normalizeMissingFlowSettings(payload, retried);
	}
	async function applyInitialFlowSettings(context) {
		const { jobId, payload, runToken } = context;
		await prepareInitialComponentReference(context);
		let missing = normalizeMissingFlowSettings(payload, await withTimeout(applyFlowSettingsForJob(jobId, payload), 12e3, ["Flow settings timed out"]));
		throwIfFlowJobRunStale(jobId, runToken);
		if (isVideoJob(payload) && missing.length && await waitForFlowComposerVideoReady(payload, 5e3)) missing = [];
		missing = await retryAgentShellSettings(context, missing);
		if (isVideoJob(payload) && missing.length) {
			reportResult(jobId, "failed_retryable", void 0, `Google Flow video controls were not available (${missing.join(", ")}). Refusing to submit because Flow would create image tiles instead of a video. ${flowDebugSnapshot()}`);
			return false;
		}
		return true;
	}
	async function stageFlowJobPrompt(context) {
		const { jobId, prompt, runToken } = context;
		await closeFlowSettingsPanelIfOpen(jobId);
		await runFlowMainWorldAction("close-settings-menu");
		await humanPause(250, 450);
		throwIfFlowJobRunStale(jobId, runToken);
		if (!await waitForFlowPromptEditor(15e3)) {
			reportResult(jobId, "waiting_manual_action", void 0, `Google Flow composer controls appeared, but the Slate prompt editor did not hydrate within 15s. Reload the Flow project and retry this shot. ${flowDebugSnapshot()}`);
			return false;
		}
		const staged = await stagePromptText(prompt, { clearFirst: true });
		throwIfFlowJobRunStale(jobId, runToken);
		if (!staged.ok) {
			reportResult(jobId, "waiting_manual_action", void 0, `Could not find or control the Google Flow prompt editor. ${staged.error || flowDebugSnapshot()}`);
			return false;
		}
		if (!await verifyPromptReady(jobId, 3e3)) {
			await bridgeCall("insert", { text: prompt }, 4e3);
			await sleep(500);
			throwIfFlowJobRunStale(jobId, runToken);
			if (!await verifyPromptReady(jobId, 2e3)) {
				reportResult(jobId, "failed_retryable", void 0, `Prompt text was inserted but Slate editor did not update. ${flowDebugSnapshot()}`);
				return false;
			}
		}
		if (await ensurePromptMatchesJob(jobId, prompt)) return true;
		reportResult(jobId, "failed_retryable", void 0, `Flow prompt editor still contains stale or duplicated text before media attachment. Refusing to submit. ${flowDebugSnapshot()}`);
		return false;
	}
	async function syncPromptModelWithoutClearingMedia(jobId, prompt) {
		flowTrace(jobId, "Syncing Flow prompt model after source attach without clearing media...", .64);
		if ((await stagePromptText(prompt, { clearFirst: true })).ok) {
			await humanPause(500, 850);
			if (await ensurePromptMatchesJob(jobId, prompt)) {
				flowTrace(jobId, "Flow prompt model synced through TobyFlow's content-world ProseMirror path.", .65);
				return true;
			}
		}
		if (await runFlowMainWorldAction("clear-prompt")) {
			await humanPause(250, 450);
			if (await stagePromptTextViaNative(prompt) && await ensurePromptMatchesJob(jobId, prompt)) {
				flowTrace(jobId, "Flow prompt model synced via page-world clear plus trusted CDP text input.", .65);
				return true;
			}
		}
		const domSynced = await stagePromptTextViaDom(prompt, true);
		await humanPause(700, 1100);
		return domSynced && await ensurePromptMatchesJob(jobId, prompt);
	}
	async function attachFlowJobReferences(context) {
		const { jobId, payload, preparedReference, primaryReference, referenceCount, runToken, sourceLabel, videoSourceMode } = context;
		await closeFlowSettingsPanelIfOpen(jobId);
		throwIfFlowJobRunStale(jobId, runToken);
		if (!referenceCount) {
			reportStatus(jobId, "submitting", "Applying Google Flow video settings...");
			return true;
		}
		reportStatus(jobId, "submitting", `Checking/reusing ${referenceCount} ${sourceLabel}(s) in Google Flow before attach...`);
		let uploaded = 0;
		try {
			uploaded = videoSourceMode === "frames" ? await attachStartFrameReference(jobId, payload.references || [], preparedReference) : await attachComponentReferences(jobId, payload.references || [], preparedReference);
		} catch (error) {
			if (videoSourceMode === "frames") await clearFlowDraftBeforeRetry(jobId);
			if (videoSourceMode === "components" && flowPageErrorText()) {
				await recoverFlowPageIfCrashed(payload);
				return false;
			}
			reportResult(jobId, "failed_retryable", void 0, `Flow ${sourceLabel} could not be attached completely. ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
		throwIfFlowJobRunStale(jobId, runToken);
		if (!await waitForVerifiedComposerSource(jobId, 7e3, videoSourceMode, primaryReference, referenceCount)) {
			reportResult(jobId, "failed_retryable", void 0, `Flow composer ${sourceLabel} does not match ${referenceRequiredLabel(primaryReference)}. Refusing wrong-reference video. ${flowDebugSnapshot()}`);
			return false;
		}
		if (isVideoJob(payload) && referenceCount > 0 && !await syncPromptModelWithoutClearingMedia(jobId, payload.prompt)) {
			reportResult(jobId, "failed_retryable", void 0, `Flow prompt text was visible but could not be synced into the prompt model after source attach. Refusing submit to avoid the prompt-required rejection. ${flowDebugSnapshot()}`);
			return false;
		}
		reportStatus(jobId, "submitting", `Attached ${uploaded} ${sourceLabel}(s); verifying prompt and source frame before submit...`, void 0, (payload.references || []).filter(hasUsableReference).map((reference) => reference.assetId));
		return true;
	}
	async function recoverDisabledFlowSubmit(context) {
		const { jobId, primaryReference, prompt, referenceCount, runToken, videoSourceMode } = context;
		if (!findDisabledFlowSubmitButton() || findFlowSubmitButton()) return true;
		await refreshPromptEditorState();
		await humanPause(900, 1400);
		throwIfFlowJobRunStale(jobId, runToken);
		if (!await ensurePromptMatchesJob(jobId, prompt)) return false;
		return !referenceCount || waitForVerifiedComposerSource(jobId, 4e3, videoSourceMode, primaryReference, referenceCount);
	}
	async function restoreFlowSettingsBeforeSubmit(context) {
		const { jobId, payload, primaryReference, prompt, referenceCount, videoSourceMode } = context;
		if (!isVideoJob(payload)) return true;
		const readyBefore = await waitForFlowComposerVideoReady(payload, 1200);
		if (readyBefore) return true;
		const missing = await applyFlowSettingsForJob(jobId, payload);
		const readyAfter = await waitForFlowComposerVideoReady(payload, 3500);
		if (missing.length || !readyAfter) {
			lastFlowValidationFailure = missing.length ? `settings-missing:${missing.join(",")}` : "settings-not-ready";
			flowTrace(jobId, `Flow settings readiness failed (readyBefore=${readyBefore}; missing=${missing.join(",") || "none"}; readyAfter=${readyAfter}; video=${composerShowsVideoMode()}; ratio=${composerShowsAspectRatio(String(payload.settings?.aspectRatio || ""))}; duration=${composerShowsDuration(Number(payload.settings?.durationSec || 0))}).`, .68);
			return false;
		}
		if (!await ensurePromptMatchesJob(jobId, prompt)) {
			lastFlowValidationFailure = "prompt-after-settings";
			flowTrace(jobId, "Flow settings recovery reset the prompt model before submit.", .68);
			return false;
		}
		const sourceReady = !referenceCount || await waitForVerifiedComposerSource(jobId, 4e3, videoSourceMode, primaryReference, referenceCount);
		if (!sourceReady) {
			lastFlowValidationFailure = "source-after-settings";
			flowTrace(jobId, "Flow settings recovery reset the verified start-frame source before submit.", .68);
		}
		return sourceReady;
	}
	async function validateFlowPromptAndReference(context) {
		const { jobId, payload, primaryReference, prompt, referenceCount, videoSourceMode } = context;
		if (isVideoJob(payload) && referenceCount && findDisabledFlowSubmitButton() && !findFlowSubmitButton()) {
			await refreshPromptEditorState();
			await humanPause(700, 1100);
		}
		if (!await ensurePromptMatchesJob(jobId, prompt)) return false;
		return !referenceCount || waitForVerifiedComposerSource(jobId, 4e3, videoSourceMode, primaryReference, referenceCount);
	}
	async function validateFlowAttachmentRecovery(context) {
		const { jobId, payload, referenceCount, runToken } = context;
		if (!await recoverDisabledFlowSubmit(context)) return false;
		if (!referenceCount) return true;
		await sleep(2500);
		if (flowPageErrorText()) {
			await recoverFlowPageIfCrashed(payload);
			return false;
		}
		throwIfFlowJobRunStale(jobId, runToken);
		return recoverDisabledFlowSubmit(context);
	}
	async function validateFlowBeforeSubmit(context) {
		const { jobId, payload, primaryReference, referenceCount, videoSourceMode } = context;
		lastFlowValidationFailure = "";
		await closeFlowSettingsPanelIfOpen(jobId);
		await runFlowMainWorldAction("close-settings-menu");
		await humanPause(250, 450);
		if (!await validateFlowPromptAndReference(context)) {
			lastFlowValidationFailure = "prompt/reference";
			flowTrace(jobId, `Final gate failed: prompt/reference mismatch (${flowDebugSnapshot()}).`, .68);
			return false;
		}
		if (!await validateFlowAttachmentRecovery(context)) {
			lastFlowValidationFailure = "attachment-recovery";
			flowTrace(jobId, `Final gate failed: attachment recovery (${flowDebugSnapshot()}).`, .68);
			return false;
		}
		if (!await recoverFlowPageIfCrashed(payload)) {
			lastFlowValidationFailure = "page-error";
			flowTrace(jobId, `Final gate failed: provider page error (${flowDebugSnapshot()}).`, .68);
			return false;
		}
		await closeTransientFlowOverlays(jobId);
		if (!await restoreFlowSettingsBeforeSubmit(context)) {
			lastFlowValidationFailure ||= "settings/source";
			flowTrace(jobId, `Final gate failed: render settings/source readiness (${flowDebugSnapshot()}).`, .68);
			return false;
		}
		if (findDisabledFlowSubmitButton() && !findFlowSubmitButton()) {
			lastFlowValidationFailure = "disabled-submit";
			reportResult(jobId, "failed_retryable", void 0, `Flow kept the submit button disabled after confirmed component attach; refusing submit. ${flowDebugSnapshot()}`);
			return false;
		}
		if (payload.references?.length && !await waitForVerifiedComposerSource(jobId, 4e3, videoSourceMode, primaryReference, payload.references.length)) {
			lastFlowValidationFailure = "source-reset";
			reportResult(jobId, "failed_retryable", void 0, `Flow start-frame source was reset during final submit preparation. ${flowDebugSnapshot()}`);
			return false;
		}
		if (!await ensurePromptMatchesJob(jobId, payload.prompt)) {
			if (!(await stagePromptText(payload.prompt, { clearFirst: true })).ok || !await verifyPromptReady(jobId, 3e3) || !await ensurePromptMatchesJob(jobId, payload.prompt)) {
				lastFlowValidationFailure = "prompt-reset";
				reportResult(jobId, "failed_retryable", void 0, `Flow prompt was reset during final submit preparation. ${flowDebugSnapshot()}`);
				return false;
			}
			await humanPause(350, 650);
		}
		flowTrace(jobId, "Final gate: staging the verified prompt immediately before submit.", .69);
		if (!(await stagePromptText(payload.prompt, { clearFirst: true })).ok || !await ensurePromptMatchesJob(jobId, payload.prompt)) {
			lastFlowValidationFailure = "final-prompt-stage";
			reportResult(jobId, "failed_retryable", void 0, `Flow final Toby-style prompt staging did not persist before submit. ${flowDebugSnapshot()}`);
			return false;
		}
		flowTrace(jobId, "Final gate: prompt staging persisted; preparing the single submit action.", .695);
		await humanPause(350, 650);
		return true;
	}
	async function submitAndWaitForFlowResult(context) {
		const { jobId, payload, runToken } = context;
		await waitForStableFlowTiles();
		if (!await ensurePromptMatchesJob(jobId, payload.prompt)) {
			if (!(await stagePromptText(payload.prompt, { clearFirst: true })).ok || !await verifyPromptReady(jobId, 3e3) || !await ensurePromptMatchesJob(jobId, payload.prompt)) {
				reportResult(jobId, "failed_retryable", void 0, `Flow prompt was reset immediately before submit. ${flowDebugSnapshot()}`);
				return;
			}
			await humanPause(350, 650);
		}
		const baseline = currentTileBaseline();
		const beforeGenerationTileIds = new Set(baseline.beforeTileIds);
		flowJobBaselines()[jobId] = baseline;
		persistFlowJobBaselines();
		const boundaryState = flowSubmitState(findFlowSubmitButton());
		flowTrace(jobId, `Final submit boundary state: promptChars=${boundaryState.slateTextLength}; startFrames=${boundaryState.startFrameCount}; submitDisabled=${boundaryState.target?.disabled ?? "missing"}.`, .7);
		reportStatus(jobId, "submitting", `Flow pre-submit probe: promptChars=${boundaryState.slateTextLength}; startFrames=${boundaryState.startFrameCount}; submitDisabled=${boundaryState.target?.disabled ?? "missing"}.`);
		let submitAttempt = await clickFlowSubmitButton(jobId, 8e3);
		throwIfFlowJobRunStale(jobId, runToken);
		const submitDiagnostic = `method=${submitAttempt.method || "none"}; nativeClick=none; ok=${submitAttempt.ok}; attempted=${submitAttempt.attempted}; error=${submitAttempt.error || "none"}; target=${submitAttempt.target?.text || "none"}; disabled=${submitAttempt.target?.disabled ?? "unknown"}; aria-disabled=${submitAttempt.target?.ariaDisabled ?? "missing"}; slateChars=${submitAttempt.slateTextLength}; startFrames=${submitAttempt.startFrameCount}`;
		if (!submitAttempt.attempted) {
			reportResult(jobId, "waiting_manual_action", void 0, `Prompt staged, but Flow submit failed (${submitDiagnostic}). ${flowDebugSnapshot()}`);
			return;
		}
		flowTrace(jobId, `Flow submit attempted (${submitDiagnostic}); provider acceptance remains unconfirmed until a new generation tile appears.`, .72);
		if (!await waitForGenerationStart(payload, beforeGenerationTileIds, isVideoJob(payload))) return;
		throwIfFlowJobRunStale(jobId, runToken);
		await clearAcceptedFlowDraft(jobId);
		reportStatus(jobId, "generating", "Waiting for Google Flow result...");
		await waitForResults(payload, isVideoJob(payload), beforeGenerationTileIds);
	}
	async function handleFlowExecutionError(payload, error) {
		if (error instanceof Error && error.name === "FlowJobCancelled") return;
		if (/\/tools\/flow\/project\/[^/]+\/edit\//i.test(location.pathname)) {
			const basePath = location.pathname.replace(/\/edit\/.*$/i, "");
			sessionStorage.setItem(FLOW_ROUTE_HANDOFF_KEY, JSON.stringify({
				payload,
				savedAt: Date.now()
			}));
			reportStatus(payload.jobId, "opening_provider", "Google Flow opened a media item during setup; restoring the project workspace and resuming this job automatically...");
			location.assign(`${location.origin}${basePath}`);
			return;
		}
		if (flowPageErrorText()) {
			await recoverFlowPageIfCrashed(payload);
			return;
		}
		reportResult(payload.jobId, "failed_retryable", void 0, `Google Flow error: ${error instanceof Error ? error.message : String(error)}`);
	}
	async function executeJob(payload, runToken) {
		let hydratedPayload = payload;
		try {
			hydratedPayload = payload.references?.length ? {
				...payload,
				references: await hydrateReferences(payload.references)
			} : payload;
			const context = await prepareFlowExecution(hydratedPayload, runToken);
			if (!context || !await clearFlowComposerForJob(context)) return;
			if (!await applyInitialFlowSettings(context)) return;
			if (!await stageFlowJobPrompt(context)) return;
			if (!await attachFlowJobReferences(context)) return;
			if (!await validateFlowBeforeSubmit(context)) {
				reportResult(context.jobId, "failed_retryable", void 0, `Flow prompt, source frame, or render settings changed before submit (${lastFlowValidationFailure || "unknown gate"}). ${flowDebugSnapshot()}`);
				return;
			}
			await submitAndWaitForFlowResult(context);
		} catch (error) {
			await handleFlowExecutionError(hydratedPayload, error);
		}
	}
	var { newGenerationTiles, currentJobTiles, flowTileFailed, flowTileHasGenerationSignal, reloadFlowForResultRecovery, waitForGenerationStart, flowTileBlockingError, normalizeFlowMediaUrl, resultAssetsFromMedia, revealMediaFromFlowTile, resultAssetsFromCurrentJobTiles, isFreshTileForJob, captureLatestFlowResult, visibleFlowResultTiles, visibleFlowImageTiles, revealVisibleFlowTileLabels, captureRecoverableVisibleFlowResult, waitForResults, pollFlowResult, handleSettledFlowPoll, recoverSettledFlowVideo, shouldFailSettledVideo, reportLateFlowHydrationStatus, finishFlowResult, recoverLateFlowResult } = createFlowResultRecovery({
		flowJobBaselines,
		isVisible,
		tileMediaUrls,
		mediaElementsIn,
		flowTilePercent,
		...flowResultMedia,
		flowTileLinks,
		closestFlowResultTile,
		visibleText,
		isManualGate,
		reportStatus,
		reportResult,
		flowDebugSnapshot,
		flowTrace,
		flowPageErrorText,
		reportFlowSubmitRejection,
		reportDoneAndClearFlowDraft,
		findElements,
		SELECTORS,
		findElement,
		compactText,
		simulateClick,
		sleep,
		FLOW_RESULT_RECOVERY_KEY
	});
	function reportStatus(jobId, status, message, progress, providerReferenceAssetIds) {
		if (flowTerminalJobIds.has(jobId)) return;
		const data = {
			type: "JOB_STATUS",
			jobId,
			status,
			message,
			progress,
			providerWorkspaceUrl: location.href,
			providerReferenceAssetIds
		};
		try {
			chrome.runtime.sendMessage({
				source: "content-script",
				data
			}).catch(() => void 0);
		} catch {}
		sendDirectFlowBridgeMessage(data);
	}
	function reportResult(jobId, status, assets, error) {
		if ([
			"done",
			"failed",
			"failed_retryable",
			"failed_manual",
			"waiting_manual_action",
			"cancelled"
		].includes(status)) flowTerminalJobIds.add(jobId);
		const data = {
			type: "JOB_RESULT",
			jobId,
			status,
			assets,
			error
		};
		try {
			chrome.runtime.sendMessage({
				source: "content-script",
				data
			}).catch(() => void 0);
		} catch {}
		sendDirectFlowBridgeMessage(data);
	}
	var executeJobOnce = createFlowJobDispatcher({
		routeHandoffKey: FLOW_ROUTE_HANDOFF_KEY,
		runningFlowJobIds,
		flowJobRunTokens,
		nextFlowJobRunToken,
		reportStatus,
		reportResult,
		executeJob: (payload, runToken) => {
			flowTerminalJobIds.delete(payload.jobId);
			return executeJob(payload, runToken);
		}
	});
	var directFlowProviderVisibility = () => {
		const isFlow = /:\/\/(?:labs\.google|labs\.google\.com|flow\.google\.com)\//i.test(location.href);
		const isProject = /(?:\/tools\/flow\/(?:project\/|shared\/tool\/)|\/project\/[^/]+(?:\/edit\/[^/]+|\/tool\/[^/]+)?$)/i.test(location.pathname);
		const isCustomTool = isProject && /\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)/i.test(location.pathname);
		const isRuntimeTool = isCustomTool && /\/tools\/flow\/(?:project\/[^/]+\/tool-version\/|shared\/tool\/)[^/]+(?:\/?$)/i.test(location.pathname);
		return {
			googleFlowTabs: isFlow ? 1 : 0,
			googleFlowProjectTabs: isProject ? 1 : 0,
			googleFlowCustomToolTabs: isCustomTool ? 1 : 0,
			googleFlowRuntimeToolTabs: isRuntimeTool ? 1 : 0,
			googleFlowEditorToolTabs: isCustomTool && !isRuntimeTool ? 1 : 0,
			googleFlowUrls: isFlow ? [location.href] : []
		};
	};
	var directFlowBridge = createDirectFlowBridge({
		host: flowWindow,
		bridgeUrl: FLOW_DIRECT_BRIDGE_URL,
		extensionVersion: FLOW_EXTENSION_VERSION,
		providerAdapterId: FLOW_ADAPTER_INSTANCE_ID,
		providerVisibility: directFlowProviderVisibility,
		onRunJob: (payload) => void executeJobOnce(payload),
		onCancelJob: cancelFlowJobRun
	});
	var sendDirectFlowBridgeMessage = directFlowBridge.sendMessage;
	var flowSdkSelectionListener = (event) => {
		if (event.data?.type !== "FLOW_SELECT_MEDIA" || flowSdkSelectionQueue.length === 0) return;
		if (!/image/i.test(String(event.data.payload?.filter || "image"))) return;
		const selection = flowSdkSelectionQueue.shift();
		if (!selection) return;
		flowSdkSelectionErrors.delete(selection.jobId);
		flowTrace(selection.jobId, `Studio Shot Bridge requested Flow media selection (${referenceRequiredLabel(selection.reference)}); resolving through the host picker.`, .44);
		const targets = /* @__PURE__ */ new Set();
		if (event.source && event.source !== window) targets.add(event.source);
		for (const frame of Array.from(document.querySelectorAll("iframe"))) {
			if (/recaptcha/i.test(frame.src || "")) continue;
			if (frame.contentWindow && frame.contentWindow !== window) targets.add(frame.contentWindow);
		}
		if (targets.size === 0) {
			flowTrace(selection.jobId, `Flow media selection request arrived without a reachable Studio Shot Bridge target (${referenceRequiredLabel(selection.reference)}).`, .45);
			return;
		}
		const postResponse = (payload) => {
			for (const target of targets) target.postMessage({
				type: "FLOW_RESPONSE",
				id: event.data.id,
				payload
			}, "*");
		};
		(/\/tools\/flow\/(?:project\/[^/]+\/(?:tool|tool-version)\/|shared\/tool\/)/i.test(location.pathname) ? resolveFlowRuntimeSelection(selection) : resolveFlowSdkReference(selection).then((prepared) => ({ mediaId: prepared.attachedDirectly ? "" : flowMediaIdFromTile(prepared.tile) }))).then(({ mediaId }) => {
			if (!mediaId) throw new Error(`Flow uploaded/reused ${referenceRequiredLabel(selection.reference)} but did not expose a provider media id for SDK selection.`);
			postResponse({
				mediaId,
				base64: String(selection.reference.base64 || "").replace(/^data:[^,]+,/, ""),
				mimeType: selection.reference.mimeType || "image/png"
			});
			flowTrace(selection.jobId, `Resolved Flow SDK media selection for ${referenceRequiredLabel(selection.reference)} using provider media ${mediaId}.`, .48);
		}).catch((error) => {
			const detail = error instanceof Error ? error.message : String(error);
			flowSdkSelectionErrors.set(selection.jobId, detail);
			flowTrace(selection.jobId, `Flow SDK media selection could not resolve ${referenceRequiredLabel(selection.reference)}: ${detail}`, .46);
			postResponse({ error: detail });
		});
	};
	function flowProjectIdFromUrl(value) {
		try {
			return decodeURIComponent(new URL(value).pathname.match(/\/project\/([^/]+)/i)?.[1] || "");
		} catch {
			return "";
		}
	}
	function canonicalFlowSdkMediaId(value) {
		const id = String(value || "");
		if (/^fe_id_[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return id;
		return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? `fe_id_${id}` : "";
	}
	async function referenceImageDimensions(reference) {
		const encoded = String(reference.base64 || "").replace(/^data:[^,]+,/, "");
		if (!encoded) return null;
		return new Promise((resolve) => {
			const image = new Image();
			const timeout = window.setTimeout(() => resolve(null), 3e3);
			image.onload = () => {
				window.clearTimeout(timeout);
				resolve({
					width: image.naturalWidth,
					height: image.naturalHeight
				});
			};
			image.onerror = () => {
				window.clearTimeout(timeout);
				resolve(null);
			};
			image.src = `data:${reference.mimeType || "image/png"};base64,${encoded}`;
		});
	}
	async function lookupFlowProjectMediaId(reference, preferLatestExactUpload = false) {
		const projectId = flowProjectIdFromUrl(location.href);
		if (!projectId) return "";
		const fileNames = [...new Set([
			reference.filename,
			reference.filePath,
			reference.referenceLabel
		].flatMap((value) => {
			const raw = String(value || "");
			if (!raw) return [];
			return [raw, (() => {
				try {
					return decodeURIComponent(raw);
				} catch {
					return raw;
				}
			})()].map((candidate) => candidate.split(/[\\/]/).pop()?.split("?")[0] || "").filter(Boolean);
		}))];
		if (!fileNames.length) return "";
		try {
			const input = encodeURIComponent(JSON.stringify({ json: { projectId } }));
			const localResponse = await fetch(`/fx/api/trpc/flow.projectInitialData?input=${input}`, {
				credentials: "include",
				cache: "no-store"
			});
			let body;
			const localType = localResponse.headers.get("content-type") || "";
			if (localResponse.ok && /json/i.test(localType)) body = await localResponse.json();
			else {
				const relayed = await chrome.runtime.sendMessage({
					source: "google-flow-adapter",
					type: "FLOW_PROJECT_INITIAL_DATA",
					projectId
				}).catch(() => ({ ok: false }));
				if (!relayed?.ok) return "";
				body = relayed.value;
			}
			const contents = body.result?.data?.json?.projectContents;
			const workflows = Array.isArray(contents?.workflows) ? contents.workflows : [];
			const media = Array.isArray(contents?.media) ? contents.media : [];
			const matchingWorkflows = workflows.filter((candidate) => {
				const displayName = String(candidate.metadata?.displayName || "");
				return fileNames.some((fileName) => displayName === fileName);
			});
			if (!matchingWorkflows.length) return "";
			const referenceDimensions = await referenceImageDimensions(reference);
			const exactUploadWorkflows = matchingWorkflows.filter((workflow) => {
				const candidate = media.find((item) => item.workflowId === workflow.name && item.image && item.projectId === projectId);
				if (!candidate) return false;
				const dimensions = candidate.image?.dimensions;
				return Boolean(referenceDimensions && Number(dimensions?.width) === referenceDimensions.width && Number(dimensions?.height) === referenceDimensions.height);
			});
			const ledgerEntry = flowReferenceUploadEntry(reference);
			const correlatedUploads = ledgerEntry?.source === "upload-dispatched" ? exactUploadWorkflows.filter((workflow) => {
				const createdAt = Date.parse(String(workflow.metadata?.createTime || ""));
				return Number.isFinite(createdAt) && Math.abs(createdAt - Number(ledgerEntry.updatedAt || 0)) <= 3e4;
			}) : [];
			const candidates = correlatedUploads.length ? correlatedUploads : exactUploadWorkflows.length === 1 ? exactUploadWorkflows : preferLatestExactUpload && exactUploadWorkflows.length ? [[...exactUploadWorkflows].sort((left, right) => String(right.metadata?.createTime || "").localeCompare(String(left.metadata?.createTime || "")))[0]] : [];
			if (!candidates.length) return "";
			const workflow = [...candidates].sort((left, right) => String(right.metadata?.createTime || "").localeCompare(String(left.metadata?.createTime || "")))[0];
			if (!workflow?.name) return "";
			const editPath = `/edit/${String(workflow.name)}`;
			const rawPrimaryMediaId = String(workflow.metadata?.primaryMediaId || "");
			const findDomTile = () => Array.from(document.querySelectorAll("[data-tile-id]")).find((tile) => Array.from(tile.querySelectorAll("a[href]")).some((anchor) => {
				try {
					return new URL(anchor.href, location.href).pathname.endsWith(editPath);
				} catch {
					return false;
				}
			}) || rawPrimaryMediaId && Array.from(tile.querySelectorAll("img[src]")).some((image) => {
				try {
					return decodeURIComponent(image.src).includes(rawPrimaryMediaId);
				} catch {
					return image.src.includes(rawPrimaryMediaId);
				}
			}));
			let domTile = findDomTile();
			if (!domTile) {
				const hydrationStartedAt = Date.now();
				while (!domTile && Date.now() - hydrationStartedAt < 15e3) {
					await sleep(500);
					domTile = findDomTile();
				}
			}
			const explicitDomMediaId = canonicalFlowSdkMediaId(domTile?.dataset.mediaId || domTile?.getAttribute("data-media-id"));
			if (explicitDomMediaId) return explicitDomMediaId;
			if (preferLatestExactUpload) {
				const canonicalMediaId = canonicalFlowSdkMediaId(media.find((item) => item.workflowId === workflow.name && item.projectId === projectId && item.image && item.name)?.name);
				if (canonicalMediaId) return canonicalMediaId;
			}
			if (ledgerEntry?.source === "upload-dispatched") return "";
			const workflowCreatedAt = Date.parse(String(workflow.metadata?.createTime || ""));
			if (Number.isFinite(workflowCreatedAt) && Date.now() - workflowCreatedAt < 10 * 6e4) return "";
			const primaryMediaId = canonicalFlowSdkMediaId(workflow.metadata?.primaryMediaId);
			if (primaryMediaId) return primaryMediaId;
			const matches = media.filter((candidate) => candidate.workflowId === workflow.name && candidate.name && candidate.image && candidate.projectId === projectId);
			return matches.length === 1 ? canonicalFlowSdkMediaId(matches[0].name) : "";
		} catch {
			return "";
		}
	}
	async function resolveFlowRuntimeSelection(selection) {
		let workspaceRelayError = "";
		try {
			const workspace = await Promise.race([chrome.runtime.sendMessage({
				source: "google-flow-adapter",
				type: "RESOLVE_FLOW_REFERENCE_IN_WORKSPACE",
				jobId: selection.jobId,
				projectId: flowProjectIdFromUrl(location.href),
				reference: selection.reference
			}), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("Flow workspace reference relay timed out after 45 seconds.")), 45e3))]);
			if (workspace?.ok && workspace.mediaId) {
				flowTrace(selection.jobId, `Flow workspace relay resolved ${referenceRequiredLabel(selection.reference)} to provider media ${String(workspace.mediaId)}.`, .47);
				return { mediaId: String(workspace.mediaId) };
			}
			flowTrace(selection.jobId, `Flow workspace relay returned no media id (${String(workspace?.error || "unknown response")}); using bounded runtime fallback.`, .455);
			workspaceRelayError = String(workspace?.error || "workspace relay returned no media id");
		} catch (error) {
			workspaceRelayError = error instanceof Error ? error.message : String(error);
			flowTrace(selection.jobId, `Flow workspace relay failed (${workspaceRelayError}); using bounded runtime fallback.`, .455);
		}
		throw new Error(`Flow workspace relay could not provide a provider media id; direct runtime reference resolution also failed${workspaceRelayError ? `: ${workspaceRelayError}` : "."}`);
	}
	window.addEventListener("message", flowSdkSelectionListener, true);
	if (flowWindow.__studioGoogleFlowAdapterListener) chrome.runtime.onMessage.removeListener(flowWindow.__studioGoogleFlowAdapterListener);
	directFlowBridge.stop();
	function handleFlowMediaConfirmation(message, sendResponse) {
		const filename = String(message.filename || "").split(/[\\/]/).pop()?.split("?")[0] || "";
		if (!filename) {
			sendResponse({
				ok: false,
				error: "Flow media confirmation filename is missing."
			});
			return;
		}
		(async () => {
			const startedAt = Date.now();
			while (Date.now() - startedAt < 8e3) {
				const option = [...document.querySelectorAll("listboxoption, [role='option'], [role='listbox'] [role='button'], [data-testid*='media'], div")].filter((item) => {
					const rect = item.getBoundingClientRect();
					return rect.width > 2 && rect.height > 2;
				}).filter((item) => String(item.innerText || item.textContent || "").trim() === filename).sort((left, right) => String(left.innerText || left.textContent || "").length - String(right.innerText || right.textContent || "").length)[0];
				if (option) {
					option.click();
					await new Promise((resolve) => setTimeout(resolve, 120));
					const add = [...document.querySelectorAll("button, [role='button']")].find((item) => /^(?:Thêm nội dung nghe nhìn|Add media)$/i.test(String(item.innerText || item.getAttribute("aria-label") || "").trim()) && !item.disabled);
					if (add) {
						add.click();
						sendResponse({ ok: true });
						return;
					}
				}
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			sendResponse({
				ok: false,
				error: `Flow media tile ${filename} was not available in the open picker.`
			});
		})();
	}
	function handleFlowCapture(message, sendResponse) {
		const job = message.job;
		(Boolean(message.allowVisibleFallback) ? captureRecoverableVisibleFlowResult(job, isVideoJob(job), true) : captureLatestFlowResult(job.jobId, isVideoJob(job))).then(async (assets) => {
			if (assets.length > 0) await clearAcceptedFlowDraft(job.jobId);
			sendResponse({
				ok: assets.length > 0,
				adapter: FLOW_ADAPTER_INSTANCE_ID,
				assets,
				error: assets.length > 0 ? void 0 : "No usable Google Flow result media was visible."
			});
		}).catch((error) => sendResponse({
			ok: false,
			adapter: FLOW_ADAPTER_INSTANCE_ID,
			error: error instanceof Error ? error.message : String(error)
		}));
	}
	var flowMessageListener = (message, _sender, sendResponse) => {
		if (message.action === "RESOLVE_FLOW_REFERENCE") {
			const jobId = String(message.jobId || "");
			const reference = message.reference;
			if (!jobId || !reference?.assetId) {
				sendResponse({
					ok: false,
					error: "Workspace reference relay payload is incomplete."
				});
				return true;
			}
			const cachedFingerprint = referenceFingerprint(reference);
			const cachedTileId = cachedFingerprint ? String(readFlowReferenceCache()[cachedFingerprint]?.tileId || "") : "";
			const cachedTileIsLive = cachedTileId && Array.from(document.querySelectorAll("[data-tile-id]")).some((tile) => String(tile.dataset.tileId || tile.getAttribute("data-tile-id") || "") === cachedTileId);
			if (/^fe_id_/i.test(cachedTileId) && cachedTileIsLive && flowReferenceWasUploadedInCurrentProject(reference)) {
				sendResponse({
					ok: true,
					mediaId: cachedTileId
				});
				return true;
			}
			lookupFlowProjectMediaId(reference, Boolean(message.preferDirectUpload)).then((mediaId) => mediaId ? {
				ok: true,
				mediaId
			} : resolveFlowSdkReference({
				jobId,
				reference,
				preferDirectUpload: Boolean(message.preferDirectUpload)
			}).then((prepared) => {
				if (prepared.attachedDirectly) throw new Error("Workspace picker attached the frame directly without exposing a media id.");
				const resolvedMediaId = flowMediaIdFromTile(prepared.tile);
				if (!resolvedMediaId) throw new Error("Workspace picker returned a tile without a provider media id.");
				return {
					ok: true,
					mediaId: resolvedMediaId
				};
			})).then((prepared) => {
				sendResponse(prepared);
			}).catch(async (error) => {
				const mediaId = await lookupFlowProjectMediaId(reference, Boolean(message.preferDirectUpload));
				if (mediaId) {
					sendResponse({
						ok: true,
						mediaId
					});
					return;
				}
				sendResponse({
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			});
			return true;
		}
		if (message.action === "PRIME_FLOW_MEDIA") {
			const jobId = String(message.jobId || "");
			hydrateReferences(Array.isArray(message.references) ? message.references : []).then((hydrated) => primeFlowSdkMedia(jobId, hydrated)).then((primed) => sendResponse({
				ok: true,
				primed
			})).catch((error) => sendResponse({
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			}));
			return true;
		}
		if (message.action === "CONFIRM_FLOW_MEDIA") {
			handleFlowMediaConfirmation(message, sendResponse);
			return true;
		}
		if (message.action === "PING_STUDIO_ADAPTER") {
			sendResponse({
				ok: true,
				adapter: FLOW_ADAPTER_INSTANCE_ID
			});
			return true;
		}
		if (message.action === "EXECUTE_JOB") {
			executeJobOnce(message.job);
			sendResponse({
				ok: true,
				adapter: FLOW_ADAPTER_INSTANCE_ID
			});
		}
		if (message.action === "CAPTURE_LATEST_FLOW_RESULT") {
			handleFlowCapture(message, sendResponse);
			return true;
		}
		if (message.action === "CANCEL_JOB") {
			const jobId = String(message.jobId || "");
			if (jobId) cancelFlowJobRun(jobId);
			sendResponse({
				ok: true,
				adapter: FLOW_ADAPTER_INSTANCE_ID
			});
		}
		return true;
	};
	flowWindow.__studioGoogleFlowAdapterLoaded = true;
	flowWindow.__studioGoogleFlowAdapterInstanceId = FLOW_ADAPTER_INSTANCE_ID;
	flowWindow.__studioGoogleFlowAdapterListener = flowMessageListener;
	chrome.runtime.onMessage.addListener(flowMessageListener);
	try {
		const resultRecovery = JSON.parse(sessionStorage.getItem(FLOW_RESULT_RECOVERY_KEY) || "null");
		sessionStorage.removeItem(FLOW_RESULT_RECOVERY_KEY);
		if (resultRecovery?.job?.jobId && Date.now() - Number(resultRecovery.savedAt || 0) < 6e4 && /(?:\/tools\/flow\/project\/[^/]+|\/project\/[^/]+)\/?$/i.test(location.pathname)) window.setTimeout(() => {
			const baseline = flowJobBaselines()[resultRecovery.job.jobId];
			waitForResults(resultRecovery.job, isVideoJob(resultRecovery.job), new Set(baseline?.beforeTileIds || []));
		}, 3500);
	} catch {
		sessionStorage.removeItem(FLOW_RESULT_RECOVERY_KEY);
	}
	try {
		const routeHandoff = JSON.parse(sessionStorage.getItem(FLOW_ROUTE_HANDOFF_KEY) || "null");
		sessionStorage.removeItem(FLOW_ROUTE_HANDOFF_KEY);
		if (routeHandoff?.payload?.jobId && Date.now() - Number(routeHandoff.savedAt || 0) < 6e4 && /(?:\/tools\/flow\/project\/[^/]+|\/project\/[^/]+)\/?$/i.test(location.pathname)) window.setTimeout(() => void executeJobOnce(routeHandoff.payload), 1800);
	} catch {
		sessionStorage.removeItem(FLOW_ROUTE_HANDOFF_KEY);
	}
	directFlowBridge.connect();
	//#endregion
})();

//# sourceMappingURL=google-flow.js.map