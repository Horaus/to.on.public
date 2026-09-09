import {
  Check,
  ChevronRight, Clock3,
  AlertTriangle,
  RefreshCcw
} from "lucide-react";
import { useStudioApplicationContext } from "../studio-application-context";
import { statusLabel } from "@studio/renderer-core/ui-format";
import { productionTaskPresentation, taskStageLabel } from "../core/task-presentation";
import { Metric } from "../views/overview-components";
import { flowConnectionSummary, flowProjectTabIsReady } from "../studio-application-composition";
import { canonicalFlowConnection } from "../core/flow-connection-identity";

export function OverviewScreen() {
  const { actionNeededJobs, bridgeStatus, goTo, pipelineStep, pipelineSteps, project, projectBlockedJobs, projectBusyJobs, projectShots, projectStats, recentProjectJobs, shotHasVisibleVideo, sourceReadyCount, state, t } = useStudioApplicationContext();
  const flowSummary = flowConnectionSummary(bridgeStatus);
  const canonicalFlow = canonicalFlowConnection(bridgeStatus);
  const flowReady = flowProjectTabIsReady(bridgeStatus);
  const flowHealthLabel = !bridgeStatus.connectedExtensions
    ? "Chưa kết nối tiện ích"
    : flowReady
      ? "Sẵn sàng"
      : flowSummary.flowEditorToolCount > 0
        ? "Bấm Xong trong Flow"
        : flowSummary.flowWorkspaceTabCount === 0
          ? "Cần mở project Flow"
          : "Cần kiểm tra Flow";
  const flowHealthDetail = !bridgeStatus.connectedExtensions
    ? "Mở tiện ích trình duyệt để tiếp tục."
    : flowReady
      ? canonicalFlow.selected && canonicalFlow.otherConnectionCount > 0
        ? `Đã khóa 1:1 vào phiên ${canonicalFlow.identitySuffix} đang sở hữu tab Flow; ${canonicalFlow.otherConnectionCount} kết nối khác không nhận job này.`
        : "Project Flow đã sẵn sàng để tạo video."
      : flowSummary.flowEditorToolCount > 0
        ? "Thoát bản chỉnh sửa để trở về project Flow."
        : flowSummary.flowWorkspaceTabCount === 0
          ? "Mở một project Flow đang đăng nhập."
        : "Kiểm tra lại project Flow đang mở.";
  const sequenceQa = project.storyDocument?.sequenceQA;
  const sequenceQaNeedsAttention = sequenceQa?.status === "BLOCKED" || sequenceQa?.status === "REVISE";
  const sequenceQaLabel = sequenceQa?.status === "BLOCKED" ? "QA đang chặn" : "Cần rà soát";
  const sequenceQaDetail = sequenceQa?.status === "BLOCKED"
    ? "Một số shot chưa đạt kiểm tra nhịp dựng; hãy mở Kịch bản để sửa."
    : `${sequenceQa?.findings?.length || 0} cảnh báo nhịp dựng; có thể tiếp tục nhưng nên rà soát trước khi xuất bản.`;
  return (<section className="view overview-view">
                <div className="overview-dashboard">
                  <section className="overview-control">
                    <div className="overview-control-main">
                      <span className="eyebrow">ĐIỀU KHIỂN SẢN XUẤT</span>
                      <h2>{project.name}</h2>
                      <p>{project.description || project.sourceDraft || "Nhập brief ở thanh bên phải rồi chạy từng bước hoặc toàn bộ quy trình. Hệ thống sẽ dừng khi cần đăng nhập, thiếu kết quả hoặc có lỗi."}</p>
                    </div>
                  </section>
                  <div className="overview-metrics">
                    <Metric label="Cảnh" value={projectStats.sceneCount} />
                    <Metric label="Shot" value={projectStats.shotCount} />
                    <Metric label="Tài nguyên" value={projectStats.assetCount} />
                    <Metric label="Tác vụ" value={projectStats.jobCount} />
                    <Metric label="Video có" value={projectShots.filter((shot) => shotHasVisibleVideo(shot.id)).length} />
                    <Metric label="Nguồn sẵn sàng" value={sourceReadyCount} />
                  </div>
                  <div className="overview-grid">
                    <section className="overview-panel pipeline-map">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">BẢN ĐỒ TỰ ĐỘNG</span>
                          <h3>{pipelineSteps.filter((item) => item.ready).length}/{pipelineSteps.length} sẵn sàng</h3>
                        </div>
                      </div>
                      <div className="pipeline-step-list">
                        {pipelineSteps.map((step) => {
                          const current = pipelineStep === step.id;
                          const blocked = current && projectBlockedJobs.length > 0;
                          const running = current && projectBusyJobs.length > 0;
                          const status = step.ready ? "Sẵn sàng" : blocked ? "Cần xử lý" : running ? "Đang chạy" : current ? "Tiếp theo" : "Đang chờ";
                          return (
                          <button type="button" key={step.id} className={`${step.ready ? "ready" : ""} ${current ? "current" : ""} ${blocked ? "blocked" : ""}`} onClick={() => goTo(step.view)} aria-label={`${step.label} · ${status}`}>
                            <span>{step.ready ? <Check size={15} /> : blocked ? <AlertTriangle size={15} /> : running || current ? <RefreshCcw size={15} /> : <Clock3 size={15} />}</span>
                            <strong>{step.label}</strong>
                            <small>{status}</small>
                          </button>
                          );
                        })}
                      </div>
                    </section>
                    <section className="overview-panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">SỨC KHỎE</span>
                          <h3>Trạng thái dự án</h3>
                        </div>
                      </div>
                      <div className="health-list">
                        <div className={projectBlockedJobs.length ? "warning" : "ok"}><strong>{projectBlockedJobs.length}</strong><span>Đang chặn bước hiện tại</span></div>
                        <div className={actionNeededJobs.length ? "warning" : "ok"}><strong>{actionNeededJobs.length}</strong><span>Cần xem lại</span></div>
                        <div className={bridgeStatus.connectedExtensions ? "ok" : "warning"}><strong>{bridgeStatus.connectedExtensions}</strong><span>Extension trình duyệt</span></div>
                        <div className={flowReady ? "ok" : "warning"} role="status" aria-live="polite"><strong className="health-text">{flowHealthLabel}</strong><span>{flowHealthDetail}</span></div>
                        {sequenceQaNeedsAttention ? <div className="warning" role="status" aria-live="polite"><strong className="health-text">{sequenceQaLabel}</strong><span>{sequenceQaDetail}</span></div> : null}
                        <div className={sourceReadyCount ? "ok" : "idle"}><strong>{sourceReadyCount}</strong><span>Nguồn sẵn sàng</span></div>
                      </div>
                    </section>
                    <section className="overview-panel overview-activity-panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">TÁC VỤ GẦN ĐÂY</span>
                          <h3>Hoạt động tự động</h3>
                        </div>
                          <button type="button" aria-label="Mở log hoạt động tự động" onClick={() => goTo("generate")}>Mở log<ChevronRight size={14} /></button>
                      </div>
                      <div className="recent-list">
                        {recentProjectJobs.length ? recentProjectJobs.map((job) => (
                          <button type="button" key={job.id || Math.random()} onClick={() => goTo("generate")} aria-label={`Mở log ${productionTaskPresentation(job).label} · ${statusLabel(job.status)} · ${job.id?.slice(-6) || ''}`}>
                            <span><strong>{productionTaskPresentation(job).label}</strong><small>{taskStageLabel(productionTaskPresentation(job).stage)} · {state.providers.find((provider) => provider.id === job.providerId)?.name || "Định tuyến AI"} · {statusLabel(job.status)}</small></span>
                            <em>{new Date(job.updatedAt).toLocaleDateString()}</em>
                          </button>
                        )) : <div className="empty-row">Chưa có hoạt động từ provider.</div>}
                      </div>
                    </section>
                  </div>
                </div>
              </section>);
}
