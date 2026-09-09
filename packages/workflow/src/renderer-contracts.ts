/**
 * Single renderer boundary for shared contracts.
 * This module is type/domain-only: no React, Electron, DOM, or persistence.
 */
export type * from "@studio/types";

// Renderer-owned contracts are kept at this boundary so context consumers do
// not traverse a second view-contract module just to reach shared types.
import type {
  Asset, AutomationJob, BrowserProviderAdapter, ProductionGraphCustomNode,
  ProductionGraphNodeSettings, ProductionGraphRevision, Project, ProjectIntake,
  Scene, Shot, VisualReference
} from "@studio/types";

export type PipelineStepId = "setup" | "foundation" | "architecture" | "screenplay" | "shots" | "character" | "prompts" | "storyboard" | "video" | "review";
export type VideoAspectRatio = "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
export type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";
export type StoryDocument = NonNullable<Project["storyDocument"]>;
export type DraftUpload = { file: File; dataUrl: string };
export type PipelineStepItem = { id: PipelineStepId; label: string; view: StudioView; ready: boolean };
export type PipelineRunState = { mode: "step" | "full"; running: boolean; currentStep?: PipelineStepId; message: string; startedAt: string };
export type PendingStoryboardQueue = { sequenceId: string; projectId: string; providerId: string; sessionKey: string; items: Array<{ scene: Scene; shot: Shot; sourceAssetId?: string }>; nextIndex: number; previousJobId?: string; repairAspectRatio?: VideoAspectRatio; mode?: "scene_frames" | "shot_keyframes" };
export type BridgeStatus = { connectedExtensions: number; expectedVersion: string; versions: string[]; updateRequired: boolean; identifying: boolean; connections?: Array<{ extensionId?: string; providerVisibility?: { googleFlowProjectTabs?: number; [key: string]: unknown } }> };
export type FlowDocument =
  | { id: string; kind: "brief" | "story" | "scene-breakdown" | "scene" | "shot" | "note" | "reference-note"; title: string; text: string; entityId: string }
  | { id: string; kind: "scene-continuity"; title: string; text: string; entityId: string; scene: Scene; previousScene?: Scene; requirements: StoryDocument["visualRequirements"]; matchedReferences: VisualReference[] }
  | { id: string; kind: "profile"; title: string; entityId: string; intake: ProjectIntake; providers: BrowserProviderAdapter[] }
  | { id: string; kind: "upload-image"; title: string; entityId: string; dataUrl?: string; fileName?: string; mimeType?: string }
  | { id: string; kind: "custom-upload" | "image-generator"; title: string; entityId: string; text?: string; dataUrl?: string; fileName?: string; mimeType?: string; customNode: ProductionGraphCustomNode; job?: AutomationJob; generatedAsset?: Asset }
  | { id: string; kind: "image" | "video"; title: string; asset: Asset };
export type CanvasDocument = FlowDocument & { groupId: string; providerId?: string; providerName?: string; aspectRatio?: string; durationSec?: number; resolution?: string; prompt?: string; category?: "characters" | "locations" | "props" | "style"; assetSubgroup?: "main" | "supporting"; mediaRole?: "reference" | "generated" | "input"; parentDocumentId?: string; sceneDocumentId?: string; row?: number; slot?: "scene" | "screenplay" | "shot" | "scene-keyframe" | "scene-continuity" | "keyframe" | "provider-compile" | "video"; versions?: Asset[]; referenceRequirementIds?: string[]; customKind?: ProductionGraphCustomNode["kind"]; inheritedAspectRatio?: VideoAspectRatio; hasAspectRatioOverride?: boolean; fitContent?: boolean; canRun?: boolean; activeJob?: AutomationJob; inheritedProviderId?: string; outputLanguage?: string; inheritedOutputLanguage?: string; videoQuality?: "fast" | "quality"; generateAudio?: boolean; nativeAudioWarning?: string; estimatedCredits?: { min: number; max: number }; providers?: BrowserProviderAdapter[] };
export type ImageGeneratorCanvasDocument = CanvasDocument & { kind: "image-generator"; customNode: ProductionGraphCustomNode; job?: AutomationJob; generatedAsset?: Asset };
export type CanvasNodeData = { document: CanvasDocument; revisions: ProductionGraphRevision[]; initialGuidance?: string; onGenerateRevision: (document: CanvasDocument, instruction: string) => void; onRestoreTextVersion: (document: CanvasDocument, text: string) => void; onRegenerateMedia: (asset: Asset, instruction?: string, settings?: ProductionGraphNodeSettings) => void; onOpenAsset: (document: CanvasDocument) => void; onOpenDocument: (document: CanvasDocument) => void; onUpdateIntake: (patch: Partial<ProjectIntake>) => void; onUpdateText: (document: CanvasDocument, text: string) => void; onUpdateCustomNode: (nodeId: string, patch: Partial<ProductionGraphCustomNode>) => void; onDeleteCustomNode: (nodeId: string) => void; onGenerateCustomImage: (node: ProductionGraphCustomNode) => void; onUpdateNodeSettings: (documentId: string, patch: ProductionGraphNodeSettings) => void; onResetNodeSettings: () => void; onResetLayout: () => void };
export type GroupNodeData = { order: number; label: string; detail: string };
export type SectionNodeData = { label: string; count: number; level?: "category" | "subgroup" };
export type CanvasGroupSpec = { id: string; label: string; x: number; y: number; width: number; height: number; documentCount: number };
