import type { Shot } from "@studio/types";

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function speakerLabel(shot: Shot, speaker?: string) {
  return clean(speaker || shot.speaker) || "Nhân vật";
}

function readableAction(value: unknown) {
  const action = clean(value);
  if (!action) return "Giữ nguyên vị trí và trạng thái.";
  if (/^maintain the inherited physical state/i.test(action)) {
    return "Giữ nguyên vị trí và trạng thái trong lúc nhân vật nói.";
  }
  if (/^do not begin the dependent action/i.test(action)) {
    return "Chưa bắt đầu hành động phụ thuộc.";
  }
  return action;
}

/** Human-readable spoken exchange, retaining speaker ownership from the shot contract. */
export function shotDialogueLines(shot: Shot) {
  const beats = (shot.actionBeats || []).filter((beat) => clean(beat.dialogue));
  if (beats.length) return beats.map((beat) => `${speakerLabel(shot, beat.speaker)}: “${clean(beat.dialogue)}”`).join("\n");
  const line = clean(shot.dialogue);
  // An action-only shot needs no explanatory placeholder in the card. The
  // editable narrative still communicates the absence of dialogue implicitly.
  return line ? `${speakerLabel(shot)}: “${line}”` : "";
}

/** Editable, human-readable action/dialogue narrative for the selected shot. */
export function shotTimelineNotes(shot: Shot) {
  const beats = shot.actionBeats || [];
  if (!beats.length) {
    const action = readableAction(shot.motion || shot.description) || "Chưa có diễn biến.";
    return `1. Hành động\n${action}`;
  }
  const fallbackLine = clean(shot.dialogue);
  const hasBeatDialogue = beats.some((beat) => clean(beat.dialogue));
  return beats.map((beat, index) => {
    const action = readableAction(beat.action);
    const line = clean(beat.dialogue) || (!hasBeatDialogue && index === 0 ? fallbackLine : "");
    const label = beat.beatFunction === "reaction" ? "Phản ứng" : beat.beatFunction === "hold" ? "Giữ trạng thái" : "Hành động";
    return [
      `${index + 1}. ${label}`,
      action,
      line ? `Lời thoại — ${speakerLabel(shot, beat.speaker)}\n“${line}”` : ""
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

/** Parse the editable narrative back into beat-level fields without flattening its structure. */
export function parseShotTimelineNotes(value: string) {
  return value.split(/\n\s*\n/).map((block) => {
    const actionMatch = block.match(/^\s*\d+\.\s*(Hành động|Phản ứng|Giữ trạng thái)\s*(?::\s*(.*))?$/m);
    const actionLines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const actionLineIndex = actionMatch ? actionLines.findIndex((line) => line.includes(actionMatch[0].trim())) : -1;
    const dialogueMatch = block.match(/^\s*Lời thoại\s*[—-]\s*([^:\n]+)\s*(?::\s*[“"]([^”"]+)[”"]\s*)?$/m);
    const quotedLine = block.match(/[“"]([^”"]+)[”"]/);
    const action = actionMatch?.[2]?.trim() || (actionLineIndex >= 0 ? actionLines[actionLineIndex + 1] : "");
    const beatFunction = (actionMatch?.[1] === "Phản ứng" ? "reaction" : actionMatch?.[1] === "Giữ trạng thái" ? "hold" : dialogueMatch ? "dialogue" : "action") as "reaction" | "hold" | "dialogue" | "action";
    return {
      action,
      speaker: dialogueMatch?.[1]?.trim() || "",
      dialogue: dialogueMatch?.[2]?.trim() || quotedLine?.[1]?.trim() || "",
      beatFunction
    };
  }).filter((beat) => beat.action || beat.dialogue);
}

const CAMERA_CONTROL_MATCHES: ReadonlyArray<readonly [string[], string]> = [
  [["zoom out", "zoom-out", "lùi"], "zoom_out"],
  [["zoom", "đẩy vào", "push"], "zoom_in"],
  [["pan left", "trái"], "pan_left"],
  [["pan right", "phải"], "pan_right"],
  [["tilt up", "lên"], "tilt_up"],
  [["tilt down", "xuống"], "tilt_down"],
  [["track", "dõi"], "track"]
];

const includesAny = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));

export function compactCameraControl(value: string) {
  const text = clean(value).toLowerCase();
  return CAMERA_CONTROL_MATCHES.find(([terms]) => includesAny(text, terms))?.[1] || "lock";
}

export const CAMERA_CONTROLS = ["lock", "zoom_in", "zoom_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "track"] as const;
export const CAMERA_CONTROL_LABELS: Record<typeof CAMERA_CONTROLS[number], string> = {
  lock: "Khóa khung",
  zoom_in: "Zoom vào",
  zoom_out: "Zoom ra",
  pan_left: "Pan trái",
  pan_right: "Pan phải",
  tilt_up: "Tilt lên",
  tilt_down: "Tilt xuống",
  track: "Bám theo"
};

export const CAMERA_FRAMINGS = ["wide", "medium", "medium_close", "close_up", "detail"] as const;
export const CAMERA_FRAMING_LABELS: Record<typeof CAMERA_FRAMINGS[number], string> = {
  wide: "Toàn cảnh", medium: "Trung cảnh", medium_close: "Trung cận", close_up: "Cận cảnh", detail: "Cận chi tiết"
};
export const CAMERA_ANGLES = ["eye_level", "low_angle", "high_angle"] as const;
export const CAMERA_ANGLE_LABELS: Record<typeof CAMERA_ANGLES[number], string> = {
  eye_level: "Ngang mắt", low_angle: "Góc thấp", high_angle: "Góc cao"
};

export function compactCameraFraming(value: string) {
  const text = clean(value).toLowerCase();
  if (text.includes("detail") || text.includes("chi tiết")) return "detail" as const;
  if (text.includes("medium close") || text.includes("medium_close") || text.includes("trung cận")) return "medium_close" as const;
  if (text.includes("close") || text.includes("cận")) return "close_up" as const;
  if (text.includes("wide") || text.includes("toàn")) return "wide" as const;
  return "medium" as const;
}

export function compactCameraAngle(value: string) {
  const text = clean(value).toLowerCase();
  if (text.includes("low") || text.includes("thấp")) return "low_angle" as const;
  if (text.includes("high") || text.includes("cao")) return "high_angle" as const;
  return "eye_level" as const;
}

export function cameraTarget(value: string) {
  const match = clean(value).match(/(?:target|nhìn vào|đối tượng)\s*:\s*(.+)$/i);
  return match ? clean(match[1]) : "";
}

export function composeCamera(framing: string, angle: string, control: string, target = "") {
  return `${framing}, ${angle}, ${control}${clean(target) ? `, target: ${clean(target)}` : ""}`;
}
