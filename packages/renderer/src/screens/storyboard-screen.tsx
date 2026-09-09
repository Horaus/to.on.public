import {
  ChevronRight,
  Wand2
} from "lucide-react";
import { useStudioApplicationContext } from "../studio-application-context";
import { ShotMatrix } from "../views/shot-review-views";

export function StoryboardScreen() {
  const { bridgeCount, generatePrompt, goTo, projectAssets, projectReferences, projectScenes, projectShots, promoteReferenceToShot, queueVideoJob, recoverJob, retryAutomationJob, runSceneMissingKeyframeQueue, runStoryboardOverviewQueue, runStoryboardRatioRepairQueue, selectedShot, setSelectedShotId, setStoryboardStep, state, storyboardAspectRatio, storyboardStep, t, videoPreflightForShot } = useStudioApplicationContext();
  const selectedShotHasKeyframe = projectAssets.some((asset) => asset.type === "image" && asset.shotId === selectedShot.id && selectedShot.assetIds.includes(asset.id));
  const selectedShotHasVisualReference = projectReferences.some((reference) => selectedShot.assetIds.includes(reference.id));
  return (<section className="view storyboard-view">
                <div className="view-intro compact">
                  <div>
                    <span className="eyebrow">{t("storyboard.phase")}</span>
                    <h2>{t("storyboard.title")}</h2>
                  </div>
                  {storyboardStep > 0 ? <div className="inline-actions">
                    <button type="button" aria-label={t("common.buildPrompt")} onClick={generatePrompt}><Wand2 size={16} /> {t("common.buildPrompt")}</button>
                    {!selectedShotHasKeyframe && selectedShotHasVisualReference ? <button type="button" onClick={() => void promoteReferenceToShot(selectedShot)}>Dùng reference làm keyframe</button> : null}
                    <button type="button" className="primary" onClick={() => goTo("generate")}>{t("common.continueToGenerate")} <ChevronRight size={16} /></button>
                  </div> : null}
                </div>
                <div className="storyboard-layout">
                  <ShotMatrix
                    scenes={projectScenes}
                    shots={projectShots}
                    assets={projectAssets}
                    jobs={state.jobs}
                    selectedShotId={selectedShot.id}
                    storyboardStep={storyboardStep}
                    aspectRatio={storyboardAspectRatio}
                    preflightByShot={Object.fromEntries(projectShots.map((shot) => [shot.id, videoPreflightForShot(shot)]))}
                    enforcePreflight={bridgeCount > 0}
                    onSelectShot={setSelectedShotId}
                    onSelectStep={(step, shotId) => {
                      setStoryboardStep(step);
                      if (shotId) setSelectedShotId(shotId);
                    }}
                    onQueueShot={queueVideoJob}
                    onQueueStoryboard={runStoryboardOverviewQueue}
                    onQueueMissingKeyframes={runSceneMissingKeyframeQueue}
                    onRepairFrameRatio={runStoryboardRatioRepairQueue}
                    onRecoverJob={recoverJob}
                    onRetryJob={retryAutomationJob}
                  />
                </div>
              </section>);
}
