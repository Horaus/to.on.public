let extractJson, getState, mutateState, now, recommendedProjectShotCount, normalizeProjectShotDuration, validateSequenceContracts, assertShotAuthoredLanguage, id, classifyImportedShotTransformations, classifyIndependentActionOperations, hasMultipleCameraSetups, normalizeImportedActionBeats, estimateShotTiming, reconcileCompletedShotBreakdown, ensureProjectVoices;

function createShotBreakdownPipeline(deps) {
  ({ extractJson, getState, mutateState = (mutator) => mutator(getState()), now, recommendedProjectShotCount, normalizeProjectShotDuration, validateSequenceContracts, assertShotAuthoredLanguage, id, classifyImportedShotTransformations, classifyIndependentActionOperations, hasMultipleCameraSetups, normalizeImportedActionBeats, estimateShotTiming, reconcileCompletedShotBreakdown, ensureProjectVoices = () => {} } = deps);
  return { applyShotBreakdownResult };
}

function resolveCueContract(shot, index, context) {
  const { targetScreenplaySceneId, screenplayById, sceneByArchitectureId, expectedCueIds, cueCoverage } = context;
  const screenplaySceneId = targetScreenplaySceneId || String(shot.screenplaySceneId || "");
  const screenplay = screenplayById.get(screenplaySceneId);
  const scene = sceneByArchitectureId.get(screenplaySceneId);
  if (!screenplay || !scene) throw new Error(`Shot ${index + 1} references an unknown screenplay scene.`);
  const cueMaps = buildCueMaps(screenplay);
  const cueIds = shotCueIds(shot);
  const allCueIds = [...cueIds.action, ...cueIds.dialogue, ...cueIds.sound];
  validateCueIds(cueIds, cueMaps, index);
  if (allCueIds.some((cueId) => !expectedCueIds.has(cueId))) throw new Error(`Shot ${index + 1} references a screenplay cue assigned to another batch.`);
  if (!allCueIds.length) throw new Error(`Shot ${index + 1} must cover at least one screenplay cue.`);
  allCueIds.forEach((cueId) => cueCoverage.set(cueId, (cueCoverage.get(cueId) || 0) + 1));
  if (cueIds.action.length > 1) throw new Error(`NON_ATOMIC_SHOT: shot ${index + 1} contains ${cueIds.action.length} primary actions; split it into one visible action per shot.`);
  if (cueIds.dialogue.length > 1) throw new Error(`Shot ${index + 1} may cover at most one dialogue cue.`);
  return { screenplay, scene, cueIds, actionCue: cueMaps.action.get(cueIds.action[0]), dialogueCue: cueMaps.dialogue.get(cueIds.dialogue[0]), soundCue: cueMaps.sound.get(cueIds.sound[0]) };
}

function buildCueMaps(screenplay) {
  return {
    action: new Map(screenplay.actionCues.map((cue) => [cue.id, cue])),
    dialogue: new Map(screenplay.dialogueCues.map((cue) => [cue.id, cue])),
    sound: new Map(screenplay.soundCues.map((cue) => [cue.id, cue]))
  };
}

function shotCueIds(shot) {
  return {
    action: (shot.screenplayActionCueIds || []).map(String),
    dialogue: (shot.screenplayDialogueCueIds || []).map(String),
    sound: (shot.screenplaySoundCueIds || []).map(String)
  };
}

function validateCueIds(cueIds, cueMaps, index) {
  const valid = cueIds.action.every((cueId) => cueMaps.action.has(cueId))
    && cueIds.dialogue.every((cueId) => cueMaps.dialogue.has(cueId))
    && cueIds.sound.every((cueId) => cueMaps.sound.has(cueId));
  if (!valid) throw new Error(`Shot ${index + 1} references a cue outside its screenplay scene.`);
}

function resolveVisualContract(project, screenplay, scene, shot, index, dialogueCue) {
  const sceneReferenceIds = new Set((scene.referenceRequirementIds || []).map(String));
  const referenceIds = (shot.referenceRequirementIds || []).map((value) => String(value || "").trim()).filter(Boolean);
  validateReferenceIds(referenceIds, sceneReferenceIds, index);
  const requirementById = new Map((project.storyDocument.visualRequirements || []).map((requirement) => [String(requirement.id), requirement]));
  if (!referenceIds.some((referenceId) => requirementById.get(referenceId)?.role === "location")) throw new Error(`Shot ${index + 1} requires its scene location reference.`);
  const visibleEntityIds = visibleReferenceNames(referenceIds, requirementById, screenplay);
  const speaker = dialogueCue?.speaker || "";
  if (dialogueCue?.delivery === "onscreen_lipsync" && !visibleEntityIds.includes(speaker)) throw new Error(`Shot ${index + 1} requires an on-screen visual reference for speaker ${speaker}.`);
  return { referenceIds, visibleEntityIds, audibleEntityIds: speaker ? [speaker] : [] };
}

function validateReferenceIds(referenceIds, sceneReferenceIds, index) {
  if (!referenceIds.length) throw new Error(`Shot ${index + 1} requires a shot-scoped visual reference subset.`);
  if (new Set(referenceIds).size !== referenceIds.length) throw new Error(`Shot ${index + 1} contains duplicate visual references.`);
  if (referenceIds.length > 8) throw new Error(`Shot ${index + 1} exceeds the provider limit of 8 visual references.`);
  if (referenceIds.some((referenceId) => !sceneReferenceIds.has(referenceId))) throw new Error(`Shot ${index + 1} references a visual requirement outside its scene.`);
}

function visibleReferenceNames(referenceIds, requirementById, screenplay) {
  const presentNames = new Set((screenplay.presentCharacterNames || []).map(String));
  return referenceIds.map((referenceId) => requirementById.get(referenceId))
    .filter((requirement) => ["main_character", "supporting_character"].includes(requirement?.role))
    .map((requirement) => String(requirement.name || "").trim()).filter((name) => name && presentNames.has(name));
}

function resolveMotionContract(shot, index, scene, actionCue, dialogueCue, soundCue, durationSec) {
  const dialogue = dialogueCue?.line || "";
  const description = String(shot.description || actionCue?.action || dialogueCue?.dramaticPurpose || soundCue?.description || scene.objective || "");
  const camera = String(shot.camera || "Locked medium coverage");
  const dominantAction = String(shot.dominantAction || actionCue?.action || description);
  const motion = String(shot.motion || actionCue?.performanceIntent || "");
  const transformationKinds = validateMotionState(motion, dominantAction, index);
  validateActionAtomicity(actionCue, dominantAction, index);
  validateDialogueBudget(dialogue, dialogueCue, durationSec, index);
  validateSingleCameraSetup(camera, index);
  return { dialogue, description, camera, dominantAction, motion, transformationKinds };
}

function validateSingleCameraSetup(camera, index) {
  if (hasMultipleCameraSetups(camera)) throw new Error(`MULTIPLE_CAMERA_SETUPS: shot ${index + 1} requests more than one camera setup inside a single provider render.`);
}

function validateMotionState(motion, dominantAction, index) {
  const kinds = classifyImportedShotTransformations(motion, dominantAction);
  if (kinds.length > 1) throw new Error(`MULTIPLE_VISIBLE_TRANSFORMATIONS: shot ${index + 1} contains independent physical transformations (${kinds.join(", ")}). Keep one material state change and move the other change to another screenplay cue/shot.`);
  return kinds;
}

function validateActionAtomicity(actionCue, dominantAction, index) {
  const operations = classifyIndependentActionOperations(actionCue?.action, actionCue?.visibleResult, dominantAction);
  if (operations.length > 1) throw new Error(`NON_ATOMIC_SHOT: shot ${index + 1} contains independent operations (${operations.join(", ")}). Return to screenplay and keep one completed observable state change in this provider shot.`);
}

function validateDialogueBudget(dialogue, dialogueCue, durationSec, index) {
  const wordCount = dialogue.trim().split(/\s+/).filter(Boolean).length;
  const wordBudget = Math.max(0, Math.floor(durationSec * 2 - 1));
  if (dialogueCue && wordCount > wordBudget) throw new Error(`SPEECH_BUDGET_EXCEEDED: shot ${index + 1} has ${wordCount} locked words but its ${durationSec}s provider duration allows at most ${wordBudget}. The screenplay must use a shorter performable line or the duration planner must allocate a longer provider slot.`);
}

function resolveContinuity(scene, screenplay, actionCue, shotOrder) {
  const previousShot = getState().shots.filter((candidate) => candidate.sceneId === scene.id && candidate.order < shotOrder).sort((left, right) => right.order - left.order)[0];
  const previousSnapshot = previousShot?.continuityContract?.outgoingSnapshot;
  const incomingState = String(previousSnapshot?.state || previousShot?.continuityContract?.outgoingState || scene.entryState || "inherit scene entry state");
  const outgoingState = String(actionCue?.visibleResult || incomingState);
  const incomingSnapshot = previousSnapshot || { ref: `${screenplay.id}:state:v0`, sceneId: scene.id, version: 0, state: incomingState };
  const outgoingSnapshot = actionCue && outgoingState !== incomingState ? { ref: `${screenplay.id}:state:v${incomingSnapshot.version + 1}`, sceneId: scene.id, version: incomingSnapshot.version + 1, state: outgoingState, causedByCueId: actionCue.id } : incomingSnapshot;
  const stateDelta = actionCue && outgoingState !== incomingState ? [{ path: "scene.observableState", from: incomingState, to: outgoingState, causedByCueId: actionCue.id, lifecycle: ["consequence", "confirmation", "decision", "resolution"].includes(actionCue.semanticRole) ? "persistent" : "evolving", forbiddenBeforeCueId: actionCue.dependsOnCueIds?.[0] || actionCue.viewerRequiresCueIds?.[0], requiredVisibleOutcome: actionCue.expressionMode === "visible" }] : [];
  return { incomingState, outgoingState, incomingSnapshot, outgoingSnapshot, stateDelta };
}

function resolveAudioContract(project, dialogueCue) {
  if (!dialogueCue) return {};
  const normalizedSpeaker = String(dialogueCue.speaker || "").trim().toLowerCase();
  const storySpeaker = (project.storyDocument?.characters || []).find((character) => String(character.name || "").trim().toLowerCase() === normalizedSpeaker);
  const productionSpeaker = findProductionSpeaker(project, normalizedSpeaker);
  assertProductionVoice(dialogueCue, productionSpeaker);
  const voiceProfile = productionSpeaker.voiceProfile;
  const voiceContinuity = project.storyDocument?.narrativeContract?.voiceContinuity;
  const direction = (voiceContinuity?.perCharacter || []).find((entry) => String(entry.characterName || "").trim().toLowerCase() === normalizedSpeaker)?.direction;
  const voiceDirection = distinctVoiceDirection(direction, storySpeaker?.voiceBrief, voiceContinuity?.globalDirection);
  return { productionSpeaker, audioContract: buildAudioContract(project, dialogueCue, productionSpeaker, voiceProfile, voiceDirection) };
}

function findProductionSpeaker(project, normalizedSpeaker) {
  return getState().characters.find((character) => character.projectId === project.id && String(character.name || "").trim().toLowerCase() === normalizedSpeaker);
}

function assertProductionVoice(dialogueCue, productionSpeaker) {
  if (!productionSpeaker) throw new Error(`VOICE_OWNERSHIP_UNRESOLVED: speaker ${dialogueCue.speaker} has no character registry entry.`);
  const voice = productionSpeaker.voiceProfile;
  if (!voice?.locked || !voice.voiceId || !voice.lockedAt || voice.provider === "google-flow") throw new Error(`VOICE_CASTING_REQUIRED: ${dialogueCue.speaker} needs one executable locked audio-pass voice. Google Flow metadata is not a reusable voice lock.`);
}

function distinctVoiceDirection(...values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).filter((value, index, items) => items.indexOf(value) === index).join("; ");
}

function audioSourceType(delivery) {
  if (delivery === "onscreen_lipsync") return "visible_speaker";
  if (delivery === "recording") return "device_playback";
  if (delivery === "internal_voice") return "internal";
  return "offscreen_speaker";
}

function buildAudioContract(project, cue, speaker, voice, voiceDirection) {
  const language = String(project.intake?.outputLanguage || "Vietnamese");
  const signature = voice.voiceSignature || `${voice.voiceId}:${voice.speakingRateWpm || 150}:${voice.language || language}`;
  return { cueId: cue.id, speaker: cue.speaker, speakerCharacterId: speaker.id, exactDialogue: cue.line, language, voiceDirection, delivery: cue.delivery, sourceType: audioSourceType(cue.delivery), source: cue.source, allowedSpeakers: [cue.speaker], lipsyncRequired: cue.delivery === "onscreen_lipsync", voiceBinding: { provider: voice.provider, voiceId: voice.voiceId, voiceSignature: signature, lockedAt: voice.lockedAt, castingStatus: voice.castingStatus === "reviewed" ? "reviewed" : "auto_assigned" } };
}

function buildContinuityEntities(screenplay, scene, entityIds) {
  const names = screenplay.presentCharacterNames || [];
  const sides = names.length <= 1 ? ["center"] : names.length === 2 ? ["left", "right"] : ["left", "center", "right"];
  return entityIds.map((entityId) => {
    const sceneIndex = names.findIndex((name) => String(name).trim() === entityId);
    return { id: entityId, screenSide: sides[Math.min(Math.max(sceneIndex, 0), sides.length - 1)], owner: entityId, state: `Preserve identity, wardrobe (${scene.wardrobeState || "locked scene wardrobe"}), hand pose, and eyeline unless the owned action visibly changes them.` };
  });
}

function resolvePerformanceContract(shot, index, cueContract, motionContract, durationSec) {
  const { actionCue, dialogueCue, soundCue } = cueContract;
  const speechDelivery = dialogueCue?.delivery || "none";
  const speechType = !dialogueCue ? "silent" : dialogueCue.delivery === "internal_voice" ? "inner_monologue" : "dialogue";
  const speaker = dialogueCue?.speaker || "";
  const actionBeats = normalizeImportedActionBeats(shot, { durationSec, dominantAction: motionContract.dominantAction, camera: motionContract.camera, dialogue: motionContract.dialogue, speechType, speechDelivery, speaker, dialoguePurpose: dialogueCue?.dramaticPurpose || "", actionCue, dialogueCue });
  const timingContract = estimateShotTiming({ durationSec, dialogue: motionContract.dialogue, hasAction: Boolean(actionCue), hasReaction: actionBeats.some((beat) => beat.beatFunction === "reaction"), actionBeats });
  if (durationSec >= 6 && actionBeats.at(-1)?.beatFunction !== "hold" && timingContract.contentOccupancy < 0.55) throw new Error(`TIMING_SHOT_UNDERFILLED: shot ${index + 1} has only ${timingContract.estimatedActiveDurationSec}s of active content for a ${durationSec}s render and no explicit editorial tail.`);
  const coveredCues = [actionCue, dialogueCue, soundCue].filter(Boolean);
  const semanticRoles = coveredCues.map((cue) => cue.semanticRole);
  const escalation = semanticRoles.some((role) => ["pressure", "warning", "interruption"].includes(role)) ? "increase" : semanticRoles.some((role) => ["decision", "commitment", "revelation"].includes(role)) ? "climax" : semanticRoles.some((role) => ["consequence", "confirmation", "resolution"].includes(role)) ? "release" : "hold";
  return { speechDelivery, speechType, speaker, actionBeats, timingContract, coveredCues, escalation, intentionalSilence: soundCue?.kind === "silence" };
}

const importedShotText = (value, fallback = "") => String(value ?? fallback);

function importedPacingContract(actionCue, dialogueCue, soundCue, performance) {
  return {
    informationDelta: importedShotText(dialogueCue?.relationshipDelta ?? dialogueCue?.dramaticPurpose ?? soundCue?.description),
    actionDelta: importedShotText(actionCue?.visibleResult), escalation: performance.escalation,
    intentionalSilence: performance.intentionalSilence,
    silencePurpose: performance.intentionalSilence ? importedShotText(soundCue?.description, "dramatic pause") : undefined
  };
}

function priorActionCueIds(screenplay, performance, actionCue) {
  const firstCoveredOrder = Math.min(...performance.coveredCues.map((cue) => Number(cue.sequenceOrder)));
  return {
    completedActionCueIds: screenplay.actionCues.filter((cue) => Number(cue.sequenceOrder) < firstCoveredOrder).map((cue) => cue.id),
    mustNotRepeatActionCueIds: screenplay.actionCues.filter((cue) => Number(cue.sequenceOrder) < Number(actionCue?.sequenceOrder ?? Infinity)).map((cue) => cue.id)
  };
}

function importShot(shot, index, context) {
  const { project, expectedDurations, shotOrders } = context;
  assertShotAuthoredLanguage(project, shot, index);
  const cues = resolveCueContract(shot, index, context);
  const { screenplay, scene, cueIds, actionCue, dialogueCue, soundCue } = cues;
  const durationSec = normalizeProjectShotDuration(project, Number(expectedDurations?.[index] || shot.durationSec || 0));
  const visuals = resolveVisualContract(project, screenplay, scene, shot, index, dialogueCue);
  const motion = resolveMotionContract(shot, index, scene, actionCue, dialogueCue, soundCue, durationSec);
  const continuity = resolveContinuity(scene, screenplay, actionCue, shotOrders[index]);
  const audio = resolveAudioContract(project, dialogueCue);
  const performance = resolvePerformanceContract(shot, index, cues, motion, durationSec);
  const fulfilledObligationIds = [...new Set(performance.coveredCues.flatMap((cue) => cue.fulfillsObligationIds || []))];
  const actionHistory = priorActionCueIds(screenplay, performance, actionCue);
  return {
    id: id("shot"), projectId: project.id, sceneId: scene.id, order: shotOrders[index], description: motion.description, camera: motion.camera, motion: motion.motion, dominantAction: motion.dominantAction, visualTransformationCount: motion.transformationKinds.length,
    dialogue: motion.dialogue, speechType: performance.speechType, speechDelivery: performance.speechDelivery, speaker: performance.speaker, dialoguePurpose: importedShotText(dialogueCue?.dramaticPurpose), recordingSource: importedShotText(dialogueCue?.source), storyBeat: importedShotText(shot.storyBeat, importedShotText(scene.objective)), fulfilledObligationIds,
    pacingContract: importedPacingContract(actionCue, dialogueCue, soundCue, performance),
    timingContract: performance.timingContract, ownerActionCueId: actionCue?.id,
    ...actionHistory,
    contractBeatIds: (scene.contractBeatIds || []).map(String), screenplayActionCueIds: cueIds.action, screenplayDialogueCueIds: cueIds.dialogue, screenplaySoundCueIds: cueIds.sound,
    visibleEntityIds: visuals.visibleEntityIds, audibleEntityIds: visuals.audibleEntityIds, continuityEntityIds: visuals.visibleEntityIds, referenceRequirementIds: visuals.referenceIds,
    transitionIn: importedShotText(shot.transitionIn, "cut"), transitionOut: importedShotText(shot.transitionOut, "cut"), screenDirection: importedShotText(shot.screenDirection, "maintain established geography"),
    continuityContract: { geography: importedShotText(scene.location, "preserve established geography"), ...continuity, fixedAnchors: Array.isArray(scene.requiredProps) ? scene.requiredProps.map(String).map((value) => value.trim()).filter(Boolean) : [], incomingStateRef: continuity.incomingSnapshot.ref, outgoingStateRef: continuity.outgoingSnapshot.ref, entities: buildContinuityEntities(screenplay, scene, visuals.visibleEntityIds) },
    speakerCharacterId: audio.productionSpeaker?.id, audioContract: audio.audioContract, actionBeats: performance.actionBeats,
    durationSec, prompt: "", providerId: "google-flow-web", status: "draft", assetIds: []
  };
}

function prepareBreakdownContext(job, project, result) {
  const targetScreenplaySceneId = String(job.input?.bridgeMessage?.settings?.screenplaySceneId || "");
  const allScreenplayScenes = project.storyDocument.screenplayScenes || [];
  const screenplayScenes = targetScreenplaySceneId ? allScreenplayScenes.filter((scene) => scene.id === targetScreenplaySceneId) : allScreenplayScenes;
  const allProjectScenes = getState().scenes.filter((scene) => scene.projectId === project.id);
  const projectScenes = targetScreenplaySceneId ? allProjectScenes.filter((scene) => scene.screenplaySceneId === targetScreenplaySceneId) : allProjectScenes;
  const incomingShots = Array.isArray(result.shots) ? result.shots : [];
  if (!incomingShots.length) throw new Error("Shot breakdown requires shots.");
  const expectedDurations = Array.isArray(job.input?.bridgeMessage?.settings?.shotDurationsSec) ? job.input.bridgeMessage.settings.shotDurationsSec.map(Number) : undefined;
  const expectedShotCount = expectedDurations?.length || recommendedProjectShotCount(project, project.intake?.targetDurationSec || 30);
  if (incomingShots.length !== expectedShotCount) throw new Error(`Shot breakdown requires exactly ${expectedShotCount} provider-feasible shots, received ${incomingShots.length}.`);
  const orderStart = Number(job.input?.bridgeMessage?.settings?.shotOrderStart || 1);
  const shotOrders = incomingShots.map((shot, index) => targetScreenplaySceneId ? orderStart + index : Number(shot.order));
  if (new Set(shotOrders).size !== shotOrders.length || shotOrders.some((order) => !Number.isInteger(order) || order < 1)) throw new Error("Shot breakdown requires unique positive integer shot orders.");
  const expectedCueIds = new Set(Array.isArray(job.input?.bridgeMessage?.settings?.screenplayCueIds) ? job.input.bridgeMessage.settings.screenplayCueIds.map(String) : screenplayScenes.flatMap((scene) => [...scene.actionCues, ...scene.dialogueCues, ...scene.soundCues].map((cue) => cue.id)));
  return { project, targetScreenplaySceneId, allScreenplayScenes, screenplayScenes, screenplayById: new Map(screenplayScenes.map((scene) => [scene.id, scene])), allProjectScenes, projectScenes, sceneByArchitectureId: new Map(projectScenes.map((scene) => [scene.screenplaySceneId, scene])), incomingShots, expectedDurations, shotOrders, expectedCueIds, cueCoverage: new Map([...expectedCueIds].map((cueId) => [cueId, 0])) };
}

function validateImportedPacket(importedShots, context) {
  const uncoveredCues = [...context.cueCoverage.entries()].filter(([, count]) => count === 0).map(([cueId]) => cueId);
  if (uncoveredCues.length) throw new Error(`Shot breakdown leaves screenplay cues uncovered: ${uncoveredCues.join(", ")}.`);
  const totalDuration = importedShots.reduce((sum, shot) => sum + shot.durationSec, 0);
  // The bridge may persist scene-weighted fractional durations (for example
  // 3.0769s), while the selected provider only accepts its duration ladder.
  // Compare against the same normalized inventory used by importShot rather
  // than rejecting a valid packet for mixing raw planning and provider time.
  const normalizedExpectedDurations = context.expectedDurations?.map((duration) => normalizeProjectShotDuration(context.project, duration));
  const expectedRuntime = normalizedExpectedDurations?.reduce((sum, duration) => sum + duration, 0) ?? Number(context.project.intake?.targetDurationSec || 30);
  if (totalDuration !== expectedRuntime) throw new Error(`Shot breakdown runtime is ${totalDuration}s; this packet requires ${expectedRuntime}s.`);
  if (!context.expectedDurations) return;
  const actual = importedShots.map((shot) => shot.durationSec).sort((a, b) => a - b);
  const expected = normalizedExpectedDurations.slice().sort((a, b) => a - b);
  if (actual.some((duration, index) => duration !== expected[index])) throw new Error("Scene shot breakdown did not use its assigned duration inventory exactly once.");
}

function persistImportedPacket(job, importedShots, context) {
  const { project, projectScenes, allProjectScenes, allScreenplayScenes } = context;
  if (hasNewerApprovedPacket(job, context)) return;
  const importedOrders = new Set(importedShots.map((shot) => shot.order));
  replaceImportedShots(projectScenes, importedOrders, importedShots);
  reconcileProjectBreakdown(job, project, allProjectScenes, allScreenplayScenes);
}

function hasNewerApprovedPacket(job, context) {
  const targetSceneId = context.targetScreenplaySceneId;
  const startOrder = Number(job.input?.bridgeMessage?.settings?.shotOrderStart || 0);
  const currentIsQaRepair = /:qa-[^:]+$/i.test(String(job.input?.bridgeMessage?.settings?.sessionKey || ""));
  const jobTime = Date.parse(job.updatedAt || job.createdAt || 0);
  return getState().jobs.some((candidate) => isNewerPacket(candidate, job, { targetSceneId, startOrder, currentIsQaRepair, jobTime }));
}

function isNewerPacket(candidate, job, { targetSceneId, startOrder, currentIsQaRepair, jobTime }) {
  if (candidate.id === job.id || candidate.projectId !== job.projectId || candidate.status !== "approved") return false;
  const settings = candidate.input?.bridgeMessage?.settings || {};
  if (currentIsQaRepair && !/:qa-[^:]+$/i.test(String(settings.sessionKey || ""))) return false;
  return sameBreakdownSlot(settings, targetSceneId, startOrder) && packetIsNewer(candidate, jobTime);
}

function sameBreakdownSlot(settings, targetSceneId, startOrder) {
  return settings && String(settings.screenplaySceneId || "") === String(targetSceneId || "") && Number(settings.shotOrderStart || 0) === startOrder;
}

function packetIsNewer(candidate, jobTime) {
  return candidate.input?.bridgeMessage?.task === "shot_breakdown" && Date.parse(candidate.updatedAt || candidate.createdAt || 0) > jobTime;
}

function replaceImportedShots(projectScenes, importedOrders, importedShots) {
  mutateState((state) => {
    state.shots = state.shots.filter((shot) => !projectScenes.some((scene) => scene.id === shot.sceneId) || !importedOrders.has(shot.order));
    state.shots.push(...importedShots);
  }, { reason: "shot-breakdown-import" });
}

function reconcileProjectBreakdown(job, project, allProjectScenes, allScreenplayScenes) {
  const state = getState();
  const sceneIds = new Set(allProjectScenes.map((scene) => scene.id));
  const allProjectShots = state.shots.filter((shot) => sceneIds.has(shot.sceneId));
  const everySceneCovered = allProjectScenes.every((scene) => allProjectShots.some((shot) => shot.sceneId === scene.id));
  const projectRuntime = allProjectShots.reduce((sum, shot) => sum + shot.durationSec, 0);
  const projectShotCount = Number(job.input?.bridgeMessage?.settings?.projectShotCount || recommendedProjectShotCount(project, project.intake?.targetDurationSec || 30));
  const projectRuntimeSec = Number(job.input?.bridgeMessage?.settings?.projectRuntimeSec || projectRuntime);
  if (everySceneCovered && allProjectShots.length === projectShotCount && projectRuntime === projectRuntimeSec) {
    project.storyDocument.sequenceQA = validateSequenceContracts({ scenes: allProjectScenes, screenplayScenes: allScreenplayScenes, shots: allProjectShots, narrativeContract: project.storyDocument.narrativeContract });
    project.storyDocument.shotBreakdownApprovedAt = project.storyDocument.sequenceQA.status === "BLOCKED" ? undefined : now();
  }
  project.updatedAt = now();
  reconcileCompletedShotBreakdown(project);
}

function applyShotBreakdownResult(job, message) {
  const text = message.output?.text || message.assets?.[0]?.metadata?.text;
  if (typeof text !== "string") throw new Error("Shot breakdown response did not include text.");
  job.outputText = text.trim();
  if (/STUDIO_REQUEST_ID:\s*\S+/i.test(text) && /you are the shot designer/i.test(text)) {
    throw new Error("PROVIDER_OUTPUT_DEGENERATED: provider returned the shot request prompt instead of a shot JSON response.");
  }
  const result = extractJson(text);
  const project = getState().projects.find((item) => item.id === job.projectId);
  if (!project?.storyDocument?.architectureApprovedAt) throw new Error("Shot breakdown requires an approved story architecture.");
  // Voice locks are a production preflight invariant, not a manual prerequisite.
  // Materialize missing executable voices before validating imported dialogue so
  // a fresh YOLO project cannot stop after screenplay solely because character
  // rows were created before the voice catalog was available.
  ensureProjectVoices(project);
  const context = prepareBreakdownContext(job, project, result);
  const importedShots = context.incomingShots.map((shot, index) => importShot(shot, index, context));
  validateImportedPacket(importedShots, context);
  persistImportedPacket(job, importedShots, context);
}

module.exports = { createShotBreakdownPipeline };
