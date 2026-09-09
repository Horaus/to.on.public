const { validateNarrativePackage, validateScenePackage, validateScreenplayShot, validateShotReferences, assertContractCoverage, resolveVisualVariants, readableVisualChange } = require("../story-shot-validation.cjs");
const { materializeStoryCharacters } = require("../story-character-materialization.cjs");

let deps;
let state;

function createLegacyStoryResultHandler(runtimeDeps) {
  deps = runtimeDeps;
  state = new Proxy({}, { get: (_, key) => deps.getState()[key] });
  return applyStoryResult;
}

const extractLatestStoryJson = (...args) => deps.extractLatestStoryJson(...args);
const id = (...args) => deps.id(...args);
const now = (...args) => deps.now(...args);
const recommendedProjectShotCount = (...args) => deps.recommendedProjectShotCount(...args);
const normalizeProjectShotDuration = (...args) => deps.normalizeProjectShotDuration(...args);
const upsertProjectCharactersFromStory = (...args) => deps.upsertProjectCharactersFromStory(...args);

function validateLegacyPackage(result, requiresScreenplayV2) {
  const narrative = validateNarrativePackage(result, requiresScreenplayV2);
  const sceneCoverage = new Set();
  const shotCoverage = new Set();
  for (const [sceneIndex, scene] of result.scenes.entries()) {
    const sceneContract = validateScenePackage({ scene, sceneIndex, requiresScreenplayV2, contractBeatIds: narrative.contractBeatIds, requirementById: narrative.requirementById });
    if (requiresScreenplayV2) sceneContract.sceneContractBeatIds.forEach((beatId) => sceneCoverage.add(beatId));
    for (const [shotIndex, shot] of (Array.isArray(scene.shots) ? scene.shots : []).entries()) {
      if (requiresScreenplayV2) {
        const beatIds = validateScreenplayShot({ shot, scene, sceneIndex, shotIndex, contractBeatIds: narrative.contractBeatIds, contractBeatById: narrative.contractBeatById, allowedSpeakerNames: narrative.allowedSpeakerNames });
        beatIds.forEach((beatId) => shotCoverage.add(beatId));
      }
      validateShotReferences({ shot, sceneIndex, shotIndex, sceneRequirementIds: sceneContract.sceneRequirementIds, requirementById: narrative.requirementById });
    }
  }
  if (requiresScreenplayV2) assertContractCoverage(narrative.contractBeatIds, sceneCoverage, shotCoverage);
  return narrative;
}

function renderSceneBreakdown(result, resolvedScenes) {
  const generated = resolvedScenes.map((scene, index) => {
    const title = String(scene.title || `Scene ${index + 1}`);
    const summary = String(scene.summary || "");
    const shots = Array.isArray(scene.shots) ? scene.shots.map((shot, shotIndex) => {
      const duration = Number(shot.durationSec) ? ` ${Number(shot.durationSec)}s` : "";
      return `SH${shotIndex + 1}${duration}: ${String(shot.description || shot.dialogue || "").trim()}`;
    }).filter(Boolean).join(" | ") : "";
    return `${index + 1}. ${title}${summary ? `: ${summary}` : ""}${shots ? ` | ${shots}` : ""}`;
  }).join("\n");
  return String(result.sceneBreakdown || result.screenplay || generated)
    .replace(/\s+(?=(?:\d+\.|HOOK\b|CONTEXT\b|CORE VALUE\b|SAFETY\b|PAYOFF\b))/gi, "\n")
    .replace(/(\d+)\.\s*\n\s*/g, "$1. ").replace(/Safety and\s*\n\s*payoff/gi, "Safety and payoff").trim();
}

function normalizeNarrativeContract(contract, beats) {
  if (!contract) return undefined;
  const strings = (values) => Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean) : [];
  return {
    corePremise: String(contract.corePremise || "").trim(), primaryObjective: String(contract.primaryObjective || "").trim(), requiredDecision: String(contract.requiredDecision || "").trim(), requiredOutcome: String(contract.requiredOutcome || "").trim(),
    namedEntities: strings(contract.namedEntities), allowedSpeakerNames: strings(contract.allowedSpeakerNames), forbiddenContradictions: strings(contract.forbiddenContradictions),
    beats: beats.map((beat) => ({ id: String(beat.id || "").trim(), sourceEvidence: String(beat.sourceEvidence || "").trim(), requiredAction: String(beat.requiredAction || "").trim(), requiredOutcome: String(beat.requiredOutcome || "").trim(), allowedSpeakerNames: strings(beat.allowedSpeakerNames), obligations: Array.isArray(beat.obligations) ? beat.obligations.map((obligation) => ({ id: String(obligation.id || "").trim(), modality: obligation.modality, content: String(obligation.content || "").trim(), allowedSpeakerNames: strings(obligation.allowedSpeakerNames) })) : [] }))
  };
}

function normalizeStoryCharacters(characters) {
  return characters.map((character) => ({ name: String(character.name || "Unnamed character"), role: String(character.role || "context"), storyFunction: String(character.storyFunction || character.function || ""), visualBrief: String(character.visualBrief || character.visualDescription || ""), voiceBrief: String(character.voiceBrief || ""), audibleOnly: Boolean(character.audibleOnly), required: Boolean(character.required) }));
}

function normalizeVisualRequirements(requirements) {
  return requirements.map((requirement, index) => ({ id: String(requirement.id || `visual-${index + 1}`).trim(), name: String(requirement.name || `Visual requirement ${index + 1}`).trim(), role: ["main_character", "supporting_character", "location", "prop"].includes(requirement.role) ? requirement.role : "prop", description: String(requirement.description || "").trim(), continuityRules: String(requirement.continuityRules || "").trim(), requiredInSceneIndexes: Array.isArray(requirement.requiredInSceneIndexes) ? requirement.requiredInSceneIndexes.map(Number).filter((value) => Number.isInteger(value) && value > 0) : [], baseReferenceRequirementId: String(requirement.baseReferenceRequirementId || "").trim() || undefined, stateVariantForSceneIndex: Number(requirement.stateVariantForSceneIndex || 0) || undefined })).filter((requirement) => requirement.id && requirement.description);
}

function buildStoryDocument(result, narrative, resolvedScenes, resolvedVisualRequirements) {
  return { logline: result.logline, story: result.story, sceneBreakdown: renderSceneBreakdown(result, resolvedScenes), narrativeContract: normalizeNarrativeContract(narrative.narrativeContract, narrative.contractBeats), scenes: resolvedScenes, characters: normalizeStoryCharacters(narrative.storyCharacters), visualRequirements: normalizeVisualRequirements(resolvedVisualRequirements), comments: [], manuallyEdited: false, generatedAt: now() };
}

function syncRequirementNodes(project) {
  const preserved = (project.productionGraphCustomNodes || []).filter((node) => node.systemGenerated !== "visual-requirement");
  const generated = (project.storyDocument.visualRequirements || []).map((requirement) => ({ id: `requirement-${requirement.id}`, kind: "image-generate", title: requirement.name, text: `${requirement.description}\n\nContinuity rules: ${requirement.continuityRules}${requirement.baseReferenceRequirementId ? `\n\nBase asset: ${requirement.baseReferenceRequirementId}` : ""}`.trim(), systemGenerated: "visual-requirement", referenceRequirementId: requirement.id, referenceRole: requirement.role, createdAt: now() }));
  project.productionGraphCustomNodes = [...preserved, ...generated];
}

const stringList = (value) => (Array.isArray(value) ? value : [value]).map(readableVisualChange).filter(Boolean);

function legacySceneDelta(delta) {
  if (!delta || typeof delta !== "object") return undefined;
  const characterChanges = stringList(delta.characterChanges);
  const propChanges = stringList(delta.propChanges);
  const settingChange = String(delta.settingChange || "").trim();
  if (![characterChanges.length, propChanges.length, settingChange].some(Boolean)) return undefined;
  return { characterChanges, propChanges, settingChange, changedReferenceRequirementIds: legacyStringList(delta.changedReferenceRequirementIds) };
}

function normalizeLegacyScene(project, scene, sceneIndex) {
  return { id: id("scene"), projectId: project.id, ...legacySceneIdentity(scene, sceneIndex), ...legacySceneContract(scene), assetDelta: legacySceneDelta(scene.assetDelta), order: sceneIndex + 1 };
}

function legacySceneIdentity(scene, sceneIndex) {
  return { title: String(scene.title || `Scene ${sceneIndex + 1}`), summary: String(scene.summary || ""), location: String(scene.location || "Unspecified location"), timeOfDay: String(scene.timeOfDay || "Continuous"), emotionalTone: String(scene.emotionalTone || "Neutral") };
}

function legacySceneContract(scene) {
  return { contractBeatIds: legacyStringList(scene.contractBeatIds), objective: String(scene.objective || "").trim(), conflict: String(scene.conflict || "").trim(), dramaticTurn: String(scene.dramaticTurn || "").trim(), entryState: String(scene.entryState || "").trim(), exitState: String(scene.exitState || "").trim(), settingDescription: String(scene.settingDescription || "").trim(), requiredProps: legacyStringList(scene.requiredProps), wardrobeState: String(scene.wardrobeState || "").trim(), referenceRequirementIds: legacyStringList(scene.referenceRequirementIds) };
}

function replaceProjectScenes(project, resolvedScenes) {
  const importedScenes = resolvedScenes.map((scene, index) => normalizeLegacyScene(project, scene, index));
  deps.mutateState((nextState) => {
    const previousSceneIds = new Set(nextState.scenes.filter((scene) => scene.projectId === project.id).map((scene) => scene.id));
    nextState.shots = nextState.shots.filter((shot) => !previousSceneIds.has(shot.sceneId));
    nextState.scenes = nextState.scenes.filter((scene) => scene.projectId !== project.id);
    nextState.scenes.push(...importedScenes);
  }, { reason: "legacy-story-scene-import" });
  return importedScenes;
}

function defaultLegacyShot(scene, project, targetDuration, minimumShotCount) {
  return { description: scene.summary || `${scene.title} beat`, dialogue: "", camera: "Medium shot, locked camera.", motion: "Subtle controlled subject motion.", durationSec: normalizeProjectShotDuration(project, Math.round(targetDuration / minimumShotCount)) };
}

function additionalLegacyShot(scene, project, targetDuration, minimumShotCount) {
  return { description: `Reaction/detail beat for ${scene.title}: ${scene.summary}`, dialogue: "", camera: "Close detail, eye-level, locked camera.", motion: "Small prop, hand, or facial motion only.", dominantAction: "One small reaction completes in frame.", visualTransformationCount: 1, transitionIn: String(scene.entryState || "Inherit the previous visible state."), transitionOut: String(scene.exitState || "End on one explicit visible state."), screenDirection: "Preserve established left/right geography, eyeline, and prop ownership.", continuityContract: { geography: "Preserve established left/right geography and the 180-degree axis.", incomingState: String(scene.entryState || "Inherit the previous visible state."), outgoingState: String(scene.exitState || "End on one explicit visible state."), entities: [] }, durationSec: normalizeProjectShotDuration(project, Math.round(targetDuration / minimumShotCount)) };
}

function normalizeLegacyShotInventory(project, resolvedScenes, importedScenes) {
  const targetDuration = Number(project.intake?.targetDurationSec || 0) || 30;
  const minimumShotCount = recommendedProjectShotCount(project, targetDuration);
  const shots = importedScenes.map((scene, index) => {
    const source = Array.isArray(resolvedScenes[index]?.shots) ? resolvedScenes[index].shots.slice(0, 12) : [];
    return source.length ? source : [defaultLegacyShot(scene, project, targetDuration, minimumShotCount)];
  });
  let count = shots.reduce((total, sceneShots) => total + sceneShots.length, 0);
  for (let sceneIndex = 0; count < minimumShotCount && importedScenes.length; sceneIndex = (sceneIndex + 1) % importedScenes.length) {
    shots[sceneIndex].push(additionalLegacyShot(importedScenes[sceneIndex], project, targetDuration, minimumShotCount));
    count += 1;
  }
  return shots;
}

function normalizeContinuityContract(shot) {
  if (!shot.continuityContract || typeof shot.continuityContract !== "object") return undefined;
  const contract = shot.continuityContract;
  return { geography: String(contract.geography || shot.screenDirection || "").trim(), incomingState: String(contract.incomingState || shot.transitionIn || "").trim(), outgoingState: String(contract.outgoingState || shot.transitionOut || "").trim(), fixedAnchors: Array.isArray(contract.fixedAnchors) ? contract.fixedAnchors.map(String).map((value) => value.trim()).filter(Boolean) : [], entities: normalizeContinuityEntities(contract.entities) };
}

function normalizeContinuityEntities(entities) {
  if (!Array.isArray(entities)) return [];
  return entities.map((entity) => ({ id: String(entity.id || "").trim(), screenSide: ["left", "center", "right"].includes(String(entity.screenSide)) ? String(entity.screenSide) : undefined, owner: String(entity.owner || "").trim(), state: String(entity.state || "").trim(), anchor: String(entity.anchor || "").trim() || undefined })).filter((entity) => entity.id && entity.state);
}

function normalizeLegacyActionBeat(beat) {
  const dialogue = String(beat.dialogue || "").trim();
  return { startSec: Number(beat.startSec || 0), endSec: Number(beat.endSec || 0), action: String(beat.action || "").trim(), camera: String(beat.camera || "Locked camera.").trim(), dialogue, speechType: ["dialogue", "inner_monologue", "narration", "silent"].includes(String(beat.speechType)) ? String(beat.speechType) : dialogue ? "dialogue" : "silent", speechDelivery: ["onscreen_lipsync", "offscreen_voiceover", "internal_voice", "recording", "none"].includes(String(beat.speechDelivery)) ? String(beat.speechDelivery) : undefined, speaker: String(beat.speaker || "").trim(), dialoguePurpose: String(beat.dialoguePurpose || "").trim() };
}

function enumValue(value, allowed, fallback) {
  const normalized = String(value || "");
  return allowed.includes(normalized) ? normalized : fallback;
}

function legacyStringList(items) {
  return Array.isArray(items) ? items.map((value) => String(value).trim()).filter(Boolean) : [];
}

function legacyText(value, fallback = "") {
  return String(value ?? fallback);
}

function legacyActionBeats(beats) {
  if (!Array.isArray(beats)) return [];
  return beats.map(normalizeLegacyActionBeat).filter((beat) => beat.endSec > beat.startSec && beat.action);
}

function legacySpeakerId(projectId, speaker) {
  const normalized = speaker.toLowerCase();
  return state.characters.find((candidate) => candidate.projectId === projectId && legacyText(candidate.name).trim().toLowerCase() === normalized)?.id;
}

function legacyShotAudio(shot, dialogue) {
  return {
    speechType: enumValue(shot.speechType, ["dialogue", "inner_monologue", "narration", "silent"], dialogue ? "dialogue" : "silent"),
    speechDelivery: enumValue(shot.speechDelivery, ["onscreen_lipsync", "offscreen_voiceover", "internal_voice", "recording", "none"], undefined)
  };
}

function normalizeLegacyShot(project, scene, shot, shotIndex) {
  const dialogue = legacyText(shot.dialogue ?? shot.voiceover ?? shot.line);
  const speaker = legacyText(shot.speaker).trim();
  const audio = legacyShotAudio(shot, dialogue);
  const visualTransformationCount = Number(shot.visualTransformationCount ?? 0) || undefined;
  return { id: id("shot"), sceneId: scene.id, order: shotIndex + 1, description: legacyText(shot.description, scene.summary), camera: legacyText(shot.camera, "Medium shot, locked camera."), motion: legacyText(shot.motion, "Subtle controlled motion."), dominantAction: legacyText(shot.dominantAction).trim(), visualTransformationCount, dialogue, ...audio, speaker, dialoguePurpose: legacyText(shot.dialoguePurpose).trim(), recordingSource: legacyText(shot.recordingSource).trim(), storyBeat: legacyText(shot.storyBeat).trim(), contractBeatIds: legacyStringList(shot.contractBeatIds), transitionIn: legacyText(shot.transitionIn).trim(), transitionOut: legacyText(shot.transitionOut).trim(), screenDirection: legacyText(shot.screenDirection).trim(), continuityContract: normalizeContinuityContract(shot), speakerCharacterId: legacySpeakerId(project.id, speaker), referenceRequirementIds: legacyStringList(shot.referenceRequirementIds), planningWarnings: legacyStringList(shot.planningWarnings), actionBeats: legacyActionBeats(shot.actionBeats), durationSec: normalizeProjectShotDuration(project, shot.durationSec), prompt: "", providerId: shotIndex === 0 ? "chatgpt-web" : "google-flow-web", status: "draft", assetIds: [] };
}

function importLegacyShots(project, resolvedScenes, importedScenes) {
  const inventory = normalizeLegacyShotInventory(project, resolvedScenes, importedScenes);
  const shots = importedScenes.flatMap((scene, sceneIndex) => inventory[sceneIndex].map((shot, shotIndex) => normalizeLegacyShot(project, scene, shot, shotIndex)));
  if ((project.intake?.targetDurationSec || 0) <= 60 && importedScenes.length) {
    const hookScene = importedScenes[0];
    const firstShot = shots.find((shot) => shot.sceneId === hookScene.id);
    if (firstShot) firstShot.durationSec = normalizeProjectShotDuration(project, firstShot.durationSec);
    if (!/^hook\b/i.test(hookScene.title)) hookScene.title = `HOOK · ${hookScene.title}`;
  }
  deps.mutateState((nextState) => nextState.shots.push(...shots), { reason: "legacy-story-shot-import", projectId: project.id, shotCount: shots.length });
  return shots;
}

function applyStoryResult(job, message) {
  const text = message.output?.text || message.assets?.[0]?.metadata?.text;
  if (typeof text !== "string") throw new Error("Story response did not include text.");
  job.outputText = text.trim();
  const result = extractLatestStoryJson(text);
  const project = state.projects.find((item) => item.id === job.projectId);
  if (!project) throw new Error("Project was not found for story response.");
  const requiresScreenplayV2 = Number(job.input?.bridgeMessage?.settings?.screenplaySchemaVersion || 0) >= 2;
  const narrative = validateLegacyPackage(result, requiresScreenplayV2);
  const { resolvedVisualRequirements, resolvedScenes } = resolveVisualVariants(narrative.visualRequirements, result.scenes, narrative.requirementById);
  project.storyDocument = buildStoryDocument(result, narrative, resolvedScenes, resolvedVisualRequirements);
  syncRequirementNodes(project);
  project.description = result.logline;
  project.intake ||= {};
  project.intake.contentLanguage = project.intake.outputLanguage || job.input?.bridgeMessage?.settings?.targetLanguage || "Vietnamese";
  project.updatedAt = now();
  materializeStoryCharacters({
    project,
    resolvedScenes,
    characters: state.characters,
    makeId: id,
    timestamp: now()
  });
  const importedScenes = replaceProjectScenes(project, resolvedScenes);
  importLegacyShots(project, resolvedScenes, importedScenes);
  const projectSceneCount = state.scenes.filter((scene) => scene.projectId === project.id).length;
  const projectShotCount = state.shots.filter((shot) => shot.projectId === project.id || importedScenes.some((scene) => scene.id === shot.sceneId)).length;
  if (projectSceneCount === 0 || projectShotCount === 0) {
    throw new Error(`Story import produced ${projectSceneCount} scenes and ${projectShotCount} shots.`);
  }
}

module.exports = { createLegacyStoryResultHandler };
