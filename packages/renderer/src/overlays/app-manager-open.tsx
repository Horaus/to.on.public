import {
  BadgeCheck,
  Check,
  ChevronRight,
  FolderKanban,
  Settings,
  X
} from "lucide-react";
import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AppManagerModel } from "../studio-overlay-contracts";
import { flowConnectionSummary } from "../studio-application-composition";

type ProjectLibraryRow = {
  project: { id: string; name: string; description?: string; sourceDraft?: string };
  sceneCount: number;
  shotCount: number;
  sourceCount: number;
  jobCount: number;
  actionNeededJobs: number;
};

function AppManagerFocusTrap() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".app-manager-dialog");
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")) : [];
      if (!focusable.length || !dialog?.contains(document.activeElement)) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

type AppManagerTab = "projects" | "settings" | "account";
const appManagerTabs: AppManagerTab[] = ["projects", "settings", "account"];

function handleAppManagerTabKey(event: ReactKeyboardEvent<HTMLButtonElement>, current: AppManagerTab, setTab: (tab: AppManagerTab) => void) {
  const index = appManagerTabs.indexOf(current);
  const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
    ? (index + 1) % appManagerTabs.length
    : event.key === "ArrowLeft" || event.key === "ArrowUp"
      ? (index - 1 + appManagerTabs.length) % appManagerTabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? appManagerTabs.length - 1 : -1;
  if (nextIndex < 0) return;
  event.preventDefault();
  const next = appManagerTabs[nextIndex];
  setTab(next);
  requestAnimationFrame(() => document.getElementById(`app-manager-tab-${next}`)?.focus());
}

function ProjectLibraryView({ rows, activeProjectId, search, newProjectName, onSearch, onNewProjectName, onSelectProject, onCreateProject }: {
  rows: ProjectLibraryRow[];
  activeProjectId: string;
  search: string;
  newProjectName: string;
  onSearch: (value: string) => void;
  onNewProjectName: (value: string) => void;
  onSelectProject: (projectId: string) => Promise<void>;
  onCreateProject: () => Promise<void>;
}) {
  const totals = rows.reduce((current, row) => ({
    scenes: current.scenes + row.sceneCount,
    shots: current.shots + row.shotCount,
    sources: current.sources + row.sourceCount,
    jobs: current.jobs + row.jobCount,
    needsAction: current.needsAction + row.actionNeededJobs
  }), { scenes: 0, shots: 0, sources: 0, jobs: 0, needsAction: 0 });
  return <div className="project-library">
    <div className="project-library-toolbar">
      <label>Tìm kiếm<input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Tên dự án hoặc brief" /></label>
      <div><strong>{rows.length}</strong><span>dự án</span></div><div><strong>{totals.shots}</strong><span>shot</span></div><div><strong>{totals.sources}</strong><span>nguồn</span></div><div><strong>{totals.needsAction}</strong><span>cần xử lý</span></div>
    </div>
    <div className="project-library-layout">
      <section className="project-library-list" aria-label="Thư viện dự án">
        {rows.map((row) => <article className={row.project.id === activeProjectId ? "active" : ""} key={row.project.id}>
          <button type="button" onClick={() => void onSelectProject(row.project.id)}><span><strong>{row.project.name}</strong><small>{row.project.description || row.project.sourceDraft || "Chưa lưu brief"}</small></span>{row.project.id === activeProjectId ? <Check size={16} /> : <ChevronRight size={16} />}</button>
          <div className="project-library-metrics"><span>{row.sceneCount} cảnh</span><span>{row.shotCount} shot</span><span>{row.sourceCount} nguồn</span><span>{row.jobCount} tác vụ</span><span className={row.actionNeededJobs ? "warning" : "ok"}>{row.actionNeededJobs ? `${row.actionNeededJobs} cần xử lý` : "ổn định"}</span></div>
        </article>)}
        {rows.length === 0 ? <div className="source-empty"><FolderKanban size={22} /><strong>Không tìm thấy dự án</strong><span>Xoá bộ lọc hoặc tạo dự án mới.</span></div> : null}
      </section>
      <aside className="project-storage-panel"><span className="eyebrow">Mô hình lưu trữ</span><h3>Bố cục cục bộ đề xuất</h3><p>Thiết lập ứng dụng dùng chung; mỗi dự án giữ thư mục media riêng để sao lưu và nâng cấp an toàn hơn.</p><dl><div><dt>Chung</dt><dd>thiết lập, provider, dự án hiện tại</dd></div><div><dt>Dự án</dt><dd>câu chuyện, cảnh, shot, tài nguyên, tác vụ</dd></div><div><dt>Media</dt><dd>projects/&lt;projectId&gt;/images, videos, references</dd></div></dl><div className="new-project-row compact"><input aria-label="Tên dự án mới" value={newProjectName} onChange={(event) => onNewProjectName(event.target.value)} placeholder="Tên dự án mới" /><button type="button" className="primary" onClick={() => void onCreateProject()}>Tạo</button></div></aside>
    </div>
  </div>;
}
export function AppManagerOverlay({ model }: { model: AppManagerModel }) { const { appManagerOpen, appManagerTab, hasDesktopBridge = true, bridgeCount = 0, bridgeStatus, bridgeVersionLabel, createProject, newProjectName, project, projectRows, projectSearch, selectProject, setAppManagerOpen, setAppManagerTab, setNewProjectName, setProjectSearch, state } = model; useEffect(() => { if (!appManagerOpen) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setAppManagerOpen(false); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [appManagerOpen, setAppManagerOpen]); const { flowCustomToolTabCount, flowEditorToolCount: flowEditorToolTabCount, flowHasDuplicateTabs, flowProjectOpen, flowProjectTabCount, flowRuntimeToolCount: flowRuntimeToolTabCount, flowRuntimeToolOpen, flowWorkspaceTabCount } = flowConnectionSummary(bridgeStatus); const flowEditorToolOpen = flowEditorToolTabCount > 0; const flowRuntimeNeedsUpdate = state.jobs.some((job) => job.projectId === project.id && job.providerId === "google-flow-web" && /composer add button was not visible|runtime tool shell is incomplete|Studio Shot Bridge runtime .*control/i.test(`${job.error || ""} ${job.statusMessage || ""}`)); const flowWorkspaceHasError = state.jobs.some((job) => job.projectId === project.id && job.providerId === "google-flow-web" && /Application error:\s*a client-side exception|Cannot read properties of undefined \(reading ['\"]service['\"]\)|Timed out waiting for storyboard media|Receiving end does not exist|Could not find or control the Google Flow prompt editor|Native text insertion did not update|Flow visual reference could not be attached completely/i.test(`${job.error || ""} ${job.statusMessage || ""}`)); const flowConnectionState = !hasDesktopBridge ? "web" : bridgeCount <= 0 ? "extension" : flowHasDuplicateTabs ? "duplicate" : !flowProjectOpen ? "project" : flowEditorToolOpen ? "editor" : flowWorkspaceHasError ? "error" : flowRuntimeNeedsUpdate ? "outdated" : "ready"; const flowConnectionTitle = flowConnectionState === "web" ? "Đang dùng bản web" : flowConnectionState === "extension" ? "Extension chưa kết nối" : flowConnectionState === "duplicate" ? "Nhiều tab Flow đang mở" : flowConnectionState === "project" ? "Cần mở project Flow" : flowConnectionState === "editor" ? "Đang mở bản chỉnh sửa" : flowConnectionState === "error" ? "Flow workspace/picker gặp lỗi" : flowConnectionState === "outdated" ? "Cần kiểm tra Flow UI" : "Đã kết nối Flow (UI-direct)"; const flowConnectionDetail = flowConnectionState === "web" ? "Tab web không có desktop bridge nên không thể xác thực extension hoặc điều khiển Flow. Hãy mở Browser-Native AI Video Studio desktop rồi làm mới trạng thái." : flowConnectionState === "extension" ? "Hãy mở Chrome, đăng nhập Flow và bật Browser-Native Studio Executor." : flowConnectionState === "duplicate" ? `Đang nhận diện nhiều tab Flow trùng (workspace: ${flowWorkspaceTabCount}, runtime: ${flowRuntimeToolTabCount}, editor: ${flowEditorToolTabCount}). Hãy giữ một workspace Flow; các tab tool/runtime cũ không cần cho luồng UI-direct.` : flowConnectionState === "project" ? `Extension ${bridgeVersionLabel || "đã kết nối"}; hãy mở một project Flow đang đăng nhập.` : flowConnectionState === "editor" ? "Tab hiện tại là bản chỉnh sửa /tool/. Hãy bấm Xong để trở về workspace project trước khi tạo video." : flowConnectionState === "error" ? "Flow đã mở nhưng workspace hoặc picker phát sinh lỗi phía trang. Hãy đóng picker, tải lại tab workspace, kiểm tra console không còn lỗi rồi mới thử lại một shot." : flowConnectionState === "outdated" ? "Luồng UI-direct đang mở nhưng job trước đó báo thiếu control. Kiểm tra lại workspace Flow rồi làm mới trạng thái." : `Extension ${bridgeVersionLabel || "đã kết nối"} và một workspace Flow đã sẵn sàng cho executor UI-direct; Studio Shot Bridge runtime chỉ là nhánh legacy/diagnostic.`; return (appManagerOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="app-manager-title">
          <section className="settings-dialog app-manager-dialog">
            <AppManagerFocusTrap />
            <header>
              <div><span className="eyebrow">Không gian làm việc</span><h2 id="app-manager-title">Quản lý ứng dụng</h2></div>
              <button type="button" autoFocus title="Đóng quản lý ứng dụng" aria-label="Đóng quản lý ứng dụng" onClick={() => setAppManagerOpen(false)}><X size={17} /></button>
            </header>
            <div className="app-manager-tabs" role="tablist" aria-label="Các mục quản lý ứng dụng">
              <button type="button" id="app-manager-tab-projects" role="tab" aria-selected={appManagerTab === "projects"} aria-controls="app-manager-panel-projects" tabIndex={appManagerTab === "projects" ? 0 : -1} className={appManagerTab === "projects" ? "active" : ""} onClick={() => setAppManagerTab("projects")} onKeyDown={(event) => handleAppManagerTabKey(event, "projects", setAppManagerTab)}><FolderKanban size={15} /> Dự án</button>
              <button type="button" id="app-manager-tab-settings" role="tab" aria-selected={appManagerTab === "settings"} aria-controls="app-manager-panel-settings" tabIndex={appManagerTab === "settings" ? 0 : -1} className={appManagerTab === "settings" ? "active" : ""} onClick={() => setAppManagerTab("settings")} onKeyDown={(event) => handleAppManagerTabKey(event, "settings", setAppManagerTab)}><Settings size={15} /> Thiết lập</button>
              <button type="button" id="app-manager-tab-account" role="tab" aria-selected={appManagerTab === "account"} aria-controls="app-manager-panel-account" tabIndex={appManagerTab === "account" ? 0 : -1} className={appManagerTab === "account" ? "active" : ""} onClick={() => setAppManagerTab("account")} onKeyDown={(event) => handleAppManagerTabKey(event, "account", setAppManagerTab)}><BadgeCheck size={15} /> Tài khoản</button>
            </div>
            {appManagerTab === "projects" ? (
              <div id="app-manager-panel-projects" role="tabpanel" aria-labelledby="app-manager-tab-projects">
                <ProjectLibraryView
                rows={projectRows}
                activeProjectId={project.id}
                search={projectSearch}
                newProjectName={newProjectName}
                onSearch={setProjectSearch}
                onNewProjectName={setNewProjectName}
                onSelectProject={selectProject}
                onCreateProject={createProject}
                />
              </div>
            ) : null}
            {appManagerTab === "settings" ? (
              <section id="app-manager-panel-settings" role="tabpanel" aria-labelledby="app-manager-tab-settings" className="app-settings-panel">
                <div>
                  <span className="eyebrow">Lưu trữ dự án</span>
                  <h3>Thư mục không gian làm việc</h3>
                  <p>Thiết lập chung được tách khỏi từng dự án. Mỗi dự án sẽ có gói trạng thái riêng để cập nhật và sao lưu an toàn.</p>
                  <button type="button" disabled title="Thiết lập thư mục tuỳ chọn chưa được hỗ trợ; ứng dụng vẫn lưu trong không gian cục bộ hiện tại.">Chọn thư mục · sắp có</button>
                </div>
                <dl>
                  <div><dt>Hoàn tác</dt><dd><kbd>⌘ Z</kbd></dd></div>
                  <div><dt>Làm lại</dt><dd><kbd>⌘ ⇧ Z</kbd></dd></div>
                  <div><dt>Mở quản lý ứng dụng</dt><dd><kbd>⌘ ,</kbd></dd></div>
                  <div><dt>Lưu chỉnh sửa</dt><dd><kbd>⌘ S</kbd></dd></div>
                  <div><dt>Thêm nhận xét</dt><dd><kbd>⌘ ⌥ M</kbd></dd></div>
                  <div><dt>Tạo bằng AI đã chọn</dt><dd><kbd>⌘ Enter</kbd></dd></div>
                </dl>
              </section>
            ) : null}
            {appManagerTab === "account" ? (
              <section id="app-manager-panel-account" role="tabpanel" aria-labelledby="app-manager-tab-account" className="app-account-panel">
                <BadgeCheck size={22} />
                <h3>Kết nối Google Flow</h3>
                <p>Hoàn tất 4 bước dưới đây. App không lưu mật khẩu; bạn đăng nhập trực tiếp trong Chrome.</p>
                <div className={`provider-connection-status ${flowConnectionState}`} role="status" aria-live="polite">
                  <strong>{flowConnectionTitle}</strong>
                  <span>{flowConnectionDetail}</span>
                  {flowConnectionState === "duplicate" ? <small>Nhiều tab trùng có thể làm picker gắn nhầm runtime hoặc trả về trạng thái DRAFT rỗng.</small> : flowConnectionState === "editor" ? <small>Không submit video từ bản chỉnh sửa; chỉ bản runtime mới nhận job an toàn.</small> : null}
                </div>
                <button type="button" className="provider-open-flow" onClick={() => {
                  const url = "https://labs.google/fx/vi/tools/flow";
                  if (window.studioBridge?.openExternal) void window.studioBridge.openExternal(url);
                  else window.open(url, "_blank", "noopener,noreferrer");
                }}><ChevronRight size={15} /> Mở Google Flow</button>
                <ol className="provider-onboarding-list">
                  <li><strong>Đăng nhập Flow</strong><span>Mở Google Flow và hoàn tất đăng nhập tài khoản Google.</span></li>
                  <li><strong>Mở một project</strong><span>Trong danh sách Flow, mở project cần dùng cho video.</span></li>
                  <li><strong>Mở Công cụ</strong><span>Chọn <em>Công cụ</em> ở thanh bên của project.</span></li>
                  <li><strong>Kiểm tra workspace</strong><span>Đóng các tab Flow trùng hoặc tab chỉnh sửa; luồng UI-direct chạy trực tiếp trên một workspace project.</span></li>
                </ol>
                <small className="app-account-note">Kết nối tiện ích và trang Flow được hiển thị riêng. Công cụ cầu nối không bắt buộc cho luồng tạo trực tiếp; mỗi shot vẫn phải qua bước kiểm tra trước khi tạo video.</small>
              </section>
            ) : null}
          </section>
        </div>
      ) : null); }
