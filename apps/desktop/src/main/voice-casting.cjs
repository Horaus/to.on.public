const LANGUAGE_LOCALES = {
  Vietnamese: ["vi_VN"], vi: ["vi_VN"],
  English: ["en_US", "en_GB", "en_AU", "en_IN"], en: ["en_US", "en_GB", "en_AU", "en_IN"],
  Japanese: ["ja_JP"], ja: ["ja_JP"],
  Korean: ["ko_KR"], Chinese: ["zh_CN", "zh_TW", "zh_HK"], Thai: ["th_TH"], Indonesian: ["id_ID"],
  Spanish: ["es_ES", "es_MX"], French: ["fr_FR", "fr_CA"]
};

function parseMacosVoiceCatalog(output = "") {
  return String(output).split("\n")
    .map((line) => line.match(/^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})\s+#/))
    .filter(Boolean)
    .map((match) => ({ id: match[1].trim(), name: match[1].trim(), locale: match[2] }));
}

function inferredGender(character = {}) {
  const text = [character.name, character.visualBrief, character.voiceBrief].join(" ").toLowerCase();
  const words = new Set(text.match(/\p{L}+/gu) || []);
  if (["female", "woman", "girl", "mother", "sister", "wife", "nữ", "cô", "chị", "bà", "mẹ", "vợ"].some((token) => words.has(token))) return "female";
  if (["male", "man", "boy", "father", "brother", "husband", "nam", "anh", "ông", "cha", "bố", "chồng"].some((token) => words.has(token))) return "male";
  return "neutral";
}

function macosPitchBaseForCharacter(character = {}, characterIndex = 0) {
  const gender = inferredGender(character);
  if (gender === "male") return -20;
  if (gender === "female") return [4, 12, 8][characterIndex % 3];
  return [-6, 6, 0][characterIndex % 3];
}

function macosVoiceSignature({ voiceId, speakingRateWpm, outputLanguage, pitchBase = 0 }) {
  return `${voiceId}:${speakingRateWpm}:${outputLanguage}:pbas${pitchBase >= 0 ? "+" : ""}${pitchBase}`;
}

function speechTextForMacos(text, pitchBase = 0) {
  const safeText = String(text || "").replace(/\[\[/g, "[").replace(/\]\]/g, "]");
  const normalizedPitch = Math.max(-30, Math.min(30, Number(pitchBase) || 0));
  return `[[pbas ${normalizedPitch >= 0 ? "+" : ""}${normalizedPitch}]] ${safeText}`;
}

function autoCastMacosVoice({ outputLanguage = "Vietnamese", character = {}, characterIndex = 0, catalog = [], timestamp = new Date().toISOString() }) {
  const locales = LANGUAGE_LOCALES[outputLanguage] || [];
  const voices = catalog.filter((voice) => locales.includes(voice.locale));
  if (!voices.length) return undefined;
  const voice = voices[characterIndex % voices.length];
  const speakingRateWpm = [138, 154, 170, 146, 162][characterIndex % 5];
  const pitchBase = macosPitchBaseForCharacter(character, characterIndex);
  return {
    provider: "macos", voiceId: voice.id, voiceName: voice.name, modelId: "macos-say", language: outputLanguage,
    defaultDelivery: character.audibleOnly ? "offscreen_voiceover" : "onscreen_lipsync", speakingRateWpm, pitchBase,
    locked: true, lockedAt: timestamp, gender: inferredGender(character),
    styleLabel: String(character.voiceBrief || "Stable auto-cast production voice").trim(),
    castingSource: "auto_cast", castingStatus: "auto_assigned",
    voiceSignature: macosVoiceSignature({ voiceId: voice.id, speakingRateWpm, outputLanguage, pitchBase })
  };
}

function upgradeAutoCastMacosProfile({ profile, character = {}, characterIndex = 0 }) {
  if (!profile || profile.provider !== "macos" || profile.castingSource !== "auto_cast") return profile;
  const pitchBase = macosPitchBaseForCharacter(character, characterIndex);
  const voiceSignature = macosVoiceSignature({
    voiceId: profile.voiceId,
    speakingRateWpm: profile.speakingRateWpm || 150,
    outputLanguage: profile.language || "Vietnamese",
    pitchBase
  });
  if (Number(profile.pitchBase) === pitchBase && profile.voiceSignature === voiceSignature) return profile;
  return {
    ...profile,
    pitchBase,
    voiceSignature
  };
}

module.exports = { LANGUAGE_LOCALES, parseMacosVoiceCatalog, inferredGender, macosPitchBaseForCharacter, macosVoiceSignature, speechTextForMacos, autoCastMacosVoice, upgradeAutoCastMacosProfile };
