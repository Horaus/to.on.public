function sourcePathForAsset(source) {
  return source.startsWith("file:") ? decodeURIComponent(new URL(source).pathname) : source;
}

async function writeAssetSource(source, sourcePath, targetPath, deps) {
  const { fs } = deps;
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error("Invalid data URL");
    const body = match[3] || "";
    fs.writeFileSync(targetPath, match[2] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body)));
    return;
  }
  if (/^(https?:|studio-media:)/i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
    return;
  }
  if (!fs.existsSync(sourcePath)) throw new Error("Asset file does not exist");
  if (deps.path.resolve(sourcePath) !== deps.path.resolve(targetPath)) fs.copyFileSync(sourcePath, targetPath);
}

function createSaveAssetHandler(deps) {
  return (event, payload) => saveAsset(event, payload, deps);
}

async function saveAsset(_, payload, deps) {
  const { getState, path, dialog, win, app, fs } = deps;
  const state = getState();
  const assetId = String(payload?.assetId || "");
  const source = assetSaveSource(state, payload, assetId);
  if (!source) return { ok: false, error: "Asset source not found" };
  const sourcePath = sourcePathForAsset(source);
  const sourceName = !/^[a-z][a-z0-9+.-]*:/i.test(sourcePath) ? path.basename(sourcePath) : "";
  const filename = assetSaveFilename(path, source, sourceName, payload?.suggestedName, assetId);
  const selection = await dialog.showSaveDialog(win, { title: "Save output", defaultPath: path.join(app.getPath("downloads"), filename) });
  if (selection.canceled || !selection.filePath) return { ok: false, canceled: true };
  try {
    await writeAssetSource(source, sourcePath, selection.filePath, { fs, path });
    return { ok: true, filePath: selection.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function assetSaveSource(state, payload, assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  const reference = state.visualReferences.find((item) => item.id === assetId);
  return String(asset?.filePath || reference?.filePath || payload?.sourcePath || "");
}

function assetSaveFilename(path, source, sourceName, suggestedName, assetId) {
  const sourceExtension = path.extname(sourceName) || sourceDataExtension(source);
  const requestedName = String(suggestedName || sourceName || assetId || "studio-asset");
  const safeBase = requestedName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "studio-asset";
  return path.extname(safeBase) ? safeBase : `${safeBase}${sourceExtension}`;
}

function sourceDataExtension(source) {
  if (source.startsWith("data:image/png")) return ".png";
  if (source.startsWith("data:image/jpeg")) return ".jpg";
  return source.startsWith("data:video/mp4") ? ".mp4" : "";
}

module.exports = { createSaveAssetHandler };
