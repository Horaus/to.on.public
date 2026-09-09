import type {
  Asset,
  ProjectIntake
} from "@studio/types";
import {
  AlertTriangle,
  ChevronRight,
  Film,
  Layers3,
  Pause, Play,
  RefreshCcw,
  Repeat
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

function frameOrientation(aspectRatio: string) {
  if (aspectRatio === "16:9") return "horizontal";
  if (aspectRatio === "1:1") return "square";
  return "vertical";
}

type VideoAspectRatio=NonNullable<ProjectIntake["videoFrame"]>["aspectRatio"];

export function AssetPanel({ assets, onApprove }: { assets: Asset[]; onApprove: (assetId: string) => void }) {
  const providerLabel = (provider?: string) => ({ "google-flow": "Google Flow", "google-flow-web": "Google Flow", chatgpt: "ChatGPT", "chatgpt-web": "ChatGPT" } as Record<string, string>)[provider || ""] || "Định tuyến AI";
  return (
    <div className="assets panel">
      <div className="panel-head">
        <span>Kiểm tra shot</span>
        <strong>{assets.length} phiên bản</strong>
      </div>
      <div className="asset-grid">
        {assets.length === 0 ? (
          <div className="empty-row">Ảnh và video được tạo cho shot đang chọn sẽ hiển thị tại đây.</div>
        ) : (
          assets.map((asset) => (
            <div className="asset-card" key={asset.id}>
              <div className="asset-preview">
                {asset.type === "video" ? <Film size={30} /> : <Layers3 size={30} />}
              </div>
              <div>
                <strong>{asset.filePath.split("/").at(-1)}</strong>
                <span>{providerLabel(asset.sourceProvider)}</span>
              </div>
              <span className="asset-ready-badge" title="Tài nguyên có thể dùng ngay">Sẵn dùng</span>
              <button type="button" title="Tạo lại" aria-label={`Tạo lại ${asset.filePath.split("/").at(-1) || asset.id}`}>
                <RefreshCcw size={15} />
              </button>
              <ChevronRight size={16} className="asset-arrow" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
export function StoryboardVideoPreview({
  asset,
  fallbackPosterUrl,
  shotOrder,
  aspectRatio,
  aspectStyle,
  onSelectShot,
  onUnavailable
}: {
  asset: Asset;
  fallbackPosterUrl?: string;
  shotOrder: number;
  aspectRatio: VideoAspectRatio;
  aspectStyle: React.CSSProperties;
  onSelectShot: () => void;
  onUnavailable: (asset: Asset) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(() => window.localStorage.getItem("studio-storyboard-video-loop") !== "off");
  const [posterUrl, setPosterUrl] = useState(typeof asset.metadata?.posterUrl === "string" ? asset.metadata.posterUrl : "");
  const posterSavedRef = useRef(Boolean(asset.metadata?.posterUrl));
  const posterCaptureQueuedRef = useRef(false);

  useEffect(() => {
    const nextPoster = typeof asset.metadata?.posterUrl === "string" ? asset.metadata.posterUrl : "";
    setPosterUrl(nextPoster);
    posterSavedRef.current = Boolean(nextPoster);
    setVideoReady(false);
    setFailed(false);
    setProgress(0);
    setPlaying(false);
    posterCaptureQueuedRef.current = false;
  }, [asset.id, asset.filePath, asset.metadata?.posterUrl]);

  const clearHoverTimer = () => {
    if (hoverTimerRef.current !== undefined) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = undefined;
    }
  };

  const playVideo = () => {
    const video = videoRef.current;
    if (!video || failed) return;
    void video.play().then(() => setPlaying(true)).catch(() => setFailed(true));
  };

  const pauseVideo = () => {
    const video = videoRef.current;
    clearHoverTimer();
    if (!video) return;
    video.pause();
    setPlaying(false);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.preload = "auto";
    video.load();
  }, [asset.id, asset.filePath]);

  useEffect(() => () => clearHoverTimer(), []);

  useEffect(() => {
    const onLoopChange = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      setLoopEnabled(typeof next === "boolean" ? next : window.localStorage.getItem("studio-storyboard-video-loop") !== "off");
    };
    window.addEventListener("studio-storyboard-video-loop", onLoopChange);
    return () => window.removeEventListener("studio-storyboard-video-loop", onLoopChange);
  }, []);

  const toggleLoopForAllVideos = () => {
    const next = !loopEnabled;
    window.localStorage.setItem("studio-storyboard-video-loop", next ? "on" : "off");
    window.dispatchEvent(new CustomEvent("studio-storyboard-video-loop", { detail: next }));
  };

  const capturePoster = (video: HTMLVideoElement) => {
    if (posterSavedRef.current || !window.studioBridge?.saveVideoPoster) return;
    if (!video.videoWidth || !video.videoHeight) return;
    try {
      const maxWidth = 360;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      if (!dataUrl.startsWith("data:image/jpeg")) return;
      posterSavedRef.current = true;
      setPosterUrl(dataUrl);
      window.studioBridge.saveVideoPoster({ assetId: asset.id, dataUrl }).catch(() => {
        posterSavedRef.current = false;
      });
    } catch {
      posterCaptureQueuedRef.current = false;
    }
  };

  const queuePosterCapture = (video: HTMLVideoElement) => {
    if (posterSavedRef.current || posterCaptureQueuedRef.current) return;
    posterCaptureQueuedRef.current = true;
    try {
      const targetTime = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.08, Math.max(0, video.duration - 0.01))
        : 0;
      if (Math.abs(video.currentTime - targetTime) > 0.01) {
        video.currentTime = targetTime;
        return;
      }
    } catch {
      // Some media backends reject early seeks; loadeddata/canplay will still try capture.
    }
    capturePoster(video);
  };

  const displayPosterUrl = posterUrl || fallbackPosterUrl || "";
  const showVideoFrame = !failed && (videoReady || !displayPosterUrl);

  return (
    <div
      className="storyboard-shot-image storyboard-video-preview"
      onClick={onSelectShot}
      onPointerEnter={() => {
        clearHoverTimer();
        hoverTimerRef.current = window.setTimeout(playVideo, 1000);
      }}
      onPointerLeave={pauseVideo}
      title="Xem trước video đã tạo"
    >
      <div className={`storyboard-frame ${frameOrientation(aspectRatio)}`} style={aspectStyle}>
        {displayPosterUrl ? <img className={`storyboard-video-poster ${videoReady && !failed ? "loaded" : ""}`} src={displayPosterUrl} alt="" aria-hidden="true" /> : null}
        {failed ? <span className="storyboard-video-unavailable" role="status"><AlertTriangle size={18} /> Video không khả dụng</span> : null}
        {!failed ? (
          <>
            <video
              ref={videoRef}
              className={showVideoFrame ? "visible" : ""}
              src={asset.filePath}
              poster={posterUrl || undefined}
              crossOrigin="anonymous"
              muted
              loop={loopEnabled}
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                setFailed(false);
                queuePosterCapture(event.currentTarget);
              }}
              onLoadedData={(event) => {
                setVideoReady(true);
                queuePosterCapture(event.currentTarget);
                capturePoster(event.currentTarget);
              }}
              onCanPlay={(event) => {
                setVideoReady(true);
                queuePosterCapture(event.currentTarget);
                capturePoster(event.currentTarget);
              }}
              onSeeked={(event) => {
                setVideoReady(true);
                capturePoster(event.currentTarget);
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                setProgress(video.duration ? video.currentTime / video.duration : 0);
              }}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onError={() => {
                setFailed(true);
                onUnavailable(asset);
              }}
            />
            <button
              type="button"
              className={`storyboard-video-toggle ${playing ? "playing" : ""}`}
      title={playing ? "Tạm dừng video" : "Phát video"}
              aria-label={playing ? "Tạm dừng video storyboard" : "Phát video storyboard"}
              onClick={(event) => {
                event.stopPropagation();
                if (playing) pauseVideo();
                else playVideo();
              }}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              className={`storyboard-video-loop ${loopEnabled ? "active" : ""}`}
      title={loopEnabled ? "Tắt lặp cho toàn bộ video storyboard" : "Bật lặp cho toàn bộ video storyboard"}
              aria-label={loopEnabled ? "Tắt lặp video" : "Bật lặp video"}
              onClick={(event) => {
                event.stopPropagation();
                toggleLoopForAllVideos();
              }}
            >
              <Repeat size={13} />
            </button>
            <div className="storyboard-video-progress" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </>
        ) : null}
        <small className="storyboard-media-badge" aria-label={`Shot ${shotOrder} ${failed ? "video lỗi" : "video sẵn sàng"}`}>
          <Film size={12} />
          SH{shotOrder}
        </small>
      </div>
    </div>
  );
}
