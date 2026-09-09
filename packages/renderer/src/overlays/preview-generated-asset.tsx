import { ChevronLeft, ChevronRight, Wand2, X } from "lucide-react";
import { useEffect } from "react";
import { imagePreviewSrc } from "../renderer-media-primitives";
import type { GeneratedAssetPreviewModel } from "../studio-overlay-contracts";
import { formatLabel } from "@studio/renderer-core/ui-format";

function GeneratedAssetPreviewFocusTrap() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".ai-review-preview-modal");
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

export function GeneratedAssetPreviewOverlay({ model }: { model: GeneratedAssetPreviewModel }) { const { candidateEdit, previewGeneratedAsset, previewGeneratedGroup, previewGeneratedIndex, previewRevisionOpen, regenerateGeneratedAsset, setCandidateCarouselIndex, setCandidateEdit, setPreviewGeneratedAsset, setPreviewRevisionOpen } = model; useEffect(() => { if (!previewGeneratedAsset) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setPreviewRevisionOpen(false); setPreviewGeneratedAsset(null); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [previewGeneratedAsset, setPreviewGeneratedAsset, setPreviewRevisionOpen]); return (previewGeneratedAsset ? (
        <div className="reference-modal-overlay ai-review-preview-overlay" role="dialog" aria-modal="true" aria-label="Xem trước ảnh đã tạo" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreviewGeneratedAsset(null);
        }}>
          <section className="reference-modal ai-review-preview-modal">
            <GeneratedAssetPreviewFocusTrap />
            <header>
              <div><span className="eyebrow">{formatLabel(previewGeneratedGroup?.role || "main_character")} · {formatLabel(previewGeneratedGroup?.referenceUse || "primary_identity")}</span><h2>{previewGeneratedGroup?.name || "Ứng viên ảnh AI"}</h2></div>
              <button type="button" autoFocus title="Đóng bản xem trước ảnh" aria-label="Đóng bản xem trước ảnh" onClick={() => {
                setPreviewRevisionOpen(false);
                setPreviewGeneratedAsset(null);
              }}><X size={17} /></button>
            </header>
            <figure className="reference-modal-figure ai-review-preview-figure">
              <div className="reference-modal-tools">
                <button type="button" className="reference-modal-generate" title="Tạo lại ảnh đã chỉnh sửa" onClick={() => regenerateGeneratedAsset(previewGeneratedAsset)}><Wand2 size={15} /><span>Tạo lại ảnh</span></button>
              </div>
              {previewRevisionOpen ? (
                <div className="ai-review-revision-chat">
                  <textarea value={candidateEdit[previewGeneratedAsset.id] ?? ""} onChange={(event) => setCandidateEdit((current) => ({ ...current, [previewGeneratedAsset.id]: event.target.value }))} placeholder="Mô tả thay đổi trước khi tạo lại..." />
                <button type="button" className="primary" disabled={!candidateEdit[previewGeneratedAsset.id]?.trim()} onClick={() => regenerateGeneratedAsset(previewGeneratedAsset)}><Wand2 size={14} /> Tạo lại</button>
                </div>
              ) : null}
              {previewGeneratedGroup && previewGeneratedGroup.assets.length > 1 ? (
                <button type="button" className="reference-modal-arrow left" title="Ảnh đã tạo trước" onClick={() => {
                  const nextIndex = (previewGeneratedIndex - 1 + previewGeneratedGroup.assets.length) % previewGeneratedGroup.assets.length;
                  setPreviewGeneratedAsset(previewGeneratedGroup.assets[nextIndex]);
                  setCandidateCarouselIndex((current) => ({ ...current, [previewGeneratedGroup.key]: nextIndex }));
                }}><ChevronLeft size={18} /></button>
              ) : null}
              <img src={imagePreviewSrc(previewGeneratedAsset)} alt="Xem trước ảnh nhân vật đã tạo" />
              {previewGeneratedGroup && previewGeneratedGroup.assets.length > 1 ? (
                <button type="button" className="reference-modal-arrow right" title="Ảnh đã tạo sau" onClick={() => {
                  const nextIndex = (previewGeneratedIndex + 1) % previewGeneratedGroup.assets.length;
                  setPreviewGeneratedAsset(previewGeneratedGroup.assets[nextIndex]);
                  setCandidateCarouselIndex((current) => ({ ...current, [previewGeneratedGroup.key]: nextIndex }));
                }}><ChevronRight size={18} /></button>
              ) : null}
              <figcaption>{previewGeneratedGroup && previewGeneratedGroup.assets.length > 1 ? `${previewGeneratedIndex + 1}/${previewGeneratedGroup.assets.length} · ` : ""}Toàn cảnh chính diện</figcaption>
            </figure>
          </section>
        </div>
      ) : null); }
