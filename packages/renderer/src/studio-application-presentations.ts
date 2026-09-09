import type { LucideIcon } from "lucide-react";
import type { BrowserProviderAdapter, Project, Scene, Shot, Character, VisualReference, Asset, AutomationJob } from "@studio/types";
import type { PipelineStepId } from "@studio/domain/pipeline-gates";
import type { I18nKey } from "./core/i18n";
import { jobNeedsCurrentUserAction } from "./studio-pipeline";
import { isProjectJobBusy } from "@studio/renderer-core/job-status";

type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";
export type NavigationState = "pending" | "active" | "blocked" | "review" | "complete";

export function buildBoardNodes(args: { project: Project; character: Character; scene: Scene; selectedShot: Shot; promptLength: number; selectedAssets: Asset[]; selectedProvider: BrowserProviderAdapter }) {
  const { project, character, scene, selectedShot, selectedAssets, selectedProvider } = args;
  return [
    { kind: "Story", title: project.name, meta: "Câu chuyện", x: 4, y: 10 },
    { kind: "Character", title: character.name, meta: "Nhân vật", x: 28, y: 5 },
    { kind: "Style", title: "Bộ quy tắc hình ảnh", meta: "Phong cách & nhịp hình", x: 52, y: 8 },
    { kind: "Scene", title: scene.title, meta: scene.emotionalTone || "Cảnh", x: 18, y: 44 },
    { kind: "Shot", title: `Shot ${selectedShot.order}`, meta: selectedShot.status, x: 46, y: 42 },
    { kind: "Provider", title: selectedProvider.name, meta: "Công cụ tạo", x: 66, y: 66 },
    { kind: "Asset", title: `${selectedAssets.length} tài nguyên`, meta: "Đã tạo", x: 37, y: 74 },
    { kind: "Export", title: "Bản dựng 9:16", meta: "Sẵn sàng", x: 9, y: 73 }
  ];
}

export function buildNavigation(t: (key: I18nKey) => string, icons: Record<string, LucideIcon>) {
  return [
    { id: "overview" as const, group: "workspace" as const, label: t("nav.overview"), ariaLabel: t("nav.overview"), icon: icons.overview },
    { id: "flow" as const, group: "workspace" as const, label: t("nav.flow"), ariaLabel: t("nav.flow"), icon: icons.flow },
    { id: "story" as const, group: "production" as const, label: t("nav.story"), ariaLabel: t("nav.story"), icon: icons.story },
    { id: "assets" as const, group: "production" as const, label: t("nav.assets"), ariaLabel: t("nav.assets"), icon: icons.assets },
    { id: "storyboard" as const, group: "production" as const, label: t("nav.storyboard"), ariaLabel: t("nav.storyboard"), icon: icons.storyboard },
    { id: "review" as const, group: "production" as const, label: t("nav.review"), ariaLabel: t("nav.review"), icon: icons.review },
    { id: "source" as const, group: "library" as const, label: t("nav.source"), ariaLabel: t("nav.source"), icon: icons.source },
    { id: "generate" as const, group: "library" as const, label: t("nav.generate"), ariaLabel: t("nav.generate"), icon: icons.generate }
  ];
}

export function buildPhaseStatusByView(phaseStatus: boolean[], jobs: AutomationJob[] = [], project?: Pick<Project, "storyDocument">): Partial<Record<StudioView, NavigationState>> {
  const task = (job: AutomationJob) => String((job.input as any)?.bridgeMessage?.task || job.jobType);
  const stateFor = (complete: boolean, matches: (job: AutomationJob) => boolean): NavigationState => {
    const related = jobs.filter(matches);
    if (related.some((job) => jobNeedsCurrentUserAction(job, jobs))) return "blocked";
    if (related.some(isProjectJobBusy)) return "active";
    if (related.some((job) => job.status === "review_required")) return "review";
    return complete ? "complete" : "pending";
  };
  return {
    // The story tab is complete only when the authored story artifact exists.
    // A project can have stale scenes/shots from an earlier attempt while its
    // complete story is still empty; phaseStatus[0] used to mark that state as
    // complete and made the sidebar contradict the story screen.
    story: stateFor(Boolean(project?.storyDocument?.story?.trim()), (job) => /story|foundation|narrative|screenplay|scene.*breakdown/i.test(task(job))),
    assets: stateFor(phaseStatus[1], (job) => /character|identity|reference|location|prop/i.test(task(job))),
    storyboard: stateFor(phaseStatus[2], (job) => /storyboard|keyframe|scene_frame|text_to_image/i.test(task(job))),
    review: stateFor(phaseStatus[4], (job) => /review|qa/i.test(task(job)))
  };
}

type ProjectSummaryLike = { project: Project; sceneCount: number; shotCount: number; assetCount: number; sourceCount: number; jobCount: number; approvedShots: number; actionNeededJobs: number; activeJobs: number };
export function filterProjectRows(projectSummaries: ProjectSummaryLike[], search: string, activeProjectId: string) {
  const term = search.trim().toLowerCase();
  return projectSummaries.filter((item) => !term || item.project.name.toLowerCase().includes(term) || item.project.description?.toLowerCase().includes(term))
    .sort((left, right) => Number(right.project.id === activeProjectId) - Number(left.project.id === activeProjectId) || new Date(right.project.updatedAt).getTime() - new Date(left.project.updatedAt).getTime());
}

export function activePipelineJobsForStep(jobs: AutomationJob[], step: PipelineStepId, jobPipelineStep: (job: AutomationJob) => PipelineStepId | undefined) {
  return jobs.filter((job) => jobPipelineStep(job) === step || !jobPipelineStep(job)).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
