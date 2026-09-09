import type { ReferenceRole, VisualReference } from "@studio/types";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
  CornerUpRight,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X
} from "lucide-react";
import { normalizeSlotName } from "@studio/renderer-core/entity-key";
import { imagePreviewSrc } from "@studio/renderer-core/production-ui-support";
import { useStudioApplicationContext } from "../studio-application-context";
import { formatLabel, userFacingJobMessage } from "@studio/renderer-core/ui-format";

const EMPTY_CHARACTER_TEXT = new Set([
  "needs visual definition", "needs visual definition from character & style",
  "no locked visual description", "no locked visual definition", "generated from",
  "không có đặc điểm ngoại hình được nguồn khóa",
  "phát hiện sự cố, truy trách nhiệm và ép nhóm hành động",
  "dẫn xung đột và thực hiện lựa chọn chấm dứt tranh chấp"
]);

function normalizeCharacterText(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim().toLowerCase();
}

function isGeneratedCharacterText(value: string) {
  return value.startsWith("generated from the imported story package") || value.startsWith("generated from the story package") ||
    value.startsWith("tạo từ gói kịch bản") || value.startsWith("sinh từ gói câu chuyện") ||
    value.startsWith("this recurring character needs locked visual references");
}

function editableCharacterText(value: string | undefined, kind: "visual" | "outfit" | "personality" | "continuity", storyFunction = "") {
  const text = value?.trim() ?? "";
  if (!text) return "";
  const normalized = normalizeCharacterText(text);
  if (EMPTY_CHARACTER_TEXT.has(normalized) || isGeneratedCharacterText(normalized)) return "";
  if (kind === "personality" && normalized === normalizeCharacterText(storyFunction)) return "";
  return text;
}

function sourceAssetName(asset: { id: string; type: string; filePath?: string }) {
  if (asset.filePath?.startsWith("data:")) return `${asset.type}-${asset.id}.${asset.type === "video" ? "mp4" : asset.type === "audio" ? "mp3" : "png"}`;
  const raw = asset.filePath || asset.id;
  try { return decodeURIComponent(new URL(raw).pathname.split("/").filter(Boolean).at(-1) || asset.id); }
  catch { return decodeURIComponent(raw.split(/[\\/]/).filter(Boolean).at(-1) || asset.id); }
}

type AssetRunJobPayload = { bridgeMessage?: { settings?: Record<string, any> } };

export function AssetsScreen() {
  const { candidateCarouselIndex, character, characterGeneratedAssets, characterImageJobsActive, chooseStoryCharacter, clearCharacterProfile, clearDraftUpload, confirmGeneratedAssetAsReference, confirmReferenceCandidate, detailUploadInputRef, flowFocusTarget, generateCharacterProfileDraft, generatedCandidateGroups, lockedCharacterGroups, lockedProjectReferences, openUploadTile, primaryUploadInputRef, projectReferences, queueCharacterImageDraft, recoverJob, recoverableCharacterImageJobs, referenceCandidates, referenceDraft, removeGeneratedAssetGroup, removeReference, replaceState, setCandidateCarouselIndex, setDraftUploads, setPreviewGeneratedAsset, setReferenceCandidates, setReferenceDraft, setReferenceModalPane, setReferenceProfileEditing, setSelectedReferenceId, setState, stageReferenceCandidates, storyCharacters, t, updateCharacter } = useStudioApplicationContext();
  const selectedStoryCharacter = storyCharacters.find((item) => normalizeSlotName(item.name) === normalizeSlotName(character.name));
  const storyFunction = selectedStoryCharacter?.storyFunction || "";
  return (<section className={`view assets-view ${flowFocusTarget === "references" ? "flow-focus-pulse" : ""}`} data-flow-target="references" tabIndex={-1}>
                <div className="view-intro">
                  <div>
                    <span className="eyebrow">{t("assets.phase")}</span>
                    <h2>{t("assets.title")}</h2>
                    <p>{t("assets.subtitle")}</p>
                  </div>
                </div>
                <div className="character-workspace">
                  <div className="section-heading character-workspace-heading">
                    <div><span className="eyebrow">Nhận diện nhân vật · kiểm soát nhất quán</span><h3>Khoá nhận diện hình ảnh trước storyboard</h3><p className="section-helper">Chọn ảnh tham chiếu có giá trị và mô tả điều phải giữ ổn định; bạn có thể đổi ảnh bất cứ lúc nào.</p></div>
                    <span>{lockedProjectReferences.length} tham chiếu đã khóa</span>
                  </div>
                  <div className="character-intake-grid">
                    <div className="reference-form character-source-panel">
                      <div className="workspace-step"><span>01</span><div><strong>Nhận ảnh tham chiếu</strong><small>Chọn bằng chứng nhận diện cần giữ ổn định.</small></div><button type="button" className="rail-help" title="Chỉ tải ảnh tham chiếu có giá trị nhận diện hoặc tính nhất quán; không tải lại ảnh đã có trong cùng cuộc trò chuyện." aria-label="Trợ giúp nhận ảnh tham chiếu"><CircleHelp size={14}/></button></div>
                      <div className="reference-upload-pair">
                        <div className="upload-tile">
                          <button
                            type="button"
                            className={`upload-zone ${referenceDraft.primaryUploads.length ? "has-preview" : ""}`}
                            data-hover={"Chủ thể chính · gương mặt · cơ thể · loài · dáng người\nnhấn để mở · command-click để tải lại"}
                            onClick={(event) => openUploadTile("primary", event)}
                          >
                            {referenceDraft.primaryUploads[0]
                              ? <img src={referenceDraft.primaryUploads[0].dataUrl} alt="Xem trước nhận diện chính" />
                              : <><Upload size={22} /><strong>Nhận diện chính</strong><span>Gương mặt · cơ thể · dáng người</span></>}
                          </button>
                          {referenceDraft.primaryUploads.length ? (
                            <button className="upload-clear" title="Bỏ ảnh nhận diện chính" aria-label="Bỏ ảnh nhận diện chính" type="button" onClick={() => clearDraftUpload("primary")}><Trash2 size={13} /></button>
                          ) : null}
                        </div>
                        <input
                          ref={primaryUploadInputRef}
                          className="upload-input"
                          aria-label="Tải ảnh nhận diện chính"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            const files = Array.from(event.currentTarget.files ?? []);
                            if (files.length > 0) void setDraftUploads("primary", files);
                            event.currentTarget.value = "";
                          }}
                        />
                        <div className="upload-tile">
                          <button
                            type="button"
                            className={`upload-zone ${referenceDraft.detailUploads.length ? "has-preview" : ""}`}
                            data-hover={"Chi tiết bổ sung · trang phục · đạo cụ · chất liệu · dáng\nnhấn để mở · command-click để tải lại"}
                            onClick={(event) => openUploadTile("detail", event)}
                          >
                            {referenceDraft.detailUploads[0]
                              ? <img src={referenceDraft.detailUploads[0].dataUrl} alt="Xem trước ảnh chi tiết" />
                              : <><Upload size={22} /><strong>Chi tiết / thay đổi</strong><span>Trang phục · đạo cụ · chất liệu · dáng</span></>}
                          </button>
                          {referenceDraft.detailUploads.length ? (
                            <button className="upload-clear" title="Bỏ ảnh chi tiết" aria-label="Bỏ ảnh chi tiết" type="button" onClick={() => clearDraftUpload("detail")}><Trash2 size={13} /></button>
                          ) : null}
                        </div>
                        <input
                          ref={detailUploadInputRef}
                          className="upload-input"
                          aria-label="Tải ảnh chi tiết bổ sung"
                          type="file"
                          multiple
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            const files = Array.from(event.currentTarget.files ?? []);
                            if (files.length > 0) void setDraftUploads("detail", files);
                            event.currentTarget.value = "";
                          }}
                        />
                      </div>
                      <div className="reference-fields">
                        <label>Nhân vật trong truyện<select aria-label="Nhân vật trong truyện" value={referenceDraft.characterSlot} onChange={(event) => chooseStoryCharacter(event.target.value)}>
                          <option value="">Tùy chỉnh / chưa gán</option>
                          {storyCharacters.map((item) => {
                            const slot = normalizeSlotName(item.name);
                            const mapped = projectReferences.filter((reference) => reference.characterSlot === slot);
                            return <option key={slot} value={slot}>{item.name} · {formatLabel(item.role)}{mapped.length ? ` · ${mapped.length} tham chiếu` : ""}</option>;
                          })}
                        </select></label>
                        <div className="field-row reference-meta-grid">
                          <label>Tên<input aria-label="Tên tham chiếu" value={referenceDraft.name} onChange={(event) => setReferenceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Tên tham chiếu" /></label>
                          <label>Vai trò<select aria-label="Vai trò" value={referenceDraft.role} onChange={(event) => setReferenceDraft((current) => ({ ...current, role: event.target.value as ReferenceRole }))}>
                            <option value="main_character">Nhân vật chính</option>
                            <option value="supporting_character">Nhân vật phụ</option>
                            <option value="location">Bối cảnh</option>
                            <option value="visual_style">Phong cách hình ảnh</option>
                            <option value="prop">Đạo cụ</option>
                          </select></label>
                          <label>Mục đích tham chiếu<select aria-label="Mục đích tham chiếu" value={referenceDraft.referenceUse} onChange={(event) => setReferenceDraft((current) => ({ ...current, referenceUse: event.target.value as VisualReference["referenceUse"] }))}>
                            <option value="primary_identity">Nhận diện chính</option>
                            <option value="supporting_detail">Chi tiết bổ sung</option>
                            <option value="style_cue">Mốc phong cách</option>
                          </select></label>
                        <label>Phong cách<select aria-label="Phong cách hình ảnh tham chiếu" value={referenceDraft.visualStyle} onChange={(event) => setReferenceDraft((current) => ({ ...current, visualStyle: event.target.value }))}>
                            <option value="3d_cartoon">Hoạt hình 3D</option>
                            <option value="realistic">Người đóng chân thực</option>
                            <option value="anime">Hoạt hình Nhật</option>
                            <option value="stop_motion">Hoạt hình stop-motion</option>
                            <option value="flat_illustration">Minh hoạ phẳng</option>
                          </select></label>
                        </div>
                        <label>Chi tiết tham chiếu<textarea aria-label="Chi tiết tham chiếu" value={referenceDraft.sourceDescription} onChange={(event) => setReferenceDraft((current) => ({ ...current, sourceDescription: event.target.value }))} placeholder="Chỉ mô tả phần ảnh này bổ sung: gương mặt, cơ thể, trang phục, đạo cụ hoặc chất liệu." /></label>
                        <label>Thay đổi yêu cầu<textarea aria-label="Thay đổi yêu cầu" value={referenceDraft.transformationRequest} onChange={(event) => setReferenceDraft((current) => ({ ...current, transformationRequest: event.target.value }))} placeholder="Tuỳ chọn: đổi tóc, trang phục, loài hoặc một chi tiết nhìn thấy khác." /></label>
                        <div className="split-actions">
                          <button type="button" aria-label="Thêm ảnh vào thư viện" disabled={referenceDraft.primaryUploads.length + referenceDraft.detailUploads.length === 0} onClick={stageReferenceCandidates}><Upload size={16} /> Thêm vào thư viện</button>
                          <button type="button" aria-label="Tạo ảnh AI" className="primary" onClick={() => queueCharacterImageDraft()}><Wand2 size={16} /> Tạo ảnh AI</button>
                        </div>
                      </div>
                    </div>
                    <div className="character-profile-panel">
                      <div className="workspace-step"><span>02</span><div><strong>Hợp đồng nhân vật</strong><small>Chỉ hiển thị dữ liệu đã khóa; ô trống là có chủ ý.</small></div><button type="button" className="rail-help" title="Chỉ lưu đặc điểm nhìn thấy và quy tắc nhất quán có thể kiểm chứng; không điền nội dung mặc định." aria-label="Trợ giúp hợp đồng nhân vật"><CircleHelp size={14}/></button></div>
                      <div className="panel-head">
                        <span>Hồ sơ nhân vật</span>
                        <button type="button" className="rail-help" title="Chỉ nhập thông tin đã được xác nhận từ ảnh tham chiếu hoặc kịch bản; để trống nếu chưa có bằng chứng." aria-label="Trợ giúp hồ sơ nhân vật"><CircleHelp size={14} /></button>
                        <div className="panel-actions">
                          <button type="button" onClick={clearCharacterProfile}><X size={14} /> Xoá nội dung</button>
                          <button type="button" onClick={generateCharacterProfileDraft}><Wand2 size={14} /> Gợi ý bằng AI</button>
                        </div>
                      </div>
                      <div className="profile-fields">
                        <label><span className="character-field-label">Nhận diện<button type="button" className="rail-help" title="Tên hoặc mã nhận diện duy nhất của nhân vật trong toàn bộ dự án." aria-label="Trợ giúp nhận diện nhân vật"><CircleHelp size={12}/></button></span><input aria-label="Tên nhận diện nhân vật" value={character.name} onChange={(event) => updateCharacter({ name: event.target.value })} /></label>
                        <label><span className="character-field-label">Vai trò<button type="button" className="rail-help" title="Vai trò kể chuyện, không phải thông tin giọng nói hay cấu hình kỹ thuật." aria-label="Trợ giúp vai trò nhân vật"><CircleHelp size={12}/></button></span><select aria-label="Vai trò nhân vật" value={character.role} onChange={(event) => updateCharacter({ role: event.target.value })}>
                          <option value="main">Nhân vật chính</option>
                          <option value="supporting">Nhân vật phụ</option>
                          <option value="voice_only">Chỉ có giọng nói</option>
                          {!['main', 'supporting', 'voice_only'].includes(character.role) ? <option value={character.role}>{formatLabel(character.role)}</option> : null}
                        </select></label>
                        <label><span className="character-field-label">Mô tả ngoại hình<button type="button" className="rail-help" title="Chỉ ghi đặc điểm nhìn thấy đã được xác nhận từ ảnh tham chiếu; chưa có bằng chứng thì để trống." aria-label="Trợ giúp mô tả ngoại hình"><CircleHelp size={12}/></button></span><textarea aria-label="Mô tả ngoại hình" placeholder="Chưa có đặc điểm đã xác nhận" value={editableCharacterText(character.visualDescription, "visual")} onChange={(event) => updateCharacter({ visualDescription: event.target.value })} /></label>
                        <label><span className="character-field-label">Trang phục cố định<button type="button" className="rail-help" title="Ghi trang phục hoặc phụ kiện cần giữ ổn định giữa các cảnh; không tự suy đoán." aria-label="Trợ giúp trang phục cố định"><CircleHelp size={12}/></button></span><textarea aria-label="Trang phục cố định của nhân vật" placeholder="Chưa có trang phục đã xác nhận" value={editableCharacterText(character.outfit, "outfit")} onChange={(event) => updateCharacter({ outfit: event.target.value })} /></label>
                        <label><span className="character-field-label">Tính cách<button type="button" className="rail-help" title="Mô tả động cơ hoặc cách phản ứng đã có trong nguồn; không lặp lại storyFunction nếu không có chi tiết mới." aria-label="Trợ giúp tính cách nhân vật"><CircleHelp size={12}/></button></span><textarea aria-label="Tính cách và động cơ nhân vật" placeholder="Chưa có hành vi hoặc động cơ đã xác nhận" value={editableCharacterText(character.personality, "personality", storyFunction)} onChange={(event) => updateCharacter({ personality: event.target.value })} /></label>
                        <label><span className="character-field-label">Quy tắc nhất quán<button type="button" className="rail-help" title="Các chi tiết phải giữ nguyên qua shot, như nhận diện, trang phục, đạo cụ hoặc vị trí tương đối." aria-label="Trợ giúp quy tắc nhất quán"><CircleHelp size={12}/></button></span><textarea aria-label="Quy tắc nhất quán của nhân vật" placeholder="Chưa có quy tắc nhất quán đã xác nhận" value={editableCharacterText(character.consistencyNotes, "continuity")} onChange={(event) => updateCharacter({ consistencyNotes: event.target.value })} /></label>
                      </div>
                    </div>
                  </div>
                  {referenceCandidates.length ? (
                    <div className="candidate-strip">
                      {referenceCandidates.map((item) => (
                        <article className="candidate-card" key={item.id}>
                          <img src={item.dataUrl} alt={item.name} />
                          <div><strong>{item.name}</strong><span>{formatLabel(item.role)} · {formatLabel(item.referenceUse || "supporting_detail")}</span></div>
                          <button type="button" onClick={() => confirmReferenceCandidate(item.id)}><Check size={14} /> Thêm vào thư viện</button>
                          <button type="button" title="Bỏ ảnh đề xuất" aria-label={`Bỏ ảnh đề xuất ${item.name}`} onClick={() => setReferenceCandidates((current) => current.filter((candidate) => candidate.id !== item.id))}><X size={14} /></button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {characterGeneratedAssets.length || characterImageJobsActive.length || recoverableCharacterImageJobs.length ? (
                    <div className="generated-character-strip">
                      <div className="section-heading compact workspace-subheading">
                        <div><span className="eyebrow">03 · Ảnh đề xuất</span><h3>Ảnh tạo gần đây</h3><p className="section-helper">Ảnh có thể dùng ngay; chỉ chọn ảnh khác khi bạn muốn đổi nhận diện.</p></div>
                      </div>
                      <div className="candidate-strip">
                        {recoverableCharacterImageJobs.map((job) => {
                          const isStale = !["approved", "done", "review_required", "failed_manual", "failed_retryable"].includes(job.status) &&
                            Date.now() - new Date(job.updatedAt).getTime() > 60000;
                          const settings = job.input && typeof job.input === "object" && "bridgeMessage" in job.input
                            ? (job.input as AssetRunJobPayload).bridgeMessage?.settings
                            : undefined;
                          return (
                            <article className="candidate-card generated recovery" key={`recover-${job.id}`}>
                              <button type="button" className="candidate-delete recovery-delete" title="Xoá tác vụ ảnh lỗi" aria-label={`Xoá tác vụ ảnh lỗi ${job.id}`} onClick={() => {
                                if (!window.confirm("Xoá yêu cầu tạo ảnh lỗi này?")) return;
                                if (window.studioBridge) window.studioBridge.removeAsset(`job:${job.id}`).then(replaceState);
                                else setState((current) => ({ ...current, jobs: current.jobs.filter((item) => item.id !== job.id) }));
                              }}><Trash2 size={14} /></button>
                              <div className="candidate-recovery-frame"><AlertTriangle size={26} /></div>
                              <div>
                                <strong>{settings?.characterName || "Cần khôi phục ảnh"}</strong>
                                <span>{job.status === "waiting_login"
                                  ? "Đăng nhập ChatGPT rồi mở lại cuộc trò chuyện đã lưu."
                                  : userFacingJobMessage(job.statusMessage || job.error) ||
                                    (isStale ? "Provider đã dừng phản hồi." : "Chưa nhập được kết quả đã lưu.")}</span>
                              </div>
                              <button type="button" className="candidate-open-chat" title="Mở cuộc trò chuyện đã lưu" onClick={() => recoverJob(job.id)}><CornerUpRight size={14} /><span>Mở cuộc trò chuyện</span></button>
                            </article>
                          );
                        })}
                        {characterImageJobsActive.map((job) => {
                          const settings = job.input && typeof job.input === "object" && "bridgeMessage" in job.input
                            ? (job.input as AssetRunJobPayload).bridgeMessage?.settings
                            : undefined;
                          return (
                            <article className="candidate-card generated loading" key={job.id}>
                              <div className="candidate-loading-frame"><Sparkles size={18} /></div>
                              <div>
                                <strong>{settings?.characterName || referenceDraft.name || "Ảnh nhân vật"}</strong>
                                <span>{userFacingJobMessage(job.statusMessage) || "Đang chờ ChatGPT tạo ảnh…"}</span>
                              </div>
                            </article>
                          );
                        })}
                        {generatedCandidateGroups.map((group) => {
                          const activeIndex = Math.min(candidateCarouselIndex[group.key] ?? 0, Math.max(group.assets.length - 1, 0));
                          const asset = group.assets[activeIndex];
                          const isSelected = lockedProjectReferences.some((reference) =>
                            reference.characterSlot === group.slot &&
                            reference.referenceUse === group.referenceUse &&
                            reference.role === group.role &&
                            (reference.previewDataUrl === imagePreviewSrc(asset) || reference.sourceDescription?.includes(asset.id))
                          );
                          const previewSrc = imagePreviewSrc(asset);
                          return (
                            <article className={`candidate-card generated candidate-carousel${isSelected ? " selected" : ""}`} key={group.key}>
                              {previewSrc
                                ? <button type="button" className="candidate-image-button" title="Mở ảnh đã tạo" aria-label={`Mở ảnh đã tạo của ${group.name}`} onClick={() => setPreviewGeneratedAsset(asset)}><img src={previewSrc} alt={`Ảnh đề xuất của ${group.name}`} /></button>
                                : <div className="generated-placeholder">Ảnh chưa sẵn sàng<br />{sourceAssetName(asset)}</div>}
                              {group.assets.length > 1 ? (
                                <div className="candidate-carousel-controls" aria-label={`Ảnh đề xuất của ${group.name}`}>
                                  <button type="button" className="candidate-carousel-prev" aria-label="Ảnh trước" onClick={() => setCandidateCarouselIndex((current) => ({
                                    ...current,
                                    [group.key]: (activeIndex - 1 + group.assets.length) % group.assets.length
                                  }))}><ChevronLeft size={15} /></button>
                                  <span>{activeIndex + 1}/{group.assets.length}</span>
                                  <button type="button" className="candidate-carousel-next" aria-label="Ảnh sau" onClick={() => setCandidateCarouselIndex((current) => ({
                                    ...current,
                                    [group.key]: (activeIndex + 1) % group.assets.length
                                  }))}><ChevronRight size={15} /></button>
                                </div>
                              ) : null}
                              <div className="candidate-card-footer">
                                <strong className="candidate-character-name">{group.name}</strong>
                                <button type="button" className="candidate-select" title={isSelected ? "Đang dùng ảnh này" : "Dùng ảnh này cho nhân vật"} aria-label={isSelected ? `Đang dùng ảnh ${group.name}` : `Dùng ảnh ${group.name} cho nhân vật`} disabled={!previewSrc} onClick={() => confirmGeneratedAssetAsReference(asset)}><Check size={15} /></button>
                              </div>
                              <button type="button" className="candidate-delete" title="Xóa nhóm ảnh đề xuất" aria-label={`Xóa nhóm ảnh đề xuất của ${group.name}`} onClick={() => removeGeneratedAssetGroup(group.assets.map((item) => item.id))}><Trash2 size={14} /></button>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="reference-library">
                    <div className="section-heading compact workspace-subheading"><div><span className="eyebrow">04 · Thư viện đang dùng</span><h3>Ảnh tham chiếu</h3><p className="section-helper">Các ảnh này được dùng để giữ nhất quán và tạo shot.</p></div></div>
                    <div className="reference-grid">
                      {lockedCharacterGroups.length === 0 ? <div className="reference-empty">Chưa có ảnh tham chiếu đã khóa. Hãy xác nhận ảnh đúng trước khi dùng để giữ nhất quán.</div> : lockedCharacterGroups.map((group) => {
                        const item = group.primary || group.detail || group.references[0];
                        return (
                        <article className="reference-card" key={group.key}>
                          <button type="button" className="reference-thumb" title="Mở ảnh tham chiếu đã khóa" aria-label={`Mở ảnh tham chiếu đã khóa của ${group.name}`} onClick={() => {
                            setReferenceModalPane("main");
                            setReferenceProfileEditing(false);
                            setSelectedReferenceId(item.id);
                          }}>
                            <img src={item.previewDataUrl} alt={item.name} />
                          </button>
                          <div><span>{formatLabel(group.role)} · {group.role === "main_character" || group.role === "supporting_character" ? "đã khóa nhân vật" : "ảnh tham chiếu tài sản"}</span><strong>{group.name}</strong><p>{group.role === "main_character" || group.role === "supporting_character" ? (group.detail ? "Đã khóa ảnh nhận diện và ảnh chi tiết. Mở để xem lại." : "Đã khóa nhận diện. Chỉ thêm ảnh chi tiết khi cần kiểm tra cơ thể, biểu cảm hoặc trang phục.") : "Đã khóa tài sản nền. Chỉ tạo ảnh trạng thái riêng khi đạo cụ hoặc bối cảnh thực sự thay đổi."}</p></div>
                          <div className="reference-card-actions">
                            <button type="button" title="Xóa ảnh tham chiếu" aria-label={`Xóa ảnh tham chiếu đã khóa của ${group.name}`} onClick={() => {
                              if (!window.confirm(`Xóa ${group.name} khỏi thư viện đã khóa?`)) return;
                              group.references.forEach((reference) => removeReference(reference.id, false));
                            }}><Trash2 size={15} /></button>
                          </div>
                        </article>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>);
}
