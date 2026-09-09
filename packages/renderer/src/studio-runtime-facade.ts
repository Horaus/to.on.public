import { assetFrameAspectRatio, defaultProjectIntake, durationToSeconds, imagePreviewSrc, readFileAsDataUrl, videoFramePatch } from "@studio/renderer-core/production-ui-support";
import { makeId } from "@studio/renderer-core/runtime-id";
import { isActiveJob, isProjectJobBusy, jobNeedsUserAction } from "@studio/renderer-core/job-status";
import { classifyTextRetry, isCorrectableStructuredImportFailure } from "@studio/workflow/studio-retry-policy";
import { formatLabel, statusLabel } from "@studio/renderer-core/ui-format";
import { buildVideoGenerationPrompt, skillInstructionForStage } from "@studio/workflow/video-generation";
import { FLOW_PROMPT_HARD_LIMIT, FLOW_PROMPT_SAFE_BYTES, preflightIssueSummary, utf8ByteLength } from "@studio/workflow/video-preflight";

export const studioRuntime = {
  assetFrameAspectRatio, defaultProjectIntake, durationToSeconds, imagePreviewSrc, readFileAsDataUrl, videoFramePatch,
  makeId, isActiveJob, isProjectJobBusy, jobNeedsUserAction, classifyTextRetry, isCorrectableStructuredImportFailure,
  formatLabel, statusLabel, buildVideoGenerationPrompt, skillInstructionForStage, FLOW_PROMPT_HARD_LIMIT, FLOW_PROMPT_SAFE_BYTES,
  preflightIssueSummary, utf8ByteLength
};
