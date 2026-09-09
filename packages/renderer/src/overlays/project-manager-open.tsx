import {
  Check,
  ChevronRight,
  X
} from "lucide-react";
import { useEffect } from "react";
import type { ProjectManagerModel } from "../studio-overlay-contracts";

function ProjectManagerFocusTrap() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".project-dialog");
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

export function ProjectManagerOverlay({ model }: { model: ProjectManagerModel }) { const { createProject, newProjectName, project, projectManagerOpen, projectRows, projectSearch, selectProject, setAppManagerOpen, setAppManagerTab, setNewProjectName, setProjectManagerOpen, setProjectSearch, state } = model; useEffect(() => { if (!projectManagerOpen) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setProjectManagerOpen(false); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [projectManagerOpen, setProjectManagerOpen]); return (projectManagerOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Chuyển dự án">
          <section className="settings-dialog project-dialog quick">
            <ProjectManagerFocusTrap />
            <header>
              <div><span className="eyebrow">Dự án</span><h2>Chuyển dự án</h2></div>
              <div className="project-dialog-actions">
              <button type="button" onClick={() => { setProjectManagerOpen(false); setAppManagerTab("projects"); setAppManagerOpen(true); }}>Xem thêm <ChevronRight size={14} /></button>
              <button type="button" autoFocus title="Đóng quản lý dự án" aria-label="Đóng quản lý dự án" onClick={() => setProjectManagerOpen(false)}><X size={17} /></button>
              </div>
            </header>
            <div className="project-manager-tools">
              <label>Tìm kiếm<input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Tên dự án hoặc brief" /></label>
              <div><strong>{state.projects.length}</strong><span>dự án</span></div>
            </div>
            <div className="project-list">
              {projectRows.slice(0, 5).map((item) => (
              <button type="button" className={item.project.id === project.id ? "active" : ""} key={item.project.id} onClick={() => void selectProject(item.project.id)}>
                  <span className="project-row-main">
                    <strong>{item.project.name}</strong>
                    <small>{item.project.description || item.project.sourceDraft || "Chưa lưu brief"}</small>
                  </span>
                  <span className="project-row-metrics">
                    <em>{item.sceneCount} cảnh</em>
                    <em>{item.shotCount} shot</em>
                    <em>{item.sourceCount} nguồn</em>
                    <em className={item.actionNeededJobs ? "warning" : "ok"}>{item.actionNeededJobs ? `${item.actionNeededJobs} cần xử lý` : "ổn định"}</em>
                  </span>
                  <span className="project-row-status">
                    <small>{new Date(item.project.updatedAt).toLocaleDateString()}</small>
                    {item.project.id === project.id ? <Check size={16} /> : <ChevronRight size={16} />}
                  </span>
                </button>
              ))}
              {projectRows.length === 0 ? <div className="empty-row">Không có dự án khớp tìm kiếm.</div> : null}
            </div>
            {projectRows.length > 5 ? <button type="button" className="project-more-row" onClick={() => { setProjectManagerOpen(false); setAppManagerTab("projects"); setAppManagerOpen(true); }}>Xem tất cả {projectRows.length} dự án <ChevronRight size={14} /></button> : null}
            <div className="new-project-row">
              <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Tên dự án mới" />
              <button type="button" className="primary" onClick={() => void createProject()}>Tạo dự án</button>
            </div>
          </section>
        </div>
      ) : null); }
