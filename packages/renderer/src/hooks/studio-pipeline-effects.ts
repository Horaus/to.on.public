import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AutomationJob, Project, StudioState } from "@studio/types";
import type { PipelineStepId } from "@studio/domain/pipeline-gates";

type PipelineRun = { mode: "step" | "full"; running: boolean; message: string; currentStep?: PipelineStepId; startedAt: string } | null;
type PipelineEffectsDeps = {
  activeView: string;
  pipelineRun: PipelineRun;
  project: Project;
  state: StudioState;
  projectScenesLength: number;
  projectShotsLength: number;
  projectAssetsLength: number;
  projectReferencesLength: number;
  autoRetryingStructuredJobIdsRef: { current: Set<string> };
  nextPipelineStep: () => PipelineStepId;
  isProjectJobBusy: (job: AutomationJob) => boolean;
  jobBlocksCurrentAutomation: (job?: AutomationJob, step?: PipelineStepId) => boolean;
  retryAttemptsForTarget: (job: AutomationJob | undefined, jobs: AutomationJob[]) => number;
  isCorrectableStructuredImportFailure: (job: AutomationJob) => boolean;
  retryAutomationJob: (job: AutomationJob) => boolean;
  queueNextReadyVideoIfPossible: () => boolean;
  runPipelineStep: (mode: "full") => Promise<void>;
  setPipelineRun: Dispatch<SetStateAction<PipelineRun>>;
};

function findStructuredRetryJob(blockedJobs: AutomationJob[], jobs: AutomationJob[], isCorrectable: (job: AutomationJob) => boolean, retryAttempts: (job: AutomationJob | undefined, jobs: AutomationJob[]) => number): AutomationJob | undefined {
  return blockedJobs.find((job) => {
    const degenerated = job.status === "failed_retryable" && /PROVIDER_OUTPUT_DEGENERATED/.test(job.error || job.statusMessage || "");
    const previousSessionEnded = job.status === "failed_retryable" && /(?:previous desktop session ended before this browser job returned|waiting for the saved ChatGPT conversation messages to load|timed out waiting for provider tab to finish loading|failed to open provider tab:\s*navigation rejected)/i.test(job.error || job.statusMessage || "");
    // A lost desktop session is recoverable on the currently signed-in tab;
    // allow the normal three-attempt ceiling even when an earlier attempt was
    // recorded before the desktop restart. Other failures keep the stricter
    // automatic retry bound.
    return (degenerated || isCorrectable(job)) && retryAttempts(job, jobs) < 2
      || previousSessionEnded && retryAttempts(job, jobs) < 3;
  });
}

function findTransientFlowRetryJob(blockedJobs: AutomationJob[], jobs: AutomationJob[], retryAttempts: (job: AutomationJob | undefined, jobs: AutomationJob[]) => number): AutomationJob | undefined {
  return blockedJobs.find((job) => job.providerId === "google-flow-web" && job.jobType === "video" && job.status === "failed_retryable" && /(?:Failed to open provider tab: locator\.click: Timeout[\s\S]*element was detached from the DOM|Browser extension did not acknowledge the provider job)/i.test(job.error || job.statusMessage || "") && retryAttempts(job, jobs) < 2);
}

function projectJobsForStep(deps: PipelineEffectsDeps, step: PipelineStepId): { busyJobs: AutomationJob[]; blockedJobs: AutomationJob[] } {
  const jobs = deps.state.jobs.filter((job) => job.projectId === deps.project.id);
  return {
    busyJobs: jobs.filter(deps.isProjectJobBusy),
    blockedJobs: jobs.filter((job) => deps.jobBlocksCurrentAutomation(job, step))
  };
}

function retryBlockedJob(deps: PipelineEffectsDeps, blockedJobs: AutomationJob[]): boolean {
  // A failed job remains in blockedJobs after retry() is dispatched. Do not
  // keep returning `true` for that same identity: doing so leaves the YOLO
  // effect running forever while the user sees a perpetually spinning rail.
  // One automatic retry per job identity is the hard boundary; a subsequent
  // failure must become an explicit manual action.
  const eligible = blockedJobs.filter((job) => !deps.autoRetryingStructuredJobIdsRef.current.has(job.id));
  const structured = findStructuredRetryJob(eligible, deps.state.jobs, deps.isCorrectableStructuredImportFailure, deps.retryAttemptsForTarget);
  const flow = structured ? undefined : findTransientFlowRetryJob(eligible, deps.state.jobs, deps.retryAttemptsForTarget);
  const retryable = structured || flow;
  if (!retryable) return false;
  deps.autoRetryingStructuredJobIdsRef.current.add(retryable.id);
  deps.retryAutomationJob(retryable);
  return true;
}

export function useStudioPipelineEffects(deps: PipelineEffectsDeps): void {
  usePipelineContinuationEffect(deps);
}

function usePipelineContinuationEffect(deps: PipelineEffectsDeps): void {
  const {
    activeView, pipelineRun, project, state, projectScenesLength, projectShotsLength, projectAssetsLength,
    projectReferencesLength, autoRetryingStructuredJobIdsRef, nextPipelineStep, isProjectJobBusy,
    jobBlocksCurrentAutomation, retryAttemptsForTarget, isCorrectableStructuredImportFailure,
    retryAutomationJob, queueNextReadyVideoIfPossible, runPipelineStep, setPipelineRun
  } = deps;
  useEffect(() => {
    // A YOLO project must resume after a provider callback even if the user
    // briefly entered the step runner (the old mode="step" state left the
    // rail spinning while the missing shot batch was never dispatched).
    // Manual step runs remain isolated when YOLO is not enabled.
    // Automatic continuation is exclusively a YOLO opt-in. A cancelled run
    // must not dispatch the next job while the previous cancellation round
    // trip is still settling, even when its mode was previously "full".
    if (!pipelineRun?.running || !project.intake?.yoloEnabled) return;
    const step = nextPipelineStep();
    const { busyJobs, blockedJobs } = projectJobsForStep(deps, step);
    if (blockedJobs.length) {
      if (retryBlockedJob(deps, blockedJobs)) return;
      setPipelineRun((current) => current ? { ...current, running: false, message: `Dừng: ${blockedJobs.length} job cần xử lý trước khi chạy tiếp.` } : current);
      return;
    }
    if (busyJobs.length) return;
    if (step === "video" && queueNextReadyVideoIfPossible()) return;
    const timer = window.setTimeout(() => void runPipelineStep("full"), 300);
    return () => window.clearTimeout(timer);
  }, [activeView, pipelineRun, project.id, state.jobs, projectScenesLength, projectShotsLength, projectAssetsLength, projectReferencesLength, nextPipelineStep, isProjectJobBusy, jobBlocksCurrentAutomation, retryAttemptsForTarget, isCorrectableStructuredImportFailure, retryAutomationJob, queueNextReadyVideoIfPossible, runPipelineStep, setPipelineRun, autoRetryingStructuredJobIdsRef]);

}
