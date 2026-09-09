let runtime;

function replacedReferences(job, settings) {
    const { getState } = runtime;
    return getState().visualReferences.filter((reference) =>
      reference.projectId === job.projectId &&
      reference.characterSlot === String(settings.characterSlot || "") &&
      reference.referenceUse === String(settings.directReferenceUse) &&
      reference.role === String(settings.referenceRole || "main_character")
    );
}

function removeReplaced(job, settings, matches = replacedReferences(job, settings)) {
    const { getState, localPathFromStudioMediaUrl, fs } = runtime;
    for (const reference of matches) {
      const localPath = localPathFromStudioMediaUrl(reference.filePath);
      if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
    getState().visualReferences = getState().visualReferences.filter((reference) => !matches.some((item) => item.id === reference.id));
}

function persistImage(job, incoming, asset) {
    const { path, dataRoot, fs, localPathFromStudioMediaUrl, id } = runtime;
    const directory = path.join(dataRoot, "projects", job.projectId, "references");
    fs.mkdirSync(directory, { recursive: true });
    const mimeType = String(incoming.metadata?.mimeType || "image/png");
    const sourcePath = localPathFromStudioMediaUrl(asset.filePath);
    const sourceExtension = sourcePath && fs.existsSync(sourcePath) ? path.extname(sourcePath).slice(1) : "";
    const referenceId = id("reference");
    const filePath = path.join(directory, `${referenceId}.${sourceExtension || mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png"}`);
    if (String(asset.filePath).startsWith("data:image/")) {
      const base64 = String(asset.filePath).split(",")[1];
      if (!base64) return null;
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    } else {
      if (!sourcePath || !fs.existsSync(sourcePath)) return null;
      fs.copyFileSync(sourcePath, filePath);
    }
    return { referenceId, filePath };
}

function cropToAspect(filePath, aspectRatio) {
    const { nativeImage, fs } = runtime;
    const target = { "16:9": 16 / 9, "9:16": 9 / 16, "4:3": 4 / 3, "3:4": 3 / 4, "1:1": 1 }[aspectRatio];
    if (!target) return;
    const image = nativeImage.createFromPath(filePath);
    const size = image.getSize();
    if (size.width <= 0 || size.height <= 0 || Math.abs(size.width / size.height - target) <= 0.01) return;
    const wider = size.width / size.height > target;
    const width = wider ? Math.max(1, Math.round(size.height * target)) : size.width;
    const height = wider ? size.height : Math.max(1, Math.round(size.width / target));
    const cropped = image.crop({ x: Math.max(0, Math.floor((size.width - width) / 2)), y: Math.max(0, Math.floor((size.height - height) / 2)), width, height });
    fs.writeFileSync(filePath, cropped.toPNG());
}

function referenceName(settings) {
    const role = String(settings.referenceRole || "main_character");
    const name = String(settings.characterName || "Character");
    if (settings.referenceRequirementId || role === "location" || role === "prop") return name;
    return `${name} ${String(settings.directReferenceUse) === "supporting_detail" ? "detail sheet" : "AI reference"}`;
}

function buildReferenceRecord(job, asset, settings, stored) {
    const { toStudioMediaUrl, now } = runtime;
    const role = String(settings.referenceRole || "main_character");
    const referenceUse = String(settings.directReferenceUse);
    const characterName = String(settings.characterName || "Character");
    return {
      id: stored.referenceId, projectId: job.projectId, name: referenceName(settings), role, referenceUse,
      characterSlot: String(settings.characterSlot || ""), filePath: stored.filePath, previewDataUrl: toStudioMediaUrl(stored.filePath),
      sourceDescription: `Generated directly from ${asset.sourceProvider || "selected image AI"} for ${characterName}.`,
      transformationRequest: String(settings.directReferenceNote || "Directly generated for this locked reference slot."),
      sourceJobId: job.id, sourceAssetId: asset.id, sourceProvider: asset.sourceProvider || job.providerId,
      sourceAspectRatio: String(settings.aspectRatio || "") || undefined, visualStyle: String(settings.visualStyle || "") || undefined,
      providerConversationUrl: job.providerConversationUrl,
      identityContract: settings.identityContract && typeof settings.identityContract === "object" ? settings.identityContract : undefined,
      createdAt: now()
    };
}

function referenceSavedMessage(role, referenceUse) {
    if (role === "location" || role === "prop") return `${role === "location" ? "Location" : "Prop"} reference saved directly into the locked library.`;
    return referenceUse === "supporting_detail" ? "Detail sheet saved directly into the locked library." : "Reference saved directly into the locked library.";
}

function addReference(job, asset, settings, stored) {
    const { getState } = runtime;
    const role = String(settings.referenceRole || "main_character");
    const referenceUse = String(settings.directReferenceUse);
    getState().visualReferences.push(buildReferenceRecord(job, asset, settings, stored));
    job.status = "approved";
    job.statusMessage = referenceSavedMessage(role, referenceUse);
    job.progress = 1;
}

function promoteAssetToReference(job, incoming, asset) {
    const settings = job.input?.bridgeMessage?.settings || {};
    if (!settings.directReferenceUse || asset.type !== "image" || !asset.filePath) return false;
    // Keep the existing locked reference until the replacement is safely
    // persisted. A failed copy/crop must not erase the only usable reference.
    const replaced = replacedReferences(job, settings);
    const stored = persistImage(job, incoming, asset);
    if (!stored) return false;
    cropToAspect(stored.filePath, String(settings.aspectRatio || ""));
    removeReplaced(job, settings, replaced);
    addReference(job, asset, settings, stored);
    return true;
}

function createReferencePromotion(dependencies) {
  runtime = dependencies;
  return promoteAssetToReference;
}

module.exports = { createReferencePromotion };
