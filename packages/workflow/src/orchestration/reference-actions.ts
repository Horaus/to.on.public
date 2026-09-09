import { getWorkflowBridge } from "../workflow-bridge";
import type { Asset, BrowserProviderAdapter, Character, Project, ProjectIntake, ReferenceRole, StoryCharacter, StudioState, VisualReference } from "@studio/types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import React from "react";
import { compactSentence } from "@studio/workflow/character-utils";
import { normalizeSlotName } from "@studio/domain/identifiers";
import type { RunJobPayload } from "@studio/workflow/support-core";
import type { ReferenceUploadPayload, VideoAspectRatio } from "@studio/workflow/studio-types";
import type { ReferenceWorkspace } from "@studio/workflow/reference-workspace";

type VisualRequirement = NonNullable<NonNullable<Project["storyDocument"]>["visualRequirements"]>[number];
type WorkspaceDependencies = Pick<ReferenceWorkspace,
  "activeCharacterSlot" | "candidateEdit" | "detailUploadInputRef" | "primaryUploadInputRef" |
  "quickReferenceNote" | "quickReferenceUpload" | "referenceCandidates" | "referenceDraft" |
  "setActiveCharacterSlot" | "setPreviewRevisionOpen" | "setPreviewUpload" | "setQuickReferenceUpload" |
  "setReferenceCandidates" | "setReferenceDraft"
>;

type ReferenceActionDependencies = WorkspaceDependencies & {
  assetFrameAspectRatio: (role: VisualReference["role"]) => VideoAspectRatio | undefined;
  character: Character;
  currentCharacterSlot: string;
  flagStoryCharacterChange: (reason: string) => void;
  formatLabel: (value: string) => string;
  imagePreviewSrc: (asset: Asset) => string;
  intake: ProjectIntake;
  intakeRef: RefObject<ProjectIntake | null>;
  isCharacterDetailRequirement: (requirement: VisualRequirement) => boolean;
  makeId: (prefix: string) => string;
  productionLanguage: string;
  project: Project;
  projectReferences: VisualReference[];
  queueCharacterImageDraft: (
    reference?: VisualReference,
    overrideRequest?: string,
    overrideSlot?: string,
    overrideName?: string,
    overrideReferenceUse?: VisualReference["referenceUse"],
    overrideRole?: VisualReference["role"],
    directReferenceUse?: VisualReference["referenceUse"]
  ) => void;
  readFileAsDataUrl: (file: File) => Promise<string>;
  replaceState: (state: StudioState) => void;
  requiredStoryCharacters: StoryCharacter[];
  setState: Dispatch<SetStateAction<StudioState>>;
  state: StudioState;
  storyCharacters: StoryCharacter[];
  textProvider: BrowserProviderAdapter;
  updateCharacter: (patch: Partial<Character>) => void;
  visualRequirements: VisualRequirement[];
};

let runtime: ReferenceActionDependencies;
let activeCharacterSlot: ReferenceActionDependencies["activeCharacterSlot"];
let character: ReferenceActionDependencies["character"];
let currentCharacterSlot: ReferenceActionDependencies["currentCharacterSlot"];
let flagStoryCharacterChange: ReferenceActionDependencies["flagStoryCharacterChange"];
let formatLabel: ReferenceActionDependencies["formatLabel"];
let intake: ReferenceActionDependencies["intake"];
let makeId: ReferenceActionDependencies["makeId"];
let projectReferences: ReferenceActionDependencies["projectReferences"];
let referenceDraft: ReferenceActionDependencies["referenceDraft"];
let replaceState: ReferenceActionDependencies["replaceState"];
let requiredStoryCharacters: ReferenceActionDependencies["requiredStoryCharacters"];
let setPreviewUpload: ReferenceActionDependencies["setPreviewUpload"];
let setReferenceCandidates: ReferenceActionDependencies["setReferenceCandidates"];
let setReferenceDraft: ReferenceActionDependencies["setReferenceDraft"];
let setState: ReferenceActionDependencies["setState"];
let storyCharacters: ReferenceActionDependencies["storyCharacters"];

function applyStoryCharacter(item: StoryCharacter, mode: "primary" | "supporting") {
    const { setActiveCharacterSlot, setReferenceDraft, flagStoryCharacterChange, updateCharacter } = runtime;
    const slot = normalizeSlotName(item.name);
    const visual = compactSentence(item.visualBrief);
    setActiveCharacterSlot(slot);
    const role: ReferenceRole = mode === "primary" ? "main_character" : "supporting_character";
    const referenceUse: VisualReference["referenceUse"] = "primary_identity";
    setReferenceDraft((current) => ({
      ...current,
      name: item.name,
      role,
      referenceUse,
      visualStyle: current.visualStyle,
      characterSlot: slot,
      sourceDescription: visual,
      transformationRequest: ""
    }));
    updateCharacter({
      name: item.name,
      role: item.role,
      visualDescription: visual,
      outfit: "",
      personality: "",
      consistencyNotes: item.required
        ? "Keep this role visually consistent across every generated scene."
        : "Use this character only when the scene needs the supporting role."
    });
  }

function chooseStoryCharacter(slot: string) {
    const { setActiveCharacterSlot, storyCharacters, applyStoryCharacter: unused } = runtime as ReferenceActionDependencies & { applyStoryCharacter?: never };
    void unused;
    const item = storyCharacters.find((storyItem) => normalizeSlotName(storyItem.name) === slot);
    if (!item) {
      setActiveCharacterSlot("");
      setReferenceDraft((current) => ({ ...current, characterSlot: "" }));
      return;
    }
    const firstRequiredSlot = requiredStoryCharacters[0] ? normalizeSlotName(requiredStoryCharacters[0].name) : "";
    const mode = slot && slot !== firstRequiredSlot
      ? "supporting"
      : "primary";
    applyStoryCharacter(item, mode);
  }

function clearCharacterProfile() {
    const { character, setActiveCharacterSlot, setReferenceDraft, updateCharacter } = runtime;
    updateCharacter({
      name: "",
      role: "",
      visualDescription: "",
      outfit: "",
      personality: "",
      backstory: "",
      consistencyNotes: ""
    });
    setReferenceDraft((current) => ({
      ...current,
      name: "",
      role: "main_character",
      referenceUse: "primary_identity",
      visualStyle: "realistic",
      characterSlot: "",
      sourceDescription: "",
      transformationRequest: "",
      primaryUploads: [],
      detailUploads: []
    }));
    setActiveCharacterSlot("");
  }

function clearDraftUpload(kind: "primary" | "detail") {
    const { setPreviewUpload, primaryUploadInputRef, detailUploadInputRef } = runtime;
    setReferenceDraft((current) => kind === "primary"
      ? { ...current, primaryUploads: [] }
      : { ...current, detailUploads: [] });
  }

async function setDraftUploads(kind: "primary" | "detail", files: File[]) {
    const { readFileAsDataUrl, setPreviewUpload } = runtime;
    if (files.length === 0) return;
    const uploads = await Promise.all(files.map(async (file) => ({
      file,
      dataUrl: await readFileAsDataUrl(file)
    })));
    setReferenceDraft((current) => kind === "primary"
      ? { ...current, primaryUploads: uploads.slice(0, 1) }
      : { ...current, detailUploads: uploads.slice(0, 2) });
  }

async function setQuickReferenceFile(files: File[]) {
    const { readFileAsDataUrl, setQuickReferenceUpload } = runtime;
    const file = files[0];
    if (!file) return;
    setQuickReferenceUpload({
      file,
      dataUrl: await readFileAsDataUrl(file)
    });
  }

async function stageQuickVisualInputForProject() {
    const { quickReferenceUpload, quickReferenceNote, intakeRef, intake, project, replaceState } = runtime;
    if (!quickReferenceUpload) return false;
    const note = quickReferenceNote.trim();
    const characterSlot = activeCharacterSlot || currentCharacterSlot || normalizeSlotName(character.name || storyCharacters[0]?.name || "main-character");
    const quickVisualInput: ProjectIntake["quickVisualInput"] = {
      name: quickReferenceUpload.file.name || "Quick visual input",
      characterSlot,
      dataUrl: quickReferenceUpload.dataUrl,
      mimeType: quickReferenceUpload.file.type || "image/png",
      sourceDescription: note,
      transformationRequest: "Use this only as input analysis guidance for character identity, style, proportions, and mood. Do not lock it as a production reference and do not copy the original background unless explicitly requested.",
      updatedAt: new Date().toISOString()
    };
    const nextIntake = { ...(intakeRef.current ?? intake), quickVisualInput };
    intakeRef.current = nextIntake;
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === project.id ? { ...item, intake: nextIntake } : item)
    }));
    if (getWorkflowBridge()) {
      replaceState(await getWorkflowBridge().updateProject(project.id, { intake: nextIntake }));
    }
    return true;
  }

function needsQuickVisualAnalysis(sourceIntake = runtime.intake) {
    const quickVisualInput = sourceIntake.quickVisualInput;
    return Boolean(
      quickVisualInput?.dataUrl &&
      String(quickVisualInput.mimeType || "image/png").startsWith("image/") &&
      !quickVisualInput.analysisText?.trim()
    );
  }

function queueQuickVisualAnalysisJob(sourceIntake = runtime.intake) {
    const { project, textProvider, productionLanguage, replaceState, state } = runtime;
    const quickVisualInput = sourceIntake.quickVisualInput;
    if (!quickVisualInput?.dataUrl) return false;
    const provider = textProvider;
    const jobId = makeId("visual_analysis");
    const mimeType = quickVisualInput.mimeType || "image/png";
    const promptText = `Analyze the attached user input image for a new AI video project.

This is an analysis task only. Do not generate an image. Do not edit the image. Do not write a story yet.
If the image is not visibly attached to this message, reply exactly: MISSING_IMAGE_ATTACHMENT.

User note:
${quickVisualInput.sourceDescription || "No note supplied."}

Requested interpretation:
${quickVisualInput.transformationRequest || "Use as loose direction for character/style only."}

Return concise plain text with these sections:
SUBJECTS: visible subject(s), species/body type, age/role cues, posture, proportions.
STYLE: rendering style, material, palette, lighting, level of realism.
CHARACTER DIRECTION: what the future generated character(s) should preserve, and what should not be copied.
BACKGROUND DIRECTION: whether the background should be reused, ignored, or transformed.
RISKS: ambiguity, inconsistent body type risk, missing information.

Keep this project isolated. Do not reuse details from other projects or prior chats.`;
    const payload: RunJobPayload = {
      jobId,
      projectId: project.id,
      providerId: provider.id,
      jobType: "text",
      prompt: promptText,
      bridgeMessage: {
        type: "RUN_JOB",
        jobId,
        provider: provider.platform,
        task: "quick_visual_analysis",
        prompt: promptText,
        references: [{
          assetId: "quick_visual_input",
          filePath: "",
          base64: quickVisualInput.dataUrl.split(",")[1],
          mimeType,
          filename: quickVisualInput.name || "quick-visual-input.png"
        }],
        settings: {
          aspectRatio: intake.videoFrame?.aspectRatio || "9:16",
          durationSec: 4,
          quality: "balanced",
          newConversation: true,
          sessionKey: `${project.id}:quick-visual-analysis`,
          outputLanguage: productionLanguage
        },
        download: {
          auto: false,
          targetFolder: `/data/projects/${project.id}/intake`,
          filenameTemplate: "quick-visual-analysis"
        }
      }
    };
    if (getWorkflowBridge()) {
      getWorkflowBridge().runJob(payload).then(replaceState);
      return true;
    }
    return false;
  }

function openUploadTile(kind: "primary" | "detail", event: React.MouseEvent<HTMLButtonElement>) {
    const { primaryUploadInputRef, detailUploadInputRef } = runtime;
    const upload = kind === "primary" ? referenceDraft.primaryUploads[0] : referenceDraft.detailUploads[0];
    if (!upload || event.metaKey || event.ctrlKey) {
      (kind === "primary" ? primaryUploadInputRef : detailUploadInputRef).current?.click();
      return;
    }
    setPreviewUpload({
      title: kind === "primary" ? "Reference nhận diện chính" : "Reference chi tiết / thay đổi",
      dataUrl: upload.dataUrl,
      note: kind === "primary"
        ? "Chủ thể chính, gương mặt, cơ thể, loài, dáng người. Nhấn command-click trên ô để thay ảnh."
        : "Trang phục, đạo cụ, chất liệu, dáng. Nhấn command-click trên ô để thay chi tiết."
    });
  }

async function stageReferenceCandidates() {
    const { referenceCandidates, referenceDraft, project, replaceState } = runtime;
    const uploadItems = [
      ...referenceDraft.primaryUploads.map((upload) => ({ ...upload, use: "primary_identity" as VisualReference["referenceUse"], suffix: "primary" })),
      ...referenceDraft.detailUploads.map((upload) => ({ ...upload, use: "supporting_detail" as VisualReference["referenceUse"], suffix: "detail" }))
    ];
    if (uploadItems.length === 0) return;
    const nextCandidates = uploadItems.map(({ file, dataUrl, use, suffix }, index) => ({
      id: makeId("candidate"),
      name: referenceDraft.name.trim() || file.name.replace(/\.[^.]+$/, "") || `Reference ${index + 1}`,
      dataUrl,
      mimeType: file.type || "image/png",
      role: referenceDraft.role,
      referenceUse: use || referenceDraft.referenceUse,
      characterSlot: referenceDraft.characterSlot || activeCharacterSlot,
      sourceDescription: referenceDraft.sourceDescription.trim(),
      transformationRequest: `${referenceDraft.transformationRequest.trim()}${referenceDraft.transformationRequest.trim() ? "\n" : ""}Reference slot: ${suffix}.`
    }));
    setReferenceCandidates((current) => [...nextCandidates, ...current]);
    setReferenceDraft((current) => ({ ...current, primaryUploads: [], detailUploads: [] }));
  }

async function confirmReferenceCandidate(candidateId: string) {
    const { referenceCandidates, referenceDraft, project, replaceState, setReferenceCandidates } = runtime;
    const candidate = referenceCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    const payload: ReferenceUploadPayload = {
      projectId: project.id,
      name: candidate.name,
      role: candidate.role,
      referenceUse: candidate.referenceUse,
      characterSlot: candidate.characterSlot,
      dataUrl: candidate.dataUrl,
      mimeType: candidate.mimeType,
      sourceDescription: candidate.sourceDescription,
      transformationRequest: candidate.transformationRequest
    };
    if (getWorkflowBridge()) {
      replaceState(await getWorkflowBridge().addReference(payload));
    } else {
      const reference: VisualReference = {
        id: makeId("reference"),
        projectId: project.id,
        name: payload.name,
        role: payload.role,
        referenceUse: payload.referenceUse,
        characterSlot: payload.characterSlot,
        filePath: payload.name,
        previewDataUrl: candidate.dataUrl,
        sourceDescription: payload.sourceDescription,
        transformationRequest: payload.transformationRequest,
        createdAt: new Date().toISOString()
      };
      setState((current) => ({ ...current, visualReferences: [...current.visualReferences, reference] }));
    }
    if (candidate.role === "main_character" || candidate.role === "supporting_character") {
      flagStoryCharacterChange(`Reference "${candidate.name}" was added as ${formatLabel(candidate.referenceUse || "supporting_detail")}.`);
    }
    setReferenceCandidates((current) => current.filter((item) => item.id !== candidateId));
  }

async function confirmGeneratedAssetAsReference(asset: Asset) {
    const { imagePreviewSrc } = runtime;
    const previewSrc = imagePreviewSrc(asset);
    if (!asset.filePath && !previewSrc) return;
    const { payload, referencesToReplace } = generatedReferencePayload(asset, previewSrc);
    await persistGeneratedReference(payload, referencesToReplace, previewSrc);
    flagStoryCharacterChange(`Generated image "${asset.id}" was confirmed as a character reference.`);
  }

function generatedReferenceSettings(asset: Asset) {
  const sourceJob = runtime.state.jobs.find((job) => job.id === asset.sourceJobId);
  return sourceJob?.input && typeof sourceJob.input === "object" && "bridgeMessage" in sourceJob.input
    ? (sourceJob.input as RunJobPayload).bridgeMessage.settings : undefined;
}

function canonicalReferenceRequirement(settingsName: string, settingsSlot: string, settingsRole: VisualReference["role"]) {
  const matchesRole = (requirement: VisualRequirement) => requirement.role === settingsRole && !runtime.isCharacterDetailRequirement(requirement);
  return runtime.visualRequirements.find((requirement) => matchesRole(requirement) &&
    (requirement.id === settingsSlot || requirement.name.toLowerCase().includes(settingsName.toLowerCase())))
    ?? runtime.visualRequirements.find(matchesRole);
}

function generatedReferencePayload(asset: Asset, previewSrc: string) {
    const { project, assetFrameAspectRatio } = runtime;
    const settings = generatedReferenceSettings(asset);
    const settingsName = settings?.characterName || `Character candidate ${asset.id.replace(/^asset_?/, "").slice(0, 6)}`;
    const settingsSlot = settings?.characterSlot || normalizeSlotName(settingsName);
    const settingsRole = (settings?.referenceRole as VisualReference["role"]) || referenceDraft.role;
    const canonicalCharacterRequirement = canonicalReferenceRequirement(settingsName, settingsSlot, settingsRole);
    const payload: ReferenceUploadPayload = {
      projectId: project.id,
      name: `${settingsName} AI candidate`,
      role: settingsRole,
      referenceUse: (settings?.referenceUse as VisualReference["referenceUse"]) || referenceDraft.referenceUse,
      characterSlot: canonicalCharacterRequirement?.id || settingsSlot,
      dataUrl: asset.filePath?.startsWith("data:image/") ? asset.filePath : "",
      filePath: asset.filePath,
      previewDataUrl: previewSrc,
      mimeType: String(asset.metadata?.mimeType || "image/png"),
      sourceDescription: "Ảnh AI đã chọn làm reference nhận diện; dùng để giữ gương mặt, dáng và trang phục nhìn thấy.",
      transformationRequest: "Giữ nguyên nhận diện nhìn thấy trong ảnh đã duyệt.",
      sourceAssetId: asset.id,
      sourceProvider: asset.sourceProvider,
      sourceAspectRatio: assetFrameAspectRatio((settings?.referenceRole as VisualReference["role"]) || referenceDraft.role) || settings?.aspectRatio
    };
    const referencesToReplace = projectReferences.filter((item) =>
      item.characterSlot === payload.characterSlot &&
      item.referenceUse === payload.referenceUse &&
      item.role === payload.role
    );
    return { payload, referencesToReplace };
  }

async function persistGeneratedReference(payload: ReferenceUploadPayload, referencesToReplace: VisualReference[], previewSrc: string) {
    const { project, makeId, replaceState } = runtime;
    if (getWorkflowBridge()) {
      for (const reference of referencesToReplace) {
        await getWorkflowBridge().removeReference(reference.id);
      }
      replaceState(await getWorkflowBridge().addReference(payload));
    } else {
      const reference: VisualReference = {
        id: makeId("reference"),
        projectId: project.id,
        name: payload.name,
        role: payload.role,
        referenceUse: payload.referenceUse,
        characterSlot: payload.characterSlot,
        filePath: payload.name,
        previewDataUrl: previewSrc,
        sourceDescription: payload.sourceDescription,
        transformationRequest: payload.transformationRequest,
        sourceAssetId: payload.sourceAssetId,
        sourceProvider: payload.sourceProvider,
        sourceAspectRatio: payload.sourceAspectRatio,
        createdAt: new Date().toISOString()
      };
      setState((current) => ({
        ...current,
        visualReferences: [
          ...current.visualReferences.filter((item) => !referencesToReplace.some((referenceToReplace) => referenceToReplace.id === item.id)),
          reference
        ]
      }));
    }
  }

function removeGeneratedAsset(assetId: string) {
    const { setState } = runtime;
    if (!window.confirm("Delete this generated image?")) return;
    if (getWorkflowBridge()) {
      getWorkflowBridge().removeAsset(assetId).then(replaceState);
      return;
    }
    setState((current) => ({
      ...current,
      assets: current.assets.filter((asset) => asset.id !== assetId),
      jobs: current.jobs.map((job) => ({ ...job, resultAssetIds: job.resultAssetIds.filter((idValue) => idValue !== assetId) }))
    }));
  }

function removeGeneratedAssetGroup(assetIds: string[]) {
    const { setState } = runtime;
    if (!window.confirm(`Delete this generated image group (${assetIds.length} image${assetIds.length === 1 ? "" : "s"})?`)) return;
    if (getWorkflowBridge()) {
      void Promise.all(assetIds.map((assetId) => getWorkflowBridge()!.removeAsset(assetId))).then((states) => {
        const latest = states.at(-1);
        if (latest) replaceState(latest);
      });
      return;
    }
    setState((current) => ({
      ...current,
      assets: current.assets.filter((asset) => !assetIds.includes(asset.id)),
      jobs: current.jobs.map((job) => ({ ...job, resultAssetIds: job.resultAssetIds.filter((idValue) => !assetIds.includes(idValue)) }))
    }));
  }

function regenerateGeneratedAsset(asset: Asset) {
    const { candidateEdit, setPreviewRevisionOpen, state, setReferenceDraft, projectReferences, queueCharacterImageDraft } = runtime;
    const note = candidateEdit[asset.id]?.trim();
    if (!note) {
      setPreviewRevisionOpen(true);
      return;
    }
    const sourceJob = state.jobs.find((job) => job.id === asset.sourceJobId);
    const settings = sourceJob?.input && typeof sourceJob.input === "object" && "bridgeMessage" in sourceJob.input
      ? (sourceJob.input as RunJobPayload).bridgeMessage.settings
      : undefined;
    setReferenceDraft((current) => ({
      ...current,
      name: settings?.characterName || current.name,
      characterSlot: settings?.characterSlot || current.characterSlot,
      referenceUse: (settings?.referenceUse as VisualReference["referenceUse"]) || current.referenceUse,
      transformationRequest: note
    }));
    const sourceReference = projectReferences.find((item) => item.characterSlot === settings?.characterSlot && item.referenceUse === "primary_identity");
    queueCharacterImageDraft(sourceReference, note, settings?.characterSlot, settings?.characterName);
    setPreviewRevisionOpen(false);
  }
export function createReferenceActions(deps: ReferenceActionDependencies) {
  runtime = deps;
  ({ activeCharacterSlot, character, currentCharacterSlot, flagStoryCharacterChange, formatLabel, intake, makeId,
    projectReferences, referenceDraft, replaceState, requiredStoryCharacters, setPreviewUpload,
    setReferenceCandidates, setReferenceDraft, setState, storyCharacters } = deps);
  return { applyStoryCharacter, chooseStoryCharacter, clearCharacterProfile, clearDraftUpload, setDraftUploads, setQuickReferenceFile, stageQuickVisualInputForProject, needsQuickVisualAnalysis, queueQuickVisualAnalysisJob, openUploadTile, stageReferenceCandidates, confirmReferenceCandidate, confirmGeneratedAssetAsReference, removeGeneratedAsset, removeGeneratedAssetGroup, regenerateGeneratedAsset };
}
