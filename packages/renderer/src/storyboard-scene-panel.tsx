import { ChevronRight, Languages, Loader2 } from "lucide-react";
import { useStudioApplicationContext } from "./studio-application-context";

export function StoryboardScenePanel() {
  const { character, contentLanguage, contentLanguageMismatch, generatePrompt, productionLanguage, project, projectCharacters, renderVoiceClip, safeVideoProviderId, selectedShotRenderDuration, setSelectedShotId, state, storyboardScene, storyboardSceneShots, storyboardSideShot, storyboardStep, syncStoryboardBreakdownToScenes, t, translateProductionContext, translationJobActive, updateScene, updateShot, updateStoryboardBreakdown } = useStudioApplicationContext();
  return (
              <>
                <details open>
                  <summary>
                    <span>{t("storyboard.sceneBreakdown")}</span>
                    <ChevronRight size={13} />
                  </summary>
                  {contentLanguageMismatch ? <div className="storyboard-context-actions">
                    <button
                      type="button"
                      className="context-icon-action"
                      title={`${t("storyboard.translateContext")}: ${contentLanguage} → ${productionLanguage}`}
                      aria-label="Dịch ngữ cảnh kịch bản hiện tại"
                      disabled={translationJobActive}
                      onClick={() => translateProductionContext()}
                    >
                      {translationJobActive ? <Loader2 size={13} className="spin" /> : <Languages size={13} />}
                    </button>
                  </div> : null}
                  <strong>SC{String(storyboardScene.order).padStart(2, "0")} · {storyboardScene.title}</strong>
                  <label>{t("storyboard.scenePurpose")}<textarea value={storyboardScene.summary} onChange={(event) => updateScene({ id: storyboardScene.id, summary: event.target.value })} placeholder="Cảnh này cần truyền đạt điều gì bằng hình ảnh?" /></label>
                  <label>Mục tiêu cảnh<input value={storyboardScene.objective ?? ""} onChange={(event) => updateScene({ id: storyboardScene.id, objective: event.target.value })} placeholder="Nhân vật muốn đạt điều gì trước khi cảnh kết thúc?" /></label>
                  <label>Xung đột / áp lực<input value={storyboardScene.conflict ?? ""} onChange={(event) => updateScene({ id: storyboardScene.id, conflict: event.target.value })} placeholder="Điều gì cản trở mục tiêu hoặc làm tăng cái giá phải trả?" /></label>
                  <label>Bước ngoặt<input value={storyboardScene.dramaticTurn ?? ""} onChange={(event) => updateScene({ id: storyboardScene.id, dramaticTurn: event.target.value })} placeholder="Phát hiện, lựa chọn, đảo chiều hoặc hệ quả làm tình thế thay đổi." /></label>
                  <label>Trạng thái vào → ra<textarea value={`${storyboardScene.entryState ?? ""}\n→ ${storyboardScene.exitState ?? ""}`} onChange={(event) => {
                    const [entryState, ...exitParts] = event.target.value.split(/\n→?\s*/);
                    updateScene({ id: storyboardScene.id, entryState, exitState: exitParts.join("\n").trim() });
                  }} placeholder={"Trạng thái nhân vật/đạo cụ/bối cảnh/cảm xúc kế thừa\n→ Trạng thái thay đổi chuyển sang cảnh kế tiếp"} /></label>
                </details>
                <details open>
                  <summary><span>{t("storyboard.shotsInScene")}</span><ChevronRight size={13} /></summary>
                  {storyboardSceneShots.map((shot) => (
                    <button type="button" className={shot.id === storyboardSideShot.id ? "active" : ""} key={shot.id} onClick={() => setSelectedShotId(shot.id)}>
                      SH{shot.order} · {shot.durationSec}s
                    </button>
                  ))}
                </details>
          </>
  );
}
