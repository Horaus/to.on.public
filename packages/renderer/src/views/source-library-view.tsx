import type {
  Asset, AutomationJob,
  Scene, Shot
} from "@studio/types";
import {
  Film,
  Library
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { isLikelyEphemeralMediaUrl, isShotKeyframeAsset, isVerifiedVideoAssetForShot } from "@studio/workflow/media-asset-selectors";
import { formatLabel } from "@studio/renderer-core/ui-format";

type SourceGroupMode = "scene" | "shot" | "custom";
type SourceResolvedAsset = { asset: Asset; shot?: Shot; scene?: Scene; job?: AutomationJob; groupName: string; typeName: string };

const imagePreviewSrc = (asset: Asset | undefined) => typeof asset?.metadata?.previewUrl === "string" && asset.metadata.previewUrl
  ? asset.metadata.previewUrl
  : typeof asset?.metadata?.posterUrl === "string" && asset.metadata.posterUrl
    ? asset.metadata.posterUrl
    : asset?.filePath || "";

export function sourceAssetName(asset: Asset) {
  const authoredFilename = typeof asset.metadata?.filename === "string" ? asset.metadata.filename.trim() : "";
  const technicalNamePattern = /(?:^|[\\/])(?:studio-(?:shot-bridge|flow)-(?:retry_)?job|google[_-]flow[_-]job|chatgpt[_-](?:storyboard|image)(?:[_-]job)?|freepik[_-]job)[^\\/]*\.(?:mp4|mov|webm|png|jpe?g|webp)$/i;
  if (authoredFilename && !technicalNamePattern.test(authoredFilename)) return authoredFilename;
  if (asset.filePath?.startsWith("data:")) {
    const extension = asset.type === "video" ? "mp4" : asset.type === "audio" ? "mp3" : "png";
    const label = asset.type === "video" ? "video-tao" : asset.type === "audio" ? "am-thanh" : asset.type === "reference" ? "anh-tham-chieu" : "anh-tao";
    return `${label}.${extension}`;
  }
  const raw = asset.filePath || asset.id;
  const technicalGeneratedName = technicalNamePattern.test(raw)
    || (!asset.filePath && /^asset[_-][a-z0-9]+$/i.test(asset.id));
  if (technicalGeneratedName) {
    if (asset.type === "video") return "Video tạo bằng AI";
    if (asset.type === "audio") return "Âm thanh tạo bằng AI";
    if (asset.type === "reference") return "Ảnh tham chiếu đã khóa";
    return "Ảnh tạo bằng AI";
  }
  try {
    const url = new URL(raw);
    const filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || asset.id);
    if (/^studio-(?:shot-bridge|flow)-(?:retry-)?job[_-]/i.test(filename)) return generatedAssetFallbackName(asset);
    return filename;
  } catch {
    const filename = decodeURIComponent(raw.split(/[\\/]/).filter(Boolean).at(-1) || asset.id);
    if (/^studio-(?:shot-bridge|flow)-(?:retry-)?job[_-]/i.test(filename)) return generatedAssetFallbackName(asset);
    return filename;
  }
}

function generatedAssetFallbackName(asset: Asset) {
  if (asset.type === "video") return "Video tạo bằng AI";
  if (asset.type === "audio") return "Âm thanh tạo bằng AI";
  if (asset.type === "reference") return "Ảnh tham chiếu";
  return "Ảnh tạo bằng AI";
}

export function sourceAssetUri(asset: Asset) {
  if (!asset.filePath) return "";
  if (asset.filePath.startsWith("data:")) return asset.filePath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(asset.filePath)) return asset.filePath;
  if (asset.filePath.startsWith("/")) return `file://${encodeURI(asset.filePath)}`;
  return asset.filePath;
}

export function sourceAssetMime(asset: Asset) {
  if (asset.type === "video") return "video/mp4";
  if (asset.type === "audio") return "audio/mpeg";
  if (asset.type === "image" || asset.type === "reference") return "image/png";
  return "application/octet-stream";
}

export function sourceAssetTypeLabel(asset: Asset, job: AutomationJob | undefined) {
  if (job?.jobType === "video") return "Video tạo bằng AI";
  if (job?.jobType === "image") return "Ảnh tạo bằng AI";
  if (asset.type === "reference") return "Ảnh tham chiếu đã khóa";
  return formatLabel(asset.type);
}

export function isOfficialSourceShotAsset(asset: Asset, shot: Shot | undefined, jobs: AutomationJob[], assets: Asset[]) {
  if (!shot || !shot.assetIds.includes(asset.id) || asset.metadata?.hiddenFromStoryboard) return false;
  const job = jobs.find((item) => item.id === asset.sourceJobId || item.resultAssetIds.includes(asset.id));
  if (asset.metadata?.demo) return true;
  if (asset.type === "image" || asset.type === "reference") {
    return isShotKeyframeAsset(asset, jobs);
  }
  if (asset.type === "video") {
    return isVerifiedVideoAssetForShot(asset, shot, jobs, assets);
  }
  return false;
}

export function SourceLibrary({ assets, scenes, shots, jobs }: { assets: Asset[]; scenes: Scene[]; shots: Shot[]; jobs: AutomationJob[] }) {
  const [groupMode, setGroupMode] = useState<SourceGroupMode>("scene");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[]>(() => assets.map((asset) => asset.id));
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const sourceGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCustomOrder((current) => {
      const existing = current.filter((id) => assets.some((asset) => asset.id === id));
      const incoming = assets.filter((asset) => !existing.includes(asset.id)).map((asset) => asset.id);
      return [...existing, ...incoming];
    });
    setSelectedIds((current) => current.filter((id) => assets.some((asset) => asset.id === id)));
  }, [assets]);

  const shotByAssetId = useMemo(() => {
    const map = new Map<string, Shot>();
    shots.forEach((shot) => shot.assetIds.forEach((assetId) => map.set(assetId, shot)));
    return map;
  }, [shots]);
  const sceneById = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene])), [scenes]);
  const jobByAssetId = useMemo(() => {
    const map = new Map<string, AutomationJob>();
    jobs.forEach((job) => job.resultAssetIds.forEach((assetId) => map.set(assetId, job)));
    return map;
  }, [jobs]);
  const resolvedAssets = useMemo<SourceResolvedAsset[]>(() => {
    return assets.map((asset) => {
      const job = jobByAssetId.get(asset.id) ?? jobs.find((item) => item.id === asset.sourceJobId);
      const linkedShot = shotByAssetId.get(asset.id);
      const shot = isOfficialSourceShotAsset(asset, linkedShot, jobs, assets) ? linkedShot : undefined;
      const scene = shot ? sceneById.get(shot.sceneId) : undefined;
      const typeName = sourceAssetTypeLabel(asset, job);
      const groupName = scene && shot
        ? `SC${String(scene.order).padStart(2, "0")} · SH${shot.order}`
        : linkedShot || job?.shotId
          ? "Hộp thư · cần đối chiếu"
            : job?.jobType
            ? "Hộp thư · cần phân loại"
            : "Hộp thư · chưa phân loại";
      return { asset, shot, scene, job, groupName, typeName };
    });
  }, [assets, jobByAssetId, jobs, sceneById, shotByAssetId, shots]);
  const resolvedById = useMemo(() => new Map(resolvedAssets.map((item) => [item.asset.id, item])), [resolvedAssets]);

  const orderedAssets = useMemo(() => {
    if (groupMode === "custom") {
      const order = new Map(customOrder.map((id, index) => [id, index]));
      return [...assets].sort((a, b) => (order.get(a.id) ?? 99999) - (order.get(b.id) ?? 99999));
    }
    return [...assets].sort((a, b) => {
      const resolvedA = resolvedById.get(a.id);
      const resolvedB = resolvedById.get(b.id);
      const shotA = resolvedA?.shot;
      const shotB = resolvedB?.shot;
      const sceneA = resolvedA?.scene;
      const sceneB = resolvedB?.scene;
      return (sceneA?.order ?? 999) - (sceneB?.order ?? 999) || (shotA?.order ?? 999) - (shotB?.order ?? 999) || b.createdAt.localeCompare(a.createdAt);
    });
  }, [assets, customOrder, groupMode, resolvedById]);

  const groups = useMemo(() => {
    const output: Array<{ id: string; title: string; detail: string; assets: Asset[] }> = [];
    const ensureGroup = (id: string, title: string, detail: string) => {
      let group = output.find((item) => item.id === id);
      if (!group) {
        group = { id, title, detail, assets: [] };
        output.push(group);
      }
      return group;
    };
    if (groupMode === "custom") return [{ id: "custom", title: "Thứ tự tùy chỉnh", detail: `${assets.length} tài nguyên`, assets: orderedAssets }];
    orderedAssets.forEach((asset) => {
      const resolved = resolvedById.get(asset.id);
      const shot = resolved?.shot;
      const scene = resolved?.scene;
      if (groupMode === "shot") {
        ensureGroup(shot?.id ?? resolved?.groupName ?? "unassigned", shot ? `SH${shot.order} · ${shot.durationSec}s` : resolved?.groupName ?? "Chưa gán", scene?.title ?? resolved?.typeName ?? "Chưa có shot storyboard").assets.push(asset);
      } else {
        ensureGroup(scene?.id ?? resolved?.groupName ?? "unassigned", scene ? `SC${String(scene.order).padStart(2, "0")} · ${scene.title}` : resolved?.groupName ?? "Chưa gán", scene ? `${shots.filter((shotItem) => shotItem.sceneId === scene.id).length} shot` : resolved?.typeName ?? "Chưa liên kết cảnh").assets.push(asset);
      }
    });
    return output;
  }, [assets.length, groupMode, orderedAssets, resolvedById, shots]);

  function selectAsset(assetId: string, event: React.MouseEvent) {
    const orderedIds = orderedAssets.map((asset) => asset.id);
    if (event.shiftKey && lastSelectedId && orderedIds.includes(lastSelectedId)) {
      const start = orderedIds.indexOf(lastSelectedId);
      const end = orderedIds.indexOf(assetId);
      const range = orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
      setSelectedIds(Array.from(new Set([...selectedIds, ...range])));
    } else if (event.metaKey || event.ctrlKey) {
      setSelectedIds((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]);
      setLastSelectedId(assetId);
    } else {
      setSelectedIds([assetId]);
      setLastSelectedId(assetId);
    }
  }

  function moveSelected(direction: -1 | 1) {
    if (selectedIds.length === 0) return;
    setCustomOrder((current) => {
      const next = [...current];
      const indexes = selectedIds.map((id) => next.indexOf(id)).filter((index) => index >= 0).sort((a, b) => direction < 0 ? a - b : b - a);
      indexes.forEach((index) => {
        const target = index + direction;
        if (target < 0 || target >= next.length || selectedIds.includes(next[target])) return;
        [next[index], next[target]] = [next[target], next[index]];
      });
      return next;
    });
  }

  function startAssetDrag(asset: Asset, event: React.DragEvent<HTMLElement>) {
    const dragIds = selectedIds.includes(asset.id) ? selectedIds : [asset.id];
    const dragAssets = assets.filter((item) => dragIds.includes(item.id));
    const uris = dragAssets.map(sourceAssetUri);
    const names = dragAssets.map(sourceAssetName);
    event.dataTransfer.effectAllowed = "copyLink";
    event.dataTransfer.setData("text/plain", uris.join("\n"));
    event.dataTransfer.setData("text/uri-list", uris.join("\n"));
    event.dataTransfer.setData("application/x-studio-assets", JSON.stringify(dragAssets.map((item) => ({ id: item.id, type: item.type, filePath: item.filePath, name: sourceAssetName(item) }))));
    if (dragAssets.length === 1) event.dataTransfer.setData("DownloadURL", `${sourceAssetMime(dragAssets[0])}:${names[0]}:${uris[0]}`);
    const label = document.createElement("div");
    label.className = "source-drag-ghost";
    label.textContent = dragAssets.length === 1 ? names[0] : `${dragAssets.length} tài nguyên`;
    document.body.appendChild(label);
    event.dataTransfer.setDragImage(label, 12, 12);
    window.setTimeout(() => label.remove(), 0);
  }

  function openAsset(asset: Asset) {
    if (asset.filePath?.startsWith("data:")) {
      window.open(asset.filePath, "_blank", "noopener,noreferrer");
      return;
    }
    if (window.studioBridge?.openAsset) {
      void window.studioBridge.openAsset(asset.id);
      return;
    }
    const uri = sourceAssetUri(asset);
    if (/^https?:|^data:/i.test(uri)) window.open(uri, "_blank", "noopener,noreferrer");
    else void navigator.clipboard?.writeText(uri);
  }

  function beginMarquee(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".source-card, button")) return;
    const bounds = sourceGridRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const startX = event.clientX - bounds.left;
    const startY = event.clientY - bounds.top;
    setMarquee({ startX, startY, x: startX, y: startY });
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) setSelectedIds([]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateMarquee(event: React.PointerEvent<HTMLDivElement>) {
    if (!marquee || !sourceGridRef.current) return;
    const bounds = sourceGridRef.current.getBoundingClientRect();
    const next = { ...marquee, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setMarquee(next);
    const selectionRect = {
      left: Math.min(next.startX, next.x) + bounds.left,
      right: Math.max(next.startX, next.x) + bounds.left,
      top: Math.min(next.startY, next.y) + bounds.top,
      bottom: Math.max(next.startY, next.y) + bounds.top
    };
    const ids = Array.from(sourceGridRef.current.querySelectorAll<HTMLElement>(".source-card"))
      .filter((card) => {
        const box = card.getBoundingClientRect();
        return box.left < selectionRect.right && box.right > selectionRect.left && box.top < selectionRect.bottom && box.bottom > selectionRect.top;
      })
      .map((card) => card.dataset.assetId)
      .filter(Boolean) as string[];
    setSelectedIds(ids);
  }

  function endMarquee(event: React.PointerEvent<HTMLDivElement>) {
    if (!marquee) return;
    setMarquee(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const selectedAssets = assets.filter((asset) => selectedIds.includes(asset.id));
  const selectedExternalCount = selectedAssets.filter((asset) => Boolean(asset.filePath && !asset.filePath.startsWith("data:"))).length;

  return (
    <div className="source-library">
      <div className="source-toolbar">
        <div className="source-tabs" role="tablist" aria-label="Cách nhóm nguồn">
          {[
            ["scene", "Cảnh"],
            ["shot", "Shot"],
            ["custom", "Tùy chỉnh"]
          ].map(([value, label]) => (
            <button type="button" role="tab" aria-selected={groupMode === value} key={value} className={groupMode === value ? "active" : ""} onClick={() => setGroupMode(value as SourceGroupMode)}>{label}</button>
          ))}
        </div>
        <div className="source-selection-status">
          <strong>{selectedIds.length || assets.length}</strong>
          <span>{selectedIds.length ? `${selectedExternalCount} sẵn sàng kéo ra ngoài` : `${assets.length} tài nguyên`}</span>
        </div>
        {groupMode === "custom" ? (
          <div className="source-order-actions">
            <button type="button" disabled={selectedIds.length === 0} onClick={() => moveSelected(-1)}>Đưa lên</button>
            <button type="button" disabled={selectedIds.length === 0} onClick={() => moveSelected(1)}>Đưa xuống</button>
          </div>
        ) : null}
      </div>
      {assets.length === 0 ? (
        <div className="source-empty">
          <Library size={22} />
          <strong>Chưa có tài nguyên nguồn</strong>
          <span>Video, ảnh, âm thanh và ảnh tham chiếu đã tạo sẽ xuất hiện ở đây để dùng lại hoặc kéo ra ngoài.</span>
        </div>
      ) : (
        <div className="source-groups" ref={sourceGridRef} onPointerDown={beginMarquee} onPointerMove={updateMarquee} onPointerUp={endMarquee} onPointerCancel={endMarquee}>
          {marquee ? (
            <span
              className="source-marquee"
              style={{
                left: Math.min(marquee.startX, marquee.x),
                top: Math.min(marquee.startY, marquee.y),
                width: Math.abs(marquee.x - marquee.startX),
                height: Math.abs(marquee.y - marquee.startY)
              }}
            />
          ) : null}
          {groups.map((group) => (
            <section className="source-group" key={group.id}>
              <div className="source-group-head">
                <div><strong>{group.title}</strong><span>{group.detail}</span></div>
                <small>{group.assets.length} tệp</small>
              </div>
              <div className="source-grid">
                {group.assets.map((asset) => {
                  const resolved = resolvedById.get(asset.id);
                  const shot = resolved?.shot;
                  const scene = resolved?.scene;
                  const job = resolved?.job;
                  const selected = selectedIds.includes(asset.id);
                  return (
                    <article
                      className={`source-card ${selected ? "selected" : ""}`}
                      key={asset.id}
                      data-asset-id={asset.id}
                      draggable
                      onClick={(event) => selectAsset(asset.id, event)}
                      onDoubleClick={() => openAsset(asset)}
                      onDragStart={(event) => startAssetDrag(asset, event)}
                    >
                      <div className="source-thumb">
                        {asset.metadata?.demo
                          ? <Film size={22} />
                          : asset.type === "video" && !isLikelyEphemeralMediaUrl(asset.filePath)
                          ? <video src={asset.filePath} poster={imagePreviewSrc(asset)} muted playsInline preload="metadata" />
                          : asset.type === "image" || asset.type === "reference"
                            ? <img src={imagePreviewSrc(asset)} alt="" />
                            : asset.type === "audio"
                              ? <div className="source-wave"><span /><span /><span /><span /></div>
                              : <Film size={22} />}
                        <span>{resolved?.typeName ?? sourceAssetTypeLabel(asset, job)}</span>
                      </div>
                      <div className="source-card-copy">
                        <dl>
                          <div><dt>Tên</dt><dd>{sourceAssetName(asset)}</dd></div>
                          <div><dt>Nhóm</dt><dd>{scene && shot ? `SC${String(scene.order).padStart(2, "0")} · SH${shot.order}` : resolved?.groupName ?? "Chưa phân nhóm"}</dd></div>
                          <div><dt>Loại</dt><dd>{resolved?.typeName ?? sourceAssetTypeLabel(asset, job)}</dd></div>
                        </dl>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
