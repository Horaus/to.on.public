import type { Character, ProjectIntake, Scene, Shot, StyleBible, VisualReference } from "@studio/types";
import { formatLabel } from "@studio/domain/labels";

type VideoAspectRatio = NonNullable<ProjectIntake["videoFrame"]>["aspectRatio"];

function promptText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

function continuityEntityText(entity: NonNullable<NonNullable<Shot["continuityContract"]>["entities"]>[number]) {
  return `${entity.id}: side=${promptText(entity.screenSide, "unchanged")}, owner=${promptText(entity.owner, "unchanged")}, anchor=${promptText(entity.anchor, "fixed scene anchor")}, state=${entity.state}`;
}

export function buildPrompt(style: StyleBible, character: Character, scene: Scene, shot: Shot, aspectRatio: VideoAspectRatio = "9:16", outputLanguage = "Vietnamese") {
  const continuityEntities = promptText(shot.continuityContract?.entities?.map(continuityEntityText).join("\n"), "No structured entity state supplied.");
  return `[STYLE]
${style.visualStyle}
Palette: ${style.colorPalette}
Texture: ${style.texture}
Lighting: ${style.lighting}

[CHARACTER BASELINE]
${character.name}, ${character.role}. ${character.visualDescription}
Baseline identity/outfit: ${character.outfit}
Face: ${character.face}
Continuity: ${character.consistencyNotes}
The resolved scene wardrobe and shot continuity state below override any baseline prop or accessory state.

[SCENE RESOLVED STATE]
${scene.title}: ${scene.summary}
Location: ${scene.location}. Time: ${scene.timeOfDay}. Tone: ${scene.emotionalTone}.
Setting: ${promptText(scene.settingDescription, scene.location)}.
Wardrobe/accessory state: ${promptText(scene.wardrobeState, "Preserve the incoming state.")}
Required story props: ${promptText(scene.requiredProps?.join(", "), "None.")}

[VIDEO TASK]
Animate the attached start frame into one ${aspectRatio} video shot. Do not create a storyboard sheet, storyboard thumbnail, comic panel, speech bubble, or new still image. Use the attached frame as the exact first frame and preserve its composition, character identity, outfit, props, location, palette, and camera framing.

[LANGUAGE]
Production language: ${outputLanguage}.
Any spoken dialogue, narration, lip-sync, voiceover, readable prop text, or subtitle-like content must stay in ${outputLanguage}. Do not switch to English unless the shot dialogue explicitly contains English.

[START FRAME]
The attached image is the first frame source of truth.
Visible action to preserve: ${shot.description}
Scene continuity: ${scene.location}, ${scene.timeOfDay}, ${scene.emotionalTone}.

[SHOT ACTION]
Dominant action: ${promptText(shot.dominantAction, shot.description)}
Visible description: ${shot.description}

[CONTINUITY CONTRACT]
Geography: ${promptText(shot.continuityContract?.geography, promptText(shot.screenDirection, "Preserve established geography."))}
Incoming state: ${promptText(shot.continuityContract?.incomingState, promptText(shot.transitionIn, "Inherit the previous shot."))}
Outgoing state: ${promptText(shot.continuityContract?.outgoingState, promptText(shot.transitionOut, "End on the authored visible state."))}
Fixed anchors: ${promptText(shot.continuityContract?.fixedAnchors?.join(", "), "Keep fixed furniture, counters, tables and doors in their established world positions.")}
Screen direction: ${promptText(shot.screenDirection, "Preserve the established axis.")}
Entities:
${continuityEntities}

[DIALOGUE / VOICEOVER]
Mode: ${promptText(shot.speechType, "silent")}. Delivery: ${promptText(shot.speechDelivery, "none")}. Speaker: ${promptText(shot.speaker, "none")}.
${promptText(shot.dialogue, `No spoken line is specified. Keep this shot silent or use only non-verbal ambient motion. Do not invent English dialogue.`)}

[CAMERA]
${shot.camera}

[VIDEO MOTION]
${shot.motion}
Duration: ${shot.durationSec} seconds.
Motion should be simple, readable, and possible from the keyframe.

[MOTION RULE]
${style.motionRules}

[REFERENCE RULE]
Use the approved locked character and style references as identity constraints. Preserve face, silhouette, outfit, palette, material, and role continuity.
For state variants, the mapped scene/shot reference and continuity contract override the baseline image. Never restore an accessory or prop to an earlier state.

[NEGATIVE]
${style.negativeStyle}
${character.negativeTraits}`;
}

export function buildReferencePromptBlock(references: VisualReference[]) {
  if (!references.length) return "";
  return `\n\n[VISUAL REFERENCES]\n${references.map((item) =>
    `${item.name} (${formatLabel(item.role)}, ${formatLabel(item.referenceUse || "supporting_detail")}${item.characterSlot ? `, mapped to ${item.characterSlot}` : ""}): ${item.sourceDescription || "Use attached image as source of truth."} Transformation: ${item.transformationRequest || "Preserve visible identity."}`
  ).join("\n")}`;
}
