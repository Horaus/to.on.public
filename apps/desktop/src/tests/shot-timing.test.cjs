const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateShotTiming, hasMultipleCameraSetups, normalizeImportedActionBeats } = require("../main/shot-timing.cjs");

const base = {
  durationSec: 8,
  dominantAction: "Nam shuts the steel case.",
  camera: "Locked medium close-up.",
  dialogue: "Tôi không đồng ý.",
  speechType: "dialogue",
  speechDelivery: "onscreen_lipsync",
  speaker: "Nam",
  dialoguePurpose: "refusal",
  actionCue: { id: "act_close", dependsOnCueIds: [], viewerRequiresCueIds: [] },
  dialogueCue: { id: "dlg_refuse", dependsOnCueIds: [], viewerRequiresCueIds: [] }
};

test("independent action and dialogue overlap instead of forming a serial action-pause-line pattern", () => {
  const beats = normalizeImportedActionBeats({}, base);
  assert.equal(beats[0].beatFunction, "action");
  assert.equal(beats[0].actionCueId, "act_close");
  assert.equal(beats[0].dialogue, "Tôi không đồng ý.");
  assert.equal(beats.at(-1).beatFunction, "hold");
  assert.ok(beats[0].endSec < 8);
  assert.doesNotMatch(beats[0].action, /Hold the inherited/i);
});

test("declared causality still serializes dialogue before its dependent action", () => {
  const beats = normalizeImportedActionBeats({}, { ...base, actionCue: { ...base.actionCue, dependsOnCueIds: ["dlg_refuse"] } });
  assert.equal(beats[0].beatFunction, "dialogue");
  assert.equal(beats[1].beatFunction, "action");
  assert.equal(beats[1].actionCueId, "act_close");
  assert.ok(beats[0].endSec <= beats[1].startSec);
});

test("timing occupancy excludes a cuttable provider tail", () => {
  const beats = normalizeImportedActionBeats({}, base);
  const timing = estimateShotTiming({ durationSec: 8, dialogue: base.dialogue, hasAction: true, hasReaction: false, actionBeats: beats });
  assert.equal(timing.estimatedActiveDurationSec, beats[0].endSec);
  assert.ok(timing.contentOccupancy < 0.55);
});

test("dialogue-only coverage also exposes its editorial boundary", () => {
  const beats = normalizeImportedActionBeats({}, { ...base, actionCue: undefined });
  assert.equal(beats[0].beatFunction, "dialogue");
  assert.equal(beats.at(-1).beatFunction, "hold");
  assert.ok(beats[0].endSec < 8);
});

test("camera grammar rejects a second setup but permits one motivated move", () => {
  assert.equal(hasMultipleCameraSetups("Medium two-shot, then a close-up of Lan."), true);
  assert.equal(hasMultipleCameraSetups("Trung cảnh rồi cắt sang cận cảnh Lan."), true);
  assert.equal(hasMultipleCameraSetups("Medium two-shot with one slow push-in as Lan corners Minh."), false);
});
