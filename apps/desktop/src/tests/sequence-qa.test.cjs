const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSequenceContracts } = require("../main/sequence-qa.cjs");

const cue = (id, sequenceOrder, semanticRole, dependsOnCueIds = []) => ({ id, sequenceOrder, semanticRole, dependsOnCueIds, viewerRequiresCueIds: [], action: id, visibleResult: `${id}_done` });
const dialogue = (id, sequenceOrder, semanticRole, speaker, line, dependsOnCueIds = []) => ({ id, sequenceOrder, semanticRole, dependsOnCueIds, viewerRequiresCueIds: [], speaker, line, delivery: "onscreen_lipsync", dramaticPurpose: semanticRole });

function fixture() {
  const screenplay = {
    id: "sp_1", sceneOrder: 1, slugline: "INT. ROOM - NIGHT", presentCharacterNames: ["Nam", "Linh"], objective: "Repair", conflict: "Deadline", turn: "Refusal", entryState: "radio_off", exitState: "radio_on",
    actionCues: [cue("pressure", 1, "pressure"), cue("decision", 4, "decision", ["refusal"]), cue("result", 5, "consequence", ["decision"]), cue("resolution", 6, "resolution", ["result"])],
    dialogueCues: [dialogue("proposal", 2, "proposal", "Nam", "Tháo nó ra."), dialogue("refusal", 3, "refusal", "Linh", "Không tháo.", ["proposal"])], soundCues: []
  };
  const scene = { id: "scene_1", screenplaySceneId: "sp_1" };
  const durations = [4, 3, 2, 3, 2, 4];
  const stateVersions = new Map([["radio_off", 0], ["pressure_done", 1], ["decision_done", 2], ["result_done", 3], ["resolution_done", 4]]);
  const shot = (id, order, cueId, incomingState, outgoingState, dialogueCue) => ({
    id, sceneId: scene.id, order, durationSec: durations[order - 1], storyBeat: cueId,
    screenplayActionCueIds: dialogueCue ? [] : [cueId], screenplayDialogueCueIds: dialogueCue ? [cueId] : [], screenplaySoundCueIds: [],
    ownerActionCueId: dialogueCue ? undefined : cueId,
    completedActionCueIds: [],
    mustNotRepeatActionCueIds: [],
    timingContract: { estimatedActiveDurationSec: durations[order - 1], contentOccupancy: 1, dialogueDurationSec: 0, actionDurationSec: dialogueCue ? 0 : 2.2, recognitionDurationSec: 0.9 },
    actionBeats: dialogueCue || durations[order - 1] <= 3.5
      ? [{ startSec: 0, endSec: durations[order - 1], beatFunction: dialogueCue ? "dialogue" : "action", actionCueId: dialogueCue ? undefined : cueId, action: cueId, camera: "Locked camera.", dialogue: dialogueCue?.line || "", speechType: dialogueCue ? "dialogue" : "silent", speechDelivery: dialogueCue?.delivery || "none", speaker: dialogueCue?.speaker || "" }]
      : [{ startSec: 0, endSec: 3, beatFunction: "action", actionCueId: cueId, action: cueId, camera: "Locked camera.", dialogue: "", speechType: "silent", speechDelivery: "none", speaker: "" }, { startSec: 3, endSec: durations[order - 1], beatFunction: "reaction", action: "register consequence", camera: "Locked camera.", dialogue: "", speechType: "silent", speechDelivery: "none", speaker: "" }],
    continuityContract: {
      incomingState,
      outgoingState,
      incomingStateRef: `sp_1:state:v${stateVersions.get(incomingState)}`,
      outgoingStateRef: `sp_1:state:v${stateVersions.get(outgoingState)}`,
      incomingSnapshot: { ref: `sp_1:state:v${stateVersions.get(incomingState)}`, sceneId: scene.id, version: stateVersions.get(incomingState), state: incomingState },
      outgoingSnapshot: { ref: `sp_1:state:v${stateVersions.get(outgoingState)}`, sceneId: scene.id, version: stateVersions.get(outgoingState), state: outgoingState, causedByCueId: incomingState === outgoingState ? undefined : cueId },
      stateDelta: incomingState === outgoingState ? [] : [{ path: "scene.observableState", from: incomingState, to: outgoingState, causedByCueId: cueId }]
    },
    speakerCharacterId: dialogueCue ? `char_${dialogueCue.speaker.toLowerCase()}` : undefined,
    visibleEntityIds: dialogueCue ? [dialogueCue.speaker] : [],
    audioContract: dialogueCue ? {
      cueId, speaker: dialogueCue.speaker, speakerCharacterId: `char_${dialogueCue.speaker.toLowerCase()}`,
      exactDialogue: dialogueCue.line, delivery: dialogueCue.delivery,
      voiceBinding: { provider: "macos", voiceId: "Linh", voiceSignature: `Linh:${dialogueCue.speaker}`, lockedAt: "2026-08-11T00:00:00.000Z", castingStatus: "reviewed" }
    } : undefined
  });
  const shots = [
    shot("sh1", 1, "pressure", "radio_off", "pressure_done"),
    shot("sh2", 2, "proposal", "pressure_done", "pressure_done", screenplay.dialogueCues[0]),
    shot("sh3", 3, "refusal", "pressure_done", "pressure_done", screenplay.dialogueCues[1]),
    shot("sh4", 4, "decision", "pressure_done", "decision_done"),
    shot("sh5", 5, "result", "decision_done", "result_done"),
    shot("sh6", 6, "resolution", "result_done", "resolution_done")
  ];
  return { scenes: [scene], screenplayScenes: [screenplay], shots };
}

test("sequence QA passes an ordered causal chain with continuous state and locked audio ownership", () => {
  const result = validateSequenceContracts(fixture());
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.findings, []);
});

test("sequence QA blocks response-before-trigger, state jumps and voice ownership drift", () => {
  const input = fixture();
  input.shots.find((shot) => shot.id === "sh2").order = 3;
  input.shots.find((shot) => shot.id === "sh3").order = 2;
  input.shots.find((shot) => shot.id === "sh3").continuityContract.incomingState = "radio_open";
  input.shots.find((shot) => shot.id === "sh3").continuityContract.incomingSnapshot = { ref: "sp_1:state:v99", sceneId: "scene_1", version: 99, state: "radio_open" };
  input.shots.find((shot) => shot.id === "sh3").audioContract.speaker = "Nam";
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "RESPONSE_PRECEDES_TRIGGER"));
  assert.ok(result.findings.some((finding) => finding.code === "UNJUSTIFIED_STATE_TRANSITION"));
  assert.ok(result.findings.some((finding) => finding.code === "CONTINUITY_VERSION_HANDOFF_BROKEN"));
  assert.ok(result.findings.some((finding) => finding.code === "VOICE_OWNERSHIP_UNRESOLVED"));
  assert.equal(result.findings.find((finding) => finding.code === "RESPONSE_PRECEDES_TRIGGER").owner, "technical_compiler");
  assert.equal(result.findings.find((finding) => finding.code === "VOICE_OWNERSHIP_UNRESOLVED").owner, "voice_audio");
});

test("sequence QA blocks a character voice signature changing between shots", () => {
  const input = fixture();
  const secondCue = input.screenplayScenes[0].dialogueCues[1];
  const secondShot = input.shots.find((shot) => shot.id === "sh3");
  secondCue.speaker = "Nam";
  secondShot.speakerCharacterId = "char_nam";
  secondShot.visibleEntityIds = ["Nam"];
  secondShot.audioContract.speaker = "Nam";
  secondShot.audioContract.speakerCharacterId = "char_nam";
  secondShot.audioContract.voiceBinding.voiceSignature = "Linh:170:Vietnamese";
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "VOICE_SIGNATURE_DRIFT"));
});

test("sequence QA rejects a state delta owned by a cue outside the shot", () => {
  const input = fixture();
  input.shots[0].continuityContract.stateDelta[0].causedByCueId = "decision";
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "UNAUTHORIZED_STATE_DELTA"));
});

test("sequence QA blocks duplicated action ownership and stretched action beats", () => {
  const input = fixture();
  const repeated = structuredClone(input.shots[0]);
  repeated.id = "sh_repeat";
  repeated.order = 7;
  repeated.actionBeats[0].endSec = 6;
  repeated.durationSec = 6;
  input.shots.push(repeated);
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "BEAT_DUPLICATED"));
  assert.ok(result.findings.some((finding) => finding.code === "TIMING_ACTION_STRETCH"));
});

test("sequence QA blocks an underfilled long provider slot", () => {
  const input = fixture();
  input.shots[0].durationSec = 8;
  input.shots[0].timingContract = { estimatedActiveDurationSec: 2.5, contentOccupancy: 0.31, dialogueDurationSec: 0, actionDurationSec: 2.2, recognitionDurationSec: 0.3 };
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "TIMING_SHOT_UNDERFILLED"));
});

test("sequence QA exposes long residual tails and repeated cadence before rendering", () => {
  const input = fixture();
  for (const [index, shot] of input.shots.slice(0, 3).entries()) {
    shot.durationSec = 8;
    shot.storyBeat = ["setup", "pressure", "choice"][index];
    shot.timingContract = { estimatedActiveDurationSec: 5, contentOccupancy: 0.63, dialogueDurationSec: 2, actionDurationSec: 2.2, recognitionDurationSec: 0.9 };
    shot.actionBeats = [
      { startSec: 0, endSec: 5, beatFunction: "action", actionCueId: shot.ownerActionCueId, action: "active", camera: "Locked medium.", dialogue: "line", speechType: "dialogue", speechDelivery: "onscreen_lipsync", speaker: "Nam" },
      { startSec: 5, endSec: 8, beatFunction: "hold", action: "cuttable tail", camera: "Locked medium.", dialogue: "", speechType: "silent", speechDelivery: "none", speaker: "" }
    ];
  }
  const result = validateSequenceContracts(input);
  assert.ok(result.findings.some((finding) => finding.code === "EXCESSIVE_RESIDUAL_HOLD"));
  assert.ok(result.findings.some((finding) => finding.code === "REPEATED_TIMING_SHAPE"));
});

test("sequence QA blocks visually flat coverage across an escalating run", () => {
  const input = fixture();
  for (const shot of input.shots.slice(0, 3)) {
    shot.pacingContract = { informationDelta: "new pressure", actionDelta: "", escalation: "increase" };
    shot.camera = "Locked medium two-shot.";
  }
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "ESCALATION_COVERAGE_FLAT" && finding.severity === "blocking"));
});

test("sequence QA enforces spoken and visible obligation modalities through the shot", () => {
  const input = fixture();
  input.screenplayScenes[0].dialogueCues[0].fulfillsObligationIds = ["obl_spoken"];
  input.screenplayScenes[0].dialogueCues[0].expressionMode = "spoken";
  input.screenplayScenes[0].actionCues[0].fulfillsObligationIds = ["obl_visible"];
  input.screenplayScenes[0].actionCues[0].expressionMode = "visible";
  input.narrativeContract = { beats: [{ id: "beat_1", obligations: [
    { id: "obl_spoken", modality: "mustBeSpoken", content: "The proposal is heard", allowedSpeakerNames: ["Nam"] },
    { id: "obl_visible", modality: "mustBeVisible", content: "Pressure is visible" }
  ] }] };
  assert.equal(validateSequenceContracts(input).status, "PASS");
  input.screenplayScenes[0].dialogueCues[0].expressionMode = "reaction";
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "OBLIGATION_MODALITY_MISMATCH"));
});

test("confirmation is accepted as a terminal resolution function", () => {
  const input = fixture();
  input.screenplayScenes[0].actionCues.find((item) => item.id === "resolution").semanticRole = "confirmation";
  const result = validateSequenceContracts(input);
  assert.equal(result.findings.some((finding) => finding.message.includes("no explicit resolution")), false);
});

test("scene choice pressure satisfies pressure grammar without a redundant pressure cue label", () => {
  const input = fixture();
  input.screenplayScenes[0].actionCues.find((item) => item.id === "pressure").semanticRole = "initiation";
  input.scenes[0].choicePressure = "The live deadline forces an immediate decision.";
  input.scenes[0].escalationMechanism = "The remaining time visibly collapses.";
  const result = validateSequenceContracts(input);
  assert.equal(result.findings.some((finding) => finding.message.includes("no explicit pressure")), false);
});

test("sequence QA detects a broken motif payoff and repeated character tactic", () => {
  const input = fixture();
  input.scenes[0].motifFunction = "setup";
  input.screenplayScenes[0].dialogueCues.push(
    dialogue("repeat_1", 7, "pressure", "Nam", "Một.", []),
    dialogue("repeat_2", 8, "pressure", "Nam", "Hai.", ["repeat_1"]),
    dialogue("repeat_3", 9, "pressure", "Nam", "Ba.", ["repeat_2"])
  );
  for (const cue of input.screenplayScenes[0].dialogueCues.slice(-3)) cue.tactic = "corner";
  const tail = input.shots.at(-1);
  for (const [offset, cueId] of ["repeat_1", "repeat_2", "repeat_3"].entries()) {
    input.shots.push({ ...structuredClone(tail), id: `repeat_shot_${offset}`, order: 7 + offset, screenplayActionCueIds: [], screenplayDialogueCueIds: [cueId], continuityContract: structuredClone(tail.continuityContract), audioContract: { cueId, speaker: "Nam", exactDialogue: `${["Một.", "Hai.", "Ba."][offset]}`, delivery: "onscreen_lipsync" } });
  }
  const result = validateSequenceContracts(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "CREATIVE_MOTIF_ARC_BROKEN"));
  assert.ok(result.findings.some((finding) => finding.code === "REPEATED_DIALOGUE_TACTIC"));
});
