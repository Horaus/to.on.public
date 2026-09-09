import { type ProductionGraph } from "@studio/production-graph/contracts";
import { resolveProviderVideoDuration } from "@studio/domain/duration-policy";
import type {
  Asset, AutomationJob, BrowserProviderAdapter, Character,
  ProductionGraphCustomNode, ProductionGraphNodeSettings,
  ProductionGraphRevision,
  Project, ProjectIntake,
  Scene, Shot,
  VisualReference
} from "@studio/workflow/renderer-contracts";
import { useCallback, useMemo } from "react";
import { createTranslator } from "@studio/renderer-core/i18n";
import type { RunJobPayload } from "@studio/domain/job-contracts";
import { isLikelyEphemeralMediaUrl, isVerifiedVideoAssetForShot, shotKeyframeAssets } from "@studio/workflow/media-asset-selectors";
import { assetFrameAspectRatio, defaultProjectIntake } from "@studio/renderer-core/production-ui-support";
import { SpatialProductionCanvas } from "../studio-canvas";
import { referenceCategory } from "../studio-canvas-layout";
import type { CanvasDocument, CanvasGroupSpec, CanvasNodeData, FlowDocument, GroupNodeData, ImageGeneratorCanvasDocument, SectionNodeData, VideoAspectRatio } from "@studio/types";
import { latestActiveJobForShot } from "@studio/renderer-core/job-status";
import { CAMERA_ANGLE_LABELS, CAMERA_CONTROL_LABELS, CAMERA_FRAMING_LABELS, cameraTarget, compactCameraAngle, compactCameraControl, compactCameraFraming, shotTimelineNotes } from "../core/shot-copy";

type StudioView = import("@studio/workflow/studio-types").StudioView;

export function viewTitle(view: StudioView, t: ReturnType<typeof createTranslator>) {
  const titles: Record<StudioView, string> = {
    overview: "Tổng quan sản xuất",
    flow: "Luồng sản xuất",
    story: t("nav.story"),
    assets: t("nav.assets"),
    storyboard: t("nav.storyboard"),
    generate: t("nav.generate"),
    review: t("nav.review"),
    source: t("nav.source")
  };
  return titles[view];
}

export function flowAssetTitle(asset: Asset) {
  return String(asset.metadata?.filename || asset.filePath.split("/").at(-1) || asset.id);
}

/**
 * Persisted flowText predates the readable Flow map and may contain a raw
 * provider payload (JSON, bridge metadata, or an internal prompt).  Never
 * surface that implementation detail to users: fall back to the structured
 * scene/shot presentation below instead. Plain authored notes remain editable.
 */
export function readableAuthoredFlowText(value?: string) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") return "";
  } catch {
    // Plain text is expected; continue with the marker guard below.
  }
  // Provider envelopes can also be persisted as plain text (without JSON),
  // especially after a recovery/import attempt. Keep authored notes visible,
  // but hide unmistakable execution directives from the user-facing canvas.
  if (/\b(?:bridgeMessage|providerPayload|integrationPayload|providerConversationUrl|jobId|sceneOrder|shotId|RUN_JOB|text_to_image|image_to_video)\b\s*[:=]?/i.test(text)) return "";
  // Provider prompts are also persisted as plain prose after some recovery
  // paths. These execution markers are intentionally narrow: authored notes
  // may still mention a camera, action, or reference without being hidden.
  if (/\b(?:attached\s+(?:approved|reference)\s+(?:keyframe|image)|image[-\s]to[-\s]video|integration\s+payload|UTF[-\s]?8\s+bytes?|return\s+only\s+the\s+(?:compact\s+)?prompt|hard\s+requirement)\b/i.test(text)) return "";
  if (/^\s*(?:create|generate|rewrite this as)\s+(?:exactly\s+one|a\s+new|this\s+as\s+a)\b/i.test(text)) return "";
  return text;
}

export function sceneFlowText(scene: Scene, sceneShots: Shot[]) {
  const authoredText = readableAuthoredFlowText(scene.flowText);
  if (authoredText) return authoredText;
  const context = [
    scene.location ? `Địa điểm: ${scene.location}` : "",
    scene.timeOfDay ? `Thời điểm: ${scene.timeOfDay}` : "",
    scene.emotionalTone ? `Sắc thái: ${scene.emotionalTone}` : "",
    scene.settingDescription ? `Bối cảnh đã xác định: ${scene.settingDescription}` : "",
    scene.wardrobeState ? `Trạng thái nhân vật đã xác định: ${scene.wardrobeState}` : "",
    scene.requiredProps?.length ? `Đạo cụ đã xác định: ${scene.requiredProps.join(", ")}` : ""
  ].filter(Boolean).join(" · ");
  const beats = sceneShots.map((shot) => [
    `SH${String(shot.order).padStart(2, "0")} · ${shot.durationSec}s`,
    shot.description || "Chưa có mô tả khung hình.",
    shotTimelineNotes(shot)
  ].filter(Boolean).join("\n"));
  return [scene.summary, context, beats.length ? `Các shot trong cảnh\n${beats.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

export function shotFlowText(shot: Shot) {
  const authoredText = readableAuthoredFlowText(shot.flowText);
  if (authoredText) return authoredText;
  const framing = CAMERA_FRAMING_LABELS[compactCameraFraming(shot.camera) as keyof typeof CAMERA_FRAMING_LABELS];
  const angle = CAMERA_ANGLE_LABELS[compactCameraAngle(shot.camera) as keyof typeof CAMERA_ANGLE_LABELS];
  const control = CAMERA_CONTROL_LABELS[compactCameraControl(shot.camera) as keyof typeof CAMERA_CONTROL_LABELS];
  const target = cameraTarget(shot.camera);
  const camera = [`${framing}, ${angle}`, control, target ? `nhìn vào ${target}` : ""].filter(Boolean).join(" · ");
  return [
    shot.description || "Khung hình chưa có mô tả.",
    `Góc máy: ${camera}`,
    `Diễn biến\n${shotTimelineNotes(shot)}`
  ].filter(Boolean).join("\n\n");
}


type ProductionCanvasInputs = {
  assets: Asset[]; characters: Character[]; jobs: AutomationJob[]; project: Project; providers: BrowserProviderAdapter[];
  references: VisualReference[]; scenes: Scene[]; shots: Shot[];
};

type ProductionGraphViewProps = ProductionCanvasInputs & {
  graph: ProductionGraph;
  issueCount: number;
  revisions: Record<string, ProductionGraphRevision[]>;
  onUpdateProject: (patch: Partial<Project>) => void;
  onUpdateIntake: (patch: Partial<ProjectIntake>) => void;
  onUpdateScene: (patch: Partial<Scene> & { id: string }) => void;
  onUpdateShot: (patch: Partial<Shot> & { id: string }) => void;
  onOpenDocument: (document: CanvasDocument) => void;
  onGenerateRevision: (document: CanvasDocument, instruction: string) => void;
  onRestoreTextVersion: (document: CanvasDocument, text: string) => void;
  onRegenerateMedia: (asset: Asset, instruction?: string, settings?: ProductionGraphNodeSettings) => void;
  onAddCustomNode: (kind: ProductionGraphCustomNode["kind"]) => void;
  onUpdateCustomNode: (nodeId: string, patch: Partial<ProductionGraphCustomNode>) => void;
  onDeleteCustomNode: (nodeId: string) => void;
  onGenerateCustomImage: (node: ProductionGraphCustomNode) => void;
};

function saveProductionNodeSettings(project: Project, onUpdateProject: ProductionGraphViewProps["onUpdateProject"], documentId: string, patch: ProductionGraphNodeSettings) {
  const current = project.productionGraphNodeSettings?.[documentId] ?? {};
  const next = Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, value]) => value !== undefined)) as ProductionGraphNodeSettings;
  const settings = { ...(project.productionGraphNodeSettings ?? {}) };
  if (Object.keys(next).length) settings[documentId] = next;
  else delete settings[documentId];
  onUpdateProject({ productionGraphNodeSettings: settings });
}

function saveProductionDocumentText(props: ProductionGraphViewProps, document: CanvasDocument, text: string) {
  const { onUpdateCustomNode, onUpdateIntake, onUpdateProject, onUpdateScene, onUpdateShot, project } = props;
  if (!("text" in document)) return;
  if (document.customKind) { onUpdateCustomNode(document.entityId, { text }); return; }
  if (document.kind === "brief") return onUpdateProject({ sourceDraft: text });
  if (document.kind === "reference-note") return onUpdateIntake({ quickVisualInput: { ...(project.intake?.quickVisualInput ?? { sourceDescription: "", transformationRequest: "", updatedAt: new Date().toISOString() }), analysisText: text, updatedAt: new Date().toISOString() } });
  if (document.kind === "story" || document.kind === "scene-breakdown") return saveStoryDocumentText(onUpdateProject, project, document.kind, text);
  if (document.kind === "scene") return onUpdateScene({ id: document.entityId, flowText: text });
  if (document.kind === "scene-continuity") return saveContinuityText(onUpdateScene, document.entityId, text);
  if (document.kind === "shot") onUpdateShot({ id: document.entityId, flowText: text });
}

function saveStoryDocumentText(onUpdateProject: ProductionGraphViewProps["onUpdateProject"], project: Project, kind: "story" | "scene-breakdown", text: string) {
  if (!project.storyDocument) return;
  onUpdateProject({ storyDocument: { ...project.storyDocument, [kind === "story" ? "story" : "sceneBreakdown"]: text, manuallyEdited: true } });
}
function saveContinuityText(onUpdateScene: ProductionGraphViewProps["onUpdateScene"], id: string, text: string) {
  try { onUpdateScene({ id, continuityOverride: JSON.parse(text) as NonNullable<Scene["continuityOverride"]> }); } catch {}
}

function createProductionCanvasContext({ assets, characters, jobs, project, providers, references, scenes, shots }: ProductionCanvasInputs) {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const providerName = (providerId?: string) => providers.find((provider) => provider.id === providerId)?.name || "Định tuyến AI";
  const textProviderId = project.intake?.aiRouting?.textProvider;
  const imageProviderId = project.intake?.aiRouting?.imageProvider;
  const videoProviderId = project.intake?.aiRouting?.videoProvider;
  const videoProviderPlatform = providers.find((provider) => provider.id === videoProviderId)?.platform ?? "google-flow";
  const aspectRatio = project.intake?.videoFrame?.aspectRatio ?? "9:16";
  const intake = project.intake ?? defaultProjectIntake();
  const placeholderAsset = (id: string, type: "image" | "video", shotId: string, placeholderKind: "scene-image" | "shot-image" | "video"): Asset => ({
    id,
    projectId: project.id,
    type,
    filePath: "",
    sourceProvider: type === "video" ? videoProviderId || "video-routing" : imageProviderId || "image-routing",
    metadata: { placeholderKind, shotId, aspectRatio },
    createdAt: "1970-01-01T00:00:00.000Z"
  });
  const documents: CanvasDocument[] = [
    { id: `brief:${project.id}`, groupId: "intake", kind: "brief", title: "Tóm tắt ý tưởng", text: project.sourceDraft || project.description || "", entityId: project.id, providerName: "Người dùng" },
    { id: `profile:${project.id}`, groupId: "intake", kind: "profile", title: "Hồ sơ sản xuất", entityId: project.id, intake, providers },
    { id: `intake-upload:${project.id}`, groupId: "intake", kind: "upload-image", title: intake.quickVisualInput?.name || "Ảnh tham chiếu", entityId: project.id, dataUrl: intake.quickVisualInput?.dataUrl, fileName: intake.quickVisualInput?.name, mimeType: intake.quickVisualInput?.mimeType, aspectRatio, mediaRole: "input" },
    { id: `story:${project.id}`, groupId: "story", row: 1, kind: "story", title: `Câu chuyện hoàn chỉnh · ${project.storyDocument?.logline || "Đang chờ"}`, text: project.storyDocument?.story || "Đang chờ — hãy phát triển ý tưởng thành câu chuyện hoàn chỉnh.", entityId: project.id, providerId: textProviderId, providerName: "Phát triển câu chuyện" },
    { id: `architecture:${project.id}`, groupId: "architecture", row: 1, kind: "scene-breakdown", title: "Phân cảnh", text: project.storyDocument?.sceneBreakdown || "Đang chờ — hoàn tất câu chuyện trước khi tách cảnh.", entityId: project.id, providerId: textProviderId, providerName: "Kiến trúc phân cảnh" }
  ];
  return { assetById, aspectRatio, assets, characters, documents, imageProviderId, intake, jobs, placeholderAsset, project, providerName, providers, references, scenes, shots, textProviderId, videoProviderId, videoProviderPlatform };
}

type ProductionCanvasContext = ReturnType<typeof createProductionCanvasContext>;

function customNodeJob(context: ProductionCanvasContext, node: ProductionGraphCustomNode) {
  return node.lastJobId ? context.jobs.find((job) => job.id === node.lastJobId) : undefined;
}

function hasInvalidLegacyVariant(node: ProductionGraphCustomNode, job: AutomationJob | undefined) {
  if (!node.referenceRequirementId?.includes("__scene_")) return false;
  const payload = job?.input as RunJobPayload | undefined;
  return `${payload?.prompt || ""} ${payload?.bridgeMessage?.prompt || ""}`.includes("[object Object]");
}

function promotedNodeReference(context: ProductionCanvasContext, node: ProductionGraphCustomNode) {
  if (!node.referenceRequirementId) return undefined;
  return context.references.find((reference) => reference.characterSlot === node.referenceRequirementId
    || (reference.role === node.referenceRole && reference.name === node.title));
}

function generatedNodeAsset(context: ProductionCanvasContext, node: ProductionGraphCustomNode, job: AutomationJob | undefined, invalid: boolean) {
  if (invalid) return undefined;
  const jobAsset = job?.resultAssetIds.map((assetId) => context.assetById.get(assetId)).find((asset): asset is Asset => Boolean(asset));
  const promotedReference = promotedNodeReference(context, node);
  return jobAsset ?? (promotedReference ? {
      id: promotedReference.sourceAssetId || promotedReference.id,
      projectId: context.project.id,
      type: "reference" as const,
      filePath: promotedReference.previewDataUrl || promotedReference.filePath,
      sourceProvider: promotedReference.sourceProvider || "reference-library",
      metadata: { referenceRole: promotedReference.role },
      createdAt: promotedReference.createdAt
    } : undefined);
}

function customProductionDocument(context: ProductionCanvasContext, node: ProductionGraphCustomNode): CanvasDocument {
  const { aspectRatio, imageProviderId, intake, project, providerName, providers, textProviderId } = context;
  if (node.kind === "image-upload") return { id: `custom:${node.id}`, groupId: "intake", kind: "custom-upload", title: node.title, entityId: node.id, customNode: node, dataUrl: node.dataUrl, fileName: node.fileName, mimeType: node.mimeType, aspectRatio, customKind: node.kind, mediaRole: "input" };
  if (node.kind !== "image-generate") return { id: `custom:${node.id}`, groupId: "intake", kind: "note", title: node.title, text: node.text || "", entityId: node.id, customKind: node.kind, providerId: textProviderId, providerName: node.kind === "context-bundle" ? "Hợp đồng ngữ cảnh" : "Đầu vào người dùng" };
  const nodeId = `custom:${node.id}`;
  const settings = project.productionGraphNodeSettings?.[nodeId];
  const frameAspectRatio = node.systemGenerated === "visual-requirement" ? assetFrameAspectRatio(node.referenceRole) : undefined;
  const job = customNodeJob(context, node);
  const invalid = hasInvalidLegacyVariant(node, job);
  return { id: nodeId, groupId: node.systemGenerated === "visual-requirement" ? "assets" : "intake", category: node.referenceRole === "location" ? "locations" : node.referenceRole === "prop" ? "props" : node.referenceRole ? "characters" : undefined, assetSubgroup: node.referenceRole === "main_character" ? "main" : node.referenceRole === "supporting_character" ? "supporting" : undefined, kind: "image-generator", title: invalid ? `${node.title} · Tạo lại` : node.title, text: node.text, entityId: node.id, customNode: node, job: invalid ? undefined : job, generatedAsset: generatedNodeAsset(context, node, job, invalid), aspectRatio: frameAspectRatio || settings?.aspectRatio || aspectRatio, inheritedAspectRatio: frameAspectRatio || aspectRatio, providerId: settings?.providerId || imageProviderId, inheritedProviderId: imageProviderId, providerName: providerName(settings?.providerId || imageProviderId), outputLanguage: settings?.outputLanguage || intake.outputLanguage, inheritedOutputLanguage: intake.outputLanguage, providers, customKind: node.kind, mediaRole: "generated" };
}

function appendCustomProductionDocuments(context: ProductionCanvasContext) {
  // Context bundles are an execution transport (their text may be a large
  // prompt/JSON envelope), not a production artifact. Keep them persisted for
  // the bridge and developer diagnostics, but never render them in the
  // user-facing flow map.
  for (const node of context.project.productionGraphCustomNodes ?? []) {
    if (node.kind === "context-bundle") continue;
    context.documents.push(customProductionDocument(context, node));
  }
}

function productionReferenceSource(context: ProductionCanvasContext, reference: VisualReference) {
  const { assetById, assets, jobs, project, providers } = context;
  const settings = project.productionGraphNodeSettings?.[`reference:${reference.id}`];
  const sessionKey = `${project.id}:reference:${reference.id}`;
  const referenceJobs = jobs.filter((job) => (job.input as RunJobPayload | undefined)?.bridgeMessage?.settings?.sessionKey === sessionKey).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const versions = referenceJobs.flatMap((job) => job.resultAssetIds.map((assetId) => assetById.get(assetId)).filter((asset): asset is Asset => Boolean(asset)));
  const linkedAsset = (reference.sourceAssetId ? assetById.get(reference.sourceAssetId) : undefined) ?? assets.find((asset) => reference.sourceDescription?.includes(asset.id));
  const asset = versions.find((item) => item.id === settings?.selectedAssetId) || versions.at(-1) || linkedAsset;
  const job = (asset ? jobs.find((item) => item.id === asset.sourceJobId || item.resultAssetIds.includes(asset.id)) : undefined) ?? referenceJobs.at(-1);
  const legacyProvider = reference.sourceDescription?.match(/^Generated(?: directly)? from ([\w-]+)/i)?.[1];
  const providerToken = job?.providerId || asset?.sourceProvider || reference.sourceProvider || legacyProvider;
  const provider = providers.find((item) => item.id === providerToken || item.platform === providerToken || item.name.toLowerCase() === providerToken?.toLowerCase());
  return { asset, generated: Boolean(providerToken), job, providerId: provider?.id || providerToken, providerToken, referenceJobs, settings, versions };
}

function productionReferenceDocument(context: ProductionCanvasContext, reference: VisualReference): CanvasDocument | null {
  const { aspectRatio, imageProviderId, intake, project, providerName, providers } = context;
  if (!reference.previewDataUrl) return null;
  if (referenceIsRepresented(project, reference)) return null;
  const source = productionReferenceSource(context, reference);
  const frameAspectRatio = assetFrameAspectRatio(reference.role);
  const sourceAspectRatio = (frameAspectRatio || reference.sourceAspectRatio || ((source.job?.input as RunJobPayload | undefined)?.bridgeMessage?.settings?.aspectRatio as VideoAspectRatio | undefined) || aspectRatio) as VideoAspectRatio;
  return { ...referenceDocumentIdentity(reference, source, providerName), ...referenceDocumentMedia(context, reference, source, frameAspectRatio, sourceAspectRatio),
    providers, activeJob: source.referenceJobs.at(-1), prompt: (source.job?.input as RunJobPayload | undefined)?.prompt || reference.sourceDescription,
    asset: source.asset ?? referenceDocumentFallback(project, reference, source), versions: source.versions.length ? source.versions : undefined
  };
}

function referenceIsRepresented(project: Project, reference: VisualReference) {
  return reference.referenceUse !== "supporting_detail" && (project.productionGraphCustomNodes ?? []).some((node) => node.systemGenerated === "visual-requirement" && node.referenceRequirementId === reference.characterSlot);
}

function referenceDocumentIdentity(reference: VisualReference, source: ReturnType<typeof productionReferenceSource>, providerName: ProductionCanvasContext["providerName"]) {
  return {
    id: `reference:${reference.id}`, groupId: "assets", category: referenceCategory(reference.role),
    assetSubgroup: (reference.role === "main_character" ? "main" : reference.role === "supporting_character" ? "supporting" : undefined) as "main" | "supporting" | undefined,
    kind: "image" as const, title: reference.name, providerId: source.settings?.providerId || source.providerId || "",
    providerName: source.generated ? providerName(source.settings?.providerId || source.providerId) : "Tải lên"
  };
}

function referenceDocumentMedia(context: ProductionCanvasContext, reference: VisualReference, source: ReturnType<typeof productionReferenceSource>, frameAspectRatio: string | undefined, sourceAspectRatio: VideoAspectRatio) {
  const { aspectRatio, imageProviderId, intake, providers } = context;
  return {
    aspectRatio: sourceAspectRatio, inheritedAspectRatio: (frameAspectRatio || aspectRatio) as VideoAspectRatio, hasAspectRatioOverride: Boolean(frameAspectRatio), fitContent: false,
    inheritedProviderId: imageProviderId, outputLanguage: source.settings?.outputLanguage || intake.outputLanguage, inheritedOutputLanguage: intake.outputLanguage,
    providers, resolution: source.generated ? String(source.asset?.metadata?.resolution || "Kết quả AI") : "nguồn", mediaRole: "reference" as const, canRun: source.generated
  };
}

function referenceDocumentFallback(project: Project, reference: VisualReference, source: ReturnType<typeof productionReferenceSource>) {
  return { id: reference.id, projectId: project.id, type: "reference" as const, filePath: reference.previewDataUrl || "", sourceProvider: source.providerId || "reference-library", metadata: { referenceRole: reference.role, characterSlot: reference.characterSlot, generatedReference: source.generated, prompt: reference.sourceDescription }, createdAt: reference.createdAt };
}

function appendReferenceProductionDocuments(context: ProductionCanvasContext) {
  const { documents, intake, project, references } = context;
  if (intake.quickVisualInput?.dataUrl) {
    documents.push({ id: `reference-note:${project.id}`, groupId: "intake", kind: "reference-note", title: "Phân tích ảnh tham chiếu", text: intake.quickVisualInput.analysisText || intake.quickVisualInput.sourceDescription || "", entityId: project.id, providerName: "Dữ liệu dự án" });
  }
  for (const reference of references) {
    const document = productionReferenceDocument(context, reference);
    if (document) documents.push(document);
  }
}

function appendSceneHeaderDocuments(context: ProductionCanvasContext, scene: Scene, sceneShots: Shot[], row: number) {
  const { aspectRatio, assets, documents, imageProviderId, intake, jobs, placeholderAsset, project, providerName, providers, textProviderId } = context;
  documents.push({ id: `scene:${scene.id}`, groupId: "scenes", row, slot: "scene", kind: "scene", title: `SC${String(scene.order).padStart(2, "0")} · ${scene.title}`, text: sceneFlowText(scene, sceneShots), entityId: scene.id, providerId: textProviderId, providerName: providerName(textProviderId), referenceRequirementIds: scene.referenceRequirementIds });
  // The locked screenplay remains persisted in the story document, but its
  // provider-shaped JSON is an implementation artifact. Keep it out of the
  // user-facing flow map; the scene node already exposes the readable handoff.
  const anchorShot = sceneShots.find((shot) => shotKeyframeAssets(assets, shot, jobs).length > 0) ?? sceneShots[0];
  const versions = anchorShot ? shotKeyframeAssets(assets, anchorShot, jobs) : [];
  if (anchorShot) {
    const id = `scene-visual:${scene.id}`;
    const settings = project.productionGraphNodeSettings?.[id];
    const sourceAsset = versions[0];
    const activeJob = latestActiveJobForShot(jobs, anchorShot.id, "image");
    // The production graph is a handoff map, not the creation queue. Do not
    // add a fake media tile just because a shot exists; show the lane only
    // once a real asset or an active provider job can be inspected.
    if (sourceAsset || activeJob) {
      const asset = versions.find((item) => item.id === settings?.selectedAssetId) ?? sourceAsset ?? placeholderAsset(`${id}:placeholder`, "image", anchorShot.id, "scene-image");
      documents.push({ id, groupId: "scene-images", row, slot: "scene-keyframe", kind: "image", title: `SC${String(scene.order).padStart(2, "0")} · Mốc hình ảnh cảnh`, providerId: settings?.providerId || imageProviderId, providerName: providerName(settings?.providerId || imageProviderId), aspectRatio: settings?.aspectRatio || String(asset.metadata?.aspectRatio || aspectRatio), inheritedAspectRatio: aspectRatio, inheritedProviderId: imageProviderId, outputLanguage: settings?.outputLanguage || intake.outputLanguage, inheritedOutputLanguage: intake.outputLanguage, providers, resolution: String(asset.metadata?.resolution || "nguồn"), prompt: scene.summary, mediaRole: "generated", canRun: true, sceneDocumentId: `scene:${scene.id}`, activeJob, asset, versions: versions.length ? [...versions].reverse() : undefined });
    }
  }
  // Continuity overrides are stored as a machine-readable JSON contract and
  // are edited through the scene/shot controls. Rendering that payload as a
  // canvas node leaked implementation data and made the map look like a
  // debugger, so keep the contract available to the runtime but omit it from
  // the user-facing flow map.
}

function productionShotAssets(context: ProductionCanvasContext, shot: Shot) {
  const { assetById, assets, jobs } = context;
  return [...new Map([...shot.assetIds.map((id) => assetById.get(id)).filter((asset): asset is Asset => Boolean(asset)), ...assets.filter((asset) => asset.shotId === shot.id || asset.metadata?.shotId === shot.id)].map((asset) => [asset.id, asset])).values()]
    .filter((asset) => asset.type === "image" || asset.type === "reference" || asset.type === "video" && !isLikelyEphemeralMediaUrl(asset.filePath) && isVerifiedVideoAssetForShot(asset, shot, jobs, assets))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function productionAudioWarning(context: ProductionCanvasContext, shot: Shot, generateAudio: boolean, isVideo: boolean) {
  // Voice casting is an execution concern owned by the character/audio pass.
  // It must not leak into the production graph as a technical warning.
  return undefined;
}

function productionShotOutputDocument(context: ProductionCanvasContext, scene: Scene, shot: Shot, row: number, versions: Asset[], isVideo: boolean): CanvasDocument {
  const { aspectRatio, imageProviderId, intake, jobs, placeholderAsset, project, providerName, providers, videoProviderId, videoProviderPlatform } = context;
  const id = `output:${shot.id}:${isVideo ? "video" : "image"}`;
  const settings = project.productionGraphNodeSettings?.[id];
  const asset = versions.find((item) => item.id === settings?.selectedAssetId) ?? versions.at(-1) ?? placeholderAsset(`${id}:placeholder`, isVideo ? "video" : "image", shot.id, isVideo ? "video" : "shot-image");
  const videoQuality = settings?.videoQuality ?? "fast";
  const generateAudio = settings?.generateAudio ?? false;
  const credits = videoQuality === "quality" ? { min: 100, max: generateAudio ? 120 : 100 } : { min: 20, max: generateAudio ? 30 : 20 };
  return { id, groupId: isVideo ? "video" : "shots", row, slot: isVideo ? "video" : "keyframe", kind: isVideo ? "video" : "image", title: versions.length ? `${isVideo ? "Video" : "Khung hình"} · ${flowAssetTitle(asset)}` : `${isVideo ? "Video" : "Ảnh shot"} · Đang chờ`, providerId: settings?.providerId || (isVideo ? videoProviderId : imageProviderId), providerName: providerName(settings?.providerId || (isVideo ? videoProviderId : imageProviderId)), aspectRatio: settings?.aspectRatio || String(asset.metadata?.aspectRatio || aspectRatio), inheritedAspectRatio: aspectRatio, inheritedProviderId: isVideo ? videoProviderId : imageProviderId, outputLanguage: settings?.outputLanguage || intake.outputLanguage, inheritedOutputLanguage: intake.outputLanguage, providers, durationSec: isVideo ? resolveProviderVideoDuration(videoProviderPlatform, shot.durationSec) : undefined, resolution: String(asset.metadata?.resolution || (isVideo ? videoQuality === "quality" ? "1080p" : "720p" : "nguồn")), videoQuality: isVideo ? videoQuality : undefined, generateAudio: isVideo ? generateAudio : undefined, nativeAudioWarning: productionAudioWarning(context, shot, generateAudio, isVideo), estimatedCredits: isVideo ? credits : undefined, prompt: shot.prompt || shot.description, mediaRole: "generated", canRun: true, activeJob: latestActiveJobForShot(jobs, shot.id, isVideo ? "video" : "image"), parentDocumentId: `provider-compilation:${shot.id}`, sceneDocumentId: `scene:${scene.id}`, asset, versions: versions.length ? versions : undefined };
}

function appendShotProductionDocuments(context: ProductionCanvasContext, scene: Scene, shot: Shot, row: number) {
  const { documents } = context;
  documents.push({ id: `shot:${shot.id}`, groupId: "shots", row, slot: "shot", kind: "shot", title: `Phân rã shot · SH${shot.order} · ${shot.durationSec}s`, text: shotFlowText(shot), entityId: shot.id, parentDocumentId: `scene:${scene.id}`, providerId: context.textProviderId, providerName: "Cổng phân rã shot" });
  // Provider prompt and payload are persisted for execution, but are not a
  // production-facing node. Showing them here exposed long internal text and
  // JSON, making the map noisy and encouraging edits to derived data.
  const assets = productionShotAssets(context, shot);
  const images = assets.filter((asset) => asset.type !== "video");
  const videos = assets.filter((asset) => asset.type === "video");
  const imageJob = latestActiveJobForShot(context.jobs, shot.id, "image");
  const videoJob = latestActiveJobForShot(context.jobs, shot.id, "video");
  if (images.length || imageJob) documents.push(productionShotOutputDocument(context, scene, shot, row, images, false));
  if (videos.length || videoJob) documents.push(productionShotOutputDocument(context, scene, shot, row, videos, true));
}

function appendSceneProductionDocuments(context: ProductionCanvasContext) {
  let row = 1;
  for (const scene of [...context.scenes].sort((left, right) => left.order - right.order)) {
    const sceneShots = context.shots.filter((shot) => shot.sceneId === scene.id).sort((left, right) => left.order - right.order);
    appendSceneHeaderDocuments(context, scene, sceneShots, row);
    for (const shot of sceneShots) appendShotProductionDocuments(context, scene, shot, row++);
    if (!sceneShots.length) row++;
  }
}

function buildProductionCanvasDocuments(inputs: ProductionCanvasInputs): CanvasDocument[] {
  const context = createProductionCanvasContext(inputs);
  appendCustomProductionDocuments(context);
  appendReferenceProductionDocuments(context);
  appendSceneProductionDocuments(context);
  return context.documents;
}


export function ProductionGraphView({
  graph,
  issueCount,
  project,
  providers,
  scenes,
  shots,
  characters,
  assets,
  jobs,
  references,
  revisions,
  onUpdateProject,
  onUpdateIntake,
  onUpdateScene,
  onUpdateShot,
  onOpenDocument,
  onGenerateRevision,
  onRestoreTextVersion,
  onRegenerateMedia,
  onAddCustomNode,
  onUpdateCustomNode,
  onDeleteCustomNode,
  onGenerateCustomImage
}: ProductionGraphViewProps) {
  void graph;
  void issueCount;
  const notes = project.productionGraphNotes ?? {};
  const updateNodeSettings = useCallback((documentId: string, patch: ProductionGraphNodeSettings) => saveProductionNodeSettings(project, onUpdateProject, documentId, patch), [onUpdateProject, project]);

  const openDocumentAsset = useCallback((document: CanvasDocument) => {
    if ((document.kind === "image" || document.kind === "video") && window.studioBridge?.openAsset) void window.studioBridge.openAsset(document.asset.id);
  }, []);

  const updateDocumentText = useCallback((document: CanvasDocument, text: string) => saveProductionDocumentText({ graph, issueCount, project, providers, scenes, shots, characters, assets, jobs, references, revisions, onUpdateProject, onUpdateIntake, onUpdateScene, onUpdateShot, onOpenDocument, onGenerateRevision, onRestoreTextVersion, onRegenerateMedia, onAddCustomNode, onUpdateCustomNode, onDeleteCustomNode, onGenerateCustomImage }, document, text), [assets, characters, graph, issueCount, jobs, onAddCustomNode, onDeleteCustomNode, onGenerateCustomImage, onGenerateRevision, onOpenDocument, onRegenerateMedia, onRestoreTextVersion, onUpdateCustomNode, onUpdateIntake, onUpdateProject, onUpdateScene, onUpdateShot, project, providers, references, revisions, scenes, shots]);

  const canvasDocuments = useMemo(() => buildProductionCanvasDocuments({ assets, characters, jobs, project, providers, references, scenes, shots }), [assets, characters, jobs, project, providers, references, scenes, shots]);

  return (
    <section className="view production-graph-view" aria-label="Sơ đồ luồng sản xuất">
      <h2 className="sr-only">Sơ đồ sản xuất</h2>
      <SpatialProductionCanvas
        documents={canvasDocuments}
        savedLayout={project.productionGraphLayout ?? {}}
        savedViewport={project.productionGraphViewport}
        focusDocumentId={project.productionGraphFocusDocumentId}
        revisions={revisions}
        initialGuidance={notes}
        onGenerateRevision={onGenerateRevision}
        onRestoreTextVersion={onRestoreTextVersion}
        onRegenerateMedia={onRegenerateMedia}
        onOpenAsset={openDocumentAsset}
        onOpenDocument={onOpenDocument}
        onUpdateIntake={onUpdateIntake}
        onUpdateText={updateDocumentText}
        onSaveLayout={(productionGraphLayout) => onUpdateProject({ productionGraphLayout })}
        onSaveViewport={(productionGraphViewport) => onUpdateProject({ productionGraphViewport })}
        onFocusDocument={(productionGraphFocusDocumentId) => onUpdateProject({ productionGraphFocusDocumentId })}
        onAddCustomNode={onAddCustomNode}
        onUpdateCustomNode={onUpdateCustomNode}
        onDeleteCustomNode={onDeleteCustomNode}
        onGenerateCustomImage={onGenerateCustomImage}
        onUpdateNodeSettings={updateNodeSettings}
        onResetNodeSettings={() => onUpdateProject({ productionGraphNodeSettings: {} })}
        onResetLayout={() => onUpdateProject({ productionGraphLayout: {} })}
      />

    </section>
  );
}
