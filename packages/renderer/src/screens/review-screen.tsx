import { AlertTriangle } from "lucide-react";
import { useStudioApplicationContext } from "../studio-application-context";
import { EditPanel } from "../views/edit-panel-view";

export function ReviewScreen() {
  const { editInsertAfterShotId, editSequenceModel, project, projectAssets, projectScenes, projectShots, replaceState, saveVideoReviewFrame, selectedShot, setEditInsertAfterShotId, setSelectedShotId, state, storyboardAspectRatio, updateVideoReview } = useStudioApplicationContext();
  const sequenceQa = project.storyDocument?.sequenceQA;
  const sequenceQaNeedsAttention = sequenceQa?.status === "BLOCKED" || sequenceQa?.status === "REVISE";
  return (<section className="view review-view">
                <div className="view-intro">
                  <div>
                    <span className="eyebrow">Khu chỉnh sửa</span>
                    <h2>Xem trước, cắt và lấp khoảng trống trong chuỗi.</h2>
                    <p>Video đã tạo được phát theo clip; shot chưa có video vẫn giữ thời lượng kịch bản bằng khung chờ.</p>
                  </div>
                </div>
                {sequenceQaNeedsAttention ? <div className={`sequence-qa-banner ${sequenceQa?.status === "BLOCKED" ? "blocked" : "revise"}`} role="status" aria-live="polite"><AlertTriangle size={16} /><div><strong>{sequenceQa?.status === "BLOCKED" ? "QA đang chặn bản dựng" : "Bản dựng có cảnh báo cần rà soát"}</strong><span>{sequenceQa?.status === "BLOCKED" ? "Sửa các shot được đánh dấu trong Kịch bản trước khi xuất bản bản cuối." : `${sequenceQa?.findings?.length || 0} cảnh báo nhịp dựng; hiện không chặn xuất bản nếu các clip vẫn hợp lệ.`}</span></div></div> : null}
                <EditPanel
                  shots={projectShots}
                  scenes={projectScenes}
                  assets={projectAssets}
                  jobs={state.jobs}
                  selectedShotId={selectedShot.id}
                  onSelectShot={setSelectedShotId}
                  insertAfterShotId={editInsertAfterShotId}
                  onSelectInsertCut={setEditInsertAfterShotId}
                  sequenceModel={editSequenceModel}
                  onUpdateSequence={async (editSequence) => {
                    if (!window.studioBridge) return;
                    replaceState(await window.studioBridge.updateProject(project.id, { editSequence }));
                  }}
                  onGenerateSoundBed={async (payload) => {
                    if (!window.studioBridge) return;
                    replaceState(await window.studioBridge.generateSoundBed({ projectId: project.id, ...payload }));
                  }}
                  onSaveVideoReviewFrame={saveVideoReviewFrame}
                  onUpdateVideoReview={updateVideoReview}
                  finalExportAllowed={sequenceQa?.status !== "BLOCKED"}
                  finalExportBlockReason={sequenceQa?.status === "BLOCKED" ? "QA đang chặn bản cuối. Mở Kịch bản, sửa các shot được đánh dấu rồi quay lại xuất bản." : undefined}
                  exportJobs={state.jobs.filter((job) => job.projectId === project.id && job.jobType === "export")}
                  onExportSequence={async (draft) => {
                    if (!window.studioBridge) return;
                    replaceState(await window.studioBridge.exportSequence({ projectId: project.id, draft, width: storyboardAspectRatio === "16:9" ? 1920 : 1080, height: storyboardAspectRatio === "16:9" ? 1080 : 1920, frameRate: 30 }));
                  }}
                  onCancelExport={async (jobId) => {
                    if (!window.studioBridge) return;
                    replaceState(await window.studioBridge.cancelExport(jobId));
                  }}
                />
              </section>);
}
