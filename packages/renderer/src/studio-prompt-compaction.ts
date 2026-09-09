import type { RunJobRequest } from "@studio/types/job-request";
import type { RunJobPayload } from "@studio/workflow/support-core";
import type { Project, ProductionGraphCustomNode, ProductionGraphNodeSettings, ProductionGraphRevision, ProjectIntake, Shot, StudioState } from "@studio/types";
import { getWorkflowBridge } from "@studio/workflow/workflow-bridge";

type PromptCompactionDeps = {
  project: Project;
  state: StudioState;
  intake: ProjectIntake;
  textProvider: { id: string; platform: string; name: string };
  productionLanguage: string;
  makeId: (prefix: string) => string;
  isActiveJob: (job: StudioState["jobs"][number]) => boolean;
  utf8ByteLength: (value: string) => number;
  hardLimit: number;
  safeBytes: number;
  replaceState: (state: StudioState) => void;
  setPipelineRun: (updater: (current: any) => any) => void;
};

function flowPromptFingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function flowShotFingerprint(targetShot: Shot, productionLanguage: string) {
  return flowPromptFingerprint(JSON.stringify({ shot: {
    description: targetShot.description, camera: targetShot.camera, motion: targetShot.motion, dominantAction: targetShot.dominantAction,
    durationSec: targetShot.durationSec, dialogue: targetShot.dialogue, speechType: targetShot.speechType, speechDelivery: targetShot.speechDelivery,
    speaker: targetShot.speaker, transitionIn: targetShot.transitionIn, transitionOut: targetShot.transitionOut, continuityContract: targetShot.continuityContract,
    actionBeats: targetShot.actionBeats
  }, outputLanguage: productionLanguage }));
}

function completedCompactedPrompt(deps: PromptCompactionDeps, shotId: string, sourcePromptHash: string, sourceShotHash: string, sourcePromptBytes: number) {
  const nodes = (deps.project.productionGraphCustomNodes ?? []).filter((node) => node.systemGenerated === "prompt-compaction" && node.targetShotId === shotId && (node.sourcePromptHash === sourcePromptHash || node.sourceShotHash === sourceShotHash || (!node.sourceShotHashVersion && Math.abs(Number(node.sourcePromptBytes || 0) - sourcePromptBytes) <= 128))).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return nodes.map((node) => compactedOutputForNode(deps, node)).find(Boolean);
}

function compactedOutputForNode(deps: PromptCompactionDeps, node: ProductionGraphCustomNode) {
  const revisionJobIds = (deps.project.productionGraphRevisions?.[`custom:${node.id}`] ?? []).map((revision) => revision.jobId).reverse();
  const candidateJobIds = Array.from(new Set([node.lastJobId, ...revisionJobIds].filter((value): value is string => Boolean(value))));
  for (const jobId of candidateJobIds) {
    const job = deps.state.jobs.find((candidate) => candidate.id === jobId);
    const output = job?.outputText?.trim() || (job?.status === "done" || job?.status === "approved" ? node.text?.trim() : "");
    if (output && [...output].length <= deps.hardLimit && deps.utf8ByteLength(output) <= deps.safeBytes) return output;
  }
  return undefined;
}

export function createPromptCompactionActions(deps: PromptCompactionDeps) {
  async function requestFlowPromptCompaction(targetShot: Shot, sourcePrompt: string, sourcePromptHash: string, sourceShotHash: string) {
    if (!getWorkflowBridge()) return;
    const existingNode = (deps.project.productionGraphCustomNodes ?? []).find((node) => node.systemGenerated === "prompt-compaction" && node.targetShotId === targetShot.id && (node.sourcePromptHash === sourcePromptHash || node.sourceShotHash === sourceShotHash));
    const existingJob = existingNode?.lastJobId ? deps.state.jobs.find((job) => job.id === existingNode.lastJobId) : undefined;
    if (existingJob && deps.isActiveJob(existingJob)) {
      deps.setPipelineRun((current) => ({ mode: current?.mode ?? "step", running: current?.mode === "full" && current.running, currentStep: "video", message: `Đang tự rút gọn chỉ dẫn video SH${targetShot.order}; hệ thống sẽ tiếp tục khi hoàn tất.`, startedAt: current?.startedAt ?? new Date().toISOString() }));
      return;
    }
    const nodeId = existingNode?.id || deps.makeId("flow-prompt-compact");
    const jobId = deps.makeId("prompt-compaction");
    const documentId = `custom:${nodeId}`;
    const createdAt = new Date().toISOString();
    const sourceCharacters = [...sourcePrompt].length;
    const sourceBytes = deps.utf8ByteLength(sourcePrompt);
    const node: ProductionGraphCustomNode = { ...(existingNode || {}), id: nodeId, kind: "text", title: `Flow prompt compaction · SH${targetShot.order}`, text: sourcePrompt, lastJobId: jobId, systemGenerated: "prompt-compaction", targetShotId: targetShot.id, sourcePromptHash, sourceShotHash, sourceShotHashVersion: 2, sourcePromptCharacters: sourceCharacters, sourcePromptBytes: sourceBytes, createdAt: existingNode?.createdAt || createdAt };
    const instruction = `Rewrite this as a Google Flow image-to-video prompt for exactly one shot. Keep the approved keyframe as visual truth, the exact initial state, one dominant visible action, at most one material state transformation, camera, speech instruction, and final handoff state. Remove scene summaries, repeated continuity wording, alternate actions, future consequences, and unrelated assets. Return only the compact prompt, no markdown. Hard requirement: at most ${deps.safeBytes} UTF-8 bytes.`;
    const prompt = `${instruction}\n\nSOURCE SHOT PROMPT (${sourceCharacters} characters / ${sourceBytes} UTF-8 bytes):\n${sourcePrompt}`;
    const revision: ProductionGraphRevision = { id: deps.makeId("revision"), documentId, instruction, sourceText: sourcePrompt, providerId: deps.textProvider.id, jobId, status: "queued", createdAt };
    const revisions = { ...(deps.project.productionGraphRevisions ?? {}) };
    revisions[documentId] = [...(revisions[documentId] ?? []), revision];
    const customNodes = existingNode ? (deps.project.productionGraphCustomNodes ?? []).map((candidate) => candidate.id === nodeId ? node : candidate) : [...(deps.project.productionGraphCustomNodes ?? []), node];
    deps.replaceState(await getWorkflowBridge().updateProject(deps.project.id, { productionGraphCustomNodes: customNodes, productionGraphRevisions: revisions, productionGraphFocusDocumentId: documentId }));
    const payload: RunJobPayload = { jobId, projectId: deps.project.id, providerId: deps.textProvider.id, jobType: "text", prompt, bridgeMessage: { type: "RUN_JOB", jobId, provider: deps.textProvider.platform, task: "production_graph_revision", prompt, references: [], settings: { aspectRatio: deps.intake.videoFrame?.aspectRatio ?? "16:9", durationSec: 4, quality: "balanced", newConversation: true, sessionKey: `${deps.project.id}:flow-prompt-compaction:${targetShot.id}`, outputLanguage: deps.productionLanguage }, download: { auto: false, targetFolder: `/data/projects/${deps.project.id}/prompt-compaction`, filenameTemplate: targetShot.id } } };
    deps.replaceState(await getWorkflowBridge().runJob(payload));
    deps.setPipelineRun((current) => ({ mode: current?.mode ?? "step", running: current?.mode === "full" && current.running, currentStep: "video", message: `Đang tự chuẩn hóa chỉ dẫn video SH${targetShot.order}; chưa gửi sang công cụ tạo.`, startedAt: current?.startedAt ?? createdAt }));
  }

  return { flowPromptFingerprint, flowShotFingerprint: (shot: Shot) => flowShotFingerprint(shot, deps.productionLanguage), completedCompactedPrompt: (shotId: string, promptHash: string, shotHash: string, promptBytes: number) => completedCompactedPrompt(deps, shotId, promptHash, shotHash, promptBytes), requestFlowPromptCompaction };
}
