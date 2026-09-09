import { BadgeCheck, Check, ChevronRight, FolderKanban, Loader2, RefreshCcw, Settings, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AppManagerModel } from "../studio-overlay-contracts";
import { flowConnectionSummary } from "../studio-application-composition";
import { AppManagerOverlay as LegacyAppManagerOverlay } from "./app-manager-open";

type AppManagerTab = "projects" | "settings" | "account";
const tabs: AppManagerTab[] = ["projects", "settings", "account"];

function moveTab(event: ReactKeyboardEvent<HTMLButtonElement>, current: AppManagerTab, setTab: (tab: AppManagerTab) => void) {
  const index = tabs.indexOf(current);
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : direction ? (index + direction + tabs.length) % tabs.length : -1;
  if (target < 0) return;
  event.preventDefault();
  const next = tabs[target];
  setTab(next);
  requestAnimationFrame(() => document.getElementById(`app-manager-tab-${next}`)?.focus());
}

function AccountTabs({ active, setTab }: { active: AppManagerTab; setTab: (tab: AppManagerTab) => void }) {
  const items = [
    ["projects", <FolderKanban size={15} />, "Dự án"],
    ["settings", <Settings size={15} />, "Thiết lập"],
    ["account", <BadgeCheck size={15} />, "Tài khoản"]
  ] as const;
  return <div className="app-manager-tabs" role="tablist" aria-label="Các mục quản lý ứng dụng">{items.map(([id, icon, label]) => <button type="button" id={`app-manager-tab-${id}`} role="tab" aria-selected={active === id} aria-controls={`app-manager-panel-${id}`} tabIndex={active === id ? 0 : -1} className={active === id ? "active" : ""} key={id} onClick={() => setTab(id)} onKeyDown={(event) => moveTab(event, id, setTab)}>{icon} {label}</button>)}</div>;
}

function AccountStep({ index, title, detail, ready, blocked, refreshing, onRefresh }: { index: number; title: string; detail: string; ready: boolean; blocked: boolean; refreshing: boolean; onRefresh: () => void }) {
  const label = ready ? "Đã kiểm tra" : blocked ? "Cần thao tác" : "Chưa kiểm tra";
  return <li className={`provider-onboarding-step ${ready ? "ready" : blocked ? "blocked" : "pending"}`} data-status={label}>
    <div className="provider-onboarding-step-copy"><strong>{title}</strong><span>{detail}</span></div>
    <div className="provider-onboarding-step-actions"><small aria-label={`Bước ${index}: ${label}`}>{ready ? <Check size={13} aria-hidden="true" /> : blocked ? "!" : "·"} {label}</small><button type="button" className="provider-step-refresh" onClick={onRefresh} disabled={refreshing} aria-label={`Kiểm tra lại bước ${index}: ${title}`} title={`Kiểm tra lại bước ${index}`}>{refreshing ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <RefreshCcw size={13} aria-hidden="true" />}</button></div>
  </li>;
}

function AccountOverlay({ model }: { model: AppManagerModel }) {
  const { appManagerTab, bridgeCount = 0, bridgeStatus, bridgeVersionLabel, hasDesktopBridge = true, project, setAppManagerOpen, setAppManagerTab, state } = model;
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const summary = flowConnectionSummary(bridgeStatus);
  const { flowCustomToolTabCount, flowEditorToolCount, flowHasDuplicateTabs, flowProjectOpen, flowRuntimeToolCount, flowWorkspaceTabCount } = summary;
  const flowRuntimeNeedsUpdate = state.jobs.some((job) => job.projectId === project.id && job.providerId === "google-flow-web" && /composer add button was not visible|runtime tool shell is incomplete|Studio Shot Bridge runtime .*control/i.test(`${job.error || ""} ${job.statusMessage || ""}`));
  const flowWorkspaceHasError = state.jobs.some((job) => job.projectId === project.id && job.providerId === "google-flow-web" && /Application error:\s*a client-side exception|Cannot read properties of undefined \(reading ['"]service['"]\)|Timed out waiting for storyboard media|Receiving end does not exist|Could not find or control the Google Flow prompt editor|Native text insertion did not update|Flow visual reference could not be attached completely/i.test(`${job.error || ""} ${job.statusMessage || ""}`));
  const pendingPairing = (bridgeStatus?.connections || []).find((connection) => connection.pairing?.state === "pending");
  const stateLabel = !hasDesktopBridge ? "web" : bridgeCount <= 0 ? "extension" : pendingPairing ? "pairing" : flowHasDuplicateTabs ? "duplicate" : !flowProjectOpen ? "project" : flowEditorToolCount > 0 ? "editor" : flowWorkspaceHasError ? "error" : flowRuntimeNeedsUpdate ? "outdated" : "ready";
  const ready = stateLabel === "ready";
  const refresh = async () => {
    if (refreshing || !model.refreshBridgeStatus) return;
    setRefreshing(true);
    try { await model.refreshBridgeStatus(); } finally { setRefreshing(false); }
  };
  const approvePendingPairing = async () => {
    const pairing = pendingPairing?.pairing;
    const extensionInstanceId = pendingPairing?.extensionInstanceId || pairing?.extensionInstanceId || pendingPairing?.extensionId;
    if (approving || !extensionInstanceId || !pairing?.code || !window.studioBridge?.approveBridgePairing) return;
    setApproving(true);
    setApprovalError("");
    try {
      const result = await window.studioBridge.approveBridgePairing({ extensionInstanceId, code: pairing.code });
      if (!result.ok) setApprovalError(result.code || "Không thể phê duyệt extension.");
      await refresh();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Không thể phê duyệt extension.");
    } finally {
      setApproving(false);
    }
  };
  const steps = [
    { title: "Đăng nhập Flow", ready: hasDesktopBridge && bridgeCount > 0 && flowProjectOpen, detail: flowProjectOpen ? "Đã thấy tab project Flow đang mở." : "Mở Flow và đăng nhập tài khoản Google trong Chrome." },
    { title: "Mở một project", ready: hasDesktopBridge && bridgeCount > 0 && flowWorkspaceTabCount === 1 && !flowHasDuplicateTabs, detail: flowWorkspaceTabCount === 1 ? "Đang có đúng một workspace project." : `Đang thấy ${flowWorkspaceTabCount} workspace; cần đúng một project.` },
    { title: "Kiểm tra Công cụ", ready: hasDesktopBridge && bridgeCount > 0 && flowProjectOpen && flowEditorToolCount === 0, detail: flowEditorToolCount > 0 ? "Đang mở tab chỉnh sửa; bấm Xong để quay về workspace." : flowCustomToolTabCount > 0 || flowRuntimeToolCount > 0 ? "Đã thấy tab Công cụ/Runtime cũ; UI-direct sẽ không dùng chúng." : "Không có tab Công cụ cũ chặn workspace UI-direct." },
    { title: "Kiểm tra workspace", ready, detail: ready ? `Extension ${bridgeVersionLabel || "đã kết nối"} và Flow UI-direct sẵn sàng.` : stateLabel === "duplicate" ? `Tab trùng: workspace ${flowWorkspaceTabCount}, runtime ${flowRuntimeToolCount}, editor ${flowEditorToolCount}.` : stateLabel === "error" ? "Workspace/picker đang báo lỗi; sửa trang Flow rồi kiểm tra lại." : "Chưa đạt generation-ready; hoàn tất các bước trên rồi kiểm tra lại." }
  ];
  useEffect(() => {
    if (appManagerTab !== "account") return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setAppManagerOpen(false); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appManagerTab, setAppManagerOpen]);
  return <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="app-manager-account-title">
    <section className="settings-dialog app-manager-dialog">
      <header><div><span className="eyebrow">Không gian làm việc</span><h2 id="app-manager-account-title">Quản lý ứng dụng</h2></div><button type="button" autoFocus title="Đóng quản lý ứng dụng" aria-label="Đóng quản lý ứng dụng" onClick={() => setAppManagerOpen(false)}><X size={17} /></button></header>
      <AccountTabs active={appManagerTab} setTab={setAppManagerTab} />
      <section id="app-manager-panel-account" role="tabpanel" aria-labelledby="app-manager-tab-account" className="app-account-panel">
        <BadgeCheck size={22} />
        <h3>Kết nối Google Flow</h3>
        <p>Hoàn tất 4 bước dưới đây. App không lưu mật khẩu; bạn đăng nhập trực tiếp trong Chrome.</p>
        <div className={`provider-connection-status ${stateLabel}`} role="status" aria-live="polite"><strong>{stateLabel === "ready" ? "Đã kết nối Flow (UI-direct)" : stateLabel === "web" ? "Đang dùng bản web" : stateLabel === "extension" ? "Extension chưa kết nối" : stateLabel === "pairing" ? "Chờ phê duyệt extension" : stateLabel === "duplicate" ? "Nhiều tab Flow đang mở" : "Flow cần kiểm tra"}</strong><span>{stateLabel === "ready" ? "Workspace và extension đã qua kiểm tra sẵn sàng." : "Trạng thái từng boundary được hiển thị bên dưới; không đồng nhất với việc đã tạo video."}</span></div>
        {pendingPairing ? <div className="provider-pairing-approval" role="status" aria-live="polite"><div><strong>Extension đang chờ phê duyệt</strong><span>Mã phiên <code>{pendingPairing.pairing?.code || "—"}</code> · chỉ chấp nhận trên desktop này.</span></div><button type="button" onClick={() => void approvePendingPairing()} disabled={approving || !window.studioBridge?.approveBridgePairing}>{approving ? <Loader2 size={13} className="spin" /> : <Check size={13} />} {approving ? "Đang phê duyệt…" : "Phê duyệt extension"}</button>{approvalError ? <small role="alert">{approvalError}</small> : null}</div> : null}
        <button type="button" className="provider-open-flow" onClick={() => { const url = "https://labs.google/fx/vi/tools/flow"; if (window.studioBridge?.openExternal) void window.studioBridge.openExternal(url); else window.open(url, "_blank", "noopener,noreferrer"); }}><ChevronRight size={15} /> Mở Google Flow</button>
        <ol className="provider-onboarding-list" aria-label="Các bước kết nối Google Flow">{steps.map((step, index) => <AccountStep key={step.title} index={index + 1} title={step.title} detail={step.detail} ready={step.ready} blocked={!step.ready && (stateLabel === "web" || stateLabel === "extension" || stateLabel === "duplicate" || stateLabel === "error" || index === 0)} refreshing={refreshing} onRefresh={() => void refresh()} />)}</ol>
        <button type="button" className="provider-refresh-all" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />} {refreshing ? "Đang kiểm tra…" : "Kiểm tra lại toàn bộ"}</button>
        <small className="app-account-note">Kết nối tiện ích và trang Flow là hai boundary riêng. Chỉ trạng thái “Đã kết nối Flow (UI-direct)” mới cho phép preflight tạo video; mọi bước khác vẫn cần thao tác người dùng.</small>
      </section>
    </section>
  </div>;
}

export function AppManagerOverlay({ model }: { model: AppManagerModel }) {
  if (!model.appManagerOpen || model.appManagerTab !== "account") return <LegacyAppManagerOverlay model={model} />;
  return <AccountOverlay model={model} />;
}
