import { getProviderVideoDurationPolicy, planProviderShotDurations, recommendedProviderShotCount } from "@studio/domain/duration-policy";
import type { Project, ProjectIntake, ProviderPlatform, Scene, SkillPack } from "@studio/types";
import { spatialContinuityInstruction } from "./spatial-continuity-contract";

type SkillDoc = SkillPack;

function skillInstructionForStage(skill: SkillPack | undefined, stage: SkillPack["pipelineStages"][number], maxLength = 1800) {
  if (!skill || !skill.pipelineStages.includes(stage)) return "";
  const normalized = skill.content.replace(/\r/g, "").trim();
  const match = new RegExp(`^##\\s+${stage}\\s*$`, "im").exec(normalized);
  if (!match) return "";
  const remainder = normalized.slice(match.index + match[0].length);
  const nextSection = remainder.search(/^##\\s+/m);
  const stageContent = remainder.slice(0, nextSection >= 0 ? nextSection : undefined).trim();
  if (!stageContent) return "";
  const content = stageContent.length > maxLength ? `${stageContent.slice(0, maxLength).trim()}\n[skill guidance truncated]` : stageContent;
  return `\n\n[SELECTED VIDEO SKILL: ${skill.name} v${skill.version} | ${stage}]\n${content}`;
}

export function buildScreenplayScenePrompt(project: Project, scene: Scene, videoSkill?: SkillDoc, videoProviderPlatform: ProviderPlatform = "google-flow", creativeSkill?: SkillDoc) {
  const outputLanguage = project.intake?.outputLanguage || "Vietnamese";
  const contentGuidance = skillInstructionForStage(videoSkill, "story", 250);
  const creativeGuidance = skillInstructionForStage(creativeSkill, "story", 350);
  const { compactDialogueSlotPlans, maxDialogueCues, maximumDialogueWords, maximumAtomicCueGroups, providerDurationLadder, sceneDialogueWordBudget, sceneRuntimeBudgetSec } = screenplaySceneBudget(project, videoProviderPlatform, scene);
  const { compactSceneCharacters, compactVisualRequirements, lockedContract, lockedScene, scopedCreativeIntent, verbatimSourceLines, videoKnowledgeProfile } = screenplaySceneScope(project, scene);
  return `You are writing exactly ONE locked scene screenplay for a larger production.

You may author performance, subtext, exact dialogue and sound cues. You may NOT change the narrative contract, scene objective/conflict/turn, entry/exit state, speaker ownership, location, or create shots/camera/provider prompts.

LOCKED NARRATIVE CONTRACT:
${JSON.stringify(lockedContract)}

LOCKED VERBATIM SOURCE LINES:
${JSON.stringify(verbatimSourceLines)}

SCENE-SCOPED CHARACTERS AND SPEAKERS:
${JSON.stringify(compactSceneCharacters)}

TARGET SCENE ARCHITECTURE:
${JSON.stringify(lockedScene)}

RELEVANT VISUAL REQUIREMENTS:
${JSON.stringify(compactVisualRequirements)}

RUNTIME BUDGET: approximately ${sceneRuntimeBudgetSec} seconds. The provider duration ladder is ${providerDurationLadder.join(", ")} seconds. The entire project has at most ${maximumAtomicCueGroups} atomic shot groups remaining for this scene after reserving the already locked scenes and later scene handoffs. Keep the scene within that group budget by combining compatible action/dialogue/sound cues; never add independent action groups just to explain the story. Emit at most ${maxDialogueCues} dialogue cues. A scene may contain multiple dialogue cues inside one provider shot; dialogue-cue count is not a shot-count limit. Across the entire scene, all dialogue lines combined must contain at most ${sceneDialogueWordBudget} spoken words; each individual line must contain at most ${maximumDialogueWords}.

FEASIBLE DIALOGUE SLOT INVENTORIES (choose the row matching your exact dialogue-cue count):
${JSON.stringify(compactDialogueSlotPlans)}

Assign each dialogue line to one slot in the chosen row. After sorting line word counts from shortest to longest, every count must be ≤ the corresponding sorted maximumWordsPerCue value. Do not borrow time from another cue or add a dialogue cue beyond the chosen row. The seconds values are speech-capacity slots, not additive provider-shot durations; several slots may share one shot. Count words against the concrete row before returning. Leave time for visible action and reaction. This is a duration ceiling, not a preassigned shot count: the atomic shot allocator decides the final coverage after all cues are locked.

CONTENT GUIDANCE:
${contentGuidance || "Write specific, performable action and subtext-rich dialogue."}
${creativeGuidance}

LOCKED CREATIVE INTENT:
${JSON.stringify(scopedCreativeIntent)}

ACTIVE VIDEO PROFILE (apply only these selected axes/modules; do not substitute a genre template):
${JSON.stringify(videoKnowledgeProfile)}

Return ONLY one compact, minified valid JSON object on a single line (no markdown, explanation, headings, or pretty-print whitespace):
{"screenplayScene":{"id":"${scene.screenplaySceneId}","sceneOrder":${scene.order},"slugline":"INT./EXT. LOCATION - TIME","presentCharacterNames":["only physically present characters"],"objective":"exact locked objective","conflict":"exact locked conflict","turn":"exact locked dramatic turn","entryState":"exact locked entry state","exitState":"exact locked exit state","actionCues":[{"id":"act_${scene.order}_01","ownerBeatId":"one contract beat id owned by this scene","sequenceOrder":1,"semanticRole":"initiation|proposal|pressure|reaction|consequence|decision|resolution","dependsOnCueIds":[],"viewerRequiresCueIds":[],"fulfillsObligationIds":["zero or more obligations actually completed by this cue"],"expressionMode":"visible|reaction|inferred","action":"visible present-tense action","visibleResult":"observable resulting state","performanceIntent":"playable behavior showing tactic under pressure"}],"dialogueCues":[{"id":"dlg_${scene.order}_01","ownerBeatId":"one contract beat id owned by this scene","sequenceOrder":2,"semanticRole":"question|proposal|pressure|refusal|answer|reaction|revelation|confirmation|decision","dependsOnCueIds":["trigger cue id when required"],"viewerRequiresCueIds":[],"fulfillsObligationIds":["zero or more obligations actually completed by this cue"],"expressionMode":"spoken|reaction|inferred","speaker":"exact stable character name","line":"exact ${outputLanguage} line","delivery":"onscreen_lipsync|offscreen_voiceover|internal_voice|recording","source":"required device/source for recording or offscreen voice","dramaticPurpose":"what changes because of this line","tactic":"probe|deflect|bargain|corner|reassure|conceal|challenge|concede|command|reframe","subtext":"what the speaker means or avoids saying","relationshipDelta":"specific information, trust or power change"}],"soundCues":[{"id":"snd_${scene.order}_01","ownerBeatId":"one contract beat id owned by this scene","sequenceOrder":3,"semanticRole":"confirmation|consequence|resolution","dependsOnCueIds":[],"viewerRequiresCueIds":[],"fulfillsObligationIds":["zero or more obligations actually completed by this cue"],"expressionMode":"audible|reaction|inferred","kind":"diegetic|offscreen|ambience|effect|music|silence","description":"story-relevant sound"}]}}

Assign one unique sequenceOrder across all action, dialogue and sound cues. Every cue requires ownerBeatId from TARGET SCENE ARCHITECTURE.contractBeatIds; this proves scene ownership even when the cue is connective action, question, rebuttal or reaction. Encode hard trigger/response, cause/consequence and viewer-information prerequisites with existing cue IDs. A refusal must depend on its proposal; an answer on its question; a reaction on its trigger; a consequence on its cause. Design dialogue as progressing exchanges: each reply must answer, resist, reframe or escalate the projected prior turn and create a specific information/relationship delta. Each action cue may complete exactly one independently generatable material operation. Do not bundle command + release + button press/call, or describe dialogue-commanded future work as already completed in the same action cue; keep the decisive visible result here and leave future work in dialogue or a later cue. For pose-led, silent or animated expression, make attention shift, intention, cause, reaction, residue and next expectation readable without explanatory dialogue; use the selected physical-law regime rather than default realism. Cover every locked obligation exactly once with fulfillsObligationIds. A cue may leave fulfillsObligationIds empty only when it develops its owner beat without adding a new fact, decision, outcome or contradiction; keep such connective cues causally dependent on an owned cue. Do not preview a later beat or move a later tactic into this scene. Put creative performance only in performanceIntent, tactic, subtext and relationshipDelta of authorized cues. mustBeSpoken requires a dialogue cue with expressionMode spoken and an authorized speaker; mustBeVisible requires an action cue with expressionMode visible and an observable visibleResult; reactionOnly requires expressionMode reaction; mayBeInferred may use any cue but must still be explicitly mapped. Every dialogue speaker must be allowed by the cue owner beat and exist in the scene-scoped character contract. Remote or recorded voices are audible but not physically present. If a locked verbatim source line belongs to this scene, reproduce it exactly—do not paraphrase, embellish or substitute it. Do not return shots.`;
 }

/** Compact retry prompt used after ChatGPT emits a repeated-token tail. */
export function buildCompactScreenplaySceneRetryPrompt(project: Project, scene: Scene, videoProviderPlatform: ProviderPlatform = "google-flow") {
  const outputLanguage = project.intake?.outputLanguage || "Vietnamese";
  const { lockedContract, lockedScene, compactSceneCharacters, verbatimSourceLines } = screenplaySceneScope(project, scene);
  const { sceneRuntimeBudgetSec, maximumAtomicCueGroups, maxDialogueCues, maximumDialogueWords, sceneDialogueWordBudget } = screenplaySceneBudget(project, videoProviderPlatform, scene);
  const contractBeatIds = (scene.contractBeatIds || []).join(",");
  return `Write exactly one compact valid JSON object for locked screenplay scene ${scene.screenplaySceneId}. Return no markdown or prose.
LOCKED CONTRACT:${JSON.stringify(lockedContract)}
LOCKED SCENE:${JSON.stringify(lockedScene)}
CHARACTERS:${JSON.stringify(compactSceneCharacters)}
VERBATIM LINES:${JSON.stringify(verbatimSourceLines)}
LIMITS: runtime ${sceneRuntimeBudgetSec}s; max atomic groups ${maximumAtomicCueGroups}; max dialogue cues ${maxDialogueCues}; max words/line ${maximumDialogueWords}; total spoken words ${sceneDialogueWordBudget}; owner beat IDs ${contractBeatIds}.
Preserve every locked fact, speaker, exact source line and causal dependency. Use concise values. Every cue needs one ownerBeatId from the supplied IDs and one unique sequenceOrder. Do not return shots.
OUTPUT SCHEMA: {"screenplayScene":{"id":"${scene.screenplaySceneId}","sceneOrder":${scene.order},"slugline":"INT./EXT. LOCATION - TIME","presentCharacterNames":[],"objective":"","conflict":"","turn":"","entryState":"","exitState":"","actionCues":[],"dialogueCues":[],"soundCues":[]}}
Each action cue needs id, ownerBeatId, sequenceOrder, semanticRole, dependsOnCueIds, viewerRequiresCueIds, fulfillsObligationIds, expressionMode, action, visibleResult, performanceIntent. Each dialogue cue needs id, ownerBeatId, sequenceOrder, semanticRole, dependsOnCueIds, viewerRequiresCueIds, fulfillsObligationIds, expressionMode, speaker, line, delivery, source, dramaticPurpose, tactic, subtext, relationshipDelta. Each sound cue needs id, ownerBeatId, sequenceOrder, semanticRole, dependsOnCueIds, viewerRequiresCueIds, fulfillsObligationIds, expressionMode, kind, description. Use ${outputLanguage} for authored prose. Finish the JSON object before stopping.`;
}

/**
 * Return the project-level shot budget before asking a provider to author a
 * scene. The screenplay importer uses the same atomic grouping rule; exposing
 * the numbers here lets orchestration stop an impossible scene before a
 * provider call is made.
 */
export function screenplaySceneBudgetStatus(project: Project, scene: Scene | undefined, videoProviderPlatform: ProviderPlatform = "google-flow") {
  const minimumProviderDurationSec = getProviderVideoDurationPolicy(videoProviderPlatform).supportedDurationsSec[0] || 4;
  const sceneCount = Math.max(1, project.storyDocument?.scenes?.length || 1);
  const maximumShots = Math.max(1, Math.floor(Number(project.intake?.targetDurationSec || 30) / minimumProviderDurationSec));
  const targetOrder = Number(scene?.order || sceneCount);
  const prior = (project.storyDocument?.screenplayScenes || []).filter((item: any) => item.id !== scene?.screenplaySceneId && Number(item.sceneOrder) < targetOrder);
  const priorAtomicCueGroups = prior.reduce((sum: number, item: any) => sum + atomicCueGroupCount(item), 0);
  const laterSceneHandoffs = Math.max(0, sceneCount - prior.length - 1);
  const minimumRequiredAtomicCueGroups = priorAtomicCueGroups + 1 + laterSceneHandoffs;
  return { maximumShots, priorAtomicCueGroups, laterSceneHandoffs, minimumRequiredAtomicCueGroups, availableAtomicCueGroups: maximumShots - priorAtomicCueGroups - laterSceneHandoffs };
}

export function buildShotBreakdownPrompt(
  project: Project,
  scenes: Scene[],
  videoSkill: SkillDoc | undefined,
  videoProviderPlatform: ProviderPlatform = "google-flow",
  targetScene?: Scene,
  sceneDurations?: number[],
  shotOrderStart = 1,
  screenplayCueIds?: string[]
) {
  const scopedScenes = targetScene ? [targetScene] : scenes;
  const screenplayScenes = scopedScreenplayForShots(project, scopedScenes, screenplayCueIds);
  const runtimeSeconds = project.intake?.targetDurationSec || 30;
  const projectShotCount = recommendedProviderShotCount(videoProviderPlatform, runtimeSeconds);
  const durations = sceneDurations ?? planProviderShotDurations(videoProviderPlatform, runtimeSeconds, projectShotCount);
  const shotCount = durations.length;
  const outputLanguage = String(project.intake?.outputLanguage || "English");
  const directingGuidance = skillInstructionForStage(videoSkill, "prompt", 1400);
  const scopedBeatIds = new Set(scopedScenes.flatMap((scene) => scene.contractBeatIds || []));
  const shotScopedContract = {
    beats: (project.storyDocument?.narrativeContract?.beats || []).filter((beat) => scopedBeatIds.has(beat.id))
  };
  const scopedRequirementIds = new Set(scopedScenes.flatMap((scene) => scene.referenceRequirementIds || []));
  const scopedVisualRequirements = (project.storyDocument?.visualRequirements || []).filter((requirement) => scopedRequirementIds.has(requirement.id));
  const sceneArchitecture = scopedScenes.map((scene) => ({ id: scene.id, screenplaySceneId: scene.screenplaySceneId, title: scene.title, contractBeatIds: scene.contractBeatIds, objective: scene.objective, conflict: scene.conflict, dramaticTurn: scene.dramaticTurn, entryState: scene.entryState, exitState: scene.exitState, referenceRequirementIds: scene.referenceRequirementIds }));
  const context = { shotScopedContract, sceneArchitecture, screenplayScenes, scopedVisualRequirements, videoProfile: project.storyDocument?.videoKnowledgeProfile, directingGuidance, spatialContinuity: spatialContinuityInstruction() };
  const production = { videoProviderPlatform, runtimeSeconds, targetSceneOrder: targetScene?.order, shotCount, shotOrderStart, durations, outputLanguage, firstDuration: durations[0] || 0 };
  return `${buildShotBreakdownPromptContext(context)}${buildShotBreakdownPromptRules(production)}`;
}

function buildShotBreakdownPromptContext(context: {
  shotScopedContract: unknown; sceneArchitecture: unknown; screenplayScenes: unknown;
  scopedVisualRequirements: unknown; videoProfile: unknown; spatialContinuity: string; directingGuidance: string;
}) {
  return `You are the shot designer. Convert the locked screenplay into provider-neutral shot packages.

You may choose coverage, camera and timing. You may NOT rewrite story facts, add dialogue, change speakers, change delivery, change scene turns, or invent consequences. Every action, dialogue and sound instruction must reference an existing screenplay cue ID.

SHOT-SCOPED NARRATIVE BEATS:
${JSON.stringify(context.shotScopedContract, null, 2)}

LOCKED SCENE ARCHITECTURE:
${JSON.stringify(context.sceneArchitecture, null, 2)}

LOCKED SCREENPLAY:
${JSON.stringify(context.screenplayScenes, null, 2)}

SCENE-SCOPED VISUAL REQUIREMENTS:
${JSON.stringify(context.scopedVisualRequirements, null, 2)}

ACTIVE VIDEO PROFILE:
${JSON.stringify(context.videoProfile, null, 2)}

${context.spatialContinuity}

DIRECTING GUIDANCE:
${context.directingGuidance || "Use motivated, readable coverage and a locked camera by default."}

`;
}

function buildShotBreakdownPromptRules(production: {
  videoProviderPlatform: ProviderPlatform; runtimeSeconds: number; targetSceneOrder?: number; shotCount: number;
  shotOrderStart: number; durations: number[]; outputLanguage: string; firstDuration: number;
}) {
  const packetScope = production.targetSceneOrder ? `scene ${production.targetSceneOrder} only` : "the full screenplay";
  const firstDialogueWords = Math.max(0, Math.floor(production.firstDuration * 2 - 1));
  return `PRODUCTION CONSTRAINTS:
- Provider: ${production.videoProviderPlatform}
- Project runtime: ${production.runtimeSeconds}s. This packet covers ${packetScope}.
- Create exactly ${production.shotCount} shots, numbered ${production.shotOrderStart} through ${production.shotOrderStart + production.shotCount - 1}, using this scene-local duration inventory exactly once: ${production.durations.join(", ")} seconds.
- Write every authored prose field (description, dominantAction, camera and motion) in ${production.outputLanguage}. Stable IDs and the locked exact dialogue are exempt; do not switch those prose fields to English in a later scene.
- Cover every screenplay cue included in this batch exactly once. Do not use cues omitted from LOCKED SCREENPLAY; another batch owns them.
- Every shot must cover at least one included screenplay cue. A dialogue- or sound-led reaction shot does not need a separate action cue; do not duplicate an action cue merely to populate every shot.
- One dramatic function, one dominant visible action and at most one material state transformation per shot.
- Give every action cue exactly one owner shot. The compiler will place that cue in exactly one timed action beat and mark it completed for every later shot; never preview or restage its final effect elsewhere.
- Duration follows active content before it is fitted to the provider ladder. A simple action-only phase must not exceed 3.5 seconds. Do not invent setup, reaction or repeated motion merely to fill residual provider capacity; the compiler marks a clean editorial exit and trims the unused tail.
- Translate the covered action cue's performanceIntent into specific playable motion and blocking; do not paste abstract emotional labels. Preserve dialogue tactic/subtext through listener behavior and camera motivation without changing the exact line.
- Treat one shot as one purposeful camera setup, not one action by definition. It may contain a readable chain of micro-beats in the same setup. Under animation/pose-led modules, preserve silhouette/attention hierarchy, anticipation, impact, reaction, visible residue, character motion vocabulary and the selected internal physics. A stylized or impossible action is valid when its rule and consequence remain consistent.
- Treat opening/closing, extracting/removing, attaching/installing, breaking/damaging and transferring as material transformations. Do not combine two independent transformation kinds in one motion/dominantAction. A lift immediately followed by placing the same prop is one continuous manipulation.
- Apply this as a hard pairwise rule before returning JSON: if a shot opens or closes a prop (for example a ledger, door or box), the prop must stay in the same owner's hands or position for that shot—do not also hand, pass or transfer it. If a shot transfers a prop, do not open, close, attach, detach, extract or install it in the same shot. Choose one transformation and leave the other to a later cue/shot.
- One locked camera or one short motivated move. Never describe a cut, switch, alternating angle, shot/reverse-shot or second framing inside one provider render.
- Camera must retain a readable framing and angle, then one simple move: framing (wide = toàn cảnh, medium = trung cảnh, medium_close = trung cận, close_up = cận cảnh, detail = đặc tả), angle (eye_level = ngang mắt, low_angle = góc thấp, high_angle = góc cao), and one move (lock = khóa khung, zoom_in/zoom_out = zoom vào/ra, pan_left/pan_right = lia trái/phải, tilt_up/tilt_down = ngẩng/cúi, track = bám theo). Optionally append target: <subject or fixed anchor>. Example: medium_close (trung cận), eye_level (ngang mắt), lock (khóa khung), target: Mai. Do not write cinematic prose or multiple camera operations.
- Treat furniture, counters, tables, doors and other fixed props as spatial anchors. State where each visible character is relative to the anchor (for example Mai left of table, Hưng behind table). The anchor cannot move, rotate, duplicate or pass between characters unless a locked action cue explicitly changes it. “Opposite each other” never overrides the anchor map.
- Let coverage accumulate visual pressure across the sequence: establish geography before conflict, move closer or constrain space as options narrow, and reserve the strongest justified proximity/angle/move for decision or climax. Do not repeat one identical camera setup across three increasing/climax beats.
- The assigned duration is ${production.firstDuration}s, so its locked dialogue may contain at most ${firstDialogueWords} spoken words. If the locked line exceeds this, reject the packet instead of hiding or rewriting it.
- Before returning, count words in every authored dialogue line against its selected duration slot. If any line would overflow, emit fewer cues or shorter performable lines within the locked scene contract; never return an over-budget line and never rely on the importer to shorten it.

Return ONLY valid JSON:
{
  "shots":[{
    "screenplayActionCueIds":["act_..."], "screenplayDialogueCueIds":["dlg_..."], "screenplaySoundCueIds":["snd_..."],
    "referenceRequirementIds":["smallest visible subset of the scene requirement IDs"],
    "description":"one visible frame/action", "dominantAction":"one visible transformation",
    "camera":"framing, angle, one move, optional target (for example medium_close, eye_level, lock, target: Mai)", "motion":"subject/environment motion only"
  }]
}

Choose referenceRequirementIds per shot. Include the scene location, each character physically visible in the frame, and only the prop visibly used or causally necessary in that shot. Never include an audible-only speaker or an unrelated scene asset. Use only IDs listed for that locked scene and never exceed 8.

The app compiler—not you—derives scene ID, shot order, duration, exact dialogue/speaker/delivery, entity visibility, narrative beat IDs, action ownership/completion, continuity manifest and timed setup/action/reaction beats from the locked job context, screenplay and the validated shot reference subset. Do not emit those other technical fields.

Reject your own draft before returning it if any cue is uncovered, duplicated without purpose, assigned to another speaker, or represented by an invented line. Do not emit skill prose or provider prompt text.`;
}

function scopedScreenplayForShots(project: Project, scenes: Scene[], cueIds?: string[]) {
  const cueIdSet = cueIds?.length ? new Set(cueIds) : undefined;
  return (project.storyDocument?.screenplayScenes ?? [])
    .filter((screenplay) => scenes.some((scene) => scene.screenplaySceneId === screenplay.id))
    .map((screenplay) => cueIdSet ? {
      ...screenplay,
      actionCues: screenplay.actionCues.filter((cue) => cueIdSet.has(cue.id)),
      dialogueCues: screenplay.dialogueCues.filter((cue) => cueIdSet.has(cue.id)),
      soundCues: screenplay.soundCues.filter((cue) => cueIdSet.has(cue.id))
    } : screenplay);
}

function screenplaySceneBudget(project: Project, videoProviderPlatform: ProviderPlatform, scene?: Scene) {
  const runtimeSeconds = project.intake?.targetDurationSec || 30;
  const sceneCount = Math.max(1, project.storyDocument?.scenes?.length || 1);
  const sceneRuntimeBudgetSec = Math.max(4, Math.round(runtimeSeconds / sceneCount));
  const durationPolicy = getProviderVideoDurationPolicy(videoProviderPlatform);
  const providerDurationLadder = durationPolicy.supportedDurationsSec;
  const minimumProviderDurationSec = providerDurationLadder[0] || 4;
  const maximumProviderDurationSec = providerDurationLadder.at(-1) || 10;
  const maximumDialogueWords = Math.max(1, Math.floor(maximumProviderDurationSec * 2 - 1));
  const requiredSpokenCues = scene
    ? (project.storyDocument?.narrativeContract?.beats || [])
      .filter((beat) => (scene.contractBeatIds || []).includes(beat.id))
      .flatMap((beat) => beat.obligations || [])
      .filter((obligation) => obligation.modality === "mustBeSpoken").length
    : 0;
  // A dialogue obligation is not a provider-shot allocation. Keep enough
  // cues to cover every locked mustBeSpoken obligation, even when a short
  // scene fits fewer minimum-duration shots. The shot compiler can place
  // multiple dialogue cues in one setup and remains responsible for timing.
  const maxDialogueCues = Math.max(1, Math.floor(sceneRuntimeBudgetSec / minimumProviderDurationSec), requiredSpokenCues);
  const sceneDialogueWordBudget = Math.max(0, Math.floor(sceneRuntimeBudgetSec * 2 - maxDialogueCues));
  const compactDialogueSlotPlans = Array.from({ length: maxDialogueCues }, (_, index) => {
    const cues = index + 1;
    const durationsSec = cues <= Math.floor(sceneRuntimeBudgetSec / minimumProviderDurationSec)
      ? planProviderShotDurations(videoProviderPlatform, sceneRuntimeBudgetSec, cues)
      : Array.from({ length: cues }, () => minimumProviderDurationSec);
    const remainingWords = Math.max(cues, sceneDialogueWordBudget);
    const maxWords = Array.from({ length: cues }, (_, cueIndex) =>
      Math.max(1, Math.floor((remainingWords + cueIndex) / cues))
    );
    return { cues, seconds: durationsSec, maxWords };
  });
  const maximumAtomicCueGroups = remainingAtomicCueGroupBudget(project, scene, videoProviderPlatform);
  return { compactDialogueSlotPlans, maxDialogueCues, maximumDialogueWords, maximumAtomicCueGroups, providerDurationLadder, sceneDialogueWordBudget, sceneRuntimeBudgetSec };
}

function atomicCueGroupCount(screenplay: any) {
  const cues = [
    ...(screenplay?.actionCues || []).map((cue: any, index: number) => ({ cue, kind: "action", index })),
    ...(screenplay?.dialogueCues || []).map((cue: any, index: number) => ({ cue, kind: "dialogue", index: 1000 + index })),
    ...(screenplay?.soundCues || []).map((cue: any, index: number) => ({ cue, kind: "sound", index: 2000 + index }))
  ].sort((left, right) => Number(left.cue?.sequenceOrder) - Number(right.cue?.sequenceOrder) || left.index - right.index);
  const groups: Array<Array<{ kind: string }>> = [];
  for (const item of cues) {
    const current = groups.at(-1);
    const duplicateAtomicKind = current?.some((entry) => entry.kind === item.kind && (item.kind === "action" || item.kind === "dialogue"));
    if (!current || duplicateAtomicKind) groups.push([item]);
    else current.push(item);
  }
  return groups.length;
}

function remainingAtomicCueGroupBudget(project: Project, scene: Scene | undefined, videoProviderPlatform: ProviderPlatform) {
  const status = screenplaySceneBudgetStatus(project, scene, videoProviderPlatform);
  return Math.max(1, status.availableAtomicCueGroups);
}

function screenplaySceneScope(project: Project, scene: Scene) {
  const contract = project.storyDocument?.narrativeContract;
  const sceneBeatIds = new Set(scene.contractBeatIds ?? []);
  const sceneBeats = (contract?.beats ?? []).filter((beat) => sceneBeatIds.has(beat.id));
  const sceneSpeakerNames = new Set(sceneBeats.flatMap((beat) => beat.allowedSpeakerNames ?? []));
  const referencedRequirements = (project.storyDocument?.visualRequirements ?? []).filter((requirement) =>
    (scene.referenceRequirementIds ?? []).includes(requirement.id)
  );
  const referencedCharacterNames = new Set(
    referencedRequirements
      .filter((requirement) => ["main_character", "supporting_character"].includes(requirement.role))
      .map((requirement) => requirement.name.trim().toLocaleLowerCase())
  );
  const sceneCharacters = (project.storyDocument?.characters ?? []).filter((character) =>
    sceneSpeakerNames.has(character.name) ||
    referencedCharacterNames.has(character.name.trim().toLocaleLowerCase())
  );
  const lockedContract = {
    beats: sceneBeats.map((beat) => ({
      id: beat.id,
      requiredAction: beat.requiredAction,
      requiredOutcome: beat.requiredOutcome,
      allowedSpeakerNames: beat.allowedSpeakerNames,
      obligations: (beat.obligations ?? []).map((obligation) => ({
        id: obligation.id,
        modality: obligation.modality,
        content: obligation.content,
        allowedSpeakerNames: obligation.allowedSpeakerNames
      }))
    }))
  };
  const spokenObligationTexts = new Set((project.storyDocument?.narrativeContract?.beats ?? [])
    .flatMap((beat) => beat.obligations ?? [])
    .filter((obligation) => obligation.modality === "mustBeSpoken")
    .map((obligation) => obligation.content.trim()));
  const verbatimSourceLines = (project.storyDocument?.sourceAnalysis?.requiredFacts ?? []).flatMap((fact) =>
    Array.from(fact.matchAll(/["“]([^"”]{2,})["”]/g), (match) => match[1].trim())
  ).filter((line) => spokenObligationTexts.has(line));
  const lockedScene = {
    id: scene.screenplaySceneId,
    order: scene.order,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    objective: scene.objective,
    conflict: scene.conflict,
    dramaticTurn: scene.dramaticTurn,
    escalationMechanism: scene.escalationMechanism,
    choicePressure: scene.choicePressure,
    emotionalShift: scene.emotionalShift,
    motifFunction: scene.motifFunction,
    entryState: scene.entryState,
    exitState: scene.exitState
  };
  const compactSceneCharacters = sceneCharacters.map((character) => ({
    name: character.name,
    role: character.role,
    storyFunction: character.storyFunction,
    voiceBrief: character.voiceBrief,
    motionBrief: character.motionBrief,
    audibleOnly: character.audibleOnly
  }));
  const compactVisualRequirements = referencedRequirements.map((requirement) => ({
    id: requirement.id,
    name: requirement.name,
    role: requirement.role
  }));
  const sceneCharacterNames = new Set(sceneCharacters.map((character) => character.name));
  const creativeIntent = project.storyDocument?.creativeIntent;
  const scopedCreativeIntent = creativeIntent ? {
    motif: creativeIntent.motif,
    characterDynamics: creativeIntent.characterDynamics.filter((dynamic) => sceneCharacterNames.has(dynamic.characterName))
  } : undefined;
  const videoKnowledgeProfile = project.storyDocument?.videoKnowledgeProfile;
  return { compactSceneCharacters, compactVisualRequirements, lockedContract, lockedScene, scopedCreativeIntent, verbatimSourceLines, videoKnowledgeProfile };
}
