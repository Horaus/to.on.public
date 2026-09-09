const test = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../index.cjs");

const completeReadiness = () => ({
  hasBrief: true, foundationReady: true, architectureReady: true,
  screenplayReady: true, shotBreakdownReady: true, promptsReady: true,
  characterReady: true, keyframesReady: true, videosReady: true
});

[
  ["setup", "hasBrief"], ["foundation", "foundationReady"],
  ["architecture", "architectureReady"], ["screenplay", "screenplayReady"],
  ["shots", "shotBreakdownReady"], ["prompts", "promptsReady"],
  ["character", "characterReady"], ["storyboard", "keyframesReady"],
  ["video", "videosReady"]
].forEach(([expected, field]) => test(`pipeline stops at ${expected}`, () => {
  const readiness = completeReadiness();
  readiness[field] = false;
  assert.equal(domain.nextPipelineStep(readiness), expected);
}));

test("complete pipeline reaches review", () => assert.equal(domain.nextPipelineStep(completeReadiness()), "review"));
test("foundation jobs use foundation artifact gate", () => assert.equal(domain.structuredTaskArtifactReady("story_foundation", { foundationReady: true }), true));
test("unknown jobs never borrow another artifact gate", () => assert.equal(domain.structuredTaskArtifactReady("text_to_image", completeReadiness()), false));

[
  ["mở cửa kho", ["open_close"]],
  ["nhấc thùng lên", ["lift_weight"]],
  ["tháo bu lông", ["detach_remove"]],
  ["gắn chìa khóa vào trục", ["attach_install"]],
  ["tấm kính vỡ toạc", ["break_damage"]],
  ["chuyển hồ sơ cho An", ["transfer"]],
  ["ánh mắt chuyển sang cửa", []],
  ["cảnh báo đóng cửa vang lên", []],
  ["Linh rút bàn tay lại", []],
  ["hậu cảnh chuyển động chậm", []]
].forEach(([motion, expected]) => test(`classifies visible transformation: ${motion}`, () => {
  assert.deepEqual(domain.classifyImportedShotTransformations(motion, ""), expected);
}));

test("attach absorbs lift and transfer aliases", () => {
  assert.deepEqual(domain.classifyImportedShotTransformations("nhấc khóa rồi chuyển và gắn vào trục", ""), ["attach_install"]);
});
test("detach absorbs extraction alias", () => {
  assert.deepEqual(domain.classifyImportedShotTransformations("tháo chốt rồi kéo ra khỏi trục", ""), ["detach_remove"]);
});
test("independent operations remain separately visible", () => {
  assert.deepEqual(domain.classifyIndependentActionOperations("hủy lệnh, buông chìa khóa và gọi kỹ thuật"), ["cancel_command", "release_object", "call_contact"]);
});

function narrativePackage() {
  return {
    characters: [{ name: "An", role: "main", required: true }],
    visualRequirements: [
      { id: "char-an", role: "main_character", name: "An" },
      { id: "loc", role: "location", name: "Garage" }
    ],
    narrativeContract: {
      corePremise: "An must stop a machine.", primaryObjective: "Stop it", requiredOutcome: "Machine stops",
      allowedSpeakerNames: ["An"],
      beats: [{ id: "b1", sourceEvidence: "Alarm", requiredAction: "An stops it", requiredOutcome: "Safe", allowedSpeakerNames: ["An"] }]
    }
  };
}

test("narrative package accepts complete contract", () => {
  assert.equal(domain.validateNarrativePackage(narrativePackage(), true).contractBeatIds.has("b1"), true);
});
test("narrative package rejects missing primary subject", () => {
  const value = narrativePackage(); value.characters = [];
  assert.throws(() => domain.validateNarrativePackage(value, true), /primary subject/);
});
test("narrative package rejects missing main character reference", () => {
  const value = narrativePackage(); value.visualRequirements = value.visualRequirements.filter((item) => item.role !== "main_character");
  assert.throws(() => domain.validateNarrativePackage(value, true), /main_character/);
});
test("narrative package rejects duplicate contract beat ids", () => {
  const value = narrativePackage(); value.narrativeContract.beats.push({ ...value.narrativeContract.beats[0] });
  assert.throws(() => domain.validateNarrativePackage(value, true), /uniquely identified/);
});
test("scene package requires narrative fields", () => {
  const context = domain.validateNarrativePackage(narrativePackage(), true);
  assert.throws(() => domain.validateScenePackage({ scene: { contractBeatIds: ["b1"], referenceRequirementIds: ["loc"] }, sceneIndex: 0, requiresScreenplayV2: true, ...context }), /requires objective/);
});
test("shot references must be a scene subset", () => {
  const context = domain.validateNarrativePackage(narrativePackage(), true);
  assert.throws(() => domain.validateShotReferences({ shot: { referenceRequirementIds: ["missing"] }, sceneIndex: 0, shotIndex: 0, sceneRequirementIds: new Set(["loc"]), requirementById: context.requirementById }), /explicit valid reference subset/);
});
