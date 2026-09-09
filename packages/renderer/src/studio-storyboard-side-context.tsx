import { useStudioApplicationContext } from "./studio-application-context";
import { StoryboardScriptPanel } from "./storyboard-script-panel";
import { StoryboardShotPanel } from "./storyboard-shot-panel";

export function StoryboardSideContext() {
  const { contentLanguage, contentLanguageMismatch, productionLanguage, storyboardStep, t } = useStudioApplicationContext();
  return (
    <section className="storyboard-side-context" aria-label="Chỉnh shot storyboard">
      {contentLanguageMismatch ? <small className="translation-pending">{t("storyboard.translatePending")} {contentLanguage} → {productionLanguage}</small> : null}
      {storyboardStep === 0 ? <StoryboardScriptPanel /> : <StoryboardShotPanel />}
    </section>
  );
}
