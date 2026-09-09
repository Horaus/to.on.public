import type {
  AutomationJob, BrowserProviderAdapter,
  Scene, Shot
} from "@studio/types";
import {
  AlertTriangle,
  Check,
  Clapperboard,
  CircleHelp,
  Film,
  Loader2,
  Play, Plus, RefreshCcw,
  Route,
  ChevronRight,
  Wand2,
  X
} from "lucide-react";
import { useState } from "react";
import { isActiveJob, jobNeedsUserAction } from "@studio/renderer-core/job-status";
import { statusLabel, userFacingJobMessage } from "@studio/renderer-core/ui-format";
import { productionTaskPresentation, taskStatusLabel } from "../core/task-presentation";
import { deriveQueueSummary } from "../core/queue-presentation";

export function InsertCutPanel({
  shots,
  scenes,
  insertAfterShotId,
  selectedShotId,
  insertKind,
  insertBrief,
  onSelectInsertCut,
  onChangeKind,
  onChangeBrief
}: {
  shots: Shot[];
  scenes: Scene[];
  insertAfterShotId: string | undefined;
  selectedShotId: string;
  insertKind: "transition" | "shot" | "scene";
  insertBrief: string;
  onSelectInsertCut: (shotId: string | undefined) => void;
  onChangeKind: (kind: "transition" | "shot" | "scene") => void;
  onChangeBrief: (brief: string) => void;
}) {
  const anchorShot = shots.find((shot) => shot.id === insertAfterShotId) ?? shots.find((shot) => shot.id === selectedShotId) ?? shots[0];
  const anchorScene = anchorShot ? scenes.find((scene) => scene.id === anchorShot.sceneId) : undefined;
  return (
    <section className="edit-insert-sidebar" aria-label="Chèn tại điểm cắt">
      <div className="panel-head">
        <span>Chèn tại điểm cắt</span>
        <span className="insert-panel-anchor"><strong>{anchorShot ? `Sau SH${anchorShot.order}` : "Chọn điểm cắt"}</strong><button type="button" className="rail-help" title="Chọn vị trí rồi mô tả ngắn cảnh hoặc shot cần chèn; hệ thống giữ continuity của shot trước." aria-label="Trợ giúp chèn tại điểm cắt"><CircleHelp size={14}/></button></span>
      </div>
      <label>Vị trí cắt<select aria-label="Vị trí điểm cắt" value={anchorShot?.id ?? ""} onChange={(event) => onSelectInsertCut(event.target.value || undefined)}>
        {shots.map((shot) => <option key={shot.id} value={shot.id}>Sau SH{shot.order} · {shot.durationSec}s</option>)}
      </select></label>
      <div className="insert-kind-tabs" role="group" aria-label="Loại nội dung chèn">
        {[
          { value: "transition", label: "Chuyển cảnh", icon: Route },
          { value: "shot", label: "Shot mới", icon: Film },
          { value: "scene", label: "Cảnh mới", icon: Clapperboard }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button type="button" aria-label={`Chọn loại ${item.label.toLowerCase()}`} aria-pressed={insertKind === item.value} className={insertKind === item.value ? "active" : ""} key={item.value} onClick={() => onChangeKind(item.value as typeof insertKind)}>
              <Icon size={14} />
              {item.label}
            </button>
          );
        })}
      </div>
      <label>Mô tả<textarea aria-label="Mô tả nội dung chèn" value={insertBrief} onChange={(event) => onChangeBrief(event.target.value)} placeholder={insertKind === "transition" ? "Mô tả chuyển động nối, match cut, dissolve hoặc nhịp hình giữa hai shot." : insertKind === "shot" ? "Mô tả shot cần thêm và vị trí của nó trong cảnh." : "Mô tả mục tiêu, bối cảnh và nhịp hình đầu tiên của cảnh mới."} /></label>
      <div className="insert-field-grid">
        <label>Thời lượng<input aria-label="Thời lượng nội dung chèn" value={insertKind === "transition" ? 1 : 3} type="number" min={1} max={10} readOnly /></label>
        <label>Tỉ lệ<input aria-label="Tỉ lệ khung hình nội dung chèn" value="9:16" readOnly /></label>
      </div>
      <label>Giữ continuity<input aria-label="Hướng dẫn continuity nội dung chèn" value={anchorScene?.title ? `Giữ continuity với ${anchorScene.title}` : "Giữ nhân vật, trang phục, bảng màu và logic camera."} readOnly /></label>
      <p className="rail-note" role="status">Chèn shot/cảnh đang để chờ; phần dựng hiện tại chỉ cho phép chọn điểm cắt và ghi brief để chuẩn bị.</p>
      <button aria-label="Tạo bản nháp nội dung chèn" className="primary" type="button" disabled title="Tính năng tạo nội dung chèn sẽ được bật sau khi hoàn thiện luồng dựng riêng."><Wand2 size={15} /> Tạo nội dung chèn</button>
      <button aria-label="Thêm điểm cắt chờ" type="button" disabled title="Tính năng thêm điểm cắt chờ sẽ được bật sau khi hoàn thiện luồng dựng riêng."><Plus size={15} /> Thêm điểm cắt chờ</button>
    </section>
  );
}

function QueueJobRow({ job, providers, shots, selectedShotId, isResolved, onFocusJob, duplicateCount = 1 }: {
  job: AutomationJob;
  providers: BrowserProviderAdapter[];
  shots: Shot[];
  selectedShotId: string;
  isResolved: (job: AutomationJob) => boolean;
  onFocusJob: (job: AutomationJob) => void;
  duplicateCount?: number;
}) {
  const provider = providers.find((item) => item.id === job.providerId);
  const task = productionTaskPresentation(job);
  const shot = job.shotId ? shots.find((item) => item.id === job.shotId) : undefined;
  const progress = typeof job.progress === "number" ? Math.max(0, Math.min(1, job.progress)) : undefined;
  const resolved = isResolved(job);
  const supersededFailure = job.status === "cancelled" && job.supersededFromStatus?.startsWith("failed");
  const rawDetail = supersededFailure ? job.supersededError || job.statusMessage || job.jobType : job.status.startsWith("failed") || jobNeedsUserAction(job) ? job.error || job.statusMessage || job.jobType : job.statusMessage || job.error || job.jobType;
  const detail = userFacingJobMessage(rawDetail);
  return <button type="button" aria-label={`${shot ? `SH${shot.order} · ` : ""}${task.label}${duplicateCount > 1 ? ` · ${duplicateCount} tác vụ cùng vấn đề` : ""}`} className={`job-row tone-${task.tone} ${isActiveJob(job) ? "active" : ""} ${job.status.startsWith("failed") && !resolved ? "failed" : ""} ${shot?.id === selectedShotId ? "selected" : ""}`} key={job.id} onClick={() => onFocusJob(job)}>
    <div>
      {isActiveJob(job) ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
      <strong>{shot ? `SH${shot.order} · ${task.label}` : task.label}{duplicateCount > 1 ? ` · ${duplicateCount} tác vụ` : ""}</strong>
      <span>{duplicateCount > 1 ? `${detail} · cùng một vấn đề lặp lại` : detail}</span>
      <small>{provider?.name ?? "Định tuyến AI"} · {new Date(job.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>
    </div>
    <em>{supersededFailure ? "Lỗi · Đã hủy" : resolved ? `Đã xử lý · từng ${statusLabel(job.status)}` : taskStatusLabel(task.tone)}</em>
    {isActiveJob(job) && progress !== undefined ? <i style={{ width: `${Math.round(progress * 100)}%` }} /> : null}
  </button>;
}

export function QueuePanel({
  jobs,
  providers,
  shots,
  selectedShotId,
  retryableJob,
  resolvedVideoShotIds,
  resolvedJobIds,
  onSelectShot,
  onFocusJob,
  onCancelProjectJobs,
  onRetryJob
}: {
  jobs: AutomationJob[];
  providers: BrowserProviderAdapter[];
  shots: Shot[];
  selectedShotId: string;
  retryableJob?: AutomationJob;
  resolvedVideoShotIds?: string[];
  resolvedJobIds?: string[];
  onSelectShot: (shotId: string) => void;
  onFocusJob: (job: AutomationJob) => void;
  onCancelProjectJobs: () => void;
  onRetryJob: (job: AutomationJob | undefined) => boolean;
}) {
  const { visibleJobs, historyJobs, orderedJobs, activeCount, failedCount, completedCount, isCurrentWork, isResolved } = deriveQueueSummary(jobs, resolvedVideoShotIds, resolvedJobIds);
  const [historyOpen, setHistoryOpen] = useState(false);
  const latestFailedJob = retryableJob && !isFlowPendingFailure(retryableJob) ? retryableJob : undefined;
  const currentWorkJobs = visibleJobs.filter(isCurrentWork);
  const currentAlertJobs = visibleJobs.filter((job) => !isCurrentWork(job));
  const renderRows = (items: AutomationJob[], groupRepeated = false) => {
    const groups = new Map<string, { job: AutomationJob; count: number }>();
    items.forEach((job) => {
      const raw = job.status.startsWith("failed") || jobNeedsUserAction(job) ? job.error || job.statusMessage || job.jobType : job.statusMessage || job.error || job.jobType;
      const key = groupRepeated ? `${job.jobType}:${userFacingJobMessage(raw)}` : job.id;
      const existing = groups.get(key);
      if (existing) existing.count += 1;
      else groups.set(key, { job, count: 1 });
    });
    return [...groups.values()].map(({ job, count }) => <QueueJobRow key={job.id} job={job} providers={providers} shots={shots} selectedShotId={selectedShotId} isResolved={isResolved} onFocusJob={onFocusJob} duplicateCount={count} />);
  };
  return (
    <div className="queue panel activity-log" aria-live="polite">
      <div className="panel-head">
        <span>Theo dõi tác vụ</span>
        <strong>{activeCount ? `${activeCount} đang chạy` : visibleJobs.length ? `${visibleJobs.length} cần theo dõi` : "Đang chờ"}</strong>
      </div>
      <div className="activity-summary">
        <span><Loader2 size={13} /> {activeCount} đang chạy</span>
        <span><Check size={13} /> {completedCount} hoàn tất</span>
        <span><AlertTriangle size={13} /> {failedCount} cần xử lý hiện tại</span>
        {activeCount ? <button type="button" onClick={onCancelProjectJobs}><X size={13} /> Hủy tác vụ đang chạy</button> : null}
        {orderedJobs.find(isActiveJob) ? <button type="button" onClick={() => onFocusJob(orderedJobs.find(isActiveJob)!)}><Route size={13} /> Xem tác vụ đang chạy</button> : null}
        {latestFailedJob ? <button type="button" onClick={() => onRetryJob(latestFailedJob)}><RefreshCcw size={13} /> Thử lại lỗi gần nhất</button> : null}
      </div>
      <div className="job-list">
        {currentWorkJobs.length ? <section className="queue-current-section" aria-label="Tác vụ đang hoạt động"><h3>Đang hoạt động <span>{currentWorkJobs.length}</span></h3>{renderRows(currentWorkJobs)}</section> : null}
        {currentAlertJobs.length ? <section className="queue-current-section queue-alert-section" aria-label="Cảnh báo cần xử lý hiện tại"><h3>Cần xử lý hiện tại <span>{currentAlertJobs.length}</span></h3>{renderRows(currentAlertJobs, true)}{new Set(currentAlertJobs.map((job) => { const raw = job.status.startsWith("failed") || jobNeedsUserAction(job) ? job.error || job.statusMessage || job.jobType : job.statusMessage || job.error || job.jobType; return `${job.jobType}:${userFacingJobMessage(raw)}`; })).size < currentAlertJobs.length ? <small className="queue-alert-group-note">Các lỗi giống nhau đã được gom lại; mở lịch sử để xem từng tác vụ.</small> : null}</section> : null}
        {visibleJobs.length === 0 ? (
          <div className="empty-row">Không có tác vụ đang chạy hoặc lỗi cần xử lý.</div>
        ) : null}
        {historyJobs.length ? <details className="job-history" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
          <summary className="job-history-label"><span>Lịch sử trước đó</span><span>{historyJobs.length} tác vụ</span><ChevronRight size={14} /></summary>
          {historyOpen ? <div className="job-history-rows">{historyJobs.map((job) => <QueueJobRow key={job.id} job={job} providers={providers} shots={shots} selectedShotId={selectedShotId} isResolved={isResolved} onFocusJob={onFocusJob} />)}</div> : null}
        </details> : null}
      </div>
    </div>
  );
}

function isFlowPendingFailure(job: AutomationJob): boolean {
  if (job.providerId !== "google-flow-web") return false;
  return /flow|slate|prompt editor|picker|visual reference|component preflight/i.test(`${job.error || ""} ${job.statusMessage || ""}`);
}
