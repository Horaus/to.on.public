import { AlertTriangle, CircleHelp, Loader2, RefreshCcw } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useStudioApplicationContext } from "./studio-application-context";
import { CAMERA_ANGLE_LABELS, CAMERA_ANGLES, CAMERA_CONTROL_LABELS, CAMERA_CONTROLS, CAMERA_FRAMING_LABELS, CAMERA_FRAMINGS, cameraTarget, compactCameraAngle, compactCameraControl, compactCameraFraming, composeCamera, parseShotTimelineNotes, shotTimelineNotes } from "./core/shot-copy";

type ShotDraft = {
  description: string;
  camera: string;
  cameraTarget: string;
  durationSec: number;
  narrative: string;
};

function draftFromShot(shot: ReturnType<typeof useStudioApplicationContext>["storyboardSideShot"]): ShotDraft {
  return {
    description: shot.description || "",
    camera: shot.camera || "",
    cameraTarget: cameraTarget(shot.camera || ""),
    durationSec: shot.durationSec,
    narrative: shotTimelineNotes(shot)
  };
}

function revisedShotFromDraft(shot: ReturnType<typeof useStudioApplicationContext>["storyboardSideShot"], draft: ShotDraft) {
  const parsedBeats = parseShotTimelineNotes(draft.narrative);
  const camera = composeCamera(compactCameraFraming(draft.camera), compactCameraAngle(draft.camera), compactCameraControl(draft.camera), draft.cameraTarget);
  // Regeneration must remain queueable even when an older shot was imported
  // without its generated prompt. The edited visual description is the
  // authored fallback; clearing prompt here made the button look successful
  // while queueVideoJob() correctly rejected the shot as promptless.
  const prompt = shot.prompt?.trim() || draft.description.trim();
  return {
    ...shot,
    description: draft.description.trim(),
    camera,
    durationSec: draft.durationSec,
    dialogue: parsedBeats.filter((beat) => beat.dialogue).map((beat) => beat.dialogue).filter(Boolean).join("\n"),
    prompt,
    actionBeats: parsedBeats.map((parsedBeat, index) => {
      const previous = shot.actionBeats?.[index];
      const sameAuthoredBeat = Boolean(previous && previous.action.trim() === parsedBeat.action.trim() && (previous.dialogue || "").trim() === parsedBeat.dialogue.trim() && (previous.speaker || "").trim() === parsedBeat.speaker.trim());
      const startSec = parsedBeats.length ? (draft.durationSec * index) / parsedBeats.length : 0;
      const endSec = parsedBeats.length ? (draft.durationSec * (index + 1)) / parsedBeats.length : draft.durationSec;
      return {
        ...(sameAuthoredBeat ? previous : {}),
        startSec: Math.round(startSec * 10) / 10,
        endSec: Math.round(endSec * 10) / 10,
        beatFunction: parsedBeat.beatFunction,
        camera,
        action: parsedBeat.action || previous?.action || "Giữ nguyên vị trí và trạng thái.",
        dialogue: parsedBeat.dialogue || undefined,
        speaker: parsedBeat.speaker || previous?.speaker
      };
    })
  };
}

function ShotCameraFields({ draft, setDraft }: { draft: ShotDraft; setDraft: Dispatch<SetStateAction<ShotDraft>> }) {
  return <div className="shot-detail-inline">
    <label>Cỡ khung<select value={compactCameraFraming(draft.camera)} onChange={(event) => setDraft((current) => ({ ...current, camera: composeCamera(event.target.value, compactCameraAngle(current.camera), compactCameraControl(current.camera), current.cameraTarget) }))}>{CAMERA_FRAMINGS.map((framing) => <option key={framing} value={framing}>{CAMERA_FRAMING_LABELS[framing]}</option>)}</select></label>
    <label>Góc<select value={compactCameraAngle(draft.camera)} onChange={(event) => setDraft((current) => ({ ...current, camera: composeCamera(compactCameraFraming(current.camera), event.target.value, compactCameraControl(current.camera), current.cameraTarget) }))}>{CAMERA_ANGLES.map((angle) => <option key={angle} value={angle}>{CAMERA_ANGLE_LABELS[angle]}</option>)}</select></label>
    <label>Chuyển động<select value={compactCameraControl(draft.camera)} onChange={(event) => setDraft((current) => ({ ...current, camera: composeCamera(compactCameraFraming(current.camera), compactCameraAngle(current.camera), event.target.value, current.cameraTarget) }))}>{CAMERA_CONTROLS.map((control) => <option key={control} value={control}>{CAMERA_CONTROL_LABELS[control]}</option>)}</select></label>
    <label>Nhìn vào<input value={draft.cameraTarget} onChange={(event) => setDraft((current) => ({ ...current, cameraTarget: event.target.value, camera: composeCamera(compactCameraFraming(current.camera), compactCameraAngle(current.camera), compactCameraControl(current.camera), event.target.value) }))} placeholder="Mai / file âm thanh / bàn ăn" /></label>
    <label>Thời lượng<select value={draft.durationSec} onChange={(event) => setDraft((current) => ({ ...current, durationSec: Number(event.target.value) }))}>{[4, 6, 8, 10].map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}</select></label>
  </div>;
}

function ShotNarrativeField({ draft, setDraft }: { draft: ShotDraft; setDraft: Dispatch<SetStateAction<ShotDraft>> }) {
  return <label>Diễn biến hành động &amp; lời thoại
    <small className="shot-detail-helper">Mỗi nhịp một khối: dòng đầu là hành động/phản ứng, dòng dưới là lời thoại (nếu có). Giữ đúng thứ tự diễn ra.</small>
    <textarea value={draft.narrative} onChange={(event) => setDraft((current) => ({ ...current, narrative: event.target.value }))} placeholder={'1. Hành động: Lan đặt tay lên bàn và nhận ra nguyên liệu bị đổi.\n   Lời thoại — Lan: “Minh, em đổi nguyên liệu rồi.”\n   Phản ứng: Minh khựng lại và nhìn sang cô.'} />
  </label>;
}

export function StoryboardShotPanel() {
  const { projectJobs, projectScenes, projectShots, queueVideoJob, replaceState, storyboardSideShot, updateShot } = useStudioApplicationContext();
  const [draft, setDraft] = useState(() => draftFromShot(storyboardSideShot));
  const [saving, setSaving] = useState(false);
  const activeJob = projectJobs.find((job) => job.shotId === storyboardSideShot.id && job.jobType === "video" && ["pending", "opening_provider", "submitting", "generating", "downloading"].includes(job.status));

  // Refresh the editor when the selected shot is updated elsewhere (for
  // example after a retry/import).  Keying only by id left a stale draft on
  // screen and made the next regenerate silently overwrite newer content.
  useEffect(() => setDraft(draftFromShot(storyboardSideShot)), [
    storyboardSideShot.id,
    storyboardSideShot.description,
    storyboardSideShot.camera,
    storyboardSideShot.durationSec,
    storyboardSideShot.dialogue,
    storyboardSideShot.actionBeats
  ]);

  if (storyboardSideShot.id === "empty_shot") {
    return <div className="shot-detail-empty" role="status">
      <span>SHOT ĐANG CHỌN</span>
      <strong>Chưa có shot</strong>
      <p>Chạy bước Kịch bản để tạo scene và shot trước khi chỉnh sửa chi tiết.</p>
    </div>;
  }

  const saveAndRegenerate = async () => {
    const revisedShot = revisedShotFromDraft(storyboardSideShot, draft);
    setSaving(true);
    try {
      if (window.studioBridge) {
        const next = await window.studioBridge.updateShot(revisedShot);
        replaceState(next);
      } else {
        updateShot(revisedShot);
      }
      queueVideoJob(revisedShot);
    } finally {
      setSaving(false);
    }
  };
  // Shot numbers restart inside each scene, so comparing `shot.order` alone
  // can regenerate the wrong range. Use the authored scene/shot sequence and
  // keep the dispatch order deterministic; the provider coordinator then
  // leases each job serially instead of creating a burst of parallel work.
  const sceneOrderById = new Map(projectScenes.map((scene) => [scene.id, scene.order]));
  const sceneForShot = (shot: typeof storyboardSideShot) => sceneOrderById.get(shot.sceneId) ?? 0;
  const downstreamShots = projectShots
    .filter((shot) => {
      const currentSceneOrder = sceneForShot(storyboardSideShot);
      const candidateSceneOrder = sceneForShot(shot);
      return candidateSceneOrder > currentSceneOrder || (candidateSceneOrder === currentSceneOrder && shot.order > storyboardSideShot.order);
    })
    .sort((left, right) => sceneForShot(left) - sceneForShot(right) || left.order - right.order);
  const regenerateDownstream = () => {
    downstreamShots.forEach((shot) => queueVideoJob(shot));
  };

  return <div className="shot-detail-editor">
    {storyboardSideShot.downstreamDirty && storyboardSideShot.revisionNote ? <div className="revision-impact-banner" role="status"><AlertTriangle size={14} /><span>{storyboardSideShot.revisionNote}</span></div> : null}
    <div className="shot-detail-heading">
      <span>SHOT ĐANG CHỌN</span>
      <strong>SH{storyboardSideShot.order}</strong>
      <button type="button" className="rail-help" title="Chỉnh riêng shot này: khung tham chiếu, camera, thời lượng và diễn biến. Thay đổi chỉ áp dụng sau khi bấm Lưu và tạo lại." aria-label="Trợ giúp chỉnh shot"><CircleHelp size={14} /></button>
    </div>
    <label>Khung hình
      <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Mô tả khung hình đầu vào, nhân vật và bối cảnh cần nhìn thấy." />
    </label>
    <ShotCameraFields draft={draft} setDraft={setDraft} />
    <ShotNarrativeField draft={draft} setDraft={setDraft} />
    <button type="button" className="primary shot-regenerate-button" disabled={saving || Boolean(activeJob) || !draft.description.trim() || !draft.camera.trim()} onClick={() => void saveAndRegenerate()}>
      {saving || activeJob ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
      {activeJob ? "Đang tạo lại" : "Lưu và tạo lại"}
    </button>
    {downstreamShots.length ? <button type="button" className="shot-downstream-regenerate" disabled={saving || Boolean(activeJob)} onClick={regenerateDownstream} title="Tạo lại các shot đứng sau shot này."><RefreshCcw size={14} /> Tạo lại {downstreamShots.length} shot phía sau</button> : null}
  </div>;
}
