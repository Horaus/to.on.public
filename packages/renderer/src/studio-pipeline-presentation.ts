import type { AutomationJob, Project, Shot } from "@studio/types";
import type { PipelineStepId } from "@studio/domain/pipeline-gates";
import type { VideoPreflightValidation } from "@studio/domain/preflight-contract";

export type PipelinePresentationInput = {
  project: Project;
  projectShots: Shot[];
  pipelineStep: PipelineStepId;
  pipelineRun?: { mode?: string; running?: boolean; message?: string } | null;
  projectBusyJobs: AutomationJob[];
  projectBlockedJobs: AutomationJob[];
  projectPreflightBlocks: Array<{ shot: Shot; validation: VideoPreflightValidation }>;
  projectRepairablePreflights: unknown[];
  projectRetryableJobs: AutomationJob[];
  videoReadyCount: number;
  keyframeReadyCount: number;
  projectBlockedRetryAttempt: number;
  projectCanRecoverLateText: boolean;
  projectRetryLimitReached: boolean;
  pipelineStarted: boolean;
  pipelineComplete: boolean;
  pipelineStepLabel: (step: PipelineStepId) => string;
  preflightIssueSummary: (validation: VideoPreflightValidation) => string;
  sequenceQaMessage?: string;
};

export function derivePipelinePresentation(input: PipelinePresentationInput) {
  const {
    project, projectShots, pipelineStep, pipelineRun, projectBusyJobs, projectBlockedJobs,
    projectPreflightBlocks, projectRepairablePreflights, projectRetryableJobs,
    videoReadyCount, keyframeReadyCount, projectBlockedRetryAttempt, projectCanRecoverLateText,
    projectRetryLimitReached, pipelineStarted, pipelineComplete, pipelineStepLabel,
    preflightIssueSummary, sequenceQaMessage
  } = input;
  const firstPreflightBlock = projectPreflightBlocks[0];
  const hasPipelineBlock = projectBlockedJobs.length > 0 || projectPreflightBlocks.length > 0;
  const manualContractFailure = /SCREENPLAY_RUNTIME_OVERFLOW\b/i.test(`${projectBlockedJobs[0]?.error || ""} ${projectBlockedJobs[0]?.statusMessage || ""}`);
  const fullPipelineRunning = pipelineRun?.mode === "full" && pipelineRun.running;
  const staleStoppedMessage = Boolean(pipelineRun?.message?.startsWith("Dừng:") && !hasPipelineBlock && projectBusyJobs.length === 0);
  const pipelineIdleMessage = pipelineStep === "video"
    ? projectRepairablePreflights.length
      ? `${projectRepairablePreflights.length} chỉ dẫn video sẽ được tự rút gọn trước khi tạo; không cần thử lại.`
      : `Video sẵn sàng ${videoReadyCount}/${projectShots.length}. Còn ${Math.max(0, projectShots.length - videoReadyCount)} shot cần queue video.`
    : pipelineStep === "shots" && sequenceQaMessage
      ? sequenceQaMessage
      : pipelineStep === "storyboard"
        ? `Keyframe sẵn sàng ${keyframeReadyCount}/${projectShots.length}.`
        : projectRetryableJobs.length ? `${projectRetryableJobs.length} lỗi cũ trong log, vẫn có thể chạy mới.` : "Chưa chạy tự động.";
  const pipelineDisplayMessage = projectBusyJobs.length
    ? `${projectBusyJobs.length} job đang chạy`
    : hasPipelineBlock
      ? projectBlockedJobs.length
        ? `${projectBlockedJobs.length} lỗi job chặn automation`
        : `${projectPreflightBlocks.length} shot lỗi preflight: ${preflightIssueSummary(firstPreflightBlock.validation)}`
      : staleStoppedMessage ? pipelineIdleMessage : pipelineRun?.message || pipelineIdleMessage;
  const blockingJobLabel = projectBusyJobs.length
    ? `${projectBusyJobs.length} job đang chạy trong project này`
    : hasPipelineBlock
      ? projectBlockedJobs.length
        ? `${projectBlockedJobs.length} job đang chặn bước ${pipelineStepLabel(pipelineStep)}`
        : `Preflight SH${firstPreflightBlock.shot.order} đang chặn bước ${pipelineStepLabel(pipelineStep)}`
      : "";
  const pipelinePrimaryLabel = fullPipelineRunning ? "Tạm dừng" : projectBusyJobs.length ? "Đang chạy" : projectBlockedJobs.length
    ? manualContractFailure ? "Mở Kịch bản" : projectCanRecoverLateText ? "Thu hồi kết quả" : projectRetryLimitReached ? "Thử lại thủ công" : `Thử lại lỗi ${projectBlockedRetryAttempt + 1}/3`
    : firstPreflightBlock?.validation.requiresTextCompaction ? "AI rút gọn & thử lại" : firstPreflightBlock ? "Mở shot lỗi" : pipelineStarted && !pipelineComplete ? "Tiếp tục" : "Triển khai";
  return { firstPreflightBlock, hasPipelineBlock, fullPipelineRunning, pipelineIdleMessage, pipelineDisplayMessage, blockingJobLabel, pipelinePrimaryLabel };
}
