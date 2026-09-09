import type { Project, ProjectIntake, Scene, Shot, StudioState, StyleBible } from "@studio/types";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { startTransition } from "react";
import { defaultProjectIntake } from "@studio/renderer-core/production-ui-support";
import { makeId } from "@studio/renderer-core/runtime-id";
type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";
type PipelineStepId = "setup" | "foundation" | "architecture" | "screenplay" | "shots" | "character" | "prompts" | "storyboard" | "video" | "review";
type PipelineRunState = { mode: "step" | "full"; running: boolean; currentStep?: PipelineStepId; message: string; startedAt: string };

type StateSetter = Dispatch<SetStateAction<StudioState>>;
type ValueSetter<T> = Dispatch<SetStateAction<T>>;

type ProjectStateActionsInput = {
  state: StudioState;
  setState: StateSetter;
  selectedShotId: string;
  setSelectedShotId: ValueSetter<string>;
  setStorySeed: ValueSetter<string>;
  setGeneratedStorySeed: ValueSetter<string>;
  setProjectManagerOpen: ValueSetter<boolean>;
  setAppManagerOpen: ValueSetter<boolean>;
  setPipelineRun: ValueSetter<PipelineRunState | null>;
  updatePendingStoryboardQueue: (queue: null, projectId: string) => void;
  pendingAutoVideoShotRef: MutableRefObject<string | null>;
  pipelineAutoFollowRef: MutableRefObject<boolean>;
  lastPipelineFocusRef: MutableRefObject<string>;
};

export function createProjectStateActions(input: ProjectStateActionsInput) {
  const {
    state, setState, selectedShotId, setSelectedShotId, setStorySeed, setGeneratedStorySeed,
    setProjectManagerOpen, setAppManagerOpen, setPipelineRun, updatePendingStoryboardQueue,
    pendingAutoVideoShotRef, pipelineAutoFollowRef, lastPipelineFocusRef
  } = input;

  function replaceState(nextState: StudioState) {
    setState(nextState);
    const activeProject = nextState.projects.find((item) => item.id === nextState.activeProjectId) ?? nextState.projects[0];
    const sceneIds = new Set(nextState.scenes.filter((item) => item.projectId === activeProject.id).map((item) => item.id));
    const activeShots = nextState.shots.filter((shot) => sceneIds.has(shot.sceneId));
    if (!activeShots.some((shot) => shot.id === selectedShotId)) setSelectedShotId(activeShots[0]?.id ?? selectedShotId);
  }

  function resetProjectWorkflowRuntime(projectId: string) {
    updatePendingStoryboardQueue(null, projectId);
    pendingAutoVideoShotRef.current = null;
    pipelineAutoFollowRef.current = false;
    lastPipelineFocusRef.current = "";
    setPipelineRun(null);
  }

  function applyProjectSelection(nextState: StudioState, projectId: string) {
    const nextProject = nextState.projects.find((item) => item.id === projectId) ?? nextState.projects[0];
    const nextSceneIds = new Set(nextState.scenes.filter((item) => item.projectId === nextProject.id).map((item) => item.id));
    // Selecting a new project must reset the runtime for the project being
    // entered, not only the project being left. Otherwise a persisted/stale
    // YOLO run from another project can render as "Tạm dừng" here and its
    // continuation effect can start jobs against the new project without an
    // explicit user action.
    resetProjectWorkflowRuntime(nextProject.id);
    startTransition(() => {
      setState(nextState);
      setStorySeed(nextProject.sourceDraft ?? nextProject.description ?? "");
      setGeneratedStorySeed(nextProject.storyDocument ? nextProject.sourceDraft ?? nextProject.description ?? "" : "");
      setSelectedShotId(nextState.shots.find((item) => nextSceneIds.has(item.sceneId))?.id ?? "");
    });
  }

  function selectProject(projectId: string) {
    if (projectId === state.activeProjectId) {
      setProjectManagerOpen(false);
      setAppManagerOpen(false);
      return Promise.resolve();
    }
    applyProjectSelection({ ...state, activeProjectId: projectId }, projectId);
    setProjectManagerOpen(false);
    setAppManagerOpen(false);
    if (!window.studioBridge) return Promise.resolve();
    return window.studioBridge.selectProject(projectId).then((nextState) => applyProjectSelection(nextState, projectId));
  }

  return { replaceState, resetProjectWorkflowRuntime, selectProject };
}

type ProjectCommandsInput = {
  state: StudioState;
  setState: StateSetter;
  project: Project;
  intake: ProjectIntake;
  intakeRef: MutableRefObject<ProjectIntake | null>;
  newProjectName: string;
  setNewProjectName: ValueSetter<string>;
  setStorySeed: ValueSetter<string>;
  setGeneratedStorySeed: ValueSetter<string>;
  setProjectManagerOpen: ValueSetter<boolean>;
  setAppManagerOpen: ValueSetter<boolean>;
  setActiveView: ValueSetter<StudioView>;
  replaceState: (state: StudioState) => void;
  resetProjectWorkflowRuntime: (projectId: string) => void;
};

async function createNewProject(input: ProjectCommandsInput) {
  const {
    state, project, intake, intakeRef, newProjectName, setNewProjectName,
    setStorySeed, setGeneratedStorySeed, setProjectManagerOpen, setAppManagerOpen,
    setActiveView, replaceState, resetProjectWorkflowRuntime
  } = input;
  const name = newProjectName.trim() || `Untitled project ${state.projects.length + 1}`;
  const sourceDraft = "";
  const currentIntake = intakeRef.current ?? intake;
  const defaults = defaultProjectIntake();
  const projectIntake: ProjectIntake = {
    ...defaults,
    videoSkillId: currentIntake.videoSkillId || "short-drama-video",
    outputLanguage: currentIntake.outputLanguage || defaults.outputLanguage,
    contentLanguage: currentIntake.contentLanguage || currentIntake.outputLanguage || defaults.contentLanguage,
    videoFrame: currentIntake.videoFrame || defaults.videoFrame,
    flowVideoMode: "components",
    aiRouting: currentIntake.aiRouting || defaults.aiRouting
  };
  const nextState = window.studioBridge
    ? await window.studioBridge.createProject({ name, sourceDraft, intake: projectIntake })
    : localProjectState(state, name, sourceDraft, projectIntake);
  const nextProject = nextState.projects.find((item) => item.id === nextState.activeProjectId) ?? nextState.projects.at(-1)!;
  resetProjectWorkflowRuntime(project.id);
  replaceState(nextState);
  setStorySeed(nextProject.sourceDraft ?? sourceDraft);
  setGeneratedStorySeed("");
  setNewProjectName("");
  setProjectManagerOpen(false);
  setAppManagerOpen(false);
  setActiveView("story");
}

function localProjectState(state: StudioState, name: string, sourceDraft: string, projectIntake: ProjectIntake) {
  const stamp = new Date().toISOString();
  const projectId = makeId("project");
  const styleBibleId = makeId("style");
  return {
    ...state,
    activeProjectId: projectId,
    projects: [...state.projects, {
      id: projectId, name, description: "", sourceDraft, styleBibleId,
      intake: projectIntake, createdAt: stamp, updatedAt: stamp
    }],
    styleBibles: [...state.styleBibles, {
      id: styleBibleId, projectId,
      visualStyle: "Clean browser-native video, consistent character identity, restrained motion.",
      colorPalette: "Natural light with one clear accent color.",
      texture: "Crisp digital video with readable details.",
      lighting: "Well-exposed soft practical lighting, no harsh shadows; preserve readable faces, surfaces, and background detail. Night scenes must remain visibly lit, never near-black or crushed.",
      motionRules: "Short, stable shots with clear subject movement.",
      negativeStyle: "No warped hands, no inconsistent face, no unreadable text overlays."
    }]
  } satisfies StudioState;
}

function createProjectMutationCommands(input: ProjectCommandsInput) {
  const { setState, project, intake, intakeRef, replaceState } = input;

  function updateShot(patch: Partial<Shot> & { id: string }) {
    if (window.studioBridge) return void window.studioBridge.updateShot(patch).then(replaceState);
    setState((current) => ({
      ...current,
      shots: current.shots.map((shot) => shot.id === patch.id ? { ...shot, ...patch } : shot)
    }));
  }

  function updateScene(patch: Partial<Scene> & { id: string }) {
    if (window.studioBridge) return void window.studioBridge.updateScene(patch).then(replaceState);
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === patch.id ? { ...scene, ...patch } : scene)
    }));
  }

  function updateProjectPatch(patch: Partial<Project>) {
    const nextProject = { ...project, ...patch, updatedAt: new Date().toISOString() };
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === project.id ? nextProject : item)
    }));
    window.studioBridge?.updateProject(project.id, patch).then(replaceState);
  }

  function updateIntake(patch: Partial<ProjectIntake>) {
    const nextIntake = { ...(intakeRef.current ?? intake), ...patch, flowVideoMode: "components" as const };
    intakeRef.current = nextIntake;
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === project.id ? { ...item, intake: nextIntake } : item)
    }));
    window.studioBridge?.updateProject(project.id, { intake: nextIntake }).then((incoming) => {
      intakeRef.current = incoming.projects.find((item) => item.id === project.id)?.intake ?? nextIntake;
      replaceState(incoming);
    });
  }

  return { updateShot, updateScene, updateProjectPatch, updateIntake };
}

export function createProjectCommands(input: ProjectCommandsInput) {
  return { createProject: () => createNewProject(input), ...createProjectMutationCommands(input) };
}
