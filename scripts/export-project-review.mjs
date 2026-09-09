#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [statePath, outputPath, requestedProjectId] = process.argv.slice(2);
if (!statePath || !outputPath) {
  console.error("Usage: node scripts/export-project-review.mjs <state.json> <output.md> [project-id]");
  process.exit(1);
}

const state = JSON.parse(await readFile(resolve(statePath), "utf8"));
const projectId = requestedProjectId || state.activeProjectId;
const project = state.projects.find((candidate) => candidate.id === projectId);
if (!project) throw new Error(`Project not found: ${projectId}`);

const scenes = state.scenes
  .filter((scene) => scene.projectId === projectId)
  .sort((left, right) => left.order - right.order);
const sceneIds = new Set(scenes.map((scene) => scene.id));
const shots = state.shots
  .filter((shot) => sceneIds.has(shot.sceneId))
  .sort((left, right) => {
    const leftScene = scenes.find((scene) => scene.id === left.sceneId)?.order ?? 0;
    const rightScene = scenes.find((scene) => scene.id === right.sceneId)?.order ?? 0;
    return leftScene - rightScene || left.order - right.order;
  });
const videosById = new Map(
  state.assets
    .filter((asset) => asset.projectId === projectId && asset.type === "video")
    .map((asset) => [asset.id, asset])
);

const json = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const lines = [
  `# ${project.name} — bộ kiểm chứng script, storyboard và video`,
  "",
  "> Dữ liệu nguyên bản do app tạo trong một project mới. File này chỉ xuất và sắp thứ tự; không sửa nội dung giữa pipeline.",
  "",
  "## Thông tin lần chạy",
  "",
  `- Project ID: \`${project.id}\``,
  `- Thời lượng mục tiêu: \`${project.intake?.targetDurationSec ?? "không rõ"} giây\``,
  `- Ngôn ngữ: \`${project.intake?.contentLanguage ?? "không rõ"}\``,
  `- Video provider: \`${project.intake?.aiRouting?.videoProvider ?? "không rõ"}\``,
  `- Khung hình: \`${project.intake?.videoFrame ?? "không rõ"}\``,
  `- Scene / shot / video: \`${scenes.length} / ${shots.length} / ${videosById.size}\``,
  "",
  "## Brief nguồn",
  "",
  project.sourceDraft || project.description || "(trống)",
  "",
  "## Logline",
  "",
  project.storyDocument?.logline || "(trống)",
  "",
  "## Source analysis",
  "",
  json(project.storyDocument?.sourceAnalysis ?? {}),
  "",
  "## Narrative contract",
  "",
  json(project.storyDocument?.narrativeContract ?? {}),
  "",
  "## Adaptation decisions",
  "",
  json(project.storyDocument?.adaptationDecisions ?? []),
  "",
  "## Kịch bản phân cảnh tổng quan",
  "",
  project.storyDocument?.sceneBreakdown || "(trống)",
  "",
  "## Screenplay theo scene",
  "",
  json(project.storyDocument?.screenplayScenes ?? []),
  "",
  "## Sequence QA của app",
  "",
  json(project.storyDocument?.sequenceQA ?? {}),
  ""
];

for (const scene of scenes) {
  lines.push(`## Scene ${scene.order} — ${scene.title}`, "", json(scene), "");
  for (const shot of shots.filter((candidate) => candidate.sceneId === scene.id)) {
    const video = videosById.get(shot.currentVideoAssetId);
    lines.push(
      `### SH${shot.order} · ${shot.durationSec}s`,
      "",
      `- Shot ID: \`${shot.id}\``,
      `- Video asset: \`${shot.currentVideoAssetId || "missing"}\``,
      `- Video file: \`${video?.filePath || "missing"}\``,
      `- Speaker: \`${shot.speaker || "none"}\``,
      `- Speech: \`${shot.speechType || "none"}\` — ${shot.dialogue || "(không thoại)"}`,
      "",
      "**Shot contract**",
      "",
      json({
        storyBeat: shot.storyBeat,
        description: shot.description,
        actionBeats: shot.actionBeats,
        camera: shot.camera,
        motion: shot.motion,
        visibleEntityIds: shot.visibleEntityIds,
        audibleEntityIds: shot.audibleEntityIds,
        continuityContract: shot.continuityContract
      }),
      "",
      "**Prompt đã gửi video generator**",
      "",
      "```text",
      shot.prompt || "(trống)",
      "```",
      ""
    );
  }
}

await writeFile(resolve(outputPath), `${lines.join("\n")}\n`, "utf8");
console.log(`Exported ${scenes.length} scenes, ${shots.length} shots and ${videosById.size} videos to ${resolve(outputPath)}`);
