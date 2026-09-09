import type { Shot, SkillPack } from "@studio/types";

/**
 * Normalize authored shot text for the provider contract without truncating it.
 *
 * The previous implementation appended an ellipsis after a character limit.
 * That was appropriate for a UI preview, but this function feeds the actual
 * Flow prompt. It silently changed the user's action, camera, and voice
 * instructions and could leave the runtime contract mid-sentence.
 */
function normalizePromptField(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

export function skillStageContent(skill: SkillPack, stage: SkillPack["pipelineStages"][number]) {
  const normalized = skill.content.replace(/\r/g, "").trim();
  const sectionPattern = new RegExp(`^##\\s+${stage}\\s*$`, "im");
  const sectionMatch = sectionPattern.exec(normalized);
  if (!sectionMatch) return "";
  const sectionStart = sectionMatch.index + sectionMatch[0].length;
  const remainder = normalized.slice(sectionStart);
  const nextSection = remainder.search(/^##\s+/m);
  return remainder.slice(0, nextSection >= 0 ? nextSection : undefined).trim();
}

export function skillInstructionForStage(
  skill: SkillPack | undefined,
  stage: SkillPack["pipelineStages"][number],
  maxLength = 1800
) {
  if (!skill || !skill.pipelineStages.includes(stage)) return "";
  const stageContent = skillStageContent(skill, stage);
  if (!stageContent) return "";
  const content = stageContent.length > maxLength
    ? `${stageContent.slice(0, maxLength).trim()}\n[skill guidance truncated]`
    : stageContent;
  return `\n\n[SELECTED VIDEO SKILL: ${skill.name} v${skill.version} | ${stage}]\n${content}`;
}

function speechInstruction(shot: Shot, outputLanguage: string, line: string, beatSpeaker: string, delivery: string, voiceDirection: string) {
  if (!line.trim()) return "Silent; no spoken words or lip movement.";
  if (delivery === "none") return "Speech source is unresolved; do not create speech or lip movement.";
  const source = delivery === "recording"
    ? `The line plays only from ${normalizePromptField(shot.recordingSource || "the visible recording device")}; no character lip-sync.`
    : delivery === "internal_voice"
      ? "Internal voice only; every visible mouth remains closed."
      : delivery === "offscreen_voiceover"
        ? "Off-screen voiceover; no visible lip-sync."
        : `Only ${beatSpeaker || "the named visible speaker"} speaks with natural onscreen lip-sync.`;
  return `${source}${voiceDirection ? ` Voice continuity: ${voiceDirection}.` : ""} Exact ${outputLanguage} line: “${normalizePromptField(line)}”`;
}

function actionBeatPlan(shot: Shot, context: { action: string; camera: string; speaker: string; speechDelivery: string; voiceDirection: string; outputLanguage: string }) {
  const { action, camera, speaker, speechDelivery, voiceDirection, outputLanguage } = context;
  if (!shot.actionBeats?.length) {
    const performance = normalizePromptField(shot.motion || "");
    return `0.0-${shot.durationSec.toFixed(1)}s: ${performance || action} Camera: ${camera || "Locked camera."} ${speechInstruction(shot, outputLanguage, shot.dialogue?.trim() || "", speaker, speechDelivery, voiceDirection)}`;
  }
  return shot.actionBeats.map((beat) => {
    const beatAction = normalizePromptField(beat.action);
    const beatCamera = normalizePromptField(beat.camera || camera || "Locked camera.");
    const delivery = beat.speechDelivery || (beat.speechType === "silent" ? "none" : speechDelivery);
    const speech = speechInstruction(shot, outputLanguage, beat.dialogue || "", normalizePromptField(beat.speaker || speaker), delivery, voiceDirection);
    return `${beat.startSec.toFixed(1)}-${beat.endSec.toFixed(1)}s: ${beatAction === action ? "Execute the dominant action above." : beatAction} Camera: ${beatCamera === camera ? "Keep the camera setup above." : beatCamera} ${speech}`;
  }).join("\n");
}

export function buildVideoGenerationPrompt({
  shot,
  outputLanguage = "Vietnamese",
  sourceMode = "components"
}: {
  shot: Shot;
  outputLanguage?: string;
  sourceMode?: "components" | "frames";
}) {
  const fields = videoPromptFields(shot, sourceMode);
  const { sourceLabel, action, performance, camera, initialState, finalState, voiceDirection, speechDelivery, speaker } = fields;
  const beatPlan = actionBeatPlan(shot, { action, camera, speaker, speechDelivery, voiceDirection, outputLanguage });

  return `Create one ${shot.durationSec}-second image-to-video shot from the ${sourceLabel}. Use it as the exact opening frame and visual source of truth.
Spoken language: ${outputLanguage}. Keep every spoken word in this language; do not translate or switch language.
Initial action state: ${initialState}
Dominant action: ${action}
${performance && performance !== action ? `Performance and motion: ${performance}\n` : ""}Camera: ${camera || "Locked camera; no cut or reframing."}
Timeline:
${beatPlan}
Final handoff state: ${finalState}
Generate one continuous video shot only. Preserve everything already visible unless the dominant action explicitly changes it. Do not add a cut, extra action, new person, new prop, subtitle, speech, or later consequence.`;
}

function videoPromptFields(shot: Shot, sourceMode: "components" | "frames") {
  return {
    sourceLabel: sourceMode === "frames" ? "approved start frame" : "attached approved keyframe",
    action: normalizePromptField(shot.dominantAction || shot.motion || shot.description),
    performance: normalizePromptField(shot.motion || ""),
    camera: normalizePromptField(shot.camera),
    initialState: normalizePromptField(shot.continuityContract?.incomingState || shot.transitionIn || "Begin exactly from the approved keyframe."),
    finalState: normalizePromptField(shot.continuityContract?.outgoingState || shot.transitionOut || "Hold on the completed dominant action."),
    voiceDirection: normalizePromptField(shot.audioContract?.voiceDirection || ""),
    speechDelivery: shot.speechDelivery || "none",
    speaker: normalizePromptField(shot.speaker || "")
  };
}
