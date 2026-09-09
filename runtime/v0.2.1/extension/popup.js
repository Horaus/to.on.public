const statusRoot = document.querySelector("#status");
const nextStep = document.querySelector("#next-step");
const errorRoot = document.querySelector("#error");
const refreshButton = document.querySelector("#refresh");

function flowState(snapshot, connected) {
  const visibility = snapshot?.providerVisibility || {};
  const workspace = Number(visibility.googleFlowProjectTabs || 0);
  const customTool = Number(visibility.googleFlowCustomToolTabs || 0);
  const runtime = Number(visibility.googleFlowRuntimeToolTabs || 0);
  const editor = Number(visibility.googleFlowEditorToolTabs || 0);
  const duplicate = workspace > 1 || customTool > 1 || runtime > 1 || editor > 1;
  if (!connected) return { tone: "error", label: "Chờ desktop bridge", detail: "Chưa xác thực" };
  if (duplicate) return { tone: "warn", label: "Nhiều tab Flow", detail: `${workspace} workspace · ${runtime} runtime` };
  if (workspace !== 1) return { tone: "warn", label: "Chưa mở project Flow", detail: "Mở đúng workspace" };
  if (editor > 0) return { tone: "warn", label: "Đang ở bản chỉnh sửa", detail: "Bấm Xong trên Flow" };
  return { tone: "ok", label: "Workspace Flow sẵn sàng", detail: "Có thể preflight" };
}

function row(label, value, detail, tone) {
  return `<span class="status-dot ${tone}"></span><dl><dt>${label}</dt><dd>${value}</dd></dl><span class="status-detail">${detail}</span>`;
}

function render(snapshot) {
  const connected = snapshot?.connected === true;
  const flow = flowState(snapshot, connected);
  const pairing = snapshot?.pairing;
  const discovery = snapshot?.discovery || {};
  const discoveryLabel = discovery.phase === "low_energy"
    ? "Tiết kiệm năng lượng"
    : discovery.phase === "candidate"
      ? "Đã thấy ứng viên"
      : discovery.phase === "reacquiring"
        ? "Đang tìm lại"
        : "Đang quét";
  const version = snapshot?.version || "Không rõ version";
  statusRoot.innerHTML = [
    `<div class="status-row">${row("Desktop bridge", connected ? "Đã kết nối" : "Chưa kết nối", version, connected ? "ok" : "error")}</div>`,
    pairing ? `<div class="status-row">${row("Pairing", pairing.state === "confirmed" ? "Đã xác nhận" : pairing.state === "secret_sent" ? "Đang xác nhận" : pairing.state === "rejected" ? "Bị từ chối" : "Chờ desktop phê duyệt", pairing.state === "pending" && pairing.code ? `Mã ${pairing.code}` : "Không hiển thị secret", pairing.state === "confirmed" ? "ok" : pairing.state === "rejected" ? "error" : "warn")}</div>` : "",
    `<div class="status-row">${row("Google Flow", flow.label, `${flow.detail} · ${discoveryLabel}`, flow.tone)}</div>`,
    `<div class="status-row">${row("Tác vụ đang chạy", String(snapshot?.activeJobs || 0), "Không tự submit", snapshot?.activeJobs ? "warn" : "ok")}</div>`
  ].join("");
  nextStep.innerHTML = flow.tone === "ok"
    ? "<strong>Bước tiếp theo</strong>Quay lại desktop và chạy preflight một shot; popup không tự gửi job."
    : pairing?.state === "pending"
      ? "<strong>Bước tiếp theo</strong>Đọc mã pairing này và phê duyệt extension trong Account/Connection trên desktop."
    : flow.label === "Chưa mở project Flow"
      ? "<strong>Bước tiếp theo</strong>Mở Chrome, đăng nhập Flow, rồi mở đúng một project workspace."
      : flow.label === "Nhiều tab Flow"
        ? "<strong>Bước tiếp theo</strong>Đóng tab Flow trùng; chỉ giữ một workspace canonical."
        : "<strong>Bước tiếp theo</strong>Mở Browser-Native Studio desktop để ghép bridge trước.";
  statusRoot.setAttribute("aria-busy", "false");
}

async function refresh() {
  refreshButton.disabled = true;
  statusRoot.setAttribute("aria-busy", "true");
  errorRoot.hidden = true;
  try {
    const snapshot = await chrome.runtime.sendMessage({ source: "popup", type: "GET_BRIDGE_STATUS" });
    if (!snapshot || snapshot.error) throw new Error(snapshot?.error || "Không đọc được trạng thái bridge.");
    render(snapshot);
  } catch (error) {
    statusRoot.setAttribute("aria-busy", "false");
    errorRoot.textContent = error instanceof Error ? error.message : String(error);
    errorRoot.hidden = false;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", refresh);
void refresh();
