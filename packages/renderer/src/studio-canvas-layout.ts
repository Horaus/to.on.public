import type { Asset, CanvasDocument, CanvasGroupSpec, ProductionGraphCustomNode, ProductionGraphNodeSettings, ProductionGraphRevision, ProjectIntake, VisualReference } from "@studio/types";
import type { Edge, Node as FlowNode } from "@xyflow/react";

// Bump this whenever the default topology or card dimensions change. Older
// persisted coordinates were authored against a different canvas geometry and
// can place current nodes on top of one another after an upgrade.
// Persisted positions from v13 can still contain hand-edited collisions from
// before the sibling-repair rules were introduced. Bump the schema so those
// unsafe coordinates are discarded once and rebuilt from the current layout.
export const CANVAS_LAYOUT_VERSION = "lineage-v17";

export function referenceCategory(role: VisualReference["role"]): CanvasDocument["category"] {
  if (role === "location") return "locations";
  if (role === "prop") return "props";
  if (role === "visual_style") return "style";
  return "characters";
}

function productionRowHeight(documents: CanvasDocument[]) {
  // Portrait media cards are substantially taller than their text siblings.
  // Reserve a full vertical slot so the shot/scene instructions can follow
  // the card without being clipped by the parent group.
  // A portrait card at the production width is roughly 640px tall; reserve
  // a little over one card plus its controls instead of a 1600px slot. The
  // old value made every scene/shot row leave a large blank band and forced
  // users to zoom out before they could compare adjacent rows.
  if (documents.some((document) => (document.groupId === "scene-images" || document.groupId === "shots" || document.groupId === "compile" || document.groupId === "video") && document.aspectRatio === "9:16")) return 1300;
  if (documents.some((document) => document.kind === "note")) return 560;
  return 900;
}

function assetRowHeight(documents: CanvasDocument[]) {
  const hasPortraitGeneratedReference = documents.some((document) =>
    document.groupId === "assets" &&
    (document.kind === "image" || document.kind === "image-generator") &&
    (document.aspectRatio === "9:16" || document.aspectRatio === "3:4")
  );
  return hasPortraitGeneratedReference ? 430 : 330;
}

function assetGroupContentHeight(assets: CanvasDocument[], rowHeight: number) {
  return (["characters", "locations", "props", "style"] as const).reduce((height, category) => {
    const categoryDocuments = assets.filter((document) => document.category === category);
    if (!categoryDocuments.length) return height;
    if (category !== "characters") return height + Math.ceil(categoryDocuments.length / 3) * rowHeight + 20;
    const rows = Math.max(1, ...(["main", "supporting"] as const).map((subgroup) => Math.ceil(categoryDocuments.filter((document) => document.assetSubgroup === subgroup).length / 2)));
    return height + rows * rowHeight + 76;
  }, 0);
}

function laneContentWidth(documents: CanvasDocument[], minimum: number) {
  const rows = new Map<number, number>();
  for (const document of documents) {
    const row = document.row ?? 0;
    rows.set(row, (rows.get(row) ?? 0) + 1);
  }
  const widestRow = Math.max(1, ...rows.values());
  return Math.max(minimum, 48 + widestRow * 390);
}

function buildCanvasGroups(documents: CanvasDocument[]): CanvasGroupSpec[] {
  const rowCount = Math.max(1, ...documents.map((document) => document.row ?? 0));
  const rowHeight = productionRowHeight(documents);
  const laneHeight = 84 + rowCount * rowHeight;
  const assets = documents.filter((document) => document.groupId === "assets");
  const assetsRowHeight = assetRowHeight(documents);
  const assetContentHeight = assetGroupContentHeight(assets, assetsRowHeight);
  const customIntakeCount = documents.filter((document) => document.groupId === "intake" && document.customKind).length;
  const intakeWidth = customIntakeCount ? 1580 : 790;
  const groupDocuments = (id: string) => documents.filter((document) => document.groupId === id);
  const storyDocuments = groupDocuments("story");
  const architectureDocuments = groupDocuments("architecture");
  const sceneDocuments = groupDocuments("scenes");
  const shotDocuments = groupDocuments("shots");
  const sceneImageDocuments = groupDocuments("scene-images");
  const videoDocuments = groupDocuments("video");
  const sceneImageWidth = laneContentWidth(sceneImageDocuments, 430);
  const videoWidth = laneContentWidth(videoDocuments, 430);
  const gap = 120;
  const intakeX = 0;
  const storyX = intakeX + intakeWidth + gap;
  const architectureX = storyX + 410 + gap;
  const scenesX = architectureX + 410 + gap;
  const shotsX = scenesX + 470 + gap;
  const assetsX = shotsX + 430 + gap;
  // An empty resource lane is only a handoff marker. Keeping the populated
  // 1040px asset board when there are no assets creates a huge dead zone and
  // makes the following scene-image/video lanes look disconnected.
  const assetGroupWidth = assets.length ? 1040 : 0;
  const sceneImagesX = assetsX + (assets.length ? assetGroupWidth + gap : 0);
  const videoX = sceneImagesX + sceneImageWidth + gap;
  return [
    { id: "intake", label: "Đầu vào", x: intakeX, y: 120, width: intakeWidth, height: customIntakeCount > 2 ? 1400 : 980, documentCount: groupDocuments("intake").length },
    { id: "story", label: "Câu chuyện hoàn chỉnh", x: storyX, y: 40, width: 410, height: Math.max(390, 120 + storyDocuments.length * 360), documentCount: storyDocuments.length },
    { id: "architecture", label: "Phân tách cảnh", x: architectureX, y: 40, width: 410, height: Math.max(390, 120 + architectureDocuments.length * 360), documentCount: architectureDocuments.length },
    { id: "scenes", label: "Kịch bản / thoại", x: scenesX, y: 40, width: 470, height: laneHeight, documentCount: sceneDocuments.length },
    { id: "shots", label: "Phân rã shot", x: shotsX, y: 40, width: 430, height: laneHeight, documentCount: shotDocuments.length },
    // The former provider-compilation lane is intentionally not rendered.
    // Keep the visible production lanes close together instead of preserving
    // its empty 750px slot, which made the map look disconnected.
    { id: "assets", label: "Tài nguyên", x: assetsX, y: 40, width: assetGroupWidth, height: assetContentHeight ? 82 + assetContentHeight : 120, documentCount: assets.length },
    { id: "scene-images", label: "Ảnh scene", x: sceneImagesX, y: 40, width: sceneImageWidth, height: laneHeight, documentCount: sceneImageDocuments.length },
    { id: "video", label: "Tạo video", x: videoX, y: 40, width: videoWidth, height: laneHeight, documentCount: videoDocuments.length }
  // Optional media lanes should not appear as empty columns. Their absence
  // is a valid pre-generation state, not a missing stage that users need to
  // diagnose; keeping them visible made the map look unfinished and added
  // another dead zone between shot instructions and generated media.
  ].filter((group) => group.documentCount > 0 || ["intake", "story", "architecture", "scenes", "shots"].includes(group.id));
}

type SpatialFlowArgs = {
  documents: CanvasDocument[];
  groups?: CanvasGroupSpec[];
  savedLayout: Record<string, { x: number; y: number }>;
  revisions: Record<string, ProductionGraphRevision[]>;
  initialGuidance: Record<string, string>;
  [key: string]: any;
};

function buildAssetDocumentNode(args: SpatialFlowArgs, group: any, document: CanvasDocument, position: { x: number; y: number }, width: number): FlowNode {
  const { savedLayout, revisions, initialGuidance, onGenerateRevision, onRestoreTextVersion, onRegenerateMedia, onOpenAsset, onOpenDocument, onUpdateIntake, onUpdateText, onUpdateCustomNode, onDeleteCustomNode, onGenerateCustomImage, onUpdateNodeSettings, onResetNodeSettings, onResetLayout } = args;
  return { id: `document:${document.id}`, type: "document", parentId: `group:${group.id}`, extent: "parent", position: savedLayout[`${CANVAS_LAYOUT_VERSION}:${document.id}`] ?? position, data: { document, revisions: revisions[document.id] ?? [], initialGuidance: initialGuidance[document.id], onGenerateRevision, onRestoreTextVersion, onRegenerateMedia, onOpenAsset, onOpenDocument, onUpdateIntake, onUpdateText, onUpdateCustomNode, onDeleteCustomNode, onGenerateCustomImage, onUpdateNodeSettings, onResetNodeSettings, onResetLayout }, style: { width }, dragHandle: ".flow-node-drag-handle", zIndex: 3 };
}

function buildCharacterAssetNodes(args: SpatialFlowArgs, group: any, documents: CanvasDocument[], y: number, rowHeight: number): FlowNode[] {
  const subgroupSpecs = (["main", "supporting"] as const).map((subgroup) => ({ subgroup, documents: documents.filter((document) => document.assetSubgroup === subgroup) })).filter((spec) => spec.documents.length);
  const rows = Math.max(...subgroupSpecs.map((spec) => Math.ceil(spec.documents.length / 2)));
  const nodes: FlowNode[] = [{ id: "section:characters", type: "section", parentId: `group:${group.id}`, position: { x: 20, y }, data: { label: "Nhân vật", count: documents.length, level: "category" }, style: { width: 1000, height: rows * rowHeight + 56 }, draggable: false, selectable: false, zIndex: 1 }];
  for (const [index, spec] of subgroupSpecs.entries()) {
    const x = 32 + index * 486;
    nodes.push({ id: `section:characters:${spec.subgroup}`, type: "section", parentId: `group:${group.id}`, position: { x, y: y + 32 }, data: { label: spec.subgroup === "main" ? "Chính" : "Hỗ trợ", count: spec.documents.length, level: "subgroup" }, style: { width: 470, height: Math.ceil(spec.documents.length / 2) * rowHeight - 12 }, draggable: false, selectable: false, zIndex: 2 });
    spec.documents.forEach((document, itemIndex) => nodes.push(buildAssetDocumentNode(args, group, document, { x: x + 12 + (itemIndex % 2) * 226, y: y + 78 + Math.floor(itemIndex / 2) * rowHeight }, 214)));
  }
  return nodes;
}

function buildCategoryAssetNodes(args: SpatialFlowArgs, group: any, category: "locations" | "props" | "style", documents: CanvasDocument[], y: number, rowHeight: number): FlowNode[] {
  const rows = Math.ceil(documents.length / 3);
  const label = category === "locations" ? "Bối cảnh" : category === "props" ? "Đạo cụ" : "Phong cách hình ảnh";
  const nodes: FlowNode[] = [{ id: `section:${category}`, type: "section", parentId: `group:${group.id}`, position: { x: 20, y }, data: { label, count: documents.length, level: "category" }, style: { width: 160, height: rows * rowHeight - 18 }, draggable: false, selectable: false, zIndex: 2 }];
  documents.forEach((document, index) => nodes.push(buildAssetDocumentNode(args, group, document, { x: 176 + (index % 3) * 278, y: y + 12 + Math.floor(index / 3) * rowHeight }, 260)));
  return nodes;
}

function buildAssetNodes(args: SpatialFlowArgs, group: any, groupDocuments: CanvasDocument[]): FlowNode[] {
  const rowHeight = assetRowHeight(args.documents);
  let categoryY = 68;
  const nodes: FlowNode[] = [];
  for (const category of ["characters", "locations", "props", "style"] as const) {
    const categoryDocuments = groupDocuments.filter((document) => document.category === category);
    if (!categoryDocuments.length) continue;
    const categoryNodes = category === "characters" ? buildCharacterAssetNodes(args, group, categoryDocuments, categoryY, rowHeight) : buildCategoryAssetNodes(args, group, category, categoryDocuments, categoryY, rowHeight);
    nodes.push(...categoryNodes);
    categoryY += category === "characters" ? Math.max(1, ...(["main", "supporting"] as const).map((subgroup) => Math.ceil(categoryDocuments.filter((document) => document.assetSubgroup === subgroup).length / 2))) * rowHeight + 76 : Math.ceil(categoryDocuments.length / 3) * rowHeight + 20;
  }
  return nodes;
}

function intakeDocumentPosition(document: CanvasDocument) {
  if (document.kind === "brief") return { x: 24, y: 70 };
  if (document.kind === "profile") return { x: 406, y: 70 };
  if (document.kind === "upload-image") return { x: 24, y: 540 };
  return { x: 406, y: 480 };
}

function laneDocumentPosition({ document, groupId, row, rowHeight, mediaIndex, shotTextOffset, sceneContinuityOffset }: {
  document: CanvasDocument;
  groupId: string;
  row: number;
  rowHeight: number;
  mediaIndex: number;
  shotTextOffset: number;
  sceneContinuityOffset: number;
}) {
  const laneY = 117 + Math.max(0, row - 1) * rowHeight;
  if (groupId === "scenes") return { x: 24, y: laneY + (document.slot === "screenplay" ? 330 : 0) };
  if (groupId === "scene-images" && document.slot === "scene-continuity") return { x: 24, y: laneY + sceneContinuityOffset };
  if (groupId === "scene-images" || groupId === "video") return { x: 24 + Math.max(0, mediaIndex) * 390, y: laneY };
  if (groupId === "compile") return { x: 24, y: laneY };
  if (groupId === "shots") return { x: 24, y: laneY + (document.slot === "shot" ? shotTextOffset : 0) };
  if (groupId === "story" || groupId === "architecture") return { x: 24, y: 70 + Math.max(0, row - 1) * 350 };
  return { x: 24, y: 70 };
}

function defaultDocumentPosition({ document, groupId, row, rowHeight, mediaIndex, customIndex, shotTextOffset, sceneContinuityOffset }: {
  document: CanvasDocument;
  groupId: string;
  row: number;
  rowHeight: number;
  mediaIndex: number;
  customIndex: number;
  shotTextOffset: number;
  sceneContinuityOffset: number;
}) {
  if (document.customKind) return { x: 800 + (customIndex % 2) * 382, y: 70 + Math.floor(customIndex / 2) * 390 };
  if (document.kind === "note") return groupId === "intake" ? { x: 24, y: 330 } : { x: 24, y: 320 + Math.max(0, row - 1) * rowHeight };
  if (groupId === "intake") return intakeDocumentPosition(document);
  return laneDocumentPosition({ document, groupId, row, rowHeight, mediaIndex, shotTextOffset, sceneContinuityOffset });
}

function documentCardWidth(document: CanvasDocument, groupId: string) {
  if (document.slot === "scene") return 470;
  if (document.slot === "shot") return 350;
  if (["scene-keyframe", "keyframe", "video"].includes(document.slot ?? "")) return 362;
  if (groupId === "story" || groupId === "architecture") return 362;
  return 342;
}

function buildRegularGroupNodes(args: SpatialFlowArgs, group: any, groupDocuments: CanvasDocument[]): FlowNode[] {
  const { documents, savedLayout, revisions, initialGuidance, onGenerateRevision, onRestoreTextVersion, onRegenerateMedia, onOpenAsset, onOpenDocument, onUpdateIntake, onUpdateText, onUpdateCustomNode, onDeleteCustomNode, onGenerateCustomImage, onUpdateNodeSettings, onResetNodeSettings, onResetLayout } = args;
  const nodes: FlowNode[] = [];
  const rowHeight = productionRowHeight(documents);
  const customIndexById = new Map(groupDocuments.filter((document) => document.customKind).map((document, index) => [document.id, index]));
  const rowDocumentsByRow = new Map<number, CanvasDocument[]>();
  for (const document of groupDocuments) {
    const row = document.row ?? 0;
    rowDocumentsByRow.set(row, [...(rowDocumentsByRow.get(row) ?? []), document]);
  }
  const shotKeyframeByRow = new Map<number, CanvasDocument>();
  for (const document of documents) {
    if (document.groupId === "shots" && document.slot === "keyframe" && !shotKeyframeByRow.has(document.row ?? 0)) shotKeyframeByRow.set(document.row ?? 0, document);
  }
  const sceneImageByRow = new Map<number, CanvasDocument>();
  for (const document of documents) {
    if (document.slot === "scene-keyframe" && !sceneImageByRow.has(document.row ?? 0)) sceneImageByRow.set(document.row ?? 0, document);
  }
  groupDocuments.forEach((document, index) => {
      const row = document.row ?? 0;
      const customIndex = customIndexById.get(document.id) ?? -1;
      const rowDocuments = rowDocumentsByRow.get(row) ?? [];
      const mediaIndex = rowDocuments.findIndex((candidate) => candidate.id === document.id);
      // The keyframe is produced from the provider-compilation document, not
      // directly from the shot text node. Match the same scene/row instead of
      // relying on parentDocumentId, otherwise both nodes receive the exact
      // same position and the keyframe paints over the shot instructions.
      const shotKeyframeCandidate = document.slot === "shot" ? shotKeyframeByRow.get(row) : undefined;
      const shotKeyframeDocument = shotKeyframeCandidate && (shotKeyframeCandidate.sceneDocumentId === document.sceneDocumentId || shotKeyframeCandidate.parentDocumentId === `provider-compilation:${document.id.replace(/^shot:/, "")}`) ? shotKeyframeCandidate : undefined;
      const shotTextOffset = shotKeyframeDocument ? shotKeyframeDocument.aspectRatio === "9:16" ? 1100 : 650 : 0;
      const sceneImageDocument = document.slot === "scene-continuity" ? sceneImageByRow.get(row) : undefined;
      const sceneContinuityOffset = sceneImageDocument?.aspectRatio === "9:16" ? 1100 : 650;
      const defaultPosition = defaultDocumentPosition({ document, groupId: group.id, row, rowHeight, mediaIndex, customIndex, shotTextOffset, sceneContinuityOffset });
      const cardWidth = documentCardWidth(document, group.id);
      nodes.push({
        id: `document:${document.id}`,
        type: "document",
        parentId: `group:${group.id}`,
        extent: "parent",
        position: savedLayout[`${CANVAS_LAYOUT_VERSION}:${document.id}`] ?? defaultPosition,
        data: { document, revisions: revisions[document.id] ?? [], initialGuidance: initialGuidance[document.id], onGenerateRevision, onRestoreTextVersion, onRegenerateMedia, onOpenAsset, onOpenDocument, onUpdateIntake, onUpdateText, onUpdateCustomNode, onDeleteCustomNode, onGenerateCustomImage, onUpdateNodeSettings, onResetNodeSettings, onResetLayout },
        style: { width: cardWidth },
        zIndex: document.kind === "upload-image" || document.kind === "custom-upload" ? 4 : 2
      });
    });
  return nodes;
}

/**
 * Persisted coordinates are user-editable, but an old/manual coordinate can
 * still place a shot instruction card on top of its generated keyframe. Keep
 * the saved layout while repairing only this unsafe sibling collision.
 */
function repairProductionSiblingOverlaps(nodes: FlowNode[]): FlowNode[] {
  for (const node of nodes) {
    const document = node.data?.document as CanvasDocument | undefined;
    if (!document || document.slot !== "shot") continue;
    const keyframe = nodes.find((candidate) => {
      const candidateDocument = candidate.data?.document as CanvasDocument | undefined;
      return candidateDocument?.groupId === "shots" && candidateDocument.slot === "keyframe" && candidateDocument.row === document.row &&
        (candidateDocument.sceneDocumentId === document.sceneDocumentId || candidateDocument.parentDocumentId === `provider-compilation:${document.id.replace(/^shot:/, "")}`);
    });
    if (!keyframe) continue;
    const xOverlap = Math.abs((node.position?.x ?? 0) - (keyframe.position?.x ?? 0)) < 380;
    const yOverlap = Math.abs((node.position?.y ?? 0) - (keyframe.position?.y ?? 0)) < 900;
    if (xOverlap && yOverlap) {
      const keyframeDocument = keyframe.data?.document as CanvasDocument;
      node.position = { ...node.position, y: keyframe.position.y + (keyframeDocument.aspectRatio === "9:16" ? 1100 : 650) };
    }
  }
  return nodes;
}

function collectDocumentSiblings(nodes: FlowNode[]) {
  const byParent = new Map<string, FlowNode[]>();
  for (const node of nodes) {
    if (node.type !== "document" || !node.parentId) continue;
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }
  return byParent;
}

function documentHeight(node: FlowNode) {
  const document = node.data?.document as CanvasDocument | undefined;
  if (!document) return 320;
  if (document.aspectRatio === "9:16" || ["keyframe", "video", "scene-keyframe"].includes(document.slot ?? "")) return 760;
  if (document.kind === "profile") return 380;
  if (document.kind === "note") return 260;
  return 320;
}

function documentWidth(node: FlowNode) {
  return Number(node.style?.width) || 342;
}

function nodesOverlap(left: FlowNode, right: FlowNode) {
  return left.position.x < right.position.x + documentWidth(right) - 12 &&
    left.position.x + documentWidth(left) - 12 > right.position.x &&
    left.position.y < right.position.y + documentHeight(right) - 12 &&
    left.position.y + documentHeight(left) - 12 > right.position.y;
}

function moveBelowOverlappingSiblings(siblings: FlowNode[], index: number) {
  const current = siblings[index];
  let guard = 0;
  while (siblings.slice(0, index).some((candidate) => nodesOverlap(candidate, current)) && guard++ < siblings.length + 2) {
    const previous = siblings.slice(0, index)
      .filter((candidate) => nodesOverlap(candidate, current))
      .reduce((latest, candidate) => candidate.position.y + documentHeight(candidate) > latest.position.y + documentHeight(latest) ? candidate : latest);
    current.position = { ...current.position, y: previous.position.y + documentHeight(previous) + 24 };
  }
}

function expandGroupToFit(group: FlowNode | undefined, node: FlowNode) {
  if (!group) return;
  const requiredHeight = node.position.y + documentHeight(node) + 48;
  if (requiredHeight > (Number(group.style?.height) || 0)) group.style = { ...group.style, height: requiredHeight };
}

/** Repair stale saved coordinates that place document cards on top of one another. */
export function repairDocumentOverlaps(nodes: FlowNode[]): FlowNode[] {
  const byParent = collectDocumentSiblings(nodes);
  for (const [parentId, siblings] of byParent) {
    siblings.sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
    for (let index = 0; index < siblings.length; index += 1) {
      moveBelowOverlappingSiblings(siblings, index);
      expandGroupToFit(nodes.find((node) => node.id === parentId), siblings[index]);
    }
  }
  return nodes;
}

function buildCanvasNodes(args: SpatialFlowArgs): FlowNode[] {
  const { documents, groups = [] } = args;
  const nodes: FlowNode[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    const groupDocuments = documents.filter((document) => document.groupId === group.id);
    nodes.push({ id: `group:${group.id}`, type: "groupFrame", position: { x: group.x, y: group.y }, data: { order: groupIndex + 1, label: group.label, detail: `${groupDocuments.length} mục` }, style: { width: group.width, height: group.height }, draggable: false, selectable: false, zIndex: 0 });
    if (group.id === "assets") { nodes.push(...buildAssetNodes(args, group, groupDocuments)); continue; }
    nodes.push(...buildRegularGroupNodes(args, group, groupDocuments));
  }
  return repairDocumentOverlaps(repairProductionSiblingOverlaps(nodes));
}

function buildShotDocumentEdges(documents: CanvasDocument[], shotDocument: CanvasDocument): Edge[] {
  const edges: Edge[] = [];
  const sceneDocument = documents.find((document) => document.id === shotDocument.parentDocumentId);
  const sceneVisual = documents.find((document) => document.slot === "scene-keyframe" && document.sceneDocumentId === shotDocument.parentDocumentId);
  if (sceneDocument && !sceneVisual) edges.push({ id: `lineage:${sceneDocument.id}-${shotDocument.id}`, source: `document:${sceneDocument.id}`, target: `document:${shotDocument.id}`, type: "smoothstep", style: { stroke: "#7f8fa6", strokeWidth: 1.4 } });
  const keyframe = documents.find((document) => document.slot === "keyframe" && document.parentDocumentId === shotDocument.id);
  // Provider compilation is internal payload data and is not rendered as a
  // node. Resolve the visible video directly through its persisted parent id.
  const video = documents.find((document) => document.slot === "video" && document.parentDocumentId === `provider-compilation:${shotDocument.id.replace(/^shot:/, "")}`);
  if (keyframe) edges.push({ id: `lineage:${shotDocument.id}-${keyframe.id}`, source: `document:${shotDocument.id}`, target: `document:${keyframe.id}`, type: "smoothstep", style: { stroke: "#6d87b3", strokeWidth: 1.6 } });
  if (video) {
    if (keyframe) edges.push({ id: `lineage:${keyframe.id}-${video.id}`, source: `document:${keyframe.id}`, target: `document:${video.id}`, type: "smoothstep", style: { stroke: "#2f7d5b", strokeWidth: 1.8 } });
    else edges.push({ id: `lineage:${shotDocument.id}-${video.id}`, source: `document:${shotDocument.id}`, target: `document:${video.id}`, type: "smoothstep", style: { stroke: "#7f8fa6", strokeWidth: 1.25 } });
  }
  return edges;
}

function buildStoryArchitectureEdge(documents: CanvasDocument[]): Edge[] {
  const storyDocument = documents.find((document) => document.kind === "story");
  const architectureDocument = documents.find((document) => document.kind === "scene-breakdown");
  return storyDocument && architectureDocument
    ? [{ id: `lineage:${storyDocument.id}-${architectureDocument.id}`, source: `document:${storyDocument.id}`, target: `document:${architectureDocument.id}`, type: "smoothstep", style: { stroke: "#6d87b3", strokeWidth: 1.8 } }]
    : [];
}

function buildShotEdges(documents: CanvasDocument[]): Edge[] {
  return documents.filter((document) => document.slot === "shot").flatMap((shotDocument) => buildShotDocumentEdges(documents, shotDocument)).concat(buildStoryArchitectureEdge(documents));
}
function buildSceneEdges(documents: CanvasDocument[]): Edge[] {
  const edges: Edge[] = [];
  for (const sceneVisual of documents.filter((document) => document.slot === "scene-keyframe")) {
    const sceneDocument = documents.find((document) => document.id === sceneVisual.sceneDocumentId);
    if (sceneDocument) edges.push(...buildSceneReferenceEdges(documents, sceneDocument, sceneVisual));
    edges.push(...buildSceneShotEdges(documents, sceneVisual));
  }
  return edges;
}

function buildSceneReferenceEdges(documents: CanvasDocument[], sceneDocument: CanvasDocument, sceneVisual: CanvasDocument): Edge[] {
  const edges: Edge[] = [{ id: `lineage:${sceneDocument.id}-${sceneVisual.id}`, source: `document:${sceneDocument.id}`, target: `document:${sceneVisual.id}`, type: "smoothstep", style: { stroke: "#6d87b3", strokeWidth: 1.8 } }];
  for (const requirementId of sceneDocument.referenceRequirementIds ?? []) {
    const requirementNode = documents.find((document) => (document.kind === "image-generator" || document.kind === "custom-upload") && document.customNode.referenceRequirementId === requirementId);
    if (requirementNode) edges.push({ id: `asset-context:${requirementNode.id}-${sceneVisual.id}`, source: `document:${requirementNode.id}`, target: `document:${sceneVisual.id}`, type: "smoothstep", style: { stroke: "#596f91", strokeWidth: 1.25 } });
  }
  const sceneContinuity = documents.find((document) => document.slot === "scene-continuity" && document.sceneDocumentId === sceneVisual.sceneDocumentId);
  if (sceneContinuity) edges.push({ id: `continuity:${sceneVisual.id}-${sceneContinuity.id}`, source: `document:${sceneVisual.id}`, target: `document:${sceneContinuity.id}`, type: "smoothstep", style: { stroke: "#b06f35", strokeWidth: 1.6 } });
  for (const shotText of documents.filter((document) => document.slot === "shot" && document.parentDocumentId === sceneVisual.sceneDocumentId)) edges.push({ id: `visual-context:${sceneVisual.id}-${shotText.id}`, source: `document:${sceneVisual.id}`, target: `document:${shotText.id}`, type: "smoothstep", style: { stroke: "#7f8fa6", strokeWidth: 1.4 } });
  return edges;
}

function buildSceneShotEdges(documents: CanvasDocument[], sceneVisual: CanvasDocument): Edge[] {
  const sceneContinuity = documents.find((document) => document.slot === "scene-continuity" && document.sceneDocumentId === sceneVisual.sceneDocumentId);
  const shotVisuals = documents.filter((document) => document.slot === "keyframe" && document.sceneDocumentId === sceneVisual.sceneDocumentId && document.id !== sceneVisual.id).sort((left, right) => (left.row ?? 0) - (right.row ?? 0));
  return shotVisuals.flatMap((shotVisual, index) => {
    const previous = shotVisuals[index - 1];
    return [
      { id: `visual-context:${sceneVisual.id}-${shotVisual.id}`, source: `document:${sceneContinuity?.id || sceneVisual.id}`, target: `document:${shotVisual.id}`, type: "smoothstep", style: { stroke: "#9a72c7", strokeWidth: 1.35, strokeDasharray: "5 4" } },
      ...(previous ? [{ id: `shot-continuity:${previous.id}-${shotVisual.id}`, source: `document:${previous.id}`, target: `document:${shotVisual.id}`, type: "smoothstep", style: { stroke: "#2f7d5b", strokeWidth: 1.35, strokeDasharray: "5 4" } }] : [])
    ];
  });
}
function buildContextEdges(documents: CanvasDocument[], groups: any[]): Edge[] {
  const edges: Edge[] = [];
  const bundleDocuments = documents.filter((document) => document.customKind === "context-bundle");
  const contextTarget = bundleDocuments.at(-1);
  if (contextTarget) {
    const contextSources = documents.filter((document) => document.groupId === "intake" && document.id !== contextTarget.id && document.kind !== "reference-note");
    for (const source of contextSources) edges.push({
      id: `context:${source.id}-${contextTarget.id}`,
      source: `document:${source.id}`,
      target: `document:${contextTarget.id}`,
      type: "smoothstep",
      animated: source.kind === "image-generator" && Boolean(source.job && !["approved", "done", "failed_manual", "failed_retryable", "cancelled"].includes(source.job.status)),
      style: { stroke: source.kind === "upload-image" || source.kind === "custom-upload" || source.kind === "image-generator" ? "#3488db" : source.kind === "profile" ? "#865bd5" : "#7b8796", strokeWidth: 1.7 }
    });
    const downstreamStoryDocument = documents.find((document) => document.kind === "story");
    if (downstreamStoryDocument) edges.push({ id: `context:${contextTarget.id}-${downstreamStoryDocument.id}`, source: `document:${contextTarget.id}`, target: `document:${downstreamStoryDocument.id}`, type: "smoothstep", style: { stroke: "#2f8f67", strokeWidth: 2 } });
  }
  const stageGroups = groups;
  stageGroups.slice(0, -1).forEach((group, index) => edges.push({
    id: `stage:${group.id}-${stageGroups[index + 1].id}`,
    source: `group:${group.id}`,
    target: `group:${stageGroups[index + 1].id}`,
    type: "smoothstep",
    style: { stroke: "#9aa7b9", strokeWidth: 1.25 },
    zIndex: 1
  }));
  return edges;
}
function buildCanvasEdges(args: SpatialFlowArgs): Edge[] {
  const { documents, groups = [] } = args;
  const edges = [...buildShotEdges(documents), ...buildSceneEdges(documents), ...buildContextEdges(documents, groups)];
  return edges;
}

/** React Flow edge ids are identity keys; duplicate ids make reconciliation
 * unstable after a refresh and can leave doubled or stale connectors. */
export function uniqueCanvasEdges(edges: Edge[]): Edge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  });
}

export function buildSpatialFlow(
  documents: CanvasDocument[],
  savedLayout: Record<string, { x: number; y: number }>,
  revisions: Record<string, ProductionGraphRevision[]>,
  initialGuidance: Record<string, string>,
  onGenerateRevision: (document: CanvasDocument, instruction: string) => void,
  onRestoreTextVersion: (document: CanvasDocument, text: string) => void,
  onRegenerateMedia: (asset: Asset, instruction?: string, settings?: ProductionGraphNodeSettings) => void,
  onOpenAsset: (document: CanvasDocument) => void,
  onOpenDocument: (document: CanvasDocument) => void,
  onUpdateIntake: (patch: Partial<ProjectIntake>) => void,
  onUpdateText: (document: CanvasDocument, text: string) => void,
  onUpdateCustomNode: (nodeId: string, patch: Partial<ProductionGraphCustomNode>) => void,
  onDeleteCustomNode: (nodeId: string) => void,
  onGenerateCustomImage: (node: ProductionGraphCustomNode) => void,
  onUpdateNodeSettings: (documentId: string, patch: ProductionGraphNodeSettings) => void,
  onResetNodeSettings: () => void,
  onResetLayout: () => void
) {
  const spatialArgs = { documents, savedLayout, revisions, initialGuidance, onGenerateRevision, onRestoreTextVersion, onRegenerateMedia, onOpenAsset, onOpenDocument, onUpdateIntake, onUpdateText, onUpdateCustomNode, onDeleteCustomNode, onGenerateCustomImage, onUpdateNodeSettings, onResetNodeSettings, onResetLayout };
  const groups = buildCanvasGroups(documents);
  const nodes = buildCanvasNodes({ ...spatialArgs, groups });
  const edges = uniqueCanvasEdges(buildCanvasEdges({ ...spatialArgs, groups }));
  const representativeEdges = edges.filter((edge) => edge.id.startsWith("stage:") || edge.id.startsWith("lineage:story:") || edge.id.startsWith("lineage:architecture:"));
  return { nodes, edges: representativeEdges, groups };
}
