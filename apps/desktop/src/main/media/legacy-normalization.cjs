const { completedAssetJobMessage } = require("../jobs/completion-message.cjs");

let path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, supersedeRetriedSourceJob, now, id;

function createLegacyNormalization(dependencies) {
  ({ path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, supersedeRetriedSourceJob, now, id } = dependencies);
  return { normalizePersistedReviewJobs, normalizeSuccessfulRetryJobs, normalizePassedPreflightJobs, normalizeLegacyStateVariantPrompts, normalizeShotSpeechDelivery, duplicateFlowVideoResult };
}

function normalizePersistedReviewJobs() {
  let changed = false;
  for (const job of getState().jobs || []) {
    if (job.status !== "review_required" || (job.resultAssetIds || []).length === 0) continue;
    const staleActiveCopy = /injecting|download|waiting|generating|opening provider|submitting/i.test(String(job.statusMessage || ""));
    const staleProgress = typeof job.progress === "number" && job.progress < 1;
    if (!staleActiveCopy && !staleProgress && !job.error) continue;
    job.error = undefined;
    job.statusMessage = completedAssetJobMessage(job);
    job.progress = 1;
    changed = true;
  }
  return changed;
}

function normalizeSuccessfulRetryJobs() {
  let changed = 0;
  for (const job of getState().jobs || []) {
    if (job.status !== "review_required" || (job.resultAssetIds || []).length === 0) continue;
    if (supersedeRetriedSourceJob(job)) changed++;
  }
  return changed;
}

function normalizePassedPreflightJobs() {
  let changed = 0;
  for (const job of getState().jobs || []) {
    if (job.input?.bridgeMessage?.settings?.preflightOnly !== true) continue;
    const message = String(job.error || job.statusMessage || "");
    if (!job.preflightPassedAt && !/preflight passed without submitting or spending credit/i.test(message)) continue;
    job.status = "done";
    job.error = undefined;
    job.statusMessage = /preflight passed/i.test(message) ? message : "Studio Shot Bridge I2V preflight passed without submitting or spending credit.";
    job.progress = 1;
    job.preflightPassedAt ||= job.updatedAt || now();
    job.needsStrictFlowRecovery = false;
    delete job.providerAcceptedAt;
    changed++;
  }
  return changed;
}

function readableLegacyChange(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return String(value || "").trim();
    const preferred = ["description", "change", "name", "label", "state", "action"]
      .map((key) => value[key])
      .filter((item) => typeof item === "string" && item.trim());
    return preferred.length ? preferred.join(": ") : Object.entries(value)
      .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(", ");
}

function variantDeltaValues(base, assetDelta) {
  if (base.role === "prop") return assetDelta.propChanges;
  if (base.role === "location") return [assetDelta.settingChange];
  return assetDelta.characterChanges;
}

function repairLegacyAssetDelta(scene, authoredDelta) {
  if (!scene || !authoredDelta) return;
  if (JSON.stringify(scene.assetDelta || {}).includes("[object Object]")) {
    scene.assetDelta = JSON.parse(JSON.stringify(authoredDelta));
  }
}

function matchingVariantValues(base, assetDelta, baseId) {
  const values = variantDeltaValues(base, assetDelta);
  return (Array.isArray(values) ? values : [values]).filter((value) => {
    if (!value || typeof value !== "object") return true;
    return !value.referenceRequirementId || value.referenceRequirementId === baseId;
  });
}

function updateVariantGraphNode(project, requirement, name, description, baseId) {
  const node = (project.productionGraphCustomNodes || []).find((item) => item.referenceRequirementId === requirement.id);
  if (!node) return;
  node.title = name;
  node.text = `${description}\n\nContinuity rules: ${requirement.continuityRules || `Derived from ${baseId}. Preserve every base feature not explicitly changed.`}\n\nBase asset: ${baseId}`;
}

function normalizeVariantRequirement(project, requirement, requirementById, projectScenes) {
  const baseId = requirement.baseReferenceRequirementId;
  const sceneIndex = Number(requirement.stateVariantForSceneIndex || 0);
  if (!baseId || !sceneIndex) return false;
  const base = requirementById.get(baseId);
  const scene = projectScenes.find((item) => item.order === sceneIndex);
  const authoredDelta = project.storyDocument?.scenes?.[sceneIndex - 1]?.assetDelta;
  repairLegacyAssetDelta(scene, authoredDelta);
  const assetDelta = authoredDelta || scene?.assetDelta;
  if (!base || !assetDelta) return false;
  const changeText = matchingVariantValues(base, assetDelta, baseId).map(readableLegacyChange).filter(Boolean).join("; ");
  if (!changeText) return false;
  const description = `Generate a new visual state variant from base asset ${base.name}. Preserve identity/design facts from ${baseId}. Apply only this visible change: ${changeText}.`;
  const name = `${base.name} · Scene ${sceneIndex} state`;
  const changed = requirement.description !== description || requirement.name !== name;
  requirement.description = description;
  requirement.name = name;
  updateVariantGraphNode(project, requirement, name, description, baseId);
  return changed;
}

function normalizeLegacyStateVariantPrompts() {
  let changed = 0;
  for (const project of getState().projects || []) {
    const requirements = project.storyDocument?.visualRequirements || [];
    const requirementById = new Map(requirements.map((item) => [item.id, item]));
    const projectScenes = (getState().scenes || []).filter((scene) => scene.projectId === project.id);
    for (const requirement of requirements) {
      if (normalizeVariantRequirement(project, requirement, requirementById, projectScenes)) changed++;
    }
  }
  return changed;
}

function normalizeShotSpeechDelivery() {
  let changed = 0;
  const characterByProjectAndName = new Map((getState().characters || []).map((character) => [`${character.projectId}:${String(character.name || "").toLowerCase()}`, character]));
  for (const shot of getState().shots || []) {
    if (shot.speechDelivery) continue;
    const scene = (getState().scenes || []).find((item) => item.id === shot.sceneId);
    const speaker = String(shot.speaker || "").trim();
    const speakerCharacter = scene ? characterByProjectAndName.get(`${scene.projectId}:${speaker.toLowerCase()}`) : undefined;
    shot.speechDelivery = shot.speechType === "silent" || !String(shot.dialogue || "").trim()
      ? "none"
      : shot.speechType === "inner_monologue"
        ? "internal_voice"
        : shot.speechType === "narration"
          ? "offscreen_voiceover"
          : speakerCharacter?.audibleOnly || /giọng|voice|recording|radio|phone/i.test(speaker)
            ? "recording"
            : "onscreen_lipsync";
    changed++;
  }
  return changed;
}

function matchingFlowVideoIdentity(metadata, assetMetadata) {
  return Boolean((metadata.flowTileId && assetMetadata.flowTileId === metadata.flowTileId) ||
    (metadata.originalUrl && assetMetadata.originalUrl === metadata.originalUrl) ||
    (metadata.flowResultUrl && assetMetadata.flowResultUrl === metadata.flowResultUrl));
}

function eligibleFlowDuplicate(asset, job) {
  return asset.projectId === job.projectId && asset.type === "video" &&
    (asset.sourceProvider === "google-flow" || asset.sourceJobId === job.id || asset.metadata?.studioJobId === job.id) &&
    !asset.metadata?.hiddenFromStoryboard;
}

function duplicateFlowVideoResult(job, incoming, incomingType) {
  if (!job || incomingType !== "video") return null;
  const metadata = incoming?.metadata || {};
  if (!isFlowVideoResult(job, incoming, metadata)) return null;
  return (getState().assets || []).find((asset) => eligibleFlowDuplicate(asset, job) && matchingFlowVideoIdentity(metadata, asset.metadata || {})) || null;
}

function isFlowVideoResult(job, incoming, metadata) {
  const hasFlowSignature = Boolean(metadata.flowTileId || metadata.originalUrl || metadata.flowResultUrl);
  const providerMatches = incoming?.provider === "google-flow" || job.providerId === "google-flow-web";
  return hasFlowSignature && (providerMatches || hasFlowSignature);
}

module.exports = { createLegacyNormalization };
