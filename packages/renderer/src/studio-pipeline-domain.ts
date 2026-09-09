import { createRetryAction } from "@studio/workflow/orchestration/retry-action";
import { getWorkflowBridge } from "@studio/workflow/workflow-bridge";
import { useStudioPipelineEffects } from "./hooks/studio-pipeline-effects";
import { isManualContractFailure } from "./studio-pipeline";

type RetryDependencies = Parameters<typeof createRetryAction>[0];
type PipelineEffectsDependencies = Parameters<typeof useStudioPipelineEffects>[0];

export type StudioPipelineDomainArgs = RetryDependencies & Omit<PipelineEffectsDependencies, "retryAutomationJob">;

export function useStudioPipelineDomain(args: StudioPipelineDomainArgs) {
  const retryAutomationJob = createRetryAction(args);
  useStudioPipelineEffects({ ...args, retryAutomationJob });
  return { retryAutomationJob };
}

type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "review" | "source" | "generate";

export function nextStudioAction(planned: boolean, prompted: boolean, generated: boolean, approved: boolean, reviewLabel: string) {
  if (!planned) return { label: "Bắt đầu từ kịch bản", view: "story" as StudioView };
  if (!prompted) return { label: "Dựng storyboard", view: "storyboard" as StudioView };
  if (!generated) return { label: "Tạo shot đầu", view: "generate" as StudioView };
  // Generated output is usable immediately. Review remains an optional
  // editing destination and must not block the production pipeline.
  return { label: "Mở dựng phim", view: "review" as StudioView };
}

export function createStudioPipelineControls(deps: any) {
  const goTo = (view: StudioView, options: { auto?: boolean } = {}) => {
    if (!options.auto) deps.pipelineAutoFollowRef.current = false;
    deps.setActiveView(view);
    document.querySelector(".content-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelCurrentProjectAutomation = (message = "Đã hủy các job đang chạy của project hiện tại. Có thể bấm Tiếp tục để chạy lại từ bước còn thiếu.") => {
    // Cancellation is an explicit user boundary. Clear the auto-follow intent
    // before the bridge state round-trip completes so a late provider update
    // cannot steer the renderer back into the cancelled pipeline.
    deps.pipelineAutoFollowRef.current = false;
    deps.lastPipelineFocusRef.current = "";
    deps.updateProjectPatch({ intake: { ...deps.intake, yoloEnabled: false } });
    deps.updatePendingStoryboardQueue(null, deps.project.id);
    deps.setPipelineRun((current: any) => ({ mode: current?.mode ?? "full", running: false, currentStep: current?.currentStep ?? deps.pipelineStep, message, startedAt: current?.startedAt ?? new Date().toISOString() }));
    if (getWorkflowBridge()) { void getWorkflowBridge().cancelProjectJobs(deps.project.id).then(deps.replaceState); return; }
    deps.setState((current: any) => ({ ...current, jobs: current.jobs.map((job: any) => job.projectId === deps.project.id && deps.isProjectJobBusy(job) ? { ...job, status: "cancelled", statusMessage: "Đã hủy từ ứng dụng.", updatedAt: new Date().toISOString() } : job) }));
  };
  const handleBlockedPipelineAction = async (mode: "step" | "full") => {
    if (deps.activeView === "overview" && document.activeElement?.closest(".overview-yolo-panel button")) deps.pipelineAutoFollowRef.current = true;
    const blockedJob = deps.projectBlockedJobs[0];
    if (!blockedJob) { if (deps.firstPreflightBlock) { deps.setSelectedShotId(deps.firstPreflightBlock.shot.id); goTo("storyboard"); return; } await deps.runPipelineStep(mode); return; }
    if (isManualContractFailure(blockedJob)) { goTo("story"); return; }
    deps.retryAutomationJob(blockedJob);
  };
  const togglePipelineRun = () => {
    if (deps.fullPipelineRunning) { cancelCurrentProjectAutomation("Đã tạm dừng tự động và gửi lệnh hủy job đang chạy."); return; }
    deps.pipelineAutoFollowRef.current = true;
    deps.updateProjectPatch({ intake: { ...deps.intake, yoloEnabled: true } });
    if (deps.hasPipelineBlock) { void handleBlockedPipelineAction("full"); return; }
    void deps.runPipelineStep("full");
  };
  return { goTo, cancelCurrentProjectAutomation, handleBlockedPipelineAction, togglePipelineRun };
}
