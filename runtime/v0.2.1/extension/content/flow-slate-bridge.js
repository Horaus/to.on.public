(function() {
	//#region ../../packages/extension-providers/src/google-flow/slate-bridge.ts
	console.log("[Studio] Google Flow main-world bridge loaded");
	function isSlateEditor(value, requireInsertText = false) {
		if (!value || typeof value !== "object") return false;
		const editor = value;
		return Array.isArray(editor.children) && typeof editor.apply === "function" && (!requireInsertText || typeof editor.insertText === "function");
	}
	function editorFromContext(firstContext) {
		let context = firstContext;
		while (context) {
			if (isSlateEditor(context.memoizedValue, true)) return context.memoizedValue;
			context = context.next;
		}
		return null;
	}
	function editorFromHookState(firstState) {
		let state = firstState;
		while (state) {
			if (isSlateEditor(state.memoizedState)) return state.memoizedState;
			const current = state.memoizedState?.current;
			if (isSlateEditor(current)) return current;
			state = state.next;
		}
		return null;
	}
	function findSlateEditor() {
		const editorNode = activeEditorDom();
		if (!editorNode) return null;
		const fiberKey = Object.keys(editorNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
		if (!fiberKey) return null;
		let fiber = editorNode[fiberKey];
		while (fiber) {
			const contextEditor = editorFromContext(fiber.dependencies?.firstContext);
			if (contextEditor) return contextEditor;
			const stateEditor = editorFromHookState(fiber.memoizedState);
			if (stateEditor) return stateEditor;
			fiber = fiber.return ?? null;
		}
		return null;
	}
	function focusEditorDom() {
		const editorNode = activeEditorDom();
		editorNode?.focus();
		return editorNode;
	}
	function visible(element) {
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}
	function elementText(element) {
		if (!element) return "";
		if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value || "";
		const clone = element.cloneNode(true);
		clone.querySelectorAll("[data-slate-placeholder]").forEach((node) => node.remove());
		return clone.textContent || "";
	}
	function isEditableElement(element) {
		if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return true;
		if (!(element instanceof HTMLElement)) return false;
		return element.getAttribute("contenteditable") === "true" || element.getAttribute("data-slate-editor") === "true" || element.getAttribute("role") === "textbox";
	}
	function hasPromptHint(element) {
		const text = [
			element.getAttribute("aria-label"),
			element.getAttribute("placeholder"),
			element.getAttribute("data-placeholder"),
			element.textContent
		].filter(Boolean).join(" ");
		return /bạn muốn tạo gì|what do you want|prompt|describe|create|tạo gì/i.test(text);
	}
	function editableCandidates() {
		return Array.from(document.querySelectorAll("[data-slate-editor=\"true\"], [contenteditable=\"true\"], [role=\"textbox\"], textarea, input[type=\"text\"], input:not([type])")).filter((element) => {
			if (!isEditableElement(element)) return false;
			if (!visible(element)) return false;
			const rect = element.getBoundingClientRect();
			if (rect.width < 80 || rect.height < 8) return false;
			return true;
		});
	}
	function activeEditorDom() {
		const candidates = editableCandidates();
		if (candidates.length === 0) return null;
		return candidates.map((element) => {
			const rect = element.getBoundingClientRect();
			const text = elementText(element).trim();
			const composerLike = rect.bottom > window.innerHeight * .45 ? 40 : 0;
			const bottomBias = Math.min(40, rect.bottom / Math.max(1, window.innerHeight) * 40);
			const promptHint = hasPromptHint(element) ? 35 : 0;
			const wide = rect.width > 240 ? 15 : 0;
			const hasContent = text.length > 0 ? 8 : 0;
			const staleChatPenalty = /chatgpt|library|search|tìm kiếm/i.test(text) ? -60 : 0;
			return {
				element,
				score: composerLike + bottomBias + promptHint + wide + hasContent + staleChatPenalty
			};
		}).sort((a, b) => b.score - a.score)[0]?.element || null;
	}
	function textSample(text) {
		return (text.length > 30 ? text.substring(0, 30) : text).trim();
	}
	function verifyEditorDomText(text, editorNode = activeEditorDom()) {
		const sample = textSample(text);
		if (!sample || !editorNode) return false;
		if (editorHasPlaceholder(editorNode)) return false;
		return elementText(editorNode).replace(/\s+/g, " ").trim().includes(sample);
	}
	function dispatchEditableInput(element, inputType = "insertText", data = "") {
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
	function setNativeValue(element, value) {
		const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
		(Object.getOwnPropertyDescriptor(proto, "value")?.set)?.call(element, value);
	}
	function visibleEditorText(editorNode = activeEditorDom()) {
		return editorNode ? elementText(editorNode).replace(/\s+/g, " ").trim() : "";
	}
	function editorHasPlaceholder(editorNode = activeEditorDom()) {
		return !!editorNode?.querySelector("[data-slate-placeholder]");
	}
	function getEndPoint(editor) {
		const path = [];
		let node = { children: editor.children };
		while (node.children && node.children.length > 0) {
			const idx = node.children.length - 1;
			path.push(idx);
			node = node.children[idx];
		}
		return {
			path,
			offset: (node.text || "").length
		};
	}
	function getAllText(node) {
		if (node.text !== void 0) return node.text;
		if (node.children) return node.children.map(getAllText).join("");
		return "";
	}
	function clearVisibleEditor(editorNode) {
		return {
			ok: false,
			error: editorNode ? "Flow prompt has no discoverable Slate editor model" : "Flow prompt editor not found"
		};
	}
	function finishSlateClear(editor, editorNode, tier) {
		if (getAllText({ children: editor.children }).trim().length !== 0) return null;
		editor.onChange?.();
		return {
			ok: true,
			tier
		};
	}
	function clearSlateFragment(editor, editorNode) {
		try {
			const endPt = getEndPoint(editor);
			if (endPt.offset > 0 || endPt.path.length > 2 || endPt.path.length === 2 && endPt.path[0] > 0) {
				editor.selection = {
					anchor: {
						path: [0, 0],
						offset: 0
					},
					focus: endPt
				};
				editor.deleteFragment?.();
			}
			editor.onChange?.();
			return finishSlateClear(editor, editorNode, "deleteFragment");
		} catch {
			return null;
		}
	}
	function clearSlateAllBlocks(editor, editorNode) {
		try {
			editor.selection = {
				anchor: {
					path: [0, 0],
					offset: 0
				},
				focus: getEndPoint(editor)
			};
			editor.deleteFragment?.();
			if (editor.children && editor.children.length > 1 && editor.withoutNormalizing) editor.withoutNormalizing(() => {
				for (let i = (editor.children?.length ?? 1) - 1; i >= 1; i--) try {
					editor.apply?.({
						type: "remove_node",
						path: [i],
						node: JSON.parse(JSON.stringify(editor.children[i]))
					});
				} catch {}
			});
			editor.onChange?.();
			return finishSlateClear(editor, editorNode, "selectAllDelete");
		} catch {
			return null;
		}
	}
	function emptySlateClone(node) {
		if (node.text !== void 0) return { text: "" };
		const clone = {};
		for (const k in node) {
			if (k === "children") continue;
			if (k === "id") {
				if (typeof crypto !== "undefined" && crypto.randomUUID) clone.id = crypto.randomUUID();
				continue;
			}
			clone[k] = node[k];
		}
		const children = node.children;
		clone.children = children?.[0] ? [emptySlateClone(children[0])] : [{ text: "" }];
		return clone;
	}
	function replaceSlateChildren(editor, editorNode) {
		try {
			const firstChild = editor.children[0];
			editor.children = [firstChild ? emptySlateClone(firstChild) : {
				type: "PARAGRAPH",
				children: [{ text: "" }]
			}];
			editor.selection = {
				anchor: {
					path: [0, 0],
					offset: 0
				},
				focus: {
					path: [0, 0],
					offset: 0
				}
			};
			editor.onChange?.();
			return finishSlateClear(editor, editorNode, "replaceChildren");
		} catch {
			return null;
		}
	}
	function clearEditor() {
		const editor = findSlateEditor();
		const editorNode = focusEditorDom();
		if (!editor) return clearVisibleEditor(editorNode);
		const ready = clearSlateFragment(editor, editorNode) || clearSlateAllBlocks(editor, editorNode) || replaceSlateChildren(editor, editorNode);
		if (ready) return ready;
		return {
			ok: false,
			error: `All clear tiers failed; model="${getAllText({ children: editor.children }).slice(0, 80)}"; dom="${visibleEditorText(editorNode).slice(0, 80)}"`
		};
	}
	function insertDomFallback(text, editorNode = activeEditorDom()) {
		if (!editorNode) return {
			ok: false,
			error: "Visible Flow prompt editor not found"
		};
		try {
			editorNode.focus();
			if (editorNode instanceof HTMLInputElement || editorNode instanceof HTMLTextAreaElement) {
				setNativeValue(editorNode, `${editorNode.value || ""}${text}`);
				dispatchEditableInput(editorNode, "insertText", text);
			} else {
				const selection = window.getSelection();
				const range = document.createRange();
				range.selectNodeContents(editorNode);
				range.collapse(false);
				selection?.removeAllRanges();
				selection?.addRange(range);
				if (!document.execCommand("insertText", false, text)) return {
					ok: false,
					error: "Flow DOM editor rejected native text insertion"
				};
				dispatchEditableInput(editorNode, "insertText", text);
			}
			triggerBlurFocus(editorNode);
			return verifyEditorDomText(text, editorNode) ? {
				ok: true,
				tier: "domComposer"
			} : {
				ok: false,
				error: "DOM insert did not appear in the visible Flow prompt editor"
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
	function finishSlateInsert(editor, editorNode, text, tier) {
		const sample = textSample(text);
		if (!getAllText({ children: editor.children }).includes(sample)) return null;
		triggerBlurFocus(editorNode);
		return {
			ok: true,
			tier
		};
	}
	function insertThroughSlateText(editor, editorNode, text) {
		try {
			if (!editor.selection) {
				const endPt = getEndPoint(editor);
				editor.selection = {
					anchor: endPt,
					focus: endPt
				};
			}
			editor.insertText?.(text);
			editor.onChange?.();
			return finishSlateInsert(editor, editorNode, text, "insertText");
		} catch {
			return null;
		}
	}
	function insertThroughSlateOperation(editor, editorNode, text) {
		try {
			const pt = getEndPoint(editor);
			editor.apply?.({
				type: "insert_text",
				path: pt.path,
				offset: pt.offset,
				text
			});
			editor.onChange?.();
			return finishSlateInsert(editor, editorNode, text, "applyOp");
		} catch {
			return null;
		}
	}
	function insertThroughSlateData(editor, editorNode, text) {
		try {
			if (typeof editor.insertData !== "function") return null;
			const pt = getEndPoint(editor);
			editor.selection = {
				anchor: pt,
				focus: pt
			};
			const data = new DataTransfer();
			data.setData("text/plain", text);
			editor.insertData(data);
			editor.onChange?.();
			return finishSlateInsert(editor, editorNode, text, "insertData");
		} catch {
			return null;
		}
	}
	function insertText(text) {
		const editor = findSlateEditor();
		const editorNode = focusEditorDom();
		if (!editor) return insertDomFallback(text, editorNode || void 0);
		const ready = insertThroughSlateText(editor, editorNode, text) || insertThroughSlateOperation(editor, editorNode, text) || insertThroughSlateData(editor, editorNode, text);
		if (ready) return ready;
		const fallback = insertDomFallback(text, editorNode || void 0);
		if (fallback.ok) return fallback;
		return {
			ok: false,
			error: `All insert tiers failed; ${fallback.error || "DOM fallback failed"}`
		};
	}
	function triggerBlurFocus(slateEl) {
		if (!slateEl) return;
		setTimeout(() => {
			try {
				slateEl.blur();
				slateEl.focus();
			} catch {}
		}, 0);
	}
	function findSubmitButton() {
		const buttons = Array.from(document.querySelectorAll("button, [role='button']")).filter((btn) => visible(btn) && !btn.hasAttribute("disabled") && btn.getAttribute("aria-disabled") !== "true").reverse();
		const submitBtn = buttons.find((btn) => {
			const label = `${btn.innerText || ""} ${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`;
			return /tạo|generate|create|submit|send|gửi/i.test(label);
		}) || buttons.find((btn) => {
			const rect = btn.getBoundingClientRect();
			return rect.bottom > window.innerHeight * .55 && rect.right > window.innerWidth * .55;
		});
		const iconSubmitBtn = !submitBtn ? buttons.find((btn) => {
			const icons = Array.from(btn.querySelectorAll("i, span"));
			for (const icon of icons) if (icon.textContent?.trim() === "arrow_forward") return true;
			return false;
		}) : null;
		return submitBtn || iconSubmitBtn || null;
	}
	function submitThroughReactProps(targetBtn) {
		try {
			const propsKey = Object.keys(targetBtn).find((k) => k.startsWith("__reactProps$"));
			if (propsKey) {
				const props = targetBtn[propsKey];
				if (typeof props.onClick === "function") {
					const rect = targetBtn.getBoundingClientRect();
					const fakeEvent = {
						preventDefault: () => {},
						stopPropagation: () => {},
						persist: () => {},
						nativeEvent: { isTrusted: true },
						isTrusted: true,
						target: targetBtn,
						currentTarget: targetBtn,
						bubbles: true,
						cancelable: true,
						defaultPrevented: false,
						eventPhase: 3,
						timeStamp: Date.now(),
						type: "click",
						button: 0,
						buttons: 1,
						clientX: rect.left + rect.width / 2,
						clientY: rect.top + rect.height / 2
					};
					props.onClick(fakeEvent);
					return {
						ok: true,
						method: "reactPropsClick"
					};
				}
			}
		} catch {}
		return null;
	}
	function submitThroughFiber(targetBtn) {
		try {
			const fiberKey = Object.keys(targetBtn).find((k) => k.startsWith("__reactFiber$"));
			if (fiberKey) {
				let fiber = targetBtn[fiberKey];
				let depth = 0;
				while (fiber && depth < 50) {
					const pendingProps = fiber.pendingProps;
					if (pendingProps && typeof pendingProps.onSubmit === "function") {
						pendingProps.onSubmit({
							preventDefault: () => {},
							stopPropagation: () => {}
						});
						return {
							ok: true,
							method: "fiberOnSubmit"
						};
					}
					const stateNode = fiber.stateNode;
					if (stateNode && typeof stateNode.handleSubmit === "function") {
						stateNode.handleSubmit();
						return {
							ok: true,
							method: "fiberHandleSubmit"
						};
					}
					fiber = fiber.return ?? null;
					depth++;
				}
			}
		} catch {}
		return null;
	}
	function attemptDomSubmission(targetBtn) {
		targetBtn.click();
		const rect = targetBtn.getBoundingClientRect();
		const opts = {
			bubbles: true,
			cancelable: true,
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
			button: 0
		};
		targetBtn.dispatchEvent(new PointerEvent("pointerdown", {
			...opts,
			pointerType: "mouse"
		}));
		targetBtn.dispatchEvent(new MouseEvent("mousedown", opts));
		targetBtn.dispatchEvent(new PointerEvent("pointerup", {
			...opts,
			pointerType: "mouse"
		}));
		targetBtn.dispatchEvent(new MouseEvent("mouseup", opts));
		targetBtn.dispatchEvent(new MouseEvent("click", opts));
		const slateEl = activeEditorDom();
		if (slateEl) setTimeout(() => {
			slateEl.focus();
			slateEl.dispatchEvent(new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				keyCode: 13,
				bubbles: true,
				cancelable: true,
				composed: true
			}));
			slateEl.dispatchEvent(new KeyboardEvent("keyup", {
				key: "Enter",
				code: "Enter",
				keyCode: 13,
				bubbles: true,
				composed: true
			}));
		}, 100);
	}
	function submitPrompt() {
		const targetBtn = findSubmitButton();
		if (!targetBtn) return {
			ok: false,
			error: "Submit button not found"
		};
		const reactResult = submitThroughReactProps(targetBtn);
		if (reactResult) return reactResult;
		const fiberResult = submitThroughFiber(targetBtn);
		if (fiberResult) return fiberResult;
		attemptDomSubmission(targetBtn);
		return {
			ok: false,
			method: "domFallback",
			error: "React submit handler was not found; DOM fallback was attempted but cannot be trusted."
		};
	}
	function refreshSession() {
		try {
			const nextData = window.__NEXT_DATA__;
			if (!nextData?.buildId) return {
				ok: false,
				error: "__NEXT_DATA__ unavailable"
			};
			const buildId = nextData.buildId;
			const locale = nextData.locale || "en";
			const url = `/fx/_next/data/${buildId}/${locale}${window.location.pathname.replace(new RegExp(`^/fx/${locale}(/|$)`), "/") || "/"}.json`;
			fetch(url, {
				credentials: "include",
				cache: "no-store"
			}).then(() => console.log("[Studio Bridge] Session refresh OK:", url)).catch((e) => console.warn("[Studio Bridge] Session refresh failed:", e?.message));
			return { ok: true };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : String(e)
			};
		}
	}
	window.addEventListener("message", (event) => {
		if (event.source !== window || event.data?.source !== "studio-flow-bridge") return;
		const { requestId, action, text = "" } = event.data;
		let result;
		try {
			switch (action) {
				case "clear":
					result = clearEditor();
					break;
				case "insert":
					result = insertText(text);
					break;
				case "submit": {
					const editor = findSlateEditor();
					const slateEl = activeEditorDom();
					const domText = slateEl ? elementText(slateEl).trim() : "";
					const hasPlaceholder = slateEl ? !!slateEl.querySelector("[data-slate-placeholder]") : true;
					if (editor) {
						if (!(getAllText({ children: editor.children }).trim().length > 0 && domText.length > 0 && !hasPlaceholder)) {
							result = {
								ok: false,
								error: "Editor empty, cannot submit"
							};
							break;
						}
					} else if (!domText || hasPlaceholder) {
						result = {
							ok: false,
							error: "Visible Flow prompt editor empty, cannot submit"
						};
						break;
					}
					result = submitPrompt();
					break;
				}
				case "refreshSession":
					result = refreshSession();
					break;
				default: result = {
					ok: false,
					error: `Unknown action: ${action}`
				};
			}
		} catch (caught) {
			result = {
				ok: false,
				error: caught instanceof Error ? caught.message : String(caught)
			};
		}
		const response = {
			source: "studio-flow-bridge-result",
			requestId,
			ok: result.ok,
			error: result.error,
			tier: result.tier,
			method: result.method
		};
		window.postMessage(response, "*");
	});
	//#endregion
})();

//# sourceMappingURL=flow-slate-bridge.js.map