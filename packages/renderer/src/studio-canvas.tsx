import type {
  Asset, CanvasDocument, CanvasGroupSpec, CanvasNodeData, GroupNodeData, ImageGeneratorCanvasDocument, SectionNodeData, VideoAspectRatio,
  ProductionFormat,
  ProductionGraphCustomNode, ProductionGraphNodeSettings,
  ProductionGraphRevision,
  ProjectIntake,
  Scene,
  VisualReference
} from "@studio/types";
import {
  Background, Handle, Position, ReactFlow,
  useEdgesState, useNodesState, type Edge, type Node as FlowNode, type NodeProps, type ReactFlowInstance
} from "@xyflow/react";
import {
  ChevronRight,
  Download,
  Expand,
  Film,
  Hand,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  MousePointer2,
  Play,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  languageCodeFromPromptName,
  languageOptions,
  promptNameFromLanguageCode
} from "@studio/renderer-core/i18n";
import { defaultSceneContinuity, durationSecondsPatch, finiteInputNumber, flowMediaRatioClass, imageNodeSrc, imagePreviewSrc, productionFormatPatch, readFileAsDataUrl, videoFramePatch } from "@studio/renderer-core/production-ui-support";
import type { FlowDocument } from "@studio/types";
import { formatLabel } from "@studio/renderer-core/ui-format";
import { isProjectJobBusy } from "./core/job-status";

function flowValueLabel(value?: string): string {
  const labels: Record<string, string> = {
    idea: "Ý tưởng",
    short_video: "Video ngắn",
    short_film: "Phim ngắn",
    video_series: "Series video",
    Vietnamese: "Tiếng Việt",
    Vietnamese_language: "Tiếng Việt",
    "short-drama-video": "Phim ngắn kịch tính"
  };
  return value ? labels[value] || formatLabel(value) : "Chưa xác định";
}

function FlowMediaPreviewFocusTrap() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".flow-media-preview-dialog");
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")) : [];
      if (!focusable.length || !dialog?.contains(document.activeElement)) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

function FlowMediaDocument({ document, onOpenAsset, onOpenDocument, onRegenerate, onUpdateSettings }: { document: Extract<CanvasDocument, { kind: "image" | "video" }>; onOpenAsset: () => void; onOpenDocument: () => void; onRegenerate: (asset: Asset, instruction?: string, settings?: ProductionGraphNodeSettings) => void; onUpdateSettings: (patch: ProductionGraphNodeSettings) => void }) {
  const versions = document.versions?.length ? document.versions : [document.asset];
  const [selectedAssetId, setSelectedAssetId] = useState(document.asset.id);
  const [instruction, setInstruction] = useState("");
  const [intrinsicAspectRatio, setIntrinsicAspectRatio] = useState<number>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const asset = versions.find((candidate) => candidate.id === selectedAssetId) || versions.at(-1) || document.asset;
  const { title, providerName, aspectRatio = "16:9", durationSec, resolution = "720p" } = document;
  const isVideo = asset.type === "video";
  const isPlaceholder = !asset.filePath;
  const runActive = Boolean(document.activeJob && isProjectJobBusy(document.activeJob));
  const supportsFitContent = !isVideo && document.fitContent === true;
  const fitIntrinsicImage = supportsFitContent && !document.hasAspectRatioOverride;
  const compatibleProviders = (document.providers ?? []).filter((provider) => provider.capabilities.includes(isVideo ? "video" : "image"));
  const ratioClass = flowMediaRatioClass(aspectRatio);
  const frameOwnedRatio = document.groupId === "assets";
  const mediaTypeLabel = isVideo ? "Video" : document.slot === "scene-keyframe" ? "Ảnh cảnh" : document.slot === "keyframe" ? "Ảnh shot" : "Ảnh";
  const mediaStateLabel = runActive ? "Đang tạo" : isPlaceholder ? "Chưa tạo" : "Sẵn sàng";
  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);
  useEffect(() => {
    setSelectedAssetId(document.asset.id);
  }, [document.asset.id]);
  const downloadOutput = () => {
    if (!window.studioBridge?.saveAsset) return;
    void window.studioBridge.saveAsset({ assetId: asset.id, sourcePath: asset.filePath, suggestedName: title });
  };
  return (
    <div className={`flow-document-node-stack flow-media-document ${isVideo ? "video" : "image"} ${document.mediaRole || "generated"} ${frameOwnedRatio ? "frame-owned" : ""}`}>
      {versions.length > 1 ? <div className="flow-version-rail media nodrag" aria-label={`Các phiên bản của ${title}`}>
        {versions.map((version, index) => <button type="button" key={version.id} className={version.id === asset.id ? "active" : ""} title={`Phiên bản ${index + 1}`} aria-label={`Chọn phiên bản ${index + 1}`} onClick={() => { setSelectedAssetId(version.id); onUpdateSettings({ selectedAssetId: version.id }); }}><img src={imagePreviewSrc(version)} alt="" /></button>)}
      </div> : null}
      <div className={`flow-media-heading flow-node-drag-handle status-${runActive ? "running" : isPlaceholder ? "empty" : "ready"}`}>
        <span>{isVideo ? <Film size={13} /> : <ImageIcon size={13} />} {mediaTypeLabel}</span>
        <strong>{mediaStateLabel}</strong>
        <small title={providerName ? `Công cụ: ${providerName}` : undefined}>{providerName || "Định tuyến AI"}</small>
      </div>
      <div className={`flow-media-surface ${fitIntrinsicImage && intrinsicAspectRatio ? "intrinsic" : ratioClass}`} style={fitIntrinsicImage && intrinsicAspectRatio ? { "--flow-intrinsic-ratio": intrinsicAspectRatio } as React.CSSProperties : undefined}>
        <div className="flow-document-media">
          {isPlaceholder
            ? <div className="flow-empty-media">{isVideo ? <Film size={22} /> : <ImageIcon size={22} />}<strong>{isVideo ? "Chưa có video" : "Chưa có ảnh"}</strong><span>Chạy bước này hoặc tiếp tục luồng sản xuất.</span></div>
            : isVideo
            ? <video src={asset.filePath} poster={imagePreviewSrc(asset)} controls playsInline preload="metadata" className="nodrag" />
              : <img src={imageNodeSrc(asset)} alt="" decoding="async" onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setIntrinsicAspectRatio(image.naturalWidth / image.naturalHeight); }} />}
          {!isPlaceholder ? <button type="button" className="flow-media-open-details nodrag" aria-label={`Mở chi tiết ${title}`} title="Mở chi tiết" onClick={() => setPreviewOpen(true)}><Expand size={14} /></button> : null}
        </div>
      {document.canRun ? <div className="flow-media-prompt nodrag"><input aria-label={`Yêu cầu chạy cho ${title}`} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ghi chú thay đổi (không bắt buộc)" /><button type="button" className="flow-media-run" aria-label={`${isPlaceholder ? "Tạo" : "Tạo lại"} ${title} · Chạy`} title={`${isPlaceholder ? "Tạo" : "Tạo lại"} ${mediaTypeLabel.toLowerCase()}`} disabled={runActive} onClick={() => { onRegenerate(asset, instruction.trim(), { providerId: document.providerId, aspectRatio: aspectRatio as VideoAspectRatio, outputLanguage: document.outputLanguage, videoQuality: document.videoQuality, generateAudio: document.generateAudio }); setInstruction(""); }}>{runActive ? <Loader2 className="spin" size={13} /> : isPlaceholder ? <Play size={13} /> : <Sparkles size={13} />}</button></div> : <div className="flow-media-prompt"><span>{isVideo ? "Video sẽ xuất hiện ở đây" : "Ảnh sẽ xuất hiện ở đây"}</span></div>}
      </div>
      <div className="flow-media-toolbar nodrag"><div className="flow-media-settings compact" aria-label={`Thiết lập tạo video cho ${title}`}>
        <span className="flow-media-setting-summary" title="Mở tuỳ chọn để thay đổi thiết lập">{aspectRatio}</span>
        <span className="flow-media-setting-summary">{flowValueLabel(document.outputLanguage)}</span>
        {!isPlaceholder ? <span>{resolution}</span> : null}{isVideo && durationSec ? <span>{durationSec}s</span> : null}
        <button type="button" title="Tải kết quả" aria-label={`Tải ${title}`} disabled={isPlaceholder} onClick={downloadOutput}><Download size={13} /></button>
        <button type="button" title="Thêm tuỳ chọn" aria-label={`Thêm tuỳ chọn cho ${title}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}><MoreHorizontal size={14} /></button>
      </div>{menuOpen ? <div className="flow-media-more-menu" role="menu"><div className="flow-media-menu-title">Thiết lập tạo {mediaTypeLabel.toLowerCase()}</div><label>Công cụ<select aria-label={`Công cụ AI cho ${title}`} value={document.providerId || ""} onChange={(event) => onUpdateSettings({ providerId: event.target.value })}>{compatibleProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>Khung hình<select aria-label={`Tỷ lệ khung hình cho ${title}`} title={frameOwnedRatio ? "Được khung tài nguyên cha điều khiển" : undefined} disabled={frameOwnedRatio} value={fitIntrinsicImage ? "fit" : aspectRatio} onChange={(event) => onUpdateSettings({ aspectRatio: event.target.value === "fit" ? undefined : event.target.value as VideoAspectRatio })}>{supportsFitContent ? <option value="fit">Theo nội dung</option> : null}<option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="1:1">1:1</option></select></label><label>Ngôn ngữ<select aria-label={`Ngôn ngữ thoại cho ${title}`} title="Ngôn ngữ thoại, thuyết minh và âm thanh gốc" value={languageCodeFromPromptName(document.outputLanguage)} onChange={(event) => onUpdateSettings({ outputLanguage: promptNameFromLanguageCode(event.target.value) })}>{languageOptions.filter((language) => language.enabled).map((language) => <option key={language.code} value={language.code}>{language.nativeLabel}</option>)}</select></label>{isVideo ? <><label>Chất lượng<select aria-label={`Chất lượng cho ${title}`} value={document.videoQuality || "fast"} onChange={(event) => onUpdateSettings({ videoQuality: event.target.value as "fast" | "quality" })}><option value="fast">Nhanh · 720p</option><option value="quality">Cao · tối đa 1080p</option></select></label><label className="flow-audio-toggle"><input type="checkbox" checked={document.generateAudio === true} onChange={(event) => onUpdateSettings({ generateAudio: event.target.checked })} /> Tạo âm thanh</label><small className="flow-credit-estimate">Thoại được gán ngầm theo nhân vật đã khóa. Ước tính {document.estimatedCredits?.min ?? 20}{document.estimatedCredits && document.estimatedCredits.max !== document.estimatedCredits.min ? `-${document.estimatedCredits.max}` : ""} credits; Flow hiển thị chi phí cuối.</small></> : null}<button type="button" onClick={() => { onUpdateSettings({ providerId: undefined, aspectRatio: undefined, outputLanguage: undefined, videoQuality: undefined, generateAudio: undefined }); setMenuOpen(false); }}><RefreshCcw size={13} /> Dùng thiết lập sản xuất</button><button type="button" onClick={() => { onOpenDocument(); setMenuOpen(false); }}><ChevronRight size={13} /> Mở trong ứng dụng</button><button type="button" onClick={() => { onOpenAsset(); setMenuOpen(false); }}><MoreHorizontal size={13} /> Mở tệp nguồn</button></div> : null}</div>
        {previewOpen ? createPortal(<div className="flow-media-preview-overlay" role="dialog" aria-modal="true" aria-label={`Bản xem trước ${title}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}><section className={`flow-media-preview-dialog ${isVideo ? "video" : "image"}`}><FlowMediaPreviewFocusTrap /><button type="button" autoFocus className="flow-media-preview-close" title="Đóng bản xem trước" aria-label="Đóng bản xem trước" onClick={() => setPreviewOpen(false)}><X size={18} /></button>{isVideo ? <video src={asset.filePath} poster={imagePreviewSrc(asset)} controls autoPlay playsInline /> : <img src={imageNodeSrc(asset)} alt={title} />}</section></div>, window.document.body) : null}
    </div>
  );
}

function FlowUploadImageDocument({ document, aspectRatio, onUpdate }: { document: Extract<CanvasDocument, { kind: "upload-image" }>; aspectRatio: string; onUpdate: (patch: Partial<ProjectIntake>) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [intrinsicAspectRatio, setIntrinsicAspectRatio] = useState<number>();
  const ratioClass = flowMediaRatioClass(aspectRatio);
  const chooseFile = () => fileRef.current?.click();
  const setFile = async (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const current = document.dataUrl;
    const dataUrl = await readFileAsDataUrl(file);
    if (current === dataUrl) return;
    onUpdate({
      quickVisualInput: {
        name: file.name,
        mimeType: file.type,
        dataUrl,
        sourceDescription: "",
        transformationRequest: "",
        updatedAt: new Date().toISOString()
      }
    });
  };
  return (
    <div className="flow-document-node-stack flow-upload-document">
      <div className="flow-media-heading flow-node-drag-handle">
        <span><Upload size={13} /> Ảnh đầu vào</span>
        <strong>Tải lên</strong>
      </div>
      <button type="button" className={`flow-upload-surface nodrag ${document.dataUrl && intrinsicAspectRatio ? "intrinsic" : ratioClass} ${document.dataUrl ? "has-image" : "empty"}`} aria-label={document.dataUrl ? `Thay ảnh đầu vào cho ${document.title}` : `Tải ảnh tham chiếu cho ${document.title}`} style={document.dataUrl && intrinsicAspectRatio ? { "--flow-intrinsic-ratio": intrinsicAspectRatio } as React.CSSProperties : undefined} onClick={chooseFile}>
        {document.dataUrl ? <img src={document.dataUrl} alt={document.title} onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setIntrinsicAspectRatio(image.naturalWidth / image.naturalHeight); }} /> : <span><ImageIcon size={22} /> Bấm để tải ảnh tham chiếu</span>}
      </button>
      <input
        ref={fileRef}
        className="flow-upload-input"
        aria-label="Tải ảnh đầu vào"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void setFile(file);
        }}
      />
      <div className="flow-upload-actions nodrag">
        <span>{document.fileName || "Chưa tải ảnh tham chiếu"}</span>
        <button type="button" aria-label={`${document.dataUrl ? "Thay thế" : "Tải lên"} ảnh cho ${document.title}`} onClick={chooseFile}>{document.dataUrl ? "Thay thế" : "Tải lên"}</button>
        {document.dataUrl ? <button type="button" title="Bỏ ảnh đầu vào" aria-label="Bỏ ảnh đầu vào" onClick={() => onUpdate({ quickVisualInput: undefined })}><Trash2 size={13} /></button> : null}
      </div>
    </div>
  );
}

function FlowCustomUploadDocument({ document, aspectRatio, onUpdate, onDelete }: { document: { title: string; dataUrl?: string }; aspectRatio: string; onUpdate: (patch: Partial<ProductionGraphCustomNode>) => void; onDelete: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [intrinsicAspectRatio, setIntrinsicAspectRatio] = useState<number>();
  const ratioClass = flowMediaRatioClass(aspectRatio);
  const chooseFile = () => fileRef.current?.click();
  return <div className="flow-document-node-stack flow-upload-document custom">
    <div className="flow-media-heading flow-node-drag-handle"><span><Upload size={13} /> Ảnh đầu vào</span><strong>Tải lên</strong></div>
    <button type="button" className={`flow-upload-surface nodrag ${document.dataUrl && intrinsicAspectRatio ? "intrinsic" : ratioClass} ${document.dataUrl ? "has-image" : "empty"}`} aria-label={document.dataUrl ? `Thay ảnh đầu vào cho ${document.title}` : `Tải ảnh tham chiếu cho ${document.title}`} style={document.dataUrl && intrinsicAspectRatio ? { "--flow-intrinsic-ratio": intrinsicAspectRatio } as React.CSSProperties : undefined} onClick={chooseFile}>
      {document.dataUrl ? <img src={document.dataUrl} alt={document.title} onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setIntrinsicAspectRatio(image.naturalWidth / image.naturalHeight); }} /> : <span><ImageIcon size={22} /> Bấm để tải ảnh tham chiếu</span>}
    </button>
    <input ref={fileRef} className="flow-upload-input" aria-label="Tải ảnh nút tùy chỉnh" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file?.type.startsWith("image/")) return; void readFileAsDataUrl(file).then((dataUrl) => onUpdate({ dataUrl, fileName: file.name, mimeType: file.type })); }} />
    <div className="flow-upload-actions nodrag"><input aria-label="Tên nút ảnh" value={document.title} onChange={(event) => onUpdate({ title: event.target.value })} /><button type="button" aria-label={`${document.dataUrl ? "Thay thế" : "Tải lên"} ảnh cho ${document.title}`} onClick={chooseFile}>{document.dataUrl ? "Thay thế" : "Tải lên"}</button><button type="button" title="Xóa nút ảnh" aria-label={`Xóa ${document.title}`} onClick={onDelete}><Trash2 size={13} /></button></div>
  </div>;
}

function FlowImageGeneratorDocument({ document, aspectRatio, onUpdate, onUpdateSettings, onGenerate, onDelete }: { document: ImageGeneratorCanvasDocument; aspectRatio: string; onUpdate: (patch: Partial<ProductionGraphCustomNode>) => void; onUpdateSettings: (patch: ProductionGraphNodeSettings) => void; onGenerate: () => void; onDelete: () => void }) {
  const ratioClass = flowMediaRatioClass(aspectRatio);
  const frameOwnedRatio = document.groupId === "assets";
  const active = Boolean(document.job && isProjectJobBusy(document.job));
  const mediaStateLabel = active ? "Đang tạo" : document.generatedAsset ? "Sẵn sàng" : "Chưa tạo";
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className={`flow-document-node-stack flow-media-document image generator ${frameOwnedRatio ? "frame-owned" : ""}`}>
    <div className={`flow-media-heading flow-node-drag-handle status-${active ? "running" : document.generatedAsset ? "ready" : "empty"}`}><span><ImageIcon size={13} /> Ảnh</span><strong>{mediaStateLabel}</strong><small title={document.providerName ? `Công cụ: ${document.providerName}` : undefined}>{document.providerName || "Định tuyến AI"}</small></div>
    <div className={`flow-media-surface ${ratioClass}`}>
      <div className="flow-document-media">{document.generatedAsset ? <img src={imagePreviewSrc(document.generatedAsset)} alt={document.title} /> : <span className="flow-empty-generation"><ImageIcon size={22} />{active ? "Đang tạo ảnh…" : "Ảnh tạo sẽ xuất hiện ở đây"}</span>}</div>
      <div className="flow-media-prompt nodrag"><input aria-label="Mô tả ảnh cần tạo" value={document.text || ""} onChange={(event) => onUpdate({ text: event.target.value })} placeholder="Mô tả ảnh cần tạo…" /><button type="button" className="flow-media-run" aria-label={`Tạo ${document.title}`} disabled={active || !document.text?.trim()} onClick={onGenerate}>{active ? <Loader2 className="spin" size={13} /> : "Tạo"}</button></div>
    </div>
    <div className="flow-media-toolbar nodrag"><div className="flow-media-settings compact" aria-label={`Thiết lập tạo ảnh cho ${document.title}`}><span className="flow-media-setting-summary">{aspectRatio}</span><span className="flow-media-setting-summary">{flowValueLabel(document.outputLanguage)}</span><button type="button" aria-label={`Mở thiết lập cho ${document.title}`} title="Mở thiết lập" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={13} /></button><button type="button" aria-label={`Xóa nút tạo ảnh ${document.title}`} title="Xóa nút tạo ảnh" onClick={onDelete}><Trash2 size={13} /></button></div>{menuOpen ? <div className="flow-media-more-menu" role="menu"><div className="flow-media-menu-title">Thiết lập tạo ảnh</div><label>Công cụ<select aria-label={`Công cụ AI cho ${document.title}`} value={document.providerId || ""} onChange={(event) => onUpdateSettings({ providerId: event.target.value })}>{(document.providers ?? []).filter((provider) => provider.capabilities.includes("image")).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>Khung hình<select aria-label={`Tỷ lệ khung hình cho ${document.title}`} title={frameOwnedRatio ? "Được khung tài nguyên cha điều khiển" : undefined} disabled={frameOwnedRatio} value={aspectRatio} onChange={(event) => onUpdateSettings({ aspectRatio: event.target.value as VideoAspectRatio })}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="1:1">1:1</option></select></label><label>Ngôn ngữ<select aria-label={`Ngôn ngữ cho ${document.title}`} value={languageCodeFromPromptName(document.outputLanguage)} onChange={(event) => onUpdateSettings({ outputLanguage: promptNameFromLanguageCode(event.target.value) })}>{languageOptions.filter((language) => language.enabled).map((language) => <option key={language.code} value={language.code}>{language.nativeLabel}</option>)}</select></label><button type="button" onClick={() => { onUpdateSettings({ providerId: undefined, aspectRatio: undefined, outputLanguage: undefined }); setMenuOpen(false); }}><RefreshCcw size={13} /> Dùng thiết lập sản xuất</button></div> : null}</div>
  </div>;
}

const inlineGuidanceDrafts = new Map<string, string>();

type FlowTextDocumentProps = { documentId: string; kind: FlowDocument["kind"]; title: string; text: string; providerName?: string; revisions: ProductionGraphRevision[]; initialGuidance?: string; onGenerateRevision: (instruction: string) => void; onRestoreVersion: (text: string) => void; onOpen: () => void; onSave: (text: string) => void; onDelete?: () => void };

function buildFlowTextVersions(text: string, revisions: ProductionGraphRevision[]): string[] {
  const completed = revisions.filter((revision) => revision.status === "completed" && revision.outputText?.trim());
  return [completed[0]?.sourceText || text, ...completed.map((revision) => revision.outputText || "")]
    .filter((value, index, values) => value.trim() && values.indexOf(value) === index);
}

function flowTextSourceLabel(kind: FlowDocument["kind"]) {
  return ({
    brief: "Người dùng",
    story: "Câu chuyện",
    "scene-breakdown": "Phân tách cảnh",
    scene: "Kịch bản cảnh",
    shot: "Phân rã shot",
    note: "Ghi chú",
    "reference-note": "Tham chiếu"
  } as Record<string, string>)[kind] || "Nội dung sản xuất";
}

function flowTextProviderLabel(kind: FlowDocument["kind"], providerName?: string) {
  const provider = String(providerName || "").trim();
  if (!provider || provider === "Nội dung sản xuất" || provider === flowTextSourceLabel(kind)) return "";
  return provider;
}

function FlowTextDocument({ documentId, kind, title, text, providerName, revisions, initialGuidance = "", onGenerateRevision, onRestoreVersion, onOpen, onSave, onDelete }: FlowTextDocumentProps) {
  const [draft, setDraft] = useState(text);
  const [guidance, setGuidance] = useState(() => inlineGuidanceDrafts.get(documentId) ?? initialGuidance);
  const [composerOpen, setComposerOpen] = useState(Boolean(inlineGuidanceDrafts.get(documentId) ?? initialGuidance));
  const editingRef = useRef(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const onSaveRef = useRef(onSave);
  const pendingSaveRef = useRef<{ timer: number; value: string } | undefined>(undefined);
  onSaveRef.current = onSave;
  useEffect(() => {
    if (!editingRef.current) setDraft(text);
  }, [text]);
  useEffect(() => {
    if (guidance) return;
    const restored = inlineGuidanceDrafts.get(documentId) ?? initialGuidance;
    if (!restored) return;
    setGuidance(restored);
    setComposerOpen(true);
  }, [documentId, guidance, initialGuidance]);
  useEffect(() => {
    const closeEmptyComposer = (event: PointerEvent) => {
      if (!composerOpen || guidance.trim() || composerRef.current?.contains(event.target as Node)) return;
      setComposerOpen(false);
    };
    window.addEventListener("pointerdown", closeEmptyComposer);
    return () => window.removeEventListener("pointerdown", closeEmptyComposer);
  }, [composerOpen, guidance]);
  useEffect(() => () => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    onSaveRef.current(pending.value);
  }, []);
  const flushSave = () => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingSaveRef.current = undefined;
    onSaveRef.current(pending.value);
  };
  const update = (value: string) => {
    editingRef.current = true;
    setDraft(value);
    if (pendingSaveRef.current) window.clearTimeout(pendingSaveRef.current.timer);
    pendingSaveRef.current = {
      value,
      timer: window.setTimeout(flushSave, 160)
    };
  };
  const latestRevision = revisions.at(-1);
  const providerLabel = flowTextProviderLabel(kind, providerName);
  const textVersions = buildFlowTextVersions(text, revisions);
  const submitGuidance = () => {
    if (!guidance.trim() || latestRevision?.status === "queued") return;
    onGenerateRevision(guidance.trim());
    inlineGuidanceDrafts.delete(documentId);
    setGuidance("");
    setComposerOpen(false);
  };
  return (
    <div className={`flow-document-node-stack flow-text-node content kind-${kind}`}>
      <div className="flow-node-heading flow-node-drag-handle">
        <span><span className="flow-kind-label">{flowTextSourceLabel(kind)}</span>{title}</span>
        {providerLabel || onDelete ? <small title={providerLabel ? `Công cụ xử lý: ${providerLabel}` : undefined}>{providerLabel}{onDelete ? <button type="button" title="Xóa nút văn bản" aria-label={`Xóa ${title}`} onClick={onDelete}><Trash2 size={12} /></button> : null}</small> : null}
      </div>
      <div className="flow-document flow-text-document">
        <div className="flow-textarea-autosize" data-replicated-value={draft}>
          <textarea className="nodrag nowheel" aria-label={`Nội dung ${title}`} value={draft} onChange={(event) => update(event.target.value)} onBlur={() => { editingRef.current = false; flushSave(); }} placeholder="Thêm nội dung…" />
        </div>
      </div>
      {textVersions.length > 1 ? <div className="flow-version-rail text nodrag" aria-label={`Các phiên bản của ${title}`}>{textVersions.map((version, index) => <button type="button" key={`${index}:${version.slice(0, 24)}`} className={version === draft ? "active" : ""} title={`Khôi phục phiên bản ${index + 1} trong nút này`} onClick={() => onRestoreVersion(version)}>v{index + 1}</button>)}</div> : null}
      <div ref={composerRef} className={`flow-inline-action-row nodrag ${composerOpen ? "open" : ""}`}>
        <div className="flow-inline-composer-slot">{composerOpen ? <input autoFocus aria-label={`Yêu cầu chỉnh sửa cho ${title}`} value={guidance} onChange={(event) => { const value = event.target.value; inlineGuidanceDrafts.set(documentId, value); setGuidance(value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitGuidance(); } }} placeholder="Mô tả điều muốn thay đổi…" /> : null}</div>
        <button type="button" className={composerOpen || guidance.trim() ? "active" : ""} disabled={latestRevision?.status === "queued"} title="Tạo bản chỉnh sửa hỗ trợ" aria-label={`Tạo bản chỉnh sửa hỗ trợ cho ${title}`} onClick={() => composerOpen ? submitGuidance() : setComposerOpen(true)}>{latestRevision?.status === "queued" ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />}</button>
        <button type="button" title="Mở trong ứng dụng" aria-label={`Mở ${title} trong ứng dụng`} onClick={onOpen}><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

function FlowSceneContinuityDocument({ document, onSave }: { document: Extract<CanvasDocument, { kind: "scene-continuity" }>; onSave: (value: string) => void }) {
  const continuity = document.scene.continuityOverride ?? defaultSceneContinuity(document.scene, document.previousScene);
  const update = (patch: Partial<NonNullable<Scene["continuityOverride"]>>) => onSave(JSON.stringify({ ...continuity, ...patch }));
  return <div className="flow-document flow-scene-continuity-document">
    <div className="flow-document-type flow-node-drag-handle"><span>Thay đổi tài nguyên cảnh</span><small>SC{String(document.scene.order).padStart(2, "0")}</small></div>
    <div className="flow-continuity-fields nodrag">
      <label>Thay đổi bối cảnh<textarea value={continuity.notes || ""} onChange={(event) => update({ notes: event.target.value })} placeholder="Chỉ ghi thay đổi về địa điểm hoặc trạng thái môi trường" /></label>
      <label>Thay đổi nhân vật<textarea value={continuity.wardrobeChanges || ""} onChange={(event) => update({ wardrobeChanges: event.target.value })} placeholder="Chỉ ghi phần ngoại hình, trang phục hoặc trạng thái thay đổi" /></label>
      <label>Thay đổi đạo cụ<textarea value={continuity.propChanges || ""} onChange={(event) => update({ propChanges: event.target.value })} placeholder="Chỉ ghi đạo cụ được thêm, bỏ hoặc biến đổi" /></label>
    </div>
    <div className="flow-continuity-references nodrag" aria-label={`Tham chiếu hình ảnh bắt buộc cho ${document.scene.title}`}>
      {(document.requirements || []).map((requirement) => {
        const reference = document.matchedReferences.find((item) => item.characterSlot === requirement.id || (item.role === requirement.role && item.name.trim().toLowerCase() === requirement.name.trim().toLowerCase()));
        return <div className={`flow-continuity-reference ${reference ? "ready" : "pending"}`} key={requirement.id}>
          {reference ? <img src={reference.previewDataUrl || reference.filePath} alt="" /> : <div className="flow-continuity-reference-placeholder"><ImageIcon size={15} /></div>}
          <span><strong>{requirement.name}</strong><small>{reference ? "Đã có tham chiếu" : `Cần ảnh ${formatLabel(requirement.role)}`}</small></span>
        </div>;
      })}
    </div>
  </div>;
}

function FlowProfileDocument({ document, onUpdate, onResetNodeSettings, onResetLayout }: { document: Extract<CanvasDocument, { kind: "profile" }>; onUpdate: (patch: Partial<ProjectIntake>) => void; onResetNodeSettings: () => void; onResetLayout: () => void }) {
  const intake = document.intake;
  return <div className="flow-document flow-profile-document">
    <div className="flow-document-type flow-node-drag-handle"><span>Hồ sơ sản xuất</span><small>Mẫu</small></div>
    <strong>{flowValueLabel(intake.sourceType)} → {flowValueLabel(intake.productionFormat)}</strong>
    <div className="flow-profile-grid">
      <label>Định dạng<select aria-label="Định dạng" className="nodrag" value={intake.productionFormat} onChange={(event) => onUpdate(productionFormatPatch(event.target.value as ProductionFormat, intake.episodeCount))}><option value="short_film">Phim ngắn</option><option value="short_video">Video ngắn</option><option value="video_series">Series video</option></select></label>
      <label>Thời lượng (giây)<input aria-label="Thời lượng" className="nodrag" type="number" min={1} value={intake.targetDurationSec} onChange={(event) => onUpdate(durationSecondsPatch(finiteInputNumber(event.target.value, intake.targetDurationSec, { min: 1 })))} /></label>
      <label>Khung hình<select aria-label="Khung hình" className="nodrag" value={intake.videoFrame?.aspectRatio ?? "9:16"} onChange={(event) => onUpdate(videoFramePatch(event.target.value as VideoAspectRatio))}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="1:1">1:1</option></select></label>
      <label>Ngôn ngữ<select aria-label="Ngôn ngữ sản xuất" className="nodrag" value={languageCodeFromPromptName(intake.outputLanguage)} onChange={(event) => onUpdate({ outputLanguage: promptNameFromLanguageCode(event.target.value) })}>{languageOptions.map((language) => <option key={language.code} value={language.code} disabled={!language.enabled}>{language.nativeLabel}</option>)}</select></label>
    </div>
    <div className="flow-profile-facts"><span>{flowValueLabel(intake.outputLanguage)}</span><span>{flowValueLabel(intake.videoSkillId)}</span></div>
    <div className="flow-profile-actions nodrag"><button type="button" aria-label="Dùng hồ sơ sản xuất cho mọi nút" onClick={onResetNodeSettings}><RefreshCcw size={13} /> Dùng hồ sơ cho mọi nút</button><button type="button" aria-label="Đặt lại vị trí các nút" onClick={onResetLayout}><LayoutGrid size={13} /> Đặt lại vị trí nút</button></div>
  </div>;
}

function FlowGroupFrameNode({ data }: NodeProps<FlowNode<GroupNodeData, "groupFrame">>) {
  const legacyLabel = ({ "Đầu vào": "Đầu vào", "Câu chuyện hoàn chỉnh": "Câu chuyện hoàn chỉnh", "Phân tách scene": "Phân tách cảnh", "Kịch bản / thoại": "Kịch bản / thoại", "Phân rã shot": "Phân rã shot", "Chuẩn bị provider": "Chuẩn bị công cụ", "Tài nguyên": "Tài nguyên", "Ảnh scene": "Ảnh cảnh", "Tạo video": "Tạo video" } as Record<string, string>)[data.label] || data.label;
  return (
    <div className="flow-group-frame-head" aria-label={`Nhóm ${legacyLabel}`}>
      <Handle type="target" position={Position.Left} />
      <span>{String(data.order).padStart(2, "0")}</span>
      <strong>{data.label}</strong>
      <small>{data.detail}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function FlowCanvasDocumentNode({ data, selected }: NodeProps<FlowNode<CanvasNodeData, "document">>) {
  const document = data.document;
  const textDocument = document as Extract<FlowDocument, { kind: "brief" | "story" | "scene-breakdown" | "scene" | "shot" | "note" | "reference-note" }>;
  const revisionRunning = data.revisions.some((revision) => revision.status === "queued");
  const generationRunning = document.kind === "image-generator" && Boolean(document.job && isProjectJobBusy(document.job));
  const mediaRunning = Boolean(document.activeJob && isProjectJobBusy(document.activeJob));
  const runningJob = document.activeJob || (document.kind === "image-generator" ? document.job : undefined);
  return (
    <div style={selected ? { outline: "2px solid #202226", outlineOffset: "2px" } : undefined} className={`flow-canvas-document-shell ${selected ? "is-selected" : ""} ${revisionRunning || generationRunning || mediaRunning ? "is-running" : ""} ${document.slot ? `slot-${document.slot}` : ""} ${document.customKind ? `contract-${document.customKind}` : document.kind === "upload-image" || document.kind === "image" ? "contract-image" : "contract-text"}`}>
      {runningJob && (generationRunning || mediaRunning) ? <div className="flow-node-running-badge"><Loader2 className="spin" size={12} /> Tự động · {formatLabel(runningJob.status)}</div> : null}
      <Handle type="target" position={Position.Left} />
      {document.kind === "image" || document.kind === "video"
        ? <FlowMediaDocument document={document} onOpenAsset={() => data.onOpenAsset(document)} onOpenDocument={() => data.onOpenDocument(document)} onRegenerate={data.onRegenerateMedia} onUpdateSettings={(patch) => data.onUpdateNodeSettings(document.id, patch)} />
        : document.kind === "upload-image"
          ? <FlowUploadImageDocument document={document} aspectRatio={document.aspectRatio ?? "16:9"} onUpdate={data.onUpdateIntake} />
        : document.kind === "custom-upload"
          ? <FlowCustomUploadDocument document={document} aspectRatio={document.aspectRatio ?? "16:9"} onUpdate={(patch) => data.onUpdateCustomNode(document.customNode.id, patch)} onDelete={() => data.onDeleteCustomNode(document.customNode.id)} />
        : document.kind === "image-generator"
          ? <FlowImageGeneratorDocument document={document as ImageGeneratorCanvasDocument} aspectRatio={document.aspectRatio ?? "16:9"} onUpdate={(patch) => data.onUpdateCustomNode(document.customNode.id, patch)} onUpdateSettings={(patch) => data.onUpdateNodeSettings(document.id, patch)} onGenerate={() => data.onGenerateCustomImage(document.customNode)} onDelete={() => data.onDeleteCustomNode(document.customNode.id)} />
        : document.kind === "profile"
          ? <FlowProfileDocument document={document} onUpdate={data.onUpdateIntake} onResetNodeSettings={data.onResetNodeSettings} onResetLayout={data.onResetLayout} />
        : document.kind === "scene-continuity"
          ? <FlowSceneContinuityDocument document={document} onSave={(value) => data.onUpdateText(document, value)} />
          : <FlowTextDocument documentId={document.id} kind={textDocument.kind} title={textDocument.title} text={textDocument.text} providerName={document.providerName} revisions={data.revisions} initialGuidance={data.initialGuidance} onGenerateRevision={(instruction) => data.onGenerateRevision(document, instruction)} onRestoreVersion={(text) => data.onRestoreTextVersion(document, text)} onOpen={() => data.onOpenDocument(document)} onSave={(text) => data.onUpdateText(document, text)} onDelete={document.customKind ? () => data.onDeleteCustomNode(textDocument.entityId) : undefined} />}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function FlowSectionNode({ data }: NodeProps<FlowNode<SectionNodeData, "section">>) {
  return <div className={`flow-section-label ${data.level || "category"}`}><strong>{data.label}</strong><span>{data.count}</span></div>;
}

const productionFlowNodeTypes = {
  groupFrame: FlowGroupFrameNode,
  document: FlowCanvasDocumentNode,
  section: FlowSectionNode
};

import { buildSpatialFlow, CANVAS_LAYOUT_VERSION } from "./studio-canvas-layout";

function useCanvasLayoutEffects(layoutKey: string, layout: { nodes: FlowNode[] }, focusDocumentId: string | undefined, flowInstance: ReactFlowInstance | null, setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>, setEdges: React.Dispatch<React.SetStateAction<Edge[]>>, edges: Edge[], onFocusDocument: (documentId: string | undefined) => void) {
  const latestLayoutRef = useRef({ nodes: layout.nodes, edges });
  latestLayoutRef.current = { nodes: layout.nodes, edges };
  useEffect(() => {
    // Coalesce document persistence/job updates instead of asking React Flow to
    // replace and remeasure every node for every upstream state change.
    const frame = window.requestAnimationFrame(() => {
      const latest = latestLayoutRef.current;
      setNodes((current) => {
        const currentById = new Map(current.map((node) => [node.id, node]));
        return latest.nodes.map((next) => {
          const previous = currentById.get(next.id);
          if (!previous) return next;
          const structureChanged = previous.type !== next.type
            || previous.parentId !== next.parentId
            || previous.position.x !== next.position.x
            || previous.position.y !== next.position.y
            || JSON.stringify(previous.style) !== JSON.stringify(next.style);
          if (structureChanged) return { ...next, selected: previous.selected ?? next.selected };
          // Keep React Flow's measured geometry and local interaction state;
          // only the document data changes during a text/job update.
          return { ...previous, data: next.data, selected: previous.selected ?? next.selected };
        });
      });
      setEdges((current) => current === latest.edges ? current : latest.edges);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [layoutKey, layout.nodes, edges, setEdges, setNodes]);
  useEffect(() => {
    if (!flowInstance || !focusDocumentId) return;
    const nodeId = `document:${focusDocumentId}`;
    if (!latestLayoutRef.current.nodes.some((node) => node.id === nodeId)) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      // Let the node sync and its ResizeObserver measurement settle before a
      // single viewport animation. Content-only layout refreshes must not
      // restart focus while the user is typing.
      secondFrame = window.requestAnimationFrame(() => {
        void fitCanvasView(flowInstance, { nodes: [{ id: nodeId }], padding: 0.3, duration: 280, maxZoom: 1.05 }).then(() => onFocusDocument(undefined));
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [flowInstance, focusDocumentId, layoutKey, onFocusDocument]);
}

function afterFlowMeasurement(action: () => void): void {
  window.requestAnimationFrame(() => window.requestAnimationFrame(action));
}

const CANVAS_CHROME_TOP = 72;
type CanvasFitOptions = Parameters<ReactFlowInstance["fitView"]>[0];

/** Keep focused graph content below the floating stage navigation. */
function fitCanvasView(instance: ReactFlowInstance, options?: CanvasFitOptions) {
  return instance.fitView(options).then(() => {
    const viewport = instance.getViewport();
    if (viewport.y < CANVAS_CHROME_TOP) {
      return instance.setViewport({ ...viewport, y: CANVAS_CHROME_TOP }, { duration: 0 });
    }
  });
}

function fitGroupView(flowInstance: ReactFlowInstance, groupId: string) {
  const children = flowInstance.getNodes().filter((node) => node.type === "document" && node.parentId === `group:${groupId}`);
  void fitCanvasView(flowInstance, { nodes: children.length ? children : [{ id: `group:${groupId}` }], padding: 0.08, duration: 320, maxZoom: 1 });
}

function CanvasControls({ groups, flowInstance, runningDocument, canvasMode, setCanvasMode, onAddCustomNode }: { groups: CanvasGroupSpec[]; flowInstance: ReactFlowInstance | null; runningDocument?: CanvasDocument; canvasMode: "select" | "pan"; setCanvasMode: (mode: "select" | "pan") => void; onAddCustomNode: (kind: ProductionGraphCustomNode["kind"]) => void }) {
  const legacyGroupNames: Record<string, string> = { intake: "Đầu vào", story: "Câu chuyện hoàn chỉnh", architecture: "Phân tách cảnh", scenes: "Kịch bản / thoại", shots: "Phân rã shot", compile: "Chuẩn bị công cụ", assets: "Tài nguyên", "scene-images": "Ảnh cảnh", video: "Tạo video" };
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  return <>
    <div className="production-canvas-stage-nav" aria-label="Các giai đoạn trên sơ đồ sản xuất">
      {groups.map((group) => <button type="button" key={group.id} aria-label={legacyGroupNames[group.id] || group.label} title={group.label} onClick={() => afterFlowMeasurement(() => { if (flowInstance) fitGroupView(flowInstance, group.id); })}>{group.label}</button>)}
      {runningDocument ? <button type="button" className="running" aria-label="Đang chạy" onClick={() => afterFlowMeasurement(() => { if (flowInstance) void fitCanvasView(flowInstance, { nodes: [{ id: `document:${runningDocument.id}` }], padding: 0.3, duration: 280, maxZoom: 1.05 }); })}><Loader2 className="spin" size={12} /> Đang chạy</button> : null}
      <button type="button" aria-label="Xem toàn bộ luồng" title="Xem toàn bộ luồng" onClick={() => afterFlowMeasurement(() => { if (flowInstance) void fitCanvasView(flowInstance, { padding: 0.08, duration: 320 }); })}>Xem toàn bộ</button>
    </div>
    <div className="production-canvas-tool-dock" aria-label="Công cụ mặt phẳng luồng">
      <button type="button" className={canvasMode === "select" ? "active" : ""} title="Chọn và di chuyển nút" aria-label="Chọn nút" onClick={() => setCanvasMode("select")}><MousePointer2 size={16} /></button>
      <button type="button" className={canvasMode === "pan" ? "active" : ""} title="Kéo mặt phẳng luồng" aria-label="Kéo mặt phẳng luồng" onClick={() => setCanvasMode("pan")}><Hand size={16} /></button>
      {flowInstance ? <>
        <button type="button" title="Phóng to sơ đồ" aria-label="Phóng to sơ đồ" onClick={() => void flowInstance.zoomIn({ duration: 180 })}>+</button>
        <button type="button" title="Thu nhỏ sơ đồ" aria-label="Thu nhỏ sơ đồ" onClick={() => void flowInstance.zoomOut({ duration: 180 })}>−</button>
        <button type="button" title="Vừa khung sơ đồ" aria-label="Vừa khung sơ đồ" onClick={() => void fitCanvasView(flowInstance, { padding: 0.08, duration: 220 })}><Expand size={15} /></button>
      </> : null}
    </div>
    <div className={`production-node-palette nodrag ${addMenuOpen ? "is-open" : "is-collapsed"}`} role="toolbar" aria-label="Thêm nút sản xuất">
      <button type="button" className="production-node-palette-toggle" title="Thêm nút sản xuất" aria-label="Mở các nút sản xuất" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}><Plus size={14} /><span>Thêm nút</span></button>
      {addMenuOpen ? <>
        <button type="button" title="Thêm nút văn bản" aria-label="Thêm nút văn bản" onClick={() => onAddCustomNode("text")}><Plus size={14} /><span>Văn bản</span></button>
        <button type="button" title="Thêm nút tải ảnh" aria-label="Thêm nút tải ảnh" onClick={() => onAddCustomNode("image-upload")}><Upload size={14} /><span>Tải ảnh</span></button>
        <button type="button" title="Thêm nút tạo ảnh" aria-label="Thêm nút tạo ảnh" onClick={() => onAddCustomNode("image-generate")}><ImageIcon size={14} /><span>Tạo ảnh</span></button>
      </> : null}
    </div>
  </>;
}

export function SpatialProductionCanvas({
  documents,
  savedLayout,
  savedViewport,
  focusDocumentId,
  revisions,
  initialGuidance,
  onGenerateRevision,
  onRestoreTextVersion,
  onRegenerateMedia,
  onOpenAsset,
  onOpenDocument,
  onUpdateIntake,
  onUpdateText,
  onSaveLayout,
  onSaveViewport,
  onFocusDocument,
  onAddCustomNode,
  onUpdateCustomNode,
  onDeleteCustomNode,
  onGenerateCustomImage,
  onUpdateNodeSettings,
  onResetNodeSettings,
  onResetLayout
}: {
  documents: CanvasDocument[];
  savedLayout: Record<string, { x: number; y: number }>;
  savedViewport?: { x: number; y: number; zoom: number };
  focusDocumentId?: string;
  revisions: Record<string, ProductionGraphRevision[]>;
  initialGuidance: Record<string, string>;
  onGenerateRevision: (document: CanvasDocument, instruction: string) => void;
  onRestoreTextVersion: (document: CanvasDocument, text: string) => void;
  onRegenerateMedia: (asset: Asset, instruction?: string, settings?: ProductionGraphNodeSettings) => void;
  onOpenAsset: (document: CanvasDocument) => void;
  onOpenDocument: (document: CanvasDocument) => void;
  onUpdateIntake: (patch: Partial<ProjectIntake>) => void;
  onUpdateText: (document: CanvasDocument, text: string) => void;
  onSaveLayout: (layout: Record<string, { x: number; y: number }>) => void;
  onSaveViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  onFocusDocument: (documentId: string | undefined) => void;
  onAddCustomNode: (kind: ProductionGraphCustomNode["kind"]) => void;
  onUpdateCustomNode: (nodeId: string, patch: Partial<ProductionGraphCustomNode>) => void;
  onDeleteCustomNode: (nodeId: string) => void;
  onGenerateCustomImage: (node: ProductionGraphCustomNode) => void;
  onUpdateNodeSettings: (documentId: string, patch: ProductionGraphNodeSettings) => void;
  onResetNodeSettings: () => void;
  onResetLayout: () => void;
}) {
  const layout = useMemo(() => buildSpatialFlow(documents, savedLayout, revisions, initialGuidance, onGenerateRevision, onRestoreTextVersion, onRegenerateMedia, onOpenAsset, onOpenDocument, onUpdateIntake, onUpdateText, onUpdateCustomNode, onDeleteCustomNode, onGenerateCustomImage, onUpdateNodeSettings, onResetNodeSettings, onResetLayout), [documents, initialGuidance, onDeleteCustomNode, onGenerateCustomImage, onGenerateRevision, onOpenAsset, onOpenDocument, onRegenerateMedia, onResetLayout, onResetNodeSettings, onRestoreTextVersion, onUpdateCustomNode, onUpdateIntake, onUpdateNodeSettings, onUpdateText, revisions, savedLayout]);
  // Saved node coordinates can also predate the current shell width. Clamp
  // their origin so the first column cannot render beneath the navigation rail.
  const visibleLayout = useMemo(() => ({
    ...layout,
    nodes: layout.nodes.map((node) => ({ ...node, position: { ...node.position, x: Math.max(40, node.position.x), y: Math.max(24, node.position.y) } }))
  }), [layout]);
  const [nodes, setNodes, onNodesChange] = useNodesState(visibleLayout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [canvasMode, setCanvasMode] = useState<"select" | "pan">("select");
  const runningDocument = documents.find((document) => document.activeJob && isProjectJobBusy(document.activeJob));
  const layoutKey = documents.map((document) => `${document.id}:${document.groupId}:${document.row ?? 0}:${document.slot ?? ""}`).join("|");
  // A persisted transform may come from a narrow/older layout and pan the
  // graph underneath the left navigation rail.  Keep the graph origin inside
  // the canvas viewport; React Flow will still fit the graph when the saved
  // transform is rejected.
  // Discard legacy transforms that leave the graph effectively unreadable.
  // They are recomputed by fitView and can still be replaced by an explicit
  // user zoom afterwards.
  const safeViewport = savedViewport && Number.isFinite(savedViewport.x) && Number.isFinite(savedViewport.y) && Number.isFinite(savedViewport.zoom) && savedViewport.x >= 24 && savedViewport.y >= CANVAS_CHROME_TOP && savedViewport.zoom >= 0.45 && savedViewport.zoom <= 1.6 ? savedViewport : undefined;

  useCanvasLayoutEffects(layoutKey, visibleLayout, focusDocumentId, flowInstance, setNodes, setEdges, visibleLayout.edges, onFocusDocument);

  return (
    <div className="spatial-production-canvas" aria-label="Mặt phẳng sơ đồ sản xuất">
      <CanvasControls groups={layout.groups} flowInstance={flowInstance} runningDocument={runningDocument} canvasMode={canvasMode} setCanvasMode={setCanvasMode} onAddCustomNode={onAddCustomNode} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={productionFlowNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(event, node) => {
          const target = event.target;
          if (!node.id.startsWith("document:") || target instanceof HTMLElement && target.closest("button,input,textarea,select")) return;
          setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })));
          if (!flowInstance) return;
          // The overview intentionally fits the whole production graph. A
          // click is the explicit transition to a readable, editable node.
          const width = node.measured?.width ?? node.width ?? 360;
          const height = node.measured?.height ?? node.height ?? 220;
          void flowInstance.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 0.8, duration: 220 });
        }}
        onNodeDragStop={(_, node) => {
          if (!node.id.startsWith("document:")) return;
          const nextLayout = { ...savedLayout, [`${CANVAS_LAYOUT_VERSION}:${node.id.slice("document:".length)}`]: node.position };
          onSaveLayout(nextLayout);
        }}
        onMoveEnd={(_, viewport) => onSaveViewport(viewport)}
        defaultViewport={safeViewport ?? { x: 34, y: 30, zoom: 0.78 }}
        minZoom={0.18}
        maxZoom={1.6}
        panOnScroll
        panOnDrag={canvasMode === "pan"}
        selectionOnDrag={canvasMode === "select"}
        nodesDraggable={canvasMode === "select"}
        onInit={(instance) => {
          setFlowInstance(instance);
          if (!safeViewport) afterFlowMeasurement(() => {
            // Start on the first production stage at a readable scale. Fitting
            // the entire graph here shrinks wide projects to an unusable
            // thumbnail; the explicit “Xem toàn bộ” control remains available
            // for overview navigation.
            // Fit the first narrative handoff. Fitting only the intake frame
            // leaves the story/scene-breakdown cards half-painted beneath the
            // fixed rail on a normal desktop viewport.
            // Keep the first view focused on the editable intake handoff. A
            // whole-project fit makes document cards unreadable on a normal
            // desktop window; stage navigation moves to later lanes clearly.
            const initialNodes = visibleLayout.nodes.filter((node) => node.type === "document" && String(node.parentId) === "group:intake");
            void fitCanvasView(instance, { nodes: initialNodes.length ? initialNodes : [{ id: "group:intake" }], padding: 0.12, duration: 0, maxZoom: 1.05 }).then(() => {
              const viewport = instance.getViewport();
              // The intake frame is deliberately the initial focus. Leave a
              // small proportional gutter on its right so the next stage is
              // not left half-painted at the canvas edge; users can still
              // reach it via the stage navigation or “Xem toàn bộ”.
              const canvasWidth = document.querySelector<HTMLElement>(".spatial-production-canvas")?.clientWidth ?? 0;
              // Keep only a small left gutter. A large rightward offset makes
              // the next stage partially paint beneath the fixed rail on
              // narrower desktop windows (the graph remains reachable by
              // stage navigation and the explicit overview control).
              const focusGutter = Math.min(24, Math.max(0, canvasWidth * 0.025));
              // fitView may center a wide graph with a negative translation;
              // keep its first column inside the interactive canvas rather
              // than underneath the fixed navigation rail.
              const nextViewport = { ...viewport, x: viewport.x + focusGutter, y: Math.max(CANVAS_CHROME_TOP, viewport.y) };
              if (nextViewport.x !== viewport.x || nextViewport.y !== viewport.y) instance.setViewport({ ...nextViewport, x: Math.max(24, nextViewport.x) }, { duration: 0 });
            });
          });
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} color="#d9dee7" />
      </ReactFlow>
    </div>
  );
}
