import { expect, test } from "@playwright/test";
import { projectStudioStateToProductionGraph, validateProductionGraph } from "@studio/production-graph";
import type { StudioState } from "@studio/types";

const state: StudioState = {
  activeProjectId: "project-1",
  projects: [{
    id: "project-1",
    name: "Graph contract",
    sourceDraft: "A courier crosses a flooded alley with a medicine robot.",
    intake: {
      sourceType: "idea",
      productionFormat: "short_film",
      targetDurationSec: 12,
      episodeCount: 1,
      audience: "general",
      platform: "web",
      videoSkillId: "short-drama-video"
    },
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z"
  }],
  characters: [],
  styleBibles: [],
  scenes: [{
    id: "scene-1",
    projectId: "project-1",
    title: "Flooded alley",
    summary: "The route is blocked.",
    location: "Alley",
    timeOfDay: "Night",
    emotionalTone: "Urgent",
    order: 1
  }],
  shots: [{
    id: "shot-1",
    sceneId: "scene-1",
    order: 1,
    description: "Courier leads the robot over a plank.",
    camera: "Wide tracking",
    motion: "Slow crossing",
    durationSec: 6,
    prompt: "Preserve identity and the medicine case.",
    status: "approved",
    assetIds: ["keyframe-1", "video-1"]
  }],
  assets: [
    { id: "keyframe-1", projectId: "project-1", type: "image", filePath: "/tmp/keyframe.png", sourceProvider: "chatgpt", sourceJobId: "image-job", metadata: { shotId: "shot-1" }, createdAt: "2026-07-20T00:00:00.000Z" },
    { id: "video-1", projectId: "project-1", type: "video", filePath: "/tmp/video.mp4", sourceProvider: "google-flow", sourceJobId: "video-job", metadata: { shotId: "shot-1", referenceAssetIds: ["keyframe-1"], providerWorkspaceUrl: "https://example.test/project" }, createdAt: "2026-07-20T00:01:00.000Z" }
  ],
  jobs: [],
  providers: [],
  visualReferences: []
};

test("production graph projects current studio state into typed skill-guided groups", () => {
  const graph = projectStudioStateToProductionGraph(state);

  expect(graph.groups.map((group) => group.id)).toEqual([
    "intake",
    "story",
    "continuity",
    "scene-design",
    "shot-design",
    "generation",
    "compose"
  ]);
  expect(graph.nodes.find((node) => node.id === "shot:shot-1")?.skillIds).toContain("video-prompt");
  expect(graph.edges.find((edge) => edge.id === "continuity-shot:shot-1")?.artifactKinds).toContain("character_appearance");
  expect(graph.artifacts.find((artifact) => artifact.id === "video-1")?.lineage).toMatchObject({
    sourceArtifactIds: ["keyframe-1"],
    sourceJobId: "video-job"
  });
  expect(validateProductionGraph(graph)).toEqual([]);
});

test("production graph validator rejects an incompatible connection", () => {
  const graph = projectStudioStateToProductionGraph(state);
  const intakeEdge = graph.edges.find((edge) => edge.id === "intake-source-analysis");
  expect(intakeEdge).toBeDefined();
  intakeEdge!.artifactKinds = ["video_clip"];
  expect(validateProductionGraph(graph)).toContainEqual(expect.objectContaining({
    code: "incompatible_artifact",
    edgeId: "intake-source-analysis"
  }));
});
