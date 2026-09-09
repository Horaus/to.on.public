function speechWordCount(text = "") {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function estimateSpeechDurationSeconds(text, speakingRateWpm = 150) {
  const rate = Math.max(80, Math.min(240, Number(speakingRateWpm) || 150));
  return Math.round(((speechWordCount(text) / rate) * 60 + 0.35) * 100) / 100;
}

function audioKindForDelivery(delivery, speechType) {
  if (delivery === "internal_voice" || speechType === "inner_monologue") return "internal_voice";
  if (delivery === "offscreen_voiceover" && speechType === "narration") return "narration";
  if (delivery === "recording") return "recording";
  return "dialogue";
}

function locateShotOnSequence(sequence, shotId) {
  let cursor = 0;
  let start;
  let duration = 0;
  for (const clip of [...(sequence?.clips || [])].sort((a, b) => a.order - b.order)) {
    if (clip.shotId === shotId) {
      if (start === undefined) start = cursor;
      duration += Number(clip.timelineDurationSec) || 0;
    }
    cursor += Number(clip.timelineDurationSec) || 0;
  }
  return start === undefined ? undefined : { timelineStartSec: start, availableDurationSec: duration };
}

function locateSpeechOnSequence(sequence, shot) {
  const shotPosition = locateShotOnSequence(sequence, shot?.id);
  if (!shotPosition) return undefined;
  const spokenBeats = (shot?.actionBeats || []).filter((beat) =>
    String(beat.dialogue || "").trim() || (beat.speechType && beat.speechType !== "silent")
  );
  if (!spokenBeats.length) return shotPosition;
  const authoredStart = Math.max(0, Math.min(...spokenBeats.map((beat) => Number(beat.startSec) || 0)));
  const authoredEnd = Math.min(
    Number(shot.durationSec) || shotPosition.availableDurationSec,
    Math.max(...spokenBeats.map((beat) => Number(beat.endSec) || 0))
  );
  const availableDurationSec = Math.max(0, Math.min(shotPosition.availableDurationSec - authoredStart, authoredEnd - authoredStart));
  return {
    timelineStartSec: shotPosition.timelineStartSec + authoredStart,
    availableDurationSec
  };
}

function validateVoiceRender({ text, voiceProfile, delivery, speechType, availableDurationSec, recordingSource }) {
  if (!String(text || "").trim()) throw new Error("Voice render requires performable text.");
  if (!voiceProfile?.locked || !voiceProfile.voiceId) throw new Error("Lock an exact character voice before rendering dialogue.");
  if (delivery === "none") throw new Error("A silent shot cannot create a voice clip.");
  if (delivery === "recording" && !String(recordingSource || "").trim()) throw new Error("Recording delivery requires the visible or named device/source that emits the voice.");
  const estimatedDurationSec = estimateSpeechDurationSeconds(text, voiceProfile.speakingRateWpm);
  if (Number.isFinite(availableDurationSec) && estimatedDurationSec > availableDurationSec) {
    throw new Error(`Speech needs about ${estimatedDurationSec}s but the edit allows ${availableDurationSec}s. Shorten the line or extend the clip before rendering.`);
  }
  return { estimatedDurationSec, wordCount: speechWordCount(text), kind: audioKindForDelivery(delivery, speechType) };
}

module.exports = { speechWordCount, estimateSpeechDurationSeconds, audioKindForDelivery, locateShotOnSequence, locateSpeechOnSequence, validateVoiceRender };
