import {
  X
} from "lucide-react";
import { useEffect } from "react";
import type { UploadPreviewModel } from "../studio-overlay-contracts";
export function UploadPreviewOverlay({ model }: { model: UploadPreviewModel }) { const { previewUpload, setPreviewUpload } = model; useEffect(() => { if (!previewUpload) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setPreviewUpload(null); return; } if (event.key !== "Tab") return; const dialog = document.querySelector<HTMLElement>(".upload-preview-dialog"); const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")) : []; if (!focusable.length || !dialog?.contains(document.activeElement)) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [previewUpload, setPreviewUpload]); return (previewUpload ? (
        <div className="reference-modal-overlay" role="dialog" aria-modal="true" aria-label={previewUpload.title}>
          <section className="upload-preview-dialog">
            <header>
              <div><span className="eyebrow">Ảnh tham chiếu đã tải lên</span><h2>{previewUpload.title}</h2></div>
              <button type="button" autoFocus title="Đóng bản xem trước tệp tải lên" aria-label="Đóng bản xem trước tệp tải lên" onClick={() => setPreviewUpload(null)}><X size={17} /></button>
            </header>
            <figure>
              <img src={previewUpload.dataUrl} alt={previewUpload.title} />
              <figcaption>{previewUpload.note}</figcaption>
            </figure>
          </section>
        </div>
      ) : null); }
