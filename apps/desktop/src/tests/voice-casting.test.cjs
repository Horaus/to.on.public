const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMacosVoiceCatalog, autoCastMacosVoice, speechTextForMacos, upgradeAutoCastMacosProfile } = require("../main/voice-casting.cjs");

test("voice casting selects an installed locale voice and persists a stable signature", () => {
  const catalog = parseMacosVoiceCatalog("Linh                vi_VN    # Xin chào! Tên tôi là Linh.\nSamantha            en_US    # Hello.");
  const first = autoCastMacosVoice({ outputLanguage: "Vietnamese", character: { name: "Mai", voiceBrief: "Nữ trưởng thành, giọng Bắc rõ ràng" }, characterIndex: 0, catalog, timestamp: "2026-08-11T00:00:00.000Z" });
  const repeated = autoCastMacosVoice({ outputLanguage: "Vietnamese", character: { name: "Mai", voiceBrief: "Nữ trưởng thành, giọng Bắc rõ ràng" }, characterIndex: 0, catalog, timestamp: "2026-08-11T00:00:00.000Z" });
  assert.equal(first.provider, "macos");
  assert.equal(first.voiceId, "Linh");
  assert.equal(first.gender, "female");
  assert.equal(first.pitchBase, 4);
  assert.equal(first.castingStatus, "auto_assigned");
  assert.equal(first.voiceSignature, repeated.voiceSignature);
});

test("voice casting accepts persisted language codes", () => {
  const voice = autoCastMacosVoice({ outputLanguage: "vi", character: { name: "Mai" }, catalog: [{ id: "Linh", name: "Linh", locale: "vi_VN" }] });
  assert.equal(voice?.voiceId, "Linh");
});

test("one installed locale voice becomes executable gender-aware timbre signatures", () => {
  const catalog = [{ id: "Linh", name: "Linh", locale: "vi_VN" }];
  const female = autoCastMacosVoice({ outputLanguage: "Vietnamese", character: { name: "Mai", voiceBrief: "Nữ kỹ sư" }, characterIndex: 0, catalog });
  const male = autoCastMacosVoice({ outputLanguage: "Vietnamese", character: { name: "Nam", voiceBrief: "Nam bảo vệ" }, characterIndex: 1, catalog });
  assert.equal(female.pitchBase, 4);
  assert.equal(male.pitchBase, -20);
  assert.notEqual(female.voiceSignature, male.voiceSignature);
  assert.match(speechTextForMacos("Xin [[rate 999]] chào", male.pitchBase), /^\[\[pbas -20\]\]/);
  assert.doesNotMatch(speechTextForMacos("Xin [[rate 999]] chào", male.pitchBase), /\[\[rate 999\]\]/);
});

test("two female speakers sharing one installed voice still receive distinct executable signatures", () => {
  const catalog = [{ id: "Linh", name: "Linh", locale: "vi_VN" }];
  const lead = autoCastMacosVoice({ outputLanguage: "Vietnamese", character: { name: "Mai", voiceBrief: "Nữ kỹ sư" }, characterIndex: 0, catalog });
  const radio = autoCastMacosVoice({ outputLanguage: "Vietnamese", character: { name: "Lan", voiceBrief: "Nữ bác sĩ qua bộ đàm", audibleOnly: true }, characterIndex: 2, catalog });
  assert.equal(radio.pitchBase, 8);
  assert.equal(radio.defaultDelivery, "offscreen_voiceover");
  assert.notEqual(lead.voiceSignature, radio.voiceSignature);
});

test("legacy auto-cast profiles upgrade without changing manually locked voices", () => {
  const legacy = { provider: "macos", voiceId: "Linh", language: "Vietnamese", speakingRateWpm: 154, castingSource: "auto_cast", locked: true };
  const upgraded = upgradeAutoCastMacosProfile({ profile: legacy, character: { voiceBrief: "Nam trung niên" }, characterIndex: 1 });
  assert.equal(upgraded.pitchBase, -20);
  assert.match(upgraded.voiceSignature, /pbas-20$/);
  const manual = { ...legacy, castingSource: "manual" };
  assert.equal(upgradeAutoCastMacosProfile({ profile: manual, character: { voiceBrief: "Nam" }, characterIndex: 1 }), manual);
});

test("voice casting does not fake an executable voice when the requested language is unavailable", () => {
  const catalog = [{ id: "Linh", name: "Linh", locale: "vi_VN" }];
  assert.equal(autoCastMacosVoice({ outputLanguage: "Japanese", character: { name: "Aki" }, catalog }), undefined);
});
