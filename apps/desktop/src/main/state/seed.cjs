function createSeedState({ now, providers }) {
  const createdAt = now();
  const projectId = "project_demo";
  const styleBibleId = "style_demo";
  const sceneId = "scene_train";
  const shotId = "shot_turn";
  return {
    activeProjectId: projectId,
    projects: [{
      id: projectId,
      name: "Stop-motion short drama MVP",
      description: "Browser-native production pipeline for story, shot prompts, automation queue, asset review, and export prep.",
      sourceDraft: "Browser-native production pipeline for story, shot prompts, automation queue, asset review, and export prep.",
      styleBibleId,
      intake: {
        sourceType: "idea", productionFormat: "short_film", targetDurationSec: 90,
        durationValue: 1.5, durationUnit: "minutes", episodeCount: 1,
        audience: "General audience", platform: "YouTube", platforms: ["YouTube"],
        aiRouting: { textProvider: "chatgpt-web", imageProvider: "chatgpt-web", videoProvider: "google-flow-web" }
      },
      createdAt,
      updatedAt: createdAt
    }],
    characters: [{
      id: "char_detective", projectId, name: "Linh", role: "Điều tra viên chính",
      visualDescription: "Da sáng, gò má rõ, tóc đen ngắn, ánh mắt thận trọng.",
      outfit: "Áo khoác dài màu đen, khăn mảnh, găng tay da đã sờn.",
      face: "Angular face, tired eyes, small scar under the left eyebrow.",
      referenceAssetIds: [], negativeTraits: "No smiling, no outfit changes, no extra weapons.",
      consistencyNotes: "Giữ nguyên phom áo khoác và vết sẹo trong các cảnh cận."
    }],
    styleBibles: [{
      id: styleBibleId, projectId,
      visualStyle: "Paper cutout stop-motion, storybook illustration, handmade miniature sets.",
      colorPalette: "Cold blue-gray shadows with one amber practical light accent.",
      texture: "Layered paper grain, visible edges, tactile craft materials.",
      lighting: "Soft dusk light, fog glow, restrained contrast.",
      motionRules: "10-12fps feeling, minimal body motion, short 2-4 second shots, subtle frame jitter.",
      negativeStyle: "No photorealistic skin, no fast hand movement, no hyper-detailed glossy CGI."
    }],
    scenes: [{
      id: sceneId, projectId, title: "Old Train Station",
      summary: "The detective hears a metallic sound from the empty platform and realizes someone is hiding behind the fog.",
      location: "Abandoned train station", timeOfDay: "Dusk", emotionalTone: "Quiet tension", order: 1
    }],
    shots: [{
      id: shotId, sceneId, order: 1,
      description: "Detective Linh turns his head slightly toward a distant metallic sound.",
      camera: "Medium shot, slight push-in, eye-level.",
      motion: "Tiny head turn, coat edge moves once, fog drifts slowly.",
      durationSec: 4, prompt: "", providerId: "chatgpt-web", status: "draft", assetIds: []
    }],
    assets: [], visualReferences: [], jobs: [], providers
  };
}

module.exports = { createSeedState };
