import { getProviderVideoDurationPolicy, planProviderShotDurations, recommendedProviderShotCount } from "@studio/domain/duration-policy";
import type { ProductionFormat, Project, ProjectIntake, ProviderPlatform, Scene, SkillPack, SourceMaterialType, VisualReference } from "@studio/types";
import { formatLabel } from "@studio/domain/labels";

type SkillDoc = SkillPack;
const sourceRules: Record<SourceMaterialType, string> = {
  idea: "Expand the premise into a complete narrative. You may invent missing connective events, but preserve the user's core intent.",
  novel: "Adapt the supplied prose chronologically. Preserve causality, character motivation, key dialogue, and essential plot events; compress internal narration into visible action.",
  screenplay: "Treat the input as an existing screenplay. Preserve scene order, dialogue intent, and dramatic beats; normalize it into the required production schema without rewriting the premise."
};
const formatRules: Record<ProductionFormat, string> = {
  short_film: "Build a self-contained cinematic arc with setup, escalation, climax, and resolution. Prioritize emotional continuity over speed.",
  short_video: "The first provider-sized shot must open immediately on a visual or verbal hook. Use rapid information density, one central idea, and a strong final payoff or loop.",
  video_series: "Design an episodic arc. Each episode needs its own hook and payoff while preserving unresolved threads, character rules, locations, props, and visual continuity across episodes."
};
function durationToSeconds(value: number, unit: ProjectIntake["durationUnit"]) {
  if (unit === "hours") return Math.round(value * 3600);
  if (unit === "minutes") return Math.round(value * 60);
  return Math.round(value);
}

function skillInstructionForStage(skill: SkillPack | undefined, stage: SkillPack["pipelineStages"][number], maxLength = 1800) {
  if (!skill || !skill.pipelineStages.includes(stage)) return "";
  const normalized = skill.content.replace(/\r/g, "").trim();
  const match = new RegExp(`^##\\s+${stage}\\s*$`, "im").exec(normalized);
  if (!match) return "";
  const remainder = normalized.slice(match.index + match[0].length);
  const nextSection = remainder.search(/^##\s+/m);
  const stageContent = remainder.slice(0, nextSection >= 0 ? nextSection : undefined).trim();
  if (!stageContent) return "";
  const content = stageContent.length > maxLength ? `${stageContent.slice(0, maxLength).trim()}\n[skill guidance truncated]` : stageContent;
  return `\n\n[SELECTED VIDEO SKILL: ${skill.name} v${skill.version} | ${stage}]\n${content}`;
}
function durationSummary(intake: ProjectIntake) {
  const value = intake.durationValue ?? intake.targetDurationSec;
  const unit = intake.durationUnit ?? "seconds";
  return `${value} ${unit}${intake.productionFormat === "video_series" ? " per episode" : ""}`;
}

export function buildStoryFoundationPrompt(
  storySeed: string,
  intake: ProjectIntake,
  references: VisualReference[],
  videoSkill?: SkillDoc,
  adaptationSkill?: SkillDoc,
  creativeSkill?: SkillDoc
) {
  const outputLanguage = intake.outputLanguage || "Vietnamese";
  const storyTargetWords = Math.min(420, Math.max(120, Math.round(intake.targetDurationSec || 60)));
  const storyMinimumWords = Math.max(90, Math.round(storyTargetWords * 0.75));
  const storyMaximumWords = Math.round(storyTargetWords * 1.3);
  const referenceSummary = references.length
    ? references.map((reference) => `- ${reference.name}: ${reference.role}; ${reference.sourceDescription || "locked visual source"}`).join("\n")
    : "- No locked visual references.";
  const contentGuidance = skillInstructionForStage(videoSkill, "story", 500);
  return `TASK_CONTRACT_YAML:
version: story-foundation.v1
role: source analyst and adaptation editor
output:
  format: minified_json
  count: 1
  complete_before_submit: true
  markdown: forbidden
scope:
  stop_at: locked narrative foundation
  forbidden: [scenes, screenplay_cues, shots, camera_directions, visual_requirements, storyboard_frames, provider_prompts]
priority: [valid_complete_json, locked_source_facts, causal_story, compactness]

SOURCE MATERIAL:
${storySeed.trim()}

DELIVERY:
- Format: ${intake.productionFormat}
- Target runtime: ${intake.targetDurationSec || 30} seconds
- Audience: ${intake.audience}
- Output language: ${outputLanguage}

LOCKED VISUAL INPUTS (identity facts only; do not serialize them into screenplay prose):
${referenceSummary}

CONTENT / GENRE GUIDANCE:
${contentGuidance || "No optional content skill selected."}

CORE ADAPTATION GUIDANCE:
${skillInstructionForStage(adaptationSkill, "story", 300) || "Preserve source facts, speaker attribution, objectives, choices and outcomes."}

CREATIVE CONTENT GUIDANCE:
${skillInstructionForStage(creativeSkill, "story", 500) || "Build specific escalation, character tactics, subtext and an earned visual payoff without changing source facts."}

${storyFoundationSchema()}

${storyFoundationInvariants(outputLanguage, storyMinimumWords, storyMaximumWords, storyTargetWords)}`;
}

export function buildCompactStoryFoundationRetryPrompt(storySeed: string, intake: ProjectIntake) {
  const outputLanguage = intake.outputLanguage || "Vietnamese";
  const storyTargetWords = Math.min(420, Math.max(120, Math.round(intake.targetDurationSec || 60)));
  const storyMinimumWords = Math.max(90, Math.round(storyTargetWords * 0.75));
  const storyMaximumWords = Math.round(storyTargetWords * 1.3);
  return `You are retrying a failed story-foundation JSON response. Analyze the source and return exactly one complete minified JSON object. Preserve the source intent and do not emit scenes, screenplay, shots, visual requirements, markdown, or explanation.

SOURCE:
${storySeed.trim()}

RUNTIME: ${intake.targetDurationSec || 30} seconds
LANGUAGE: ${outputLanguage}

${storyFoundationSchema()}

RETRY RULES:
- Keep the entire JSON under 6,000 UTF-8 bytes and finish the closing brace before submitting.
- Write a causal complete story in ${storyMinimumWords}–${storyMaximumWords} words; keep every other scalar compact and avoid duplicated prose.
- Use exactly 3 beats for projects up to 90 seconds, at most 2 obligations per beat, requiredFacts ≤ 6, forbiddenContradictions ≤ 4, adaptationDecisions ≤ 2.
- Return valid JSON only, on one line, with all creative values in ${outputLanguage}.`;
}

export function buildCompactStoryArchitectureRetryPrompt(
  project: Project,
  references: VisualReference[],
  videoSkill?: SkillDoc,
  creativeSkill?: SkillDoc
) {
  const full = buildStoryArchitecturePrompt(project, references, videoSkill, creativeSkill);
  const foundationText = full.match(/LOCKED FOUNDATION:\n([\s\S]*?)\n\nLOCKED VISUAL INPUTS:/)?.[1] || "{}";
  let foundation = foundationText;
  try {
    const parsed = JSON.parse(foundationText);
    foundation = JSON.stringify({
      completeStory: parsed.completeStory,
      contract: parsed.contract,
      motif: parsed.motif,
      characters: parsed.characters
    });
  } catch {
    // Keep the original locked text if a future schema makes this extraction
    // non-JSON; the retry remains safer than dropping the contract entirely.
  }
  const schema = full.match(/Return ONLY valid JSON:\n([\s\S]*?)\n\nINVARIANTS:/)?.[1] || "{}";
  const runtimeSeconds = project.intake?.targetDurationSec || 30;
  const sceneCount = Math.min(3, recommendedProviderShotCount("google-flow", runtimeSeconds));
  return `Retry story architecture. Return exactly one complete minified JSON object and nothing else.

LOCKED FOUNDATION:
${foundation}

OUTPUT SCHEMA:
${schema}

MANDATORY: exactly ${sceneCount} scenes for ${runtimeSeconds}s; assign every locked beat exactly once; every scene needs objective, conflict, dramaticTurn, escalationMechanism, choicePressure, emotionalShift, entryState, exitState and one location reference; first motifFunction=setup and last=payoff${sceneCount > 2 ? ", middle=turn or develop" : ""}. Keep all creative values in ${project.intake?.outputLanguage || "Vietnamese"}. Keep descriptions concise. Return valid JSON only.`;
}

function storyFoundationSchema() {
  return `Return ONLY one compact, minified valid JSON object on a single line with this schema (no markdown fences, explanation, headings, or pretty-print whitespace):
{
  "sourceAnalysis": {
    "premise":"...", "theme":"...", "protagonist":"...", "externalGoal":"...", "internalNeed":"...", "centralConflict":"...", "stakes":"...",
    "requiredFacts":["source facts that no later stage may contradict"]
  },
  "adaptationDecisions":[{"id":"adapt_...","sourceEvidence":"...","decision":"...","reason":"...","authorization":"preserve|condense|externalize|omit"}],
  "logline":"...",
  "story":"complete adapted story proportional to runtime",
  "narrativeContract": {
    "corePremise":"...", "primaryObjective":"...", "requiredDecision":"...", "requiredOutcome":"...",
    "namedEntities":["..."], "allowedSpeakerNames":["include every onscreen, phone, radio, recording and narrator voice"],
    "forbiddenContradictions":["..."],
    "voiceContinuity":{"globalDirection":"source-locked language, accent/dialect and vocal continuity; say no source-locked accent when absent","perCharacter":[{"characterName":"exact speaker name","direction":"only character-specific source-backed voice facts"}]},
    "beats":[{"id":"beat_...","sourceEvidence":"...","requiredAction":"...","requiredOutcome":"...","allowedSpeakerNames":["..."],"obligations":[{"id":"obl_...","modality":"mustBeSpoken|mustBeVisible|mayBeInferred|reactionOnly","content":"one atomic fact/action/outcome","allowedSpeakerNames":["only speakers authorized when modality is mustBeSpoken"]}]}]
  },
  "creativeIntent": {
    "dramaticQuestion":"one question answered by the required choice and consequence",
    "emotionalArc":"how tactics and pressure change across the whole film",
    "tonalPromise":"specific viewing experience, not visual style adjectives",
    "motif":{"element":"one story-bearing prop, sound, gesture, spatial relation or visual condition","setup":"first meaning","development":"how pressure changes its meaning","payoff":"final transformed meaning"},
    "characterDynamics":[{"characterName":"exact stable character name","publicWant":"what they actively pursue","emotionalDefense":"what they avoid revealing","pressureResponse":"how their tactic changes under pressure","voicePattern":"vocabulary, syntax, rhythm, directness and verbal habit"}]
  },
  "videoKnowledgeProfile":{"primaryPurpose":"...","contentDrivers":["story|character|information|performance|mood|experience"],"seriality":"standalone|episodic|serial|anthology|hybrid","closure":"closed|local_closed_arc_open|open","dialogueDensity":"none|low|medium|high","pacingShape":"sequence-level energy progression","motionRegime":"continuous|selective|stepped|held|burst_based","physicalLawRegime":"realistic|stylized_consistent|expressive_impossible|abstract","exaggerationLevel":"subtle|moderate|broad","poseDependence":"motion_led|balanced|key_pose_led","environmentAgency":"background|supporting_system|causal_system|antagonist","soundMotionCoupling":"loose|selective|tight","activeModules":["small set such as dialogue.exchange, rhythm.wave, animation.pose_readability"],"arbitrationNotes":["how purpose resolves one meaningful rule conflict"]},
  "characters":[{"name":"...","role":"main|supporting|voice_only|narrator","storyFunction":"...","visualBrief":"concise identity facts only","voiceBrief":"stable vocabulary, rhythm, age, texture and accent only when source-supported","motionBrief":"rest pose, gesture/reaction range, acceleration and recovery when movement identity matters","audibleOnly":false,"required":true}]
}`;
}

function storyFoundationInvariants(outputLanguage: string, storyMinimumWords: number, storyMaximumWords: number, storyTargetWords: number) {
  return `INVARIANTS:
- Hard output budget: the entire JSON must stay under 6,000 UTF-8 bytes. Finish every required field and the closing brace before submitting. Use short Vietnamese scalar values, avoid repeated prose, emit minified JSON on one line, and do not add optional keys beyond this schema.
- The story field is the complete, naturally written causal story—not a logline, outline, scene list or technical summary. Write ${storyMinimumWords}–${storyMaximumWords} words (target about ${storyTargetWords}) with a concrete situation, escalation, consequential choice and readable outcome. Do not pad it with production language.
- Keep the remaining contract compact: exactly 3 beats for projects up to 90 seconds and at most 4 otherwise; at most 2 atomic obligations per beat; requiredFacts ≤ 6; forbiddenContradictions ≤ 4; adaptationDecisions ≤ 2 and only for changed/omitted facts. Every non-story scalar value ≤ 72 characters, obligation content ≤ 64 characters, activeModules ≤ 4, arbitrationNotes ≤ 2, and no prose may be duplicated across fields.
- JSON validity is mandatory. Every string must be JSON.stringify-compatible; never place an unescaped double quote, literal newline, markdown fence, or commentary inside a JSON string.
- Analyze the source before adapting it. Every non-preserved change needs one adaptationDecision and sourceEvidence.
- Narrative beats are story functions, not automatic scenes. Do not group them into scenes in this gate.
- Decompose each beat into atomic obligations and assign the strictest truthful modality. Use mustBeSpoken only when exact audible information or speaker ownership matters; mustBeVisible for an observable action/state; mayBeInferred only when omission of explicit expression cannot change meaning; reactionOnly never substitutes for required spoken information or a required visible action.
- creativeIntent is an authorized performance plan, not a second plot. Its motif and character dynamics may enrich behavior but may not add a new fact, outcome, speaker, object dependency, or contradiction.
- Infer videoKnowledgeProfile from purpose, source, duration, serial context and intended style as independent axes; never equate duration with genre. Use animation modules only when the source/style actually calls for animated, stylized, pose-led, silent, slapstick or environment-driven expression. Keep activeModules to 3–7 relevant modules, not a catalogue dump.
- For episodic/serial work, close the promised local episode question while recording what remains open in closure/arbitrationNotes. For visual or low-dialogue work, externalize want, attention, cause, reaction, visible state change and expectation instead of inventing explanatory speech.
- Every dialogue speaker must exist in characters and narrativeContract.allowedSpeakerNames. Preserve who says a source line. A deceased/remote/recorded voice needs a stable voice_only character.
- Preserve every explicit source requirement about spoken language, regional accent, dialect, voice identity and cross-shot voice consistency in narrativeContract.voiceContinuity. A global requirement applies to every speaker and must also appear in each affected character voiceBrief; never replace a source-locked regional voice with a generic age/tone description.
- Write all creative values in ${outputLanguage}; keep schema keys and IDs in English.
- Never return visualRequirements, scenes, screenplay or shots fields anywhere.`;
}

export function buildStoryArchitecturePrompt(project: Project, references: VisualReference[], videoSkill?: SkillDoc, creativeSkill?: SkillDoc) {
  const outputLanguage = project.intake?.outputLanguage || "Vietnamese";
  const runtimeSeconds = project.intake?.targetDurationSec || 30;
  const plannedSceneCount = Math.min(3, recommendedProviderShotCount("google-flow", runtimeSeconds));
  const foundation = project.storyDocument;
  // Architecture needs immutable decisions and ownership, not a second copy of
  // every foundation document. Keeping this packet normalized avoids asking a
  // browser model to rediscover the same premise across story, analysis,
  // decisions, contract, creative prose and character biographies.
  const architectureFoundation = {
    completeStory: foundation?.story,
    contract: {
      corePremise: foundation?.narrativeContract?.corePremise,
      primaryObjective: foundation?.narrativeContract?.primaryObjective,
      requiredDecision: foundation?.narrativeContract?.requiredDecision,
      requiredOutcome: foundation?.narrativeContract?.requiredOutcome,
      forbiddenContradictions: foundation?.narrativeContract?.forbiddenContradictions,
      beats: foundation?.narrativeContract?.beats
    },
    requiredFacts: foundation?.sourceAnalysis?.requiredFacts,
    motif: foundation?.creativeIntent?.motif,
    emotionalArc: foundation?.creativeIntent?.emotionalArc,
    videoKnowledgeProfile: foundation?.videoKnowledgeProfile,
    characters: (foundation?.characters ?? []).map((character) => ({
      name: character.name,
      role: character.role,
      storyFunction: character.storyFunction,
      visualBrief: character.visualBrief,
      motionBrief: character.motionBrief,
      audibleOnly: character.audibleOnly,
      required: character.required
    }))
  };
  const referenceSummary = references.length
    ? references.map((reference) => `- ${reference.name}: ${reference.role}; ${reference.sourceDescription || "locked visual source"}`).join("\n")
    : "- No locked visual references.";
  return `You are the scene architect for an AI video production pipeline.

The source analysis, adaptation decisions, narrative contract, beats, story and characters below are approved and immutable. Your job is only to organize them into scene architecture and visible production requirements. Do NOT rewrite the story, create dialogue/action/sound cues, create shots, or emit provider prompts.

LOCKED FOUNDATION:
${JSON.stringify(architectureFoundation, null, 2)}

LOCKED VISUAL INPUTS:
${referenceSummary}

SCENE GUIDANCE:
${skillInstructionForStage(videoSkill, "story", 700) || "Use the smallest number of scenes needed for the runtime."}
${skillInstructionForStage(creativeSkill, "story", 900)}
- Create exactly ${plannedSceneCount} scenes for the ${runtimeSeconds}-second project.

Return ONLY valid JSON:
{
  "visualRequirements":[{"id":"vr_...","name":"...","role":"main_character|supporting_character|location|prop","description":"visible design facts","continuityRules":"...","requiredInSceneIndexes":[1]}],
  "scenes":[{
    "id":"scene_arch_...","title":"...","summary":"...","contractBeatIds":["beat_..."],
    "location":"...","timeOfDay":"...","emotionalTone":"...","objective":"...","conflict":"...","dramaticTurn":"...","escalationMechanism":"what newly raises cost, removes an option or changes knowledge","choicePressure":"why the viewpoint character must choose now","emotionalShift":"observable change in tactic or relationship","motifFunction":"setup|develop|turn|payoff|none",
    "entryState":"...","exitState":"...","settingDescription":"...","requiredProps":["exact visualRequirement names"],
    "wardrobeState":"...","referenceRequirementIds":["vr_..."],"assetDelta":null
  }]
}

INVARIANTS:
- Assign every locked beat to exactly one scene. Never repeat a contractBeatId across scenes, invent a beat, or omit one.
- Keep the response browser-safe: every description/state/creative string ≤ 140 characters, every continuity rule ≤ 120 characters, no duplicated premise or character biography across fields, and assetDelta must be null or the schema object—not prose.
- A scene has one objective, conflict and dramatic turn with distinct entry/exit states. Beats are not automatically scenes.
- Each scene must advance pressure through a new mechanism and create an observable emotional/tactical shift. Across the sequence, the locked motif must progress from setup through development to payoff; do not repeat it as decoration.
- motifFunction is mandatory and must be an exact enum value: scene 1 = setup, the middle scene(s) = develop or turn, final scene = payoff. Never omit it, use none, or reuse setup/payoff in the wrong position.
- Before returning JSON, check the ordered motifFunction list: ${plannedSceneCount === 2 ? "with exactly 2 scenes use [setup, payoff]" : "with exactly 3 scenes use [setup, turn, payoff] unless the story clearly needs develop in the middle"}.
- A remote, phone or recorded voice is not a visible character unless the locked story says they physically appear.
- Name every character visual requirement with the exact stable character name from the locked foundation.
- Every scene needs one location requirement and only the smallest relevant character/prop requirement subset.
- Write creative values in ${outputLanguage}; keep schema keys and IDs in English.
- Never return sourceAnalysis, adaptationDecisions, narrativeContract, characters, screenplay or shots.`;
}

function screenplaySceneBudget(project: Project, videoProviderPlatform: ProviderPlatform) {
  const runtimeSeconds = project.intake?.targetDurationSec || 30;
  const sceneCount = Math.max(1, project.storyDocument?.scenes?.length || 1);
  const sceneRuntimeBudgetSec = Math.max(4, Math.round(runtimeSeconds / sceneCount));
  const durationPolicy = getProviderVideoDurationPolicy(videoProviderPlatform);
  const providerDurationLadder = durationPolicy.supportedDurationsSec;
  const minimumProviderDurationSec = providerDurationLadder[0] || 4;
  const maximumProviderDurationSec = providerDurationLadder.at(-1) || 10;
  const maximumDialogueWords = Math.max(1, Math.floor(maximumProviderDurationSec * 2 - 1));
  const maxDialogueCues = Math.max(1, Math.floor(sceneRuntimeBudgetSec / minimumProviderDurationSec));
  const sceneDialogueWordBudget = Math.max(0, Math.floor(sceneRuntimeBudgetSec * 2 - maxDialogueCues));
  const compactDialogueSlotPlans = Array.from({ length: maxDialogueCues }, (_, index) => {
    const durationsSec = planProviderShotDurations(videoProviderPlatform, sceneRuntimeBudgetSec, index + 1);
    return {
      cues: index + 1,
      seconds: durationsSec,
      maxWords: durationsSec.map((duration) => Math.max(1, Math.floor(duration * 2 - 1))),
      totalDurationSec: durationsSec.reduce((sum, duration) => sum + duration, 0)
    };
  }).filter((plan) => plan.totalDurationSec <= sceneRuntimeBudgetSec)
    .map(({ cues, seconds, maxWords }) => ({ cues, seconds, maxWords }));
  return { compactDialogueSlotPlans, maxDialogueCues, maximumDialogueWords, providerDurationLadder, sceneDialogueWordBudget, sceneRuntimeBudgetSec };
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
