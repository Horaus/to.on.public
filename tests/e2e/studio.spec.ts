import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { validateVideoPreflight } from "../../packages/workflow/src/video-preflight";
import { buildVideoGenerationPrompt, skillInstructionForStage } from "../../packages/workflow/src/video-generation";
import { buildShotGenerationSpec, compileVideoProviderRequest, videoProviderCapabilityProfile } from "../../packages/workflow/src/video-provider-adapter";
import { createDefaultEditSequence, normalizeEditSequence, reorderSequenceClips, splitSequenceClip, trimSequenceClip } from "../../packages/renderer/src/core/edit-sequence";
import { allocateSceneShotCounts, minimumAtomicShotCount, orderScreenplayCueIds, planSceneShotCuePackets } from "../../packages/workflow/src/studio-shot-planning";
import { planProviderShotDurationsByWeights } from "../../packages/domain/src/duration-policy.ts";
import type { Asset, AutomationJob, ScreenplayScene, Shot } from "@studio/types";

test("causal shot planning keeps a refusal after its proposal across cue types", () => {
  const scene: ScreenplayScene = {
    id: "scene_causal", sceneOrder: 1, slugline: "INT. RADIO ROOM - NIGHT", presentCharacterNames: ["Nam", "Linh"],
    objective: "Repair the radio", conflict: "Deadline", turn: "Linh preserves the original parts", entryState: "Radio off", exitState: "Radio on",
    actionCues: [{ id: "act_setup", sequenceOrder: 1, semanticRole: "pressure", action: "Nam points at the radio.", visibleResult: "The deadline becomes visible." }],
    dialogueCues: [
      { id: "dlg_refusal", sequenceOrder: 3, semanticRole: "refusal", dependsOnCueIds: ["dlg_proposal"], speaker: "Linh", line: "Không tháo.", delivery: "onscreen_lipsync", dramaticPurpose: "Linh refuses." },
      { id: "dlg_proposal", sequenceOrder: 2, semanticRole: "proposal", speaker: "Nam", line: "Tháo ra cho nhanh.", delivery: "onscreen_lipsync", dramaticPurpose: "Nam proposes removal." }
    ],
    soundCues: []
  };

  expect(orderScreenplayCueIds(scene)).toEqual(["act_setup", "dlg_proposal", "dlg_refusal"]);
  expect(planSceneShotCuePackets(scene, 2)).toEqual([
    { index: 0, cueIds: ["act_setup", "dlg_proposal"] },
    { index: 1, cueIds: ["dlg_refusal"] }
  ]);
});

test("duration planning follows story-function weights instead of returning a flat sorted inventory", () => {
  const durations = planProviderShotDurationsByWeights("google-flow", 30, [0.5, 0.8, 0.9, 1.5]);
  expect(durations.reduce((sum, duration) => sum + duration, 0)).toBe(30);
  expect(new Set(durations).size).toBeGreaterThan(2);
  expect(durations.at(-1)).toBeGreaterThan(durations[0]);
});

test("duration planning never assigns less than a packet speech minimum", () => {
  const durations = planProviderShotDurationsByWeights("google-flow", 20, [1, 1, 1, 1], [6, 6, 4, 4]);
  expect(durations.reduce((sum, duration) => sum + duration, 0)).toBe(20);
  expect(durations).toEqual([6, 6, 4, 4]);
});

test("atomic allocation expands scene shot count when consecutive actions cannot share one generation", () => {
  const scene: ScreenplayScene = {
    id: "scene_atomic", sceneOrder: 1, slugline: "INT. RADIO ROOM - NIGHT", presentCharacterNames: ["Linh"],
    objective: "Repair the radio", conflict: "Time", turn: "Signal returns", entryState: "Radio off", exitState: "Radio on",
    actionCues: [
      { id: "act_find", sequenceOrder: 1, semanticRole: "discovery", action: "Linh finds the oxidized contact.", visibleResult: "Fault located." },
      { id: "act_clean", sequenceOrder: 2, semanticRole: "decision", dependsOnCueIds: ["act_find"], action: "Linh cleans the contact.", visibleResult: "Contact clean." },
      { id: "act_power", sequenceOrder: 3, semanticRole: "consequence", dependsOnCueIds: ["act_clean"], action: "Linh powers the radio.", visibleResult: "Radio on." }
    ],
    dialogueCues: [],
    soundCues: []
  };
  expect(minimumAtomicShotCount(scene)).toBe(3);
  expect(allocateSceneShotCounts([scene], 1)).toEqual([3]);
  expect(planSceneShotCuePackets(scene, 3).map((packet) => packet.cueIds)).toEqual([["act_find"], ["act_clean"], ["act_power"]]);
});

const preflightShot = (patch: Partial<Shot> = {}): Shot => ({
  id: "shot_preflight",
  sceneId: "scene_preflight",
  order: 1,
  description: "A hand opens one locked keepsake box.",
  camera: "Locked medium close-up.",
  motion: "The hand opens the keepsake box once.",
  dominantAction: "Open the keepsake box.",
  visualTransformationCount: 1,
  durationSec: 6,
  prompt: "prompt",
  providerId: "google-flow-web",
  status: "draft",
  assetIds: ["keyframe_preflight"],
  speechType: "silent",
  speechDelivery: "none",
  transitionIn: "The closed box is centered under the hand.",
  transitionOut: "The box ends open with the hand still on its lid.",
  screenDirection: "Box center; hand enters from right; preserve the 180-degree axis.",
  continuityContract: {
    geography: "Box center; hand frame right.",
    incomingState: "Box closed; hand above lid.",
    outgoingState: "Box open; hand owns lid.",
    entities: [{ id: "keepsake_box", screenSide: "center", owner: "lead right hand", state: "closed to open" }]
  },
  ...patch
});

const preflightAsset: Asset = {
  id: "keyframe_preflight",
  projectId: "project_preflight",
  sceneId: "scene_preflight",
  shotId: "shot_preflight",
  type: "image",
  filePath: "/tmp/keyframe.png",
  sourceProvider: "chatgpt-web",
  width: 1600,
  height: 900,
  metadata: { aspectRatio: "16:9" },
  createdAt: "2026-07-29T00:00:00.000Z"
};

test("provider adapter keeps Google Flow policy out of neutral and generic video requests", () => {
  const shot = preflightShot();
  const neutralPrompt = buildVideoGenerationPrompt({ shot, outputLanguage: "Vietnamese" });
  const flow = compileVideoProviderRequest({ platform: "google-flow", neutralPrompt, shot, aspectRatio: "9:16", quality: "quality", generateAudio: true, outputLanguage: "Vietnamese" });
  const generic = compileVideoProviderRequest({ platform: "grok", neutralPrompt, shot, aspectRatio: "9:16", quality: "quality", generateAudio: true, outputLanguage: "Vietnamese" });

  expect(flow.prompt).toBe(neutralPrompt);
  expect(flow.profile.id).toBe("google-flow-video");
  expect(flow.profile.maxPromptUtf8Bytes).toBe(4000);
  expect(flow.settings).toMatchObject({ flowVideoMode: "components", modelDisplayName: "Veo 3.1 - Quality", generateAudio: true });
  expect(generic.prompt).toBe(neutralPrompt);
  expect(videoProviderCapabilityProfile("grok").id).toBe("generic-image-to-video");
  expect(generic.settings).not.toHaveProperty("flowVideoMode");
  expect(generic.settings).not.toHaveProperty("modelDisplayName");
  expect(generic.settings.generateAudio).toBe(false);
});

test("structured shot fields cross the Flow boundary without replacing the compiled prompt", () => {
  const shot = preflightShot({
    camera: "Medium two-shot, locked camera.",
    durationSec: 6,
    dominantAction: "Lan places the rejected tray aside.",
    dialogue: "Lan: Khay này không đạt.",
    motion: "One decisive action; hold the final state.",
    actionBeats: [{ startSec: 0, endSec: 6, beatFunction: "dialogue", action: "Lan places the tray aside.", camera: "Locked medium two-shot.", dialogue: "Khay này không đạt.", speaker: "Lan" }]
  });
  expect(buildShotGenerationSpec(shot)).toEqual({
    camera: "Medium two-shot, locked camera.",
    durationSec: 6,
    action: "Lan places the rejected tray aside.",
    dialogue: "Lan: Khay này không đạt.",
    notes: "One decisive action; hold the final state.",
    timeline: [{ startSec: 0, endSec: 6, action: "Lan places the tray aside.", camera: "Locked medium two-shot.", dialogue: "Khay này không đạt.", speaker: "Lan" }]
  });
});

test("video preflight blocks overloaded historic shots and accepts one material action", async () => {
  const anShot3 = preflightShot({
    motion: "The umbrella unfolds fully; An lifts the crate, pulls the kitten out, and the paper tears in the rain.",
    dominantAction: "Rescue the kitten while sacrificing the umbrella.",
    visualTransformationCount: 4
  });
  const overloaded = validateVideoPreflight({ shot: anShot3, prompt: "An rescue prompt", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(overloaded.valid).toBe(false);
  expect(overloaded.issues.map((issue) => issue.code)).toContain("MULTIPLE_VISIBLE_TRANSFORMATIONS");

  const maiHistoric = validateVideoPreflight({ shot: preflightShot({ dominantAction: undefined, motion: "Mai measures the spring, opens the empty drawer, then turns to the first clock." }), prompt: "Mai old multi-action prompt", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(maiHistoric.valid).toBe(false);
  expect(maiHistoric.issues.map((issue) => issue.code)).toContain("DOMINANT_ACTION_MISSING");
  expect(maiHistoric.issues.find((issue) => issue.code === "DOMINANT_ACTION_MISSING")?.owner).toBe("technical_compiler");

  const valid = validateVideoPreflight({ shot: preflightShot(), prompt: "Open one keepsake box.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(valid.valid).toBe(true);
  expect(valid.estimatedSubmits).toBe(1);
});

test("video preflight blocks ambiguous action ownership and stretched timed action", () => {
  const actionShot = preflightShot({
    screenplayActionCueIds: ["act_open"],
    ownerActionCueId: "act_open",
    timingContract: { estimatedActiveDurationSec: 6, contentOccupancy: 1, dialogueDurationSec: 0, actionDurationSec: 2.2, recognitionDurationSec: 0.9 },
    actionBeats: [{ startSec: 0, endSec: 6, beatFunction: "action", actionCueId: "act_open", action: "Open the keepsake box.", camera: "Locked medium close-up.", speechType: "silent", speechDelivery: "none" }]
  });
  const result = validateVideoPreflight({ shot: actionShot, prompt: "Open one keepsake box.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.valid).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toContain("TIMING_ACTION_STRETCH");
  expect(result.issues.find((issue) => issue.code === "TIMING_ACTION_STRETCH")?.owner).toBe("technical_compiler");
});

test("video preflight measures UTF-8 prompt budget and routes multilingual overflow to text compaction", async () => {
  const reference = { assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" as const };
  const ascii = validateVideoPreflight({ shot: preflightShot(), prompt: "a".repeat(3900), references: [reference], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(ascii.promptCharacters).toBe(3900);
  expect(ascii.promptBytes).toBe(3900);
  expect(ascii.requiresTextCompaction).toBe(false);
  expect(ascii.issues.map((issue) => issue.code)).toContain("FLOW_PROMPT_NEAR_LIMIT");

  const vietnamese = validateVideoPreflight({ shot: preflightShot(), prompt: "ộ".repeat(2100), references: [reference], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(vietnamese.promptCharacters).toBe(2100);
  expect(vietnamese.promptBytes).toBe(6300);
  expect(vietnamese.requiresTextCompaction).toBe(true);
  expect(vietnamese.issues.map((issue) => issue.code)).toContain("FLOW_PROMPT_LIMIT_EXCEEDED");
  expect(vietnamese.issues.find((issue) => issue.code === "FLOW_PROMPT_LIMIT_EXCEEDED")?.owner).toBe("provider_execution");
  expect(vietnamese.estimatedSubmits).toBe(0);
});

test("video preflight requires executable voice ownership and a semantic identity reference", () => {
  const speakingShot = preflightShot({
    speaker: "Mai",
    speakerCharacterId: "char_mai",
    dialogue: "Đừng tháo chiếc radio này.",
    speechType: "dialogue",
    speechDelivery: "onscreen_lipsync",
    visibleEntityIds: ["Mai"],
    audioContract: {
      cueId: "dlg_mai_1",
      speaker: "Mai",
      speakerCharacterId: "char_mai",
      exactDialogue: "Đừng tháo chiếc radio này.",
      delivery: "onscreen_lipsync",
      allowedSpeakers: ["Mai"],
      voiceBinding: {
        provider: "macos",
        voiceId: "Linh",
        voiceSignature: "Linh:138:Vietnamese",
        lockedAt: "2026-08-11T00:00:00.000Z",
        castingStatus: "reviewed"
      }
    }
  });
  const keyframe = { assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" as const };
  const missingIdentity = validateVideoPreflight({ shot: speakingShot, prompt: "Mai refuses.", references: [keyframe], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(missingIdentity.issues.map((issue) => issue.code)).toContain("IDENTITY_REFERENCE_MISSING");

  const identityReference = { assetId: "char_mai_identity", filePath: "/tmp/mai.png", referenceRole: "character_identity" as const, referenceLabel: "Mai" };
  const valid = validateVideoPreflight({ shot: speakingShot, prompt: "Mai refuses.", references: [keyframe, identityReference], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(valid.valid).toBe(true);

  const fakeFlowVoice = structuredClone(speakingShot);
  fakeFlowVoice.audioContract!.voiceBinding.provider = "google-flow" as never;
  const invalidVoice = validateVideoPreflight({ shot: fakeFlowVoice, prompt: "Mai refuses.", references: [keyframe, identityReference], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(invalidVoice.issues.map((issue) => issue.code)).toContain("VOICE_CASTING_REQUIRED");
});

test("video compiler emits only runtime motion instructions", async () => {
  const shot = preflightShot({
    actionBeats: [
      {
        startSec: 0,
        endSec: 3,
        action: "Her fingers hesitate above the latch, then press it once.",
        camera: "A restrained handheld push toward the box.",
        speechType: "silent",
        speechDelivery: "none"
      },
      {
        startSec: 3,
        endSec: 6,
        action: "She opens the lid and holds her breath.",
        camera: "Hold the close-up without cutting.",
        dialogue: "Mình đã tìm thấy rồi.",
        speaker: "Mai",
        speechType: "dialogue",
        speechDelivery: "onscreen_lipsync"
      }
    ]
  });
  const prompt = buildVideoGenerationPrompt({ shot, outputLanguage: "Vietnamese", sourceMode: "components" });

  expect(prompt).toContain("Use it as the exact opening frame and visual source of truth.");
  expect(prompt).toContain("Dominant action: Open the keepsake box.");
  expect(prompt).toContain("Exact Vietnamese line: “Mình đã tìm thấy rồi.”");
  expect(prompt).toContain("Final handoff state: Box open; hand owns lid.");
  expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(3600);
  for (const forbidden of [
    "SELECTED VIDEO SKILL",
    "RESOLVED SCENE ASSETS",
    "COMPACT CONTINUITY REFERENCES",
    "Persistent entity locks",
    "Structured continuity contract",
    "Dramatic purpose",
    "Google Flow",
    "aspect ratio",
    "referenceRequirementIds"
  ]) {
    expect(prompt).not.toContain(forbidden);
  }
});

test("missing skill stage never leaks the whole skill into a downstream prompt", async () => {
  const skill = {
    id: "legacy-video-skill",
    name: "Legacy video skill",
    version: "1.0.0",
    pipelineStages: ["story", "video"],
    content: "# Legacy\n\n## story\nPlan a story without a video section."
  } as Parameters<typeof skillInstructionForStage>[0];

  expect(skillInstructionForStage(skill, "story")).toContain("Plan a story");
  expect(skillInstructionForStage(skill, "video")).toBe("");
});

test("video preflight blocks an accessory ownership jump hidden at a cut", async () => {
  const previous = preflightShot({
    id: "shot_before",
    continuityContract: {
      geography: "Locked axis.",
      incomingState: "Bow on collar.",
      outgoingState: "Bow remains on collar.",
      entities: [{ id: "red_bow", owner: "Tí collar", state: "still on neck at final frame" }]
    }
  });
  const current = preflightShot({
    id: "shot_after",
    continuityContract: {
      geography: "Locked axis.",
      incomingState: "Loose bow in paw.",
      outgoingState: "Bow tied around model.",
      entities: [{ id: "red_bow", owner: "Tí hand", state: "loose ribbon in paw" }]
    }
  });
  const asset = { ...preflightAsset, id: "asset_after", shotId: current.id };
  const result = validateVideoPreflight({ shot: current, previousShot: previous, prompt: "Wrap ribbon around model.", references: [{ assetId: asset.id, filePath: asset.filePath, referenceRole: "shot_keyframe" }], assets: [asset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.valid).toBe(false);
  expect(result.issues.some((issue) => issue.code === "UNSEEN_ENTITY_TRANSFER_AT_CUT")).toBe(true);
});

test("video preflight allows a character to move between scene surfaces", async () => {
  const previous = preflightShot({
    id: "shot_outside",
    continuityContract: {
      geography: "Rain path.",
      incomingState: "Tí wears a bow.",
      outgoingState: "Tí has a bare collar.",
      entities: [{ id: "main_ti", owner: "ground", state: "collar bare after removing bow" }]
    }
  });
  const current = preflightShot({
    id: "shot_inside",
    continuityContract: {
      geography: "Machine room.",
      incomingState: "Tí enters without the bow.",
      outgoingState: "Tí watches the beam.",
      entities: [{ id: "main_ti", owner: "floor", state: "no bow on collar" }]
    }
  });
  const asset = { ...preflightAsset, id: "asset_inside", shotId: current.id };
  const result = validateVideoPreflight({ shot: current, previousShot: previous, prompt: "Tí places the repaired model in the dock.", references: [{ assetId: asset.id, filePath: asset.filePath, referenceRole: "shot_keyframe" }], assets: [asset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.issues.some((issue) => issue.code === "UNSEEN_ENTITY_TRANSFER_AT_CUT")).toBe(false);
});

test("video preflight accepts a prop transfer visibly performed by placing it into a dock", async () => {
  const previous = preflightShot({
    id: "shot_repair",
    continuityContract: {
      geography: "Rain path.",
      incomingState: "Model in Tí's paws.",
      outgoingState: "Repaired model remains in Tí's paws.",
      entities: [{ id: "prop_paper_lighthouse", owner: "Tí hands", state: "held after repair" }]
    }
  });
  const current = preflightShot({
    id: "shot_dock",
    motion: "Tí đặt mô hình đã sửa vào dock rồi nhìn luồng sáng bật lên.",
    dominantAction: "Đặt mô hình vào dock để kích hoạt đèn.",
    continuityContract: {
      geography: "Machine room.",
      incomingState: "Repaired model arrives in Tí's paws.",
      outgoingState: "Model sits in the dock.",
      entities: [{ id: "prop_paper_lighthouse", owner: "machine dock", state: "installed onscreen" }]
    }
  });
  const asset = { ...preflightAsset, id: "asset_dock", shotId: current.id };
  const result = validateVideoPreflight({ shot: current, previousShot: previous, prompt: "Place the repaired model into the dock.", references: [{ assetId: asset.id, filePath: asset.filePath, referenceRole: "shot_keyframe" }], assets: [asset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.transformationKinds).toContain("attach_install");
  expect(result.issues.some((issue) => issue.code === "UNSEEN_ENTITY_TRANSFER_AT_CUT")).toBe(false);
});

test("video preflight treats pulling an accessory off as one visible transfer", async () => {
  const shot = preflightShot({
    motion: "Tí tháo nơ bằng cách kéo dải ruy băng khỏi cổ rồi quấn quanh mô hình.",
    dominantAction: "Chuyển nơ từ cổ sang mô hình.",
    visualTransformationCount: 1
  });
  const kinds = validateVideoPreflight({ shot, prompt: "Remove and wrap the same ribbon.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" }).transformationKinds;
  expect(kinds).toContain("detach_remove");
  expect(kinds).not.toContain("extract_rescue");
  expect(kinds).not.toContain("break_damage");
});

test("video preflight does not count a Vietnamese gaze shift as a material transfer", async () => {
  const shot = preflightShot({
    motion: "Cốc dừng giữa không trung, ánh mắt cả nhóm chuyển về điện thoại; Khải hạ tay phải và úp máy xuống.",
    dominantAction: "Khải úp điện thoại xuống bàn.",
    visualTransformationCount: 1
  });
  const result = validateVideoPreflight({ shot, prompt: "Khải lowers the phone onto the table.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.transformationKinds).toEqual(["lift_weight"]);
  expect(result.issues.some((issue) => issue.code === "MULTIPLE_VISIBLE_TRANSFORMATIONS")).toBe(false);
});

test("video preflight treats lifting and placing the same pen as one manipulation", async () => {
  const shot = preflightShot({
    motion: "Khải nhấc bút, đặt đầu bút vào giữa năm ô rồi viết tên nhóm.",
    dominantAction: "Khải viết tên nhóm vào giữa hóa đơn.",
    visualTransformationCount: 1
  });
  const result = validateVideoPreflight({ shot, prompt: "Khải writes the group name.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.transformationKinds).toEqual(["attach_install"]);
  expect(result.issues.some((issue) => issue.code === "MULTIPLE_VISIBLE_TRANSFORMATIONS")).toBe(false);
});

test("video preflight treats opening a hand while transferring money as one action", async () => {
  const shot = preflightShot({
    motion: "Huy rút tiền khỏi túi, mở bàn tay để tiền rơi cạnh hóa đơn.",
    dominantAction: "Tiền chuyển từ túi Huy sang bàn.",
    visualTransformationCount: 1
  });
  const result = validateVideoPreflight({ shot, prompt: "Huy transfers the money onto the table.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.transformationKinds).toEqual(["extract_rescue"]);
  expect(result.issues.some((issue) => issue.code === "MULTIPLE_VISIBLE_TRANSFORMATIONS")).toBe(false);
});

test("video preflight ignores audible door warnings and hand withdrawal after a ticket handoff", async () => {
  const shot = preflightShot({
    motion: "Bình đưa vé sang tay An rồi rút tay khỏi vé; cảnh báo đóng cửa tàu dồn lên quanh họ.",
    dominantAction: "Bình chuyển chiếc vé nhàu từ tay mình sang tay An.",
    visualTransformationCount: 1
  });
  const result = validateVideoPreflight({ shot, prompt: "Bình hands the ticket to An.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.transformationKinds).not.toContain("open_close");
  expect(result.transformationKinds).not.toContain("extract_rescue");
  expect(result.issues.some((issue) => issue.code === "MULTIPLE_VISIBLE_TRANSFORMATIONS")).toBe(false);
});

test("video preflight ignores hand withdrawal and ambient platform movement after placing a ticket", async () => {
  const shot = preflightShot({
    motion: "Bình hạ vé xuống bàn, rút tay dứt khoát rồi bước lùi khỏi lối lên tàu; An giữ vị trí nhìn theo hành động, nền sân ga chuyển động nhẹ.",
    dominantAction: "Bình đặt chiếc vé xuống trước An, buông quyền giữ vé rồi lùi lại cạnh bàn công vụ.",
    visualTransformationCount: 1
  });
  const result = validateVideoPreflight({ shot, prompt: "Bình places the ticket in front of An.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.transformationKinds).toEqual(["lift_weight"]);
  expect(result.issues.some((issue) => issue.code === "MULTIPLE_VISIBLE_TRANSFORMATIONS")).toBe(false);
});

test("video preflight treats pointing at a timestamp in an opened log as one open action", async () => {
  const shot = preflightShot({
    motion: "An mở nhật ký dứt khoát, đặt ngón tay vào dấu thời gian rồi giữ yên để Cường đối chiếu.",
    dominantAction: "An mở nhật ký và đặt ngón tay đúng vào dấu thời gian cảnh báo.",
    visualTransformationCount: 1
  });
  const result = validateVideoPreflight({ shot, prompt: "An opens the log and points at the timestamp.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "9:16" });
  expect(result.transformationKinds).toEqual(["open_close"]);
  expect(result.issues.some((issue) => issue.code === "MULTIPLE_VISIBLE_TRANSFORMATIONS")).toBe(false);
});

test("video preflight treats placing a key into an already-open palm as one handoff", async () => {
  const shot = preflightShot({
    motion: "Tuấn bước tới, thả chìa khóa vào lòng bàn tay Mai; Mai giữ bàn tay mở rồi khép các ngón quanh chìa khóa.",
    dominantAction: "Tuấn đặt chìa khóa đồng từ tay mình vào bàn tay đang mở của Mai.",
    visualTransformationCount: 1
  });
  const result = validateVideoPreflight({ shot, prompt: "Tuấn places the bronze key into Mai's open palm.", references: [{ assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" }], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(result.transformationKinds).toEqual(["attach_install"]);
  expect(result.issues.some((issue) => issue.code === "MULTIPLE_VISIBLE_TRANSFORMATIONS")).toBe(false);
});

test("video preflight rejects duplicate references and the same active idempotency key", async () => {
  const shot = preflightShot();
  const reference = { assetId: preflightAsset.id, filePath: preflightAsset.filePath, referenceRole: "shot_keyframe" as const };
  const duplicate = validateVideoPreflight({ shot, prompt: "Open one keepsake box.", references: [reference, reference], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  expect(duplicate.issues.map((issue) => issue.code)).toContain("DUPLICATE_REFERENCE");
  const first = validateVideoPreflight({ shot, prompt: "Open one keepsake box.", references: [reference], assets: [preflightAsset], jobs: [], provider: "google-flow", aspectRatio: "16:9" });
  const activeJob = { id: "job_active", projectId: "project_preflight", shotId: shot.id, providerId: "google-flow-web", jobType: "video", input: {}, status: "generating", resultAssetIds: [], idempotencyKey: first.idempotencyKey, createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:01.000Z" } satisfies AutomationJob;
  const repeated = validateVideoPreflight({ shot, prompt: "Open one keepsake box.", references: [reference], assets: [preflightAsset], jobs: [activeJob], provider: "google-flow", aspectRatio: "16:9" });
  expect(repeated.valid).toBe(false);
  expect(repeated.issues.map((issue) => issue.code)).toContain("DUPLICATE_ACTIVE_SUBMIT");
  expect(repeated.issues.find((issue) => issue.code === "DUPLICATE_ACTIVE_SUBMIT")?.owner).toBe("app_orchestration");
});

test("persisted edit sequence uses source truth and deterministic reorder trim split", async () => {
  const shots = [preflightShot({ id: "shot_a", order: 1, assetIds: ["video_a"], durationSec: 4 }), preflightShot({ id: "shot_b", order: 2, assetIds: ["video_b"], durationSec: 4 })];
  const assets = [
    { ...preflightAsset, id: "video_a", shotId: "shot_a", type: "video" as const, durationSeconds: 6 },
    { ...preflightAsset, id: "video_b", shotId: "shot_b", type: "video" as const, durationSeconds: 8 }
  ];
  const sequence = createDefaultEditSequence("project_edit", shots, new Map([["shot_a", assets[0]], ["shot_b", assets[1]]]), "2026-07-29T00:00:00.000Z");
  expect(sequence.clips.map((clip) => clip.timelineDurationSec)).toEqual([6, 8]);
  const reordered = reorderSequenceClips(sequence.clips, sequence.clips[1].id, 0);
  expect(reordered.map((clip) => clip.shotId)).toEqual(["shot_b", "shot_a"]);
  const trimmed = trimSequenceClip(reordered[0], "end", 5, 8);
  expect([trimmed.sourceInSec, trimmed.sourceOutSec, trimmed.timelineDurationSec]).toEqual([0, 5, 5]);
  const split = splitSequenceClip([{ ...trimmed, order: 0 }], trimmed.id, 2, "fixture");
  expect(split.map((clip) => [clip.sourceInSec, clip.sourceOutSec, clip.timelineDurationSec])).toEqual([[0, 2, 2], [2, 5, 3]]);
  expect(split.every((clip) => clip.splitFromClipId === trimmed.id)).toBe(true);
  const normalized = normalizeEditSequence({ ...sequence, clips: split }, shots, assets).clips;
  expect(normalized).toHaveLength(3);
  expect(normalized.at(-1)?.shotId).toBe("shot_a");
});

test("default edit sequence preserves canonical scene-major shot order", async () => {
  const shots = [
    preflightShot({ id: "scene_1_shot_1", sceneId: "scene_1", order: 1 }),
    preflightShot({ id: "scene_1_shot_2", sceneId: "scene_1", order: 2 }),
    preflightShot({ id: "scene_2_shot_1", sceneId: "scene_2", order: 1 }),
    preflightShot({ id: "scene_2_shot_2", sceneId: "scene_2", order: 2 }),
    preflightShot({ id: "scene_3_shot_1", sceneId: "scene_3", order: 1 })
  ];
  const sequence = createDefaultEditSequence("project_scene_order", shots, new Map(), "2026-07-29T00:00:00.000Z");
  expect(sequence.clips.map((clip) => clip.shotId)).toEqual(shots.map((shot) => shot.id));
});
