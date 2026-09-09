import {
  BadgeCheck,
  ChevronLeft, ChevronRight,
  Download,
  Film,
  MessageSquare,
  Pause, Play, Plus,
  Scissors, SkipBack, SkipForward,
  Trash2
} from "lucide-react";
import React from "react";
import { useEffect, useState } from "react";
import type { VideoEditorialCheckKey, VideoEditorialReview } from "@studio/types";
import { shotKeyframeAssets, shotVideoAssets } from "@studio/workflow/media-asset-selectors";
import { finiteInputNumber, imagePreviewSrc } from "@studio/renderer-core/production-ui-support";
import { formatLabel, userFacingJobMessage } from "@studio/renderer-core/ui-format";

const audioMixLabels = {
  sourceGain: "Âm thanh nguồn",
  dialogueGain: "Thoại",
  voiceoverGain: "Lồng tiếng",
  ambienceGain: "Không khí",
  musicGain: "Nhạc",
} as const;

const audioClipLabels: Record<string, string> = {
  dialogue: "Thoại",
  internal_voice: "Lồng tiếng",
  narration: "Lời dẫn",
  recording: "Bản ghi",
  ambience: "Không khí",
  sound_effect: "Hiệu ứng",
  music: "Nhạc",
};

const audioClipLabel = (kind: string) => audioClipLabels[kind] ?? formatLabel(kind);

const editorialCheckLabels: Record<VideoEditorialCheckKey, string> = {
  dominantActionFulfilled: "Hành động chính đúng",
  noForbiddenInvention: "Không thêm chi tiết ngoài kịch bản",
  identityWardrobeStable: "Nhân vật và trang phục ổn định",
  propStateCorrect: "Trạng thái đạo cụ đúng",
  geographyCorrect: "Không gian và vị trí đúng",
  durationValid: "Thời lượng hợp lệ",
  speechDeliveryCorrect: "Thoại/lồng tiếng đúng",
  handoffFramesMatch: "Khung đầu/cuối khớp continuity"
};
const editorialCheckKeys = Object.keys(editorialCheckLabels) as VideoEditorialCheckKey[];


import { useEditPanelModel } from "./edit-panel-model";
type EditPanelViewProps = { model: ReturnType<typeof useEditPanelModel> };
export function EditPanel(props: Omit<Parameters<typeof useEditPanelModel>[0], "selectShotKeyframes" | "selectShotVideos">) {
  return <EditPanelView model={useEditPanelModel({ ...props, selectShotKeyframes: shotKeyframeAssets, selectShotVideos: shotVideoAssets })} />;
}

function VideoEditorialReviewPanel({ selectedVideo, previewVideoRef, onSaveVideoReviewFrame, onUpdateVideoReview }: { selectedVideo: any; previewVideoRef: React.RefObject<HTMLVideoElement | null>; onSaveVideoReviewFrame: (payload: { assetId: string; kind: "first" | "last"; dataUrl: string; timeSeconds: number }) => Promise<void>; onUpdateVideoReview: (assetId: string, review: Omit<VideoEditorialReview, "reviewedAt">) => Promise<void> }) {
  const review = selectedVideo?.metadata?.editorialReview as VideoEditorialReview | undefined;
  const reviewFrames = selectedVideo?.metadata?.reviewFrames as { first?: { url?: string }; last?: { url?: string } } | undefined;
  const [checks, setChecks] = useState<Record<VideoEditorialCheckKey, boolean>>(() => Object.fromEntries(editorialCheckKeys.map((key) => [key, false])) as Record<VideoEditorialCheckKey, boolean>);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setChecks(Object.fromEntries(editorialCheckKeys.map((key) => [key, review?.checks?.[key] === true])) as Record<VideoEditorialCheckKey, boolean>); setReason(review?.reason || ""); setError(""); }, [selectedVideo?.id, review?.reviewedAt]);
  const capture = async (kind: "first" | "last") => {
    const video = previewVideoRef.current; if (!video) return;
    setError("");
    try {
      const target = kind === "first" ? 0 : Math.max(0, (Number.isFinite(video.duration) ? video.duration : Number(selectedVideo.durationSeconds || 1)) - 0.05);
      if (Math.abs(video.currentTime - target) > 0.01) await new Promise<void>((resolve) => { const done = () => { video.removeEventListener("seeked", done); resolve(); }; video.addEventListener("seeked", done, { once: true }); video.currentTime = target; });
      if (!video.videoWidth || !video.videoHeight) throw new Error("Video chưa sẵn sàng để chụp khung.");
      const canvas = document.createElement("canvas"); const scale = Math.min(1, 720 / video.videoWidth); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale)); const context = canvas.getContext("2d"); if (!context) throw new Error("Không thể đọc khung video."); context.drawImage(video, 0, 0, canvas.width, canvas.height);
      await onSaveVideoReviewFrame({ assetId: selectedVideo.id, kind, dataUrl: canvas.toDataURL("image/jpeg", 0.84), timeSeconds: target });
    } catch (cause) { setError(userFacingJobMessage(cause instanceof Error ? cause.message : String(cause))); }
  };
  const submit = async (status: "accepted" | "rejected") => { setBusy(true); setError(""); try { await onUpdateVideoReview(selectedVideo.id, { status, checks, reviewer: "User review", reason, evidence: [], promptVersion: String(selectedVideo.metadata?.promptVersion || selectedVideo.sourceJobId || "unknown") }); } catch (cause) { setError(userFacingJobMessage(cause instanceof Error ? cause.message : String(cause))); } finally { setBusy(false); } };
  const allChecks = editorialCheckKeys.every((key) => checks[key]); const framesReady = Boolean(reviewFrames?.first?.url && reviewFrames?.last?.url);
  return <section className="video-editorial-review" aria-label="Rà soát video đang chọn"><details className="optional-video-review" open={review?.status === "accepted" || review?.status === "rejected"}><summary><span>Rà soát video (tuỳ chọn)</span><strong>{review?.status === "accepted" ? "Đã chấp nhận" : review?.status === "rejected" ? "Đã từ chối" : "Chưa rà soát"}</strong></summary><div className="video-editorial-review-head"><div><span>RÀ SOÁT VIDEO</span><p>Chỉ mở khi bạn muốn kiểm tra hoặc ghi chú; không phải bước bắt buộc để dựng.</p></div><div className="video-review-boundaries"><button type="button" onClick={() => void capture("first")} disabled={busy}>Chụp khung đầu</button><button type="button" onClick={() => void capture("last")} disabled={busy}>Chụp khung cuối</button></div></div><div className="video-review-frame-status"><span className={reviewFrames?.first?.url ? "ready" : ""}>Khung đầu {reviewFrames?.first?.url ? "đã lưu" : "chưa lưu"}</span><span className={reviewFrames?.last?.url ? "ready" : ""}>Khung cuối {reviewFrames?.last?.url ? "đã lưu" : "chưa lưu"}</span></div><div className="video-review-checklist">{editorialCheckKeys.map((key) => <label key={key}><input type="checkbox" checked={checks[key]} onChange={(event) => setChecks((current) => ({ ...current, [key]: event.target.checked }))} /><span>{editorialCheckLabels[key]}</span></label>)}</div><div className="video-review-decision"><label>Lý do / ghi chú<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ghi chú ngắn cho quyết định kiểm tra; bắt buộc nếu từ chối." /></label><div><button type="button" className="primary" title={!allChecks || !framesReady ? "Cần hoàn tất checklist và chụp đủ khung đầu/cuối." : undefined} onClick={() => void submit("accepted")} disabled={busy || !allChecks || !framesReady}>Chấp nhận video</button><button type="button" className="danger" title={!reason.trim() ? "Nhập lý do hoặc ghi chú trước khi từ chối video." : undefined} onClick={() => void submit("rejected")} disabled={busy || !reason.trim()}>Từ chối video</button></div></div>{!allChecks || !framesReady ? <small className="video-review-hint">Để chấp nhận: hoàn tất {editorialCheckKeys.filter((key) => !checks[key]).length} tiêu chí còn lại và chụp đủ hai khung biên.</small> : null}{error ? <p className="video-review-error" role="alert">{error}</p> : null}</details></section>;
}

export function EditPanelView({ model }: EditPanelViewProps) { const { activeExport, advancePlayback, approvedCount, assets, audioClips, audioElementRefs, audioMix, autoAdvancePlayRef, beginClipDrag, beginPlayheadDrag, beginTrim, canRedo, canUndo, clampedPlayheadSec, clips, deleteSelectedClip, duplicateSelectedClip, exportError, finalExportBlockReason, finalExportEligible, generateSoundBed, itemForClip, latestExport, masterAsset, moveSelectedBy, nudgeAudioClip, onCancelExport, onSelectInsertCut, onUpdateSequence, pendingAutoPlayClipIdRef, previewVideoRef, redo, requestExport, seekTo, selectedClip, selectedIndex, selectedItem, selectedVideo, sequenceModel, sequencePlaying, sequencePlayingRef, setSequencePlaying, setSoundBedDurationSec, setSoundBedGain, setSoundBedKind, setSoundBedStartSec, shots, soundBedBusy, soundBedDurationSec, soundBedError, soundBedGain, soundBedKind, soundBedStartSec, splitSelectedClip, timelineUnit, timelineViewportRef, timelineWidth, totalDuration, totalPlannedDuration, totalSourceDuration, undo, unacceptedClips, updatePlaybackPosition, videoCount } = model; const timecodeSeconds = Math.floor(clampedPlayheadSec); const timecodeFrame = Math.min(29, Math.floor((clampedPlayheadSec - timecodeSeconds) * 30)); return ((
  <div className={`edit-bay ${selectedVideo ? "has-review" : ""}`}>
      <section className="edit-preview-panel">
        <div className="edit-preview">
          {selectedVideo ? (
            <video ref={previewVideoRef} data-clip-id={selectedClip?.id} key={`${selectedVideo.id}:${selectedClip?.id}`} src={selectedVideo.filePath} poster={imagePreviewSrc(selectedItem.image)} crossOrigin="anonymous" controls autoPlay={autoAdvancePlayRef.current} playsInline onPlay={() => { pendingAutoPlayClipIdRef.current = undefined; sequencePlayingRef.current = true; autoAdvancePlayRef.current = true; setSequencePlaying(true); }} onTimeUpdate={(event) => updatePlaybackPosition(event.currentTarget)} onEnded={(event) => advancePlayback(event.currentTarget)} />
          ) : selectedItem?.image ? (
            <img src={imagePreviewSrc(selectedItem.image)} alt={`Khung hình mở đầu SH${selectedItem.shot.order}`} />
          ) : (
            <div className="edit-preview-empty"><Film size={34} /><span>Cảnh quay này chưa có nội dung được tạo.</span></div>
          )}
        </div>
        <div className="edit-preview-meta">
          <div>
            <span>Xem trước chuỗi dựng</span>
            <strong>{selectedItem ? `SH${selectedItem.shot.order} · ${selectedItem.scene?.title ?? "Cảnh"}` : "Chưa có cảnh quay"}</strong>
          </div>
          <dl>
              <div><dt>Đoạn video</dt><dd>{videoCount}/{clips.length}</dd></div>
            <div><dt>Video có sẵn</dt><dd>{approvedCount}/{shots.length}</dd></div>
            <div><dt>Dự kiến</dt><dd>{totalPlannedDuration}s</dd></div>
            <div><dt>Nguồn</dt><dd>{Math.round(totalSourceDuration * 10) / 10}s</dd></div>
            <div><dt>Dựng phim</dt><dd>{Math.round(totalDuration * 10) / 10}s</dd></div>
          </dl>
        </div>
      </section>
      {selectedVideo ? <VideoEditorialReviewPanel selectedVideo={selectedVideo} previewVideoRef={previewVideoRef} onSaveVideoReviewFrame={model.onSaveVideoReviewFrame ?? (async () => { throw new Error("Desktop bridge không khả dụng."); })} onUpdateVideoReview={model.onUpdateVideoReview ?? (async () => { throw new Error("Desktop bridge không khả dụng."); })} /> : null}
      <section className="edit-timeline-panel">
        <div className="edit-timeline-toolbar">
          <div><span>Dòng thời gian</span><strong>{clips.length} clip · dựng {Math.round(totalDuration * 10) / 10}s</strong></div>
          <div className="edit-tool-buttons" aria-label="Công cụ dòng thời gian">
            <div className="edit-tool-group" aria-label="Xem trước">
              <button type="button" className="tool-primary" disabled={!selectedVideo} title={!selectedVideo ? "Chọn một clip đã có video để phát chuỗi dựng." : sequencePlaying ? "Tạm dừng chuỗi dựng" : "Phát chuỗi dựng"} onClick={() => {
              const video = previewVideoRef.current;
              if (!video) return;
              if (sequencePlaying) { sequencePlayingRef.current = false; autoAdvancePlayRef.current = false; setSequencePlaying(false); video.pause(); }
              else { sequencePlayingRef.current = true; autoAdvancePlayRef.current = true; setSequencePlaying(true); void video.play(); }
              }}>{sequencePlaying ? <Pause size={14} /> : <Play size={14} />} {sequencePlaying ? "Tạm dừng" : "Phát tất cả"}</button>
              <button type="button" title="Lùi một khung (1/30 giây)" aria-label="Lùi một khung" disabled={!selectedVideo} onClick={() => seekTo(Math.max(0, clampedPlayheadSec - 1 / 30))}><SkipBack size={14} /></button>
              <button type="button" title="Tiến một khung (1/30 giây)" aria-label="Tiến một khung" disabled={!selectedVideo} onClick={() => seekTo(Math.min(totalDuration, clampedPlayheadSec + 1 / 30))}><SkipForward size={14} /></button>
            </div>
            <div className="edit-tool-group" aria-label="Cắt clip">
              <button type="button" title="Tách clip đang chọn tại đầu phát" onClick={splitSelectedClip}><Scissors size={14} /> Tách</button>
            </div>
            <div className="edit-tool-group" aria-label="Sắp xếp clip">
              <button type="button" title="Di chuyển clip lên trước" onClick={() => moveSelectedBy(-1)} disabled={selectedIndex <= 0}><ChevronLeft size={14} /> Trước</button>
              <button type="button" title="Di chuyển clip xuống sau" onClick={() => moveSelectedBy(1)} disabled={selectedIndex >= clips.length - 1}>Sau <ChevronRight size={14} /></button>
            </div>
            <div className="edit-tool-group" aria-label="Chỉnh sửa clip">
              <button type="button" title="Chèn bản sao đoạn nguồn đang chọn" onClick={duplicateSelectedClip}><Plus size={14} /> Chèn</button>
              <button type="button" title="Xóa clip dựng, không xóa media nguồn" onClick={deleteSelectedClip} disabled={clips.length <= 1}><Trash2 size={14} /> Xóa</button>
            </div>
            <div className="edit-tool-group edit-history-group" aria-label="Lịch sử chỉnh sửa">
              <button type="button" title="Hoàn tác thao tác vừa làm" onClick={undo} disabled={!canUndo}>Hoàn tác</button>
              <button type="button" title="Làm lại thao tác vừa hoàn tác" onClick={redo} disabled={!canRedo}>Làm lại</button>
            </div>
            <span className="audio-track-count"><MessageSquare size={14} /> {audioClips.length} clip âm thanh</span>
          </div>
        </div>
        <div className="edit-nle" aria-label="Dòng thời gian dựng nhiều lớp">
          <div className="track-timecode">00:00:{String(timecodeSeconds).padStart(2, "0")}:{String(timecodeFrame).padStart(2, "0")}</div>
          <div className="timeline-ruler" ref={timelineViewportRef} style={{ width: timelineWidth }} onPointerDown={beginPlayheadDrag}>
            {Array.from({ length: Math.max(2, Math.ceil(totalDuration / 2) + 1) }, (_, index) => <span key={index}>{index * 2}s</span>)}
          </div>
          <div className="track-head video"><strong>V1</strong><span>Video</span><small>{clips.length} đoạn</small></div>
          <div className="track-lane video" style={{ width: timelineWidth }}>
            <button type="button" className="edit-playhead" style={{ left: clampedPlayheadSec * timelineUnit }} aria-label="Kéo đầu phát trên dòng thời gian" onPointerDown={beginPlayheadDrag} />
            {clips.map((clip, index) => {
              const item = itemForClip(clip);
              if (!item) return null;
              const clipWidth = Math.max(118, clip.timelineDurationSec * timelineUnit);
              return (
                <React.Fragment key={clip.id}>
                  <button
                    type="button"
                    className={`edit-clip ${clip.id === selectedClip?.id ? "active" : ""} ${item.video ? "ready" : item.image ? "keyframe" : "empty"}`}
                    style={{ width: clipWidth }}
                    onPointerDown={(event) => beginClipDrag(event, clip)}
                  >
                    <span className="clip-trim-handle start" title="Cắt đầu clip" onPointerDown={(event) => beginTrim(event, clip.id, "start")} />
                    <div className="edit-clip-strip">
                      {item.video ? <video src={item.video.filePath} poster={imagePreviewSrc(item.image)} muted playsInline preload="metadata" /> : item.image ? <img src={imagePreviewSrc(item.image)} alt="" /> : <Film size={20} />}
                    </div>
                    <strong>{clip.label}{clip.segment > 1 ? `.${clip.segment}` : ""}</strong>
                    <span>{item.video ? "Video" : item.image ? "Giữ khung" : "Khung trống"} · dài {clip.timelineDurationSec.toFixed(1)}s · vào {clip.sourceInSec.toFixed(1)} · ra {clip.sourceOutSec.toFixed(1)}</span>
                    <span className="clip-trim-handle end" title="Cắt cuối clip" onPointerDown={(event) => beginTrim(event, clip.id, "end")} />
                  </button>
                  {index < clips.length - 1 ? (
                    <span className="edit-cut-gap">
                      <button type="button" className="edit-insert-cut" title={`Chèn sau ${clip.label}`} aria-label={`Chèn sau ${clip.label}`} onClick={() => onSelectInsertCut(clip.shotId)}>
                        <Plus size={15} />
                      </button>
                    </span>
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
          <div className="track-head audio"><strong>A1</strong><span>Âm thanh 1</span><small>âm thanh nguồn</small></div>
          <div className="track-lane audio" style={{ width: timelineWidth }}>
            <div className="audio-bed" style={{ width: Math.max(160, totalDuration * timelineUnit) }}>
              <span>Âm thanh nguồn / không khí</span>
              <i />
            </div>
          </div>
          <div className="track-head voice"><strong>A2</strong><span>Thoại</span><small>{audioClips.filter((clip) => ["dialogue", "internal_voice", "narration", "recording"].includes(clip.kind)).length} clip</small></div>
          <div className="track-lane voice" style={{ width: timelineWidth }}>
            {audioClips.filter((clip) => ["dialogue", "internal_voice", "narration", "recording"].includes(clip.kind)).map((clip) => {
              const asset = assets.find((item) => item.id === clip.sourceAssetId);
              const label = audioClipLabel(clip.kind);
              return <div className={`audio-timeline-clip ${clip.kind}`} key={clip.id} style={{ left: clip.timelineStartSec * timelineUnit, width: Math.max(84, clip.timelineDurationSec * timelineUnit) }} title={`${label} · ${clip.timelineDurationSec.toFixed(2)}s · bắt đầu ${clip.timelineStartSec.toFixed(2)}s`}><strong>{label}</strong><span>{clip.text || "Thoại/âm thanh đã gán"}</span><div className="audio-nudge-controls"><button type="button" aria-label={`Đưa ${clip.text || clip.kind} sớm hơn 0,1 giây`} onClick={(event) => { event.stopPropagation(); nudgeAudioClip(clip.id, -0.1); }}>−0.1</button><small>{clip.timelineStartSec.toFixed(1)}s</small><button type="button" aria-label={`Đưa ${clip.text || clip.kind} muộn hơn 0,1 giây`} onClick={(event) => { event.stopPropagation(); nudgeAudioClip(clip.id, 0.1); }}>+0.1</button></div>{asset ? <audio ref={(element) => { if (element) audioElementRefs.current.set(clip.id, element); else audioElementRefs.current.delete(clip.id); }} src={asset.filePath} preload="auto" /> : null}</div>;
            })}
          </div>
          <div className="track-head voice"><strong>A3</strong><span>Không khí / hiệu ứng / nhạc</span><small>{audioClips.filter((clip) => ["ambience", "sound_effect", "music"].includes(clip.kind)).length} clip</small></div>
          <div className="track-lane voice" style={{ width: timelineWidth }}>{audioClips.filter((clip) => ["ambience", "sound_effect", "music"].includes(clip.kind)).map((clip) => <div className={`audio-timeline-clip ${clip.kind}`} key={clip.id} style={{ left: clip.timelineStartSec * timelineUnit, width: Math.max(54, clip.timelineDurationSec * timelineUnit) }} title={`${clip.text || audioClipLabel(clip.kind)} · ${clip.timelineStartSec.toFixed(2)}s`}><strong>{clip.text || audioClipLabel(clip.kind)}</strong></div>)}</div>
        </div>
        <details className="edit-advanced-controls">
          <summary><span>Âm thanh nâng cao</span><small>Tuỳ chọn · lớp nền và âm lượng</small></summary>
        <div className="sound-bed-controls" aria-label="Tạo lớp âm thanh">
          <div><strong>Lớp âm thanh</strong><span>Tạo không khí và hiệu ứng rồi đặt lên dòng thời gian chính.</span></div>
          <label>Loại<select aria-label="Loại lớp âm thanh" value={soundBedKind} onChange={(event) => {
            const kind = event.target.value as "rain" | "machine" | "horn";
            setSoundBedKind(kind);
            setSoundBedStartSec(kind === "rain" ? 0 : Math.round(clampedPlayheadSec * 10) / 10);
            setSoundBedDurationSec(kind === "rain" ? Math.max(0.2, totalDuration) : kind === "machine" ? 1.4 : 0.7);
            setSoundBedGain(kind === "rain" ? 0.7 : kind === "machine" ? 0.9 : 0.85);
          }}><option value="rain">Không khí mưa</option><option value="machine">Kích hoạt máy</option><option value="horn">Còi ngoài khung</option></select></label>
          <label>Bắt đầu (giây)<input aria-label="Thời điểm bắt đầu lớp âm thanh" type="number" min={0} max={Math.max(0, totalDuration - 0.2)} step={0.1} value={soundBedStartSec} onChange={(event) => setSoundBedStartSec(finiteInputNumber(event.target.value, soundBedStartSec, { min: 0, max: Math.max(0, totalDuration - 0.2) }))} /></label>
          <label>Thời lượng (giây)<input aria-label="Thời lượng lớp âm thanh" type="number" min={0.2} max={Math.max(0.2, totalDuration - soundBedStartSec)} step={0.1} value={soundBedKind === "rain" ? Math.max(0.2, totalDuration - soundBedStartSec) : soundBedDurationSec} disabled={soundBedKind === "rain"} onChange={(event) => setSoundBedDurationSec(finiteInputNumber(event.target.value, soundBedDurationSec, { min: 0.2, max: Math.max(0.2, totalDuration - soundBedStartSec) }))} /></label>
          <label>Mức âm<input aria-label="Mức âm lớp âm thanh" type="range" min={0} max={1} step={0.05} value={soundBedGain} onChange={(event) => setSoundBedGain(Number(event.target.value))} /><span>{Math.round(soundBedGain * 100)}%</span></label>
          <button type="button" onClick={() => void generateSoundBed()} disabled={soundBedBusy || totalDuration <= 0}><Plus size={14} /> {soundBedBusy ? "Đang tạo…" : "Thêm vào timeline"}</button>
          {soundBedError ? <p className="video-review-error" role="alert">{soundBedError}</p> : null}
        </div>
        <div className="audio-mix-controls" aria-label="Điều chỉnh âm lượng">
          {(["sourceGain", "dialogueGain", "voiceoverGain", "ambienceGain", "musicGain"] as const).map((key) => <label key={key}>{audioMixLabels[key]}<input aria-label={`Mức âm ${audioMixLabels[key]}`} type="range" min={0} max={1} step={0.05} value={audioMix[key]} onChange={(event) => void onUpdateSequence({ ...sequenceModel, audioMix: { ...audioMix, [key]: Number(event.target.value) }, revision: sequenceModel.revision + 1, updatedAt: new Date().toISOString() })} /><span>{Math.round(audioMix[key] * 100)}%</span></label>)}
        </div>
        </details>
      </section>
        <section className="master-export-panel" aria-label="Xuất bản dựng chính">
        <div>
          <span>Bản dựng chính</span>
          <strong>Chuỗi dựng hiện tại · lần sửa {sequenceModel.revision}</strong>
          <p>{finalExportBlockReason || (finalExportEligible ? "Mọi clip đã có media và khoảng cắt hợp lệ. Bạn có thể xuất bản dựng cuối." : `${unacceptedClips.length} clip thiếu media hoặc khoảng cắt hợp lệ. Hãy sửa trước khi xuất bản dựng cuối.`)}</p>
        </div>
        <div className="master-export-actions">
          <button type="button" onClick={() => void requestExport(true)} disabled={Boolean(activeExport)}><Download size={14} /> Xuất bản nháp</button>
          <button type="button" className="primary" title={!finalExportEligible ? (finalExportBlockReason || "Cần media hợp lệ và khoảng cắt hợp lệ cho mọi clip.") : activeExport ? "Đang có một lượt export khác." : undefined} onClick={() => void requestExport(false)} disabled={Boolean(activeExport) || !finalExportEligible}><BadgeCheck size={14} /> Xuất bản cuối</button>
          {activeExport ? <button type="button" onClick={() => void onCancelExport(activeExport.id)}>Hủy</button> : null}
        </div>
        {activeExport ? <div className="master-export-progress"><span>{activeExport.statusMessage}</span><progress max={1} value={activeExport.progress ?? 0} /></div> : null}
        {exportError ? <p className="video-review-error" role="alert">{exportError}</p> : null}
        {latestExport && !activeExport ? <dl>
          <div><dt>Trạng thái</dt><dd>{formatLabel(latestExport.status)}</dd></div>
          <div><dt>Chế độ</dt><dd>{latestExport.input.draft ? "Bản nháp có watermark" : "Bản cuối"}</dd></div>
          <div><dt>Lần sửa</dt><dd>{String(latestExport.input.sequenceRevision ?? "-")}</dd></div>
          <div><dt>Kết quả</dt><dd>{userFacingJobMessage(latestExport.error || latestExport.statusMessage) || "Chưa có kết quả"}</dd></div>
        </dl> : null}
        {masterAsset ? <div className="master-export-result"><video src={masterAsset.filePath} controls muted playsInline /></div> : null}
      </section>
    </div>
  )); }
