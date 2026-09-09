import type { Project, Scene, Shot } from "@studio/types";

export function buildTranslationPrompt(project: Project, scenes: Scene[], shots: Shot[], sourceLanguage: string, targetLanguage: string) {
  return `Translate the production script content from ${sourceLanguage} to ${targetLanguage}.

Return JSON only. Do not add markdown.

Rules:
- Translate user-facing creative content naturally into ${targetLanguage}.
- Preserve all IDs, order, structure, timing, camera intent, safety meaning, factual constraints, and character continuity.
- Do not translate provider/system prompt instructions, JSON keys, IDs, filenames, provider names, or technical labels that are better left in English.
- Keep prompt fields empty if they are empty. Do not create storyboard-image prompts or video prompts.
- Dialogue and voiceover must be natural ${targetLanguage}, suitable for lip-sync and spoken delivery.
- If a term is awkward or too long in ${targetLanguage}, keep the concise English product term.

Required JSON shape:
{
  "language": "${targetLanguage}",
  "storyDocument": {
    "logline": "...",
    "story": "...",
    "sceneBreakdown": "...",
    "screenplay": "... optional",
    "characters": [{"name":"...","role":"...","storyFunction":"...","visualBrief":"...","voiceBrief":"...","audibleOnly":false,"required":true}]
  },
  "scenes": [{"id":"scene id","title":"...","summary":"...","location":"...","timeOfDay":"...","emotionalTone":"...","objective":"...","conflict":"...","dramaticTurn":"...","entryState":"...","exitState":"..."}],
  "shots": [{"id":"shot id","description":"...","camera":"...","motion":"...","speechType":"dialogue|inner_monologue|narration|silent","speaker":"...","dialoguePurpose":"...","dialogue":"...","storyBeat":"...","transitionIn":"...","transitionOut":"...","screenDirection":"..."}]
}

[STORY DOCUMENT]
${JSON.stringify(project.storyDocument || {}, null, 2)}

[SCENES]
${JSON.stringify(scenes.map((scene) => ({
    id: scene.id,
    title: scene.title,
    summary: scene.summary,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    emotionalTone: scene.emotionalTone,
    objective: scene.objective,
    conflict: scene.conflict,
    dramaticTurn: scene.dramaticTurn,
    entryState: scene.entryState,
    exitState: scene.exitState,
    order: scene.order
  })), null, 2)}

[SHOTS]
${JSON.stringify(shots.map((shot) => ({
    id: shot.id,
    sceneId: shot.sceneId,
    order: shot.order,
    description: shot.description,
    camera: shot.camera,
    motion: shot.motion,
    speechType: shot.speechType,
    speaker: shot.speaker,
    dialoguePurpose: shot.dialoguePurpose,
    dialogue: shot.dialogue || "",
    storyBeat: shot.storyBeat,
    transitionIn: shot.transitionIn,
    transitionOut: shot.transitionOut,
    screenDirection: shot.screenDirection
  })), null, 2)}`;
}
