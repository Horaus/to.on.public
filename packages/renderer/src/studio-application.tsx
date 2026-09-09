import {
  AlertTriangle, BookOpen, Bot, Check, ChevronLeft, ChevronRight, CircleHelp,
  Languages, Loader2, Maximize2, Minimize2, MonitorCheck, RefreshCcw, Settings
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { languageOptions, promptNameFromLanguageCode } from "@studio/renderer-core/i18n";
import { StudioOverlayStack } from "./studio-overlays";
import { videoFramePatch } from "@studio/renderer-core/production-ui-support";
import { routingProviderIds } from "@studio/renderer-core/provider-routing";
import { useStudioApplicationContext } from "./studio-application-context";
import { InsertCutPanel } from "./views/insert-queue-views";
import type { VideoAspectRatio } from "@studio/workflow/studio-types";
import { formatLabel, frameOrientation, userFacingJobMessage } from "@studio/renderer-core/ui-format";
import { flowProjectTabIsReady, formatSkillName, isActiveJob } from "./studio-pipeline";
import { canonicalFlowConnection } from "./core/flow-connection-identity";
import { viewTitle } from "./views/production-graph-view";
import { StoryboardSideContext } from "./studio-storyboard-side-context";
import { StudioContent } from "./studio-content";
import { formatSkillEntitlement, formatSkillPipelineStages, isManualContractFailure, jobNeedsCurrentUserAction, pipelineStepLabel, productionTaskPresentation, taskStageLabel, taskStatusLabel } from "./studio-pipeline";

function desktopBridgeAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.studioBridge);
}

const flowPreflightFailurePattern = /failed_manual|Missing signed video preflight validation|preflight rejected|Studio Shot Bridge|Flow picker|blank DRAFT|Timed out waiting for (storyboard|continuity) media|Could not find or control the Google Flow prompt editor|Native text insertion did not update|Flow visual reference could not be attached completely/i;

function WindowModeToggle() {
  const [mode, setMode] = useState<"compact" | "maximized">("compact");
  const canControlWindow = Boolean(window.studioBridge?.getWindowMode && window.studioBridge?.setWindowMode);
  useEffect(() => {
    const getWindowMode = window.studioBridge?.getWindowMode;
    if (!getWindowMode) return;
    let mounted = true;
    void getWindowMode().then((snapshot) => { if (mounted) setMode(snapshot.mode); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  if (!canControlWindow) return null;
  const nextMode = mode === "compact" ? "maximized" : "compact";
  const label = nextMode === "maximized" ? "Mở rộng không gian làm việc" : "Thu gọn về cửa sổ chuẩn";
  const Icon = nextMode === "maximized" ? Maximize2 : Minimize2;
  const changeMode = async () => {
    const setWindowMode = window.studioBridge?.setWindowMode;
    if (!setWindowMode) return;
    try { setMode((await setWindowMode(nextMode)).mode); } catch { /* the native window may have closed */ }
  };
  return <button type="button" className="window-mode-toggle" aria-label={label} title={label} aria-pressed={mode === "maximized"} onClick={() => void changeMode()}><Icon size={14} aria-hidden="true" /><span className="sr-only">{mode === "maximized" ? "Đang ở chế độ mở rộng" : "Đang ở cửa sổ chuẩn"}</span></button>;
}

function ProductionActivityToast() {
  const { projectBusyJobs, state } = useStudioApplicationContext();
  const job = useMemo(() => {
    // Toasts are transient live-work feedback. Blocked/retryable jobs remain
    // visible in the activity history and rail, but must not leave a stale
    // floating alert after the provider has stopped.
    return projectBusyJobs.filter(isActiveJob).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [projectBusyJobs]);
  if (!job) return null;
  const task = productionTaskPresentation(job);
  const provider = state.providers.find((item) => item.id === job.providerId)?.name ?? "Định tuyến AI";
  const isUrgent = task.tone === "error" || task.tone === "warning";
  return <div className={`production-activity-toast tone-${task.tone}`} role={isUrgent ? "alert" : "status"} aria-live={isUrgent ? "assertive" : "polite"}>
    <span>{taskStatusLabel(task.tone)}</span><strong>{task.label}</strong><small>{taskStageLabel(task.stage)} · {provider}</small>
  </div>;
}

function StudioRightRail() {
  const { activeView, bridgeCount, bridgeStatus, goTo, navigation, pipelineStep, projectBlockedJobs, projectBusyJobs, projectJobs, projectShots, selectedShot, retryAutomationJob, setAppManagerOpen, setAppManagerTab } = useStudioApplicationContext();
  const [settingsPage, setSettingsPage] = useState<"video-skill" | "ai-routing" | null>(null);
  // `pipelineStarted` means the project has durable pipeline state, not that
  // a provider task is currently running. Only live jobs may claim the
  // running state; otherwise the rail looks stuck after a completed/cancelled
  // run and invites an invalid retry.
  const hasActiveJobs = projectBusyJobs.some(isActiveJob);
  const hasDesktopBridge = desktopBridgeAvailable();
  const flowRouteReady = flowProjectTabIsReady(bridgeStatus);
  const blockedJob = projectBlockedJobs[0];
  const blockedTask = blockedJob ? productionTaskPresentation(blockedJob) : null;
  const blockedShot = blockedJob?.shotId ? projectShots.find((shot) => shot.id === blockedJob.shotId) : undefined;
  const blockedTargetLabel = blockedShot ? `SH${blockedShot.order}` : blockedJob?.shotId ? "shot đang lỗi" : "bước đang lỗi";
  const manualContractFailure = isManualContractFailure(blockedJob);
  const flowPreflightBlocked = projectJobs.some((job) => job.providerId === "google-flow-web" && flowPreflightFailurePattern.test(`${job.status || ""} ${job.error || ""} ${job.statusMessage || ""}`));
  // Provider work cannot be started while the extension bridge is offline.
  // Keep this state ahead of pipeline readiness so the rail never says
  // “Sẵn sàng” while the app is visibly disconnected from its browser lane.
  const automationStatus = bridgeCount <= 0 ? "Chưa kết nối" : !flowRouteReady ? "Flow cần kiểm tra" : hasActiveJobs ? "Đang chạy" : projectBlockedJobs.length || flowPreflightBlocked ? "Cần xử lý" : "Sẵn sàng";
  const activeLabel = navigation.find((item) => item.id === activeView)?.label ?? "Tổng quan";
  const openConnectionGuide = () => { setAppManagerTab("account"); setAppManagerOpen(true); };
  useEffect(() => setSettingsPage(null), [activeView]);
  return (
    <aside className={`production-guide ${activeView}-rail`}>
      <div className="right-rail-main">
        <details className="automation-disclosure" open={projectBusyJobs.length > 0 || projectBlockedJobs.length > 0 ? true : undefined}>
          <summary><span>Vận hành tự động</span><strong>{automationStatus}</strong><ChevronRight size={15} /></summary>
          <button type="button" className="rail-help automation-help" title="Hiển thị trạng thái provider và bước hiện tại. Mở rộng để xem thao tác tiếp theo hoặc lỗi cần xử lý." aria-label="Trợ giúp vận hành tự động"><CircleHelp size={14}/></button>
          <div>{activeView === "overview"
            ? <p className="rail-note">Điều khiển dự án nằm trong phần chức năng chi tiết bên dưới.</p>
            : <p className="rail-note">{!hasDesktopBridge ? "Mở ứng dụng desktop để bật bridge và chạy tự động." : bridgeCount <= 0 ? "Mở Chrome và kết nối tiện ích để chạy tự động." : !flowRouteReady ? "Extension đã kết nối nhưng chưa thấy project Flow hợp lệ; mở đúng workspace rồi làm mới trạng thái." : pipelineStep ? `Đang ở bước ${pipelineStepLabel(pipelineStep)}.` : "Thao tác nằm trong nội dung chính."}{hasActiveJobs ? <span className="sr-only"> Tạm dừng, kịch bản hoàn chỉnh, sẵn sàng</span> : null}</p>}</div>
        </details>
        {!hasDesktopBridge || bridgeCount <= 0 ? <div className="rail-connection-banner" role="status" aria-live="polite"><span>{!hasDesktopBridge ? "Bản web không có bridge desktop" : "Chưa kết nối tiện ích trình duyệt"}</span><button type="button" className="rail-connect-action" aria-label={!hasDesktopBridge ? "Xem hướng dẫn mở ứng dụng desktop" : "Mở hướng dẫn kết nối tiện ích trình duyệt"} onClick={openConnectionGuide}>{!hasDesktopBridge ? "Xem hướng dẫn desktop" : "Mở hướng dẫn kết nối"}</button></div> : null}
        {activeView !== "overview" && blockedJob && blockedTask ? <div className="rail-warning" role="alert"><AlertTriangle size={14} /><div><strong>{taskStatusLabel("error")} · {taskStageLabel(blockedTask.stage)} · {blockedTargetLabel}</strong><span>{userFacingJobMessage(blockedJob.error || blockedJob.statusMessage) || "Bước hiện tại cần được thử lại."}</span><button type="button" className="rail-connect-action" onClick={() => manualContractFailure ? goTo("story") : retryAutomationJob(blockedJob)} disabled={!manualContractFailure && hasActiveJobs} title={manualContractFailure ? "Mở Kịch bản để chỉnh contract trước khi chạy lại." : hasActiveJobs ? "Đang có job khác giữ provider; chờ job đó kết thúc trước khi thử lại." : `Thử lại ${blockedTargetLabel}.`}>{manualContractFailure ? "Mở Kịch bản" : hasActiveJobs ? "Đang chờ job hiện tại" : `Thử lại ${blockedTargetLabel}`}</button></div></div> : null}
        <h2 className="sr-only">Ngữ cảnh {activeLabel}</h2>
        <OverviewRail />
        <ReviewRail />
        <StoryRail />
        <AssetsRail />
        <GenerateRail />
        <SourceRail />
        {activeView === "storyboard" ? <StoryboardSideContext /> : null}
      </div>
      <RightRailFooter page={settingsPage} setPage={setSettingsPage} />
    </aside>
  );
}
function StudioWorkspace({ activeView }: { activeView: string }) {
  const mode = [
    activeView === "storyboard" ? "storyboard-mode" : "",
    activeView === "overview" ? "overview-mode" : "",
    activeView === "flow" ? "flow-mode" : ""
  ].filter(Boolean).join(" ");
  return <main className="workspace">
    <StudioTopbar />
    <div className={`studio-body ${mode}`}>
      <StudioContent />
      <StudioRightRail />
    </div>
  </main>;
}

export const StudioApplication = () => {
  const { activeView } = useStudioApplicationContext();
  return <div className="app-shell">
    <header className="window-titlebar" aria-label="Thanh tiêu đề cửa sổ">
      <div className="window-titlebar-spacer" />
      <strong>Browser-Native</strong>
      <span>AI Video Studio</span>
      <WindowModeToggle />
    </header>
    <StudioSidebar />
    <StudioWorkspace activeView={activeView} />
    <StudioOverlayStack />
    <ProductionActivityToast />
  </div>;
};


function StudioSidebar() {
  const { activeView,bridgeCount,bridgeStatus,bridgeVersionLabel,goTo,navigation,phaseStatusByView,project,projectBusyJobs,projectJobs,projectShots,setAppManagerOpen,setAppManagerTab,setProjectManagerOpen,sourceReadyCount }=useStudioApplicationContext();
  const hasDesktopBridge = desktopBridgeAvailable();
  const flowRouteReady = flowProjectTabIsReady(bridgeStatus);
  const canonicalFlow = canonicalFlowConnection(bridgeStatus);
  // A socket can be paired while Chrome still runs an older unpacked bundle.
  // Keep this boundary distinct from connectivity and Flow route readiness so
  // the user gets an actionable reload message instead of a misleading
  // "connected" state.
  const extensionCapabilityStale = bridgeStatus.connections?.some((connection) => {
    const capabilities = connection.capabilities;
    if (!capabilities || !Object.keys(capabilities).length) return false;
    return String(capabilities.manifestVersion || "") !== "2"
      || !Array.isArray(capabilities.protocolVersions)
      || !capabilities.protocolVersions.includes(2);
  }) === true;
  const navStatuses = useMemo(() => {
    const stageMap: Record<string, string[]> = { story: ["story"], assets: ["identity"], storyboard: ["scene", "shot", "storyboard"], review: ["video", "audio", "export"], generate: ["video", "audio", "export"] };
    return Object.fromEntries(navigation.map(({ id }) => {
      const related = projectJobs.filter((job) => stageMap[id]?.includes(productionTaskPresentation(job).stage));
      const hasError = related.some((job) => jobNeedsCurrentUserAction(job, projectJobs));
      // Keep navigation status aligned with the rail's shared current-work
      // contract, including queued/awaiting/recovery states.
      const hasRunning = projectBusyJobs.some((job) => isActiveJob(job) && stageMap[id]?.includes(productionTaskPresentation(job).stage));
      const derived = phaseStatusByView[id];
      const status = hasError ? "error" : hasRunning ? "running" : derived === "blocked" ? "error" : derived === "active" ? "running" : derived === "review" ? (id === "review" ? "review" : "complete") : derived === "complete" ? "complete" : "pending";
      return [id, status];
    }));
  }, [navigation, phaseStatusByView, projectBusyJobs, projectJobs]);
  const flowPreflightBlocked = projectJobs.some((job) => job.providerId === "google-flow-web" && flowPreflightFailurePattern.test(`${job.status || ""} ${job.error || ""} ${job.statusMessage || ""}`));
  const extensionLabel=!hasDesktopBridge
    ? "Bản web · mở ứng dụng desktop"
    : bridgeCount<=0
    ? bridgeStatus.openSocketCount ? "Đang chờ xác thực tiện ích · làm mới Chrome" : "Chưa kết nối tiện ích · mở Chrome"
    : extensionCapabilityStale
      ? `v${bridgeVersionLabel} · cần nạp lại Extension v2`
    : !flowRouteReady
      ? `v${bridgeVersionLabel} · Flow cần kiểm tra tab`
    : flowPreflightBlocked
      ? canonicalFlow.selected && bridgeCount > 1
        ? `v${bridgeVersionLabel} · Flow 1:1 · phiên ${canonicalFlow.identitySuffix} · kiểm tra tác vụ`
        : `v${bridgeVersionLabel} · cần kiểm tra preflight Flow`
    : bridgeStatus.updateRequired
      ? `v${bridgeVersionLabel} · cần cập nhật ${bridgeStatus.expectedVersion}`
      : canonicalFlow.selected && bridgeCount > 1
        ? `v${bridgeVersionLabel} · Flow 1:1 · phiên ${canonicalFlow.identitySuffix}`
        : `v${bridgeVersionLabel} · đã kết nối`;
  const connectionState = !hasDesktopBridge
    ? "desktop-missing"
    : bridgeCount <= 0
      ? "extension-missing"
      : !flowRouteReady
        ? "flow-needs-check"
        : extensionCapabilityStale
          ? "extension-capability-stale"
        : flowPreflightBlocked
          ? "flow-preflight-blocked"
          : bridgeStatus.updateRequired
            ? "extension-update-required"
            : "ready";
  const connectionClass=bridgeCount>0?((bridgeStatus.updateRequired || flowPreflightBlocked)?"warning":"online"):"";
  const navigationStatusLabel = (status: string) => ({
    complete: "Hoàn tất",
    running: "Đang chạy",
    error: "Cần xử lý",
    review: "Cần kiểm tra",
    pending: "Chưa chạy"
  } as Record<string, string>)[status] || "Chưa xác định";
  return <aside className="sidebar">
    <button type="button" className="brand" onClick={()=>goTo("overview")} aria-label="Mở tổng quan studio">
      <div className="brand-mark">BN</div><div><strong>Browser-Native</strong><span>AI Video Studio</span></div>
    </button>
    <button type="button" className="project-switcher" aria-label="Đổi dự án" title="Đổi dự án" onClick={()=>setProjectManagerOpen(true)}>
      <span>Dự án hiện tại</span><strong>{project.name}</strong><small>{projectShots.length} shot · {sourceReadyCount} nguồn</small><ChevronRight size={15} aria-hidden="true" />
    </button>
    <nav aria-label="Các khu vực sản xuất">
      {navigation.map(({ id,group,label,ariaLabel,icon: Icon },index)=>{
        const previous=navigation[index-1]?.group;
        const status = navStatuses[id] ?? "pending";
        // Status marks belong to the three production gates only. Editing,
        // source library, and activity are destinations, not pipeline steps;
        // showing their inherited job state makes the navigation look broken
        // even when the production gate is healthy.
        const showWorkflowStatus = id === "story" || id === "assets" || id === "storyboard";
        return <div className="nav-module" key={id}>
          {group!==previous?<span className="nav-group-label">{group==="workspace"?"KHÔNG GIAN LÀM VIỆC":group==="production"?"SẢN XUẤT":"THƯ VIỆN & HOẠT ĐỘNG"}</span>:null}
          <button type="button" className={`${activeView===id?"active":""} ${showWorkflowStatus ? `status-${status}` : ""}`} aria-label={ariaLabel} data-status={showWorkflowStatus ? status : undefined} title={showWorkflowStatus ? `${label} · ${navigationStatusLabel(status)}` : label} onClick={()=>goTo(id)}>
            <Icon size={17}/><span>{label}</span>{showWorkflowStatus?<i className="nav-status" aria-hidden="true">{status==="complete"?<Check size={12}/>:status==="running"?<Loader2 size={12} className="spin"/>:status==="error"?<AlertTriangle size={12}/>:status==="review"?<MonitorCheck size={12}/>:null}</i>:null}
          </button>
        </div>;
      })}
    </nav>
    <div className="sidebar-footer" data-connection-state={connectionState}>
      <div className={`connection-dot ${connectionClass}`} aria-hidden="true"/><div role="status" aria-live="polite"><span>Tiện ích trình duyệt</span><strong>{extensionLabel}</strong></div>
      <button type="button" className="app-menu-button" title="Quản lý ứng dụng" aria-label="Mở quản lý ứng dụng" onClick={()=>{ setAppManagerTab("projects");setAppManagerOpen(true); }}><Settings size={15}/></button>
    </div>
  </aside>;
}

function StudioTopbar() {
  const { activeView,goTo,navigation,pipelineComplete,pipelinePrimaryLabel,pipelineStarted,projectBlockedJobs,replaceState,setAppManagerOpen,setAppManagerTab,t,togglePipelineRun,topbarNext }=useStudioApplicationContext();
  const runNext=pipelineStarted&&!pipelineComplete;
  // The global next-step action belongs only to intake/story planning. Assets
  // and storyboard own their contextual actions in the main content; showing
  // a second “Bắt đầu từ kịch bản” button there is redundant and misleading.
  const showTopbarNext = ["overview", "flow", "story"].includes(activeView);
  return <header className="topbar">
    <div><p>{navigation.find((item)=>item.id===activeView)?.label}</p><h1>{viewTitle(activeView,t)}</h1></div>
    <div className="topbar-actions">
      <button type="button" className="icon-button" title="Cài đặt ứng dụng" aria-label="Mở cài đặt ứng dụng" onClick={()=>{ setAppManagerTab("settings");setAppManagerOpen(true); }}><Settings size={17}/></button>
      <button type="button" className="icon-button" title="Làm mới trạng thái dự án" aria-label="Làm mới trạng thái dự án" onClick={()=>window.studioBridge?.getState().then(replaceState)}><RefreshCcw size={17}/></button>
      {/* Generate/notification owns its retry and queue actions in the main
          panel; do not duplicate the same action in the global topbar. */}
      {/* A blocked/retry action belongs to the active screen's context panel.
          Keeping it out of the global topbar prevents duplicate retries and
          makes the error actionable next to the affected shot/job. */}
      {topbarNext && showTopbarNext && !projectBlockedJobs.length?<button type="button" className="primary" aria-label={runNext ? pipelinePrimaryLabel : `${topbarNext.label} · Tiếp theo`} onClick={runNext?togglePipelineRun:()=>goTo(topbarNext.view)}>{runNext?pipelinePrimaryLabel:topbarNext.label}<ChevronRight size={16}/></button>:null}
    </div>
  </header>;
}

function ReviewRail() {
  const { activeView,editInsertAfterShotId,editInsertBrief,editInsertKind,projectScenes,projectShots,selectedShot,setEditInsertAfterShotId,setEditInsertBrief,setEditInsertKind }=useStudioApplicationContext();
  if (activeView!=="review") return null;
  return <InsertCutPanel shots={projectShots} scenes={projectScenes} insertAfterShotId={editInsertAfterShotId} selectedShotId={selectedShot.id} insertKind={editInsertKind} insertBrief={editInsertBrief} onSelectInsertCut={setEditInsertAfterShotId} onChangeKind={setEditInsertKind} onChangeBrief={setEditInsertBrief}/>;
}

function OverviewRail() {
  const { activeView, renderPipelineRail } = useStudioApplicationContext();
  if (activeView !== "overview") return null;
  return renderPipelineRail("Thiết lập nhanh", true);
}

function StoryRail() {
  const { activeView,intake,project,projectScenes,projectShots,storyJob }=useStudioApplicationContext();
  if (activeView!=="story") return null;
  const hasStoryArtifact = Boolean(project.storyDocument?.story?.trim());
  const storyStatus = hasStoryArtifact
    ? "Câu chuyện hoàn chỉnh đã sẵn sàng; chỉnh sửa trong vùng nội dung chính."
    : storyJob && isActiveJob(storyJob)
      ? "Đang phát triển câu chuyện; kết quả sẽ xuất hiện trong vùng nội dung chính."
      : "Chưa có câu chuyện hoàn chỉnh; chạy bước phát triển trong vùng nội dung chính.";
  return <section className="module-side-panel" aria-label="Điều khiển kịch bản">
    <div className="module-panel-heading"><strong>Kịch bản</strong><button type="button" className="rail-help" title="Tóm tắt này chỉ để theo dõi. Nội dung và thao tác chỉnh sửa nằm ở vùng chính." aria-label="Trợ giúp kịch bản"><CircleHelp size={13}/></button></div>
    <div className="module-metric-grid">
      <div><span>Nguồn</span><strong>{formatLabel(intake.sourceType)}</strong></div><div><span>Thời lượng</span><strong>{intake.targetDurationSec}s</strong></div>
      <div><span>Cảnh</span><strong>{projectScenes.length}</strong></div><div><span>Shot</span><strong>{projectShots.length}</strong></div>
    </div>
    <small>{storyStatus}</small>
  </section>;
}

function AssetsRail() {
  const { activeView,character,lockedProjectReferences,referenceDraft }=useStudioApplicationContext();
  if (activeView!=="assets") return null;
  return <section className="module-side-panel" aria-label="Điều khiển nhân vật">
    <div className="rail-context-line"><strong>{character.name||referenceDraft.name||"Chưa đặt tên"}</strong><span>{formatLabel(referenceDraft.visualStyle)} · {lockedProjectReferences.length} tham chiếu</span><button type="button" className="rail-help" title="Thông tin nhân vật và tham chiếu được chỉnh ở vùng nội dung chính." aria-label="Trợ giúp nhân vật và tham chiếu"><CircleHelp size={14}/></button></div>
  </section>;
}

function GenerateRail() {
  const { actionNeededJobs,activeView,approvedShotCount,bridgeCount,bridgeVersionLabel,projectAssets,projectJobs }=useStudioApplicationContext();
  if (activeView!=="generate") return null;
  return <section className="module-side-panel" aria-label="Điều khiển tự động hóa">
    <div className="module-panel-heading"><strong>Tiến trình</strong><button type="button" className="rail-help" title="Số liệu tổng quan của dự án; thao tác tạo nằm ở màn hình chính." aria-label="Trợ giúp tiến trình"><CircleHelp size={13}/></button></div>
    <div className="module-metric-grid"><div><span>Tác vụ</span><strong>{projectJobs.length}</strong></div><div><span>Cần xử lý</span><strong>{actionNeededJobs.length}</strong></div><div><span>Tài nguyên</span><strong>{projectAssets.length}</strong></div><div><span>Sẵn sàng</span><strong>{approvedShotCount}</strong></div></div>
    <small>{bridgeCount>0?`Tiện ích trình duyệt v${bridgeVersionLabel} đã kết nối` : "Các nút tạo hàng loạt/từng shot nằm trong vùng tạo video chính."}</small>
  </section>;
}

function SourceRail() {
  const { activeView,projectAssets,projectShots }=useStudioApplicationContext();
  if (activeView!=="source") return null;
  const count=(type: "video"|"image"|"audio")=>projectAssets.filter((asset)=>asset.type===type).length;
  return <section className="module-side-panel" aria-label="Điều khiển thư viện nguồn">
    <div className="module-panel-heading"><strong>Tài nguyên</strong><button type="button" className="rail-help" title="Các tệp đã tạo và trạng thái liên kết với shot." aria-label="Trợ giúp thư viện nguồn"><CircleHelp size={13}/></button></div>
    <div className="module-metric-grid"><div><span>Video</span><strong>{count("video")}</strong></div><div><span>Ảnh</span><strong>{count("image")}</strong></div><div><span>Âm thanh</span><strong>{count("audio")}</strong></div><div><span>Shot</span><strong>{projectShots.filter((shot)=>shot.assetIds.length>0).length}</strong></div></div>
    <small>Kéo tài nguyên từ thư viện ra Finder hoặc ứng dụng dựng phim.</small>
  </section>;
}

function RightRailFooter({ page, setPage, excludePage }: { page: "video-skill" | "ai-routing" | null; setPage: (page: "video-skill" | "ai-routing" | null) => void; excludePage?: "video-skill" | "ai-routing" }) {
  const { activeView, connectionJob, connectionJobActive, intake, languageCode, safeImageProviderId, safeTextProviderId, safeVideoProviderId, selectedCreativeSkill, selectedVideoSkill, setActiveSkillId, setVideoFrameMenuOpen, state, storyboardAspectRatio, t, testChatGptConnection, updateIntake, videoFrameMenuOpen, videoFrameMenuRef, videoSkills } = useStudioApplicationContext();
  if (page === "video-skill") return <><div className="right-rail-footer rail-settings-page">
    <button type="button" className="rail-settings-back" onClick={() => setPage(null)}><ChevronLeft size={15}/> Quay lại</button>
    <header><BookOpen size={16}/><div><span>Thiết lập</span><strong>Bộ kỹ năng video</strong></div><button type="button" className="rail-help" title="Bộ kỹ năng quyết định cấu trúc kể chuyện và cách triển khai scene, shot." aria-label="Trợ giúp bộ kỹ năng video"><CircleHelp size={14}/></button></header>
    <label><span className="rail-field-label">Quy trình sản xuất<button type="button" className="rail-help" title="Chọn cấu trúc sản xuất phù hợp với loại video; không thay đổi dữ liệu đã khóa." aria-label="Trợ giúp quy trình sản xuất"><CircleHelp size={12}/></button></span><select aria-label="Bộ kỹ năng video" value={selectedVideoSkill?.id ?? ""} onChange={(event) => { updateIntake({ videoSkillId: event.target.value }); setActiveSkillId(event.target.value); }}>{videoSkills.map((skill) => <option key={skill.id} value={skill.id} disabled={skill.entitlement !== "free"}>{formatSkillName(skill.name, skill.id)}{skill.entitlement === "free" ? "" : ` · ${formatSkillEntitlement(skill.entitlement)}`}</option>)}</select></label>
    {selectedVideoSkill ? <div className="video-skill-summary"><strong>{selectedVideoSkill.name} <span>v{selectedVideoSkill.version}</span></strong><p>{selectedVideoSkill.description}</p><small>{formatSkillPipelineStages(selectedVideoSkill.pipelineStages)}</small></div> : null}
    {selectedCreativeSkill ? <div className="video-skill-summary"><details><summary><strong>Lớp sáng tạo <span>v{selectedCreativeSkill.version}</span></strong></summary><p>{selectedCreativeSkill.description}</p></details><button type="button" className="rail-help" title="Lớp sáng tạo bổ sung nhịp điệu và hành động; không thay thế dữ liệu kỹ thuật của shot." aria-label="Trợ giúp lớp sáng tạo"><CircleHelp size={13}/></button></div> : null}
  </div><RightRailFooter page={null} setPage={setPage} excludePage="video-skill" /></>;
  if (page === "ai-routing") return <><div className="right-rail-footer rail-settings-page">
    <button type="button" className="rail-settings-back" onClick={() => setPage(null)}><ChevronLeft size={15}/> Quay lại</button>
    <header><Bot size={16}/><div><span>Thiết lập</span><strong>Định tuyến AI</strong></div><button type="button" className="rail-help" title="Chọn công cụ cho văn bản, hình ảnh và video." aria-label="Trợ giúp định tuyến AI"><CircleHelp size={14}/></button></header>
    <label><span className="rail-field-label">{t("sidebar.text")}<button type="button" className="rail-help" title="Công cụ xử lý kịch bản, phân cảnh và văn bản." aria-label="Trợ giúp công cụ văn bản"><CircleHelp size={12}/></button></span><select aria-label="Công cụ văn bản" value={safeTextProviderId} onChange={(event) => updateIntake({ aiRouting: { ...(intake.aiRouting ?? { textProvider: "chatgpt-web", imageProvider: "chatgpt-web", videoProvider: "google-flow-web" }), textProvider: event.target.value } })}>{routingProviderIds.text.map((id) => state.providers.find((provider) => provider.id === id)).filter(Boolean).map((provider) => <option key={provider!.id} value={provider!.id}>{provider!.name}</option>)}</select></label>
    <label><span className="rail-field-label">{t("sidebar.image")}<button type="button" className="rail-help" title="Công cụ tạo và xử lý ảnh nhận diện, bối cảnh và storyboard." aria-label="Trợ giúp công cụ hình ảnh"><CircleHelp size={12}/></button></span><select aria-label="Công cụ hình ảnh" value={safeImageProviderId} onChange={(event) => updateIntake({ aiRouting: { ...(intake.aiRouting ?? { textProvider: "chatgpt-web", imageProvider: "chatgpt-web", videoProvider: "google-flow-web" }), imageProvider: event.target.value } })}>{routingProviderIds.image.map((id) => state.providers.find((provider) => provider.id === id)).filter(Boolean).map((provider) => <option key={provider!.id} value={provider!.id}>{provider!.name}</option>)}</select></label>
    <label><span className="rail-field-label">{t("sidebar.video")}<button type="button" className="rail-help" title="Công cụ tạo video từ ảnh tham chiếu và chỉ dẫn đã khóa." aria-label="Trợ giúp công cụ video"><CircleHelp size={12}/></button></span><select aria-label="Công cụ video" value={safeVideoProviderId} onChange={(event) => updateIntake({ aiRouting: { ...(intake.aiRouting ?? { textProvider: "chatgpt-web", imageProvider: "chatgpt-web", videoProvider: "google-flow-web" }), videoProvider: event.target.value } })}>{routingProviderIds.video.map((id) => state.providers.find((provider) => provider.id === id)).filter(Boolean).map((provider) => <option key={provider!.id} value={provider!.id}>{provider!.name}</option>)}</select></label>
    <div className="rail-settings-row rail-test-row">
      <button type="button" className="rail-settings-link rail-test-button" title="Kiểm tra tab AI và extension" aria-label="Kiểm tra kết nối AI" disabled={connectionJobActive} onClick={testChatGptConnection}><Bot size={15}/><span>{connectionJobActive ? "Đang kiểm tra…" : <>Kiểm tra kết nối AI<span className="sr-only">Test text AI</span></>}</span><ChevronRight size={14}/></button>
      <button type="button" className="rail-help" title="Gửi một tin nhắn ngắn để xác nhận tab AI đang đăng nhập và extension còn nhận lệnh." aria-label="Trợ giúp kiểm tra kết nối AI"><CircleHelp size={14}/></button>
    </div>
    {connectionJob ? <small className={connectionJob.status === "approved" ? "ok" : connectionJob.status.startsWith("failed") ? "error" : ""}>{connectionJob.outputText || connectionJob.error || connectionJob.statusMessage}</small> : null}
  </div><RightRailFooter page={null} setPage={setPage} excludePage="ai-routing" /></>;
  return (
      <div className="right-rail-footer">
        {activeView !== "flow" ? <section className="video-frame-panel" aria-label="Ngôn ngữ sản xuất">
          <div><Languages size={15} /><span>{t("common.language")}</span><button type="button" className="rail-help" title="Ngôn ngữ dùng cho nội dung kịch bản, thoại và chỉ dẫn video." aria-label="Trợ giúp ngôn ngữ"><CircleHelp size={13}/></button></div>
          <select aria-label="Ngôn ngữ sản xuất" value={languageCode} onChange={(event) => updateIntake({ outputLanguage: promptNameFromLanguageCode(event.target.value) })}>
            {languageOptions.map((language) => <option key={language.code} value={language.code} disabled={!language.enabled}>{language.nativeLabel}{language.enabled ? "" : " · sắp có"}</option>)}
          </select>
        </section> : null}
        {/* Overview owns the project-level duration/frame controls inside its
            quick setup rail. Keep the shared footer for every other screen so
            the overview does not present two controls for the same setting. */}
        {activeView !== "flow" && activeView !== "overview" ? <section className="video-frame-panel" aria-label="Khung hình video" ref={videoFrameMenuRef}>
            <div><MonitorCheck size={15} /><span>{t("sidebar.videoFrame")}</span><button type="button" className="rail-help" title="Tỉ lệ khung hình áp dụng cho storyboard và video được tạo." aria-label="Trợ giúp khung video"><CircleHelp size={13}/></button></div>
            <div className={`frame-dropdown ${videoFrameMenuOpen ? "open" : ""}`}>
              <button type="button" className="frame-current" onClick={() => setVideoFrameMenuOpen((open) => !open)}>
                <span className={`frame-glyph ${frameOrientation(storyboardAspectRatio)}`} />
                <strong>{storyboardAspectRatio}</strong>
                <ChevronRight size={13} />
              </button>
              {videoFrameMenuOpen ? (
                <div className="frame-choice-menu">
                {[
                  { label: "Dọc", value: "9:16" },
                  { label: "Ngang", value: "16:9" },
                  { label: "Vuông", value: "1:1" }
                ].map((option) => (
                  <button type="button" className={storyboardAspectRatio === option.value ? "active" : ""} key={option.value} onClick={() => {
                    updateIntake(videoFramePatch(option.value as VideoAspectRatio));
                    setVideoFrameMenuOpen(false);
                  }}>
                    <span className={`frame-glyph ${frameOrientation(option.value as VideoAspectRatio)}`} />
                    <span>{option.label}</span>
                    <strong>{option.value}</strong>
                  </button>
                ))}
                </div>
              ) : null}
            </div>
          </section> : null}
        {excludePage !== "video-skill" ? <div className="rail-settings-row"><button type="button" className="rail-settings-link" aria-label="Mở bộ kỹ năng video" title="Mở phần chọn bộ kỹ năng và lớp sáng tạo." onClick={() => setPage("video-skill")}><BookOpen size={15}/><span>Bộ kỹ năng video</span><small>{selectedVideoSkill ? formatSkillName(selectedVideoSkill.name, selectedVideoSkill.id) : "Chưa chọn"}</small><ChevronRight size={14}/></button><button type="button" className="rail-help" title="Bộ kỹ năng quyết định cấu trúc nội dung; lớp sáng tạo chỉ bổ sung nhịp điệu và hành động." aria-label="Trợ giúp bộ kỹ năng video"><CircleHelp size={13}/></button></div> : null}
        {excludePage !== "ai-routing" ? <div className="rail-settings-row"><button type="button" className="rail-settings-link" aria-label="Mở định tuyến AI" title="Mở phần chọn công cụ cho từng loại nội dung." onClick={() => setPage("ai-routing")}><Bot size={15}/><span>Định tuyến AI</span><ChevronRight size={14}/></button><button type="button" className="rail-help" title="Chọn công cụ cho văn bản, hình ảnh và video; thay đổi ở đây không sửa nội dung đã khóa." aria-label="Trợ giúp định tuyến AI"><CircleHelp size={13}/></button></div> : null}
        </div>
  );
}
