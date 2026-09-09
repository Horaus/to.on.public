import type { Character, Project, ProjectIntake, Scene, Shot, StyleBible, VisualReference } from "@studio/types";
import { formatLabel } from "@studio/domain/labels";
import { spatialContinuityInstruction } from "./spatial-continuity-contract";

type VideoAspectRatio = NonNullable<ProjectIntake["videoFrame"]>["aspectRatio"];

function defaultPromptContinuity(scene: Scene, previous?: Scene): NonNullable<Scene["continuityOverride"]> {
  const delta = scene.assetDelta;
  if (delta) {
    const readable = (value: unknown[] | undefined) => (value ?? []).map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("; ");
    return { mode: "override", wardrobeChanges: readable(delta.characterChanges as unknown[] | undefined), propChanges: readable(delta.propChanges as unknown[] | undefined), notes: delta.settingChange?.trim() || "" };
  }
  return previous ? { mode: "inherit", inheritFromSceneId: previous.id } : { mode: "override", wardrobeChanges: "", propChanges: "", notes: "" };
}

export function buildStoryboardScenePrompt({
  project,
  style,
  character,
  scene,
  shot,
  references,
  sceneCount,
  aspectRatio,
  isFirstScene,
  repairAspectRatio,
  continuityText
}: {
  project: Project;
  style: StyleBible;
  character: Character;
  scene: Scene;
  shot: Shot;
  references: VisualReference[];
  sceneCount: number;
  aspectRatio: VideoAspectRatio;
  isFirstScene: boolean;
  repairAspectRatio?: VideoAspectRatio;
  continuityText: string;
}) {
  const repairInstruction = repairAspectRatio
    ? `\n[RATIO REPAIR]\nUse the attached current storyboard image as the source composition, but recompose it into ${aspectRatio}. Preserve the same scene, character identity, props, camera intent, and action. Keep the old image concept; only fix the frame ratio and crop/composition.`
    : "";
  const scenePrompt = `[SCENE ${scene.order}/${sceneCount}]
Title: ${scene.title}
Purpose: ${scene.summary}
Location: ${scene.location}. Time: ${scene.timeOfDay}. Tone: ${scene.emotionalTone}.

[SCENE ASSET DELTA]
${continuityText}

${spatialContinuityInstruction()}

[STORYBOARD FRAME]
Create one compact storyboard frame for this scene, like a traditional storyboard thumbnail panel.
Frame ratio: ${aspectRatio}. Match this ratio exactly because this storyboard is the closest visual plan for the final video.
Frame action: ${shot.description}
Dialogue / voiceover intent: ${shot.dialogue || "No spoken line specified."}
Camera: ${shot.camera}
Motion hint for later video: ${shot.motion}

[OUTPUT]
Generate only one clear image for Scene ${scene.order}. Do not render speech bubbles, chat bubbles, subtitles, dialogue balloons, or large text overlays. Dialogue belongs to the production notes, not inside the image.${repairInstruction}`;
  if (!isFirstScene) {
    return `Continue the same storyboard sequence from this chat. Reuse the same characters, style, location logic, proportions, outfit rules, and visual continuity established in previous scene images. Do not re-explain or redesign the cast.\n\n${scenePrompt}`;
  }
  return `Create storyboard scene images for the AI video project "${project.name}".

Use the attached locked character/style references as identity and continuity source of truth.
First generate Scene 1 only. After this image is created, the app will send Scene 2 in the same chat so you can inherit the same character and setting context.

[PROJECT STORY]
${project.sourceDraft || project.description || "Use the existing scene breakdown as the source story."}

[STYLE]
${style.visualStyle}
Palette: ${style.colorPalette}
Texture: ${style.texture}
Lighting: ${style.lighting}
Exposure rule: keep the image clearly readable. A night setting may be moody, but must retain visible faces, props, walls, and spatial depth; never use near-black or crushed shadows.
Negative: ${style.negativeStyle}

[MAIN CHARACTER]
${character.name}, ${character.role}. ${character.visualDescription}
Outfit: ${character.outfit}
Continuity: ${character.consistencyNotes}

[REFERENCE PLAN]
${references.map((item) => `- ${item.name}: ${formatLabel(item.role)} / ${formatLabel(item.referenceUse || "supporting_detail")}. ${item.sourceDescription || "Use attached reference as source of truth."}`).join("\n") || "- No locked visual reference is attached; follow the written character/style bible."}

${scenePrompt}`;
}

type CleanKeyframePromptInput = {
  project: Project;
  style: StyleBible;
  character: Character;
  scene: Scene;
  shot: Shot;
  references: VisualReference[];
  aspectRatio: VideoAspectRatio;
  sourceShot?: Shot;
  continuityText: string;
};

export function buildCleanShotKeyframePrompt(input: CleanKeyframePromptInput) {
  const { style, character, shot, references, sourceShot } = input;
  const sourceNote = sourceShot
    ? "Use the attached previous shot frame only as visual continuity for character identity, location, lighting, wardrobe, palette, and prop continuity. Do not copy its exact pose unless the new shot asks for it."
    : "Use the locked character/style references as continuity constraints.";
  const entityState = shot.continuityContract?.entities?.map((entity) =>
    `- ${entity.id}: side=${entity.screenSide || "unchanged"}; owner=${entity.owner || "unchanged"}; state=${entity.state}`
  ).join("\n") || "- No structured entity state supplied.";
  const useful = (value?: string) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return /^(?:Generated (?:directly )?from|Directly generated for)/i.test(text) ? "" : text;
  };
  const characterBaseline = [
    `${character.name}: ${useful(character.visualDescription)}`,
    useful(character.outfit) ? `Baseline outfit: ${useful(character.outfit)}` : "",
    useful(character.face) ? `Face: ${useful(character.face)}` : "",
    useful(character.consistencyNotes) ? `Continuity: ${useful(character.consistencyNotes)}` : "",
    "Apply resolved scene wardrobe and shot entity state as the authoritative current state."
  ].filter(Boolean).join(" ");
  const referenceLines = references.map((reference) => {
    const details = [useful(reference.sourceDescription), useful(reference.transformationRequest)].filter(Boolean).join(" ");
    return `[REFERENCE ${reference.referenceUse || "supporting_detail"}] ${reference.name}${details ? `: ${details}` : ""}`;
  }).join("\n");
  return [
    "Create one clean video start-frame key image.",
    keyframeSceneSection(input),
    keyframeShotSection(input),
    keyframeContinuitySection(input, entityState, sourceNote),
    keyframeOutputSection(input, characterBaseline, referenceLines)
  ].join("\n\n");
}

function keyframeSceneSection({ scene, continuityText }: CleanKeyframePromptInput) {
  return `[SCENE CONTEXT]
Scene ${scene.order}: ${scene.title}
Purpose: ${scene.summary}
Location: ${scene.location}. Time: ${scene.timeOfDay}. Tone: ${scene.emotionalTone}.
Resolved setting: ${scene.settingDescription || scene.location}.
Resolved wardrobe/accessory state: ${scene.wardrobeState || "Preserve incoming state."}
Required props: ${scene.requiredProps?.join(", ") || "None."}

[SCENE ASSET DELTA]
${continuityText}`;
}

function keyframeShotSection({ scene, shot, aspectRatio }: CleanKeyframePromptInput) {
  return `[SHOT START FRAME]
Shot ${shot.order}, duration ${shot.durationSec}s.
Frame ratio: ${aspectRatio}.
First-frame state to show exactly: ${shot.continuityContract?.incomingState || shot.transitionIn || scene.entryState || "The authored incoming scene state."}
Dominant action that begins only after this first frame: ${shot.dominantAction || shot.description}
Action brief for the later video, not a completed pose in this image: ${shot.description}
Camera: ${shot.camera}
Motion intent for later video: ${shot.motion}
Dialogue/voiceover intent for production notes only: ${shot.dialogue || "No spoken line specified."}`;
}

function keyframeContinuitySection({ shot }: CleanKeyframePromptInput, entityState: string, sourceNote: string) {
  return `[SHOT CONTINUITY CONTRACT]
Geography: ${shot.continuityContract?.geography || shot.screenDirection || "Preserve established geography."}
Fixed spatial anchors: ${shot.continuityContract?.fixedAnchors?.join(", ") || "Keep fixed furniture and props in the established world positions."}
Incoming state: ${shot.continuityContract?.incomingState || shot.transitionIn || "Inherit previous shot."}
Outgoing state to prepare: ${shot.continuityContract?.outgoingState || shot.transitionOut || "Prepare the authored handoff."}
Screen direction: ${shot.screenDirection || "Preserve established axis."}
Entity state at this cut:
${entityState}
Do not pre-complete the dominant action or depict the outgoing state in this start frame.

[CONTINUITY SOURCE]
${sourceNote}
Preserve character face, silhouette, outfit, role, scene palette, prop logic, and camera continuity.
The resolved scene/shot state above overrides baseline accessories or prop state from an identity reference. Never restore an earlier-state bow, wardrobe item, or prop.`;
}

function keyframeOutputSection({ shot, style }: CleanKeyframePromptInput, characterBaseline: string, referenceLines: string) {
  return `[OUTPUT RULES]
Generate exactly one clean image frame for Shot ${shot.order}. This is a video keyframe, not a storyboard page.
The image is frame zero. It must show the incoming state before the dominant action, unless the authored incoming state explicitly begins after an ellipsis.
Do not render speech bubbles, chat bubbles, captions, subtitles, labels, title cards, scene numbers, UI, watermarks, annotations, text boxes, arrows, comic panels, thumbnails, or written explanations.
Do not place dialogue or readable text inside the image. The frame must look like a clean production still.

[STYLE]
${style.visualStyle}
Palette: ${style.colorPalette}
Lighting: ${style.lighting}
Texture: ${style.texture}

[CHARACTER BASELINE]
${characterBaseline}

[NEGATIVE]
${style.negativeStyle}
No typography, no speech balloon, no subtitle, no caption, no product-label closeup with readable text, no extra infographic symbols, no decorative stickers.

${referenceLines}`;
}

export function resolvedSceneContinuity(scene: Scene, scenes: Scene[]) {
  const previousByOrder = [...scenes].filter((candidate) => candidate.order < scene.order).sort((a, b) => b.order - a.order)[0];
  const override = scene.continuityOverride ?? defaultPromptContinuity(scene, previousByOrder);
  if (override.mode === "inherit") {
    const previous = (override.inheritFromSceneId
      ? scenes.find((candidate) => candidate.id === override.inheritFromSceneId)
      : previousByOrder);
    if (previous) return `Inherit the approved wardrobe and prop state from Scene ${previous.order} (${previous.title}). Do not redesign or regenerate unchanged assets.`;
    return "Use the locked base character wardrobe and prop references without modifying the source assets.";
  }
  return [
    override.wardrobeChanges ? `Scene wardrobe delta: ${override.wardrobeChanges}` : "Keep the locked base wardrobe.",
    override.propChanges ? `Scene prop delta: ${override.propChanges}` : "Keep the locked base props.",
    override.notes || "Apply these changes only in this scene and its child shots; never overwrite the base character/detail references."
  ].join("\n");
}
