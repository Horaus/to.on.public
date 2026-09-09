const SPEECH_TYPES = new Set(["dialogue", "inner_monologue", "narration", "silent"]);
const SPEECH_DELIVERIES = new Set(["onscreen_lipsync", "offscreen_voiceover", "internal_voice", "recording", "none"]);

function normalizedIds(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function narrativeContext(result) {
  const storyCharacters = Array.isArray(result.characters) ? result.characters : [];
  const primarySubject = storyCharacters.find((character) => /^main(?:$|[_\s-])/i.test(String(character.role || "")) && character.required === true);
  const visualRequirements = Array.isArray(result.visualRequirements) ? result.visualRequirements : [];
  const requirementById = new Map(visualRequirements.map((requirement) => [String(requirement.id || "").trim(), requirement]));
  const narrativeContract = result.narrativeContract && typeof result.narrativeContract === "object" ? result.narrativeContract : undefined;
  const contractBeats = Array.isArray(narrativeContract?.beats) ? narrativeContract.beats : [];
  const contractBeatIds = new Set(contractBeats.map((beat) => String(beat?.id || "").trim()).filter(Boolean));
  const contractBeatById = new Map(contractBeats.map((beat) => [String(beat?.id || "").trim(), beat]));
  const allowedSpeakerNames = new Set(normalizedIds(narrativeContract?.allowedSpeakerNames).map((name) => name.toLowerCase()));
  return { storyCharacters, primarySubject, visualRequirements, requirementById, narrativeContract, contractBeats, contractBeatIds, contractBeatById, allowedSpeakerNames };
}

function assertRequiredFields(value, fields, label) {
  for (const field of fields) if (!String(value?.[field] || "").trim()) throw new Error(`${label} requires ${field}.`);
}

function assertNarrativeContract(context) {
  assertRequiredFields(context.narrativeContract, ["corePremise", "primaryObjective", "requiredOutcome"], "Narrative contract");
  if (!context.contractBeats.length || context.contractBeatIds.size !== context.contractBeats.length) throw new Error("Narrative contract requires uniquely identified source beats.");
  context.contractBeats.forEach((beat, index) => assertRequiredFields(beat, ["sourceEvidence", "requiredAction", "requiredOutcome"], `Narrative contract beat ${index + 1}`));
}

function validateNarrativePackage(result, requiresScreenplayV2) {
  const context = narrativeContext(result);
  if (!context.primarySubject) throw new Error("Story import requires one primary subject with role main and required true.");
  if (!context.visualRequirements.some((requirement) => requirement.role === "main_character")) throw new Error("Story import requires a main_character image requirement for the primary subject.");
  if (requiresScreenplayV2) assertNarrativeContract(context);
  delete context.primarySubject;
  return context;
}

function validateSceneNarrative({ scene, sceneIndex, contractBeatIds }) {
  const label = `Scene ${sceneIndex + 1}`;
  const sceneContractBeatIds = normalizedIds(scene.contractBeatIds);
  assertRequiredFields(scene, ["objective", "conflict", "dramaticTurn", "entryState", "exitState"], label);
  if (!sceneContractBeatIds.length || sceneContractBeatIds.some((beatId) => !contractBeatIds.has(beatId))) throw new Error(`${label} requires valid narrative contract beat ids.`);
  return sceneContractBeatIds;
}

function validateSceneVisuals({ scene, sceneIndex, requirementById }) {
  const label = `Scene ${sceneIndex + 1}`;
  const sceneRequirementIds = new Set(normalizedIds(scene.referenceRequirementIds));
  const referencedRequirements = normalizedIds(scene.referenceRequirementIds).map((requirementId) => requirementById.get(requirementId)).filter(Boolean);
  if (!referencedRequirements.some((requirement) => requirement.role === "location")) throw new Error(`${label} requires a location image requirement.`);
  for (const propName of Array.isArray(scene.requiredProps) ? scene.requiredProps : []) {
    const normalizedPropName = String(propName || "").trim().toLowerCase();
    const hasProp = referencedRequirements.some((requirement) => requirement.role === "prop" && String(requirement.name || "").trim().toLowerCase() === normalizedPropName);
    if (!hasProp) throw new Error(`${label} required prop "${propName}" is missing a referenced prop image requirement.`);
  }
  const changedIds = normalizedIds(scene.assetDelta?.changedReferenceRequirementIds);
  if (changedIds.some((requirementId) => !sceneRequirementIds.has(requirementId) || !requirementById.has(requirementId))) throw new Error(`${label} assetDelta must transform an existing base asset referenced by that scene.`);
  return sceneRequirementIds;
}

function validateScenePackage({ scene, sceneIndex, requiresScreenplayV2, contractBeatIds, requirementById }) {
  const sceneContractBeatIds = requiresScreenplayV2 ? validateSceneNarrative({ scene, sceneIndex, contractBeatIds }) : normalizedIds(scene.contractBeatIds);
  const sceneRequirementIds = validateSceneVisuals({ scene, sceneIndex, requirementById });
  return { sceneContractBeatIds, sceneRequirementIds };
}

function validateShotReferences({ shot, sceneIndex, shotIndex, sceneRequirementIds, requirementById }) {
  const label = `Scene ${sceneIndex + 1} shot ${shotIndex + 1}`;
  const shotRequirementIds = normalizedIds(shot.referenceRequirementIds);
  const shotRequirements = shotRequirementIds.map((requirementId) => requirementById.get(requirementId)).filter(Boolean);
  if (!shotRequirementIds.length || shotRequirementIds.some((requirementId) => !sceneRequirementIds.has(requirementId) || !requirementById.has(requirementId))) throw new Error(`${label} requires an explicit valid reference subset.`);
  if (!shotRequirements.some((requirement) => requirement.role === "location")) throw new Error(`${label} requires its scene location reference.`);
  if (shotRequirements.length > 8) {
    shot.planningWarnings = [...(Array.isArray(shot.planningWarnings) ? shot.planningWarnings : []), `${label} uses ${shotRequirements.length} semantic references; split the shot before keyframe/video generation because Flow supports at most 8.`];
  }
}

function assertContractCoverage(contractBeatIds, sceneCoveredContractBeats, shotCoveredContractBeats) {
  const missingSceneBeats = [...contractBeatIds].filter((beatId) => !sceneCoveredContractBeats.has(beatId));
  const missingShotBeats = [...contractBeatIds].filter((beatId) => !shotCoveredContractBeats.has(beatId));
  if (missingSceneBeats.length || missingShotBeats.length) throw new Error(`Narrative contract coverage is incomplete. Missing scene beats: ${missingSceneBeats.join(", ") || "none"}; missing shot beats: ${missingShotBeats.join(", ") || "none"}.`);
}

function contractAllowsSpeaker(contractBeatById, contractBeatIds, speaker) {
  const normalizedSpeaker = String(speaker || "").trim().toLowerCase();
  return contractBeatIds.some((beatId) => normalizedIds(contractBeatById.get(beatId)?.allowedSpeakerNames)
    .some((name) => name.toLowerCase() === normalizedSpeaker));
}

function validateActionBeat({ beat, beatIndex, label, allowedSpeakerNames, contractBeatById, shotContractBeatIds }) {
  const beatLabel = `${label} beat ${beatIndex + 1}`;
  const speechType = String(beat.speechType || "");
  const delivery = String(beat.speechDelivery || "");
  validateBeatModes(speechType, delivery, beatLabel);
  const hasSpeech = speechType !== "silent" && String(beat.dialogue || "").trim();
  validateBeatSpeaker(beat, hasSpeech, beatLabel, allowedSpeakerNames, contractBeatById, shotContractBeatIds);
  validateDeliveryPair({ hasSpeech, speechType, delivery, label: beatLabel });
}

function validateBeatModes(speechType, delivery, beatLabel) {
  if (!SPEECH_TYPES.has(speechType)) throw new Error(`${beatLabel} requires speechType.`);
  if (!SPEECH_DELIVERIES.has(delivery)) throw new Error(`${beatLabel} requires speechDelivery.`);
}

function validateBeatSpeaker(beat, hasSpeech, beatLabel, allowedSpeakerNames, contractBeatById, shotContractBeatIds) {
  const normalizedSpeaker = String(beat.speaker || "").trim().toLowerCase();
  if (hasSpeech && (!normalizedSpeaker || !allowedSpeakerNames.has(normalizedSpeaker))) throw new Error(`${beatLabel} requires an allowed stable speaker.`);
  if (hasSpeech && !contractAllowsSpeaker(contractBeatById, shotContractBeatIds, beat.speaker)) throw new Error(`${beatLabel} speaker ${beat.speaker} is not allowed by its narrative contract beat.`);
}

function validateDeliveryPair({ hasSpeech, speechType, delivery, label }) {
  if (speechType === "silent" && delivery !== "none") throw new Error(`${label} silent delivery must be none.`);
  if (hasSpeech && delivery === "none") throw new Error(`${label} speech delivery cannot be none.`);
}

function validateActionBeats({ shot, beats, sceneIndex, shotIndex, allowedSpeakerNames, contractBeatById, shotContractBeatIds }) {
  const label = `Scene ${sceneIndex + 1} shot ${shotIndex + 1}`;
  if (!beats.length || Number(beats[0]?.startSec) !== 0 || Number(beats.at(-1)?.endSec) !== Number(shot.durationSec)) {
    throw new Error(`${label} actionBeats must cover 0 through durationSec.`);
  }
  if (beats.some((beat, index) => index > 0 && Number(beat.startSec) !== Number(beats[index - 1].endSec))) {
    throw new Error(`${label} actionBeats must be contiguous.`);
  }
  beats.forEach((beat, beatIndex) => validateActionBeat({ beat, beatIndex, label, allowedSpeakerNames, contractBeatById, shotContractBeatIds }));
}

function validateShotStructure({ shot, scene, label, contractBeatIds }) {
  const shotContractBeatIds = normalizedIds(shot.contractBeatIds);
  if (!shotContractBeatIds.length || shotContractBeatIds.some((beatId) => !contractBeatIds.has(beatId))) throw new Error(`${label} requires valid narrative contract beat ids.`);
  const sceneBeatIds = normalizedIds(scene.contractBeatIds);
  if (shotContractBeatIds.some((beatId) => !sceneBeatIds.includes(beatId))) throw new Error(`${label} references a contract beat outside its scene.`);
  assertRequiredFields(shot, ["storyBeat", "dominantAction", "transitionIn", "transitionOut", "screenDirection"], label);
  if (Number(shot.visualTransformationCount) !== 1) throw new Error(`${label} visualTransformationCount must equal 1; split independent material changes into separate shots.`);
  assertRequiredFields(shot.continuityContract, ["geography", "incomingState", "outgoingState"], label);
  return shotContractBeatIds;
}

function validateShotSpeaker({ shot, label, speechType, speechDelivery, allowedSpeakerNames, contractBeatById, shotContractBeatIds }) {
  const hasSpeech = speechType !== "silent";
  if (hasSpeech) assertRequiredFields(shot, ["speaker", "dialoguePurpose", "dialogue"], label);
  const normalizedSpeaker = String(shot.speaker || "").trim().toLowerCase();
  if (hasSpeech && !allowedSpeakerNames.has(normalizedSpeaker)) throw new Error(`${label} speaker must exist in narrativeContract.allowedSpeakerNames.`);
  if (hasSpeech && !contractAllowsSpeaker(contractBeatById, shotContractBeatIds, shot.speaker)) throw new Error(`${label} speaker ${shot.speaker} is not allowed by its narrative contract beat.`);
  if (speechDelivery === "recording" && !String(shot.recordingSource || "").trim()) throw new Error(`${label} recording delivery requires recordingSource.`);
}

function validateShotSpeechBudget({ shot, label, speechType }) {
  const hasSpeech = speechType !== "silent";
  const spokenWordCount = String(shot.dialogue || "").trim().split(/\s+/).filter(Boolean).length;
  const spokenWordBudget = Math.max(0, Math.floor(Number(shot.durationSec) * 2 - 1));
  if (hasSpeech && spokenWordCount > spokenWordBudget) throw new Error(`${label} dialogue has ${spokenWordCount} words but its ${shot.durationSec}s duration allows at most ${spokenWordBudget}. Shorten the line or allocate a longer provider duration.`);
}

function validateScreenplayShot({ shot, scene, sceneIndex, shotIndex, contractBeatIds, contractBeatById, allowedSpeakerNames }) {
  const label = `Scene ${sceneIndex + 1} shot ${shotIndex + 1}`;
  const speechType = String(shot.speechType || "");
  const speechDelivery = String(shot.speechDelivery || "");
  if (!SPEECH_TYPES.has(speechType)) throw new Error(`${label} requires an explicit speechType.`);
  if (!SPEECH_DELIVERIES.has(speechDelivery)) throw new Error(`${label} requires a valid speechDelivery.`);
  shot.speechDelivery = speechDelivery;
  const shotContractBeatIds = validateShotStructure({ shot, scene, label, contractBeatIds });
  validateShotSpeaker({ shot, label, speechType, speechDelivery, allowedSpeakerNames, contractBeatById, shotContractBeatIds });
  validateShotSpeechBudget({ shot, label, speechType });
  const beats = Array.isArray(shot.actionBeats) ? shot.actionBeats : [];
  validateActionBeats({ shot, beats, sceneIndex, shotIndex, allowedSpeakerNames, contractBeatById, shotContractBeatIds });
  return shotContractBeatIds;
}

function readableVisualChange(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return String(value || "").trim();
  const preferred = ["description", "change", "name", "label", "state", "action"].map((key) => value[key]).filter((item) => typeof item === "string" && item.trim());
  if (preferred.length) return preferred.join(": ");
  return Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item)).map(([key, item]) => `${key}: ${String(item)}`).join(", ");
}

function changesForRequirement(value, baseId) {
  return (Array.isArray(value) ? value : [value])
    .filter((item) => !item || typeof item !== "object" || !item.referenceRequirementId || item.referenceRequirementId === baseId)
    .map(readableVisualChange)
    .filter(Boolean);
}

function variantChangeText(scene, base, baseId) {
  if (base.role === "prop") return changesForRequirement(scene.assetDelta?.propChanges, baseId).join("; ");
  if (base.role === "location") return String(scene.assetDelta?.settingChange || "");
  return changesForRequirement(scene.assetDelta?.characterChanges, baseId).join("; ");
}

function resolveVisualVariants(visualRequirements, scenes, requirementById) {
  const resolvedVisualRequirements = [...visualRequirements];
  const activeVariantByBaseId = new Map(visualRequirements.map((requirement) => [String(requirement.id || "").trim(), String(requirement.id || "").trim()]));
  const resolvedScenes = scenes.map((scene, sceneIndex) => {
    const changedIds = normalizedIds(scene.assetDelta?.changedReferenceRequirementIds);
    for (const baseId of changedIds) {
      const base = requirementById.get(baseId);
      if (!base) continue;
      const changeText = variantChangeText(scene, base, baseId);
      const variantId = `${baseId}__scene_${sceneIndex + 1}_variant`;
      resolvedVisualRequirements.push({
        ...base,
        id: variantId,
        name: `${base.name} · Scene ${sceneIndex + 1} changed state`,
        description: `Generate a new visual state variant from base asset ${base.name}. Preserve identity/design facts from ${baseId}. Apply only this visible change: ${changeText || "the scene-authored state transition"}.`,
        continuityRules: `Derived from ${baseId}. Preserve every base feature not explicitly changed. Use this variant from Scene ${sceneIndex + 1} until another authored state change replaces it.`,
        requiredInSceneIndexes: [sceneIndex + 1],
        baseReferenceRequirementId: baseId,
        stateVariantForSceneIndex: sceneIndex + 1
      });
      activeVariantByBaseId.set(baseId, variantId);
    }
    const resolveRequirementId = (requirementId) => activeVariantByBaseId.get(String(requirementId || "").trim()) || String(requirementId || "").trim();
    return { ...scene, referenceRequirementIds: (scene.referenceRequirementIds || []).map(resolveRequirementId), shots: (scene.shots || []).map((shot) => ({ ...shot, referenceRequirementIds: (shot.referenceRequirementIds || []).map(resolveRequirementId) })) };
  });
  return { resolvedVisualRequirements, resolvedScenes };
}

module.exports = { validateNarrativePackage, validateScenePackage, validateScreenplayShot, validateShotReferences, assertContractCoverage, resolveVisualVariants, readableVisualChange };
