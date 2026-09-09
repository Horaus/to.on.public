import {
  ClipboardList,
  Send,
  Workflow
} from "lucide-react";
import { useStudioApplicationContext } from "../studio-application-context";
import { QueuePanel } from "../views/insert-queue-views";
import { flowConnectionSummary, flowProjectTabIsReady } from "../studio-application-composition";
import { shotKeyframeAssets } from "@studio/workflow/media-asset-selectors";

export function GenerateScreen() {
  const { bridgeCount, bridgeStatus, bridgeVersionLabel, cancelCurrentProjectAutomation, goTo, projectBlockedJobs, projectJobs, projectResolvedFailureJobIds, projectShots, queueVideoJob, retryAutomationJob, runBatchQueue, runWorkflowTemplate, selectedShot, setSelectedShotId, shotHasVisibleVideo, state, updateProjectPatch } = useStudioApplicationContext();
  const retryableBlockedJob = projectBlockedJobs.find((job) => job.status === "failed_retryable" && !/SCREENPLAY_RUNTIME_OVERFLOW\b/i.test(`${job.error || ""} ${job.statusMessage || ""}`));
  const flowSummary = flowConnectionSummary(bridgeStatus);
  const flowReady = flowProjectTabIsReady(bridgeStatus);
  const selectedShotHasKeyframe = projectShots.length > 0 && shotKeyframeAssets(state.assets, selectedShot, state.jobs).length > 0;
  const flowPendingFailure = projectBlockedJobs.some((job) => job.providerId === "google-flow-web" && /flow|slate|prompt editor|picker|visual reference|component preflight/i.test(`${job.error || ""} ${job.statusMessage || ""}`));
  const videoActionDisabled = bridgeCount <= 0 || !flowReady || flowPendingFailure || !selectedShotHasKeyframe;
  const batchActionDisabled = bridgeCount <= 0 || !flowReady || flowPendingFailure || !projectShots.length;
  const referenceState = !projectShots.length
    ? "Chưa có shot để gửi ảnh. Hoàn tất screenplay và phân rã shot trước."
    : !selectedShotHasKeyframe
      ? `SH${selectedShot.order} chưa có keyframe/ảnh đầu vào. Tạo khung hình trước khi tạo video.`
      : `SH${selectedShot.order} đã có keyframe; ảnh sẽ được chuyển qua tiện ích khi Flow sẵn sàng.`;
  const flowReadinessHint = flowSummary.flowEditorToolOpen
    ? "Flow đang mở bản chỉnh sửa. Bấm Xong để trở về dự án, rồi giữ đúng một dự án Flow."
    : flowSummary.flowCustomToolTabCount > 0
      ? "Flow đang còn tab công cụ cũ. Đóng tab đó rồi giữ lại một dự án Flow."
      : flowSummary.flowHasDuplicateTabs
        ? `Flow đang có tab trùng (dự án ${flowSummary.flowWorkspaceTabCount}, công cụ phụ ${flowSummary.flowRuntimeToolCount}). Đóng tab dư rồi giữ một dự án Flow.`
        : "Mở một dự án Flow đang đăng nhập rồi làm mới trạng thái.";
  return (<section className="view generate-view">
                <div className="view-intro compact">
                  <div>
                    <h2>Tiến trình sản xuất</h2>
                    <p>Theo dõi tác vụ đang chạy, lỗi cần xử lý và kết quả đã tạo.</p>
                  </div>
                  <div className="inline-actions">
                    <button type="button" aria-label="Xếp hàng loạt" title={batchActionDisabled ? "Chỉ xếp hàng khi Flow đã sẵn sàng và project có shot." : "Xếp các shot đủ điều kiện theo thứ tự"} disabled={batchActionDisabled} onClick={runBatchQueue}><ClipboardList size={16} /> Xếp hàng loạt</button>
                    <button type="button" aria-label="Chạy mẫu" onClick={runWorkflowTemplate}><Workflow size={16} /> Chạy mẫu</button>
                    <button type="button" aria-label={videoActionDisabled ? "Tạo video — Flow chưa sẵn sàng" : "Tạo video"} title={videoActionDisabled ? (flowPendingFailure ? "Flow đang chờ xử lý lỗi; mở nhật ký để xem hướng dẫn." : referenceState) : "Tạo video cho shot đang chọn"} className="primary" disabled={videoActionDisabled} onClick={() => queueVideoJob(selectedShot)}><Send size={16} /> {videoActionDisabled && bridgeCount > 0 && (!flowReady || flowPendingFailure) ? "Tạo video · Flow đang chờ" : "Tạo video"}</button>
                  </div>
                </div>
                <div className="bridge-banner" role="status" aria-live="polite">
                  <div className={`connection-dot ${bridgeCount > 0 ? bridgeStatus.updateRequired ? "warning" : "online" : ""}`} />
                  <div>
                    <strong>{bridgeCount > 0 && !flowReady
                      ? "Flow chưa sẵn sàng"
                      : bridgeCount > 0
                      ? bridgeStatus.updateRequired
                        ? "Cần cập nhật kết nối tự động"
                        : "Tự động hóa đã sẵn sàng"
                      : "Chưa kết nối tự động hóa"}</strong>
                    <span>{bridgeCount > 0 && !flowReady
                      ? flowReadinessHint
                      : bridgeCount > 0
                      ? bridgeStatus.updateRequired
                        ? `Tiện ích v${bridgeVersionLabel} · cần v${bridgeStatus.expectedVersion} trước khi chạy tác vụ mới.`
                        : `Tiện ích v${bridgeVersionLabel} · tác vụ sẽ mở trong các tab công cụ đang đăng nhập.`
      : "Đang ở chế độ mô phỏng; cài tiện ích trình duyệt để tự động hóa các công cụ đã chọn."}</span>
                    <small className="bridge-reference-state">{referenceState}</small>
                  </div>
                </div>
                <QueuePanel jobs={projectJobs} providers={state.providers} shots={projectShots} selectedShotId={selectedShot.id} retryableJob={retryableBlockedJob} resolvedVideoShotIds={projectShots.filter((shot) => shotHasVisibleVideo(shot.id)).map((shot) => shot.id)} resolvedJobIds={projectResolvedFailureJobIds} onSelectShot={setSelectedShotId} onFocusJob={(job) => { if (job.shotId) setSelectedShotId(job.shotId); updateProjectPatch({ productionGraphFocusDocumentId: job.shotId ? `output:${job.shotId}:${job.jobType === "video" ? "video" : "image"}` : undefined }); goTo("generate"); }} onCancelProjectJobs={() => cancelCurrentProjectAutomation()} onRetryJob={retryAutomationJob} />
              </section>);
}
