import type { Asset, Project, Scene, Shot, StudioState } from "@studio/types";
export type {
  ArtifactLineage,
  PortCardinality,
  ProductionArtifact,
  ProductionArtifactKind,
  ProductionEdge,
  ProductionGraph,
  ProductionGraphIssue,
  ProductionGroup,
  ProductionNode,
  ProductionNodeKind,
  ProductionPort,
  ProductionScope
} from "./contracts";
export { validateProductionGraph } from "./validation";
import type { PortCardinality, ProductionArtifact, ProductionArtifactKind, ProductionEdge, ProductionGraph, ProductionGraphIssue, ProductionGroup, ProductionNode, ProductionPort, ProductionScope } from "./contracts";

const input = (id: string, label: string, artifactKinds: ProductionArtifactKind[], cardinality: PortCardinality = "one"): ProductionPort => ({
  id,
  label,
  artifactKinds,
  cardinality
});

const output = input;

function scopeForShot(projectId: string, sceneId: string, shotId: string): ProductionScope {
  return { level: "shot", projectId, sceneId, shotId };
}

function assetKind(asset: Asset): ProductionArtifactKind | null {
  if (asset.type === "video") return "video_clip";
  if (asset.type !== "image" && asset.type !== "reference") return null;
  if (asset.metadata?.role === "storyboard" || asset.metadata?.storyboardMode || asset.metadata?.shotId) return "keyframe";
  return "source_reference";
}

function artifactStatus(asset: Asset): ProductionArtifact["status"] {
  if (asset.metadata?.reviewStatus === "review_required") return "review";
  return "ready";
}

function nodeForScene(project: Project, scene: Scene): ProductionNode {
  return {
    id: `scene:${scene.id}`,
    kind: "scene",
    label: scene.title,
    scope: { level: "scene", projectId: project.id, sceneId: scene.id },
    groupId: "scene-design",
    skillIds: ["script-adaptation", "continuity-review"],
    inputs: [
      input("screenplay", "Locked scene screenplay", ["screenplay"]),
      input("continuity", "Resolved continuity", ["character_identity", "character_appearance", "location", "prop", "style"], "many")
    ],
    outputs: [output("scene", "Scene plan", ["scene_plan"])],
    sourceEntity: { type: "scene", id: scene.id }
  };
}

function nodeForShot(project: Project, shot: Shot): ProductionNode {
  return {
    id: `shot:${shot.id}`,
    kind: "shot",
    label: `SH${shot.order}`,
    scope: scopeForShot(project.id, shot.sceneId, shot.id),
    groupId: "shot-design",
    skillIds: ["storyboard-prompt", "image-prompt", "video-prompt"],
    inputs: [
      input("scene", "Scene plan", ["scene_plan"]),
      input("continuity", "Shot continuity", ["character_identity", "character_appearance", "location", "prop", "style"], "many")
    ],
    outputs: [output("shot", "Shot package", ["shot_plan", "prompt"])],
    sourceEntity: { type: "shot", id: shot.id }
  };
}

function providerNode(project: Project, shot: Shot): ProductionNode {
  return {
    id: `provider:${shot.id}`,
    kind: "provider",
    label: `Generate SH${shot.order}`,
    scope: scopeForShot(project.id, shot.sceneId, shot.id),
    groupId: "generation",
    skillIds: ["video-prompt"],
    inputs: [
      input("shot", "Shot package", ["shot_plan", "prompt"]),
      input("references", "Resolved references", ["keyframe", "character_identity", "character_appearance", "location", "prop", "style"], "many")
    ],
    outputs: [output("media", "Generated media", ["keyframe", "video_clip"], "many")],
    sourceEntity: { type: "shot", id: shot.id }
  };
}

function storyNodes(project: Project): ProductionNode[] {
  return [
    {
      id: `intake:${project.id}`,
      kind: "intake",
      label: "Production intake",
      scope: { level: "project", projectId: project.id },
      groupId: "intake",
      skillIds: ["source-classification", project.intake?.videoSkillId || "short-drama-video"],
      inputs: [input("sources", "Brief and references", ["brief", "source_reference", "reference_analysis"], "many")],
      outputs: [output("brief", "Normalized brief", ["brief"])],
      sourceEntity: { type: "project", id: project.id }
    },
    {
      id: `source-analysis:${project.id}`,
      kind: "story",
      label: "Source analysis",
      scope: { level: "project", projectId: project.id },
      groupId: "story",
      skillIds: ["source-classification"],
      inputs: [input("brief", "Normalized brief", ["brief"])],
      outputs: [output("analysis", "Source facts and intent", ["source_analysis"])],
      sourceEntity: { type: "project", id: project.id }
    },
    {
      id: `adaptation:${project.id}`,
      kind: "adaptation",
      label: "Adaptation decisions",
      scope: { level: "project", projectId: project.id },
      groupId: "story",
      skillIds: ["script-adaptation"],
      inputs: [input("analysis", "Source facts and intent", ["source_analysis"])],
      outputs: [output("decisions", "Keep/compress/expand/omit decisions", ["adaptation_decision"], "many")],
      sourceEntity: { type: "project", id: project.id }
    },
    {
      id: `narrative:${project.id}`,
      kind: "narrative",
      label: "Complete story and narrative contract",
      scope: { level: "project", projectId: project.id },
      groupId: "story",
      skillIds: [project.intake?.videoSkillId || "short-drama-video", "narrative-performance"],
      inputs: [input("decisions", "Adaptation decisions", ["adaptation_decision"], "many")],
      outputs: [output("story", "Complete story", ["story"]), output("beats", "Locked causal beats", ["narrative_beat"], "many")],
      sourceEntity: { type: "project", id: project.id }
    },
    {
      id: `scene-architecture:${project.id}`,
      kind: "screenplay",
      label: "Scene architecture",
      scope: { level: "project", projectId: project.id },
      groupId: "story",
      skillIds: [project.intake?.videoSkillId || "short-drama-video", "narrative-performance"],
      inputs: [input("story", "Complete story and beats", ["story", "narrative_beat"], "many")],
      outputs: [output("scenes", "Objective/conflict/turn scene plans", ["scene_architecture"], "many")],
      sourceEntity: { type: "project", id: project.id }
    },
    {
      id: `screenplay:${project.id}`,
      kind: "screenplay",
      label: "Screenplay and dialogue",
      scope: { level: "project", projectId: project.id },
      groupId: "story",
      skillIds: [project.intake?.videoSkillId || "short-drama-video", "narrative-performance"],
      inputs: [input("scenes", "Locked scene architecture", ["scene_architecture"], "many")],
      outputs: [output("screenplay", "Action, dialogue and sound cues", ["screenplay"], "many")],
      sourceEntity: { type: "project", id: project.id }
    },
  ];
}

function continuityNode(project: Project): ProductionNode {
  return {
    id: `continuity:${project.id}`,
    kind: "continuity",
    label: "Continuity bible",
    scope: { level: "project", projectId: project.id },
    groupId: "continuity",
    skillIds: ["visual-reference", "continuity-review"],
    inputs: [input("screenplay", "Locked screenplay", ["screenplay"], "many"), input("references", "Reference evidence", ["source_reference", "reference_analysis"], "many")],
    outputs: [output("entities", "Versioned entities", ["character_identity", "character_appearance", "location", "prop", "style"], "many")]
  };
}

function composeNode(project: Project): ProductionNode {
  return {
    id: `compose:${project.id}`,
    kind: "compose",
    label: "Compose video",
    scope: { level: "project", projectId: project.id },
    groupId: "compose",
    skillIds: ["continuity-review"],
    inputs: [input("clips", "Approved clips", ["video_clip"], "many")],
    outputs: [output("sequence", "Production sequence", ["sequence"])]
  };
}

function projectNodes(project: Project, scenes: Scene[], shots: Shot[]): ProductionNode[] {
  return [
    ...storyNodes(project),
    continuityNode(project),
    ...scenes.map((scene) => nodeForScene(project, scene)),
    ...shots.map((shot) => nodeForShot(project, shot)),
    ...shots.map((shot) => providerNode(project, shot)),
    composeNode(project)
  ];
}

function projectEdges(project: Project, scenes: Scene[], shots: Shot[]): ProductionEdge[] {
  return [
    { id: "intake-source-analysis", from: { nodeId: `intake:${project.id}`, portId: "brief" }, to: { nodeId: `source-analysis:${project.id}`, portId: "brief" }, artifactKinds: ["brief"] },
    { id: "source-analysis-adaptation", from: { nodeId: `source-analysis:${project.id}`, portId: "analysis" }, to: { nodeId: `adaptation:${project.id}`, portId: "analysis" }, artifactKinds: ["source_analysis"] },
    { id: "adaptation-narrative", from: { nodeId: `adaptation:${project.id}`, portId: "decisions" }, to: { nodeId: `narrative:${project.id}`, portId: "decisions" }, artifactKinds: ["adaptation_decision"] },
    { id: "narrative-story-scene-architecture", from: { nodeId: `narrative:${project.id}`, portId: "story" }, to: { nodeId: `scene-architecture:${project.id}`, portId: "story" }, artifactKinds: ["story"] },
    { id: "narrative-beats-scene-architecture", from: { nodeId: `narrative:${project.id}`, portId: "beats" }, to: { nodeId: `scene-architecture:${project.id}`, portId: "story" }, artifactKinds: ["narrative_beat"] },
    { id: "scene-architecture-screenplay", from: { nodeId: `scene-architecture:${project.id}`, portId: "scenes" }, to: { nodeId: `screenplay:${project.id}`, portId: "scenes" }, artifactKinds: ["scene_architecture"] },
    { id: "screenplay-continuity", from: { nodeId: `screenplay:${project.id}`, portId: "screenplay" }, to: { nodeId: `continuity:${project.id}`, portId: "screenplay" }, artifactKinds: ["screenplay"] },
    ...scenes.flatMap<ProductionEdge>((scene) => [
      { id: `screenplay-scene:${scene.id}`, from: { nodeId: `screenplay:${project.id}`, portId: "screenplay" }, to: { nodeId: `scene:${scene.id}`, portId: "screenplay" }, artifactKinds: ["screenplay"] },
      { id: `continuity-scene:${scene.id}`, from: { nodeId: `continuity:${project.id}`, portId: "entities" }, to: { nodeId: `scene:${scene.id}`, portId: "continuity" }, artifactKinds: ["character_identity", "character_appearance", "location", "prop", "style"] }
    ]),
    ...shots.flatMap<ProductionEdge>((shot) => [
      { id: `scene-shot:${shot.id}`, from: { nodeId: `scene:${shot.sceneId}`, portId: "scene" }, to: { nodeId: `shot:${shot.id}`, portId: "scene" }, artifactKinds: ["scene_plan"] },
      { id: `continuity-shot:${shot.id}`, from: { nodeId: `continuity:${project.id}`, portId: "entities" }, to: { nodeId: `shot:${shot.id}`, portId: "continuity" }, artifactKinds: ["character_identity", "character_appearance", "location", "prop", "style"] },
      { id: `shot-provider:${shot.id}`, from: { nodeId: `shot:${shot.id}`, portId: "shot" }, to: { nodeId: `provider:${shot.id}`, portId: "shot" }, artifactKinds: ["shot_plan", "prompt"] },
      { id: `provider-compose:${shot.id}`, from: { nodeId: `provider:${shot.id}`, portId: "media" }, to: { nodeId: `compose:${project.id}`, portId: "clips" }, artifactKinds: ["video_clip"] }
    ])
  ];
}

function assetArtifact(project: Project, shots: Shot[], asset: Asset): ProductionArtifact[] {
  const kind = assetKind(asset);
  if (!kind) return [];
  const shot = shots.find((candidate) => candidate.id === asset.metadata?.shotId || candidate.assetIds.includes(asset.id));
  return [{
    id: asset.id,
    kind,
    label: String(asset.metadata?.filename || asset.filePath.split("/").at(-1) || asset.id),
    scope: shot ? scopeForShot(project.id, shot.sceneId, shot.id) : { level: "project", projectId: project.id },
    status: artifactStatus(asset),
    sourceEntity: { type: "asset", id: asset.id },
    lineage: {
      sourceArtifactIds: Array.isArray(asset.metadata?.referenceAssetIds) ? asset.metadata.referenceAssetIds.filter((id): id is string => typeof id === "string") : [],
      sourceJobId: asset.sourceJobId,
      providerWorkspaceUrl: typeof asset.metadata?.providerWorkspaceUrl === "string" ? asset.metadata.providerWorkspaceUrl : undefined
    }
  }];
}

function projectArtifacts(state: StudioState, project: Project, shots: Shot[]): ProductionArtifact[] {
  const projectAssets = state.assets.filter((asset) => asset.projectId === project.id);
  return [
    {
      id: `brief:${project.id}`,
      kind: "brief",
      label: project.name,
      scope: { level: "project", projectId: project.id },
      status: project.sourceDraft || project.description ? "ready" : "planned",
      sourceEntity: { type: "project", id: project.id },
      lineage: { sourceArtifactIds: [], sourceNodeId: `intake:${project.id}` }
    },
    ...(project.storyDocument?.sourceAnalysis ? [{ id: `source-analysis:${project.id}:artifact`, kind: "source_analysis" as const, label: "Locked source analysis", scope: { level: "project" as const, projectId: project.id }, status: "ready" as const, lineage: { sourceArtifactIds: [`brief:${project.id}`], sourceNodeId: `source-analysis:${project.id}` } }] : []),
    ...((project.storyDocument?.adaptationDecisions || []).map((decision) => ({ id: `adaptation:${project.id}:${decision.id}`, kind: "adaptation_decision" as const, label: `${decision.authorization}: ${decision.decision}`, scope: { level: "project" as const, projectId: project.id }, status: "ready" as const, lineage: { sourceArtifactIds: [`source-analysis:${project.id}:artifact`], sourceNodeId: `adaptation:${project.id}` } }))),
    ...((project.storyDocument?.narrativeContract?.beats || []).map((beat) => ({ id: `beat:${project.id}:${beat.id}`, kind: "narrative_beat" as const, label: `${beat.requiredAction} → ${beat.requiredOutcome}`, scope: { level: "project" as const, projectId: project.id }, status: "ready" as const, lineage: { sourceArtifactIds: (project.storyDocument?.adaptationDecisions || []).map((decision) => `adaptation:${project.id}:${decision.id}`), sourceNodeId: `narrative:${project.id}` } }))),
    ...(project.storyDocument?.story ? [{ id: `story:${project.id}:artifact`, kind: "story" as const, label: project.storyDocument.logline || "Complete story", scope: { level: "project" as const, projectId: project.id }, status: "ready" as const, lineage: { sourceArtifactIds: (project.storyDocument?.narrativeContract?.beats || []).map((beat) => `beat:${project.id}:${beat.id}`), sourceNodeId: `narrative:${project.id}` } }] : []),
    ...((project.storyDocument?.scenes || []).map((scene, index) => ({ id: `scene-architecture:${project.id}:${String(scene.id || index + 1)}`, kind: "scene_architecture" as const, label: String(scene.title || `Scene ${index + 1}`), scope: { level: "project" as const, projectId: project.id }, status: "ready" as const, lineage: { sourceArtifactIds: [`story:${project.id}:artifact`], sourceNodeId: `scene-architecture:${project.id}` } }))),
    ...((project.storyDocument?.screenplayScenes || []).map((screenplay) => ({ id: `screenplay:${project.id}:${screenplay.id}`, kind: "screenplay" as const, label: screenplay.slugline, scope: { level: "project" as const, projectId: project.id }, status: "ready" as const, lineage: { sourceArtifactIds: (project.storyDocument?.narrativeContract?.beats || []).map((beat) => `beat:${project.id}:${beat.id}`), sourceNodeId: `screenplay:${project.id}` } }))),
    ...projectAssets.flatMap<ProductionArtifact>((asset) => assetArtifact(project, shots, asset))
  ];
}

function productionGroups(nodes: ProductionNode[]): ProductionGroup[] {
  const groupDefinitions = [
    ["intake", "Intake", "Normalize user intent, settings and reference evidence."],
    ["story", "Narrative architecture", "Lock source facts, adaptation decisions, causal beats, and screenplay before any shot design."],
    ["continuity", "Continuity", "Version identities, appearances, locations, props and style."],
    ["scene-design", "Scenes", "Resolve story and continuity into scene packages."],
    ["shot-design", "Shots", "Resolve scene packages into provider-neutral shot packages."],
    ["generation", "Generation", "Compile shot packages to provider operations and recover outputs."],
    ["compose", "Compose", "Review and assemble approved clips into the final sequence."]
  ] as const;
  return groupDefinitions.map(([id, label, purpose], order) => ({
    id,
    label,
    purpose,
    order,
    nodeIds: nodes.filter((node) => node.groupId === id).map((node) => node.id)
  }));
}

export function projectStudioStateToProductionGraph(state: StudioState, projectId = state.activeProjectId): ProductionGraph {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error(`Cannot build production graph: project ${projectId || "<none>"} was not found.`);

  const scenes = state.scenes.filter((scene) => scene.projectId === project.id).sort((a, b) => a.order - b.order);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const shots = state.shots.filter((shot) => sceneIds.has(shot.sceneId)).sort((a, b) => a.order - b.order);
  const nodes = projectNodes(project, scenes, shots);
  return {
    schemaVersion: 1,
    projectId: project.id,
    groups: productionGroups(nodes),
    nodes,
    edges: projectEdges(project, scenes, shots),
    artifacts: projectArtifacts(state, project, shots)
  };
}
