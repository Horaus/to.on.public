import { Check, ChevronLeft, ChevronRight, CornerUpRight, Image as ImageIcon, Loader2, Pencil, Upload, Wand2, X } from "lucide-react";
import { useEffect } from "react";
import type { ReferenceEditorModel } from "../studio-overlay-contracts";
import { formatLabel } from "@studio/renderer-core/ui-format";

function ReferenceModalFocusTrap() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".reference-modal");
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

function meaningfulProfileText(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!text || /không có đặc điểm ngoại hình được nguồn khóa/i.test(text) || /^(?:generated from|needs visual definition|no locked visual (?:description|definition))/i.test(text) || /^(?:phát hiện sự cố, truy trách nhiệm và ép nhóm hành động|dẫn xung đột và thực hiện lựa chọn chấm dứt tranh chấp)\.?$/i.test(text)) return "";
  return text;
}
function ReferenceModalMedia({ model }: { model: ReferenceEditorModel }) { const { character, missingImageRequest, recoverJob, referenceModalPane, referenceModalUploadInputRef, referenceProfileEditing, referenceRevisionOpen, referenceRevisionRequest, requestMissingReferenceImage, requestSelectedReferenceRevision, selectedReference, selectedReferenceDetail, selectedReferenceDetailJobActive, selectedReferenceHasGenerationData, selectedReferenceMainJobActive, selectedReferencePaneFailedJob, selectedReferencePaneHasImage, selectedReferencePaneJobActive, selectedReferencePrimary, selectedReferenceSupportsDetail, setMissingImageRequest, setReferenceModalPane, setReferenceProfileEditing, setReferenceRevisionRequest, setSelectedReferenceId, state, updateCharacter, uploadSelectedReferenceReplacement } = model; if (!selectedReference) return null; return (
              <figure className="reference-modal-figure">
                <div className="reference-modal-tools">
                <button type="button" className="reference-modal-generate" disabled={selectedReferencePaneJobActive} title={referenceModalPane === "detail" ? "Tạo bảng chi tiết" : selectedReferenceSupportsDetail ? "Tạo biến thể ảnh chính" : "Tạo biến thể trạng thái"} onClick={requestSelectedReferenceRevision}><Wand2 size={15} /><span>{referenceModalPane === "detail" ? "Tạo bảng chi tiết" : selectedReferenceSupportsDetail ? "Tạo biến thể ảnh chính" : "Tạo biến thể trạng thái"}</span></button>
                <button type="button" className="reference-modal-upload" title={referenceModalPane === "detail" ? "Tải bảng chi tiết" : "Tải ảnh nhận diện"} onClick={() => referenceModalUploadInputRef.current?.click()}><Upload size={15} /><span>{referenceModalPane === "detail" ? "Tải bảng chi tiết" : "Tải ảnh nhận diện"}</span></button>
                <input ref={referenceModalUploadInputRef} type="file" accept="image/*" hidden onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadSelectedReferenceReplacement(file);
                  event.currentTarget.value = "";
                }} />
                </div>
                {referenceRevisionOpen && selectedReferencePaneHasImage ? (
                  <div className="reference-revision-chat">
                    <textarea value={referenceRevisionRequest} onChange={(event) => setReferenceRevisionRequest(event.target.value)} placeholder={referenceModalPane === "detail" ? "Mô tả thay đổi cho bảng chi tiết này..." : "Mô tả thay đổi cho ảnh này..."} />
                    <button type="button" className="primary" disabled={!referenceRevisionRequest.trim() || selectedReferencePaneJobActive} onClick={requestSelectedReferenceRevision}><Wand2 size={14} /> Tạo</button>
                  </div>
                ) : null}
                {selectedReferenceSupportsDetail ? <button type="button" className="reference-modal-arrow left" title={referenceModalPane === "detail" ? "Xem ảnh nhận diện chính" : "Xem bảng chi tiết"} onClick={() => setReferenceModalPane((pane) => pane === "detail" ? "main" : "detail")}><ChevronLeft size={18} /></button> : null}
                {referenceModalPane === "detail"
                  ? selectedReferenceDetail
                    ? <img src={selectedReferenceDetail.previewDataUrl} alt={`${selectedReference.name} — ảnh chi tiết`} />
                    : <div className="reference-detail-empty">
                      {selectedReferenceDetailJobActive ? <Loader2 className="reference-empty-spinner" size={24} /> : <ImageIcon size={24} />}
                      <span>
                        {selectedReferenceDetailJobActive
                          ? "Đang tạo bảng chi tiết…"
                          : selectedReferencePaneFailedJob
                            ? "Cần kiểm tra việc tạo chi tiết"
                            : selectedReferenceHasGenerationData
                              ? "Chưa có bảng chi tiết"
                              : "Mô tả bảng chi tiết cần tạo"}
                      </span>
                      {selectedReferenceDetailJobActive ? (
                          <small>Đang chờ kết quả từ công cụ.</small>
                      ) : selectedReferencePaneFailedJob ? (
                        <div className="missing-image-actions">
                          <button type="button" className="primary" onClick={requestSelectedReferenceRevision}><Wand2 size={14} /> Tạo lại</button>
                          {selectedReferencePaneFailedJob.providerConversationUrl ? (
                            <button type="button" onClick={() => recoverJob(selectedReferencePaneFailedJob.id)}><CornerUpRight size={14} /> Mở cuộc trò chuyện</button>
                          ) : null}
                        </div>
                      ) : selectedReferenceHasGenerationData ? (
                        <button type="button" className="primary reference-empty-generate" onClick={requestSelectedReferenceRevision}><Wand2 size={14} /> Tạo bảng chi tiết</button>
                      ) : (
                        <div className="missing-image-chat">
                          <textarea value={missingImageRequest} onChange={(event) => setMissingImageRequest(event.target.value)} placeholder="Bổ sung chi tiết nhân vật trước khi tạo ảnh…" />
                          <button type="button" className="primary" disabled={!missingImageRequest.trim()} onClick={requestMissingReferenceImage}><Wand2 size={14} /> Tạo</button>
                        </div>
                      )}
                    </div>
                  : selectedReferencePrimary
                    ? <img src={selectedReferencePrimary.previewDataUrl} alt={`${selectedReference.name} — ảnh nhận diện chính`} />
                    : <div className="reference-detail-empty">
                      {selectedReferenceMainJobActive ? <Loader2 className="reference-empty-spinner" size={24} /> : <ImageIcon size={24} />}
                      <span>
                        {selectedReferenceMainJobActive
                          ? "Đang tạo ảnh chính…"
                          : selectedReferencePaneFailedJob
                            ? "Cần kiểm tra việc tạo ảnh chính"
                            : selectedReferenceHasGenerationData
                              ? "Chưa có ảnh chính"
                              : "Mô tả ảnh chính cần tạo"}
                      </span>
                      {selectedReferenceMainJobActive ? (
                        <small>Đang chờ kết quả từ công cụ.</small>
                      ) : selectedReferencePaneFailedJob ? (
                        <div className="missing-image-actions">
                          <button type="button" className="primary" onClick={requestSelectedReferenceRevision}><Wand2 size={14} /> Tạo lại</button>
                          {selectedReferencePaneFailedJob.providerConversationUrl ? (
                            <button type="button" onClick={() => recoverJob(selectedReferencePaneFailedJob.id)}><CornerUpRight size={14} /> Mở cuộc trò chuyện</button>
                          ) : null}
                        </div>
                      ) : selectedReferenceHasGenerationData ? (
                      <button type="button" className="primary reference-empty-generate" onClick={requestSelectedReferenceRevision}><Wand2 size={14} /> Tạo ảnh chính</button>
                      ) : (
                        <div className="missing-image-chat">
                          <textarea value={missingImageRequest} onChange={(event) => setMissingImageRequest(event.target.value)} placeholder="Bổ sung nhận diện, trang phục và phong cách trước khi tạo ảnh…" />
                          <button type="button" className="primary" disabled={!missingImageRequest.trim()} onClick={requestMissingReferenceImage}><Wand2 size={14} /> Tạo</button>
                        </div>
                      )}
                    </div>}
                {selectedReferenceSupportsDetail ? <button type="button" className="reference-modal-arrow right" title={referenceModalPane === "detail" ? "Xem ảnh nhận diện chính" : "Xem bảng chi tiết"} onClick={() => setReferenceModalPane((pane) => pane === "detail" ? "main" : "detail")}><ChevronRight size={18} /></button> : null}
                <figcaption>{referenceModalPane === "detail" ? "Bảng chi tiết nhân vật" : selectedReferenceSupportsDetail ? "Tổng quan nhận diện chính" : "Ảnh tham chiếu gốc"}</figcaption>
              </figure>
            ); }

function ReferenceModalProfile({ model }: { model: ReferenceEditorModel }) { const { character, missingImageRequest, recoverJob, referenceModalPane, referenceModalUploadInputRef, referenceProfileEditing, referenceRevisionOpen, referenceRevisionRequest, requestMissingReferenceImage, requestSelectedReferenceRevision, selectedReference, selectedReferenceDetail, selectedReferenceDetailJobActive, selectedReferenceHasGenerationData, selectedReferenceMainJobActive, selectedReferencePaneFailedJob, selectedReferencePaneHasImage, selectedReferencePaneJobActive, selectedReferencePrimary, selectedReferenceSupportsDetail, setMissingImageRequest, setReferenceModalPane, setReferenceProfileEditing, setReferenceRevisionRequest, setSelectedReferenceId, state, updateCharacter, uploadSelectedReferenceReplacement } = model; if (!selectedReference) return null; return (
              <div className="reference-profile">
                {selectedReferenceSupportsDetail ? <button type="button" className="reference-profile-edit" title={referenceProfileEditing ? "Lưu ghi nhớ hồ sơ" : "Sửa ghi nhớ hồ sơ"} onClick={() => setReferenceProfileEditing((current) => !current)}>
                  {referenceProfileEditing ? <Check size={15} /> : <Pencil size={15} />}
                </button> : null}
                <span>Nhân vật trong truyện</span>
                <p>{selectedReference.characterSlot || "Tham chiếu chưa gán"}</p>
                <span>{selectedReferenceSupportsDetail ? "Mô tả nhân vật" : "Mô tả tài nguyên"}</span>
                {meaningfulProfileText(selectedReference.sourceDescription) || meaningfulProfileText(character.visualDescription) ? <p>{meaningfulProfileText(selectedReference.sourceDescription) || meaningfulProfileText(character.visualDescription)}</p> : null}
                <span>{selectedReferenceSupportsDetail ? "Yêu cầu thay đổi bằng AI" : "Hướng dẫn trạng thái / thay đổi"}</span>
                <p>{selectedReference.transformationRequest || "Giữ nguyên nhận diện nhìn thấy."}</p>
                {selectedReferenceSupportsDetail ? <span>Ghi nhớ hồ sơ</span> : null}
                {selectedReferenceSupportsDetail && referenceProfileEditing ? (
                  <textarea
                    value={meaningfulProfileText(character.personality) || meaningfulProfileText(character.consistencyNotes) || ""}
                    onChange={(event) => updateCharacter({ personality: event.target.value })}
                    placeholder="Tính cách, hành vi, quy tắc nhất quán…"
                  />
                ) : selectedReferenceSupportsDetail && (meaningfulProfileText(character.personality) || meaningfulProfileText(character.consistencyNotes)) ? (
                  <p>{meaningfulProfileText(character.personality) || meaningfulProfileText(character.consistencyNotes)}</p>
                ) : null}
              </div>
            ); }

export function ReferenceEditorOverlay({ model }: { model: ReferenceEditorModel }) { const { character, missingImageRequest, recoverJob, referenceModalPane, referenceModalUploadInputRef, referenceProfileEditing, referenceRevisionOpen, referenceRevisionRequest, requestMissingReferenceImage, requestSelectedReferenceRevision, selectedReference, selectedReferenceDetail, selectedReferenceDetailJobActive, selectedReferenceHasGenerationData, selectedReferenceMainJobActive, selectedReferencePaneFailedJob, selectedReferencePaneHasImage, selectedReferencePaneJobActive, selectedReferencePrimary, selectedReferenceSupportsDetail, setMissingImageRequest, setReferenceModalPane, setReferenceProfileEditing, setReferenceRevisionRequest, setSelectedReferenceId, state, updateCharacter, uploadSelectedReferenceReplacement } = model; useEffect(() => { if (!selectedReference) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setSelectedReferenceId(null); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [selectedReference, setSelectedReferenceId]); if (!selectedReference) return null; return (selectedReference ? (

        <div className="reference-modal-overlay" role="dialog" aria-modal="true" aria-label={`Tham chiếu ${selectedReference.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedReferenceId(null); }}>
          <section className="reference-modal">
            <ReferenceModalFocusTrap />
            <header>
              <div><span className="eyebrow">{formatLabel(selectedReference.role)} · {selectedReferenceSupportsDetail ? formatLabel(selectedReference.referenceUse || "supporting_detail") : "Ảnh tham chiếu gốc"}</span><h2>{selectedReference.name}</h2></div>
              <button type="button" autoFocus title="Đóng tham chiếu" aria-label="Đóng cửa sổ tham chiếu" onClick={() => setSelectedReferenceId(null)}><X size={17} /></button>
            </header>
            <div className="reference-modal-grid">
              <ReferenceModalMedia model={model} />
              <ReferenceModalProfile model={model} />
            </div>
          </section>
        </div>
      ) : null); }
