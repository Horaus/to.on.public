const path = require("node:path");

/**
 * Materialize an existing locked visual reference as the image Asset contract
 * required by shot-keyframe and Flow I2V selectors. Visual references and
 * generated assets are intentionally separate records; this operation creates
 * an explicit, auditable bridge between them without invoking another provider.
 */
function promoteReferenceToShot(payload, deps) {
  const { fs, dataRoot, getState, mutateState, saveState, id, now, toStudioMediaUrl, nativeImage } = deps;
  const projectId = String(payload?.projectId || "");
  const shotId = String(payload?.shotId || "");
  const referenceId = String(payload?.referenceId || "");
  if (!projectId || !shotId || !referenceId) throw new Error("Reference promotion requires project, shot, and reference ids.");
  const state = getState();
  const shot = state.shots.find((item) => item.id === shotId);
  const scene = shot && state.scenes.find((item) => item.id === shot.sceneId);
  const reference = state.visualReferences.find((item) => item.id === referenceId);
  if (!shot || !scene || scene.projectId !== projectId || reference?.projectId !== projectId) throw new Error("Reference or target shot does not belong to the selected project.");
  if (!reference.filePath || !fs.existsSync(reference.filePath)) throw new Error("Visual reference file does not exist.");

  const target = { "16:9": 16 / 9, "9:16": 9 / 16, "4:3": 4 / 3, "3:4": 3 / 4, "1:1": 1 }[String(payload?.aspectRatio || reference.sourceAspectRatio || "")];
  const standard = String(payload?.aspectRatio || reference.sourceAspectRatio || "") === "9:16" ? { width: 720, height: 1280 }
    : String(payload?.aspectRatio || reference.sourceAspectRatio || "") === "16:9" ? { width: 1280, height: 720 }
      : String(payload?.aspectRatio || reference.sourceAspectRatio || "") === "1:1" ? { width: 1024, height: 1024 } : undefined;
  const existing = state.assets.find((asset) => asset.projectId === projectId && asset.shotId === shotId
    && asset.type === "image" && asset.metadata?.sourceVisualReferenceId === referenceId);
  if (existing) {
    const width = Number(existing.width || existing.metadata?.width || 0);
    const height = Number(existing.height || existing.metadata?.height || 0);
    const reusable = !nativeImage || !standard || (width === standard.width && height === standard.height);
    if (reusable) return { ok: true, assetId: existing.id, reused: true, state };
  }

  const assetId = id("asset");
  const extension = path.extname(reference.filePath).toLowerCase() || ".png";
  const directory = path.join(dataRoot, "projects", projectId, "assets", `scene-${scene.order}`, `shot-${shot.order}`);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `${assetId}${extension}`);
  fs.copyFileSync(reference.filePath, destination);
  const aspectRatio = String(payload?.aspectRatio || reference.sourceAspectRatio || "");
  // Image providers may return a 3:4 bitmap while the project contract says
  // 9:16. Normalize the shot-scoped keyframe at the Electron boundary so the
  // Flow provider receives geometry that matches the requested render ratio.
  // Keep the original reference untouched and fail soft for malformed legacy
  // files; the extension preflight remains the final no-credit guard.
  if (target && nativeImage) {
    try {
      const image = nativeImage.createFromPath(destination);
      const size = image.getSize();
      if (size.width > 0 && size.height > 0) {
        const wider = size.width / size.height > target;
        const width = wider ? Math.max(1, Math.round(size.height * target)) : size.width;
        const height = wider ? size.height : Math.max(1, Math.round(size.width / target));
        const cropped = Math.abs(size.width / size.height - target) > 0.01
          ? image.crop({ x: Math.max(0, Math.floor((size.width - width) / 2)), y: Math.max(0, Math.floor((size.height - height) / 2)), width, height })
          : image;
        fs.writeFileSync(destination, standard ? cropped.resize(standard).toPNG() : cropped.toPNG());
      }
    } catch {
      // Preserve the copied source; malformed legacy images are rejected later.
    }
  }
  const timestamp = now();
  const asset = {
    id: assetId, projectId, sceneId: scene.id, shotId, type: "image",
    filePath: toStudioMediaUrl(destination), sourceProvider: reference.sourceProvider || "reference",
    prompt: reference.transformationRequest || reference.sourceDescription || "",
    metadata: {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(standard ? { width: standard.width, height: standard.height } : {}),
      sourceVisualReferenceId: referenceId,
      referenceRole: "shot_keyframe",
      keyframeSource: "visual-reference-promotion",
      locked: true
    },
    createdAt: timestamp
  };
  mutateState((draft) => {
    draft.assets.unshift(asset);
    const target = draft.shots.find((item) => item.id === shotId);
    if (target) {
      target.assetIds = Array.from(new Set([...(target.assetIds || []), assetId]));
      target.status = "review";
    }
  }, { reason: "promote-visual-reference-to-shot-keyframe", projectId, shotId, referenceId, assetId });
  saveState();
  return { ok: true, assetId, reused: false, state: getState() };
}

module.exports = { promoteReferenceToShot };
