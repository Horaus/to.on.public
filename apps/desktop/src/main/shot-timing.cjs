function spokenDurationSec(dialogue) {
  const words = String(dialogue || "").trim().split(/\s+/).filter(Boolean).length;
  return words ? words / 2.2 + 0.45 : 0;
}

function hasMultipleCameraSetups(camera) {
  const value = String(camera || "");
  return /\b(?:cut\s+to|switch(?:es)?\s+to|alternat(?:e|es|ing)\s+between|multiple\s+angles|shot[- ]reverse[- ]shot|montage)\b|(?:cắt\s+sang|đổi\s+sang|xen\s+kẽ.{0,24}(?:góc|cảnh)|nhiều\s+góc\s+máy)/iu.test(value)
    || /\bthen\s+(?:a\s+)?(?:wide|medium|close[- ]?up|overhead|low[- ]angle)\b|sau\s+đó.{0,24}(?:toàn\s+cảnh|trung\s+cảnh|cận\s+cảnh|góc\s+cao|góc\s+thấp)/iu.test(value);
}

function estimateShotTiming({ durationSec, dialogue, hasAction, hasReaction, actionBeats }) {
  const dialogueDurationSec = spokenDurationSec(dialogue);
  const actionDurationSec = hasAction ? 2.2 : 0;
  const recognitionDurationSec = hasReaction || hasAction ? 0.9 : 0.4;
  const authoredActiveDuration = (actionBeats || [])
    .filter((beat) => beat.beatFunction !== "hold")
    .reduce((latestEnd, beat) => Math.max(latestEnd, Number(beat.endSec) || 0), 0);
  const estimatedActiveDurationSec = Math.min(durationSec, Math.max(authoredActiveDuration, Math.max(dialogueDurationSec, actionDurationSec) + recognitionDurationSec));
  return {
    estimatedActiveDurationSec: Number(estimatedActiveDurationSec.toFixed(2)),
    contentOccupancy: Number((estimatedActiveDurationSec / Math.max(0.1, durationSec)).toFixed(2)),
    dialogueDurationSec: Number(dialogueDurationSec.toFixed(2)),
    actionDurationSec,
    recognitionDurationSec
  };
}

function cuttableTail(startSec, durationSec, camera, purpose = "clean editorial exit") {
  if (startSec >= durationSec) return [];
  return [{
    startSec,
    endSec: durationSec,
    beatFunction: "hold",
    action: "Keep the completed physical state stable. Allow only natural breathing or a small readable reaction; do not repeat or invent an action.",
    camera,
    dialogue: "",
    speechType: "silent",
    speechDelivery: "none",
    speaker: "",
    dialoguePurpose: purpose
  }];
}

function defaultBeatContext(options) {
  const { camera, dialogue, speechType, speechDelivery, speaker, dialoguePurpose, actionCue } = options;
  return {
    dialogueBeat: { beatFunction: "dialogue", action: "Maintain the inherited physical state while the named speaker delivers the line; do not begin the dependent action.", camera, dialogue, speechType, speechDelivery, speaker, dialoguePurpose },
    actionBeat: { beatFunction: "action", actionCueId: actionCue?.id, action: options.dominantAction, camera, dialogue: "", speechType: "silent", speechDelivery: "none", speaker: "", dialoguePurpose: "visible causal consequence" }
  };
}

function defaultActionBeats(options) {
  const { durationSec, dominantAction, camera, dialogue, speechType, speechDelivery, speaker, dialoguePurpose, actionCue, dialogueCue } = options;
  const actionCueId = actionCue?.id;
    if (!actionCueId) {
      const activeEnd = Number(Math.min(durationSec, dialogue ? Math.max(1.2, spokenDurationSec(dialogue)) + 0.9 : 3.1).toFixed(2));
      return [{ startSec: 0, endSec: activeEnd, beatFunction: dialogue ? "dialogue" : "reaction", action: dominantAction, camera, dialogue, speechType, speechDelivery, speaker, dialoguePurpose }, ...cuttableTail(activeEnd, durationSec, camera)];
    }
    const actionDependencies = new Set([...(actionCue?.dependsOnCueIds || []), ...(actionCue?.viewerRequiresCueIds || [])].map(String));
    const dialogueDependencies = new Set([...(dialogueCue?.dependsOnCueIds || []), ...(dialogueCue?.viewerRequiresCueIds || [])].map(String));
    const dialogueBeforeAction = Boolean(dialogueCue && actionDependencies.has(String(dialogueCue.id)));
    const actionBeforeDialogue = Boolean(dialogueCue && dialogueDependencies.has(String(actionCue.id)));
    const dialogueDuration = Math.min(Math.max(0, durationSec - 1.2), Math.max(1.2, spokenDurationSec(dialogue)));
    const { dialogueBeat, actionBeat } = defaultBeatContext(options);
    if (dialogueBeforeAction) {
      const dialogueEnd = Number(dialogueDuration.toFixed(2));
      const actionEnd = Number(Math.min(durationSec, dialogueEnd + 2.2).toFixed(2));
      const reactionEnd = Number(Math.min(durationSec, actionEnd + 0.9).toFixed(2));
      return [
        { startSec: 0, endSec: dialogueEnd, ...dialogueBeat },
        { startSec: dialogueEnd, endSec: actionEnd, ...actionBeat },
        ...(actionEnd < reactionEnd ? [{ startSec: actionEnd, endSec: reactionEnd, beatFunction: "reaction", action: "The visible consequence registers once.", camera, dialogue: "", speechType: "silent", speechDelivery: "none", speaker: "", dialoguePurpose: "readable consequence" }] : []),
        ...cuttableTail(reactionEnd, durationSec, camera)
      ];
    }
    if (actionBeforeDialogue) {
      const actionEnd = Number(Math.min(2.2, Math.max(1.2, durationSec - dialogueDuration)).toFixed(2));
      const dialogueEnd = Number(Math.min(durationSec, actionEnd + dialogueDuration).toFixed(2));
      return [{ startSec: 0, endSec: actionEnd, ...actionBeat }, { startSec: actionEnd, endSec: dialogueEnd, ...dialogueBeat }, ...cuttableTail(dialogueEnd, durationSec, camera)];
    }
    const activeEnd = Number(Math.min(durationSec, Math.max(2.2, spokenDurationSec(dialogue)) + 0.9).toFixed(2));
    return [{
      startSec: 0,
      endSec: activeEnd,
      beatFunction: "action",
      actionCueId,
      action: dominantAction,
      camera,
      dialogue,
      speechType,
      speechDelivery,
      speaker,
      dialoguePurpose
    }, ...cuttableTail(activeEnd, durationSec, camera)];
}

function normalizeSourceBeat(beat, index, options) {
  const { camera, speechType, speechDelivery, speaker, dialoguePurpose, actionCue } = options;
  const actionCueId = actionCue?.id;
  return {
    startSec: Number(beat.startSec),
    endSec: Number(beat.endSec),
    beatFunction: String(beat.beatFunction || (beat.actionCueId || (actionCueId && index === 0) ? "action" : beat.dialogue ? "dialogue" : "reaction")),
    actionCueId: beat.actionCueId ? String(beat.actionCueId) : (actionCueId && index === 0 ? actionCueId : undefined),
    action: String(beat.action || "").trim(),
    camera: String(beat.camera || camera).trim(),
    dialogue: String(beat.dialogue || ""),
    speechType: String(beat.speechType || (beat.dialogue ? speechType : "silent")),
    speechDelivery: String(beat.speechDelivery || (beat.dialogue ? speechDelivery : "none")),
    speaker: String(beat.speaker || (beat.dialogue ? speaker : "")),
    dialoguePurpose: String(beat.dialoguePurpose || (beat.dialogue ? dialoguePurpose : ""))
  };
}

function normalizeSourceBeats(source, options) {
  return source.map((beat, index) => normalizeSourceBeat(beat, index, options));
}

function validateBeatShape(beats, durationSec) {
  if (beats[0]?.startSec !== 0 || beats.at(-1)?.endSec !== durationSec || beats.some((beat, index) => !Number.isFinite(beat.startSec) || !Number.isFinite(beat.endSec) || beat.endSec <= beat.startSec || (index > 0 && beat.startSec !== beats[index - 1].endSec))) {
    throw new Error("TIMING_BEATS_INVALID: actionBeats must be positive, contiguous, and cover the complete provider duration.");
  }
  const allowedFunctions = new Set(["setup", "action", "dialogue", "reaction", "hold"]);
  if (beats.some((beat) => !allowedFunctions.has(beat.beatFunction))) throw new Error("TIMING_BEATS_INVALID: every action beat requires setup, action, dialogue, reaction, or hold.");
}

function validateBeatOwnership(beats, actionCueId) {
  const ownerBeats = beats.filter((beat) => beat.actionCueId === actionCueId);
  if (actionCueId && ownerBeats.length !== 1) throw new Error(`ACTION_OWNER_INVALID: action cue ${actionCueId} must belong to exactly one timed beat.`);
  if (ownerBeats.some((beat) => beat.endSec - beat.startSec > 3.5 && !String(beat.dialogue || "").trim())) throw new Error("TIMING_ACTION_STRETCH: a simple primary action cannot occupy more than 3.5 seconds without concurrent dialogue.");
  return ownerBeats[0];
}

function validateBeatCausality(beats, actionBeat, actionCue, dialogueCue) {
  const actionDependencies = new Set([...(actionCue?.dependsOnCueIds || []), ...(actionCue?.viewerRequiresCueIds || [])].map(String));
  const dialogueDependencies = new Set([...(dialogueCue?.dependsOnCueIds || []), ...(dialogueCue?.viewerRequiresCueIds || [])].map(String));
  const dialogueBeats = beats.filter((beat) => String(beat.dialogue || "").trim());
  validateActionDependency(actionBeat, actionCue, dialogueCue, actionDependencies, dialogueBeats);
  validateDialogueDependency(actionBeat, actionCue, dialogueCue, dialogueDependencies, dialogueBeats);
}

function validateActionDependency(actionBeat, actionCue, dialogueCue, dependencies, dialogueBeats) {
  if (actionBeat && dialogueCue && dependencies.has(String(dialogueCue.id)) && dialogueBeats.some((beat) => beat.endSec > actionBeat.startSec)) throw new Error(`CAUSAL_BEAT_ORDER_INVALID: dialogue cue ${dialogueCue.id} must finish before dependent action cue ${actionCue.id}.`);
}

function validateDialogueDependency(actionBeat, actionCue, dialogueCue, dependencies, dialogueBeats) {
  if (actionBeat && dialogueCue && dependencies.has(String(actionCue.id)) && dialogueBeats.some((beat) => beat.startSec < actionBeat.endSec)) throw new Error(`CAUSAL_BEAT_ORDER_INVALID: action cue ${actionCue.id} must finish before dependent dialogue cue ${dialogueCue.id}.`);
}

function normalizeImportedActionBeats(shot, options) {
  const source = Array.isArray(shot.actionBeats) ? shot.actionBeats : [];
  if (!source.length) return defaultActionBeats(options);
  let beats = normalizeSourceBeats(source, options);
  // Provider models often stretch a simple action across the whole slot.
  // Preserve the authored action and duration, but make the editorial exit
  // explicit so QA can distinguish active motion from a stable hold.
  const actionCueId = options.actionCue?.id;
  const owner = beats.find((beat) => beat.actionCueId === actionCueId);
  if (owner && !String(owner.dialogue || "").trim() && owner.endSec - owner.startSec > 3.5) {
    const splitAt = Number((owner.startSec + 3.5).toFixed(2));
    const hold = { ...owner, startSec: splitAt, beatFunction: "hold", actionCueId: undefined, action: "Keep the completed physical state stable; allow only natural breathing or a small readable reaction.", dialogue: "", speechType: "silent", speechDelivery: "none", speaker: "" };
    beats = beats.flatMap((beat) => beat === owner ? [{ ...beat, endSec: splitAt }, hold] : beat);
  }
  validateBeatShape(beats, options.durationSec);
  const actionBeat = validateBeatOwnership(beats, options.actionCue?.id);
  validateBeatCausality(beats, actionBeat, options.actionCue, options.dialogueCue);
  return beats;
}

module.exports = { estimateShotTiming, hasMultipleCameraSetups, normalizeImportedActionBeats, spokenDurationSec };
