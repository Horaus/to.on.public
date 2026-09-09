import { getWorkflowBridge } from "../workflow-bridge";
import type { Asset, Character, Project, ProjectIntake, ReferenceRole, StoryCharacter, StudioState, VisualReference, VisualRequirement } from "@studio/types";
import type { Dispatch, SetStateAction } from "react";
import { isObjectLikeStorySubject, mergeDistinct } from "@studio/workflow/character-utils";
import { normalizeSlotName } from "@studio/domain/identifiers";
import { latestConversationForSession, referencesMissingFromConversation, type RunJobPayload } from "@studio/workflow/support-core";
import { readFileAsDataUrl } from "@studio/workflow/support-core";
import { makeId } from "@studio/domain/identifiers";
import { formatLabel } from "@studio/domain/labels";
import { buildCharacterIdentityContract, formatCharacterIdentityContract, visualStyleInstruction } from "@studio/workflow/character-identity-contract";

type DraftUpload = { file: File; dataUrl: string };
type ReferenceDraft = {
  name: string;
  role: ReferenceRole;
  referenceUse?: VisualReference["referenceUse"];
  visualStyle: string;
  characterSlot: string;
  sourceDescription: string;
  transformationRequest: string;
  primaryUploads: DraftUpload[];
  detailUploads: DraftUpload[];
};
type ReferenceUploadPayload = {
  projectId: string; name: string; role: ReferenceRole; referenceUse?: VisualReference["referenceUse"];
  characterSlot?: string; dataUrl: string; filePath?: string; previewDataUrl?: string; mimeType: string;
  sourceDescription: string; transformationRequest: string; sourceAssetId?: string; sourceProvider?: string;
  sourceAspectRatio?: "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
};

type ReferenceGroup = { key: string; slot: string; role: VisualReference["role"]; name: string; primary?: VisualReference; detail?: VisualReference; references: VisualReference[] };
type ReferenceGenerationDependencies = {
  character: Character; currentCharacterSlot: string; intake: ProjectIntake; missingImageRequest: string; productionLanguage: string; project: Project; projectAssets: Asset[]; projectReferences: VisualReference[]; referenceDraft: ReferenceDraft; referenceModalPane: "main" | "detail"; referenceRevisionRequest: string;
  replaceState: (state: StudioState) => void; requiredStoryCharacters: StoryCharacter[]; runDemoJob: (payload: RunJobPayload) => void; safeImageProviderId: string; selectedReference?: VisualReference | null; selectedReferenceDetail?: VisualReference; selectedReferenceGroup?: ReferenceGroup; selectedReferenceHasGenerationData: boolean; selectedReferenceName: string; selectedReferencePaneJobActive: boolean; selectedReferencePaneKey: string; selectedReferencePrimary?: VisualReference; selectedReferenceRole: ReferenceRole; selectedReferenceSlot: string;
  setMissingImageRequest: Dispatch<SetStateAction<string>>; setPendingReferencePaneKeys: Dispatch<SetStateAction<Set<string>>>; setReferenceRevisionOpen: Dispatch<SetStateAction<boolean>>; setReferenceRevisionRequest: Dispatch<SetStateAction<string>>; setState: Dispatch<SetStateAction<StudioState>>; state: StudioState; storyCharacters: StoryCharacter[]; visualRequirements: VisualRequirement[];
};

type ReferenceGenerationActionsRuntime = ReferenceGenerationDependencies & Record<string, Function>;

function requestMissingReferenceImage(runtime: ReferenceGenerationActionsRuntime) {
const { missingImageRequest, referenceModalPane, selectedReference, selectedReferenceName, selectedReferencePrimary, selectedReferenceRole, selectedReferenceSlot, setMissingImageRequest, queueCharacterImageDraft } = runtime;
    if (!selectedReference || !missingImageRequest.trim()) return;
    queueCharacterImageDraft(
      selectedReferencePrimary,
      missingImageRequest.trim(),
      selectedReferenceSlot,
      selectedReferenceName,
      referenceModalPane === "detail" ? "supporting_detail" : "primary_identity",
      selectedReferenceRole,
      referenceModalPane === "detail" ? "supporting_detail" : undefined
    );
    setMissingImageRequest("");
  }

function requestSelectedReferenceRevision(runtime: ReferenceGenerationActionsRuntime) {
const { missingImageRequest, referenceModalPane, referenceRevisionRequest, selectedReference, selectedReferenceDetail, selectedReferenceGroup, selectedReferenceHasGenerationData, selectedReferencePaneJobActive, selectedReferencePaneKey, selectedReferencePrimary, setMissingImageRequest, setPendingReferencePaneKeys, setReferenceRevisionOpen, setReferenceRevisionRequest, queueCharacterImageDraft } = runtime;
    const decision = revisionDecision({ referenceModalPane, referenceRevisionRequest, missingImageRequest, selectedReference, selectedReferenceDetail, selectedReferencePrimary, selectedReferenceHasGenerationData, selectedReferencePaneJobActive });
    if (decision === "blocked") return;
    if (decision === "needs_note") { setReferenceRevisionOpen(true); return; }
    if (decision === "dismiss") { setReferenceRevisionOpen(false); return; }
    if (!selectedReference) return;
    const note = referenceRevisionRequest.trim();
    const fallbackRequest = revisionFallback(referenceModalPane);
    setPendingReferencePaneKeys((current) => new Set(current).add(selectedReferencePaneKey));
    queueCharacterImageDraft(
      selectedReferencePrimary,
      note || missingImageRequest.trim() || fallbackRequest,
      selectedReferenceGroup?.slot || selectedReference.characterSlot,
      selectedReferenceGroup?.name || selectedReference.name,
      referenceModalPane === "detail" ? "supporting_detail" : "primary_identity",
      selectedReferenceGroup?.role || selectedReference.role,
      referenceModalPane === "detail" ? "supporting_detail" : "primary_identity"
    );
    setReferenceRevisionOpen(false);
    setReferenceRevisionRequest("");
    setMissingImageRequest("");
  }

function revisionDecision(args: { referenceModalPane: "main" | "detail"; referenceRevisionRequest: string; missingImageRequest: string; selectedReference?: VisualReference | null; selectedReferenceDetail?: VisualReference; selectedReferencePrimary?: VisualReference; selectedReferenceHasGenerationData: boolean; selectedReferencePaneJobActive: boolean }) {
  if (!args.selectedReference || args.selectedReferencePaneJobActive) return "blocked";
  const hasImage = args.referenceModalPane === "detail" ? Boolean(args.selectedReferenceDetail) : Boolean(args.selectedReferencePrimary);
  if (hasImage && !args.referenceRevisionRequest.trim()) return "needs_note";
  if (!hasImage && !args.selectedReferenceHasGenerationData && !args.missingImageRequest.trim()) return "dismiss";
  return "queue";
}
function revisionFallback(pane: "main" | "detail") {
  return pane === "detail"
    ? "Generate a standardized character detail sheet from the locked main overview. Use one consistent 3:4 reference-sheet layout: top row front, 3/4 side, side, and back views; right column body proportions; middle row expression set; lower row outfit close-ups, color palette, and concise continuity notes. Keep labels small and do not duplicate the same full-body pose twice."
    : "Generate a clean main front overview from the locked character data. Keep the approved identity, outfit role, and visual style consistent.";
}

function removeReference(runtime: ReferenceGenerationActionsRuntime, referenceId: string, ask = true) {
const { replaceState, setState, removeReference } = runtime;
    if (ask && !window.confirm("Delete this locked reference? This cannot be undone.")) return;
    if (getWorkflowBridge()) {
      getWorkflowBridge().removeReference(referenceId).then(replaceState);
      return;
    }
    setState((current) => ({ ...current, visualReferences: current.visualReferences.filter((item) => item.id !== referenceId) }));
  }

function updateCharacter(runtime: ReferenceGenerationActionsRuntime, patch: Partial<Character>) {
const { character, replaceState, setState, updateCharacter, flagStoryCharacterChange } = runtime;
    const payload = { id: character.id, ...patch };
    flagStoryCharacterChange("Character profile changed.");
    if (getWorkflowBridge()) {
      getWorkflowBridge().updateCharacter(payload).then(replaceState);
      return;
    }
    setState((current) => ({
      ...current,
      characters: current.characters.map((item) => item.id === character.id ? { ...item, ...patch } : item)
    }));
  }

function updateVoiceProfile(runtime: ReferenceGenerationActionsRuntime, patch: Partial<NonNullable<Character["voiceProfile"]>>) {
const { character, productionLanguage, updateCharacter } = runtime;
    const current = character.voiceProfile;
    updateCharacter({
      voiceProfile: {
        provider: current?.provider === "google-flow" ? "macos" : current?.provider ?? "macos",
        voiceId: current?.provider === "google-flow" ? "Linh" : current?.voiceId ?? "Linh",
        voiceName: current?.provider === "google-flow" ? "Linh" : current?.voiceName ?? "Linh",
        modelId: current?.provider === "google-flow" ? "macos-say" : current?.modelId ?? "macos-say",
        language: current?.language ?? productionLanguage,
        stability: current?.stability ?? 0.5,
        similarityBoost: current?.similarityBoost ?? 0.75,
        style: current?.style ?? 0,
        defaultDelivery: current?.defaultDelivery ?? "offscreen_voiceover",
        speakingRateWpm: current?.speakingRateWpm ?? 150,
        previewAssetId: current?.previewAssetId,
        previewEvidence: current?.previewEvidence,
        locked: false,
        castingSource: "manual",
        castingStatus: "auto_assigned",
        ...patch
      }
    });
  }

async function renderVoiceClip(runtime: ReferenceGenerationActionsRuntime, payload: { shotId?: string; characterId: string; text?: string; preview?: boolean }) {
const { project, replaceState } = runtime;
    if (!getWorkflowBridge()) throw new Error("Desktop bridge is unavailable.");
    replaceState(await getWorkflowBridge().generateVoiceClip({ projectId: project.id, ...payload }));
  }

function generateCharacterProfileDraft(runtime: ReferenceGenerationActionsRuntime) {
const { character, updateCharacter } = runtime;
    // Profile suggestions must never invent personality, continuity or backstory.
    // These fields are production contracts: an empty value means the source did
    // not provide evidence yet and must remain editable/empty in the UI.
    const personality = mergeDistinct(character.personality);
    const continuity = mergeDistinct(character.consistencyNotes);
    updateCharacter({
      personality,
      backstory: character.backstory || "",
      consistencyNotes: continuity
    });
  }

function flagStoryCharacterChange(runtime: ReferenceGenerationActionsRuntime, reason: string) {
const { project, setState } = runtime;
    if (!project.storyDocument) return;
    const storyDocument = {
      ...project.storyDocument,
      manuallyEdited: true
    };
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === project.id ? { ...item, storyDocument } : item)
    }));
    void getWorkflowBridge()?.updateProject(project.id, { storyDocument });
    console.debug("Story rewrite enabled by character change:", reason);
  }

type CharacterDraftOptions = {
  reference?: VisualReference;
  request?: string;
  slot?: string;
  name?: string;
  referenceUse?: VisualReference["referenceUse"];
  role?: VisualReference["role"];
  directReferenceUse?: VisualReference["referenceUse"];
};

function uniqueDraftUploads(referenceDraft: ReferenceDraft) {
  const uploads = [
    ...referenceDraft.primaryUploads.map((upload, index) => ({ assetId: `draft_primary_${index}`, filePath: "", base64: upload.dataUrl.split(",")[1], mimeType: upload.file.type || "image/png", filename: upload.file.name || `primary-${index}.png` })),
    ...referenceDraft.detailUploads.map((upload, index) => ({ assetId: `draft_detail_${index}`, filePath: "", base64: upload.dataUrl.split(",")[1], mimeType: upload.file.type || "image/png", filename: upload.file.name || `detail-${index}.png` }))
  ];
  return uploads.filter((item, index, list) => {
    const normalized = item.base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
    return list.findIndex((candidate) => candidate.mimeType === item.mimeType && candidate.base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "") === normalized) === index;
  });
}

function imageDraftProvider(runtime: ReferenceGenerationActionsRuntime) {
  return runtime.state.providers.find((item) => item.id === runtime.safeImageProviderId)
    ?? runtime.state.providers.find((item) => item.id === "chatgpt-web")
    ?? runtime.state.providers[0];
}

function quickVisualDraftContext(runtime: ReferenceGenerationActionsRuntime, semanticSlot: string, storyCharacter?: StoryCharacter) {
  const quickVisual = runtime.intake.quickVisualInput;
  const storySlot = storyCharacter ? normalizeSlotName(storyCharacter.name) : "";
  const primaryStoryCharacter = Boolean(storySlot) && runtime.requiredStoryCharacters.findIndex((item) => normalizeSlotName(item.name) === storySlot) === 0;
  const quickSlot = quickVisual?.characterSlot ? normalizeSlotName(quickVisual.characterSlot) : "";
  const matches = Boolean(quickVisual?.dataUrl) && (!quickSlot || quickSlot === semanticSlot || quickSlot === "main-character" && primaryStoryCharacter);
  return { quickVisual, matches };
}

function firstText(...values: Array<string | undefined>) { return values.find((value) => Boolean(value)) || ""; }
function draftSubjectIdentity(runtime: ReferenceGenerationActionsRuntime, options: CharacterDraftOptions, storyCharacter: StoryCharacter | undefined, quickMatches: boolean, quickVisual: ProjectIntake["quickVisualInput"]) {
  const { character, referenceDraft } = runtime;
  const name = firstText(options.name, storyCharacter?.name, referenceDraft.name, character.name, "Active character");
  const role = firstText(storyCharacter?.role, referenceDraft.role, character.role, "Character");
  const visual = [firstText(storyCharacter?.visualBrief, character.visualDescription, referenceDraft.sourceDescription, "To be designed"), quickMatches && quickVisual ? `Quick input analysis: ${firstText(quickVisual.analysisText, quickVisual.sourceDescription)}` : ""].filter(Boolean).join("\n");
  return { name, role, storyFunction: storyCharacter?.storyFunction || "", visual };
}

function draftReferenceTarget(runtime: ReferenceGenerationActionsRuntime, options: CharacterDraftOptions, selectedSlot: string, name: string, role: string, visual: string) {
  const { character, referenceDraft, requiredStoryCharacters } = runtime;
  const targetUse = options.referenceUse || options.reference?.referenceUse || referenceDraft.referenceUse;
  const targetRole = options.role || options.reference?.role || referenceDraft.role;
  const detailSheet = options.directReferenceUse === "supporting_detail" || targetUse === "supporting_detail";
  const firstSlot = requiredStoryCharacters[0] ? normalizeSlotName(requiredStoryCharacters[0].name) : "";
  const mainSlotName = requiredStoryCharacters[0]?.name || character.name || "main character";
  const currentMainSlot = Boolean(selectedSlot && firstSlot && selectedSlot === firstSlot) || targetRole === "main_character";
  return { currentMainSlot, detailSheet, mainSlotName, objectSubject: isObjectLikeStorySubject(name, role, visual), targetRole, targetUse };
}

function characterDraftContext(runtime: ReferenceGenerationActionsRuntime, options: CharacterDraftOptions) {
  const { currentCharacterSlot, project, referenceDraft, state, storyCharacters, visualRequirements } = runtime;
  const provider = imageDraftProvider(runtime);
  const selectedSlot = options.slot || options.reference?.characterSlot || currentCharacterSlot;
  const requirement = visualRequirements.find((item) => item.id === selectedSlot);
  const semanticSlot = normalizeSlotName(requirement?.name || selectedSlot);
  const storyCharacter = storyCharacters.find((item) => normalizeSlotName(item.name) === semanticSlot);
  const { quickVisual, matches: quickMatches } = quickVisualDraftContext(runtime, semanticSlot, storyCharacter);
  const uploads = uniqueDraftUploads(referenceDraft);
  const { name, role, storyFunction, visual } = draftSubjectIdentity(runtime, options, storyCharacter, quickMatches, quickVisual);
  const styleKey = /\b(?:live[- ]action|photoreal(?:istic)?|phim người đóng|người thật)\b/i.test(project.sourceDraft || "") ? "realistic" : referenceDraft.visualStyle;
  const style = visualStyleInstruction(styleKey);
  const sessionKey = `${project.id}:character:${semanticSlot}`;
  const conversationUrl = options.reference?.providerConversationUrl || latestConversationForSession(state.jobs, project.id, provider.id, sessionKey);
  const hasAttachments = Boolean(options.reference) || uploads.length > 0;
  const { currentMainSlot, detailSheet, mainSlotName, objectSubject, targetRole, targetUse } = draftReferenceTarget(runtime, options, selectedSlot, name, role, visual);
  const identityContract = buildCharacterIdentityContract({ name, role, storyCharacter, character: runtime.character, appearance: visual, visualStyle: styleKey, sourceReference: options.reference });
  return { conversationUrl, currentMainSlot, detailSheet, hasAttachments, identityContract, mainSlotName, name, objectSubject, provider, quickMatches, quickVisual, role, selectedSlot, sessionKey, storyCharacter, storyFunction, style, targetRole, targetUse, uploads, visual };
}

function referenceImageBrief(objectSubject: boolean, detailSheet: boolean) {
  if (detailSheet && objectSubject) return "Generate a new vertical 3:4 object / prop reference sheet image. Use a main front panel, back/side/scale/material close-ups, compact palette and continuity notes. Do not turn the object into a mascot or humanoid unless explicitly alive.";
  if (detailSheet) return "Generate a new vertical 3:4 character detail sheet image. Use one reference-board layout with front, 3/4, side and back views, proportions, 5-7 expressions, outfit/prop close-ups, palette and compact continuity notes. Preserve the locked identity.";
  if (objectSubject) return "Generate a new vertical 3:4 standalone object / prop identity image. Show the complete object on a neutral background with readable silhouette and no invented mascot or human.";
  return "Generate a new vertical 3:4 full-body character image. Show the entire head-to-toe character in a neutral front or slight 3/4 standing pose with margin, readable silhouette and no crop.";
}

function safeCharacterRequest(request: string, hasAttachments: boolean) {
  return request
    .replace(/\blocked primary identity reference\b/gi, hasAttachments ? "production character image" : "original production character image")
    .replace(/\bprimary identity reference\b/gi, hasAttachments ? "production character image" : "original production character image")
    .replace(/\blocked identity\b/gi, "final character identity")
    .replace(/\breference\b/gi, hasAttachments ? "visual guide" : "character design")
    .replace(/\bquick visual input\b|\bquick input\b/gi, hasAttachments ? "attached visual guidance" : "written visual direction")
    .replace(/\battached visual guid(?:ance|e)\b/gi, hasAttachments ? "$&" : "written visual direction");
}

function characterReferencePlan(options: CharacterDraftOptions, context: ReturnType<typeof characterDraftContext>) {
  const quickPlan = context.quickMatches && context.quickVisual ? `- Quick visual analysis for this project: ${context.quickVisual.analysisText || context.quickVisual.sourceDescription}. ${context.quickVisual.transformationRequest}` : "";
  return [quickPlan, ...(options.reference ? [options.reference] : []).map((item) => `- ${item.name}: ${formatLabel(item.referenceUse || "supporting_detail")} ${item.characterSlot ? `for ${item.characterSlot}` : ""}. ${item.sourceDescription || ""} ${item.transformationRequest || ""}`)]
    .filter(Boolean).join("\n") || (context.uploads.length ? "- Use only the attached draft upload(s) from the current Primary identity / Detail ref boxes." : "- No visual reference is attached. Use only the written character profile.");
}

function characterDraftPrompt(runtime: ReferenceGenerationActionsRuntime, options: CharacterDraftOptions, context: ReturnType<typeof characterDraftContext>) {
  const { referenceDraft } = runtime;
  const request = safeCharacterRequest(options.request || options.reference?.transformationRequest || referenceDraft.transformationRequest || "Generate a clean front-facing overview suitable for approval.", context.hasAttachments);
  const isolation = `Subject to generate: ${context.name}.\nRole in story: ${context.role}.\nGenerate only this subject. ${context.currentMainSlot ? "This is the main production character." : `This is not the main production character. ABSOLUTE EXCLUSION: show exactly one subject, ${context.name}; never draw ${context.mainSlotName}, a companion, reflection, silhouette, or another body part.`}`;
  const identity = `${isolation}\n${formatCharacterIdentityContract(context.identityContract)}`;
  if (!context.hasAttachments && !context.detailSheet) {
    const subjectType = context.objectSubject ? "object/prop" : "full-body character";
    return `Create one original vertical 3:4 ${subjectType} reference image from this text prompt.\n\nUse the written description as the complete source. Produce a new image, not a chat reply.\n\n${identity}\nCreative direction: ${request}\n\nComposition: full subject visible, readable silhouette, soft studio lighting, simple background, no unrelated character, text label, or UI screenshot.\n\nOutput exactly one new image. Do not write captions, explanations, or JSON.`;
  }
  const plan = characterReferencePlan(options, context);
  return `${referenceImageBrief(context.objectSubject, context.detailSheet)}\n\n${identity}\n${context.hasAttachments ? "Visual guidance" : "Creative direction"}: ${request}\n\nAttached visual guidance:\n${plan}\n\nPrimary identity controls identity and proportions; supporting detail controls clothing, prop, pose or texture; style cues never override identity.\n\nOutput one new image only. Do not write captions, explanations, or JSON.`;
}

function dispatchCharacterDraft(runtime: ReferenceGenerationActionsRuntime, options: CharacterDraftOptions, context: ReturnType<typeof characterDraftContext>, prompt: string) {
  const { project, projectAssets, projectReferences, replaceState, runDemoJob, state } = runtime;
  const jobId = makeId("character");
  const requested = options.reference ? [{ assetId: options.reference.id, filePath: options.reference.filePath }] : context.uploads;
  const references = referencesMissingFromConversation(requested, context.conversationUrl, state.jobs, projectAssets, projectReferences);
  const payload: RunJobPayload = {
    jobId, projectId: project.id, providerId: context.provider.id, jobType: "image", prompt,
    bridgeMessage: {
      type: "RUN_JOB", jobId, provider: context.provider.platform, task: "text_to_image", prompt, conversationUrl: context.conversationUrl, references,
      settings: { aspectRatio: "3:4", durationSec: 4, quality: "balanced", newConversation: !context.conversationUrl, sessionKey: context.sessionKey, characterSlot: context.selectedSlot, characterName: context.name, referenceUse: context.targetUse, referenceRole: context.targetRole, directReferenceUse: options.directReferenceUse, directReferenceNote: options.request, identityContract: context.identityContract, referenceTransport: options.reference ? (references.length ? "native_upload" : "conversation_context") : references.length ? "native_upload" : "none", visualStyle: context.identityContract.visualStyle },
      download: { auto: true, targetFolder: `/data/projects/${project.id}/characters`, filenameTemplate: "character-candidate" }
    }
  };
  if (getWorkflowBridge()) getWorkflowBridge().runJob(payload).then(replaceState);
  else runDemoJob(payload);
}

function queueCharacterImageDraft(runtime: ReferenceGenerationActionsRuntime, reference?: VisualReference, overrideRequest?: string, overrideSlot?: string, overrideName?: string, overrideReferenceUse?: VisualReference["referenceUse"], overrideRole?: VisualReference["role"], directReferenceUse?: VisualReference["referenceUse"]) {
  const options: CharacterDraftOptions = { reference, request: overrideRequest, slot: overrideSlot, name: overrideName, referenceUse: overrideReferenceUse, role: overrideRole, directReferenceUse };
  const context = characterDraftContext(runtime, options);
  dispatchCharacterDraft(runtime, options, context, characterDraftPrompt(runtime, options, context));
}

async function uploadSelectedReferenceReplacement(runtime: ReferenceGenerationActionsRuntime, file: File) {
const { project, referenceModalPane, replaceState, selectedReference, selectedReferenceGroup, setState, removeReference } = runtime;
    if (!selectedReference || !file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const payload = replacementPayload(project.id, referenceModalPane, selectedReference, selectedReferenceGroup, dataUrl, file.type || "image/png");
    const toReplace = referencesToReplace(selectedReference, selectedReferenceGroup, payload);
    if (getWorkflowBridge()) {
      for (const reference of toReplace) await getWorkflowBridge().removeReference(reference.id);
      replaceState(await getWorkflowBridge().addReference(payload));
      return;
    }
    const reference: VisualReference = {
      id: makeId("reference"),
      projectId: project.id,
      name: payload.name,
      role: payload.role,
      referenceUse: payload.referenceUse,
      characterSlot: payload.characterSlot,
      filePath: payload.name,
      previewDataUrl: dataUrl,
      sourceDescription: payload.sourceDescription,
      transformationRequest: payload.transformationRequest,
      createdAt: new Date().toISOString()
    };
    setState((current) => ({
      ...current,
      visualReferences: [...current.visualReferences.filter((item) => !toReplace.some((old) => old.id === item.id)), reference]
    }));
  }

function replacementPayload(projectId: string, pane: "main" | "detail", selected: VisualReference, group: ReferenceGroup | undefined, dataUrl: string, mimeType: string): ReferenceUploadPayload {
  const referenceUse: VisualReference["referenceUse"] = pane === "detail" ? "supporting_detail" : "primary_identity";
  return { projectId, name: pane === "detail" ? `${group?.name || selected.name} detail sheet` : selected.name, role: group?.role || selected.role, referenceUse, characterSlot: group?.slot || selected.characterSlot, dataUrl, mimeType, sourceDescription: selected.sourceDescription, transformationRequest: `${selected.transformationRequest || "Manual replacement."}\nUploaded replacement for ${pane === "detail" ? "detail sheet" : "main overview"}.` };
}
function referencesToReplace(selected: VisualReference, group: ReferenceGroup | undefined, payload: ReferenceUploadPayload) {
  return group?.references.filter((reference) => reference.referenceUse === payload.referenceUse && reference.role === payload.role && reference.characterSlot === payload.characterSlot) || [selected];
}

export function createReferenceGenerationActions(deps: ReferenceGenerationDependencies) {
  const runtime = { ...deps } as ReferenceGenerationActionsRuntime;
  const actions = {
    requestMissingReferenceImage: () => requestMissingReferenceImage(runtime),
    requestSelectedReferenceRevision: () => requestSelectedReferenceRevision(runtime),
    removeReference: (referenceId: string, ask = true) => removeReference(runtime, referenceId, ask),
    updateCharacter: (patch: Partial<Character>) => updateCharacter(runtime, patch),
    updateVoiceProfile: (patch: Partial<NonNullable<Character["voiceProfile"]>>) => updateVoiceProfile(runtime, patch),
    renderVoiceClip: async (payload: { shotId?: string; characterId: string; text?: string; preview?: boolean }) => await renderVoiceClip(runtime, payload),
    generateCharacterProfileDraft: () => generateCharacterProfileDraft(runtime),
    flagStoryCharacterChange: (reason: string) => flagStoryCharacterChange(runtime, reason),
    queueCharacterImageDraft: (reference?: VisualReference, overrideRequest?: string, overrideSlot?: string, overrideName?: string, overrideReferenceUse?: VisualReference["referenceUse"], overrideRole?: VisualReference["role"], directReferenceUse?: VisualReference["referenceUse"]) => queueCharacterImageDraft(runtime, reference, overrideRequest, overrideSlot, overrideName, overrideReferenceUse, overrideRole, directReferenceUse),
    uploadSelectedReferenceReplacement: async (file: File) => await uploadSelectedReferenceReplacement(runtime, file)
  };
  Object.assign(runtime, actions);
  return actions;
}
