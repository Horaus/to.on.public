import type { BrowserProviderAdapter, ProductionGraphCustomNode, ProductionGraphRevision, Project, ProjectIntake, Shot, SkillPack, StudioState, VisualReference, VisualRequirement } from "@studio/workflow/renderer-contracts";
import type { RefObject } from "react";
import { useEffect } from "react";
import { latestConversationForSession, type RunJobPayload } from "@studio/domain/job-contracts";
import { assetFrameAspectRatio } from "@studio/renderer-core/production-ui-support";
import { makeId } from "@studio/renderer-core/runtime-id";
import type { CanvasDocument } from "@studio/types";
import { skillInstructionForStage } from "@studio/workflow/video-generation";
import { buildCharacterIdentityContract, formatCharacterIdentityContract } from "@studio/workflow/character-identity-contract";
import { referencesMissingFromConversation } from "@studio/workflow/support-core";
import { getWorkflowBridge } from "@studio/workflow/workflow-bridge";

type ProductionGraphControllerArgs = {
  state: StudioState; project: Project; intake: ProjectIntake; visualRequirements: VisualRequirement[];
  isCharacterDetailRequirement: (requirement: VisualRequirement) => boolean;
  referenceForRequirement: (requirementId: string) => VisualReference | undefined;
  replaceState: (state: StudioState) => void; updateProjectPatch: (patch: Partial<Project>) => void;
  updateIntake: (patch: Partial<ProjectIntake>) => void;
  updateScene: (patch: { id: string; flowText?: string }) => void; updateShot: (patch: Partial<Shot> & { id: string }) => void;
  appliedGraphRevisionJobsRef: RefObject<Set<string>>; textProvider: BrowserProviderAdapter;
  selectedVideoSkill?: SkillPack; productionLanguage: string;
};

let runtime: ProductionGraphControllerArgs;

function graphAspectInstruction(aspectRatio: string) {
  if (aspectRatio === "16:9") return "Generate exactly one horizontal landscape image on a true 16:9 canvas (for example 1536x864). Compose all required content safely inside the wide frame. Do not output a portrait or square canvas.";
  if (aspectRatio === "9:16") return "Generate exactly one vertical portrait image on a true 9:16 canvas (for example 864x1536). Do not output a landscape or square canvas.";
  if (aspectRatio === "3:4") return "Generate exactly one upright character asset on a true 3:4 canvas (for example 1200x1600). Keep the complete character, silhouette, clothing, hands, and feet safely inside the frame with balanced headroom. Do not crop body parts and do not output a 9:16, landscape, or square canvas.";
  return `Generate exactly one image on a true ${aspectRatio} canvas. The output pixel dimensions must match this ratio.`;
}

function graphSubjectInstruction(requirement: VisualRequirement | undefined) {
  if (requirement?.role === "prop") return `This is a catalog-style prop identity reference, not a story scene. Show exactly one rendering of the named prop on a plain neutral background. Do not include any person, animal, hand, body part, location, rain scene, action sequence, text, labels, split view, before/after comparison, collage, or second object. ${requirement.baseReferenceRequirementId ? "Render only the requested transformed variant state." : "Render only the initial/base state; ignore any later, final, damaged, moved, or transformed state mentioned for continuity."}`;
  if (requirement?.role === "location") return "This is an empty environment identity reference. Show the location and fixed geography only. Do not include any person, animal, character silhouette, or story action. Use restrained neutral overhead practical lighting with soft contrast and a readable exposure: night does not mean underexposed or near-black; preserve visible walls, controls, surfaces, and spatial depth. Treat this as the locked default and do not ask about lighting.";
  return requirement ? "This is a single-subject identity reference. Show only the named character or animal. Do not include another person, animal, prop interaction, story action, text, labels, or collage." : "";
}

function buildGraphImagePrompt(node: ProductionGraphCustomNode, requirement: VisualRequirement | undefined, orientationInstruction: string, identityContract?: ReturnType<typeof buildCharacterIdentityContract>) {
  const subjectInstruction = graphSubjectInstruction(requirement);
  const contractText = identityContract ? `\n\nLOCKED CHARACTER CONTRACT\n${formatCharacterIdentityContract(identityContract)}` : "";
  return `${orientationInstruction}${subjectInstruction ? `\n\n${subjectInstruction}` : ""}${contractText}\n\n${String(node.text || "").trim()}\n\nGenerate the image now using only the locked description and references above. Do not ask a clarification question, offer options, or wait for confirmation; choose the specified/locked identity details and return exactly one image. If any visual detail is underspecified (including lighting, palette, lens, or time of day), choose a restrained neutral default that preserves the locked geography and identity; never ask the user to choose.`;
}

function buildGraphImageReferences(requirementId: string | undefined, referenceForRequirement: (id: string) => VisualReference | undefined) {
  const sourceReference = requirementId ? referenceForRequirement(requirementId) : undefined;
  return sourceReference?.filePath ? [{ assetId: sourceReference.id, filePath: sourceReference.filePath }] : [];
}

function addProductionGraphNode(kind: ProductionGraphCustomNode["kind"]) {
    const { project, updateProjectPatch } = runtime;
    const node: ProductionGraphCustomNode = {
      id: makeId(`canvas-${kind}`),
      kind,
      title: kind === "text" ? "Đầu vào văn bản" : kind === "image-upload" ? "Đầu vào hình ảnh" : kind === "image-generate" ? "Tạo hình ảnh" : "Gom ngữ cảnh",
      text: kind === "context-bundle" ? "Mô tả những gì bước tiếp theo cần giữ lại từ văn bản và hình ảnh đã nối." : "",
      createdAt: new Date().toISOString()
    };
    updateProjectPatch({ productionGraphCustomNodes: [...(project.productionGraphCustomNodes ?? []), node] });
  }

  function updateProductionGraphNode(nodeId: string, patch: Partial<ProductionGraphCustomNode>) {
    const { project, updateProjectPatch } = runtime;
    updateProjectPatch({ productionGraphCustomNodes: (project.productionGraphCustomNodes ?? []).map((node) => node.id === nodeId ? { ...node, ...patch } : node) });
  }

  function deleteProductionGraphNode(nodeId: string) {
    const { project, updateProjectPatch } = runtime;
    updateProjectPatch({ productionGraphCustomNodes: (project.productionGraphCustomNodes ?? []).filter((node) => node.id !== nodeId) });
  }

async function generateProductionGraphImage(node: ProductionGraphCustomNode) {
    const { state, project, intake, visualRequirements, isCharacterDetailRequirement, referenceForRequirement, replaceState } = runtime;
    if (!node.text?.trim() || !getWorkflowBridge()) return;
    const nodeSettings = project.productionGraphNodeSettings?.[`custom:${node.id}`];
    const provider = imageProviderForNode(state.providers, nodeSettings?.providerId || intake.aiRouting?.imageProvider);
    if (!provider) return;
    const jobId = makeId("canvas-image");
    updateProductionGraphNode(node.id, { lastJobId: jobId });
    const nodeRequirement = visualRequirements.find((requirement) => requirement.id === node.referenceRequirementId);
    const payload = buildGraphImagePayload({ node, nodeSettings, nodeRequirement, project, intake, provider, jobId, visualRequirements, isCharacterDetailRequirement, referenceForRequirement, state });
    try {
      replaceState(await getWorkflowBridge().runJob(payload));
    } catch {
      updateProductionGraphNode(node.id, { lastJobId: undefined });
    }
  }

  async function generateProductionGraphRevision(document: CanvasDocument, instruction: string) {
    const { state, project, intake, replaceState, textProvider, selectedVideoSkill, productionLanguage } = runtime;
    if (!("text" in document) || !instruction.trim()) return;
    const jobId = makeId("graph-revision");
    const revisionId = makeId("revision");
    const sessionKey = `${project.id}:story`;
    const sourceConversation = latestConversationForSession(state.jobs, project.id, textProvider.id, sessionKey);
    const stage = document.kind === "story" || document.kind === "brief" ? "story" : document.kind === "scene" || document.kind === "shot" ? "prompt" : "identity";
    const nodeSkill = skillInstructionForStage(selectedVideoSkill, stage, 1400);
    const prompt = `Revise one production document for an AI video project.

  DOCUMENT TYPE: ${document.kind}
  DOCUMENT TITLE: ${document.title}${nodeSkill}

  CURRENT CONTENT:
  ${document.text}

  USER CHANGE REQUEST:
  ${instruction.trim()}

  Return only the complete revised document. Preserve facts and constraints that the request does not change. Do not add commentary, headings, or markdown fences.`;
    const revision: ProductionGraphRevision = {
      id: revisionId,
      documentId: document.id,
      instruction: instruction.trim(),
      sourceText: document.text ?? "",
      providerId: textProvider.id,
      jobId,
      status: "queued",
      createdAt: new Date().toISOString()
    };
    const revisions = { ...(project.productionGraphRevisions ?? {}) };
    revisions[document.id] = [...(revisions[document.id] ?? []), revision];
    const legacyGuidance = { ...(project.productionGraphNotes ?? {}) };
    delete legacyGuidance[document.id];
    const payload: RunJobPayload = {
      jobId,
      projectId: project.id,
      providerId: textProvider.id,
      jobType: "text",
      prompt,
      bridgeMessage: {
        type: "RUN_JOB",
        jobId,
        provider: textProvider.platform,
        task: "production_graph_revision",
        prompt,
        conversationUrl: sourceConversation,
        references: [],
        settings: {
          aspectRatio: intake.videoFrame?.aspectRatio ?? "16:9",
          durationSec: 4,
          quality: "balanced",
          newConversation: !sourceConversation,
          sessionKey,
          outputLanguage: productionLanguage
        },
        download: { auto: false, targetFolder: `/data/projects/${project.id}/revisions`, filenameTemplate: document.id.replace(/[^a-z0-9-]+/gi, "-") }
      }
    };
    if (!getWorkflowBridge()) return;
    const withRevision = await getWorkflowBridge().updateProject(project.id, { productionGraphRevisions: revisions, productionGraphNotes: legacyGuidance });
    replaceState(withRevision);
    try {
      const withJob = await getWorkflowBridge().runJob(payload);
      replaceState(withJob);
    } catch (error) {
      const failedHistory = { ...revisions };
      failedHistory[document.id] = failedHistory[document.id].map((item) => item.id === revisionId
        ? { ...item, status: "failed" as const, error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() }
        : item);
      const failedState = await getWorkflowBridge().updateProject(project.id, { productionGraphRevisions: failedHistory });
      replaceState(failedState);
    }
  }

  function restoreProductionGraphTextVersion(document: CanvasDocument, text: string) {
    const { project, intake, updateProjectPatch, updateIntake, updateScene, updateShot } = runtime;
    if (!("text" in document)) return;
    if (document.customKind) {
      updateProductionGraphNode(document.entityId, { text });
    } else if (document.kind === "brief") {
      updateProjectPatch({ sourceDraft: text });
    } else if (document.kind === "reference-note") {
      updateIntake({
        quickVisualInput: {
          ...(intake.quickVisualInput ?? { sourceDescription: "", transformationRequest: "", updatedAt: new Date().toISOString() }),
          analysisText: text,
          updatedAt: new Date().toISOString()
        }
      });
    } else if (document.kind === "story" && project.storyDocument) {
      updateProjectPatch({ storyDocument: { ...project.storyDocument, story: text, manuallyEdited: true } });
    } else if (document.kind === "scene") {
      updateScene({ id: document.entityId, flowText: text });
    } else if (document.kind === "shot") {
      updateShot({ id: document.entityId, flowText: text });
    }
  }

function useRevisionTimeout() {
  const { state, project, replaceState } = runtime;
  useEffect(() => {
    if (!getWorkflowBridge()) return;
    const revisions = project.productionGraphRevisions ?? {};
    const hasQueuedRevision = Object.values(revisions).some((history) => history.some((revision) => revision.status === "queued"));
    if (!hasQueuedRevision) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const jobsById = new Map(state.jobs.map((job) => [job.id, job]));
      let changed = false;
      const next = Object.fromEntries(Object.entries(revisions).map(([documentId, history]) => [documentId, history.map((revision) => {
        if (revision.status !== "queued") return revision;
        const job = jobsById.get(revision.jobId);
        const age = now - new Date(revision.createdAt).getTime();
        const orphaned = !job && age > 15_000;
        const timedOut = age > 5 * 60_000;
        if (!orphaned && !timedOut) return revision;
        changed = true;
        return { ...revision, status: "failed" as const, error: orphaned ? "Revision job was not registered by the provider bridge." : "Revision provider timed out after 5 minutes.", completedAt: new Date().toISOString() };
      })]));
      if (changed) getWorkflowBridge().updateProject(project.id, { productionGraphRevisions: next }).then(replaceState);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [project.id, project.productionGraphRevisions, state.jobs]);
}

function imageProviderForNode(providers: BrowserProviderAdapter[], preferredId?: string) {
  return providers.find((item) => item.id === preferredId && item.capabilities.includes("image"))
    ?? providers.find((item) => item.capabilities.includes("image"));
}

function graphImageAspectRatio(node: ProductionGraphCustomNode, nodeSettings: any, intake: ProjectIntake) {
  const frameOwned = node.systemGenerated === "visual-requirement" ? assetFrameAspectRatio(node.referenceRole) : undefined;
  return frameOwned || nodeSettings?.aspectRatio || intake.videoFrame?.aspectRatio || "16:9";
}

function graphImageIdentity(args: any, sourceReference: VisualReference | undefined, nodeRequirement: VisualRequirement | undefined) {
  const { project, state } = args;
  const storyCharacter = project.storyDocument?.characters?.find((item: any) => item.name === nodeRequirement?.name);
  const character = state.characters.find((item: any) => item.projectId === project.id && (!storyCharacter || item.name === storyCharacter.name))
    ?? state.characters.find((item: any) => item.projectId === project.id);
  const styleBible = state.styleBibles.find((item: any) => item.projectId === project.id);
  const isCharacter = nodeRequirement && (nodeRequirement.role === "main_character" || nodeRequirement.role === "supporting_character") && character;
  if (!isCharacter) return { storyCharacter, identityContract: undefined };
  return {
    storyCharacter,
    identityContract: buildCharacterIdentityContract({
      name: nodeRequirement.name,
      role: storyCharacter?.role || nodeRequirement.role,
      storyCharacter,
      character,
      appearance: nodeRequirement.description,
      visualStyle: styleBible?.visualStyle || "realistic",
      sourceReference
    })
  };
}

function buildGraphImagePayload(args: any): RunJobPayload {
  const { node, nodeSettings, nodeRequirement, project, intake, provider, jobId, visualRequirements, isCharacterDetailRequirement, referenceForRequirement, state } = args;
  const requestedAspectRatio = graphImageAspectRatio(node, nodeSettings, intake);
  const nodeIsCharacterDetail = Boolean(nodeRequirement && isCharacterDetailRequirement(nodeRequirement));
  const canonicalCharacterSlot = nodeIsCharacterDetail
    ? visualRequirements.find((requirement: VisualRequirement) => requirement.role === node.referenceRole && !isCharacterDetailRequirement(requirement))?.id
    : node.referenceRequirementId;
  const sourceRequirementId = nodeRequirement?.baseReferenceRequirementId || (nodeIsCharacterDetail ? canonicalCharacterSlot : undefined);
  const sourceReference = sourceRequirementId ? referenceForRequirement(sourceRequirementId) : undefined;
  const { identityContract } = graphImageIdentity({ project, state }, sourceReference, nodeRequirement);
  const generationPrompt = buildGraphImagePrompt(node, nodeRequirement, graphAspectInstruction(requestedAspectRatio), identityContract);
  const conversationUrl = sourceReference?.providerConversationUrl;
  const requestedReferences = buildGraphImageReferences(sourceRequirementId, referenceForRequirement);
  const references = referencesMissingFromConversation(requestedReferences, conversationUrl, state.jobs, state.assets, state.visualReferences);
  return {
    jobId, projectId: project.id, providerId: provider.id, jobType: "image", prompt: generationPrompt,
    bridgeMessage: {
      type: "RUN_JOB", jobId, provider: provider.platform, task: "text_to_image", prompt: generationPrompt,
      conversationUrl, references,
      settings: {
        aspectRatio: requestedAspectRatio, durationSec: 4, quality: "balanced", newConversation: !conversationUrl,
        sessionKey: conversationUrl && sourceRequirementId ? `${project.id}:canvas:${sourceRequirementId}` : `${project.id}:canvas:${node.id}`, outputLanguage: nodeSettings?.outputLanguage || intake.outputLanguage,
        ...(node.systemGenerated === "visual-requirement" ? {
          characterSlot: canonicalCharacterSlot, characterName: node.title, referenceRole: node.referenceRole,
          directReferenceUse: nodeIsCharacterDetail ? "supporting_detail" : "primary_identity",
          directReferenceNote: node.text.trim(), referenceRequirementId: node.referenceRequirementId, identityContract,
          referenceTransport: sourceReference ? (references.length ? "native_upload" : "conversation_context") : references.length ? "native_upload" : "none",
          visualStyle: identityContract?.visualStyle
        } : {})
      },
      download: { auto: true, targetFolder: `/data/projects/${project.id}/canvas`, filenameTemplate: node.id }
    }
  };
}

async function persistRevisionOutput(pending: ProductionGraphRevision, outputText: string | undefined, nextHistory: NonNullable<Project["productionGraphRevisions"]>, now: string) {
  const { project, intake } = runtime;
  if (!outputText) return getWorkflowBridge().updateProject(project.id, { productionGraphRevisions: nextHistory });
  if (pending.documentId.startsWith("brief:")) return getWorkflowBridge().updateProject(project.id, { sourceDraft: outputText, productionGraphRevisions: nextHistory });
  if (pending.documentId.startsWith("story:") && project.storyDocument) return getWorkflowBridge().updateProject(project.id, { storyDocument: { ...project.storyDocument, story: outputText, manuallyEdited: true }, productionGraphRevisions: nextHistory });
  if (pending.documentId.startsWith("reference-note:")) return getWorkflowBridge().updateProject(project.id, {
    intake: { ...intake, quickVisualInput: { ...(intake.quickVisualInput ?? { sourceDescription: "", transformationRequest: "", updatedAt: now }), analysisText: outputText, updatedAt: now } },
    productionGraphRevisions: nextHistory
  });
  if (pending.documentId.startsWith("scene:")) {
    await getWorkflowBridge().updateScene({ id: pending.documentId.slice("scene:".length), flowText: outputText });
    return getWorkflowBridge().updateProject(project.id, { productionGraphRevisions: nextHistory });
  }
  if (pending.documentId.startsWith("shot:")) {
    await getWorkflowBridge().updateShot({ id: pending.documentId.slice("shot:".length), flowText: outputText });
    return getWorkflowBridge().updateProject(project.id, { productionGraphRevisions: nextHistory });
  }
  if (pending.documentId.startsWith("custom:")) {
    const nodeId = pending.documentId.slice("custom:".length);
    return getWorkflowBridge().updateProject(project.id, { productionGraphCustomNodes: (project.productionGraphCustomNodes ?? []).map((node) => node.id === nodeId ? { ...node, text: outputText } : node), productionGraphRevisions: nextHistory });
  }
  return getWorkflowBridge().updateProject(project.id, { productionGraphRevisions: nextHistory });
}

function useRevisionImport() {
  const { state, project, intake, replaceState, appliedGraphRevisionJobsRef } = runtime;
  useEffect(() => {
    const revisions = project.productionGraphRevisions ?? {};
    const pending = Object.values(revisions).flat().find((revision) => {
      if (revision.status !== "queued" || appliedGraphRevisionJobsRef.current.has(revision.jobId)) return false;
      const job = state.jobs.find((item) => item.id === revision.jobId);
      return Boolean(job?.outputText?.trim() || job?.status.startsWith("failed") || job?.status === "cancelled");
    });
    if (!pending || !getWorkflowBridge()) return;
    const job = state.jobs.find((item) => item.id === pending.jobId);
    if (!job) return;
    appliedGraphRevisionJobsRef.current.add(pending.jobId);
    const outputText = job.outputText?.trim();
    const now = new Date().toISOString();
    const nextHistory = { ...revisions };
    nextHistory[pending.documentId] = (nextHistory[pending.documentId] ?? []).map((revision) => revision.id === pending.id
      ? { ...revision, status: outputText ? "completed" as const : "failed" as const, outputText, error: outputText ? undefined : job.error || job.statusMessage || "Công cụ chưa trả về nội dung chỉnh sửa.", completedAt: now }
      : revision);
    void persistRevisionOutput(pending, outputText, nextHistory, now).then(replaceState)
      .catch(() => appliedGraphRevisionJobsRef.current.delete(pending.jobId));
  }, [intake, project.id, project.productionGraphCustomNodes, project.productionGraphRevisions, project.storyDocument, state.jobs]);
}

export function useProductionGraphController(args: ProductionGraphControllerArgs) {
  runtime = args;
  useRevisionTimeout();
  useRevisionImport();
  return { addProductionGraphNode, updateProductionGraphNode, deleteProductionGraphNode, generateProductionGraphImage, generateProductionGraphRevision, restoreProductionGraphTextVersion };
}
