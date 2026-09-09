import type {
  ProductionFormat,
  ProjectIntake,
  SourceMaterialType
} from "@studio/workflow/renderer-contracts";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  RefreshCcw,
  Route,
  Sparkles
} from "lucide-react";
import { languageOptions, promptNameFromLanguageCode } from "@studio/renderer-core/i18n";
import { durationToSeconds, finiteInputNumber, productionFormatPatch } from "@studio/renderer-core/production-ui-support";
import { platformOptions } from "@studio/workflow/story-intake-rules";
import { useStudioApplicationContext } from "../studio-application-context";
import { audienceLabel, formatLabel, statusLabel, userFacingJobMessage } from "@studio/renderer-core/ui-format";
import { StoryPackageEditor } from "../views/story-package-view";

// These are UI-facing explanations. Keep the English prompt rules in the
// workflow package untouched so provider prompts remain stable, while the
// visible intake panel stays consistent with the selected app language.
const sourceRuleLabels: Record<SourceMaterialType, string> = {
  idea: "Phát triển tiền đề thành câu chuyện hoàn chỉnh; được phép thêm các mắt xích còn thiếu nhưng phải giữ đúng ý định cốt lõi của người dùng.",
  novel: "Chuyển thể văn xuôi theo trình tự; giữ quan hệ nhân quả, động cơ nhân vật, thoại quan trọng và sự kiện chính; chuyển lời kể nội tâm thành hành động nhìn thấy được.",
  screenplay: "Xem đầu vào là kịch bản có sẵn; giữ thứ tự cảnh, ý định thoại và nhịp kịch; chuẩn hoá sang cấu trúc sản xuất mà không viết lại tiền đề."
};
const formatRuleLabels: Record<ProductionFormat, string> = {
  short_film: "Xây dựng một cung điện ảnh trọn vẹn gồm mở đầu, leo thang, cao trào và kết; ưu tiên mạch cảm xúc.",
  short_video: "Mở ngay bằng móc hình ảnh hoặc lời nói; dồn thông tin vào một ý trung tâm và kết bằng điểm rơi hoặc vòng lặp rõ ràng.",
  video_series: "Thiết kế cung truyện theo tập; mỗi tập có móc và điểm rơi riêng, đồng thời giữ các tuyến mở, luật nhân vật, địa điểm, đạo cụ và tính liên tục hình ảnh."
};

export function StoryScreen() {
  const { applyPlanner, flowFocusTarget, goTo, intake, languageCode, name, pipelineActionLabel, project, projectBusyJobs, projectScenes, projectShots, recoverJob, rewriteStoryWithAi, runPipelineStep, scenePlanSource, setSelectedShotId, setStorySeed, showStoryJobStatus, storyJob, storyJobActive, storySeed, t, textProvider, updateIntake, updateStoryDocument } = useStudioApplicationContext();
  const hasNarrativeArtifact = Boolean(project.storyDocument?.story?.trim() || project.storyDocument?.sceneBreakdown?.trim() || (intake.sourceType === "screenplay" && projectScenes.length > 0));
  return (<section className="view story-view">
                <div className="view-intro">
                  <div>
                    <span className="eyebrow">{t("story.phase")}</span>
                    <h2>{t("story.title")}</h2>
                    <p>{t("story.subtitle")}</p>
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="compact-action"
                      aria-label="Tạo bản nháp tại chỗ"
                      title="Tạo nhanh cấu trúc ba cảnh, sáu shot trên máy mà không gọi AI."
                      onClick={applyPlanner}
                    >
                      <Route size={15} /> {t("story.createLocal")}
                    </button>
                    <button type="button" className="primary" aria-label={pipelineActionLabel} disabled={Boolean(projectBusyJobs.length)} onClick={() => void runPipelineStep("step")}>
                      <Sparkles size={15} />
                      {projectBusyJobs.length ? "Đang xử lý…" : pipelineActionLabel}
                    </button>
                  </div>
                </div>
                <div className="story-intake-workspace">
                  <div className={`source-column ${flowFocusTarget === "source" ? "flow-focus-pulse" : ""}`} data-flow-target="source" tabIndex={-1}>
                    <div className="compact-section-head">
                      <div><span className="eyebrow">{t("story.sourceContent")}</span><h3>{intake.sourceType === "novel" ? "Tiểu thuyết / văn xuôi" : intake.sourceType === "screenplay" ? "Kịch bản có sẵn" : t("story.storyIdea")}</h3></div>
                      <span>{storySeed.length.toLocaleString()} ký tự</span>
                    </div>
                    <label className="story-editor">
                      <textarea aria-label="Nội dung nguồn hoặc brief" value={storySeed} onChange={(event) => setStorySeed(event.target.value)} placeholder={intake.sourceType === "idea" ? "Một ý tưởng ngắn: ai, ở đâu, gặp tình huống gì và điều gì có thể thay đổi…" : "Dán nội dung nguồn vào đây…"} />
                    </label>
                    {showStoryJobStatus ? (
                      <div className={`story-job-status source-feedback ${storyJob!.status.startsWith("failed") ? "failed" : storyJob!.status === "approved" ? "complete" : ""}`} role="status" aria-live="polite">
                        <div className="job-status-icon">
                          {storyJob!.status === "approved" ? <Check size={17} /> : storyJob!.status.startsWith("failed") ? <AlertTriangle size={17} /> : <RefreshCcw size={17} />}
                        </div>
                        <div>
                          <strong>{storyJob!.status === "approved" ? (intake.sourceType === "screenplay" ? "Đã nhận kịch bản" : "Đã tạo câu chuyện") : storyJob!.status.startsWith("failed") ? "Không thể nhận kết quả kịch bản" : statusLabel(storyJob!.status)}{storyJob!.status === "approved" ? <span className="sr-only"> {intake.sourceType === "screenplay" ? "Đã nhập kịch bản thành công" : "Đã tạo câu chuyện thành công"}</span> : null}</strong>
                          <span>{userFacingJobMessage(storyJob!.error) || (storyJob!.status === "approved" ? "Có thể tiếp tục chỉnh sửa và phân cảnh." : "Đang chờ kết quả kịch bản…")}</span>
                        </div>
                        {storyJobActive ? <em>{Math.round((storyJob!.progress ?? 0) * 100)}%</em> : storyJob!.status.startsWith("failed") && storyJob!.providerConversationUrl ? (
                          <button type="button" onClick={() => recoverJob(storyJob!.id)}>Khôi phục kết quả</button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="input-guidance">
                        <strong>Gợi ý nhập</strong>
                        <span>{intake.sourceType === "idea" ? "Chỉ cần 1–5 câu tự nhiên. Hệ thống sẽ phát triển thành câu chuyện trước khi phân cảnh." : intake.sourceType === "novel" ? "Mỗi lượt nên dùng một chương hoặc 1.000–8.000 từ." : "Dùng các đoạn có tiêu đề cảnh, hành động và lời thoại."}</span>
                      </div>
                    )}
                  </div>
                  <div className={`setup-column ${flowFocusTarget === "profile" ? "flow-focus-pulse" : ""}`} data-flow-target="profile" tabIndex={-1}>
                    <div className="compact-section-head">
                      <div><span className="eyebrow">Hồ sơ sản xuất</span><h3>{formatLabel(intake.sourceType)} → {formatLabel(intake.productionFormat)}</h3></div>
                    </div>
                    <div className="intake-grid compact">
                      <label>{t("story.inputType")}
                        <select aria-label="Loại đầu vào" value={intake.sourceType} onChange={(event) => updateIntake({ sourceType: event.target.value as SourceMaterialType })}>
                          <option value="idea">Ý tưởng</option><option value="novel">Tiểu thuyết / văn xuôi</option><option value="screenplay">Kịch bản</option>
                        </select>
                      </label>
                      <label>{t("story.productionFormat")}
                        <select aria-label="Định dạng sản xuất" value={intake.productionFormat} onChange={(event) => {
                          const productionFormat = event.target.value as ProductionFormat;
                          updateIntake(productionFormatPatch(productionFormat, intake.episodeCount));
                        }}>
                          <option value="short_film">Phim ngắn</option><option value="short_video">Video ngắn</option><option value="video_series">Series video</option>
                        </select>
                      </label>
                      <label>{t("story.targetRuntime")}
                        <div className="duration-control">
                          <input aria-label="Giá trị thời lượng mục tiêu" type="number" min="0.25" step="0.25" value={intake.durationValue ?? intake.targetDurationSec} onChange={(event) => {
                            const durationValue = finiteInputNumber(event.target.value, intake.durationValue ?? intake.targetDurationSec, { min: 0.25 });
                            updateIntake({ durationValue, targetDurationSec: durationToSeconds(durationValue, intake.durationUnit) });
                          }} />
                          <select aria-label="Đơn vị thời lượng mục tiêu" value={intake.durationUnit ?? "seconds"} onChange={(event) => {
                            const durationUnit = event.target.value as ProjectIntake["durationUnit"];
                            updateIntake({ durationUnit, targetDurationSec: durationToSeconds(intake.durationValue ?? 1, durationUnit) });
                          }}><option value="seconds">giây</option><option value="minutes">phút</option><option value="hours">giờ</option></select>
                        </div>
                      </label>
                      {intake.productionFormat === "video_series" ? <label>Tập<input aria-label="Số tập series" type="number" min="2" max="100" value={intake.episodeCount} onChange={(event) => updateIntake({ episodeCount: finiteInputNumber(event.target.value, intake.episodeCount, { min: 2, max: 100 }) })} /></label> : null}
                      <label className="audience-field">{t("story.audience")}<input aria-label="Đối tượng khán giả" value={audienceLabel(intake.audience)} onChange={(event) => updateIntake({ audience: event.target.value })} /></label>
                      <label>{t("common.language")}
                        <select aria-label="Ngôn ngữ nội dung sản xuất" value={languageCode} onChange={(event) => updateIntake({ outputLanguage: promptNameFromLanguageCode(event.target.value) })}>
                          {languageOptions.map((language) => <option key={language.code} value={language.code} disabled={!language.enabled}>{language.nativeLabel}{language.enabled ? "" : " · sắp có"}</option>)}
                        </select>
                      </label>
                    </div>
                    <details className="platform-picker">
                      <summary><span>{t("story.distribution")}</span><strong>{(intake.platforms ?? [intake.platform]).join(", ")}</strong><ChevronRight size={14} /></summary>
                      <div>{platformOptions.map((platform) => {
                        const selected = (intake.platforms ?? [intake.platform]).includes(platform);
                        return <label key={platform}><input aria-label={`Nền tảng ${platform}`} type="checkbox" checked={selected} onChange={() => {
                          const current = intake.platforms ?? [intake.platform];
                          const platforms = selected ? current.filter((item) => item !== platform) : [...current, platform];
                          updateIntake({ platforms, platform: platforms[0] ?? "YouTube" });
                        }} /> {platform}</label>;
                      })}</div>
                    </details>
                    {intake.productionFormat === "video_series" ? <details className="series-bible-input"><summary>Tài liệu nền series <span>{intake.seriesBible ? "Đã nạp" : "Tuỳ chọn"}</span></summary><textarea aria-label="Tài liệu nền series" value={intake.seriesBible ?? ""} onChange={(event) => updateIntake({ seriesBible: event.target.value })} placeholder="Nhân vật lặp lại, luật thế giới, cấu trúc tập…" /><input aria-label="Tải tài liệu nền series" type="file" accept=".md,.txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) updateIntake({ seriesBible: await file.text() }); }} /></details> : null}
                    <details className="profile-rule"><summary><span>Quy tắc chuyển thể</span><strong>Xem quy tắc</strong></summary><span>{sourceRuleLabels[intake.sourceType]} {formatRuleLabels[intake.productionFormat]}</span></details>
                  </div>
                </div>
                {project.storyDocument ? (
                  <StoryPackageEditor
                    document={project.storyDocument}
                    providerName={textProvider.name}
                    rewriteActive={storyJobActive}
                    onChange={updateStoryDocument}
                    onRewrite={rewriteStoryWithAi}
                  />
                ) : (
                  <div className="story-empty">
                    <Sparkles size={19} />
                    <div><strong>Chưa có câu chuyện hoàn chỉnh</strong><span>Chạy AI văn bản hoặc tạo bản nháp cơ bản tại chỗ.</span></div>
                  </div>
                )}
                {hasNarrativeArtifact ? <div className="scene-list" aria-label="Dòng thời gian cảnh và shot">
                  <div className="scene-list-head">
                    <strong>Dòng thời gian cảnh</strong>
                    <span>{formatLabel(scenePlanSource)}</span>
                  </div>
                  {projectScenes.map((item) => (
                    <article className="scene-row" key={item.id}>
                      <div className="scene-index">{String(item.order).padStart(2, "0")}</div>
                      <div className="scene-details">
                        <div>
                          <h3>{item.title}</h3>
                          <span>{item.location} · {item.timeOfDay} · {item.emotionalTone}</span>
                        </div>
                        <p>{item.summary}</p>
                      </div>
                      <div className="scene-shots">
                        {projectShots.filter((shot) => shot.sceneId === item.id).map((shot) => (
                          <button type="button" key={shot.id} onClick={() => { setSelectedShotId(shot.id); goTo("storyboard"); }}>
                            SH{shot.order}
                            <span>{shot.durationSec}s</span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div> : <div className="scene-list-empty" role="status"><strong>Chưa có phân cảnh để hiển thị</strong><span>Phát triển câu chuyện trước, sau đó hệ thống mới đưa scene và shot vào bước tiếp theo.</span></div>}
              </section>);
}
