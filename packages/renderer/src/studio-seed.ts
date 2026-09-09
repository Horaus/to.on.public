import type { SkillPack, StudioState } from "@studio/types";
import { defaultProjectIntake } from "@studio/renderer-core/production-ui-support";

export type SkillDoc = SkillPack;

const createdAt = new Date().toISOString();

export const seededState: StudioState = {
  projects: [{
    id: "project_demo",
    name: "Stop-motion short drama MVP",
    description: "A detective reaches an abandoned train station at dusk. A metallic sound in the fog reveals that the missing witness is still nearby.",
    styleBibleId: "style_demo",
    intake: defaultProjectIntake(),
    createdAt,
    updatedAt: createdAt
  }],
  characters: [{
    id: "char_detective",
    projectId: "project_demo",
    name: "Linh",
    role: "Điều tra viên chính",
    visualDescription: "Da sáng, gò má rõ, tóc đen ngắn, ánh mắt thận trọng.",
    outfit: "Áo khoác dài màu đen, khăn mảnh, găng tay da đã sờn.",
    face: "Angular face, tired eyes, small scar under the left eyebrow.",
    referenceAssetIds: [],
    negativeTraits: "No smiling, no outfit changes, no extra weapons.",
    consistencyNotes: "Giữ nguyên phom áo khoác và vết sẹo trong các cảnh cận."
  }],
  styleBibles: [{
    id: "style_demo",
    projectId: "project_demo",
    visualStyle: "Paper cutout stop-motion, storybook illustration, handmade miniature sets.",
    colorPalette: "Cold blue-gray shadows with one amber practical light accent.",
    texture: "Layered paper grain, visible edges, tactile craft materials.",
    lighting: "Soft dusk light, fog glow, restrained contrast.",
    motionRules: "10-12fps feeling, minimal body motion, short 2-4 second shots, subtle frame jitter.",
    negativeStyle: "No photorealistic skin, no fast hand movement, no hyper-detailed glossy CGI."
  }],
  scenes: [{
    id: "scene_train",
    projectId: "project_demo",
    title: "Old Train Station",
    summary: "The detective hears a metallic sound from the empty platform and realizes someone is hiding behind the fog.",
    location: "Abandoned train station",
    timeOfDay: "Dusk",
    emotionalTone: "Quiet tension",
    order: 1
  }],
  shots: [{
    id: "shot_turn",
    sceneId: "scene_train",
    order: 1,
    description: "Detective Linh turns his head slightly toward a distant metallic sound.",
    camera: "Medium shot, slight push-in, eye-level.",
    motion: "Tiny head turn, coat edge moves once, fog drifts slowly.",
    dominantAction: "The detective turns once toward the clue.",
    visualTransformationCount: 1,
    transitionIn: "Inherit the detective's established stance and fog direction.",
    transitionOut: "End with the detective's gaze locked on the clue.",
    screenDirection: "Detective stays frame right looking left; preserve the 180-degree axis.",
    continuityContract: {
      geography: "Detective frame right, clue frame left.",
      incomingState: "Detective standing in drifting fog.",
      outgoingState: "Detective looking left at the clue.",
      entities: []
    },
    durationSec: 4,
    prompt: "",
    providerId: "chatgpt-web",
    status: "draft",
    assetIds: []
  }],
  assets: [],
  visualReferences: [],
  jobs: [],
  providers: [
    {
      id: "chatgpt-web",
      name: "ChatGPT",
      platform: "chatgpt",
      capabilities: ["text", "prompt-enhance"],
      targetUrl: "https://chatgpt.com/",
      safetyNotes: ["Requires login.", "Stops at captcha, quota, or payment prompts."]
    },
    {
      id: "gemini-web",
      name: "Gemini",
      platform: "gemini",
      capabilities: ["text", "image", "prompt-enhance"],
      targetUrl: "https://gemini.google.com/app",
      safetyNotes: ["Requires a signed-in Google account."]
    },
    {
      id: "google-flow-web",
      name: "Flow",
      platform: "google-flow",
      capabilities: ["image", "video"],
      targetUrl: "https://labs.google/fx/vi/tools/flow",
      safetyNotes: ["Requires Flow access.", "Manual prompts are surfaced to the desktop."]
    },
    {
      id: "grok-web",
      name: "Grok",
      platform: "grok",
      capabilities: ["text", "image", "video"],
      targetUrl: "https://grok.com/imagine",
      safetyNotes: ["Availability depends on the signed-in account."]
    },
    {
      id: "deepseek-web",
      name: "DeepSeek",
      platform: "deepseek",
      capabilities: ["text"],
      targetUrl: "https://chat.deepseek.com/",
      safetyNotes: ["Requires a signed-in account."]
    },
    {
      id: "elevenlabs-flows-web",
      name: "ElevenLabs Flows",
      platform: "elevenlabs-flows",
      capabilities: ["image", "video"],
      targetUrl: "https://elevenlabs.io/app/flows/",
      safetyNotes: ["Requires an open signed-in flow.", "Runs only an explicitly identified generation node."]
    }
  ]
};

export const fallbackSkills: SkillDoc[] = [
  {
    id: "narrative-performance",
    name: "Narrative Performance and Video Grammar",
    version: "2.1.0",
    locale: "en",
    category: "story",
    entitlement: "free",
    pipelineStages: ["story", "review"],
    providerCompatibility: ["chatgpt"],
    files: ["narrative-performance.md"],
    description: "Composable video profiling, dramatic exchange, visual grammar and style-aware animation performance.",
    content: "# Narrative Performance and Video Grammar\n\n## story\nInfer independent purpose, driver, seriality, closure, dialogue, pacing, motion, physical-law, environment and sound axes; activate only relevant modules. First pass shared live-action film grammar: playable intention, blocking, spatial continuity, motivated coverage, reaction, cut point and dramatic progression. Animation is an explicit optional expression layer and never replaces that foundation. Build changing tactics, progressing dialogue exchanges and visible state changes. Never change source facts or technical contracts.\n\n## review\nReject dead holds, disconnected dialogue, missing causal state change, broken coverage and unreadable edits before applying style-specific review. Never let stylization compensate for failed shared film grammar; evaluate deliberate animation rules only when explicitly active."
  },
  {
    id: "short-drama-video",
    name: "Short Drama",
    version: "3.0.0",
    locale: "en",
    category: "video-type",
    entitlement: "free",
    pipelineStages: ["story", "prompt", "keyframe", "video", "review"],
    providerCompatibility: ["chatgpt", "google-flow", "grok"],
    files: ["short-drama-video.md"],
    description: "Narrative shorts with a readable conflict, escalation, and visual payoff.",
    content: "# Short Drama Video\n\n## story\nBuild a specific want, escalating pressure, a meaningful choice, consequence, distinct character voices, subtext, and an earned final image. Do not design shots here.\n\n## prompt\nTurn the locked screenplay into concise provider-neutral coverage with one dramatic function and one dominant action per shot.\n\n## keyframe\nEncode the exact opening visual state only.\n\n## video\nUse one continuous setup, one dominant action, at most one material transformation, exact speech delivery, and a cuttable final state.\n\n## review\nReview causality, continuity, speech, and editability across the assembled sequence."
  },
  {
    id: "image-prompt",
    name: "Image Prompt",
    version: "0.1.0",
    locale: "en",
    category: "prompt",
    entitlement: "free",
    pipelineStages: ["prompt", "keyframe"],
    providerCompatibility: ["chatgpt"],
    files: ["image-prompt.md"],
    content: "# Image Prompt\n\nBuild image prompts from style bible, character bible, scene bible, and shot description."
  },
  {
    id: "video-prompt",
    name: "Video Prompt",
    version: "0.1.0",
    locale: "en",
    category: "prompt",
    entitlement: "free",
    pipelineStages: ["video"],
    providerCompatibility: ["google-flow"],
    files: ["video-prompt.md"],
    content: "# Video Prompt\n\nUse short duration, low motion, clear camera intent, and no complex realistic body movement."
  },
  {
    id: "continuity-review",
    name: "Continuity Review",
    version: "0.1.0",
    locale: "en",
    category: "review",
    entitlement: "free",
    pipelineStages: ["review"],
    providerCompatibility: ["chatgpt", "google-flow"],
    files: ["continuity-review.md"],
    content: "# Continuity Review\n\nReview generated assets for character identity, outfit, palette, scene, and motion rules."
  }
];
