function createStoryPolicies({ providerCatalog }) {
  function projectVideoDurationPolicy(project) {
    const providerId = project.intake?.aiRouting?.videoProvider || "google-flow-web";
    // Persisted projects may use either the UI alias (`google-flow`) or the
    // adapter id (`google-flow-web`). Treat both as the same duration policy;
    // otherwise a fresh YOLO project silently falls back to arbitrary rounded
    // durations and strict shot-packet totals reject valid provider output.
    const platform = providerCatalog.find((provider) => provider.id === providerId)?.platform
      || (providerId === "google-flow" || providerId === "google-flow-web" ? "google-flow" : undefined);
    if (platform === "google-flow" || platform === "elevenlabs-flows") {
      return { supportedDurationsSec: [4, 6, 8, 10], preferredDurationSec: 8 };
    }
    return { supportedDurationsSec: [], preferredDurationSec: 6 };
  }

  function normalizeProjectShotDuration(project, durationSec) {
    const policy = projectVideoDurationPolicy(project);
    const requested = Number.isFinite(Number(durationSec)) && Number(durationSec) > 0 ? Number(durationSec) : policy.preferredDurationSec;
    if (policy.supportedDurationsSec.length === 0) return Math.max(1, Math.round(requested));
    return policy.supportedDurationsSec.find((duration) => requested <= duration) ?? policy.supportedDurationsSec.at(-1);
  }

  function recommendedProjectShotCount(project, targetDurationSec) {
    const narrativeMinimum = targetDurationSec >= 20 ? 3 : 1;
    return Math.max(narrativeMinimum, Math.round(targetDurationSec / projectVideoDurationPolicy(project).preferredDurationSec));
  }

  return { projectVideoDurationPolicy, normalizeProjectShotDuration, recommendedProjectShotCount };
}

function isPredominantlyEnglishShotProse(value) {
  const words = String(value || "").toLowerCase().match(/[a-zÀ-ỹ]+/g) || [];
  if (words.length < 5) return false;
  const englishMarkers = new Set(["the", "and", "with", "from", "into", "while", "without", "her", "his", "their", "she", "he", "holds", "moves", "lowers", "raises", "keeps", "camera", "close", "against", "toward", "opening", "button", "hand", "body", "moment"]);
  const vietnameseMarkers = new Set(["và", "của", "trong", "không", "với", "từ", "vào", "khi", "giữ", "hạ", "nâng", "tay", "máy", "nút", "cô", "anh", "chị", "người", "nhìn", "đứng"]);
  const englishScore = words.filter((word) => englishMarkers.has(word)).length;
  const vietnameseScore = words.filter((word) => vietnameseMarkers.has(word) || /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(word)).length;
  return englishScore >= 3 && englishScore > vietnameseScore * 1.5;
}

function assertShotAuthoredLanguage(project, shot, index) {
  if (!String(project.intake?.outputLanguage || "").toLowerCase().includes("vietnam")) return;
  const proseFields = ["description", "dominantAction", "camera", "motion"];
  const mismatched = proseFields.filter((field) => isPredominantlyEnglishShotProse(shot[field]));
  if (mismatched.length) throw new Error(`SHOT_LANGUAGE_MISMATCH: shot ${index + 1} must write ${mismatched.join(", ")} in Vietnamese.`);
}

function explicitGlobalVoiceDirection(sourceDraft) {
  const sentences = String(sourceDraft || "").split(/(?<=[.!?;\n])\s+/).map((value) => value.trim()).filter(Boolean);
  return sentences.find((sentence) =>
    /(?:giọng|phương ngữ|accent|dialect|regional voice)/i.test(sentence) &&
    /(?:nhất quán|xuyên suốt|mọi (?:nhân vật|người nói)|tất cả|consistent|throughout|all (?:characters|speakers))/i.test(sentence)
  ) || "";
}

function minimumAtomicCueGroupCount(screenplay) {
  const cues = [
    ...(screenplay.actionCues || []).map((cue, sourceIndex) => ({ ...cue, kind: "action", sourceIndex })),
    ...(screenplay.dialogueCues || []).map((cue, sourceIndex) => ({ ...cue, kind: "dialogue", sourceIndex: 1000 + sourceIndex })),
    ...(screenplay.soundCues || []).map((cue, sourceIndex) => ({ ...cue, kind: "sound", sourceIndex: 2000 + sourceIndex }))
  ].sort((left, right) => Number(left.sequenceOrder) - Number(right.sequenceOrder) || left.sourceIndex - right.sourceIndex);
  const groups = [];
  for (const cue of cues) {
    const current = groups.at(-1);
    const duplicatesAtomicKind = current?.some((item) => item.kind === cue.kind && (cue.kind === "action" || cue.kind === "dialogue"));
    if (!current || duplicatesAtomicKind) groups.push([cue]);
    else current.push(cue);
  }
  return groups.length;
}

module.exports = { createStoryPolicies, assertShotAuthoredLanguage, explicitGlobalVoiceDirection, minimumAtomicCueGroupCount };
