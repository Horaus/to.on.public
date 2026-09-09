import React, { type RefObject } from "react";
import { AlertTriangle, Check, Clock3, Image as ImageIcon, Loader2, RefreshCcw, Route, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AutomationJob, ProjectIntake, StudioState } from "@studio/types";
import type { PipelineStepId, PipelineStepItem, StudioView, VideoAspectRatio } from "@studio/workflow/renderer-contracts";
import type { VideoPreflightValidation } from "@studio/domain/preflight-contract";
import { userFacingJobMessage } from "@studio/renderer-core/ui-format";
import { isActiveJob } from "@studio/renderer-core/job-status";
import { finiteInputNumber } from "@studio/renderer-core/production-ui-support";

type PreflightBlock = { validation: VideoPreflightValidation };
type PipelineStep = PipelineStepItem;

export type StudioPipelineRailProps = {
  title: string;
  includeSetup?: boolean;
  /** The overview already renders the canonical pipeline map in its main
   * content; keep the rail focused on quick setup/actions there. */
  showStepList?: boolean;
  showPipelineRail: boolean;
  fullPipelineRunning: boolean;
  projectBusyJobs: AutomationJob[];
  hasPipelineBlock: boolean;
  projectRetryLimitReached: boolean;
  pipelinePrimaryLabel: string;
  pipelinePrimaryIcon: LucideIcon;
  handleBlockedPipelineAction: (mode: "step" | "full") => void;
  runPipelineStep: (mode: "step" | "full") => void;
  togglePipelineRun: () => void;
  blockingJobLabel: string;
  pipelineRun: { running?: boolean; mode?: string; message?: string } | null;
  cancelCurrentProjectAutomation: () => void;
  storySeed: string;
  setStorySeed: (value: string) => void;
  quickReferenceUpload: { dataUrl: string } | null;
  setQuickReferenceUpload: (value: null) => void;
  quickReferenceInputRef: RefObject<HTMLInputElement | null>;
  setQuickReferenceFile: (files: File[]) => void | Promise<void>;
  quickReferenceNote: string;
  setQuickReferenceNote: (value: string) => void;
  intake: ProjectIntake;
  durationToSeconds: (value: number, unit: ProjectIntake["durationUnit"]) => number;
  updateIntake: (patch: Partial<ProjectIntake>) => void;
  storyboardAspectRatio: VideoAspectRatio;
  videoFramePatch: (value: VideoAspectRatio) => Partial<ProjectIntake>;
  plannedShotCount: number;
  plannedShotDurations: number[];
  plannedRuntimeSec: number;
  pipelineStepLabel: (step: PipelineStepId) => string;
  runningPipelineStep: PipelineStepId;
  pipelineDisplayMessage: string;
  state: StudioState;
  latestPipelineJob: AutomationJob | undefined;
  formatLabel: (value: string) => string;
  statusLabel: (value: string) => string;
  activePipelineJobs: AutomationJob[];
  goTo: (view: StudioView) => void;
  pipelineSteps: PipelineStep[];
  jobPipelineStep: (job: AutomationJob) => PipelineStepId | undefined;
  firstPreflightBlock: PreflightBlock | undefined;
  preflightIssueSummary: (validation: VideoPreflightValidation) => string;
  projectBlockedJobs: AutomationJob[];
  projectBlockedRetryAttempt: number;
  pipelinePrimaryTitle?: string;
};


function PipelineSetup({ props }: { props: StudioPipelineRailProps }) {
  const { title, includeSetup = false, showPipelineRail, fullPipelineRunning, projectBusyJobs,
  hasPipelineBlock, projectRetryLimitReached, pipelinePrimaryLabel, pipelinePrimaryIcon: PipelinePrimaryIcon,
  handleBlockedPipelineAction, runPipelineStep, togglePipelineRun, blockingJobLabel, pipelineRun, cancelCurrentProjectAutomation,
  storySeed, setStorySeed, quickReferenceUpload, setQuickReferenceUpload, quickReferenceInputRef,
  setQuickReferenceFile, quickReferenceNote, setQuickReferenceNote, intake, durationToSeconds, updateIntake,
  storyboardAspectRatio, videoFramePatch, plannedShotCount, plannedShotDurations, plannedRuntimeSec,
  pipelineStepLabel, runningPipelineStep, pipelineDisplayMessage, state, latestPipelineJob, formatLabel, statusLabel,
  activePipelineJobs, goTo, pipelineSteps, jobPipelineStep, firstPreflightBlock, preflightIssueSummary, projectBlockedJobs,
  projectBlockedRetryAttempt } = props;
  return (includeSetup ? <>
        <label className="rail-field"><span>Kịch bản gợi ý</span><textarea value={storySeed} onChange={(event) => setStorySeed(event.target.value)} placeholder="Một câu ý tưởng, mục tiêu video, nhân vật chính..." /></label>
        <div className="quick-reference-field"><div className="quick-reference-head"><span>Ảnh gợi ý</span>{quickReferenceUpload ? <button type="button" onClick={() => setQuickReferenceUpload(null)}>Bỏ ảnh</button> : null}</div>
          <button type="button" className={`quick-reference-picker ${quickReferenceUpload ? "has-image" : ""}`} onClick={() => quickReferenceInputRef.current?.click()}>{quickReferenceUpload ? <img src={quickReferenceUpload.dataUrl} alt="Ảnh tham chiếu nhanh" /> : <><ImageIcon size={16} /> Chọn ảnh</>}</button>
          <input ref={quickReferenceInputRef} type="file" accept="image/*" hidden onChange={(event) => void setQuickReferenceFile(Array.from(event.target.files ?? []))} />
          <label className="rail-field compact"><span>Ghi chú ảnh</span><textarea value={quickReferenceNote} onChange={(event) => setQuickReferenceNote(event.target.value)} placeholder="VD: Ảnh hoạt hình 3D, lấy kiểu nhân vật như hình, khác bối cảnh..." /></label>
        </div>
        <div className="rail-grid"><label><span>Giây</span><input type="number" min={5} value={intake.targetDurationSec || durationToSeconds(intake.durationValue ?? 1.5, intake.durationUnit ?? "minutes")} onChange={(event) => { const seconds = finiteInputNumber(event.target.value, intake.targetDurationSec || 30, { min: 5 }); updateIntake({ targetDurationSec: seconds, durationValue: seconds, durationUnit: "seconds" }); }} /></label>
          <label><span>Khung</span><select value={storyboardAspectRatio} onChange={(event) => updateIntake(videoFramePatch(event.target.value as VideoAspectRatio))}><option value="9:16">9:16</option><option value="16:9">16:9</option><option value="1:1">1:1</option></select></label></div>
        <p className="rail-note">Dự kiến thực tế: {plannedShotCount} clip · {plannedShotDurations.join(" + ")} = {plannedRuntimeSec}s{plannedRuntimeSec !== (intake.targetDurationSec || 30) ? ` (lệch ${plannedRuntimeSec - (intake.targetDurationSec || 30) > 0 ? "+" : ""}${plannedRuntimeSec - (intake.targetDurationSec || 30)}s theo giới hạn Flow)` : ""}.</p>
      </> : <p className="rail-note">Tự dừng khi cần đăng nhập hoặc cần bạn xử lý.</p>);

}

export function StudioPipelineRail(props: StudioPipelineRailProps) {
  const { title, includeSetup = false, showStepList = true, showPipelineRail, fullPipelineRunning, projectBusyJobs,
  hasPipelineBlock, projectRetryLimitReached, pipelinePrimaryLabel, pipelinePrimaryIcon: PipelinePrimaryIcon,
  handleBlockedPipelineAction, runPipelineStep, togglePipelineRun, blockingJobLabel, pipelineRun, cancelCurrentProjectAutomation,
  storySeed, setStorySeed, quickReferenceUpload, setQuickReferenceUpload, quickReferenceInputRef,
  setQuickReferenceFile, quickReferenceNote, setQuickReferenceNote, intake, durationToSeconds, updateIntake,
  storyboardAspectRatio, videoFramePatch, plannedShotCount, plannedShotDurations, plannedRuntimeSec,
  pipelineStepLabel, runningPipelineStep, pipelineDisplayMessage, state, latestPipelineJob, formatLabel, statusLabel,
  activePipelineJobs, goTo, pipelineSteps, jobPipelineStep, firstPreflightBlock, preflightIssueSummary, projectBlockedJobs,
  projectBlockedRetryAttempt } = props;
  const blockedErrorDetail = userFacingJobMessage(String(projectBlockedJobs[0]?.error || projectBlockedJobs[0]?.statusMessage || (firstPreflightBlock ? preflightIssueSummary(firstPreflightBlock.validation) : blockingJobLabel)))
    .replace(/\u001b\[[0-9;]*m/g, "").trim();
  const blockedErrorSummary = blockedErrorDetail.split(/\n|Call log:/i)[0]
    .replace(/^Failed to open provider tab:\s*/i, "").slice(0, 180);
  const manualContractFailure = /SCREENPLAY_RUNTIME_OVERFLOW\b/i.test(`${projectBlockedJobs[0]?.error || ""} ${projectBlockedJobs[0]?.statusMessage || ""}`);
  const liveJobs = projectBusyJobs.filter(isActiveJob);
  const hasLiveJobs = liveJobs.length > 0;
  return (
    <section className={`module-side-panel overview-yolo-panel ${showPipelineRail ? "running-rail" : ""}`} aria-label={title}>
      <div className="module-side-head"><span>{title}</span><strong>{fullPipelineRunning ? "Tự động" : hasLiveJobs ? "Đang chạy" : hasPipelineBlock ? "Cần xử lý" : "Sẵn sàng"}</strong></div>
      <PipelineSetup props={props} />
      <div className="module-action-list">
        <button type="button" onClick={() => hasPipelineBlock ? handleBlockedPipelineAction("step") : runPipelineStep("step")} disabled={Boolean(projectBusyJobs.length)} title={projectBusyJobs.length ? blockingJobLabel : hasPipelineBlock ? manualContractFailure ? "Mở Kịch bản để sửa nội dung trước khi chạy lại" : projectRetryLimitReached ? "Công cụ tạo đã thất bại ba lần; chỉ thử lại khi hoạt động bình thường" : "Sửa lỗi đang chặn bước hiện tại rồi thử lại" : "Chạy đúng một bước hiện tại"}><Route size={14} /> {hasPipelineBlock ? projectBlockedJobs.length ? manualContractFailure ? "Mở Kịch bản" : projectRetryLimitReached ? "Thử lại thủ công" : `Xử lý bước lỗi ${projectBlockedRetryAttempt + 1}/3` : "Sửa kiểm tra và thử lại" : "Chạy bước"}</button>
        <button type="button" className={`primary ${projectBusyJobs.length ? "is-busy" : ""}`} onClick={togglePipelineRun} disabled={Boolean(projectBusyJobs.length && !fullPipelineRunning)} title={projectBusyJobs.length && !fullPipelineRunning ? "Có job đang chạy. Hủy job trước khi tiếp tục." : pipelinePrimaryLabel}><PipelinePrimaryIcon size={14} className={projectBusyJobs.length || fullPipelineRunning ? "spin" : undefined} /> {pipelinePrimaryLabel}</button>
        {projectBusyJobs.length ? <button type="button" className="danger" onClick={cancelCurrentProjectAutomation}><X size={14} /> Hủy job đang chạy</button> : null}
      </div>
      {projectBusyJobs.length && !pipelineRun?.running ? <div className="rail-warning" role="alert"><AlertTriangle size={14} /><span>{blockingJobLabel}. Nếu tác vụ thực tế không còn chạy, hãy hủy rồi bấm Tiếp tục.</span></div> : null}
      {hasPipelineBlock && !projectBusyJobs.length ? <div className="rail-warning" role="alert"><AlertTriangle size={14} /><div><strong>{blockedErrorSummary || "Công cụ tạo cần được kiểm tra."}</strong><span>{firstPreflightBlock ? firstPreflightBlock.validation.issues.find((issue) => issue.severity === "error")?.repair : "Kiểm tra công cụ đang đăng nhập rồi thử lại; nếu kết quả cũ không còn, app sẽ tạo lại trên công cụ hiện tại."}</span>{blockedErrorDetail.length > blockedErrorSummary.length ? <details><summary>Chi tiết kỹ thuật</summary><pre>{blockedErrorDetail}</pre></details> : null}</div></div> : null}
      <div className={`yolo-status ${hasLiveJobs || fullPipelineRunning ? "running" : hasPipelineBlock ? "blocked" : ""}`}><span>{pipelineStepLabel(runningPipelineStep)}</span><strong>{pipelineDisplayMessage}</strong></div>
      {(fullPipelineRunning || hasLiveJobs) ? <div className="rail-live-signal" aria-label="Tín hiệu tác vụ đang hoạt động"><div><span>Tín hiệu đang nhận</span><strong>{latestPipelineJob ? pipelineStepLabel(jobPipelineStep(latestPipelineJob) ?? runningPipelineStep) : pipelineStepLabel(runningPipelineStep)}</strong></div>{latestPipelineJob ? <><p>{userFacingJobMessage(latestPipelineJob.statusMessage || latestPipelineJob.error) || `Đang xử lý ${formatLabel(latestPipelineJob.jobType)}.`}</p><small>{statusLabel(latestPipelineJob.status)} · {state.providers.find((item) => item.id === latestPipelineJob.providerId)?.name ?? "Định tuyến AI"}</small>{typeof latestPipelineJob.progress === "number" ? <i style={{ width: `${Math.round(Math.max(0, Math.min(1, latestPipelineJob.progress)) * 100)}%` }} /> : null}</> : <><p>{pipelineRun?.message || "Đang chuẩn bị bước tiếp theo."}</p><small>{pipelineRun?.mode === "full" ? "TỰ ĐỘNG" : "TỪNG BƯỚC"}</small></>}{activePipelineJobs.slice(0, 3).map((job) => { const provider = state.providers.find((item) => item.id === job.providerId); return <button key={job.id} type="button" onClick={() => goTo("generate")}><Loader2 size={12} className="spin" /><strong>{pipelineStepLabel(jobPipelineStep(job) ?? runningPipelineStep)}</strong><span>{provider?.name ?? "Định tuyến AI"}</span><em>{userFacingJobMessage(job.statusMessage) || statusLabel(job.status)}</em></button>; })}</div> : null}
      {showStepList ? <div className="rail-pipeline-list">{pipelineSteps.map((step) => {
        const current = runningPipelineStep === step.id;
        const blocked = current && hasPipelineBlock;
        const running = current && (hasLiveJobs || fullPipelineRunning);
        const status = step.ready ? "Sẵn sàng" : blocked ? "Cần xử lý" : running ? "Đang chạy" : current ? "Tiếp theo" : "Đang chờ";
        return <button type="button" key={step.id} className={`${step.ready ? "ready" : ""} ${current ? "current" : ""} ${blocked ? "blocked" : ""}`} onClick={() => goTo(step.view)} aria-label={`${step.label} · ${status}`}><span>{step.ready ? <Check size={13} /> : blocked ? <AlertTriangle size={13} /> : running || current ? <RefreshCcw size={13} /> : <Clock3 size={13} />}</span><strong>{step.label}</strong><small>{status}</small></button>;
      })}</div> : null}
    </section>
  );
}
