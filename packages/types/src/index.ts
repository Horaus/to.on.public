export type AssetType = "image" | "video" | "audio" | "subtitle" | "reference";
export type ProviderCapability = "text" | "image" | "video" | "upscale" | "prompt-enhance";
export type ProviderPlatform = "chatgpt" | "google-flow" | "grok" | "freepik" | string;

export type Asset = {
  id: string;
  projectId: string;
  sceneId?: string;
  shotId?: string;
  type: AssetType;
  filePath: string;
  sourceProvider: string;
  sourceJobId?: string;
  prompt?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type VideoEditorialCheckKey =
  | "dominantActionFulfilled"
  | "noForbiddenInvention"
  | "identityWardrobeStable"
  | "propStateCorrect"
  | "geographyCorrect"
  | "durationValid"
  | "speechDeliveryCorrect"
  | "handoffFramesMatch";

export type VideoEditorialReview = {
  status: "review_required" | "accepted" | "rejected";
  checks: Record<VideoEditorialCheckKey, boolean>;
  reviewer: string;
  reason: string;
  evidence: string[];
  promptVersion: string;
  reviewedAt: string;
};

export type AutomationJobStatus =
  | "pending"
  | "opening_provider"
  | "waiting_login"
  | "waiting_manual_action"
  | "submitting"
  | "generating"
  | "downloading"
  | "review_required"
  | "approved"
  | "done"
  | "failed_retryable"
  | "failed_manual"
  | "cancelled";

export type AutomationJob = {
  id: string;
  projectId: string;
  shotId?: string;
  providerId: string;
  jobType: "text" | "image" | "video" | "audio" | "download" | "prompt-enhance" | "export";
  input: Record<string, unknown>;
  status: AutomationJobStatus;
  resultAssetIds: string[];
  error?: string;
  statusMessage?: string;
  progress?: number;
  outputText?: string;
  providerConversationUrl?: string;
  recoveryAttempts?: number;
  flowRecoveryAttempts?: number;
  providerWorkspaceUrl?: string;
  providerReferenceAssetIds?: string[];
  idempotencyKey?: string;
  providerAcceptedAt?: string;
  providerMediaId?: string;
  supersededByJobId?: string;
  /** Preserved when a failed attempt is retained as a cancelled lineage event. */
  supersededFromStatus?: AutomationJobStatus;
  supersededError?: string;
  preflightPassedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type BrowserProviderAdapter = {
  id: string;
  name: string;
  platform: ProviderPlatform;
  capabilities: ProviderCapability[];
  targetUrl: string;
  safetyNotes: string[];
};
export type SourceMaterialType = "idea" | "novel" | "screenplay";
export type ProductionFormat = "short_film" | "short_video" | "video_series";
export type ReferenceRole = "main_character" | "supporting_character" | "location" | "visual_style" | "prop";
export type FlowVideoSourceMode = "components" | "frames";
export type SkillEntitlement = "free" | "premium" | "team" | "internal";
export type SkillPipelineStage = "story" | "identity" | "prompt" | "keyframe" | "video" | "review";
export type SkillCategory = "story" | "visual" | "prompt" | "review" | "video-type" | "provider";
export type QualityFailureOwner =
  | "extension_adapter" | "app_orchestration" | "source_adaptation" | "creative_content"
  | "technical_compiler" | "identity_reference" | "voice_audio" | "provider_execution" | "generated_output_qa";
export type SkillPack = {
  id: string; name: string; version: string; locale: string; category: SkillCategory;
  entitlement: SkillEntitlement; pipelineStages: SkillPipelineStage[]; providerCompatibility: ProviderPlatform[];
  files: string[]; description?: string; content: string;
};
export type ReleaseChannel = "stable" | "beta" | "internal" | "rollback";
export type DeviceActivation = {
  id: string; userId: string; deviceName: string; appVersion: string; extensionVersion?: string;
  channel: ReleaseChannel; activatedAt: string; lastSeenAt: string; revokedAt?: string;
};
export type EntitlementGrant = {
  id: string; userId: string; planId: string; skillIds: string[]; featureFlags: string[];
  validUntil: string; offlineGraceUntil: string; signature: string;
};
export type SkillCatalogResponse = { schemaVersion: number; channel: ReleaseChannel; generatedAt: string; skills: SkillPack[] };
export type ProviderAdapterConfig = {
  id: string; provider: ProviderPlatform; version: string; channel: ReleaseChannel; minAppVersion: string;
  minExtensionVersion: string; enabled: boolean; safeMode?: boolean; selectors?: Record<string, string>;
  flags?: Record<string, boolean | number | string>; signature: string;
};

export type ProjectIntake = {
  videoSkillId?: string;
  sourceType: SourceMaterialType;
  productionFormat: ProductionFormat;
  targetDurationSec: number;
  durationValue?: number;
  durationUnit?: "seconds" | "minutes" | "hours";
  episodeCount: number;
  audience: string;
  platform: string;
  platforms?: string[];
  outputLanguage?: string;
  contentLanguage?: string;
  seriesBible?: string;
  videoFrame?: {
    orientation: "vertical" | "horizontal" | "square";
    aspectRatio: "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
  };
  flowVideoMode?: FlowVideoSourceMode;
  /** Durable full-pipeline intent. Provider jobs may outlive a renderer view/reload. */
  yoloEnabled?: boolean;
  aiRouting?: {
    textProvider: string;
    imageProvider: string;
    videoProvider: string;
  };
  quickVisualInput?: {
    name?: string;
    mimeType?: string;
    dataUrl?: string;
    sourceDescription: string;
    transformationRequest: string;
    analysisText?: string;
    analyzedAt?: string;
    analysisJobId?: string;
    characterSlot?: string;
    updatedAt: string;
  };
};

export type VisualReference = {
  id: string;
  projectId: string;
  name: string;
  role: ReferenceRole;
  referenceUse?: "primary_identity" | "supporting_detail" | "style_cue";
  characterSlot?: string;
  filePath: string;
  previewDataUrl?: string;
  sourceDescription: string;
  transformationRequest: string;
  sourceAssetId?: string;
  sourceJobId?: string;
  sourceProvider?: string;
  visualStyle?: string;
  sourceAspectRatio?: "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
  providerConversationUrl?: string;
  identityContract?: CharacterIdentityContract;
  createdAt: string;
};

export type CharacterIdentityContract = {
  schemaVersion: "1.0";
  name: string;
  role: string;
  storyFunction: string;
  appearance: string;
  outfit: string;
  personality: string;
  visualStyle: string;
  continuity: string;
};

export type StoryCharacter = {
  name: string;
  role: string;
  storyFunction: string;
  visualBrief: string;
  voiceBrief?: string;
  motionBrief?: string;
  audibleOnly?: boolean;
  required?: boolean;
};

export type VisualRequirement = {
  id: string;
  name: string;
  role: "main_character" | "supporting_character" | "location" | "prop";
  description: string;
  continuityRules: string;
  requiredInSceneIndexes: number[];
  baseReferenceRequirementId?: string;
  stateVariantForSceneIndex?: number;
};

export type NarrativeContractBeat = {
  id: string;
  sourceEvidence: string;
  requiredAction: string;
  requiredOutcome: string;
  allowedSpeakerNames: string[];
  obligations?: NarrativeObligation[];
};

export type NarrativeObligationModality = "mustBeSpoken" | "mustBeVisible" | "mayBeInferred" | "reactionOnly";

export type NarrativeObligation = {
  id: string;
  modality: NarrativeObligationModality;
  content: string;
  allowedSpeakerNames?: string[];
};

export type NarrativeContract = {
  corePremise: string;
  primaryObjective: string;
  requiredDecision: string;
  requiredOutcome: string;
  namedEntities: string[];
  allowedSpeakerNames: string[];
  forbiddenContradictions: string[];
  voiceContinuity?: {
    globalDirection: string;
    perCharacter: Array<{ characterName: string; direction: string }>;
  };
  beats: NarrativeContractBeat[];
};

export type CreativeIntentContract = {
  dramaticQuestion: string;
  emotionalArc: string;
  tonalPromise: string;
  motif: {
    element: string;
    setup: string;
    development: string;
    payoff: string;
  };
  characterDynamics: Array<{
    characterName: string;
    publicWant: string;
    emotionalDefense: string;
    pressureResponse: string;
    voicePattern: string;
  }>;
};

export type VideoKnowledgeProfile = {
  primaryPurpose: string;
  contentDrivers: Array<"story" | "character" | "information" | "performance" | "mood" | "experience">;
  seriality: "standalone" | "episodic" | "serial" | "anthology" | "hybrid";
  closure: "closed" | "local_closed_arc_open" | "open";
  dialogueDensity: "none" | "low" | "medium" | "high";
  pacingShape: string;
  motionRegime: "continuous" | "selective" | "stepped" | "held" | "burst_based";
  physicalLawRegime: "realistic" | "stylized_consistent" | "expressive_impossible" | "abstract";
  exaggerationLevel: "subtle" | "moderate" | "broad";
  poseDependence: "motion_led" | "balanced" | "key_pose_led";
  environmentAgency: "background" | "supporting_system" | "causal_system" | "antagonist";
  soundMotionCoupling: "loose" | "selective" | "tight";
  activeModules: string[];
  arbitrationNotes: string[];
};

export type SourceAnalysis = {
  premise: string;
  theme: string;
  protagonist: string;
  externalGoal: string;
  internalNeed: string;
  centralConflict: string;
  stakes: string;
  requiredFacts: string[];
};

export type AdaptationDecision = {
  id: string;
  sourceEvidence: string;
  decision: string;
  reason: string;
  authorization: "preserve" | "condense" | "externalize" | "omit";
};

export type ScreenplayActionCue = {
  id: string;
  ownerBeatId?: string;
  sequenceOrder?: number;
  semanticRole?: "initiation" | "question" | "proposal" | "pressure" | "refusal" | "answer" | "interruption" | "reaction" | "revelation" | "confirmation" | "consequence" | "command" | "warning" | "permission" | "decision" | "discovery" | "verification" | "commitment" | "resolution";
  dependsOnCueIds?: string[];
  viewerRequiresCueIds?: string[];
  fulfillsObligationIds?: string[];
  expressionMode?: "visible" | "reaction" | "inferred";
  action: string;
  visibleResult: string;
  performanceIntent?: string;
};

export type ScreenplayDialogueCue = {
  id: string;
  ownerBeatId?: string;
  sequenceOrder?: number;
  semanticRole?: ScreenplayActionCue["semanticRole"];
  dependsOnCueIds?: string[];
  viewerRequiresCueIds?: string[];
  fulfillsObligationIds?: string[];
  expressionMode?: "spoken" | "reaction" | "inferred";
  speaker: string;
  line: string;
  delivery: "onscreen_lipsync" | "offscreen_voiceover" | "internal_voice" | "recording";
  source?: string;
  dramaticPurpose: string;
  tactic?: string;
  subtext?: string;
  relationshipDelta?: string;
};

export type ScreenplaySoundCue = {
  id: string;
  ownerBeatId?: string;
  sequenceOrder?: number;
  semanticRole?: ScreenplayActionCue["semanticRole"];
  dependsOnCueIds?: string[];
  viewerRequiresCueIds?: string[];
  fulfillsObligationIds?: string[];
  expressionMode?: "audible" | "reaction" | "inferred";
  kind: "diegetic" | "offscreen" | "ambience" | "effect" | "music" | "silence";
  description: string;
};

export type TemporalCausalUnit = {
  id: string;
  sceneId: string;
  sourceCueId: string;
  sourceHash: string;
  kind: "action" | "dialogue" | "sound";
  sequenceOrder: number;
  semanticRole?: ScreenplayActionCue["semanticRole"];
};

export type TemporalCausalDependency = {
  fromCueId: string;
  toCueId: string;
  type: "must_happen_before" | "response_to" | "causes" | "viewer_requires";
  strength: "hard" | "soft";
};

export type TemporalCausalIR = {
  version: 1;
  scenes: Array<{
    sceneId: string;
    units: TemporalCausalUnit[];
    dependencies: TemporalCausalDependency[];
  }>;
};

export type AudioOwnershipContract = {
  cueId: string;
  speaker: string;
  speakerCharacterId: string;
  exactDialogue: string;
  language: string;
  voiceDirection?: string;
  delivery: "onscreen_lipsync" | "offscreen_voiceover" | "internal_voice" | "recording";
  sourceType: "visible_speaker" | "offscreen_speaker" | "internal" | "device_playback";
  source?: string;
  allowedSpeakers: string[];
  lipsyncRequired: boolean;
  voiceBinding: {
    provider: "macos" | "elevenlabs" | "other";
    voiceId: string;
    voiceSignature: string;
    lockedAt: string;
    castingStatus: "auto_assigned" | "reviewed";
  };
};

export type ContinuityStateDelta = {
  path: string;
  from: string;
  to: string;
  causedByCueId: string;
  lifecycle?: "persistent" | "evolving" | "ephemeral" | "visual_residue";
  forbiddenBeforeCueId?: string;
  requiredVisibleOutcome?: boolean;
};

export type ShotPacingContract = {
  informationDelta: string;
  actionDelta: string;
  escalation: "decrease" | "hold" | "increase" | "climax" | "release";
  intentionalSilence?: boolean;
  silencePurpose?: string;
};

export type ShotTimingContract = {
  estimatedActiveDurationSec: number;
  contentOccupancy: number;
  dialogueDurationSec: number;
  actionDurationSec: number;
  recognitionDurationSec: number;
};

export type ContinuityStateSnapshot = {
  ref: string;
  sceneId: string;
  version: number;
  state: string;
  causedByCueId?: string;
};

export type SequenceQAResult = {
  status: "PASS" | "REVISE" | "BLOCKED";
  checkedAt: string;
  revisionTargets: Array<"screenplay" | "shot_compiler" | "continuity" | "voice_casting" | "provider_adapter">;
  findings: Array<{
    code: string;
    severity: "warning" | "blocking";
    message: string;
    sceneId?: string;
    shotIds?: string[];
    cueIds?: string[];
    responsibleStage: "screenplay" | "shot_compiler" | "continuity" | "voice_casting" | "provider_adapter";
    owner: QualityFailureOwner;
  }>;
};

export type GeneratedOutputEvidence = {
  startSec: number;
  endSec: number;
  issueType: string;
  detectionMethod: "human" | "computer_vision" | "audio_analysis" | "multimodal_model";
  confidence: number;
  observed: string;
  expected: string;
};

export type GeneratedOutputReview = {
  status: "REVIEW_REQUIRED" | "REVISE" | "PASS";
  route: "retry" | "recompile" | "split" | "change_provider" | "human_review";
  evidence: GeneratedOutputEvidence[];
  reason: string;
};

export type ScreenplayScene = {
  id: string;
  sceneOrder: number;
  slugline: string;
  presentCharacterNames: string[];
  objective: string;
  conflict: string;
  turn: string;
  entryState: string;
  exitState: string;
  actionCues: ScreenplayActionCue[];
  dialogueCues: ScreenplayDialogueCue[];
  soundCues: ScreenplaySoundCue[];
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  sourceDraft?: string;
  storyDocument?: {
    logline: string;
    story: string;
    sceneBreakdown: string;
    screenplay?: string;
    sourceAnalysis?: SourceAnalysis;
    adaptationDecisions?: AdaptationDecision[];
    narrativeContract?: NarrativeContract;
    creativeIntent?: CreativeIntentContract;
    videoKnowledgeProfile?: VideoKnowledgeProfile;
    screenplayScenes?: ScreenplayScene[];
    temporalCausalIR?: TemporalCausalIR;
    sequenceQA?: SequenceQAResult;
    foundationApprovedAt?: string;
    architectureApprovedAt?: string;
    screenplayApprovedAt?: string;
    shotBreakdownApprovedAt?: string;
    scenes?: Array<Record<string, unknown>>;
    characters?: StoryCharacter[];
    visualRequirements?: VisualRequirement[];
    comments?: StoryComment[];
    manuallyEdited?: boolean;
    /** Human-readable revision marker; runtime keeps the full source contract. */
    revisionNote?: string;
    revisionAt?: string;
    generatedAt: string;
  };
  intake?: ProjectIntake;
  productionGraphNotes?: Record<string, string>;
  productionGraphRevisions?: Record<string, ProductionGraphRevision[]>;
  productionGraphLayout?: Record<string, { x: number; y: number }>;
  productionGraphViewport?: { x: number; y: number; zoom: number };
  productionGraphFocusDocumentId?: string;
  productionGraphNodeSettings?: Record<string, ProductionGraphNodeSettings>;
  productionGraphCustomNodes?: ProductionGraphCustomNode[];
  editSequence?: EditSequence;
  styleBibleId?: string;
  createdAt: string;
  updatedAt: string;
};

export type EditSequenceClip = {
  id: string;
  shotId: string;
  sourceAssetId?: string;
  order: number;
  sourceInSec: number;
  sourceOutSec: number;
  timelineDurationSec: number;
  splitFromClipId?: string;
  segment: number;
};

export type EditSequence = {
  id: string;
  projectId: string;
  revision: number;
  clips: EditSequenceClip[];
  audioClips?: EditAudioClip[];
  audioMix?: {
    sourceGain: number;
    dialogueGain: number;
    voiceoverGain: number;
    ambienceGain: number;
    musicGain: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type EditAudioClip = {
  id: string;
  sourceAssetId: string;
  shotId?: string;
  characterId?: string;
  kind: "dialogue" | "internal_voice" | "narration" | "recording" | "ambience" | "music";
  timelineStartSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  timelineDurationSec: number;
  gain: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  text?: string;
  sourceLabel?: string;
  delivery?: Shot["speechDelivery"];
  voiceSnapshot?: { provider: string; voiceId: string; voiceName: string; modelId?: string; language?: string };
  createdAt: string;
  updatedAt: string;
};

export type ProductionGraphNodeSettings = {
  aspectRatio?: "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
  providerId?: string;
  outputLanguage?: string;
  selectedAssetId?: string;
  videoQuality?: "fast" | "quality";
  generateAudio?: boolean;
};

export type ProductionGraphCustomNode = {
  id: string;
  kind: "text" | "image-upload" | "image-generate" | "context-bundle";
  title: string;
  text?: string;
  dataUrl?: string;
  fileName?: string;
  mimeType?: string;
  lastJobId?: string;
  systemGenerated?: "visual-requirement" | "prompt-compaction";
  targetShotId?: string;
  sourcePromptHash?: string;
  sourceShotHash?: string;
  sourceShotHashVersion?: number;
  sourcePromptCharacters?: number;
  sourcePromptBytes?: number;
  referenceRequirementId?: string;
  referenceRole?: "main_character" | "supporting_character" | "location" | "prop";
  createdAt: string;
};

export type ProductionGraphRevision = {
  id: string;
  documentId: string;
  instruction: string;
  sourceText: string;
  outputText?: string;
  providerId: string;
  jobId: string;
  status: "queued" | "completed" | "failed";
  error?: string;
  createdAt: string;
  completedAt?: string;
};

export type StoryComment = {
  id: string;
  section: "story" | "sceneBreakdown";
  start: number;
  end: number;
  quote: string;
  comment: string;
  createdAt: string;
};

export type Character = {
  id: string;
  projectId: string;
  name: string;
  role: string;
  visualDescription: string;
  outfit: string;
  face: string;
  referenceAssetIds: string[];
  negativeTraits?: string;
  consistencyNotes?: string;
  personality?: string;
  backstory?: string;
  voiceProfile?: {
    provider: "google-flow" | "elevenlabs" | "macos" | "other";
    voiceId: string;
    voiceName: string;
    modelId?: string;
    language?: string;
    stability?: number;
    similarityBoost?: number;
    style?: number;
    defaultDelivery?: "onscreen_lipsync" | "offscreen_voiceover" | "internal_voice" | "recording";
    speakingRateWpm?: number;
    /** Executable macOS speech pitch-base command. Included in voiceSignature. */
    pitchBase?: number;
    previewAssetId?: string;
    previewEvidence?: string;
    locked: boolean;
    lockedAt?: string;
    gender?: "female" | "male" | "neutral";
    styleLabel?: string;
    castingSource?: "auto_cast" | "manual" | "imported";
    castingStatus?: "auto_assigned" | "reviewed";
    voiceSignature?: string;
  };
};

export type StyleBible = {
  id: string;
  projectId: string;
  visualStyle: string;
  colorPalette: string;
  texture: string;
  lighting: string;
  motionRules: string;
  negativeStyle: string;
};

export type Scene = {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  location: string;
  timeOfDay: string;
  emotionalTone: string;
  screenplaySceneId?: string;
  contractBeatIds?: string[];
  objective?: string;
  conflict?: string;
  dramaticTurn?: string;
  escalationMechanism?: string;
  choicePressure?: string;
  emotionalShift?: string;
  motifFunction?: "setup" | "develop" | "turn" | "payoff" | "none";
  entryState?: string;
  exitState?: string;
  settingDescription?: string;
  requiredProps?: string[];
  wardrobeState?: string;
  referenceRequirementIds?: string[];
  assetDelta?: {
    characterChanges?: string[];
    propChanges?: string[];
    settingChange?: string;
    changedReferenceRequirementIds?: string[];
  };
  flowText?: string;
  continuityOverride?: {
    mode: "inherit" | "override";
    inheritFromSceneId?: string;
    wardrobeChanges?: string;
    propChanges?: string;
    notes?: string;
  };
  order: number;
  revisionAt?: string;
  revisionNote?: string;
  downstreamDirty?: boolean;
};

export type ShotStatus = "draft" | "queued" | "running" | "review" | "approved" | "failed";

export type Shot = {
  id: string;
  sceneId: string;
  order: number;
  description: string;
  camera: string;
  motion: string;
  dominantAction?: string;
  visualTransformationCount?: number;
  dialogue?: string;
  speechType?: "dialogue" | "inner_monologue" | "narration" | "silent";
  speechDelivery?: "onscreen_lipsync" | "offscreen_voiceover" | "internal_voice" | "recording" | "none";
  speaker?: string;
  dialoguePurpose?: string;
  recordingSource?: string;
  storyBeat?: string;
  fulfilledObligationIds?: string[];
  pacingContract?: ShotPacingContract;
  timingContract?: ShotTimingContract;
  ownerActionCueId?: string;
  completedActionCueIds?: string[];
  mustNotRepeatActionCueIds?: string[];
  contractBeatIds?: string[];
  screenplayActionCueIds?: string[];
  screenplayDialogueCueIds?: string[];
  screenplaySoundCueIds?: string[];
  visibleEntityIds?: string[];
  audibleEntityIds?: string[];
  continuityEntityIds?: string[];
  transitionIn?: string;
  transitionOut?: string;
  screenDirection?: string;
  continuityContract?: {
    geography: string;
    incomingState: string;
    outgoingState: string;
    incomingStateRef?: string;
    outgoingStateRef?: string;
    incomingSnapshot?: ContinuityStateSnapshot;
    outgoingSnapshot?: ContinuityStateSnapshot;
    stateDelta?: ContinuityStateDelta[];
    fixedAnchors?: string[];
    entities?: Array<{
      id: string;
      screenSide?: "left" | "center" | "right";
      owner?: string;
      state: string;
      anchor?: string;
    }>;
  };
  speakerCharacterId?: string;
  audioContract?: AudioOwnershipContract;
  referenceRequirementIds?: string[];
  planningWarnings?: string[];
  actionBeats?: Array<{
    startSec: number;
    endSec: number;
    beatFunction?: "setup" | "action" | "dialogue" | "reaction" | "hold";
    actionCueId?: string;
    action: string;
    camera: string;
    dialogue?: string;
    speechType?: "dialogue" | "inner_monologue" | "narration" | "silent";
    speechDelivery?: "onscreen_lipsync" | "offscreen_voiceover" | "internal_voice" | "recording" | "none";
    speaker?: string;
    dialoguePurpose?: string;
  }>;
  durationSec: number;
  prompt: string;
  flowText?: string;
  providerId?: string;
  status: ShotStatus;
  assetIds: string[];
  currentVideoJobId?: string;
  currentVideoAssetId?: string;
  revisionAt?: string;
  revisionNote?: string;
  downstreamDirty?: boolean;
};

export type StudioState = {
  activeProjectId?: string;
  /** Renderer-only lightweight counts for non-active project rows. Never persisted. */
  projectSummaries?: Array<{ projectId: string; sceneCount: number; shotCount: number; assetCount: number; sourceCount: number; jobCount: number; approvedShots: number; actionNeededJobs: number; activeJobs: number }>;
  projects: Project[];
  characters: Character[];
  styleBibles: StyleBible[];
  scenes: Scene[];
  shots: Shot[];
  assets: Asset[];
  jobs: AutomationJob[];
  providers: BrowserProviderAdapter[];
  visualReferences: VisualReference[];
};

export type VideoAspectRatio = "9:16" | "16:9" | "4:3" | "3:4" | "1:1";
export type FlowDocument =
  | { id: string; kind: "brief" | "story" | "scene-breakdown" | "scene" | "shot" | "note" | "reference-note"; title: string; text: string; entityId: string }
  | { id: string; kind: "scene-continuity"; title: string; text: string; entityId: string; scene: Scene; previousScene?: Scene; requirements: NonNullable<Project["storyDocument"]>["visualRequirements"]; matchedReferences: VisualReference[] }
  | { id: string; kind: "profile"; title: string; entityId: string; intake: ProjectIntake; providers: BrowserProviderAdapter[] }
  | { id: string; kind: "upload-image"; title: string; entityId: string; dataUrl?: string; fileName?: string; mimeType?: string }
  | { id: string; kind: "custom-upload" | "image-generator"; title: string; entityId: string; text?: string; dataUrl?: string; fileName?: string; mimeType?: string; customNode: ProductionGraphCustomNode; job?: AutomationJob; generatedAsset?: Asset }
  | { id: string; kind: "image" | "video"; title: string; asset: Asset };
export type CanvasDocument = FlowDocument & { groupId: string; providerId?: string; providerName?: string; aspectRatio?: string; durationSec?: number; resolution?: string; prompt?: string; category?: "characters" | "locations" | "props" | "style"; assetSubgroup?: "main" | "supporting"; mediaRole?: "reference" | "generated" | "input"; parentDocumentId?: string; sceneDocumentId?: string; row?: number; slot?: "scene" | "screenplay" | "shot" | "scene-keyframe" | "scene-continuity" | "keyframe" | "provider-compile" | "video"; versions?: Asset[]; referenceRequirementIds?: string[]; customKind?: ProductionGraphCustomNode["kind"]; inheritedAspectRatio?: VideoAspectRatio; hasAspectRatioOverride?: boolean; fitContent?: boolean; canRun?: boolean; activeJob?: AutomationJob; inheritedProviderId?: string; outputLanguage?: string; inheritedOutputLanguage?: string; videoQuality?: "fast" | "quality"; generateAudio?: boolean; nativeAudioWarning?: string; estimatedCredits?: { min: number; max: number }; providers?: BrowserProviderAdapter[] };
export type ImageGeneratorCanvasDocument = CanvasDocument & { kind: "image-generator"; customNode: ProductionGraphCustomNode; job?: AutomationJob; generatedAsset?: Asset };
export type CanvasNodeData = { document: CanvasDocument; revisions: ProductionGraphRevision[]; initialGuidance?: string; onGenerateRevision: (document: CanvasDocument, instruction: string) => void; onRestoreTextVersion: (document: CanvasDocument, text: string) => void; onRegenerateMedia: (asset: Asset, instruction?: string, settings?: ProductionGraphNodeSettings) => void; onOpenAsset: (document: CanvasDocument) => void; onOpenDocument: (document: CanvasDocument) => void; onUpdateIntake: (patch: Partial<ProjectIntake>) => void; onUpdateText: (document: CanvasDocument, text: string) => void; onUpdateCustomNode: (nodeId: string, patch: Partial<ProductionGraphCustomNode>) => void; onDeleteCustomNode: (nodeId: string) => void; onGenerateCustomImage: (node: ProductionGraphCustomNode) => void; onUpdateNodeSettings: (documentId: string, patch: Partial<ProductionGraphNodeSettings>) => void; onResetNodeSettings: () => void; onResetLayout: () => void };
export type GroupNodeData = { order: number; label: string; detail: string };
export type SectionNodeData = { label: string; count: number; level?: "category" | "subgroup" };
export type CanvasGroupSpec = { id: string; label: string; x: number; y: number; width: number; height: number; documentCount: number };
