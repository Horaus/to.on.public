const fs = require("node:fs");
const path = require("node:path");

function localPath(deps, filePath) {
  if (!filePath || typeof filePath !== "string") return "";
  if (filePath.startsWith(`http://127.0.0.1:${deps.mediaPort}/media/`)) {
    try { return decodeURIComponent(new URL(filePath).pathname.slice("/media/".length)); } catch { return ""; }
  }
  if (filePath.startsWith("file://")) {
    try { return decodeURIComponent(new URL(filePath).pathname); } catch { return filePath.slice("file://".length); }
  }
  return filePath;
}

function encodeReference(deps, reference) {
  const sourcePath = localPath(deps, reference.filePath);
  if (!sourcePath || !fs.existsSync(sourcePath)) return reference;
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  const mimeType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png";
  // Browser-bound envelopes need one transport representation only. Keeping
  // the persisted dataUrl/previewDataUrl alongside base64 can double a large
  // image and trip the extension's 4 MiB capability limit before dispatch.
  const { dataUrl: _dataUrl, previewDataUrl: _previewDataUrl, ...transport } = reference;
  return { ...transport, base64: fs.readFileSync(sourcePath).toString("base64"), mimeType, filename: path.basename(sourcePath) };
}

function encode(deps, message) {
  // ChatGPT uploads references through the extension's native file-input path
  // (`uploadChatGptReferencesNatively`). Inlining the same PNGs as base64 here
  // needlessly multiplies the envelope and can exceed the 4 MiB capability
  // budget before the extension ever sees the job. Keep local file paths for
  // that provider; Flow Relay still receives inline bytes below.
  const provider = String(message?.provider || message?.providerId || "").toLowerCase();
  if (provider === "chatgpt" || provider === "chatgpt-web") {
    return {
      ...message,
      references: (message.references || []).map((reference) => {
        const { base64: _base64, dataUrl: _dataUrl, previewDataUrl: _previewDataUrl, ...transport } = reference;
        return transport;
      })
    };
  }
  // The published Flow Custom Tool receives references inside its message;
  // it cannot resolve Electron-local file paths. Inline the bytes for every
  // browser-bound job so the tool can validate and attach the exact image.
  // The extension advertises a 4 MiB envelope budget; callers should keep a
  // single reference (or use a smaller image) when approaching that limit.
  return { ...message, references: (message.references || []).map((reference) => encodeReference(deps, reference)) };
}

function persist(deps, projectId, jobId, reference, index) {
  const rawData = String(reference.base64 || reference.filePath || "");
  const match = rawData.match(/^data:([^;]+);base64,(.+)$/i);
  const mimeType = reference.mimeType || match?.[1] || "image/png";
  const base64 = reference.base64 || match?.[2];
  if (!base64) return reference;
  const directory = path.join(deps.dataRoot, "projects", projectId, "job-references");
  fs.mkdirSync(directory, { recursive: true });
  const safeAsset = String(reference.assetId || `ref_${index}`).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 48);
  const filePath = path.join(directory, `${jobId}_${safeAsset}.${mimeExtension(mimeType)}`);
  fs.writeFileSync(filePath, Buffer.from(String(base64).replace(/\s+/g, ""), "base64"));
  const { base64: _base64, ...rest } = reference;
  return { ...rest, filePath, mimeType, filename: reference.filename || path.basename(filePath) };
}

function normalize(deps, projectId, message) {
  if (!message || typeof message !== "object") return message;
  const jobId = String(message.jobId || "job");
  return { ...message, references: (message.references || []).map((reference, index) => persist(deps, projectId, jobId, reference, index)) };
}

function sanitizeReference(deps, reference) {
  let changed = false;
  if (typeof reference.previewDataUrl === "string" && reference.previewDataUrl.startsWith("data:") && reference.filePath) {
    const sourcePath = localPath(deps, reference.filePath);
    if (sourcePath && fs.existsSync(sourcePath)) { reference.previewDataUrl = deps.toMediaUrl(sourcePath); changed = true; }
  }
  if (typeof reference.filePath === "string" && reference.filePath.startsWith("data:")) {
    const normalized = persist(deps, reference.projectId, reference.id || "reference", { assetId: reference.id || "reference", filePath: reference.filePath, mimeType: "image/png" }, 0);
    reference.filePath = normalized.filePath; reference.previewDataUrl = deps.toMediaUrl(normalized.filePath); changed = true;
  }
  return changed;
}

function sanitizeJob(deps, job) {
  const message = job.input?.bridgeMessage;
  if (!message || !Array.isArray(message.references) || !message.references.length) return false;
  const normalized = normalize(deps, job.projectId, message);
  if (JSON.stringify(message.references) === JSON.stringify(normalized.references)) return false;
  job.input.bridgeMessage = normalized;
  return true;
}

function sanitizeState(deps) {
  const state = deps.getState();
  let changed = false;
  for (const reference of state.visualReferences || []) if (sanitizeReference(deps, reference)) changed = true;
  for (const job of state.jobs || []) if (sanitizeJob(deps, job)) changed = true;
  return changed;
}

function createBridgeReferenceStorage(deps) {
  return { localPath: (filePath) => localPath(deps, filePath), encode: (message) => encode(deps, message), persist: (projectId, jobId, reference, index) => persist(deps, projectId, jobId, reference, index), normalize: (projectId, message) => normalize(deps, projectId, message), sanitizeState: () => sanitizeState(deps) };
}

function mimeExtension(mimeType, fallback = "png") {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("png")) return "png";
  return fallback;
}

module.exports = { createBridgeReferenceStorage, mimeExtension };
