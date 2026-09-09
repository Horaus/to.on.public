import type { EditSequence } from "@studio/types";
import type { Asset, Project, Shot, StudioState, VisualReference } from "@studio/types";

export function deriveEditSequence(project: Project, state: StudioState, selectVideoAssets: (assets: Asset[], shot: Shot, jobs: StudioState["jobs"]) => Asset[], createDefaultEditSequence: (projectId: string, shots: Shot[], videoByShot: ReadonlyMap<string, Asset>) => EditSequence, normalizeEditSequence: (sequence: EditSequence, shots: Shot[], assets: Asset[]) => EditSequence) {
  const sceneIds=new Set(state.scenes.filter((scene)=>scene.projectId===project.id).map((scene)=>scene.id));
  const shots=state.shots.filter((shot)=>sceneIds.has(shot.sceneId));
  const assets=state.assets.filter((asset)=>asset.projectId===project.id&&!asset.metadata?.hiddenFromStoryboard);
  const videoByShot = new Map<string, (typeof assets)[number]>();
  for (const shot of shots) {
    const video = selectVideoAssets(assets, shot, state.jobs)[0];
    if (video) videoByShot.set(shot.id, video);
  }
  return normalizeEditSequence(project.editSequence??createDefaultEditSequence(project.id,shots,videoByShot),shots,assets);
}

export function summarizeProject(project: Project, state: StudioState, isQuickSetupReference: (reference: VisualReference) => boolean, isActiveJob: (job: StudioState["jobs"][number]) => boolean, jobNeedsUserAction: (job: StudioState["jobs"][number]) => boolean) {
  const transportSummary = state.projectSummaries?.find((item) => item.projectId === project.id);
  if (transportSummary && project.id !== state.activeProjectId && !state.scenes.some((scene) => scene.projectId === project.id)) return { project, ...transportSummary };
  const scenes=state.scenes.filter((scene)=>scene.projectId===project.id);
  const sceneIds=new Set(scenes.map((scene)=>scene.id));
  const shots=state.shots.filter((shot)=>sceneIds.has(shot.sceneId));
  const assets=state.assets.filter((asset)=>asset.projectId===project.id&&!asset.metadata?.hiddenFromStoryboard);
  const references=state.visualReferences.filter((reference)=>reference.projectId===project.id&&!isQuickSetupReference(reference));
  const jobs=state.jobs.filter((job)=>job.projectId===project.id);
  // The durable ledger intentionally keeps every retry. Project summaries
  // should report current blockers, not count each historical failure again.
  // Collapse jobs by their production target and inspect only the newest
  // attempt, matching the queue's current-vs-history presentation.
  const latestByTarget = new Map<string, StudioState["jobs"][number]>();
  for (const job of jobs) {
    const target = `${job.jobType}:${job.shotId || job.id}`;
    const current = latestByTarget.get(target);
    if (!current || new Date(job.updatedAt || job.createdAt).getTime() > new Date(current.updatedAt || current.createdAt).getTime()) latestByTarget.set(target, job);
  }
  const currentActionJobs = [...latestByTarget.values()].filter((job) => job.status.startsWith("failed") || jobNeedsUserAction(job));
  return {
    project,sceneCount: scenes.length,shotCount: shots.length,assetCount: assets.length,
    sourceCount: assets.length+references.length,jobCount: jobs.length,
    approvedShots: shots.filter((shot)=>shot.status==="approved").length,
    actionNeededJobs: currentActionJobs.length,
    activeJobs: jobs.filter(isActiveJob).length
  };
}
