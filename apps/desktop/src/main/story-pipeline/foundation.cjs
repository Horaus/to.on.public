let extractJson, getState, storyWordRange, explicitGlobalVoiceDirection, now, upsertProjectCharactersFromStory;

function createFoundationPipeline(deps) {
  ({ extractJson, getState, storyWordRange, explicitGlobalVoiceDirection, now, upsertProjectCharactersFromStory } = deps);
  return { applyStoryFoundationResult };
}

function requiredText(value, message) {
  if (!String(value || "").trim()) throw new Error(message);
}

function validateSourceAnalysis(sourceAnalysis) {
  for (const field of ["premise", "theme", "protagonist", "externalGoal", "internalNeed", "centralConflict", "stakes"]) {
    requiredText(sourceAnalysis?.[field], `Source analysis requires ${field}.`);
  }
  const facts = sourceAnalysis?.requiredFacts;
  if (!Array.isArray(facts) || !facts.length || facts.some((fact) => !String(fact || "").trim())) {
    throw new Error("Source analysis requires non-empty immutable requiredFacts.");
  }
}

function validateAdaptationDecisions(value) {
  const decisions = Array.isArray(value) ? value : [];
  const invalid = decisions.some((item) => !String(item?.id || "").trim()
    || !String(item?.sourceEvidence || "").trim() || !String(item?.decision || "").trim()
    || !String(item?.reason || "").trim() || !["preserve", "condense", "externalize", "omit"].includes(String(item?.authorization || "")));
  if (invalid) throw new Error("Adaptation decisions require evidence, decision, reason and valid authorization.");
  return decisions;
}

function validateStoryAndContract(result, project) {
  requiredText(result.logline, "Story foundation requires a logline and adapted story.");
  requiredText(result.story, "Story foundation requires a logline and adapted story.");
  const count = String(result.story).trim().split(/\s+/).filter(Boolean).length;
  const range = storyWordRange(project.intake?.targetDurationSec);
  if (count < range.minimum) throw new Error(`COMPLETE_STORY_TOO_THIN: complete story has ${count} words; this runtime needs at least ${range.minimum}. Develop the causal situation, escalation, choice and consequence as natural prose without creating scenes or shots.`);
  if (count > range.maximum) throw new Error(`COMPLETE_STORY_TOO_LONG: complete story has ${count} words; keep it under ${range.maximum} while preserving the full causal arc.`);
  const contract = result.narrativeContract;
  for (const field of ["corePremise", "primaryObjective", "requiredDecision", "requiredOutcome"]) requiredText(contract?.[field], "Narrative contract requires premise, objective, decision and outcome.");
  return contract;
}

function resolveVoiceContinuity(project, contract) {
  const sourceDirection = explicitGlobalVoiceDirection(project.sourceDraft);
  const model = contract?.voiceContinuity && typeof contract.voiceContinuity === "object" ? contract.voiceContinuity : {};
  const globalDirection = sourceDirection || String(model.globalDirection || "No source-locked regional accent; preserve each stable character voice.").trim();
  const perCharacter = Array.isArray(model.perCharacter)
    ? model.perCharacter.map((entry) => ({ characterName: String(entry?.characterName || "").trim(), direction: String(entry?.direction || "").trim() })).filter((entry) => entry.characterName && entry.direction)
    : [];
  return { sourceDirection, globalDirection, perCharacter };
}

function validateCreativeIntent(intent) {
  for (const field of ["dramaticQuestion", "emotionalArc", "tonalPromise"]) requiredText(intent?.[field], "Creative intent requires a dramatic question, emotional arc and tonal promise.");
  for (const field of ["element", "setup", "development", "payoff"]) requiredText(intent?.motif?.[field], "Creative intent requires one motif with setup, development and payoff.");
  const dynamics = intent?.characterDynamics;
  const invalid = !Array.isArray(dynamics) || !dynamics.length || dynamics.some((item) =>
    ["characterName", "publicWant", "emotionalDefense", "pressureResponse", "voicePattern"].some((field) => !String(item?.[field] || "").trim()));
  if (invalid) throw new Error("Creative intent requires complete character dynamics.");
}

function validateVideoProfile(profile) {
  const enums = {
    seriality: ["standalone", "episodic", "serial", "anthology", "hybrid"], closure: ["closed", "local_closed_arc_open", "open"],
    dialogueDensity: ["none", "low", "medium", "high"], motionRegime: ["continuous", "selective", "stepped", "held", "burst_based"],
    physicalLawRegime: ["realistic", "stylized_consistent", "expressive_impossible", "abstract"], exaggerationLevel: ["subtle", "moderate", "broad"],
    poseDependence: ["motion_led", "balanced", "key_pose_led"], environmentAgency: ["background", "supporting_system", "causal_system", "antagonist"],
    soundMotionCoupling: ["loose", "selective", "tight"]
  };
  requiredText(profile?.primaryPurpose, "Video knowledge profile requires purpose and pacing shape.");
  requiredText(profile?.pacingShape, "Video knowledge profile requires purpose and pacing shape.");
  const drivers = profile?.contentDrivers;
  if (!Array.isArray(drivers) || !drivers.length || drivers.some((value) => !["story", "character", "information", "performance", "mood", "experience"].includes(String(value)))) throw new Error("Video knowledge profile requires valid content drivers.");
  for (const [field, allowed] of Object.entries(enums)) if (!allowed.includes(String(profile?.[field] || ""))) throw new Error(`Video knowledge profile requires valid ${field}.`);
  if (!Array.isArray(profile.activeModules) || profile.activeModules.length < 1 || profile.activeModules.length > 7 || !Array.isArray(profile.arbitrationNotes)) throw new Error("Video knowledge profile requires 1–7 active modules and arbitration notes.");
}

function validateBeatObligations(beats) {
  const ids = new Set(beats.map((beat) => String(beat?.id || "").trim()).filter(Boolean));
  if (invalidBeatSet(beats, ids)) throw new Error("Narrative contract requires unique, complete beats.");
  const obligationIds = new Set();
  for (const beat of beats) {
    requireBeatObligations(beat);
    for (const obligation of beat.obligations) validateObligation(beat, obligation, obligationIds);
  }
}

function invalidBeatSet(beats, ids) { return !beats.length || ids.size !== beats.length || beats.some((beat) => missingBeatFields(beat)); }
function missingBeatFields(beat) { return !String(beat?.sourceEvidence || "").trim() || !String(beat?.requiredAction || "").trim() || !String(beat?.requiredOutcome || "").trim() || !Array.isArray(beat?.allowedSpeakerNames); }
function requireBeatObligations(beat) { if (!Array.isArray(beat.obligations) || !beat.obligations.length) throw new Error(`Narrative contract beat ${beat.id} requires atomic obligations.`); }

function validateObligation(beat, obligation, obligationIds) {
  const id = String(obligation?.id || "").trim();
  const modality = String(obligation?.modality || "");
  const valid = id && !obligationIds.has(id) && String(obligation?.content || "").trim()
    && ["mustBeSpoken", "mustBeVisible", "mayBeInferred", "reactionOnly"].includes(modality);
  if (!valid) throw new Error(`Narrative contract beat ${beat.id} contains an invalid or duplicate obligation.`);
  obligationIds.add(id);
  if (modality === "mustBeSpoken" && !Array.isArray(obligation.allowedSpeakerNames)) throw new Error(`Spoken obligation ${id} requires allowedSpeakerNames.`);
}

function normalizeAndValidateCharacters(result, contract, intent, voice) {
  const characters = Array.isArray(result.characters) ? result.characters : [];
  const names = new Set(characters.map((item) => String(item?.name || "").trim().toLowerCase()).filter(Boolean));
  const allowed = new Set((contract.allowedSpeakerNames || []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
  validateCharacterContract(characters, names, allowed, contract, intent);
  validateSpeakerScopes(contract.beats, allowed);
  return characters.map((item) => enrichCharacterVoice(item, voice));
}

function validateCharacterContract(characters, names, allowed, contract, intent) {
  if (!characters.some((item) => /^main(?:$|[_\s-])/i.test(String(item?.role || "")) && item.required === true)) throw new Error("Story foundation requires one required main character.");
  for (const speaker of allowed) if (!names.has(speaker)) throw new Error(`Allowed speaker ${speaker} is missing from characters.`);
  const dynamicNames = new Set(intent.characterDynamics.map((item) => String(item.characterName).trim().toLowerCase()));
  for (const item of characters) if (item.required && !dynamicNames.has(String(item.name).trim().toLowerCase())) throw new Error(`Required character ${item.name} is missing from creative dynamics.`);
  for (const item of intent.characterDynamics) if (!names.has(String(item.characterName).trim().toLowerCase())) throw new Error(`Creative dynamics references unknown character ${item.characterName}.`);
}

function enrichCharacterVoice(item, voice) {
  const direction = voice.perCharacter.find((entry) => entry.characterName.toLowerCase() === String(item?.name || "").trim().toLowerCase())?.direction;
  const inherited = [direction, voice.sourceDirection].filter(Boolean).join("; ");
  const brief = String(item?.voiceBrief || "").trim();
  return { ...item, voiceBrief: inherited && !brief.toLowerCase().includes(inherited.toLowerCase()) ? [brief, inherited].filter(Boolean).join("; ") : brief };
}

function validateSpeakerScopes(beats, allowed) {
  for (const beat of beats) {
    const beatSpeakers = beat.allowedSpeakerNames.map((name) => String(name).trim().toLowerCase());
    for (const speaker of beatSpeakers) if (!allowed.has(speaker)) throw new Error(`Beat ${beat.id} uses a speaker outside the narrative contract.`);
    for (const obligation of beat.obligations) for (const speaker of obligation.allowedSpeakerNames || []) {
      const normalized = String(speaker).trim().toLowerCase();
      if (!allowed.has(normalized) || !beatSpeakers.includes(normalized)) throw new Error(`Obligation ${obligation.id} uses a speaker outside its beat contract.`);
    }
  }
}

function persistFoundation(project, result, decisions, contract, voice, characters) {
  const timestamp = now();
  project.storyDocument = { logline: String(result.logline).trim(), story: String(result.story).trim(), sceneBreakdown: "",
    sourceAnalysis: { ...result.sourceAnalysis, requiredFacts: result.sourceAnalysis.requiredFacts.map((value) => String(value).trim()).filter(Boolean) },
    adaptationDecisions: decisions.map((item) => ({ id: String(item.id).trim(), sourceEvidence: String(item.sourceEvidence).trim(), decision: String(item.decision).trim(), reason: String(item.reason).trim(), authorization: item.authorization })),
    narrativeContract: { ...contract, voiceContinuity: { globalDirection: voice.globalDirection, perCharacter: voice.perCharacter } }, creativeIntent: result.creativeIntent,
    videoKnowledgeProfile: result.videoKnowledgeProfile, characters, visualRequirements: [], screenplayScenes: [], scenes: [], comments: [], manuallyEdited: false,
    generatedAt: timestamp, foundationApprovedAt: timestamp };
  project.description = project.storyDocument.logline;
  project.updatedAt = timestamp;
  const priorIds = new Set(getState().scenes.filter((scene) => scene.projectId === project.id).map((scene) => scene.id));
  getState().shots = getState().shots.filter((shot) => !priorIds.has(shot.sceneId));
  getState().scenes = getState().scenes.filter((scene) => scene.projectId !== project.id);
  upsertProjectCharactersFromStory(project);
}

function applyStoryFoundationResult(job, message) {
  const text = message.output?.text || message.assets?.[0]?.metadata?.text;
  if (typeof text !== "string") throw new Error("Story foundation response did not include text.");
  job.outputText = text.trim();
  // Provider retries can concatenate multiple valid JSON objects. Prefer the
  // object carrying the foundation schema instead of an unrelated trailing
  // object that happens to be larger.
  const result = extractJson(text, (candidate) => candidate?.sourceAnalysis && candidate?.narrativeContract);
  const project = getState().projects.find((item) => item.id === job.projectId);
  if (!project) throw new Error("Project was not found for story foundation response.");
  if (result.visualRequirements || result.scenes || result.screenplay || result.shots) throw new Error("Story foundation must not contain scene, screenplay, shot or visual requirement artifacts.");
  validateSourceAnalysis(result.sourceAnalysis);
  const decisions = validateAdaptationDecisions(result.adaptationDecisions);
  const contract = validateStoryAndContract(result, project);
  const voice = resolveVoiceContinuity(project, contract);
  validateCreativeIntent(result.creativeIntent);
  validateVideoProfile(result.videoKnowledgeProfile);
  const beats = Array.isArray(contract.beats) ? contract.beats : [];
  validateBeatObligations(beats);
  const characters = normalizeAndValidateCharacters(result, contract, result.creativeIntent, voice);
  persistFoundation(project, result, decisions, contract, voice, characters);
}

module.exports = { createFoundationPipeline };
