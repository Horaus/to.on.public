let path, fs, app, nativeImage, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, mediaMimeType, toStudioMediaUrl, localPathFromStudioMediaUrl;

function createMediaPersistence(dependencies) {
  ({ path, fs, app, nativeImage, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id, mediaMimeType, toStudioMediaUrl, localPathFromStudioMediaUrl } = dependencies);
  return { probeLocalVideoDurationSeconds, probeLocalAudioDurationSeconds, hydrateVideoMediaTruth, annotateVideoDurationMismatches, isLikelyEphemeralMediaPath, normalizeStoredMediaUrl, persistDataUrlAsset, ensureImagePreview, migrateImageAssetOutOfVideoFolder };
}

function probeLocalVideoDurationSeconds(filePath) {
  const localPath = localPathFromStudioMediaUrl(filePath);
  if (!localPath || !fs.existsSync(localPath)) return undefined;
  try {
    if (process.platform === "darwin" && fs.existsSync("/usr/bin/mdls")) {
      const output = execFileSync("/usr/bin/mdls", ["-raw", "-name", "kMDItemDurationSeconds", localPath], {
        encoding: "utf8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      const duration = Number(output);
      return Number.isFinite(duration) && duration > 0 ? duration : undefined;
    }
  } catch (error) {
    console.warn("[Studio] Cannot probe video duration:", error?.message || error);
  }
  return undefined;
}

function probeLocalAudioDurationSeconds(filePath) {
  const localPath = localPathFromStudioMediaUrl(filePath);
  if (!localPath || !fs.existsSync(localPath) || !fs.existsSync("/usr/bin/afinfo")) return undefined;
  try {
    const output = execFileSync("/usr/bin/afinfo", ["-r", localPath], { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
    const duration = Number(output.match(/estimated duration:\s*([0-9.]+)/i)?.[1]);
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  } catch {
    return undefined;
  }
}

function hydrateVideoMediaTruth(asset) {
  if (!asset || asset.type !== "video") return false;
  const metadataDuration = Number(asset.metadata?.durationSeconds ?? asset.metadata?.duration);
  // Bootstrap runs this normalizer for every persisted asset. Prefer the
  // provider's already persisted duration so a slow/unindexed macOS file
  // cannot block renderer creation while `mdls` waits synchronously. A file
  // probe remains the fallback for newly downloaded assets that have no
  // trustworthy provider metadata yet.
  const hasProviderDuration = Number.isFinite(metadataDuration) && metadataDuration > 0;
  const measuredDuration = hasProviderDuration ? undefined : probeLocalVideoDurationSeconds(asset.filePath);
  const durationSeconds = measuredDuration || (hasProviderDuration ? metadataDuration : undefined);
  if (!durationSeconds) return false;
  const previousDuration = Number(asset.durationSeconds);
  asset.metadata = {
    ...(asset.metadata || {}),
    durationSeconds,
    durationSource: measuredDuration ? "measured_file" : "provider_metadata"
  };
  asset.durationSeconds = durationSeconds;
  return !Number.isFinite(previousDuration) || Math.abs(previousDuration - durationSeconds) > 0.01;
}

function annotateVideoDurationMismatches() {
  const mismatches = collectVideoDurationMismatches(getState());
  const byAssetId = new Map(mismatches.map((item) => [item.assetId, item]));
  let changed = 0;
  for (const asset of getState().assets || []) {
    if (asset.type !== "video") continue;
    const mismatch = byAssetId.get(asset.id);
    const previous = asset.metadata?.durationMismatch;
    const next = mismatch ? {
      plannedDurationSeconds: mismatch.plannedDurationSeconds,
      sourceDurationSeconds: mismatch.sourceDurationSeconds,
      deltaSeconds: mismatch.deltaSeconds
    } : undefined;
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    asset.metadata = { ...(asset.metadata || {}) };
    if (next) asset.metadata.durationMismatch = next;
    else delete asset.metadata.durationMismatch;
    changed++;
  }
  return changed;
}

function isLikelyEphemeralMediaPath(filePath) {
  const localPath = localPathFromStudioMediaUrl(filePath);
  return /\/playwright-artifacts-[^/]+\//.test(localPath);
}

function normalizeStoredMediaUrl(filePath) {
  if (!filePath || typeof filePath !== "string") return filePath;
  if (filePath.startsWith(`http://127.0.0.1:${MEDIA_SERVER_PORT}/media/`)) return filePath;
  if (!filePath.startsWith("studio-media://") && path.isAbsolute(filePath)) return toStudioMediaUrl(filePath);
  if (!filePath.startsWith("studio-media://")) return filePath;
  try {
    let localPath = decodeURIComponent(new URL(filePath).pathname);
    if (process.platform === "win32" && localPath.startsWith("/")) localPath = localPath.slice(1);
    return toStudioMediaUrl(localPath);
  } catch {
    return filePath;
  }
}

function dataUrlExtension(mimeType) {
  if (mimeType.includes("mp4")) return ".mp4";
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  return ".png";
}

function persistDataUrlMetadata(asset, mimeType) {
  asset.metadata = {
    ...(asset.metadata || {}),
    originalStorage: asset.metadata?.storage || "data_url",
    storage: "local_file",
    migratedFromDataUrlAt: asset.metadata?.migratedFromDataUrlAt || now(),
    mimeType: asset.metadata?.mimeType || mimeType
  };
}

function persistDataUrlAsset(asset) {
  if (!asset?.filePath || typeof asset.filePath !== "string" || !asset.filePath.startsWith("data:")) return false;
  const match = asset.filePath.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return false;
  const mimeType = match[1] || mediaMimeType(asset.filePath);
  const extension = dataUrlExtension(mimeType);
  const folder = path.join(dataRoot, "projects", asset.projectId || getState().activeProjectId || "project", asset.type === "video" ? "videos" : "images");
  fs.mkdirSync(folder, { recursive: true });
  const destPath = path.join(folder, `${asset.id}${extension}`);
  if (!fs.existsSync(destPath)) {
    fs.writeFileSync(destPath, Buffer.from(match[2], "base64"));
  }
  persistDataUrlMetadata(asset, mimeType);
  asset.filePath = toStudioMediaUrl(destPath);
  return true;
}

function ensureImagePreview(asset) {
  if (!asset || asset.type !== "image") return false;
  if (normalizeExistingPreview(asset)) return false;
  const sourcePath = localPathFromStudioMediaUrl(asset.filePath);
  if (!sourcePath || !fs.existsSync(sourcePath)) return false;
  try {
    const image = nativeImage.createFromPath(sourcePath);
    return writeImagePreview(asset, image);
  } catch (error) {
    console.warn("[Studio] Cannot create image preview:", error?.message || error);
    return false;
  }
}

function normalizeExistingPreview(asset) {
  const previewPath = asset.metadata?.previewUrl || asset.metadata?.previewFilePath;
  if (!previewPath) return false;
  asset.metadata.previewUrl = normalizeStoredMediaUrl(previewPath);
  return true;
}

function writeImagePreview(asset, image) {
  const size = image.getSize();
  if (!size.width || !size.height) return false;
  const previewDir = path.join(dataRoot, "projects", asset.projectId || getState().activeProjectId || "project", "images", "previews");
  fs.mkdirSync(previewDir, { recursive: true });
  const previewPath = path.join(previewDir, `${asset.id}.jpg`);
  if (!fs.existsSync(previewPath)) fs.writeFileSync(previewPath, resizedPreview(image, size).toJPEG(82));
  asset.metadata = { ...(asset.metadata || {}), previewFilePath: previewPath, previewUrl: toStudioMediaUrl(previewPath), previewGeneratedAt: asset.metadata?.previewGeneratedAt || now() };
  return true;
}

function resizedPreview(image, size) {
  const maxWidth = 420;
  const scale = Math.min(1, maxWidth / size.width);
  return scale < 1 ? image.resize({ width: Math.max(1, Math.round(size.width * scale)), quality: "good" }) : image;
}

function migrateImageAssetOutOfVideoFolder(asset) {
  if (!asset || asset.type !== "image") return false;
  const localPath = localPathFromStudioMediaUrl(asset.filePath);
  if (!hasExistingLocalImagePath(localPath)) return false;
  const projectId = asset.projectId || getState().activeProjectId || "project";
  const projectVideoDir = path.join(dataRoot, "projects", projectId, "videos");
  if (!localPath.startsWith(`${projectVideoDir}${path.sep}`)) return false;
  const imageDir = path.join(dataRoot, "projects", projectId, "images");
  fs.mkdirSync(imageDir, { recursive: true });
  const targetPath = path.join(imageDir, path.basename(localPath));
  try {
    if (!fs.existsSync(targetPath)) fs.renameSync(localPath, targetPath);
    asset.filePath = toStudioMediaUrl(targetPath);
    asset.metadata = {
      ...(asset.metadata || {}),
      migratedFromVideoFolderAt: asset.metadata?.migratedFromVideoFolderAt || now()
    };
    return true;
  } catch (error) {
    console.warn("[Studio] Cannot migrate image asset out of videos folder:", error?.message || error);
    return false;
  }
}

function hasExistingLocalImagePath(localPath) {
  return Boolean(localPath && fs.existsSync(localPath));
}

module.exports = { createMediaPersistence };
