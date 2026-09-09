import { ChevronRight, CornerUpRight, Languages, Loader2, Wand2 } from "lucide-react";
import { useStudioApplicationContext } from "./studio-application-context";

export function StoryboardScriptPanel() {
  const { character, contentLanguage, contentLanguageMismatch, generatePrompt, productionLanguage, project, projectCharacters, renderVoiceClip, safeVideoProviderId, selectedShotRenderDuration, setSelectedShotId, state, storyboardScene, storyboardSceneShots, storyboardSideShot, storyboardStep, syncStoryboardBreakdownToScenes, t, translateProductionContext, translationJobActive, updateScene, updateShot, updateStoryboardBreakdown } = useStudioApplicationContext();
  return (
              <details open>
                <summary>
                  <span>{t("storyboard.script")}</span>
                  <ChevronRight size={13} />
                </summary>
                {contentLanguageMismatch ? <div className="storyboard-context-actions">
                  <button type="button"
                    className="context-icon-action"
                    title={`${t("storyboard.translateContext")}: ${contentLanguage} → ${productionLanguage}`}
                    aria-label="Dịch ngữ cảnh kịch bản hiện tại"
                    disabled={translationJobActive}
                    onClick={() => translateProductionContext()}
                  >
                    {translationJobActive ? <Loader2 size={13} className="spin" /> : <Languages size={13} />}
                  </button>
                </div> : null}
                <small>Chỉnh sửa trước khi tạo khung storyboard. Dùng --- để tách cảnh khi đồng bộ.</small>
                <label>{t("storyboard.sceneScript")}<textarea className="storyboard-script-input" value={project.storyDocument?.sceneBreakdown ?? ""} onChange={(event) => updateStoryboardBreakdown(event.target.value)} placeholder={"Cảnh 1: mở đầu và hình ảnh chính…\n---\nCảnh 2: hình ảnh giải thích…\n---\nCảnh 3: hình ảnh kết thúc…"} /></label>
                {storyboardStep > 0 ? <div className="storyboard-side-actions">
                  <button type="button" disabled={!project.storyDocument?.sceneBreakdown?.trim()} onClick={syncStoryboardBreakdownToScenes}><CornerUpRight size={13} /> {t("storyboard.syncScenes")}</button>
                  <button type="button" onClick={generatePrompt}><Wand2 size={14} /> {t("common.buildPrompt")}</button>
                </div> : null}
              </details>
  );
}
