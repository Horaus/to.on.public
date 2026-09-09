function inferIncomingAssetType(incoming, jobType) {
  return incoming?.type
    || (incoming?.mimeType?.startsWith("video/") ? "video" : undefined)
    || (incoming?.mimeType?.startsWith("image/") ? "image" : undefined)
    || (/\.mp4$|\.webm$|\.mov$/i.test(String(incoming?.filePath || incoming?.filename || "")) ? "video" : undefined)
    || (/\.png$|\.jpg$|\.jpeg$|\.webp$/i.test(String(incoming?.filePath || incoming?.filename || "")) ? "image" : undefined)
    || (jobType === "video" ? "video" : "image");
}

function extensionForMime(mime, incomingType) {
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  return incomingType === "video" ? ".mp4" : ".png";
}

function assetDirectory({ dataRoot, projectId, incomingType, path }) {
  return path.join(dataRoot, "projects", projectId, incomingType === "video" ? "videos" : "images");
}

function assetIdPrefix(incomingType) {
  return incomingType === "video" ? "video" : "asset";
}

const MAX_MEDIA_BYTES = Object.freeze({ image: 25 * 1024 * 1024, video: 200 * 1024 * 1024, audio: 200 * 1024 * 1024 });
const MAX_DECLARED_MEDIA_DURATION_SECONDS = 60 * 60;

function mediaTypeFromMime(mime) {
  const normalized = String(mime || "").toLowerCase().split(";", 1)[0];
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  return "";
}

function atomicWrite({ destination, fs, write }) {
  if (typeof fs.renameSync !== "function") return write(destination);
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    write(temporary);
    fs.renameSync(temporary, destination);
    return destination;
  } catch (error) {
    try {
      if (typeof fs.rmSync === "function") fs.rmSync(temporary, { force: true });
      else if (typeof fs.unlinkSync === "function") fs.unlinkSync(temporary);
    } catch { /* preserve the original write error */ }
    throw error;
  }
}

function localIncomingPath(source, deps) {
  const resolvedByMediaServer = deps.localPathFromStudioMediaUrl?.(source);
  if (resolvedByMediaServer) return resolvedByMediaServer;
  if (source.startsWith("file://")) {
    try { return decodeURIComponent(new URL(source).pathname); } catch { return source.slice("file://".length); }
  }
  return source;
}

function pathInside(candidate, root, path) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasMediaSignature(bytes, incomingType) {
  if (!bytes || bytes.length < 4) return false;
  if (incomingType === "image") {
    return (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP");
  }
  if (incomingType === "video") {
    return (bytes.length >= 8 && bytes.subarray(4, 8).toString("ascii") === "ftyp")
      || (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3);
  }
  return true;
}

/**
 * Validate provider media before it is copied into project-owned storage.
 * Provider URLs and arbitrary filesystem paths are not durable media handles.
 */
function validateIncomingMediaSource({ incoming, incomingType, dataRoot, downloadsRoot, fs, path, localPathFromStudioMediaUrl }) {
  const source = String(incoming?.filePath || incoming?.downloadPath || "");
  if (!source) return { ok: false, code: "missing_media_source" };
  const declaredType = mediaTypeFromMime(incoming?.mimeType);
  if (declaredType && declaredType !== incomingType) return { ok: false, code: "media_type_mismatch" };
  const rawDuration = incoming?.metadata?.durationSeconds ?? incoming?.metadata?.duration;
  if (rawDuration !== undefined && rawDuration !== null && String(rawDuration).trim() !== "") {
    const duration = Number(rawDuration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DECLARED_MEDIA_DURATION_SECONDS) return { ok: false, code: "invalid_media_duration" };
  }
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) return { ok: false, code: "invalid_data_url" };
    const dataType = mediaTypeFromMime(match[1]);
    if (dataType && dataType !== incomingType) return { ok: false, code: "media_type_mismatch" };
    const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    const maxBytes = MAX_MEDIA_BYTES[incomingType] || MAX_MEDIA_BYTES.image;
    if (!bytes.length) return { ok: false, code: "empty_media" };
    if (bytes.length > maxBytes) return { ok: false, code: "media_too_large" };
    if (!hasMediaSignature(bytes, incomingType)) return { ok: false, code: "invalid_media_signature" };
    return { ok: true, source };
  }
  if (/^(?:https?:|blob:|javascript:)/i.test(source) && !/^https?:\/\/127\.0\.0\.1:\d+\/media\//i.test(source)) {
    return { ok: false, code: "untrusted_media_scheme" };
  }
  const normalized = localIncomingPath(source, { localPathFromStudioMediaUrl });
  const normalizedResolved = path.resolve(normalized);
  const roots = [dataRoot, downloadsRoot].filter(Boolean).map((root) => path.resolve(root));
  if (!roots.some((root) => pathInside(normalizedResolved, root, path))) return { ok: false, code: "outside_allowed_roots" };
  if (!fs.existsSync(normalizedResolved)) return { ok: false, code: "media_not_found" };
  const resolved = fs.realpathSync ? fs.realpathSync(normalizedResolved) : normalizedResolved;
  const canonicalRoots = roots.map((root) => {
    try { return fs.realpathSync ? fs.realpathSync(root) : root; } catch { return root; }
  });
  if (!canonicalRoots.some((root) => pathInside(resolved, root, path))) return { ok: false, code: "outside_allowed_roots" };
  const stat = fs.statSync(resolved);
  const isFile = typeof stat.isFile === "function" ? stat.isFile() : stat.isFile;
  if (isFile === false) return { ok: false, code: "media_not_file" };
  const maxBytes = MAX_MEDIA_BYTES[incomingType] || MAX_MEDIA_BYTES.image;
  if (Number(stat.size) > maxBytes) return { ok: false, code: "media_too_large" };
  const bytes = fs.readFileSync(resolved).subarray(0, 16);
  if (!hasMediaSignature(bytes, incomingType)) return { ok: false, code: "invalid_media_signature" };
  return { ok: true, source: resolved };
}

function copyLocalAsset({ source, incomingType, assetDir, fs, path, makeId, warn }) {
  const rawPath = source.startsWith("file://") ? source.slice(7) : source;
  try {
    if (!rawPath || !fs.existsSync(rawPath)) return source;
    fs.mkdirSync(assetDir, { recursive: true });
    const extension = path.extname(rawPath) || (incomingType === "video" ? ".mp4" : ".png");
    const destination = path.join(assetDir, `${makeId(assetIdPrefix(incomingType))}${extension}`);
    atomicWrite({ destination, fs, write: (target) => fs.copyFileSync(rawPath, target) });
    return destination;
  } catch (error) {
    warn(`Cannot copy downloaded asset into project directory: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function saveDataUrlAsset({ source, incomingType, assetDir, fs, path, makeId, warn }) {
  try {
    const mime = source.match(/^data:([^;]+);base64,/)?.[1] || (incomingType === "video" ? "video/mp4" : "image/png");
    const base64Data = source.split(",")[1];
    if (!base64Data) return source;
    fs.mkdirSync(assetDir, { recursive: true });
    const destination = path.join(assetDir, `${makeId(assetIdPrefix(incomingType))}${extensionForMime(mime, incomingType)}`);
    atomicWrite({ destination, fs, write: (target) => fs.writeFileSync(target, Buffer.from(base64Data, "base64")) });
    return destination;
  } catch (error) {
    warn(`Cannot save data URL asset to file: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function asMediaUrl(filePath, toMediaUrl) {
  const alreadyAddressable = filePath.startsWith("data:") || filePath.startsWith("http") || filePath.startsWith("studio-media://");
  return alreadyAddressable ? filePath : toMediaUrl(filePath);
}

function persistIncomingAssetFile({ incoming, incomingType, projectId, dataRoot, fs, path, makeId, toMediaUrl, warn = () => {} }) {
  const source = incoming?.filePath || incoming?.downloadPath;
  if (!source) return source;
  const assetDir = assetDirectory({ dataRoot, projectId, incomingType, path });
  const context = { source, incomingType, assetDir, fs, path, makeId, warn };
  const persisted = source.startsWith("data:") ? saveDataUrlAsset(context) : copyLocalAsset(context);
  if (!persisted) return undefined;
  return asMediaUrl(persisted, toMediaUrl);
}

module.exports = { inferIncomingAssetType, persistIncomingAssetFile, validateIncomingMediaSource };
