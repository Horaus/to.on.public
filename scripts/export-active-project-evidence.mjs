import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const outputPath = path.resolve(process.argv[2] || "docs/testing-prompts/active-project-evidence.md");
const port = Number(process.env.STUDIO_ELECTRON_CDP_PORT || 9333);

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page" && /^http:\/\/127\.0\.0\.1:/i.test(candidate.url));
if (!target?.webSocketDebuggerUrl) throw new Error(`No desktop renderer is exposed through CDP ${port}.`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

const state = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timed out reading desktop state.")), 10_000);
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.id !== 1) return;
    clearTimeout(timer);
    if (message.result?.exceptionDetails) return reject(new Error(message.result.exceptionDetails.text));
    resolve(JSON.parse(message.result.result.value));
  });
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: "window.studioBridge.getState().then((state) => JSON.stringify(state))",
      awaitPromise: true,
      returnByValue: true
    }
  }));
});
socket.close();

const project = state.projects.find((candidate) => candidate.id === state.activeProjectId);
if (!project) throw new Error(`Active project ${state.activeProjectId || "(none)"} was not found.`);
const scenes = state.scenes
  .filter((scene) => scene.projectId === project.id)
  .sort((left, right) => left.order - right.order);
const sceneIds = new Set(scenes.map((scene) => scene.id));
const sceneOrderById = new Map(scenes.map((scene) => [scene.id, scene.order]));
const shots = state.shots
  .filter((shot) => sceneIds.has(shot.sceneId))
  .sort((left, right) => (sceneOrderById.get(left.sceneId) || 0) - (sceneOrderById.get(right.sceneId) || 0) || left.order - right.order);
const jobs = state.jobs.filter((job) => job.projectId === project.id);
const story = project.storyDocument || {};
const assetsById = new Map(state.assets.map((asset) => [asset.id, asset]));
const localMediaPath = (filePath = "") => {
  try {
    const url = new URL(filePath);
    const marker = "/media/";
    const index = url.pathname.indexOf(marker);
    return index >= 0 ? decodeURIComponent(url.pathname.slice(index + marker.length)) : filePath;
  } catch {
    return filePath;
  }
};

const json = (value) => `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
const frameLabel = (frame) => {
  if (!frame) return "?";
  if (typeof frame === "string") return frame;
  if (typeof frame === "object") return frame.aspectRatio || frame.ratio || frame.name || "?";
  return String(frame);
};
const lines = [
  `# ${project.name}: script, storyboard and provider prompts`,
  "",
  `- Project ID: \`${project.id}\``,
  `- Exported at: ${new Date().toISOString()}`,
  `- Target: ${project.intake?.targetDurationSec || "?"}s, ${frameLabel(project.intake?.videoFrame)}`,
  `- Scenes: ${scenes.length}; shots: ${shots.length}`,
  "- This is a read-only export of persisted app state. No content was edited during export.",
  "",
  "## Source brief",
  "",
  project.sourceDraft || "",
  "",
  "## Narrative foundation and creative intent",
  json({
    logline: story.logline,
    story: story.story,
    sourceAnalysis: story.sourceAnalysis,
    adaptationDecisions: story.adaptationDecisions,
    narrativeContract: story.narrativeContract,
    creativeIntent: story.creativeIntent
  }),
  "## Scene architecture",
  json(story.scenes || scenes),
  "## Screenplay by scene",
  json(story.screenplayScenes || []),
  "## Temporal-causal IR and sequence QA",
  json({ temporalCausalIR: story.temporalCausalIR, sequenceQA: story.sequenceQA }),
  "## Provider-neutral shot contracts",
  json(shots.map(({ prompt, ...shot }) => shot)),
  "## Exact compiled provider prompts",
  ""
];

for (const shot of shots) {
  lines.push(`### Shot ${shot.order} · ${shot.id}`, "", `- Scene: \`${shot.sceneId}\``, `- Duration: ${shot.durationSec}s`, "", "```text", shot.prompt || "(missing prompt)", "```", "");
}

lines.push("## Generated video outputs", "", `- Available: ${shots.filter((shot) => shot.assetIds.some((assetId) => assetsById.get(assetId)?.type === "video")).length}/${shots.length} shots.`, "");
for (const shot of shots) {
  const videos = shot.assetIds.map((assetId) => assetsById.get(assetId)).filter((asset) => asset?.type === "video");
  lines.push(`### Shot ${shot.order} · ${shot.id}`, "");
  if (!videos.length) {
    lines.push("- Status: video output is missing.", "");
    continue;
  }
  for (const [index, video] of videos.entries()) {
    const localPath = localMediaPath(video.filePath);
    lines.push(
      `- Video ${index + 1}: [open local MP4](<${localPath}>)`,
      `- App media URL: ${video.filePath}`,
      `- Asset/job: \`${video.id}\` / \`${video.sourceJobId || "unknown"}\``,
      `- Provider duration: ${video.metadata?.durationSeconds ?? "unknown"}s`,
      ""
    );
  }
}

lines.push("## Runtime job evidence", json(jobs.map((job) => ({
  id: job.id,
  task: job.input?.bridgeMessage?.task || job.task,
  status: job.status,
  error: job.error,
  createdAt: job.createdAt
}))));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(outputPath);
