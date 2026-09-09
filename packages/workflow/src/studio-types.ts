/**
 * studio-types.ts
 * Local type definitions and pure utility functions for the renderer.
 * Extracted from main.tsx (Phase 3.1) — do NOT add React/UI code here.
 *
 * Phase: 3.1 | Baseline commit: 02d8e37
 * Rules: This file must have zero React imports. Pure TypeScript only.
 */
import type { PipelineStepId } from "@studio/domain/pipeline-gates";
import type {
  Asset,
  AutomationJob,
  BrowserProviderAdapter,
  Character,
  ProductionGraphCustomNode,
  ProductionGraphNodeSettings,
  ProductionGraphRevision,
  Project,
  ProjectIntake,
  ReferenceRole,
  Scene,
  Shot,
  SkillPack,
  VisualReference
} from "@studio/types";
export type { PipelineStepId } from "@studio/domain/pipeline-gates";

// ─── Payload types ─────────────────────────────────────────────

export type PlanPayload = {
  projectId: string;
  storySeed: string;
  scenes: Scene[];
  shots: Shot[];
  characters?: Character[];
};

export type VideoAspectRatio = "9:16" | "16:9" | "4:3" | "3:4" | "1:1";

export type PendingStoryboardQueue = {
  sequenceId: string;
  projectId: string;
  providerId: string;
  sessionKey: string;
  items: Array<{ scene: Scene; shot: Shot; sourceAssetId?: string }>;
  nextIndex: number;
  previousJobId?: string;
  repairAspectRatio?: VideoAspectRatio;
  mode?: "scene_frames" | "shot_keyframes";
};

export type PipelineRunState = {
  mode: "step" | "full";
  running: boolean;
  currentStep?: PipelineStepId;
  message: string;
  startedAt: string;
};

export type SkillDoc = SkillPack;

export type StoryDocument = NonNullable<Project["storyDocument"]>;
export type TextPage = { start: number; end: number; text: string };

export type ReviewFinding = {
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

export type ReferenceUploadPayload = {
  projectId: string;
  name: string;
  role: ReferenceRole;
  referenceUse?: VisualReference["referenceUse"];
  characterSlot?: string;
  dataUrl: string;
  filePath?: string;
  previewDataUrl?: string;
  mimeType: string;
  sourceDescription: string;
  transformationRequest: string;
  sourceAssetId?: string;
  sourceProvider?: string;
  sourceAspectRatio?: VideoAspectRatio;
};

export type DraftUpload = {
  file: File;
  dataUrl: string;
};

export type BridgeStatus = {
  connectedExtensions: number;
  expectedVersion: string;
  versions: string[];
  updateRequired: boolean;
  identifying: boolean;
  connections?: Array<{
    extensionId?: string;
    extensionInstanceId?: string;
    pairing?: {
      pairingId?: string;
      extensionId?: string;
      extensionInstanceId?: string;
      sessionId?: string;
      code?: string;
      state?: "pending" | "approved" | "secret_sent" | "confirmed" | "expired" | "rejected";
      expiresAt?: number;
    };
    providerVisibility?: {
      googleFlowProjectTabs?: number;
      googleFlowRuntimeToolTabs?: number;
      googleFlowEditorToolTabs?: number;
      [key: string]: unknown;
    };
  }>;
};

// ─── Studio view navigation ────────────────────────────────────

export type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";

// ─── Flow / Production Graph canvas types ──────────────────────

export type FlowDocument =
  | { id: string; kind: "brief" | "story" | "scene-breakdown" | "scene" | "shot" | "note" | "reference-note"; title: string; text: string; entityId: string }
  | { id: string; kind: "scene-continuity"; title: string; text: string; entityId: string; scene: Scene; previousScene?: Scene; requirements: NonNullable<Project["storyDocument"]>["visualRequirements"]; matchedReferences: VisualReference[] }
  | { id: string; kind: "profile"; title: string; entityId: string; intake: ProjectIntake; providers: BrowserProviderAdapter[] }
  | { id: string; kind: "upload-image"; title: string; entityId: string; dataUrl?: string; fileName?: string; mimeType?: string }
  | { id: string; kind: "custom-upload" | "image-generator"; title: string; entityId: string; text?: string; dataUrl?: string; fileName?: string; mimeType?: string; customNode: ProductionGraphCustomNode; job?: AutomationJob; generatedAsset?: Asset }
  | { id: string; kind: "image" | "video"; title: string; asset: Asset };

export type CanvasDocument = FlowDocument & {
  groupId: string;
  providerId?: string;
  providerName?: string;
  aspectRatio?: string;
  durationSec?: number;
  resolution?: string;
  prompt?: string;
  category?: "characters" | "locations" | "props" | "style";
  assetSubgroup?: "main" | "supporting";
  mediaRole?: "reference" | "generated" | "input";
  parentDocumentId?: string;
  sceneDocumentId?: string;
  row?: number;
  slot?: "scene" | "screenplay" | "shot" | "scene-keyframe" | "scene-continuity" | "keyframe" | "provider-compile" | "video";
  versions?: Asset[];
  referenceRequirementIds?: string[];
  customKind?: ProductionGraphCustomNode["kind"];
  inheritedAspectRatio?: VideoAspectRatio;
  hasAspectRatioOverride?: boolean;
  fitContent?: boolean;
  canRun?: boolean;
  activeJob?: AutomationJob;
  inheritedProviderId?: string;
  outputLanguage?: string;
  inheritedOutputLanguage?: string;
  videoQuality?: "fast" | "quality";
  generateAudio?: boolean;
  nativeAudioWarning?: string;
  estimatedCredits?: { min: number; max: number };
  providers?: BrowserProviderAdapter[];
};

export type ImageGeneratorCanvasDocument = CanvasDocument & {
  kind: "image-generator";
  customNode: ProductionGraphCustomNode;
  job?: AutomationJob;
  generatedAsset?: Asset;
};

export type CanvasNodeData = {
  document: CanvasDocument;
  revisions: ProductionGraphRevision[];
  initialGuidance?: string;
  onGenerateRevision: (document: CanvasDocument, instruction: string) => void;
  onRestoreTextVersion: (document: CanvasDocument, text: string) => void;
  onRegenerateMedia: (asset: Asset, instruction?: string, settings?: ProductionGraphNodeSettings) => void;
  onOpenAsset: (document: CanvasDocument) => void;
  onOpenDocument: (document: CanvasDocument) => void;
  onUpdateIntake: (patch: Partial<ProjectIntake>) => void;
  onUpdateText: (document: CanvasDocument, text: string) => void;
  onUpdateCustomNode: (nodeId: string, patch: Partial<ProductionGraphCustomNode>) => void;
  onDeleteCustomNode: (nodeId: string) => void;
  onGenerateCustomImage: (node: ProductionGraphCustomNode) => void;
  onUpdateNodeSettings: (documentId: string, patch: ProductionGraphNodeSettings) => void;
  onResetNodeSettings: () => void;
  onResetLayout: () => void;
};

export type GroupNodeData = { order: number; label: string; detail: string };
export type SectionNodeData = { label: string; count: number; level?: "category" | "subgroup" };
export type CanvasGroupSpec = { id: string; label: string; x: number; y: number; width: number; height: number; documentCount: number };

// ─── Source library types ──────────────────────────────────────

export type SourceGroupMode = "scene" | "shot" | "custom";
export type SourceResolvedAsset = {
  asset: Asset;
  shot?: Shot;
  scene?: Scene;
  job?: AutomationJob;
  groupName: string;
  typeName: string;
};

// ─── Pure utility functions ────────────────────────────────────
