export type FlowReferenceLedgerSource = "verified-existing" | "upload-dispatched";

function readLedgerJson(key: string): Record<string, any> {
  try { return JSON.parse(window.localStorage.getItem(key) || "{}"); } catch { return {}; }
}

function writeLedgerJson(key: string, value: Record<string, any>, limit: number): void {
  try {
    const entries = Object.entries(value).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, limit);
    window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

function referenceFingerprint(deps: any, reference?: any): string | null {
  if (!reference) return null;
  const data = deps.referenceDataUrl(reference);
  const normalizedData = data.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const dataPart = normalizedData ? `${normalizedData.length}:${normalizedData.slice(0, 64)}:${normalizedData.slice(-64)}` : "";
  return deps.normalizedToken(`${[reference.assetId, reference.filename, reference.mimeType].filter(Boolean).join(":")}:${dataPart}`).slice(0, 220);
}

export function createFlowReferenceLedger(deps: any) {
  const cacheKey = "studio.flow.referenceTileCache.v1";
  const ledgerKey = "studio.flow.referenceUploadLedger.v1";
  const expectedComposerMediaUrlsByReference = new Map<string, string[]>();
  const referenceFingerprintForLedger = (reference?: any) => referenceFingerprint(deps, reference);
  const currentFlowProjectPath = () => location.pathname.replace(/\/edit\/.*$/i, "").replace(/\/$/, "");
  const markFlowReferencePresent = (reference: any, source: FlowReferenceLedgerSource) => {
    const fingerprint = referenceFingerprintForLedger(reference); if (!fingerprint || !reference) return;
    const ledger = readLedgerJson(ledgerKey); ledger[fingerprint] = { projectPath: currentFlowProjectPath(), filename: reference.filename || reference.assetId || "reference", source, updatedAt: Date.now() }; writeLedgerJson(ledgerKey, ledger, 160);
  };
  const flowReferenceWasUploadedInCurrentProject = (reference: any) => { const fingerprint = referenceFingerprintForLedger(reference); if (!fingerprint) return false; const entry = readLedgerJson(ledgerKey)[fingerprint]; return Boolean(entry && entry.projectPath === currentFlowProjectPath()); };
  const flowReferenceUploadEntry = (reference: any) => { const fingerprint = referenceFingerprintForLedger(reference); if (!fingerprint) return null; const entry = readLedgerJson(ledgerKey)[fingerprint]; return entry && entry.projectPath === currentFlowProjectPath() ? entry : null; };
  const rememberFlowTileForReference = (reference: any, tile: HTMLElement) => {
    const fingerprint = referenceFingerprintForLedger(reference); if (!fingerprint) return;
    const urls = deps.tileMediaUrls(tile);
    if (urls.length) expectedComposerMediaUrlsByReference.set(fingerprint, urls);
    markFlowReferencePresent(reference, "verified-existing");
    // Picker options often omit data-tile-id but expose the canonical media
    // identity in the redirect URL. Persist either form so virtualized tabs can
    // reuse the exact provider media without scanning or selecting a duplicate.
    let tileId = tile.dataset.tileId || tile.getAttribute("data-tile-id") || tile.dataset.mediaId || tile.getAttribute("data-media-id") || "";
    if (!tileId) {
      const image = tile.querySelector<HTMLImageElement>("img[src], img[currentSrc]");
      for (const source of [image?.currentSrc || "", image?.src || "", ...urls]) {
        try {
          const value = new URL(source, location.href).searchParams.get("name");
          if (value) { tileId = value; break; }
        } catch {}
      }
    }
    if (!tileId) return;
    const cache = readLedgerJson(cacheKey); cache[fingerprint] = { tileId, updatedAt: Date.now() }; writeLedgerJson(cacheKey, cache, 80);
  };
  const readFlowReferenceCache = () => readLedgerJson(cacheKey);
  return { expectedComposerMediaUrlsByReference, referenceFingerprint: referenceFingerprintForLedger, markFlowReferencePresent, flowReferenceWasUploadedInCurrentProject, flowReferenceUploadEntry, rememberFlowTileForReference, readFlowReferenceCache };
}
