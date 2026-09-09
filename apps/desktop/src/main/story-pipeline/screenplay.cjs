let extractJson, getState, now, crypto, projectVideoDurationPolicy, minimumAtomicCueGroupCount, classifyIndependentActionOperations;

function createScreenplayPipeline(deps) {
  ({ extractJson, getState, now, crypto, projectVideoDurationPolicy, minimumAtomicCueGroupCount, classifyIndependentActionOperations } = deps);
  return { normalizeScreenplayCueBuckets, applyScreenplaySceneResult };
}

function normalizeScreenplayCueBuckets(screenplay) {
  const buckets = { actionCues: [], dialogueCues: [], soundCues: [] };
  const candidates = ["actionCues", "dialogueCues", "soundCues"].flatMap((key) => Array.isArray(screenplay?.[key]) ? screenplay[key] : []);
  for (const cue of candidates) {
    if (!cue || typeof cue !== "object") continue;
    const mode = String(cue.expressionMode || "").trim();
    if (mode === "spoken" || "speaker" in cue || "line" in cue) buckets.dialogueCues.push(cue);
    else if (mode === "audible" || ("kind" in cue && "description" in cue)) buckets.soundCues.push(cue);
    else buckets.actionCues.push(cue);
  }
  return buckets;
}

function requireScreenplayTarget(job, result) {
  const project = getState().projects.find((item) => item.id === job.projectId);
  if (!project?.storyDocument?.architectureApprovedAt) throw new Error("Scene screenplay requires approved architecture.");
  const targetId = String(job.input?.bridgeMessage?.settings?.screenplaySceneId || "");
  const scene = getState().scenes.find((item) => item.projectId === project.id && item.screenplaySceneId === targetId);
  const screenplay = result.screenplayScene;
  if (!scene || !screenplay || String(screenplay.id) !== targetId) throw new Error("Scene screenplay does not match the requested architecture scene.");
  return { project, targetId, scene, screenplay };
}

function validateLockedSceneFields(screenplay, scene) {
  for (const [field, expected] of [["objective", scene.objective], ["conflict", scene.conflict], ["turn", scene.dramaticTurn], ["entryState", scene.entryState], ["exitState", scene.exitState]]) {
    if (String(screenplay[field] || "").trim() !== String(expected || "").trim()) throw new Error(`Scene screenplay rewrites locked ${field}.`);
  }
}

function characterContext(project, scene, screenplay) {
  const characters = project.storyDocument.characters || [];
  const byName = new Map(characters.map((character) => [String(character.name).trim().toLowerCase(), character]));
  const allowed = new Set((project.storyDocument.narrativeContract?.allowedSpeakerNames || []).map((name) => String(name).trim().toLowerCase()));
  const present = (screenplay.presentCharacterNames || []).map((name) => String(name).trim()).filter(Boolean);
  const references = new Set((project.storyDocument.visualRequirements || [])
    .filter((item) => (scene.referenceRequirementIds || []).includes(item.id) && ["main_character", "supporting_character"].includes(item.role))
    .map((item) => String(item.name || "").trim().toLowerCase()));
  for (const name of present) {
    const character = byName.get(name.toLowerCase());
    if (!character || character.audibleOnly) throw new Error(`Invalid physically present character ${name}.`);
    if (!references.has(name.toLowerCase())) throw new Error(`SCREENPLAY_VISIBLE_CHARACTER_OUT_OF_SCOPE: ${name} has no visual reference in this scene architecture.`);
  }
  return { byName, allowed, present };
}

function cueContractContext(project, scene, cues) {
  const all = [...cues.actionCues, ...cues.dialogueCues, ...cues.soundCues];
  const cueIds = all.map((cue) => String(cue?.id || "").trim());
  if (cueIds.some((value) => !value) || new Set(cueIds).size !== cueIds.length) throw new Error("Scene screenplay cue ids must be unique and non-empty.");
  const sceneBeatIds = new Set((scene.contractBeatIds || []).map(String));
  const contractBeats = project.storyDocument.narrativeContract?.beats || [];
  const beatById = new Map(contractBeats.map((beat) => [String(beat.id), beat]));
  const obligations = contractBeats.filter((beat) => sceneBeatIds.has(String(beat.id))).flatMap((beat) => Array.isArray(beat.obligations) ? beat.obligations : []);
  return { all, cueIds, cueIdSet: new Set(cueIds), sceneBeatIds, beatById,
    obligationById: new Map(obligations.map((item) => [String(item.id), item])),
    coverage: new Map(obligations.map((item) => [String(item.id), []])) };
}

function validateCueOrdering(context, targetId) {
  const orders = context.all.map((cue) => Number(cue.sequenceOrder));
  if (orders.some((order) => !Number.isInteger(order) || order < 1) || new Set(orders).size !== orders.length) throw new Error("Scene screenplay requires one unique positive sequenceOrder across every action, dialogue and sound cue.");
  for (const cue of context.all) validateCueOwnership(cue, context, orders, targetId);
}

function validateCueOwnership(cue, context, orders, targetId) {
  const owner = String(cue.ownerBeatId || "").trim();
  if (!owner || !context.sceneBeatIds.has(owner)) throw new Error(`SCREENPLAY_UNOWNED_CUE: ${cue.id} requires an ownerBeatId from scene ${targetId}. Do not preview or duplicate another scene's beat.`);
  const dependencies = [...(Array.isArray(cue.dependsOnCueIds) ? cue.dependsOnCueIds : []), ...(Array.isArray(cue.viewerRequiresCueIds) ? cue.viewerRequiresCueIds : [])].map(String);
  if (dependencies.some((id) => !context.cueIdSet.has(id) || id === String(cue.id))) throw new Error(`Screenplay cue ${cue.id} has an invalid causal dependency.`);
  if (dependencies.some((id) => orders[context.cueIds.indexOf(id)] >= Number(cue.sequenceOrder))) throw new Error(`SCREENPLAY_DEPENDENCY_CONFLICT: cue ${cue.id} appears before or at its required trigger.`);
  for (const id of Array.isArray(cue.fulfillsObligationIds) ? cue.fulfillsObligationIds.map(String) : []) {
    if (!context.obligationById.has(id)) throw new Error(`Screenplay cue ${cue.id} references an obligation outside its locked scene.`);
    context.coverage.get(id).push(cue);
  }
}

function validateActionCues(cues) {
  if (cues.some((cue) => !String(cue.action || "").trim() || !String(cue.visibleResult || "").trim() || !String(cue.performanceIntent || "").trim())) throw new Error("Action cues require action, visibleResult and playable performanceIntent.");
  for (const cue of cues) {
    const operations = classifyIndependentActionOperations(cue.action, cue.visibleResult);
    if (operations.length > 1) throw new Error(`SCREENPLAY_NON_ATOMIC_ACTION: cue ${cue.id} contains independent operations (${operations.join(", ")}). Keep only the one observable state change completed in this cue; leave commanded future work to dialogue or a later cue/shot.`);
  }
}

function validateDialogueCue(cue, character, context) {
  const speaker = String(cue.speaker || "").trim();
  validateDialogueSpeaker(cue, speaker, character);
  validateDialogueFields(cue);
  validateDialogueDelivery(cue);
  validateDialoguePresence(cue, speaker, character);
  validateDialogueBeatOwner(cue, speaker, context);
}

function validateDialogueSpeaker(cue, speaker, character) { if (!character.allowed.has(speaker.toLowerCase()) || !character.byName.has(speaker.toLowerCase())) throw new Error(`Invalid dialogue speaker ${speaker}.`); }
function validateDialogueFields(cue) { if ([cue.line, cue.dramaticPurpose, cue.tactic, cue.subtext, cue.relationshipDelta].some((value) => !String(value || "").trim())) throw new Error(`Dialogue cue ${cue.id} requires line, dramaticPurpose, tactic, subtext and relationshipDelta.`); }
function validateDialogueDelivery(cue) {
  if (!["onscreen_lipsync", "offscreen_voiceover", "internal_voice", "recording"].includes(cue.delivery)) throw new Error(`Dialogue cue ${cue.id} has invalid delivery.`);
  if (["recording", "offscreen_voiceover"].includes(cue.delivery) && !String(cue.source || "").trim()) throw new Error(`Dialogue cue ${cue.id} requires its audio source.`);
}
function validateDialoguePresence(cue, speaker, character) { if (cue.delivery === "onscreen_lipsync" && !character.present.some((name) => name.toLowerCase() === speaker.toLowerCase())) throw new Error(`Onscreen speaker ${speaker} is not physically present.`); }
function validateDialogueBeatOwner(cue, speaker, context) {
  const ownerSpeakers = new Set((context.beatById.get(String(cue.ownerBeatId))?.allowedSpeakerNames || []).map((name) => String(name).trim().toLowerCase()));
  if (ownerSpeakers.size && !ownerSpeakers.has(speaker.toLowerCase())) throw new Error(`SCREENPLAY_OWNER_SPEAKER_MISMATCH: ${speaker} is not authorized by owner beat ${cue.ownerBeatId}.`);
}

function validateObligationCoverage(context, cues) {
  for (const [id, covering] of context.coverage) {
    if (covering.length !== 1) throw new Error(`SCREENPLAY_OBLIGATION_COVERAGE: obligation ${id} must be covered exactly once.`);
    const obligation = context.obligationById.get(id);
    const cue = covering[0];
    if (obligation.modality === "mustBeSpoken" && (!cues.dialogueCues.includes(cue) || cue.expressionMode !== "spoken")) throw new Error(`SCREENPLAY_OBLIGATION_MODALITY: ${id} must be spoken.`);
    if (obligation.modality === "mustBeVisible" && (!cues.actionCues.includes(cue) || cue.expressionMode !== "visible")) throw new Error(`SCREENPLAY_OBLIGATION_MODALITY: ${id} must be visible.`);
    if (obligation.modality === "reactionOnly" && cue.expressionMode !== "reaction") throw new Error(`SCREENPLAY_OBLIGATION_MODALITY: ${id} must remain a reaction.`);
    validateObligationSpeaker(obligation, cue, id);
  }
}

function validateObligationSpeaker(obligation, cue, id) {
  if (obligation.modality !== "mustBeSpoken") return;
  const authorized = new Set((obligation.allowedSpeakerNames || []).map((name) => String(name).trim().toLowerCase()));
  if (authorized.size && !authorized.has(String(cue.speaker || "").trim().toLowerCase())) throw new Error(`SCREENPLAY_OBLIGATION_SPEAKER: ${cue.speaker} cannot fulfill ${id}.`);
}

function normalizeCue(cue) {
  return { id: String(cue.id).trim(), ownerBeatId: String(cue.ownerBeatId).trim(), sequenceOrder: Number(cue.sequenceOrder),
    semanticRole: String(cue.semanticRole || "initiation"), dependsOnCueIds: (cue.dependsOnCueIds || []).map(String),
    viewerRequiresCueIds: (cue.viewerRequiresCueIds || []).map(String), fulfillsObligationIds: (cue.fulfillsObligationIds || []).map(String), expressionMode: cue.expressionMode };
}

function normalizeScreenplay(targetId, scene, screenplay, present, cues) {
  return { id: targetId, sceneOrder: scene.order, slugline: String(screenplay.slugline).trim(), presentCharacterNames: present,
    objective: String(scene.objective), conflict: String(scene.conflict), turn: String(scene.dramaticTurn), entryState: String(scene.entryState), exitState: String(scene.exitState),
    actionCues: cues.actionCues.map((cue) => ({ ...normalizeCue(cue), action: String(cue.action).trim(), visibleResult: String(cue.visibleResult).trim(), performanceIntent: String(cue.performanceIntent).trim() })),
    dialogueCues: cues.dialogueCues.map((cue) => ({ ...normalizeCue(cue), speaker: String(cue.speaker).trim(), line: String(cue.line).trim(), delivery: cue.delivery,
      source: String(cue.source || "").trim() || undefined, dramaticPurpose: String(cue.dramaticPurpose).trim(), tactic: String(cue.tactic).trim(), subtext: String(cue.subtext).trim(), relationshipDelta: String(cue.relationshipDelta).trim() })),
    soundCues: cues.soundCues.map((cue) => ({ ...normalizeCue(cue), semanticRole: String(cue.semanticRole || "confirmation"), kind: cue.kind, description: String(cue.description || "").trim() })) };
}

function validateRuntimeBudget(project, normalized, sceneCount, scene) {
  const policy = projectVideoDurationPolicy(project);
  const minimum = policy.supportedDurationsSec[0] || 1;
  const existing = project.storyDocument.screenplayScenes || [];
  const prior = existing.filter((item) => item.id !== normalized.id);
  const maximumShots = Math.max(1, Math.floor(Number(project.intake?.targetDurationSec || 30) / minimum));
  const requiredShots = prior.reduce((sum, item) => sum + minimumAtomicCueGroupCount(item), 0) + minimumAtomicCueGroupCount(normalized) + Math.max(0, sceneCount - prior.length - 1);
  if (requiredShots > maximumShots) throw new Error(`SCREENPLAY_RUNTIME_OVERFLOW: locked cues require at least ${requiredShots} atomic shots, but the ${project.intake?.targetDurationSec || 30}s provider budget supports at most ${maximumShots}.`);
  validateSpeechBudget(project, normalized, sceneCount, scene, policy.supportedDurationsSec, minimum);
}

function validateSpeechBudget(project, screenplay, sceneCount, scene, ladder, minimum) {
  const budgetSec = Math.max(minimum, Math.round(Number(project.intake?.targetDurationSec || 30) / sceneCount));
  const words = screenplay.dialogueCues.reduce((sum, cue) => sum + cue.line.split(/\s+/).filter(Boolean).length, 0);
  const wordBudget = Math.max(0, Math.floor(budgetSec * 2 - screenplay.dialogueCues.length));
  if (words > wordBudget) throw new Error(`SCREENPLAY_SPEECH_BUDGET_EXCEEDED: scene ${scene.order} contains ${words} spoken words but its approximately ${budgetSec}s runtime allows at most ${wordBudget} across ${screenplay.dialogueCues.length} dialogue cues. Shorten the exact lines while preserving speaker ownership, causal function and locked verbatim source text.`);
  // Dialogue cues are semantic turns, not one-shot allocations. Several
  // turns may share a provider shot, so summing the ladder duration for every
  // line incorrectly rejects short scenes with multiple required speakers.
  // Keep the per-line ceiling, then charge the scene once using aggregate
  // speaking time (the same two-words-per-second budget used above).
  const lineStats = screenplay.dialogueCues.map((cue) => {
    const lineWords = cue.line.split(/\s+/).filter(Boolean).length;
    const slot = ladder.find((duration) => lineWords <= Math.floor(duration * 2 - 1));
    return { cue, lineWords, slot };
  });
  const overflowingLines = lineStats.filter(({ slot }) => !Number.isFinite(slot));
  if (overflowingLines.length) {
    const details = overflowingLines.map(({ cue, lineWords }) => `${cue.id}=${lineWords} words (max ${Math.floor((ladder.at(-1) || 10) * 2 - 1)})`).join(", ");
    throw new Error(`SCREENPLAY_SPEECH_DURATION_OVERFLOW: scene ${scene.order} dialogue lines exceed the provider's maximum speech slot: ${details}. Shorten only these exact lines while preserving speaker ownership, causal function and locked source text.`);
  }
  const aggregateRuntime = Math.ceil(words / 2);
  if (aggregateRuntime > budgetSec) throw new Error(`SCREENPLAY_SPEECH_DURATION_OVERFLOW: scene ${scene.order} needs approximately ${aggregateRuntime}s of aggregate speech, exceeding its approximately ${budgetSec}s runtime. Shorten the exact lines while preserving speaker ownership and causal function.`);
}

function buildTemporalScene(screenplay) {
  const typed = [...screenplay.actionCues.map((cue) => ({ cue, kind: "action" })), ...screenplay.dialogueCues.map((cue) => ({ cue, kind: "dialogue" })), ...screenplay.soundCues.map((cue) => ({ cue, kind: "sound" }))];
  return { sceneId: screenplay.id,
    units: typed.map(({ cue, kind }) => ({ id: cue.id, sceneId: screenplay.id, sourceCueId: cue.id, sourceHash: crypto.createHash("sha256").update(JSON.stringify(cue)).digest("hex"), kind, sequenceOrder: cue.sequenceOrder, semanticRole: cue.semanticRole })),
    dependencies: typed.flatMap(({ cue }) => [...(cue.dependsOnCueIds || []).map((fromCueId) => ({ fromCueId, toCueId: cue.id, type: "must_happen_before", strength: "hard" })), ...(cue.viewerRequiresCueIds || []).map((fromCueId) => ({ fromCueId, toCueId: cue.id, type: "viewer_requires", strength: "hard" }))]) };
}

function finalizeScreenplay(project, normalized, sceneCount) {
  const existing = project.storyDocument.screenplayScenes || [];
  project.storyDocument.screenplayScenes = [...existing.filter((item) => item.id !== normalized.id), normalized].sort((a, b) => a.sceneOrder - b.sceneOrder);
  project.storyDocument.temporalCausalIR = { version: 1, scenes: project.storyDocument.screenplayScenes.map(buildTemporalScene) };
  if (project.storyDocument.screenplayScenes.length === sceneCount) validateVerbatimDialogue(project);
  project.updatedAt = now();
}

function validateVerbatimDialogue(project) {
  const spoken = new Set((project.storyDocument.narrativeContract?.beats || []).flatMap((beat) => beat.obligations || []).filter((item) => item.modality === "mustBeSpoken").map((item) => String(item.content || "").trim()));
  const verbatim = (project.storyDocument.sourceAnalysis?.requiredFacts || []).flatMap((fact) => Array.from(String(fact).matchAll(/["“]([^"”]{2,})["”]/g), (match) => match[1].trim())).filter((line) => spoken.has(line));
  const authored = new Set(project.storyDocument.screenplayScenes.flatMap((item) => item.dialogueCues.map((cue) => cue.line)));
  const missing = verbatim.filter((line) => !authored.has(line));
  if (missing.length) throw new Error(`Screenplay rewrites or omits locked verbatim source lines: ${missing.join(" | ")}`);
  project.storyDocument.screenplayApprovedAt = now();
}

function applyScreenplaySceneResult(job, message) {
  const text = message.output?.text || message.assets?.[0]?.metadata?.text;
  if (typeof text !== "string") throw new Error("Scene screenplay response did not include text.");
  job.outputText = text.trim();
  const target = requireScreenplayTarget(job, extractJson(text));
  validateLockedSceneFields(target.screenplay, target.scene);
  const character = characterContext(target.project, target.scene, target.screenplay);
  const cues = normalizeScreenplayCueBuckets(target.screenplay);
  if (!String(target.screenplay.slugline || "").trim() || !cues.actionCues.length) throw new Error("Scene screenplay requires slugline and action cues.");
  const contract = cueContractContext(target.project, target.scene, cues);
  validateCueOrdering(contract, target.targetId);
  validateActionCues(cues.actionCues);
  cues.dialogueCues.forEach((cue) => validateDialogueCue(cue, character, contract));
  validateObligationCoverage(contract, cues);
  const normalized = normalizeScreenplay(target.targetId, target.scene, target.screenplay, character.present, cues);
  const sceneCount = Math.max(1, getState().scenes.filter((item) => item.projectId === target.project.id).length);
  validateRuntimeBudget(target.project, normalized, sceneCount, target.scene);
  finalizeScreenplay(target.project, normalized, sceneCount);
}

module.exports = { createScreenplayPipeline };
