import { isFlowGenerationEvidence, isFreshFlowTile, type FlowTileBaseline } from "./flow-result-policy";
import { FLOW_RESULT_TILE_SELECTOR, flowResultTileId } from "./flow-result-dom";

type JobPayload = { jobId: string; [key: string]: any };
export type FlowResultRecoveryDeps = Record<string, any>;

let activeDeps: FlowResultRecoveryDeps;


  function newGenerationTiles(beforeTileIds: Set<string>, baseline?: FlowTileBaseline): HTMLElement[] {
    const effectiveBaseline = baseline || { beforeTileIds: Array.from(beforeTileIds), beforeTileTextById: {}, beforeTileMediaById: {}, beforeEditIds: [], beforeMediaUrls: [], submittedAt: 0 };
    const seen = new Set<string>();
    return Array.from(document.querySelectorAll<HTMLElement>(FLOW_RESULT_TILE_SELECTOR)).filter((tile) => {
      const tileId = flowResultTileId(tile, activeDeps.tileMediaUrls(tile));
      if (!tileId || !activeDeps.isVisible(tile)) return false;
      const rect = tile.getBoundingClientRect();
      const seenKey = `${tileId}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
      if (seen.has(seenKey)) return false;
      seen.add(seenKey);
      return isFreshFlowTile({ tileId, editId: activeDeps.flowTileEditId(tile), mediaUrls: activeDeps.tileMediaUrls(tile) }, effectiveBaseline);
    });
  }

  function currentJobTiles(jobId: string, beforeTileIds: Set<string>): HTMLElement[] {
    return newGenerationTiles(beforeTileIds, activeDeps.flowJobBaselines()[jobId]);
  }

  function flowTileFailed(tile: HTMLElement): boolean {
    if (activeDeps.mediaElementsIn(tile).length > 0) return false;
    return /không thành công|failed|error|retry|thử lại|lỗi/i.test(tile.innerText || "");
  }

  function flowTileBlockingError(tile: HTMLElement): string | null {
    if (activeDeps.mediaElementsIn(tile).length > 0) return null;
    return activeDeps.isManualGate(tile);
  }

  function flowProviderFailureText(): string | null {
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    if (!bodyText) return null;
    if (!/(?:không thành công|generation failed|could not generate|try a different prompt)/i.test(bodyText)) return null;
    if (!/(?:vi phạm chính sách|chính sách của chúng tôi|policy|celebrity|người nổi tiếng)/i.test(bodyText)) return null;
    return `GOOGLE_FLOW_PROVIDER_POLICY_REJECTED: Flow rejected the submitted prompt before creating a video tile. ${activeDeps.compactText(bodyText, 320)}`;
  }

  function flowTileHasGenerationSignal(tile: HTMLElement, expectVideo: boolean): boolean {
    if (!activeDeps.isVisible(tile)) return false;
    const media = activeDeps.mediaElementsIn(tile);
    return isFlowGenerationEvidence({
      expectVideo,
      hasProgressControl: Boolean(tile.querySelector('[role="progressbar"], [aria-busy="true"], progress, .loading, .spinner')),
      percent: activeDeps.flowTilePercent(tile),
      hasVideoMedia: activeDeps.flowTileHasVideoMedia(tile),
      hasAnyMedia: media.length > 0,
      isImageOnlyResult: activeDeps.flowTileIsImageOnlyResult(tile),
      visibleText: activeDeps.visibleText(tile),
    });
  }

  function reloadFlowForResultRecovery(job: JobPayload, message: string): void {
    const key = activeDeps.FLOW_RESULT_RECOVERY_KEY;
    const attemptKey = `${key}:attempt:${job.jobId}`;
    try {
      if (sessionStorage.getItem(attemptKey) === "1") {
        activeDeps.reportStatus(job.jobId, "generating", "Flow recovery reload already used; continuing on the same page without another reload or resubmit.", 0.74);
        return;
      }
    } catch {
      // A storage failure must not turn into an unbounded reload loop.
    }
    try { sessionStorage.setItem(attemptKey, "1"); } catch { /* continue without a reload if storage is unavailable */ }
    if (sessionStorage.getItem(attemptKey) !== "1") {
      activeDeps.reportStatus(job.jobId, "generating", "Flow recovery storage is unavailable; continuing without another reload or resubmit.", 0.74);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify({ job, savedAt: Date.now(), attempts: 1 }));
    activeDeps.reportStatus(job.jobId, "submitting", message, 0.74);
    location.reload();
  }

  async function waitForGenerationStart(job: JobPayload, beforeGenerationTileIds: Set<string>, expectVideo: boolean, timeoutMs = 36000): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await activeDeps.sleep(600);
      if (activeDeps.flowPageErrorText()) {
        reloadFlowForResultRecovery(job, "Flow crashed after submit; reloading once to recover the accepted generation without resubmitting...");
        return false;
      }
      if (activeDeps.reportFlowSubmitRejection(job.jobId)) return false;
      const gate = activeDeps.isManualGate();
      if (gate) { activeDeps.reportResult(job.jobId, "waiting_manual_action", undefined, gate); return false; }
      if (currentJobTiles(job.jobId, beforeGenerationTileIds).some((tile) => flowTileHasGenerationSignal(tile, expectVideo))) {
        activeDeps.reportStatus(job.jobId, "generating", "Flow generation tile detected; provider accepted submit.", 0.75);
        return true;
      }
      if (Date.now() - startedAt >= 15000) activeDeps.reportStatus(job.jobId, "submitting", "Flow submit was clicked once; waiting for a generation tile before marking provider acceptance...", 0.73);
    }
    if (expectVideo) {
      reloadFlowForResultRecovery(job, "Flow submit returned without a visible generation tile; refreshing once to recover any accepted late-hydrate video without resubmitting...");
      return false;
    }
    activeDeps.reportResult(job.jobId, "failed_retryable", undefined, `Flow submit click returned, but no new generation tile or progress indicator appeared. The visible Flow page may have rejected the request before generation started. ${activeDeps.flowDebugSnapshot()}`);
    return false;
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Cannot read Flow blob media."));
      reader.readAsDataURL(blob);
    });
  }

  async function normalizeFlowMediaUrl(url: string, isVideo: boolean): Promise<{ url: string; metadata: Record<string, unknown> }> {
    if (!url.startsWith("blob:")) return { url, metadata: {} };
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Flow blob fetch failed: HTTP ${response.status}`);
    const blob = await response.blob();
    return { url: await blobToDataUrl(blob), metadata: { originalUrl: url, storage: "data_url", byteSize: blob.size, mimeType: blob.type || (isVideo ? "video/mp4" : "image/png") } };
  }

  async function resultAssetsFromMedia(jobId: string, elements: Element[], expectVideo: boolean, contextTile?: HTMLElement): Promise<Array<Record<string, unknown>>> {
    const seen = new Set<string>();
    const assets = await Promise.all(elements.map(async (element, index) => {
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
      const editUrl = links.find((link: string) => /\/edit\//i.test(link)) || links.find((link: string) => /\/project\//i.test(link));
      const normalized = await normalizeFlowMediaUrl(url, isVideo);
      return { type: isVideo ? "video" : "image", filename: `google_flow_${jobId}_${index}${isVideo ? ".mp4" : ".png"}`, downloadPath: normalized.url, mimeType: isVideo ? "video/mp4" : "image/png", metadata: { ...normalized.metadata, studioJobId: jobId, currentJobOnly: true, flowStrictCurrentJobRecovery: true, providerUrl: location.href, flowProjectUrl: location.href, flowTileId: tileId, flowResultUrl: editUrl || "", flowTileLinks: links.slice(0, 8), ...(isVideo ? { providerMediaUrl: url } : {}) } };
    }));
    return assets.filter(Boolean) as Array<Record<string, unknown>>;
  }

  async function revealMediaFromFlowTile(jobId: string, tile: HTMLElement, expectVideo: boolean): Promise<Array<Record<string, unknown>>> {
    if (!activeDeps.flowTileMayRevealMedia(tile)) return [];
    if (isImageOnlyVideoReveal(tile, expectVideo)) { activeDeps.flowTrace(jobId, `Flow result tile ${tile.dataset.tileId || ""} is image-only; refusing to reveal it as a video result.`, 0.96, "generating"); return []; }
    const editId = activeDeps.flowTileEditId(tile);
    const target = tile.querySelector<HTMLElement>('a[href*="/edit/"], button[aria-label*="play" i], [role="button"][aria-label*="play" i], video, button, [role="button"], img') || tile;
    activeDeps.flowTrace(jobId, `Revealing Flow result tile ${tile.dataset.tileId || ""} before deciding failure...`, 0.96, "generating");
    activeDeps.simulateClick(target);
    const startedAt = Date.now();
    let playbackRequested = false;
    // Flow often renders a warning card first and only hydrates the playable
    // media after the linked /edit/ route has loaded. Keep this bounded, but
    // give that route enough time to attach the video element before treating
    // the card as a terminal failure.
    while (Date.now() - startedAt < 45000) {
      await activeDeps.sleep(750);
      if (activeDeps.isManualGate()) return [];
      const tileAssets = await resultAssetsFromMedia(jobId, activeDeps.mediaElementsIn(tile), expectVideo, tile);
      if (tileAssets.length > 0) return tileAssets;
      const onFlowEditRoute = /\/project\/[^/]+\/edit\/|\/tools\/flow\/project\/[^/]+\/edit\//i.test(location.pathname);
      if (onFlowEditRoute && (!editId || location.href.includes(editId))) {
        if (!playbackRequested && !activeDeps.findElements(["video", "video source[src]", "video[src]"]).length) {
          const playButton = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'))
            .find((button) => activeDeps.isVisible(button) && /^(?:phát|play)$/i.test(button.getAttribute("aria-label") || ""));
          if (playButton) { playbackRequested = true; activeDeps.flowTrace(jobId, "Requesting playback once so Flow hydrates the native video resource in the edit route.", 0.97, "downloading"); activeDeps.simulateClick(playButton); }
        }
        const performanceVideoElements = performance.getEntriesByType("resource")
          .map((entry) => String((entry as PerformanceResourceTiming).name || ""))
          .filter((url) => /\/video\//i.test(url));
        const performanceAssets = await resultAssetsFromMedia(jobId, performanceVideoElements.map((url) => ({ tagName: "VIDEO", currentSrc: url } as unknown as Element)), true, tile);
        if (performanceAssets.length > 0) return performanceAssets;
        const pageMedia = activeDeps.findElements(activeDeps.SELECTORS.resultMedia)
          .filter(activeDeps.isVisible);
        const pageAssets = await resultAssetsFromMedia(jobId, pageMedia, expectVideo, tile);
        if (pageAssets.length > 0) return pageAssets;
      }
    }
    return [];
  }

  function isImageOnlyVideoReveal(tile: HTMLElement, expectVideo: boolean): boolean {
    return expectVideo && activeDeps.flowTileIsImageOnlyResult(tile);
  }

  async function resultAssetsFromCurrentJobTiles(jobId: string, tiles: HTMLElement[], expectVideo: boolean): Promise<Array<Record<string, unknown>>> {
    const providerFailure = flowProviderFailureText();
    if (providerFailure) throw new Error(providerFailure);
    const freshTiles = tiles.filter((tile) => isFreshTileForJob(jobId, tile));
    if (expectVideo && tiles.length > 0 && freshTiles.length === 0) activeDeps.flowTrace(jobId, "Skipped visible Flow video tiles because they existed before this job baseline.", 0.94, "generating");
    const directAssets = await resultAssetsFromMedia(jobId, freshTiles.flatMap((tile) => activeDeps.mediaElementsIn(tile)), expectVideo);
    if (directAssets.length > 0) return directAssets;
    for (const tile of freshTiles) {
      if (flowTileBlockingError(tile)) continue;
      const revealedAssets = await revealMediaFromFlowTile(jobId, tile, expectVideo);
      if (revealedAssets.length > 0) return revealedAssets;
    }
    return [];
  }

  function isFreshTileForJob(jobId: string, tile: HTMLElement): boolean {
    const baseline = activeDeps.flowJobBaselines()[jobId];
    return isFreshFlowTile({ tileId: flowResultTileId(tile, activeDeps.tileMediaUrls(tile)), editId: activeDeps.flowTileEditId(tile), mediaUrls: activeDeps.tileMediaUrls(tile) }, baseline);
  }

  async function captureLatestFlowResult(jobId: string, expectVideo: boolean): Promise<Array<Record<string, unknown>>> {
    const baseline: FlowTileBaseline | undefined = activeDeps.flowJobBaselines()[jobId];
    if (!baseline) return [];
    return resultAssetsFromCurrentJobTiles(jobId, newGenerationTiles(new Set<string>(baseline.beforeTileIds), baseline).reverse(), expectVideo);
  }

  function visibleFlowResultTiles(): HTMLElement[] {
    const seen = new Set<string>();
    return Array.from(document.querySelectorAll<HTMLElement>(FLOW_RESULT_TILE_SELECTOR)).filter((tile) => {
      const tileId = flowResultTileId(tile, activeDeps.tileMediaUrls(tile));
      if (!tileId || !activeDeps.isVisible(tile) || (activeDeps.mediaElementsIn(tile).length === 0 && !activeDeps.flowTileMayRevealMedia(tile))) return false;
      const rect = tile.getBoundingClientRect(); const seenKey = `${tileId}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
      if (seen.has(seenKey)) return false; seen.add(seenKey); return true;
    }).sort((left, right) => { const a = left.getBoundingClientRect(); const b = right.getBoundingClientRect(); return a.y - b.y || a.x - b.x; });
  }

  function visibleFlowImageTiles(): HTMLElement[] {
    const seen = new Set<string>();
    return Array.from(document.querySelectorAll<HTMLElement>(FLOW_RESULT_TILE_SELECTOR)).filter((tile) => {
      const tileId = flowResultTileId(tile, activeDeps.tileMediaUrls(tile));
      if (!tileId || !activeDeps.isVisible(tile) || activeDeps.mediaElementsIn(tile).length > 0 || !tile.querySelector("img")) return false;
      const rect = tile.getBoundingClientRect(); const seenKey = `${tileId}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
      if (seen.has(seenKey)) return false; seen.add(seenKey); return true;
    });
  }

  async function revealVisibleFlowTileLabels(): Promise<void> {
    for (const tile of visibleFlowImageTiles()) {
      const target = tile.querySelector<HTMLElement>("img, button, [role='button']") || tile;
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerType: "mouse" }));
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
      target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
      await activeDeps.sleep(80);
    }
  }

  async function captureRecoverableVisibleFlowResult(job: JobPayload, expectVideo: boolean, allowVisibleFallback = false): Promise<Array<Record<string, unknown>>> {
    const baseline: FlowTileBaseline | undefined = activeDeps.flowJobBaselines()[job.jobId]; const beforeTileIds = new Set<string>(baseline?.beforeTileIds || []);
    const strictAssets = await captureLatestFlowResult(job.jobId, expectVideo);
    if (strictAssets.length > 0) return strictAssets;
    await revealVisibleFlowTileLabels();
    if (expectVideo) {
      const freshVideoTiles = currentJobTiles(job.jobId, beforeTileIds).filter(activeDeps.flowTileHasVideoMedia);
      const visibleVideoAssets = await resultAssetsFromCurrentJobTiles(job.jobId, freshVideoTiles.slice(0, 2), true);
      if (visibleVideoAssets.length > 0) { activeDeps.flowTrace(job.jobId, `Recovered visible Flow video from fresh job tiles only (${visibleVideoAssets.length}).`, 0.96, "downloading"); return visibleVideoAssets; }
    }
    activeDeps.flowTrace(job.jobId, allowVisibleFallback ? "Strict Flow recovery found no fresh current-job media after refresh; visible project fallback is disabled to avoid attaching the wrong video." : "Strict Flow recovery found no fresh current-job media; visible/adjacent project fallback is disabled to avoid attaching the wrong video.", 0.94, "downloading");
    return [];
  }

  async function waitForResults(job: JobPayload, expectVideo: boolean, beforeGenerationTileIds: Set<string>, maxWaitMs = 600000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) { await activeDeps.sleep(3000); if (await pollFlowResult(job, expectVideo, beforeGenerationTileIds, start, maxWaitMs)) return; }
    if (expectVideo && await recoverLateFlowResult(job)) return;
    activeDeps.reportResult(job.jobId, "failed_retryable", undefined, "Timeout waiting for Google Flow result");
  }

  async function pollFlowResult(job: JobPayload, expectVideo: boolean, baseline: Set<string>, start: number, maxWaitMs: number): Promise<boolean> {
    if (activeDeps.flowPageErrorText()) { reloadFlowForResultRecovery(job, "Flow crashed while generation was active; reloading to recover this job without resubmitting..."); return true; }
    const providerFailure = flowProviderFailureText();
    if (providerFailure) { activeDeps.reportResult(job.jobId, "failed_retryable", undefined, `${providerFailure} Use a neutral prompt without potentially sensitive public-figure wording, then retry.`); return true; }
    const gate = activeDeps.isManualGate(); if (gate) { activeDeps.reportResult(job.jobId, "waiting_manual_action", undefined, gate); return true; }
    const tiles = currentJobTiles(job.jobId, baseline);
    const tilePercent = (tiles as HTMLElement[]).map((tile) => activeDeps.flowTilePercent(tile) as number | null).find((value: number | null): value is number => value !== null);
    const progress = tilePercent === undefined ? Math.min((Date.now() - start) / maxWaitMs, 0.95) : Math.max(0.01, Math.min(tilePercent / 100, 0.95));
    const generationVisible = tiles.some((tile) => flowTileHasGenerationSignal(tile, expectVideo));
    activeDeps.reportStatus(job.jobId, generationVisible ? "generating" : "submitting", generationVisible
      ? `Flow generation tile detected; provider accepted submit. Generating... ${Math.round(progress * 100)}%`
      : "Flow submit was clicked, but no generation tile is visible yet; provider acceptance is not confirmed.", progress);
    if (activeDeps.findElement(activeDeps.SELECTORS.loadingIndicator)) return false;
    return handleSettledFlowPoll(job, expectVideo, tiles, Date.now() - start, progress);
  }

  async function handleSettledFlowPoll(job: JobPayload, expectVideo: boolean, tiles: HTMLElement[], waitedMs: number, progress: number): Promise<boolean> {
    const assets = await resultAssetsFromCurrentJobTiles(job.jobId, tiles, expectVideo);
    if (assets.length > 0) return finishFlowResult(job.jobId, assets, `Google Flow result media detected on current job tiles only (${assets.length} ${expectVideo ? "video" : "asset"}).`);
    const blockingError = tiles.map(flowTileBlockingError).find((error): error is string => Boolean(error));
    if (blockingError) { activeDeps.reportResult(job.jobId, "waiting_manual_action", undefined, blockingError); return true; }
    if (expectVideo && waitedMs > 30000 && await recoverSettledFlowVideo(job)) return true;
    reportLateFlowHydrationStatus(job.jobId, expectVideo, tiles.length, waitedMs, progress);
    if (shouldFailSettledVideo(expectVideo, tiles, waitedMs)) { activeDeps.reportResult(job.jobId, "failed_retryable", undefined, activeDeps.flowImageOnlyVideoError(tiles.length)); return true; }
    const failedTile = tiles.find(flowTileFailed);
    if (!failedTile) return false;
    activeDeps.reportResult(job.jobId, "failed_retryable", undefined, `Google Flow reported generation failure and no usable media was found: ${activeDeps.compactText(failedTile.innerText || "", 220)}`);
    return true;
  }

  async function recoverSettledFlowVideo(job: JobPayload): Promise<boolean> {
    const recovered = await captureRecoverableVisibleFlowResult(job, true, true);
    if (recovered.length <= 0) return false;
    return finishFlowResult(job.jobId, recovered, `Recovered visible Google Flow video after generation start (${recovered.length}).`);
  }

  function shouldFailSettledVideo(expectVideo: boolean, tiles: HTMLElement[], waitedMs: number): boolean {
    const onlyInvalidVideo = expectVideo && tiles.length > 0 && tiles.every((tile) => flowTileFailed(tile) || flowTileBlockingError(tile) || activeDeps.flowTileIsImageOnlyResult(tile));
    return onlyInvalidVideo && visibleFlowResultTiles().filter(activeDeps.flowTileHasVideoMedia).length === 0 && waitedMs > 180000;
  }

  function reportLateFlowHydrationStatus(jobId: string, expectVideo: boolean, tileCount: number, waitedMs: number, progress: number): void {
    if (!expectVideo || tileCount > 0) return;
    if (waitedMs > 75000) activeDeps.reportStatus(jobId, "submitting", "Flow has not exposed a generation tile; continuing the bounded wait without reload or resubmit.", progress);
    else if (waitedMs > 30000) activeDeps.reportStatus(jobId, "submitting", "Flow submit click returned, but provider acceptance remains unconfirmed until a generation tile appears.", progress);
  }

  async function finishFlowResult(jobId: string, assets: Array<Record<string, unknown>>, message: string): Promise<true> {
    activeDeps.flowTrace(jobId, `${message} Downloading into the desktop app...`, 0.96, "downloading");
    await activeDeps.reportDoneAndClearFlowDraft(jobId, assets);
    return true;
  }

  async function recoverLateFlowResult(job: JobPayload): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 120000) {
      const assets = await captureRecoverableVisibleFlowResult(job, true, true);
      if (assets.length > 0) return finishFlowResult(job.jobId, assets, `Recovered visible Google Flow video during late-result grace (${assets.length}).`);
      activeDeps.reportStatus(job.jobId, "submitting", "Flow still has no strictly attributable video tile; waiting through the bounded late-result grace without resubmitting...", 0.95);
      await activeDeps.sleep(3000);
    }
    return false;
  }


export function createFlowResultRecovery(deps: FlowResultRecoveryDeps) {
  activeDeps = deps;
  return { newGenerationTiles, currentJobTiles, flowTileFailed, flowTileBlockingError, flowProviderFailureText, flowTileHasGenerationSignal, reloadFlowForResultRecovery, waitForGenerationStart, normalizeFlowMediaUrl, resultAssetsFromMedia, revealMediaFromFlowTile, resultAssetsFromCurrentJobTiles, isFreshTileForJob, captureLatestFlowResult, visibleFlowResultTiles, visibleFlowImageTiles, revealVisibleFlowTileLabels, captureRecoverableVisibleFlowResult, waitForResults, pollFlowResult, handleSettledFlowPoll, recoverSettledFlowVideo, shouldFailSettledVideo, reportLateFlowHydrationStatus, finishFlowResult, recoverLateFlowResult };
}
