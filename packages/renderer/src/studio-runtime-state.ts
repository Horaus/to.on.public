import type { Project, ProjectIntake, Scene, Shot } from "@studio/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { readPipelineRuntime, writePipelineRuntime } from "./studio-pipeline-runtime";
type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";
type PipelineStepId = "setup" | "foundation" | "architecture" | "screenplay" | "shots" | "character" | "prompts" | "storyboard" | "video" | "review";
type PipelineRunState = { mode: "step" | "full"; running: boolean; currentStep?: PipelineStepId; message: string; startedAt: string };
type StoryDocument = NonNullable<Project["storyDocument"]>;
type PendingStoryboardQueue = { sequenceId: string; projectId: string; providerId: string; sessionKey: string; items: Array<{ scene: Scene; shot: Shot; sourceAssetId?: string }>; nextIndex: number; previousJobId?: string; repairAspectRatio?: "9:16" | "16:9" | "4:3" | "3:4" | "1:1"; mode?: "scene_frames" | "shot_keyframes" };

export function useStudioRuntimeState(seededProject: Project, flowProjectTabReady: boolean, activeProjectId: string | undefined) {
  const [storySeed, setStorySeed] = useState(seededProject.sourceDraft ?? seededProject.description ?? "");
  const [generatedStorySeed, setGeneratedStorySeed] = useState(seededProject.storyDocument ? seededProject.sourceDraft ?? seededProject.description ?? "" : "");
  const [selectedShotId, setSelectedShotId] = useState("shot_turn");
  const [autoQueueVideoShotId, setAutoQueueVideoShotId] = useState<string>();
  const [editInsertAfterShotId, setEditInsertAfterShotId] = useState<string | undefined>("shot_turn");
  const [editInsertKind, setEditInsertKind] = useState<"transition" | "shot" | "scene">("transition");
  const [editInsertBrief, setEditInsertBrief] = useState("");
  const [storyboardStep, setStoryboardStep] = useState(0);
  const [activeSkillId, setActiveSkillId] = useState("short-drama-video");
  const [activeView, setActiveView] = useState<StudioView>("overview");
  const [flowFocusTarget, setFlowFocusTarget] = useState<"source" | "profile" | "references" | null>(null);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [appManagerOpen, setAppManagerOpen] = useState(false);
  const [appManagerTab, setAppManagerTab] = useState<"projects" | "settings" | "account">("projects");
  const [videoFrameMenuOpen, setVideoFrameMenuOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const initialPipelineRuntime = useMemo(() => readPipelineRuntime(globalThis.localStorage, seededProject.id), [seededProject.id]);
  // A renderer reload must never replay a persisted YOLO run automatically.
  // Jobs already handed to the extension remain durable and visible, but a
  // fresh UI session requires an explicit Continue action before submitting
  // another provider command. This prevents reloads from creating bursts or
  // duplicate jobs while a provider is recovering.
  const restoredPipelineRun = initialPipelineRuntime.run?.running
    ? { ...initialPipelineRuntime.run, running: false, message: "Dừng: app vừa khởi động lại; bấm Tiếp tục để chạy tiếp YOLO." }
    : initialPipelineRuntime.run;
  const [pipelineRun, setPipelineRun] = useState<PipelineRunState | null>(restoredPipelineRun);
  const lastPipelineFocusRef = useRef("");
  const pipelineAutoFollowRef = useRef(false);
  const autoRetryingStructuredJobIdsRef = useRef<Set<string>>(new Set());
  const restoredYoloProjectRef = useRef<string | undefined>(undefined);
  const intakeRef = useRef<ProjectIntake | null>(null);
  const storyUndoRef = useRef<StoryDocument[]>([]);
  const storyRedoRef = useRef<StoryDocument[]>([]);
  const videoFrameMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingStoryboardQueueRef = useRef<PendingStoryboardQueue | null>(initialPipelineRuntime.storyboardQueue);
  const pendingAutoVideoShotRef = useRef<string | null>(null);
  const pendingVideoDispatchShotIdsRef = useRef<Set<string>>(new Set());
  const appliedGraphRevisionJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (pipelineRun?.running && pipelineRun.currentStep === "video" && !flowProjectTabReady) {
      setPipelineRun((current) => current ? { ...current, running: false, message: "Dừng: tab Google Flow hiện ở trang lỗi đăng nhập/OAuth, chưa phải project Flow hợp lệ. Đăng nhập và mở project đã share rồi chạy tiếp." } : current);
    }
  }, [flowProjectTabReady, pipelineRun?.currentStep, pipelineRun?.running]);

  useEffect(() => {
    if (activeProjectId) writePipelineRuntime(globalThis.localStorage, activeProjectId, { run: pipelineRun, storyboardQueue: pendingStoryboardQueueRef.current });
  }, [activeProjectId, pipelineRun]);

  function updatePendingStoryboardQueue(queue: PendingStoryboardQueue | null, projectId: string) {
    pendingStoryboardQueueRef.current = queue;
    writePipelineRuntime(globalThis.localStorage, projectId, { run: pipelineRun, storyboardQueue: queue });
  }

  return {
    activeSkillId, activeView, appManagerOpen, appManagerTab, appliedGraphRevisionJobsRef,
    autoQueueVideoShotId, autoRetryingStructuredJobIdsRef, editInsertAfterShotId, editInsertBrief,
    editInsertKind, flowFocusTarget, generatedStorySeed, intakeRef, lastPipelineFocusRef,
    newProjectName, pendingAutoVideoShotRef, pendingStoryboardQueueRef, pendingVideoDispatchShotIdsRef,
    pipelineAutoFollowRef, pipelineRun, projectManagerOpen, projectSearch, restoredYoloProjectRef,
    selectedShotId, setActiveSkillId, setActiveView, setAppManagerOpen, setAppManagerTab,
    setAutoQueueVideoShotId, setEditInsertAfterShotId, setEditInsertBrief, setEditInsertKind,
    setFlowFocusTarget, setGeneratedStorySeed, setNewProjectName, setPipelineRun,
    setProjectManagerOpen, setProjectSearch, setSelectedShotId, setStorySeed, setStoryboardStep,
    setVideoFrameMenuOpen, storyboardStep, storyRedoRef, storySeed, storyUndoRef,
    updatePendingStoryboardQueue, videoFrameMenuOpen, videoFrameMenuRef
  };
}
