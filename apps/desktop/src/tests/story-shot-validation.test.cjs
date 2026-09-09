const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validateNarrativePackage,
  validateScenePackage,
  validateScreenplayShot,
  validateShotReferences,
  assertContractCoverage
} = require("../main/story-shot-validation.cjs");

function packageFixture() {
  const result = {
    characters: [{ name: "Mai", role: "main", required: true }],
    visualRequirements: [
      { id: "char-mai", role: "main_character", name: "Mai" },
      { id: "garage", role: "location", name: "Garage" },
      { id: "radio", role: "prop", name: "Radio" }
    ],
    narrativeContract: {
      corePremise: "Mai must repair the radio before broadcast.",
      primaryObjective: "Restore the signal.",
      requiredOutcome: "The radio works.",
      allowedSpeakerNames: ["Mai"],
      beats: [{ id: "B1", sourceEvidence: "The radio is silent.", requiredAction: "Repair it.", requiredOutcome: "Signal returns.", allowedSpeakerNames: ["Mai"] }]
    }
  };
  const scene = {
    objective: "Repair the radio", conflict: "Time is running out", dramaticTurn: "A wire snaps", entryState: "Radio silent", exitState: "Radio working",
    contractBeatIds: ["B1"], referenceRequirementIds: ["char-mai", "garage", "radio"], requiredProps: ["Radio"]
  };
  const shot = {
    durationSec: 6, speechType: "dialogue", speechDelivery: "onscreen_lipsync", speaker: "Mai", dialoguePurpose: "Commit to the repair", dialogue: "Tôi sẽ sửa nó ngay.",
    contractBeatIds: ["B1"], storyBeat: "Mai commits", dominantAction: "Mai reconnects one wire", visualTransformationCount: 1,
    transitionIn: "Wire detached", transitionOut: "Wire connected", screenDirection: "Mai faces right",
    continuityContract: { geography: "Mai left, radio right", incomingState: "Wire detached", outgoingState: "Wire connected" },
    actionBeats: [{ startSec: 0, endSec: 6, action: "Reconnect wire", speechType: "dialogue", speechDelivery: "onscreen_lipsync", speaker: "Mai", dialogue: "Tôi sẽ sửa nó ngay." }],
    referenceRequirementIds: ["char-mai", "garage", "radio"]
  };
  return { result, scene, shot };
}

test("story package validation preserves one causal contract from narrative through shot", () => {
  const { result, scene, shot } = packageFixture();
  const context = validateNarrativePackage(result, true);
  const sceneContext = validateScenePackage({ scene, sceneIndex: 0, requiresScreenplayV2: true, contractBeatIds: context.contractBeatIds, requirementById: context.requirementById });
  const shotBeatIds = validateScreenplayShot({ shot, scene, sceneIndex: 0, shotIndex: 0, contractBeatIds: context.contractBeatIds, contractBeatById: context.contractBeatById, allowedSpeakerNames: context.allowedSpeakerNames });
  validateShotReferences({ shot, sceneIndex: 0, shotIndex: 0, sceneRequirementIds: sceneContext.sceneRequirementIds, requirementById: context.requirementById });
  assert.deepEqual(shotBeatIds, ["B1"]);
  assert.doesNotThrow(() => assertContractCoverage(context.contractBeatIds, new Set(sceneContext.sceneContractBeatIds), new Set(shotBeatIds)));
});

test("story package validation rejects voice drift and action-beat gaps before import", () => {
  const { result, scene, shot } = packageFixture();
  const context = validateNarrativePackage(result, true);
  shot.actionBeats[0].speaker = "Unknown";
  assert.throws(() => validateScreenplayShot({ shot, scene, sceneIndex: 0, shotIndex: 0, contractBeatIds: context.contractBeatIds, contractBeatById: context.contractBeatById, allowedSpeakerNames: context.allowedSpeakerNames }), /allowed stable speaker/);
  shot.actionBeats[0].speaker = "Mai";
  shot.actionBeats[0].endSec = 4;
  assert.throws(() => validateScreenplayShot({ shot, scene, sceneIndex: 0, shotIndex: 0, contractBeatIds: context.contractBeatIds, contractBeatById: context.contractBeatById, allowedSpeakerNames: context.allowedSpeakerNames }), /cover 0 through durationSec/);
});
