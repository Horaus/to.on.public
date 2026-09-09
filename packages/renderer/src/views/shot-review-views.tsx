import type { Asset, AutomationJob, ProjectIntake, Scene, Shot, SkillPack } from "@studio/types";
import {
  AlertTriangle, BadgeCheck,
  Film,
  Image as ImageIcon,
  Loader2, MonitorCheck, RefreshCcw,
  Play,
  Wand2
} from "lucide-react";
import { useState } from "react";
import {
  assetAspectMismatched,
  getAssetAspectRatio,
  isLikelyEphemeralMediaUrl,
  shotKeyframeAssets,
  shotVideoAssets
} from "@studio/workflow/media-asset-selectors";
import { imagePreviewSrc } from "@studio/renderer-core/production-ui-support";
import { frameOrientation, statusLabel, userFacingJobMessage } from "@studio/renderer-core/ui-format";
import type { VideoPreflightValidation } from "@studio/renderer-core/video-preflight-contract";
import { shotDialogueLines } from "../core/shot-copy";
import { formatSkillCategory, formatSkillEntitlement, formatSkillName, formatSkillPipelineStages } from "../studio-pipeline";
import { StoryboardVideoPreview } from "./asset-video-views";

type VideoAspectRatio = NonNullable<ProjectIntake["videoFrame"]>["aspectRatio"];
type SkillDoc = SkillPack;
type ReviewFinding = { label: string; state: "pass" | "warn" | "fail"; detail: string };
type VideoJobInput = { bridgeMessage?: { settings?: { preflightOnly?: boolean } } };
const activeJobStatuses = new Set<AutomationJob["status"]>(["pending", "opening_provider", "submitting", "generating", "downloading"]);
const latestJobForShot = (jobs: AutomationJob[], shotId: string, jobType: AutomationJob["jobType"]) => jobs.find((job) => job.shotId === shotId && job.jobType === jobType);
const latestActiveJobForShot = (jobs: AutomationJob[], shotId: string, jobType: AutomationJob["jobType"]) => jobs.find((job) => job.shotId === shotId && job.jobType === jobType && activeJobStatuses.has(job.status));
const jobNeedsUserAction = (job: AutomationJob | undefined) => Boolean(job && ["waiting_login", "waiting_manual_action", "failed_manual", "failed_retryable"].includes(job.status));

export function ShotMatrix({
  scenes,
  shots,
  assets,
  jobs,
  selectedShotId,
  storyboardStep,
  aspectRatio,
  preflightByShot,
  enforcePreflight,
  onSelectShot,
  onSelectStep,
  onQueueShot,
  onQueueStoryboard,
  onQueueMissingKeyframes,
  onRepairFrameRatio,
  onRecoverJob,
  onRetryJob
}: {
  scenes: Scene[];
  shots: Shot[];
  assets: Asset[];
  jobs: AutomationJob[];
  selectedShotId: string;
  storyboardStep: number;
  aspectRatio: VideoAspectRatio;
  preflightByShot: Record<string, VideoPreflightValidation>;
  enforcePreflight: boolean;
  onSelectShot: (shotId: string) => void;
  onSelectStep: (step: number, shotId?: string) => void;
  onQueueShot: (shot: Shot) => void;
  onQueueStoryboard: () => void;
  onQueueMissingKeyframes: (sceneId: string) => void;
  onRepairFrameRatio: (targets: Array<{ shotId: string; sourceAssetId?: string }>) => void;
  onRecoverJob: (jobId: string) => void;
  onRetryJob: (job: AutomationJob | undefined) => boolean;
}) {
  const [measuredAssetAspects, setMeasuredAssetAspects] = useState<Record<string, VideoAspectRatio>>({});
  const [brokenAssetIds, setBrokenAssetIds] = useState<Record<string, true>>({});
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots[0];
  const selectedSceneId = selectedShot?.sceneId;
  const totalDuration = shots.reduce((total, shot) => total + shot.durationSec, 0);
  // Prompt text is an implementation detail. The storyboard summary should
  // communicate an actionable production state instead of exposing the
  // provider payload vocabulary to users.
  const readyShotCount = shots.filter((shot) => Boolean(shot.prompt && shot.description)).length;
  const videoAssetCount = shots.filter((shot) => shotVideoAssets(assets, shot, jobs).length > 0).length;
  const firstShotForScene = (sceneId: string) => shots.find((shot) => shot.sceneId === sceneId);
  const steppedScene = storyboardStep > 0 ? scenes[storyboardStep - 1] : undefined;
  const activeScene = steppedScene ?? scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const shotsByScene = new Map<string, Shot[]>();
  for (const shot of shots) shotsByScene.set(shot.sceneId, [...(shotsByScene.get(shot.sceneId) ?? []), shot]);
  const sceneShotsFor = (sceneId: string) => shotsByScene.get(sceneId) ?? [];
  const activeSceneShots = activeScene ? sceneShotsFor(activeScene.id) : shots;
  const assetAspectForUi = (asset: Asset | undefined) => asset ? measuredAssetAspects[asset.id] ?? getAssetAspectRatio(asset, jobs) : undefined;
  const imageForShot = (shot: Shot) => {
    // An asset record can exist before its provider URL is saved (or point at
    // a disposable test URL). Treat those as missing so the compact empty
    // storyboard state is shown instead of a misleading blank tall frame.
    const shotImages = shotKeyframeAssets(assets, shot, jobs).filter((asset) => {
      const preview = imagePreviewSrc(asset);
      return !brokenAssetIds[asset.id] && Boolean(preview) && !isLikelyEphemeralMediaUrl(preview);
    });
    return shotImages.find((asset) => assetAspectForUi(asset) === aspectRatio) ?? shotImages[0];
  };
  const videoForShot = (shot: Shot) => {
    const shotVideos = shotVideoAssets(assets, shot, jobs)
      .filter((asset) => !brokenAssetIds[asset.id])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return shotVideos[0];
  };
  const selectedStoryStep = storyboardStep > scenes.length ? 0 : storyboardStep;
  const aspectStyle = { aspectRatio: aspectRatio.replace(":", " / ") };
  // Preloading every image in a project made large storyboards janky and
  // competed with the currently visible media. Only warm the active scene's
  // keyframes; the actual cards remain the source of truth for rendering.
  const preloadImageUrls = Array.from(new Set(activeSceneShots
    .map((shot) => imageForShot(shot))
    .map((asset) => asset ? imagePreviewSrc(asset) : undefined)
    .filter(Boolean)));
  const measureAssetAspect = (asset: Asset, image: HTMLImageElement) => {
    if (brokenAssetIds[asset.id]) setBrokenAssetIds((current) => {
      const next = { ...current };
      delete next[asset.id];
      return next;
    });
    const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
    const measuredAspectRatio: VideoAspectRatio = ratio > 1.2 ? "16:9" : ratio < 0.85 ? "9:16" : "1:1";
    setMeasuredAssetAspects((current) => current[asset.id] === measuredAspectRatio ? current : { ...current, [asset.id]: measuredAspectRatio });
  };
  const markAssetBroken = (asset: Asset) => {
    setBrokenAssetIds((current) => current[asset.id] ? current : { ...current, [asset.id]: true });
  };
  const isAssetMismatched = (asset: Asset | undefined) => {
    if (!asset) return false;
    const measuredAspectRatio = assetAspectForUi(asset);
    return measuredAspectRatio ? measuredAspectRatio !== aspectRatio : assetAspectMismatched(asset, jobs, aspectRatio);
  };
  const mismatchedStoryboardTargets = scenes.flatMap((scene) => {
    const sceneShots = sceneShotsFor(scene.id);
    const shot = sceneShots.find((item) => imageForShot(item) && isAssetMismatched(imageForShot(item)));
    const asset = shot ? imageForShot(shot) : undefined;
    return shot ? [{ shotId: shot.id, sourceAssetId: asset?.id }] : [];
  });
  const storyboardMismatch = mismatchedStoryboardTargets.length > 0;
  const activeSceneMissingKeyframes = activeSceneShots.filter((shot) => !imageForShot(shot));
  const showMissingKeyframeAction = Boolean(activeScene && activeSceneShots.length > 0 && activeSceneMissingKeyframes.length > 0);
  return (
    <div className="storyboard-canvas" aria-label="Khung storyboard của shot">
      <div className="storyboard-image-preload" aria-hidden="true">
        {preloadImageUrls.map((url) => <img key={url} src={url} alt="" loading="lazy" decoding="async" />)}
      </div>
      <div className="storyboard-canvas-head">
        <div>
          <span>DÒNG CẢNH<span className="sr-only">Bảng storyboard</span></span>
          <strong>{scenes.length} khung cảnh · {shots.length} khung hình · {totalDuration}s</strong>
        </div>
        <div className="storyboard-stepper" role="tablist" aria-label="Các bước storyboard">
          <button type="button" role="tab" aria-selected={selectedStoryStep === 0} className={selectedStoryStep === 0 ? "active" : ""} onClick={() => onSelectStep(0)}>
            <span>0</span>
            <small>Tổng quan<span className="sr-only">Tổng quan</span></small>
          </button>
          {scenes.map((scene) => {
            const firstShot = firstShotForScene(scene.id);
            return (
              <button type="button" role="tab" aria-selected={selectedStoryStep === scene.order} className={selectedStoryStep === scene.order ? "active" : ""} key={scene.id} disabled={!firstShot} onClick={() => onSelectStep(scene.order, firstShot?.id)}>
                <span>{scene.order}</span>
                <small>Cảnh<span className="sr-only">Cảnh</span></small>
              </button>
            );
          })}
        </div>
        <div className="storyboard-canvas-stats">
          <span>{readyShotCount}/{shots.length} shot sẵn sàng</span>
          <span>{videoAssetCount} video</span>
        </div>
      </div>
      <div className="storyboard-canvas-body">
        <div className="storyboard-map">
          {selectedStoryStep === 0 ? (
            <section className="storyboard-overview-sheet">
              <div className="storyboard-sheet-head">
                <div>
                  <span>BƯỚC 0 · STORYBOARD TỔNG QUAN</span>
                  <strong>Tạo khung storyboard tổng quan trước khi dựng chi tiết từng scene.</strong>
                </div>
                <div className="storyboard-generate-actions">
                  {storyboardMismatch ? <button type="button" className="frame-repair-button" title="Chỉ tạo lại ảnh storyboard lệch tỉ lệ khung video." aria-label="Sửa tỉ lệ khung storyboard" onClick={() => onRepairFrameRatio(mismatchedStoryboardTargets)}><AlertTriangle size={14} /><span>Tỉ lệ</span></button> : null}
                  <button type="button" className="storyboard-generate-button" title="Tạo khung cảnh" aria-label="Tạo khung cảnh" onClick={onQueueStoryboard}><Wand2 size={14} /><span>Khung cảnh</span></button>
                </div>
              </div>
              <div className="storyboard-sheet-grid">
                {scenes.map((scene) => {
                  const sceneShots = sceneShotsFor(scene.id);
                  const firstShot = sceneShots[0];
                  const sceneKeyframe = sceneShots.map(imageForShot).find(Boolean);
                  return (
                    <button type="button" className="storyboard-sheet-panel" key={scene.id} aria-label={`Mở cảnh ${scene.order}: ${scene.title}`} disabled={!firstShot} onClick={() => firstShot && onSelectStep(scene.order, firstShot.id)}>
                      <div className={`storyboard-sheet-sketch ${frameOrientation(aspectRatio)} ${sceneKeyframe ? "" : "empty"} ${isAssetMismatched(sceneKeyframe) ? "ratio-warning" : ""}`} style={sceneKeyframe ? aspectStyle : undefined}>
                        {sceneKeyframe ? <img src={imagePreviewSrc(sceneKeyframe)} alt={`Khung storyboard cảnh ${scene.order}`} loading="eager" decoding="async" onLoad={(event) => measureAssetAspect(sceneKeyframe, event.currentTarget)} onError={() => markAssetBroken(sceneKeyframe)} /> : <ImageIcon size={21} />}
                      </div>
                      <span>{scene.order}.</span>
                      <strong>{scene.title}</strong>
                      <p>{scene.summary}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
          <section className="storyboard-scene-column active">
            <div className="storyboard-scene-head">
              <div>
                <span>BƯỚC {activeScene?.order ?? 1} · CHI TIẾT CẢNH<span className="sr-only"> SCENE</span></span>
                <strong>{activeScene?.title ?? "Cảnh"}</strong>
                <p>{activeScene?.summary ?? "Chưa có tóm tắt scene."}</p>
              </div>
              {showMissingKeyframeAction && activeScene ? (
                  <button type="button" className="storyboard-generate-button compact" title="Tạo khung hình cho các shot còn thiếu ảnh trong cảnh này." aria-label="Tạo khung hình còn thiếu" onClick={() => onQueueMissingKeyframes(activeScene.id)}>
                  <Wand2 size={13} /><span>Tạo keyframe còn thiếu</span>
                </button>
              ) : null}
            </div>
            <div className="storyboard-shot-stack">
              {activeSceneShots.map((shot) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  selectedShotId={selectedShotId}
                  assets={assets}
                  jobs={jobs}
                  aspectRatio={aspectRatio}
                  aspectStyle={aspectStyle}
                  preflightByShot={preflightByShot}
                  enforcePreflight={enforcePreflight}
                  imageForShot={imageForShot}
                  videoForShot={videoForShot}
                  isAssetMismatched={isAssetMismatched}
                  measureAssetAspect={measureAssetAspect}
                  markAssetBroken={markAssetBroken}
                  onSelectShot={onSelectShot}
                  onRepairFrameRatio={onRepairFrameRatio}
                  onQueueShot={onQueueShot}
                  onRecoverJob={onRecoverJob}
                  onRetryJob={onRetryJob}
                />
              ))}
            </div>
          </section>
          )}
        </div>
      </div>
    </div>
  );
}


export function PromptLab({
  prompt,
  activeSkill,
  skills,
  onSelectSkill
}: {
  prompt: string;
  activeSkill: SkillDoc;
  skills: SkillDoc[];
  onSelectSkill: (skillId: string) => void;
}) {
  const requiredSections = [
    ["[STYLE]", "Phong cách"],
    ["[CHARACTER]", "Nhân vật"],
    ["[SCENE]", "Bối cảnh"],
    ["[KEYFRAME BRIEF]", "Khung hình"],
    ["[SHOT ACTION]", "Hành động"],
    ["[CAMERA]", "Góc máy"],
    ["[VIDEO MOTION]", "Chuyển động"],
    ["[MOTION RULE]", "Nhịp chuyển động"],
    ["[REFERENCE RULE]", "Tham chiếu"],
    ["[NEGATIVE]", "Giới hạn hình ảnh"]
  ] as const;
  const sections = requiredSections.filter(([token]) => prompt.includes(token));
  return (
    <div className="command-panel prompt-lab">
      <div className="panel-head">
                <span>Kiểm tra nội dung shot</span>
                <strong>{sections.length}/{requiredSections.length} mục</strong>
      </div>
      <div className="skill-tabs" role="tablist" aria-label="Các bộ kỹ năng video">
        {skills.map((skill) => (
          <button type="button" role="tab" aria-selected={skill.id === activeSkill.id} aria-label={`Chọn bộ kỹ năng ${formatSkillName(skill.name, skill.id)}`} className={skill.id === activeSkill.id ? "active" : ""} key={skill.id} onClick={() => onSelectSkill(skill.id)}>
            {formatSkillName(skill.name, skill.id)}
          </button>
        ))}
      </div>
      <div className="skill-meta">
        <span>{formatSkillCategory(activeSkill.category)}</span>
        <span>{formatSkillEntitlement(activeSkill.entitlement)}</span>
        <span>{formatSkillPipelineStages(activeSkill.pipelineStages) || "Thủ công"}</span>
      </div>
      {activeSkill.description ? <p className="skill-description">{activeSkill.description}</p> : null}
      <div className="prompt-sections" aria-label="Các yêu cầu nội dung đã kiểm tra">
        {sections.map(([token, label]) => (
          <span key={token}>{label}</span>
        ))}
      </div>
      <p className="prompt-lab-note">Nội dung kỹ thuật được hệ thống lưu nội bộ; các mục sản xuất bên trên đã được kiểm tra tự động và không cần chỉnh trực tiếp.</p>
    </div>
  );
}

export function ContinuityPanel({ findings }: { findings: ReviewFinding[] }) {
  const passCount = findings.filter((finding) => finding.state === "pass").length;
  return (
    <div className="command-panel continuity-panel">
      <div className="panel-head">
              <span>Kiểm tra continuity</span>
        <strong>{passCount}/{findings.length} pass</strong>
      </div>
      <div className="finding-list">
        {findings.map((finding) => {
          const Icon = finding.state === "pass" ? BadgeCheck : finding.state === "warn" ? AlertTriangle : MonitorCheck;
          return (
            <div className={`finding ${finding.state}`} key={finding.label}>
              <Icon size={15} />
              <div>
                <strong>{finding.label}</strong>
                <span>{finding.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ShotCardProps = {
  shot: Shot;
  selectedShotId: string;
  assets: Asset[];
  jobs: AutomationJob[];
  aspectRatio: VideoAspectRatio;
  aspectStyle: { aspectRatio: string };
  preflightByShot: Record<string, VideoPreflightValidation>;
  enforcePreflight: boolean;
  imageForShot: (shot: Shot) => Asset | undefined;
  videoForShot: (shot: Shot) => Asset | undefined;
  isAssetMismatched: (asset: Asset | undefined) => boolean;
  measureAssetAspect: (asset: Asset, image: HTMLImageElement) => void;
  markAssetBroken: (asset: Asset) => void;
  onSelectShot: (shotId: string) => void;
  onRepairFrameRatio: (targets: Array<{ shotId: string; sourceAssetId?: string }>) => void;
  onQueueShot: (shot: Shot) => void;
  onRecoverJob: (jobId: string) => void;
  onRetryJob: (job: AutomationJob | undefined) => boolean;
};

type ShotCardContext = ShotCardProps & {
  keyframeAsset?: Asset;
  videoAsset?: Asset;
  hasVideo: boolean;
  activeVideoJob?: AutomationJob;
  preflight?: VideoPreflightValidation;
  preflightErrors: VideoPreflightValidation["issues"];
  videoJobNeedsAction?: AutomationJob;
  jobProgress?: number;
};

function ShotCardMedia({ shot, keyframeAsset, videoAsset, aspectRatio, aspectStyle, isAssetMismatched, measureAssetAspect, markAssetBroken, onSelectShot }: Pick<ShotCardContext, "shot" | "keyframeAsset" | "videoAsset" | "aspectRatio" | "aspectStyle" | "isAssetMismatched" | "measureAssetAspect" | "markAssetBroken" | "onSelectShot">) {
  return (
      <div className={`storyboard-shot-media ${videoAsset ? "has-video" : ""}`}>
        <button type="button" className="storyboard-shot-image storyboard-shot-main" aria-label={`Chọn SH${shot.order} và xem keyframe`} onClick={() => onSelectShot(shot.id)}>
          <div className={`storyboard-frame ${frameOrientation(aspectRatio)} ${isAssetMismatched(keyframeAsset) ? "ratio-warning" : ""}`} style={aspectStyle}>
            {keyframeAsset ? (
              <img src={imagePreviewSrc(keyframeAsset)} alt={`Khung hình mở đầu SH${shot.order}`} loading="eager" decoding="async" onLoad={(event) => measureAssetAspect(keyframeAsset, event.currentTarget)} onError={() => markAssetBroken(keyframeAsset)} />
            ) : (
              <span><ImageIcon size={18} /> Khung hình<span className="sr-only"> Keyframe</span></span>
            )}
            <small className="storyboard-media-badge" aria-label={`Shot ${shot.order} ${keyframeAsset ? "ảnh sẵn sàng" : "cần ảnh"}`}>
              <ImageIcon size={12} />
              SH{shot.order}
            </small>
          </div>
        </button>
        {videoAsset ? (
          <StoryboardVideoPreview
            asset={videoAsset}
            fallbackPosterUrl={imagePreviewSrc(keyframeAsset)}
            shotOrder={shot.order}
            aspectRatio={aspectRatio}
            aspectStyle={aspectStyle}
            onSelectShot={() => onSelectShot(shot.id)}
            onUnavailable={markAssetBroken}
          />
        ) : null}
      </div>
  );
}

function ShotCardCopy({ shot, keyframeAsset, hasVideo, videoAsset, activeVideoJob, preflight, preflightErrors }: Pick<ShotCardContext, "shot" | "keyframeAsset" | "hasVideo" | "videoAsset" | "activeVideoJob" | "preflight" | "preflightErrors">) {
  return (
      <div className="storyboard-shot-copy">
        <span>SH{shot.order} · {shot.durationSec}s</span>
        <strong>{shot.description || "Chưa có mô tả khung hình"}</strong>
        {shotDialogueLines(shot) ? <p className="storyboard-shot-dialogue">{shotDialogueLines(shot)}</p> : null}
        {preflight && !preflight.valid ? (
          <div className="storyboard-shot-issue storyboard-shot-preflight-error">
            <AlertTriangle size={12} /><span>{preflightErrors[0]?.message || `${preflightErrors.length} vấn đề cần xử lý`}</span>
          </div>
        ) : null}
      </div>
  );
}

function ShotCardActions({ shot, keyframeAsset, hasVideo, activeVideoJob, preflight, preflightErrors, videoJobNeedsAction, jobProgress, isAssetMismatched, enforcePreflight, onRepairFrameRatio, onQueueShot, onRecoverJob, onRetryJob }: Pick<ShotCardContext, "shot" | "keyframeAsset" | "hasVideo" | "activeVideoJob" | "preflight" | "preflightErrors" | "videoJobNeedsAction" | "jobProgress" | "isAssetMismatched" | "enforcePreflight" | "onRepairFrameRatio" | "onQueueShot" | "onRecoverJob" | "onRetryJob">) {
  const actionMessage = videoJobNeedsAction ? userFacingJobMessage(videoJobNeedsAction.error || videoJobNeedsAction.statusMessage || statusLabel(videoJobNeedsAction.status)) : "";
  const activeMessage = activeVideoJob ? userFacingJobMessage(activeVideoJob.statusMessage || statusLabel(activeVideoJob.status)) : "";
  return (
      <div className="storyboard-shot-actions">
        {isAssetMismatched(keyframeAsset) ? <button type="button" className="frame-repair-button compact" title="Tạo lại khung hình theo tỉ lệ video hiện tại." aria-label={`Sửa tỉ lệ SH${shot.order}`} onClick={() => onRepairFrameRatio([{ shotId: shot.id, sourceAssetId: keyframeAsset?.id }])}><AlertTriangle size={14} /><span>Tỉ lệ</span></button> : null}
        <button type="button" className="storyboard-queue" aria-label={`${hasVideo ? "Tạo lại" : "Tạo"} video SH${shot.order}`} title={activeMessage || (!keyframeAsset ? "Cần tạo khung đầu trước khi gửi shot sang video." : preflightErrors[0]?.repair || preflightErrors[0]?.message || `${hasVideo ? "Tạo lại" : "Tạo"} video cho shot này`)} disabled={Boolean(activeVideoJob)} onClick={() => onQueueShot(shot)}>
          {activeVideoJob ? <Loader2 size={13} className="spin" /> : hasVideo ? <RefreshCcw size={13} /> : preflight?.requiresTextCompaction ? <Wand2 size={13} /> : <Play size={13} />}
          <span>{activeVideoJob ? statusLabel(activeVideoJob.status) : !keyframeAsset ? "Tạo khung đầu" : preflight?.requiresTextCompaction ? "Rút gọn nội dung" : preflight && !preflight.valid ? "Sửa và thử lại" : hasVideo ? "Tạo lại video" : "Tạo video"}</span>
        </button>
        {activeVideoJob ? (
          <div className="storyboard-shot-progress" title={activeMessage}>
            <span>{activeMessage}</span>
            <em><i style={{ width: `${Math.round((jobProgress ?? 0.18) * 100)}%` }} /></em>
          </div>
        ) : null}
        {videoJobNeedsAction ? (
          <div className="storyboard-shot-issue" title={actionMessage}>
            <AlertTriangle size={12} />
            <span>{actionMessage}</span>
            {videoJobNeedsAction.providerId === "google-flow-web" ? (
              <button type="button" onClick={() => onRetryJob(videoJobNeedsAction)}>Thử lại</button>
            ) : (
              <button type="button" onClick={() => onRecoverJob(videoJobNeedsAction.id)}>Khôi phục</button>
            )}
          </div>
        ) : null}
      </div>
  );
}

function ShotCard({
  shot, selectedShotId, assets, jobs, aspectRatio, aspectStyle, preflightByShot, enforcePreflight, imageForShot, videoForShot, isAssetMismatched, measureAssetAspect, markAssetBroken, onSelectShot, onRepairFrameRatio, onQueueShot, onRecoverJob, onRetryJob
}: ShotCardProps) {  const keyframeAsset = imageForShot(shot);
  const videoAsset = videoForShot(shot);
  const hasVideo = Boolean(videoAsset);
  const activeVideoJob = latestActiveJobForShot(jobs, shot.id, "video");
  const latestVideoJob = latestJobForShot(jobs, shot.id, "video");
  const latestVideoIsPreflight = Boolean((latestVideoJob?.input as VideoJobInput | undefined)?.bridgeMessage?.settings?.preflightOnly);
  const videoJobNeedsAction = !hasVideo && !activeVideoJob && !latestVideoIsPreflight && jobNeedsUserAction(latestVideoJob) ? latestVideoJob : undefined;
  const jobProgress = typeof activeVideoJob?.progress === "number" ? Math.max(0, Math.min(1, activeVideoJob.progress)) : undefined;
  const preflight = preflightByShot[shot.id];
  const preflightErrors = preflight?.issues.filter((issue) => issue.severity === "error") ?? [];

  const renderContext: ShotCardContext = { shot, selectedShotId, assets, jobs, aspectRatio, aspectStyle, preflightByShot, enforcePreflight, imageForShot, videoForShot, isAssetMismatched, measureAssetAspect, markAssetBroken, onSelectShot, onRepairFrameRatio, onQueueShot, onRecoverJob, onRetryJob, keyframeAsset, videoAsset, hasVideo, activeVideoJob, preflight, preflightErrors, videoJobNeedsAction, jobProgress };
  return (
    <article className={`storyboard-shot-card ${shot.id === selectedShotId ? "selected" : ""} ${shot.downstreamDirty ? "downstream-dirty" : ""}`} key={shot.id} role="group" tabIndex={0} aria-label={`Shot ${shot.order}${shot.downstreamDirty ? " · cần tạo lại sau chỉnh sửa" : ""}`} aria-selected={shot.id === selectedShotId} onClick={(event) => { if ((event.target as HTMLElement).closest("button,summary,input,select,textarea")) return; onSelectShot(shot.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectShot(shot.id); } }}>
      {shot.downstreamDirty ? <div className="shot-revision-flag" role="status"><AlertTriangle size={13} /> Có chỉnh sửa phía trước · có thể tạo lại</div> : null}
<ShotCardMedia {...renderContext} />
<ShotCardCopy {...renderContext} />
<ShotCardActions {...renderContext} />
    </article>
  );
}
