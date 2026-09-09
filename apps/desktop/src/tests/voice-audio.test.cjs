const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateSpeechDurationSeconds, locateShotOnSequence, locateSpeechOnSequence, validateVoiceRender } = require("../main/voice-audio.cjs");

const voiceProfile = { locked: true, voiceId: "Linh", voiceName: "Linh", speakingRateWpm: 150 };

test("speech budget blocks a line before rendering when it cannot fit", () => {
  const text = "một hai ba bốn năm sáu bảy tám chín mười mười một mười hai";
  assert.ok(estimateSpeechDurationSeconds(text, 150) > 3);
  assert.throws(() => validateVoiceRender({ text, voiceProfile, delivery: "internal_voice", speechType: "inner_monologue", availableDurationSec: 3 }), /Shorten the line or extend/);
});

test("delivery modes remain semantically distinct and require a locked voice", () => {
  assert.equal(validateVoiceRender({ text: "Mình phải đi tiếp.", voiceProfile, delivery: "internal_voice", speechType: "inner_monologue", availableDurationSec: 4 }).kind, "internal_voice");
  assert.equal(validateVoiceRender({ text: "Tin nhắn đã kết thúc.", voiceProfile, delivery: "recording", speechType: "dialogue", recordingSource: "radio on desk", availableDurationSec: 4 }).kind, "recording");
  assert.throws(() => validateVoiceRender({ text: "Tin nhắn", voiceProfile, delivery: "recording", speechType: "dialogue", availableDurationSec: 4 }), /device\/source/);
  assert.throws(() => validateVoiceRender({ text: "Xin chào", voiceProfile: { ...voiceProfile, locked: false }, delivery: "offscreen_voiceover", speechType: "narration", availableDurationSec: 4 }), /Lock an exact character voice/);
});

test("shot audio timing follows persisted edit order and split duration", () => {
  const location = locateShotOnSequence({ clips: [
    { shotId: "shot_a", order: 0, timelineDurationSec: 2 },
    { shotId: "shot_b", order: 1, timelineDurationSec: 3 },
    { shotId: "shot_b", order: 2, timelineDurationSec: 1 }
  ] }, "shot_b");
  assert.deepEqual(location, { timelineStartSec: 2, availableDurationSec: 4 });
});

test("speech timing starts at the authored spoken beat instead of the shot boundary", () => {
  const location = locateSpeechOnSequence({ clips: [
    { shotId: "shot_a", order: 0, timelineDurationSec: 8 },
    { shotId: "shot_b", order: 1, timelineDurationSec: 8 }
  ] }, {
    id: "shot_b",
    durationSec: 8,
    actionBeats: [
      { startSec: 0, endSec: 4, speechType: "silent", dialogue: "" },
      { startSec: 4, endSec: 8, speechType: "narration", dialogue: "The light returns." }
    ]
  });
  assert.deepEqual(location, { timelineStartSec: 12, availableDurationSec: 4 });
});
