#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2).filter((argument, index) => argument !== "--" || index > 0);
const [statePath, outputPath, requestedProjectId] = args;
if (!statePath || !outputPath) {
  console.error("Usage: node scripts/export-previsual-review.mjs <state.json> <output.md> [project-id]");
  process.exit(1);
}

const state = JSON.parse(await readFile(resolve(statePath), "utf8"));
const projectId = requestedProjectId || state.activeProjectId;
const project = state.projects.find((candidate) => candidate.id === projectId);
if (!project) throw new Error(`Project not found: ${projectId}`);

const scenes = state.scenes.filter((scene) => scene.projectId === projectId).sort((a, b) => a.order - b.order);
const sceneIds = new Set(scenes.map((scene) => scene.id));
const shots = state.shots.filter((shot) => sceneIds.has(shot.sceneId)).sort((a, b) => a.order - b.order);
const references = (state.visualReferences || state.references || []).filter((reference) => reference.projectId === projectId);
const json = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

const reviewerPrompt = `Bạn là kiểm duyệt viên tiền kỳ độc lập. Chỉ đánh giá dữ liệu app đã tạo; không viết lại kịch bản và không suy đoán rằng ảnh/video tương lai sẽ tự sửa lỗi. Đối chiếu brief nguồn với narrative contract, screenplay, từng shot và kế hoạch reference. Chấm 0-10 cho: source fidelity, causal clarity, dialogue continuity, pacing/information density, atomic one-shot grammar, character/speaker identity, visual coverage. Liệt kê tối đa 8 phát hiện, mỗi phát hiện phải có severity (blocking/major/minor), scene/shot cụ thể, bằng chứng ngắn và owner sửa (story/screenplay/shot/reference). Kết luận PASS chỉ khi không có blocking, không có sai cốt truyện và mọi nhân vật hữu hình đều có kế hoạch identity reference. Trả lời ngắn gọn bằng Markdown, không trả JSON.`;

const lines = [
  `# ${project.name} — previsual review packet`, "",
  "> Gói này được xuất nguyên trạng trước khi tạo ảnh/video. Người đánh giá không được sửa nội dung trong file.", "",
  "## Prompt dùng giống nhau cho ChatGPT và Gemini", "", reviewerPrompt, "",
  "## Run metadata", "",
  `- Project ID: \`${project.id}\``,
  `- Target: \`${project.intake?.targetDurationSec ?? "unknown"}s\` · \`${project.intake?.videoFrame ?? "unknown"}\``,
  `- Language: \`${project.intake?.contentLanguage ?? project.intake?.outputLanguage ?? "unknown"}\``,
  `- Scenes / shots / references: \`${scenes.length} / ${shots.length} / ${references.length}\``, "",
  "## Source brief", "", project.sourceDraft || project.description || "(empty)", "",
  "## Narrative foundation", "", json({
    logline: project.storyDocument?.logline,
    sourceAnalysis: project.storyDocument?.sourceAnalysis,
    adaptationDecisions: project.storyDocument?.adaptationDecisions,
    narrativeContract: project.storyDocument?.narrativeContract
  }), "",
  "## Scene architecture", "", project.storyDocument?.sceneBreakdown || "(empty)", "",
  "## Screenplay scenes", "", json(project.storyDocument?.screenplayScenes || []), "",
  "## App sequence QA", "", json(project.storyDocument?.sequenceQA || {}), "",
  "## Scene and shot contracts", "", json(scenes.map((scene) => ({
    scene,
    shots: shots.filter((shot) => shot.sceneId === scene.id).map((shot) => ({
      id: shot.id, order: shot.order, durationSec: shot.durationSec, description: shot.description,
      storyBeat: shot.storyBeat, dialogue: shot.dialogue, speaker: shot.speaker,
      camera: shot.camera, dominantAction: shot.dominantAction, actionBeats: shot.actionBeats,
      visibleEntityIds: shot.visibleEntityIds, audibleEntityIds: shot.audibleEntityIds,
      referenceRequirementIds: shot.referenceRequirementIds, timingContract: shot.timingContract,
      pacingContract: shot.pacingContract, continuityContract: shot.continuityContract
    }))
  }))), "",
  "## Planned identity references", "", json(references.map((reference) => ({
    id: reference.id, name: reference.name, role: reference.role, referenceUse: reference.referenceUse,
    characterSlot: reference.characterSlot, filePath: reference.filePath
  }))), ""
];

await writeFile(resolve(outputPath), `${lines.join("\n")}\n`, "utf8");
console.log(`Exported previsual packet for ${project.id}: ${scenes.length} scenes, ${shots.length} shots.`);
