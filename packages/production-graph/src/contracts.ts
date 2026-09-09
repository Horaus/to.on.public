export type ProductionScope =
  | { level: "project"; projectId: string }
  | { level: "scene"; projectId: string; sceneId: string }
  | { level: "shot"; projectId: string; sceneId: string; shotId: string };

export type ProductionArtifactKind = "brief" | "source_reference" | "reference_analysis" | "source_analysis" | "adaptation_decision" | "narrative_beat" | "scene_architecture" | "screenplay" | "story" | "character_identity" | "character_appearance" | "location" | "prop" | "style" | "scene_plan" | "shot_plan" | "prompt" | "keyframe" | "video_clip" | "sequence";
export type ProductionNodeKind = "intake" | "story" | "adaptation" | "narrative" | "screenplay" | "continuity" | "scene" | "shot" | "provider" | "compose";
export type PortCardinality = "one" | "optional" | "many";
export type ProductionPort = { id: string; label: string; artifactKinds: ProductionArtifactKind[]; cardinality: PortCardinality };
export type ProductionNode = { id: string; kind: ProductionNodeKind; label: string; scope: ProductionScope; groupId: string; skillIds: string[]; inputs: ProductionPort[]; outputs: ProductionPort[]; sourceEntity?: { type: "project" | "scene" | "shot"; id: string } };
export type ProductionEdge = { id: string; from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string }; artifactKinds: ProductionArtifactKind[] };
export type ArtifactLineage = { sourceArtifactIds: string[]; sourceNodeId?: string; sourceJobId?: string; providerWorkspaceUrl?: string };
export type ProductionArtifact = { id: string; kind: ProductionArtifactKind; label: string; scope: ProductionScope; status: "planned" | "ready" | "running" | "review" | "failed"; sourceEntity?: { type: "project" | "scene" | "shot" | "asset"; id: string }; lineage: ArtifactLineage };
export type ProductionGroup = { id: string; label: string; purpose: string; order: number; nodeIds: string[] };
export type ProductionGraph = { schemaVersion: 1; projectId: string; groups: ProductionGroup[]; nodes: ProductionNode[]; edges: ProductionEdge[]; artifacts: ProductionArtifact[] };
export type ProductionGraphIssue = { code: "missing_node" | "missing_port" | "incompatible_artifact" | "duplicate_id"; message: string; edgeId?: string };
