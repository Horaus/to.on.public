let extractJson, getState, recommendedProjectShotCount, formatSceneBreakdown, id, now, upsertProjectCharactersFromStory;

function createArchitecturePipeline(deps) {
  ({ extractJson, getState, recommendedProjectShotCount, formatSceneBreakdown, id, now, upsertProjectCharactersFromStory } = deps);
  return { applyStoryArchitectureResult };
}

function validateArchitectureFields(scene, index) {
  for (const field of ["objective", "conflict", "dramaticTurn", "escalationMechanism", "choicePressure", "emotionalShift", "entryState", "exitState"]) {
    if (!String(scene?.[field] || "").trim()) throw new Error(`Scene ${index + 1} requires ${field}.`);
  }
}

function validateArchitectureBeats(scene, index, contractBeatIds, covered) {
  const beats = (scene.contractBeatIds || []).map((value) => String(value || "").trim()).filter(Boolean);
  if (!beats.length || beats.some((beatId) => !contractBeatIds.has(beatId))) throw new Error(`Scene ${index + 1} has invalid contract beats.`);
  const duplicated = beats.find((beatId) => covered.has(beatId));
  if (duplicated) throw new Error(`Scene architecture assigns contract beat ${duplicated} to more than one scene.`);
  beats.forEach((beatId) => covered.add(beatId));
}

function validateArchitectureReferences(scene, index, requirementById) {
  const requirements = (scene.referenceRequirementIds || []).map((value) => String(value || "").trim()).filter(Boolean);
  if (requirements.some((requirementId) => !requirementById.has(requirementId))) throw new Error(`Scene ${index + 1} references an unknown visual requirement.`);
  if (!requirements.some((requirementId) => requirementById.get(requirementId)?.role === "location")) throw new Error(`Scene ${index + 1} requires one location visual requirement.`);
}

function validateArchitectureScene(scene, index, contractBeatIds, requirementById, covered, sceneIds) {
  const sceneId = String(scene.id || "").trim();
  if (!sceneId || sceneIds.has(sceneId)) throw new Error(`Scene ${index + 1} requires a unique architecture id.`);
  sceneIds.add(sceneId);
  validateArchitectureFields(scene, index);
  validateArchitectureBeats(scene, index, contractBeatIds, covered);
  validateArchitectureReferences(scene, index, requirementById);
  if (scene.assetDelta != null && (typeof scene.assetDelta !== "object" || Array.isArray(scene.assetDelta))) throw new Error(`Scene ${index + 1} assetDelta must be null or a structured state delta.`);
}

function validateArchitectureScenes(scenes, project, requirements, contractBeatIds) {
  const expected = Math.min(3, recommendedProjectShotCount(project, project.intake?.targetDurationSec || 30));
  if (scenes.length !== expected) throw new Error(`Story architecture requires exactly ${expected} scenes, received ${scenes.length}.`);
  const byId = new Map(requirements.map((item) => [String(item?.id || "").trim(), item]));
  const covered = new Set();
  const sceneIds = new Set();
  scenes.forEach((scene, index) => validateArchitectureScene(scene, index, contractBeatIds, byId, covered, sceneIds));
  const functions = scenes.map((scene) => String(scene.motifFunction || ""));
  const invalidMotif = functions[0] !== "setup" || functions.at(-1) !== "payoff" || functions.slice(1, -1).some((value) => !["develop", "turn"].includes(value));
  if (invalidMotif) throw new Error("Scene architecture must progress the locked motif from setup through development/turn to payoff.");
  const missing = [...contractBeatIds].filter((beatId) => !covered.has(beatId));
  if (missing.length) throw new Error(`Scene architecture does not cover contract beats: ${missing.join(", ")}.`);
}

const architectureText = (value, fallback = "") => String(value ?? fallback);
const architectureList = (value) => (Array.isArray(value) ? value : []).map(String);

function importedArchitectureScene(project, scene, index) {
  return {
    id: id("scene"), projectId: project.id, screenplaySceneId: architectureText(scene.id), order: index + 1,
    title: architectureText(scene.title, `Scene ${index + 1}`), summary: architectureText(scene.summary),
    location: architectureText(scene.location), timeOfDay: architectureText(scene.timeOfDay), emotionalTone: architectureText(scene.emotionalTone),
    contractBeatIds: architectureList(scene.contractBeatIds), objective: architectureText(scene.objective), conflict: architectureText(scene.conflict),
    dramaticTurn: architectureText(scene.dramaticTurn), escalationMechanism: architectureText(scene.escalationMechanism),
    choicePressure: architectureText(scene.choicePressure), emotionalShift: architectureText(scene.emotionalShift),
    motifFunction: scene.motifFunction, entryState: architectureText(scene.entryState), exitState: architectureText(scene.exitState),
    settingDescription: architectureText(scene.settingDescription), requiredProps: architectureList(scene.requiredProps),
    wardrobeState: architectureText(scene.wardrobeState), referenceRequirementIds: architectureList(scene.referenceRequirementIds), assetDelta: undefined
  };
}

function importArchitectureScenes(project, scenes) {
  const priorIds = new Set(getState().scenes.filter((scene) => scene.projectId === project.id).map((scene) => scene.id));
  getState().shots = getState().shots.filter((shot) => !priorIds.has(shot.sceneId));
  getState().scenes = getState().scenes.filter((scene) => scene.projectId !== project.id);
  const imported = scenes.map((scene, index) => importedArchitectureScene(project, scene, index));
  getState().scenes.push(...imported);
}

function persistArchitecture(project, scenes, requirements) {
  const timestamp = now();
  project.storyDocument = { ...project.storyDocument, sceneBreakdown: formatSceneBreakdown(scenes), screenplayScenes: [], scenes,
    visualRequirements: requirements, generatedAt: timestamp, architectureApprovedAt: timestamp, screenplayApprovedAt: undefined, shotBreakdownApprovedAt: undefined };
  project.description = project.storyDocument.logline;
  project.updatedAt = timestamp;
  importArchitectureScenes(project, scenes);
  const custom = (project.productionGraphCustomNodes || []).filter((node) => node.systemGenerated !== "visual-requirement");
  const generated = requirements.map((item) => ({ id: `requirement-${item.id}`, kind: "image-generate", title: item.name,
    text: `${item.description}\n\nContinuity rules: ${item.continuityRules}`.trim(), systemGenerated: "visual-requirement", referenceRequirementId: item.id, referenceRole: item.role, createdAt: timestamp }));
  project.productionGraphCustomNodes = [...custom, ...generated];
  upsertProjectCharactersFromStory(project);
}

function applyStoryArchitectureResult(job, message) {
  const { text, project, architectureScenes, visualRequirements } = validateArchitecturePayload(job, message);
  job.outputText = text.trim();
  persistArchitecture(project, architectureScenes, visualRequirements);
}

function assertArchitectureStage(result, project) {
  if (Array.isArray(result.shots) || (result.scenes || []).some((scene) => Array.isArray(scene?.shots))) {
    throw new Error("Story architecture must stop at screenplay scenes and must not contain shots.");
  }
  if (!project.storyDocument?.foundationApprovedAt) throw new Error("Story architecture requires an approved narrative foundation.");
  if (result.sourceAnalysis || result.adaptationDecisions || result.narrativeContract || result.characters) {
    throw new Error("Story architecture must not rewrite locked foundation artifacts.");
  }
}

function architectureContractBeatIds(project) {
  const beats = Array.isArray(project.storyDocument?.narrativeContract?.beats)
    ? project.storyDocument.narrativeContract.beats : [];
  return new Set(beats.map((beat) => String(beat?.id || "").trim()).filter(Boolean));
}

function architectureVisualRequirements(result) {
  const requirements = Array.isArray(result.visualRequirements) ? result.visualRequirements : [];
  if (!requirements.some((requirement) => requirement.role === "main_character")) {
    throw new Error("Story architecture requires a main_character visual requirement.");
  }
  return requirements;
}

function validateArchitecturePayload(job, message) {
  const text = message.output?.text || message.assets?.[0]?.metadata?.text;
  if (typeof text !== "string") throw new Error("Story architecture response did not include text.");
  const result = extractJson(text);
  const project = getState().projects.find((item) => item.id === job.projectId);
  if (!project) throw new Error("Project was not found for story architecture response.");
  assertArchitectureStage(result, project);
  const contractBeatIds = architectureContractBeatIds(project);
  const visualRequirements = architectureVisualRequirements(result);
  const architectureScenes = Array.isArray(result.scenes) ? result.scenes : [];
  validateArchitectureScenes(architectureScenes, project, visualRequirements, contractBeatIds);
  return { text, project, architectureScenes, visualRequirements };
}

module.exports = { createArchitecturePipeline };
