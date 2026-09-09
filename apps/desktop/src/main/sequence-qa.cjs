function validateStoryGrammar({ screenplayScenes, scenes, orderedShots, findings }) {
  const semanticRoles = new Set((screenplayScenes || []).flatMap((scene) => [...scene.actionCues, ...scene.dialogueCues, ...scene.soundCues].map((cue) => cue.semanticRole)));
  const storyGrammar = {
    pressure: ["pressure", "warning", "interruption"],
    decision: ["decision", "permission", "command", "commitment"],
    consequence: ["consequence", "confirmation", "resolution"],
    resolution: ["resolution", "confirmation"]
  };
  for (const [obligation, acceptedRoles] of Object.entries(storyGrammar)) {
    const sceneCarriesPressure = obligation === "pressure" && (scenes || []).some((scene) => String(scene.choicePressure || "").trim() || String(scene.escalationMechanism || "").trim());
    const shotCarriesPressure = obligation === "pressure" && orderedShots.some((shot) => shot.pacingContract?.escalation === "increase");
    if (!acceptedRoles.some((role) => semanticRoles.has(role)) && !sceneCarriesPressure && !shotCarriesPressure) findings.push({ code: "SEQUENCE_OBLIGATION_UNCOVERED", severity: "warning", message: `Sequence has no explicit ${obligation} function (${acceptedRoles.join(" / ")}).`, responsibleStage: "screenplay" });
  }
}

function sequenceQaResult(findings, checkedAt) {
  const ownerByStage = {
    screenplay: "creative_content", shot_compiler: "technical_compiler", continuity: "technical_compiler",
    voice_casting: "voice_audio", provider_adapter: "provider_execution"
  };
  const ownedFindings = findings.map((finding) => ({ ...finding, owner: ownerByStage[finding.responsibleStage] }));
  const revisionTargets = [...new Set(findings.map((finding) => finding.responsibleStage))];
  const status = findings.some((finding) => finding.severity === "blocking") ? "BLOCKED" : findings.length ? "REVISE" : "PASS";
  return { status, checkedAt, revisionTargets, findings: ownedFindings };
}

function validatePacingContracts(orderedShots, findings) {
  for (const shot of orderedShots) {
    const pacing = shot.pacingContract;
    if (!pacing) continue;
    if (!String(pacing.informationDelta || "").trim() && !String(pacing.actionDelta || "").trim()) {
      findings.push({ code: "EMPTY_PACING_DELTA", severity: "warning", message: `Shot ${shot.order} adds no explicit information or action delta.`, shotIds: [shot.id], responsibleStage: "shot_compiler" });
    }
    if (shot.speechType === "silent" && shot.durationSec >= 6 && !pacing.intentionalSilence) {
      findings.push({ code: "UNMOTIVATED_SILENCE", severity: "warning", message: `Silent shot ${shot.order} lasts ${shot.durationSec}s without an intentional silence purpose.`, shotIds: [shot.id], responsibleStage: "shot_compiler" });
    }
  }
}

function buildSequenceIndexes({ scenes, screenplayScenes, shots }) {
  const shotByCueId = new Map();
  const cueById = new Map();
  const cueKindById = new Map();
  const screenplayById = new Map((screenplayScenes || []).map((scene) => [scene.id, scene]));
  const orderedShots = [...(shots || [])].sort((a, b) => a.order - b.order);
  orderedShots.forEach((shot) => indexShotCues(shot, shotByCueId));
  (screenplayScenes || []).forEach((screenplay) => indexScreenplayCues(screenplay, cueById, cueKindById));
  return { shotByCueId, cueById, cueKindById, screenplayById, orderedShots };
}

function indexShotCues(shot, shotByCueId) {
  for (const cueId of shotCueIds(shot)) shotByCueId.set(cueId, shot);
}

function indexScreenplayCues(screenplay, cueById, cueKindById) {
  for (const [kind, cues] of [["action", screenplay.actionCues || []], ["dialogue", screenplay.dialogueCues || []], ["sound", screenplay.soundCues || []]]) {
    for (const cue of cues) {
      cueById.set(cue.id, cue);
      cueKindById.set(cue.id, kind);
    }
  }
}

function shotCueIds(shot) {
  return [...(shot.screenplayActionCueIds || []), ...(shot.screenplayDialogueCueIds || []), ...(shot.screenplaySoundCueIds || [])];
}

function validateCueOwnership(orderedShots, shotByCueId, findings) {
  for (const cueId of shotByCueId.keys()) {
    const owners = orderedShots.filter((candidate) => shotCueIds(candidate).includes(cueId));
    if (owners.length !== 1) findings.push({ code: "BEAT_DUPLICATED", severity: "blocking", message: `Cue ${cueId} is owned by ${owners.length} shots; every cue must have exactly one owner.`, shotIds: owners.map((candidate) => candidate.id), cueIds: [cueId], responsibleStage: "shot_compiler" });
  }
}

function validateCueCausality(screenplayScenes, shotByCueId, findings) {
  for (const screenplay of screenplayScenes || []) {
    const allCues = [...(screenplay.actionCues || []), ...(screenplay.dialogueCues || []), ...(screenplay.soundCues || [])];
    for (const cue of allCues) {
      const shot = shotByCueId.get(cue.id);
      if (!shot) { reportUncoveredCue(screenplay, cue, findings); continue; }
      validateCueDependencies(screenplay, cue, shot, shotByCueId, findings);
    }
  }
}

function reportUncoveredCue(screenplay, cue, findings) {
  findings.push({ code: "SEQUENCE_OBLIGATION_UNCOVERED", severity: "blocking", message: `Cue ${cue.id} is not covered by a shot.`, sceneId: screenplay.id, cueIds: [cue.id], responsibleStage: "shot_compiler" });
}

function validateCueDependencies(screenplay, cue, shot, shotByCueId, findings) {
  for (const dependencyId of [...(cue.dependsOnCueIds || []), ...(cue.viewerRequiresCueIds || [])]) {
    const dependencyShot = shotByCueId.get(dependencyId);
    if (!dependencyShot || dependencyShot.order > shot.order) findings.push({ code: "RESPONSE_PRECEDES_TRIGGER", severity: "blocking", message: `Cue ${cue.id} appears before required cue ${dependencyId}.`, sceneId: screenplay.id, shotIds: [shot.id, dependencyShot?.id].filter(Boolean), cueIds: [dependencyId, cue.id], responsibleStage: "shot_compiler" });
  }
}

function validateSceneHandoffs(scene, sceneShots, findings) {
  for (let index = 1; index < sceneShots.length; index++) {
    const previous = sceneShots[index - 1];
    const current = sceneShots[index];
    if (previous.continuityContract?.outgoingState !== current.continuityContract?.incomingState) findings.push({ code: "UNJUSTIFIED_STATE_TRANSITION", severity: "blocking", message: `Shot ${current.order} does not inherit the previous shot outgoing state.`, sceneId: scene.id, shotIds: [previous.id, current.id], responsibleStage: "continuity" });
    const previousSnapshot = previous.continuityContract?.outgoingSnapshot;
    const currentSnapshot = current.continuityContract?.incomingSnapshot;
    if (!previousSnapshot || !currentSnapshot || previousSnapshot.ref !== currentSnapshot.ref || previousSnapshot.version !== currentSnapshot.version) findings.push({ code: "CONTINUITY_VERSION_HANDOFF_BROKEN", severity: "blocking", message: `Shot ${current.order} does not inherit the exact versioned state snapshot from shot ${previous.order}.`, sceneId: scene.id, shotIds: [previous.id, current.id], responsibleStage: "continuity" });
  }
}

function validateStateDelta({ delta, shot, scene, shotByCueId, cueKindById, authorizedCueIds, findings }) {
  if (!authorizedCueIds.has(delta.causedByCueId)) findings.push({ code: "UNAUTHORIZED_STATE_DELTA", severity: "blocking", message: `Shot ${shot.order} changes state without an action cue owned by this shot.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [delta.causedByCueId], responsibleStage: "continuity" });
  if (delta.forbiddenBeforeCueId) {
    const triggerShot = shotByCueId.get(delta.forbiddenBeforeCueId);
    if (!triggerShot || triggerShot.order > shot.order) findings.push({ code: "FORBIDDEN_STATE_APPEARS_EARLY", severity: "blocking", message: `Shot ${shot.order} applies a state change before its required trigger ${delta.forbiddenBeforeCueId}.`, sceneId: scene.id, shotIds: [triggerShot?.id, shot.id].filter(Boolean), cueIds: [delta.forbiddenBeforeCueId, delta.causedByCueId], responsibleStage: "continuity" });
  }
  if (delta.requiredVisibleOutcome && cueKindById.get(delta.causedByCueId) !== "action") findings.push({ code: "VISIBLE_STATE_OUTCOME_MISSING", severity: "blocking", message: `Shot ${shot.order} requires a visible state outcome without an action cue.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [delta.causedByCueId], responsibleStage: "continuity" });
}

function validateShotContinuity({ scene, shot, shotByCueId, cueKindById, findings }) {
  const continuity = shot.continuityContract;
  const incoming = continuity?.incomingSnapshot;
  const outgoing = continuity?.outgoingSnapshot;
  const authorizedCueIds = new Set(shot.screenplayActionCueIds || []);
  if (!incoming || !outgoing || outgoing.version < incoming.version || outgoing.version > incoming.version + 1) findings.push({ code: "CONTINUITY_VERSION_INVALID", severity: "blocking", message: `Shot ${shot.order} has an invalid continuity state version transition.`, sceneId: scene.id, shotIds: [shot.id], responsibleStage: "continuity" });
  for (const delta of continuity?.stateDelta || []) validateStateDelta({ delta, shot, scene, shotByCueId, cueKindById, authorizedCueIds, findings });
}

function validateActionOwnership(scene, shot, findings) {
  const actionCueIds = shot.screenplayActionCueIds || [];
  if (hasInvalidActionOwner(actionCueIds, shot)) reportActionOwnerChanged(scene, shot, actionCueIds, findings);
  if (hasCompletedAction(shot)) reportCompletedAction(scene, shot, findings);
  const ownerBeats = actionOwnerBeats(shot);
  if (hasInvalidOwnerBeatCount(shot, ownerBeats)) reportActionOwnerBeat(scene, shot, findings);
  if (hasStretchedOwnerBeat(ownerBeats)) reportActionStretch(scene, shot, findings);
}

function hasInvalidActionOwner(actionCueIds, shot) { return actionCueIds.length > 0 && (actionCueIds.length !== 1 || shot.ownerActionCueId !== actionCueIds[0]); }
function hasCompletedAction(shot) { return Boolean(shot.ownerActionCueId && (shot.completedActionCueIds || []).includes(shot.ownerActionCueId)); }
function actionOwnerBeats(shot) {
  if (!shot.ownerActionCueId) return [];
  return (shot.actionBeats || []).filter((beat) => beat.actionCueId === shot.ownerActionCueId);
}
function hasInvalidOwnerBeatCount(shot, ownerBeats) { return Boolean(shot.ownerActionCueId && ownerBeats.length !== 1); }
function hasStretchedOwnerBeat(ownerBeats) { return ownerBeats.some((beat) => Number(beat.endSec) - Number(beat.startSec) > 3.5 && !String(beat.dialogue || "").trim()); }

function reportActionOwnerChanged(scene, shot, cueIds, findings) { findings.push({ code: "ACTION_OWNER_CHANGED", severity: "blocking", message: `Shot ${shot.order} does not declare its sole action cue as the primary action owner.`, sceneId: scene.id, shotIds: [shot.id], cueIds, responsibleStage: "shot_compiler" }); }
function reportCompletedAction(scene, shot, findings) { findings.push({ code: "ACTION_ALREADY_COMPLETED", severity: "blocking", message: `Shot ${shot.order} repeats action ${shot.ownerActionCueId} after it was completed.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [shot.ownerActionCueId], responsibleStage: "shot_compiler" }); }
function reportActionOwnerBeat(scene, shot, findings) { findings.push({ code: "ACTION_OWNER_CHANGED", severity: "blocking", message: `Shot ${shot.order} must execute its primary action in exactly one timed beat.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [shot.ownerActionCueId], responsibleStage: "shot_compiler" }); }
function reportActionStretch(scene, shot, findings) { findings.push({ code: "TIMING_ACTION_STRETCH", severity: "blocking", message: `Shot ${shot.order} stretches a simple primary action beyond 3.5 seconds.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [shot.ownerActionCueId], responsibleStage: "shot_compiler" }); }

function validateShotOccupancy(scene, shot, findings) {
  if (Number(shot.durationSec) >= 6 && (shot.actionBeats || []).at(-1)?.beatFunction !== "hold" && Number(shot.timingContract?.contentOccupancy) < 0.55) findings.push({ code: "TIMING_SHOT_UNDERFILLED", severity: "blocking", message: `Shot ${shot.order} fills only ${Math.round(Number(shot.timingContract?.contentOccupancy || 0) * 100)}% of its requested duration.`, sceneId: scene.id, shotIds: [shot.id], responsibleStage: "shot_compiler" });
  const tailBeat = (shot.actionBeats || []).at(-1);
  const tailDuration = tailBeat?.beatFunction === "hold" ? Number(tailBeat.endSec) - Number(tailBeat.startSec) : 0;
  if (tailDuration > 1.25 && tailDuration / Math.max(0.1, Number(shot.durationSec)) > 0.25) findings.push({ code: "EXCESSIVE_RESIDUAL_HOLD", severity: "warning", message: `Shot ${shot.order} leaves ${tailDuration.toFixed(1)}s as a cuttable provider tail; Edit must end near ${Number(shot.timingContract?.estimatedActiveDurationSec || tailBeat.startSec).toFixed(1)}s.`, sceneId: scene.id, shotIds: [shot.id], responsibleStage: "shot_compiler" });
}

function hasLockedAudioOwnership(cue, audio, shot) {
  return [
    cue,
    audio,
    audio?.speaker === cue?.speaker,
    audio?.exactDialogue === cue?.line,
    audio?.delivery === cue?.delivery,
    audio?.speakerCharacterId === shot.speakerCharacterId,
    audio?.voiceBinding?.voiceSignature,
    audio?.voiceBinding?.lockedAt,
    audio?.voiceBinding?.provider !== "google-flow"
  ].every(Boolean);
}

function validateShotAudio({ scene, shot, screenplay, voiceSignatureByCharacter, findings }) {
    const dialogueCueId = shot.screenplayDialogueCueIds?.[0];
    if (!dialogueCueId) return;
    const cue = screenplay.dialogueCues.find((item) => item.id === dialogueCueId);
    const audio = shot.audioContract;
    if (!hasLockedAudioOwnership(cue, audio, shot)) {
      findings.push({ code: "VOICE_OWNERSHIP_UNRESOLVED", severity: "blocking", message: `Shot ${shot.order} does not preserve dialogue ownership for ${dialogueCueId}.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [dialogueCueId], responsibleStage: "voice_casting" });
      return;
    }
    if (audio.delivery === "onscreen_lipsync" && !(shot.visibleEntityIds || []).includes(audio.speaker)) findings.push({ code: "LIPSYNC_SPEAKER_NOT_VISIBLE", severity: "blocking", message: `Shot ${shot.order} binds lipsync to ${audio.speaker}, but that character is not visible.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [dialogueCueId], responsibleStage: "voice_casting" });
    const priorSignature = voiceSignatureByCharacter.get(audio.speakerCharacterId);
    if (priorSignature && priorSignature !== audio.voiceBinding.voiceSignature) findings.push({ code: "VOICE_SIGNATURE_DRIFT", severity: "blocking", message: `${audio.speaker} changes voice signature across shots.`, sceneId: scene.id, shotIds: [shot.id], cueIds: [dialogueCueId], responsibleStage: "voice_casting" });
    else voiceSignatureByCharacter.set(audio.speakerCharacterId, audio.voiceBinding.voiceSignature);
}

function validateSceneAudio({ scene, sceneShots, screenplay, voiceSignatureByCharacter, findings }) {
  if (!screenplay || !sceneShots.length) return;
  sceneShots.forEach((shot) => validateShotAudio({ scene, shot, screenplay, voiceSignatureByCharacter, findings }));
}

function validateSceneContracts({ scenes, orderedShots, screenplayById, shotByCueId, cueKindById, findings }) {
  const voiceSignatureByCharacter = new Map();
  for (const scene of scenes || []) {
    const sceneShots = orderedShots.filter((shot) => shot.sceneId === scene.id);
    validateSceneHandoffs(scene, sceneShots, findings);
    for (const shot of sceneShots) {
      validateShotContinuity({ scene, shot, shotByCueId, cueKindById, findings });
      validateActionOwnership(scene, shot, findings);
      validateShotOccupancy(scene, shot, findings);
    }
    validateSceneAudio({ scene, sceneShots, screenplay: screenplayById.get(scene.screenplaySceneId), voiceSignatureByCharacter, findings });
  }
}

function validateMotifAndDialogueTactics({ scenes, screenplayScenes, orderedShots, findings }) {
  const orderedScenes = [...(scenes || [])].sort((a, b) => a.order - b.order);
  validateMotifArc(orderedScenes, orderedShots, findings);
  const orderedDialogue = [...(screenplayScenes || [])].sort((a, b) => Number(a.sceneOrder) - Number(b.sceneOrder)).flatMap((scene) => [...(scene.dialogueCues || [])].sort((a, b) => Number(a.sequenceOrder) - Number(b.sequenceOrder)));
  validateDialogueTacticWindows(orderedDialogue, findings);
}

function validateMotifArc(scenes, orderedShots, findings) {
  if (scenes.length && (scenes[0].motifFunction || scenes.at(-1).motifFunction) && (scenes[0].motifFunction !== "setup" || scenes.at(-1).motifFunction !== "payoff")) findings.push({ code: "CREATIVE_MOTIF_ARC_BROKEN", severity: "blocking", message: "The story-bearing motif must enter as setup and return as payoff.", shotIds: orderedShots.map((shot) => shot.id), responsibleStage: "screenplay" });
}

function validateDialogueTacticWindows(dialogue, findings) {
  for (let index = 0; index <= dialogue.length - 3; index++) {
    const window = dialogue.slice(index, index + 3);
    if (window.every((cue) => cue.speaker === window[0].speaker && cue.tactic && cue.tactic === window[0].tactic)) findings.push({ code: "REPEATED_DIALOGUE_TACTIC", severity: "warning", message: `${window[0].speaker} repeats the same ${window[0].tactic} tactic across three dialogue turns without a tactical shift.`, cueIds: window.map((cue) => cue.id), responsibleStage: "screenplay" });
  }
}

function obligationModalityMatches(obligation, cue, kind) {
  if (obligation.modality === "mustBeSpoken") return kind === "dialogue" && cue.expressionMode === "spoken";
  if (obligation.modality === "mustBeVisible") return kind === "action" && cue.expressionMode === "visible";
  if (obligation.modality === "reactionOnly") return cue.expressionMode === "reaction";
  return true;
}

function obligationSpeakerAllowed(obligation, cue) {
  if (obligation.modality !== "mustBeSpoken") return true;
  const allowed = (obligation.allowedSpeakerNames || []).map((name) => String(name).toLowerCase());
  return !allowed.length || allowed.includes(String(cue.speaker || "").toLowerCase());
}

function validateNarrativeObligation({ obligation, cueById, cueKindById, shotByCueId, findings }) {
    const coveringCues = [...cueById.values()].filter((cue) => (cue.fulfillsObligationIds || []).includes(obligation.id));
    const coveredShots = coveringCues.map((cue) => shotByCueId.get(cue.id)).filter(Boolean);
    if (coveringCues.length !== 1 || coveredShots.length !== 1) {
      findings.push({ code: "NARRATIVE_OBLIGATION_UNCOVERED", severity: "blocking", message: `Obligation ${obligation.id} must map to exactly one screenplay cue and one shot.`, shotIds: coveredShots.map((shot) => shot.id), cueIds: coveringCues.map((cue) => cue.id), responsibleStage: coveringCues.length === 1 ? "shot_compiler" : "screenplay" });
      return;
    }
    const cue = coveringCues[0];
    const kind = cueKindById.get(cue.id);
    if (!obligationModalityMatches(obligation, cue, kind)) findings.push({ code: "OBLIGATION_MODALITY_MISMATCH", severity: "blocking", message: `Obligation ${obligation.id} is ${obligation.modality} but cue ${cue.id} uses ${cue.expressionMode || kind}.`, shotIds: coveredShots.map((shot) => shot.id), cueIds: [cue.id], responsibleStage: "screenplay" });
    if (!obligationSpeakerAllowed(obligation, cue)) findings.push({ code: "OBLIGATION_SPEAKER_MISMATCH", severity: "blocking", message: `Cue ${cue.id} uses an unauthorized speaker for obligation ${obligation.id}.`, shotIds: coveredShots.map((shot) => shot.id), cueIds: [cue.id], responsibleStage: "voice_casting" });
}

function validateNarrativeObligations({ narrativeContract, cueById, cueKindById, shotByCueId, findings }) {
  const obligations = (narrativeContract?.beats || []).flatMap((beat) => (beat.obligations || []).map((obligation) => ({ ...obligation, beatId: beat.id })));
  obligations.forEach((obligation) => validateNarrativeObligation({ obligation, cueById, cueKindById, shotByCueId, findings }));
}

function validateRhythmWindow(window, findings) {
    validateFlatDurationPattern(window, findings);
    validateRepeatedTimingShape(window, findings);
    validateEscalationCoverage(window, findings);
}

function validateFlatDurationPattern(window, findings) {
    if (new Set(window.map((shot) => shot.durationSec)).size === 1 && new Set(window.map((shot) => shot.storyBeat || "")).size > 1) findings.push({ code: "FLAT_DURATION_PATTERN", severity: "warning", message: `Shots ${window.map((shot) => shot.order).join(", ")} use the same duration across different story functions.`, shotIds: window.map((shot) => shot.id), responsibleStage: "shot_compiler" });
}

function validateRepeatedTimingShape(window, findings) {
    const timingShapes = window.map((shot) => (shot.actionBeats || []).filter((beat) => beat.beatFunction !== "hold").map((beat) => beat.beatFunction).join(">"));
    if (timingShapes[0] && new Set(timingShapes).size === 1 && new Set(window.map((shot) => shot.storyBeat || "")).size > 1) findings.push({ code: "REPEATED_TIMING_SHAPE", severity: "warning", message: `Shots ${window.map((shot) => shot.order).join(", ")} repeat the same ${timingShapes[0]} timing shape across different dramatic functions.`, shotIds: window.map((shot) => shot.id), responsibleStage: "shot_compiler" });
}

function validateEscalationCoverage(window, findings) {
    const escalating = window.filter((shot) => ["increase", "climax"].includes(shot.pacingContract?.escalation));
    const cameras = escalating.map((shot) => String(shot.camera || shot.actionBeats?.[0]?.camera || "").trim().toLowerCase()).filter(Boolean);
    if (escalating.length === window.length && cameras.length === window.length && new Set(cameras).size === 1) findings.push({ code: "ESCALATION_COVERAGE_FLAT", severity: "blocking", message: `Shots ${window.map((shot) => shot.order).join(", ")} escalate dramatically without changing visual pressure or coverage.`, shotIds: window.map((shot) => shot.id), responsibleStage: "shot_compiler" });
}

function validateRhythmWindows(orderedShots, findings) {
  for (let index = 0; index <= orderedShots.length - 3; index++) {
    validateRhythmWindow(orderedShots.slice(index, index + 3), findings);
  }
}

function validateSequenceContracts({ scenes, screenplayScenes, shots, narrativeContract, checkedAt = new Date().toISOString() }) {
  const findings = [];
  const { shotByCueId, cueById, cueKindById, screenplayById, orderedShots } = buildSequenceIndexes({ scenes, screenplayScenes, shots });
  validateCueOwnership(orderedShots, shotByCueId, findings);
  validateCueCausality(screenplayScenes, shotByCueId, findings);
  validateSceneContracts({ scenes, orderedShots, screenplayById, shotByCueId, cueKindById, findings });
  validateMotifAndDialogueTactics({ scenes, screenplayScenes, orderedShots, findings });
  validateNarrativeObligations({ narrativeContract, cueById, cueKindById, shotByCueId, findings });
  validateRhythmWindows(orderedShots, findings);

  validatePacingContracts(orderedShots, findings);

  validateStoryGrammar({ screenplayScenes, scenes, orderedShots, findings });

  return sequenceQaResult(findings, checkedAt);
}

module.exports = { validateSequenceContracts };
