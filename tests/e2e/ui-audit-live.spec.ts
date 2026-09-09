import { expect, test } from "@playwright/test";
import path from "node:path";

const uploadReferenceFixture = path.join(process.cwd(), "tests/fixtures/upload-reference.svg");

test("capture the complete post-hardening UI audit set", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const views = [
    ["overview", "Tổng quan"],
    ["flow-map", "Sơ đồ luồng"],
    ["story", "Kịch bản"],
    ["characters", "Nhân vật & Phong cách"],
    ["storyboard", "Storyboard"],
    ["edit", "Dựng phim"],
    ["source", "Thư viện nguồn"],
    ["activity", "Thông báo"]
  ] as const;
  for (const [name, label] of views) {
    const navigationButton = page.getByRole("button", { name: label, exact: true });
    await navigationButton.click();
    // Capture only after React has committed the active view; otherwise a
    // screenshot can show the previous highlighted module while the new page
    // is already painted, producing misleading UI evidence.
    await expect(navigationButton).toHaveClass(/active/);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `docs/ui-audit/evidence/live-2026-08-26-${name}.png`, fullPage: true });
  }
});

test("help affordances expose their explanation on click", async ({ page }) => {
  await page.goto("/");
  // Several view-specific rails remain mounted for fast navigation; target
  // the visible automation disclosure rather than whichever hidden rail
  // happens to be first in the DOM.
  const help = page.locator(".automation-disclosure > .automation-help");
  const disclosure = page.locator(".automation-disclosure");
  if (!(await disclosure.getAttribute("open"))) await disclosure.locator("summary").click();
  await help.click();
  await page.waitForTimeout(180);
  const tooltip = await help.evaluate((node) => ({
    title: node.getAttribute("title"),
    opacity: getComputedStyle(node, "::after").opacity,
    text: getComputedStyle(node, "::after").content
  }));
  if (!tooltip.title) throw new Error("help control has no explanation title");
  if (tooltip.opacity !== "1") throw new Error(`help tooltip is not visible after click: ${tooltip.opacity}`);
  if (!tooltip.text || tooltip.text === "none") throw new Error("help tooltip has no content");
  for (const item of await page.locator(".production-guide .rail-help").all()) {
    await expect(item).toHaveAttribute("title", /\S+/);
    await expect(item).toHaveAttribute("aria-label", /\S+/);
  }
});

test("disconnected provider state opens the connection guide directly", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sidebar-footer")).toHaveAttribute(
    "data-connection-state",
    /^(desktop-missing|extension-missing|flow-needs-check|flow-preflight-blocked|extension-update-required|ready)$/
  );
  const connect = page.getByRole("button", { name: /^(Mở hướng dẫn kết nối|Xem hướng dẫn desktop)$/ });
  if (await connect.count()) {
    await expect(connect).toBeVisible();
    await connect.click();
    await expect(page.getByRole("dialog", { name: "Quản lý ứng dụng" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Quản lý ứng dụng" })).toContainText("Đăng nhập Flow");
  } else {
    // Desktop-connected runs do not show the disconnected banner; the
    // account guide remains reachable through the application manager.
    await expect(page.getByRole("button", { name: "Mở quản lý ứng dụng" })).toBeVisible();
  }
});

test("Flow onboarding exposes four independently refreshable boundary checks", async ({ page }) => {
  await page.goto("/");
  const connect = page.getByRole("button", { name: /^(Mở hướng dẫn kết nối|Xem hướng dẫn desktop)$/ });
  if (await connect.count()) await connect.click();
  else {
    await page.getByRole("button", { name: "Mở quản lý ứng dụng" }).click();
    await page.getByRole("tab", { name: "Tài khoản" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Quản lý ứng dụng" });
  await expect(dialog).toBeVisible();
  const steps = dialog.locator(".provider-onboarding-step");
  await expect(steps).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(steps.nth(index)).toHaveAttribute("data-status", /Đã kiểm tra|Cần thao tác|Chưa kiểm tra/);
    await expect(steps.nth(index).getByRole("button", { name: new RegExp(`Kiểm tra lại bước ${index + 1}`) })).toBeVisible();
  }
  const refreshAll = dialog.getByRole("button", { name: "Kiểm tra lại toàn bộ" });
  await expect(refreshAll).toBeVisible();
  await refreshAll.click();
  await expect(refreshAll).toBeEnabled();
});

test("capture the compact AI settings state with explicit help affordances", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  await page.getByRole("button", { name: "Mở định tuyến AI", exact: true }).click();
  await expect(page.locator(".rail-settings-page")).toContainText("Định tuyến AI");
  await page.screenshot({ path: "docs/ui-audit/evidence/live-2026-08-26-ai-routing.png", fullPage: true });
  await page.getByRole("button", { name: /Quay lại/ }).click();
  await page.getByRole("button", { name: "Mở bộ kỹ năng video", exact: true }).click();
  const creativeHelp = page.getByRole("button", { name: "Trợ giúp lớp sáng tạo" });
  await expect(creativeHelp).toHaveAttribute("title", /Lớp sáng tạo/);
  const summaryAfter = await page.locator(".video-skill-summary summary").evaluate((node) => getComputedStyle(node, "::after").content);
  expect(summaryAfter).toBe("none");
});

test("capture localized project management overlay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.locator(".project-switcher").click();
  await expect(page.getByRole("dialog", { name: "Chuyển dự án" })).toBeVisible();
  await page.screenshot({ path: "docs/ui-audit/evidence/project-overlay-localized-2026-08-27.png", fullPage: true });
});

test("project manager keeps keyboard focus inside its modal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Đổi dự án" }).click();
  const dialog = page.getByRole("dialog", { name: "Chuyển dự án" });
  await dialog.locator("button").last().focus();
  await page.keyboard.press("Tab");
  await expect(dialog.locator("button").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("capture localized reference upload preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  await page.locator(".upload-input").first().setInputFiles(uploadReferenceFixture);
  await page.locator(".upload-zone.has-preview").first().click();
  const dialog = page.getByRole("dialog", { name: "Reference nhận diện chính" });
  await expect(dialog).toBeVisible();
  await dialog.locator("button").last().focus();
  await page.keyboard.press("Tab");
  await expect(dialog.locator("button").first()).toBeFocused();
  await page.screenshot({ path: "docs/ui-audit/evidence/reference-upload-preview-localized-2026-08-27.png", fullPage: true });
});

test("every production view exposes only explained help controls and no internal voice metadata", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const views = ["Tổng quan", "Sơ đồ luồng", "Kịch bản", "Nhân vật & Phong cách", "Storyboard", "Dựng phim", "Thư viện nguồn", "Thông báo"];
  for (const view of views) {
    await page.getByRole("button", { name: view, exact: true }).click();
    const visible = await page.locator(".studio-body").innerText();
    expect(visible).not.toMatch(/Character voice lock|Voice provider|Voice ID|macOS audio pass|Generated from the imported story package|Không có đặc điểm ngoại hình được nguồn khóa/i);
    expect(visible).not.toMatch(/Translate current script context|Scene 1: hook and main image|Dùng --- để tách scene/i);
    expect(visible).not.toMatch(/chatgpt-web|google-flow-web|provider-compilation|sourceJobId/i);
    for (const help of await page.locator(".studio-body .rail-help:visible").all()) {
      await expect(help).toHaveAttribute("title", /\S+/);
      await expect(help).toHaveAttribute("aria-label", /\S+/);
    }
  }
  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  await page.getByRole("button", { name: "Mở định tuyến AI", exact: true }).click();
  const testButton = page.locator(".rail-test-button");
  const settingsButton = page.locator(".rail-settings-page .rail-settings-link").first();
  const [testStyle, settingsStyle] = await Promise.all([
    testButton.evaluate((node) => { const s = getComputedStyle(node); return { minHeight: s.minHeight, padding: s.padding, border: s.border, fontSize: s.fontSize, fontWeight: s.fontWeight, background: s.backgroundColor }; }),
    settingsButton.evaluate((node) => { const s = getComputedStyle(node); return { minHeight: s.minHeight, padding: s.padding, border: s.border, fontSize: s.fontSize, fontWeight: s.fontWeight, background: s.backgroundColor }; })
  ]);
  expect(testStyle).toEqual(settingsStyle);
  await expect(testButton).toHaveCSS("width", await settingsButton.evaluate((node) => getComputedStyle(node).width));
  await expect(page.getByRole("button", { name: "Trợ giúp kiểm tra kết nối AI" })).toHaveAttribute("title", /\S+/);
});

test("localized settings do not leak English availability labels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  const settingsText = await page.locator(".right-rail-footer").innerText();
  expect(settingsText).not.toMatch(/\bsoon\b|Uploaded reference|Run details/i);
  expect(settingsText).toContain("Tiếng Việt");
  await page.screenshot({ path: "docs/ui-audit/evidence/runtime-settings-language-2026-08-27.png", fullPage: true });
});

test("production controls keep localized accessible names", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/i }).click();
  await expect(page.getByLabel(/Loại đầu vào|Input type/i)).toBeVisible();
  await expect(page.getByLabel(/Định dạng sản xuất|Production format/i)).toBeVisible();
  // The prompt action is only available once the local storyboard draft exists.
  // Follow the same durable transition as a real user instead of asserting it
  // against the empty initial state.
  const createDraft = page.getByRole("button", { name: /Create draft locally|Tạo bản nháp tại chỗ/i });
  if (await createDraft.count()) {
    await createDraft.click();
    await expect(page.locator(".scene-list")).toBeVisible();
  }
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await expect(page.getByRole("button", { name: /Chuẩn bị chỉ dẫn video|Prepare video instructions/i })).toBeVisible();
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  await expect(page.getByRole("button", { name: /Tạo video|Queue video/i })).toBeVisible();
});

test("edit insert panel keeps action labels localized", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Dựng phim", exact: true }).click();
  const panel = page.locator(".edit-insert-sidebar");
  await expect(panel).toHaveAttribute("aria-label", "Chèn tại điểm cắt");
  await expect(panel.getByRole("button", { name: "Tạo bản nháp nội dung chèn" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Thêm điểm cắt chờ" })).toBeVisible();
  await expect(panel.locator("[aria-label='Draft insert prompt'], [aria-label='Add placeholder cut']")).toHaveCount(0);
});

test("edit workspace keeps timeline, insert rail, and export panel separated", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Dựng phim", exact: true }).click();
  const playAll = page.getByRole("button", { name: "Phát tất cả", exact: true });
  if (await playAll.count()) await expect(playAll).toBeDisabled();
  const regions = await page.locator(".edit-nle, .edit-insert-sidebar, .master-export-panel").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { className: element.className, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  }));
  expect(regions).toHaveLength(3);
  expect(regions.every((region) => region.width > 220 && region.height > 90)).toBe(true);
  const timeline = regions.find((region) => region.className.includes("edit-nle"));
  const rail = regions.find((region) => region.className.includes("edit-insert-sidebar"));
  expect(timeline && rail).toBeTruthy();
  expect(timeline!.right).toBeLessThanOrEqual(rail!.left + 2);
  const editorLayout = await page.locator(".edit-bay").evaluate((element) => {
    const bay = element as HTMLElement;
    const preview = bay.querySelector<HTMLElement>(".edit-preview-panel");
    return { hasReview: bay.classList.contains("has-review"), columns: getComputedStyle(bay).gridTemplateColumns, bayWidth: bay.getBoundingClientRect().width, previewWidth: preview?.getBoundingClientRect().width ?? 0 };
  });
  if (!editorLayout.hasReview) {
    expect(editorLayout.columns.split(" ")).toHaveLength(1);
    expect(editorLayout.previewWidth).toBeGreaterThan(editorLayout.bayWidth - 4);
  }
  await expect(page.locator("body")).not.toContainText(/\b(?:Timeline|Export|Review|Insert|Activity)\b/);
});

test("edit audio controls provide keyboard focus and practical hit areas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Dựng phim", exact: true }).click();
  await page.locator(".edit-advanced-controls > summary").click();
  const sliders = page.locator('.edit-advanced-controls input[type="range"]');
  await expect(sliders.first()).toBeVisible();
  const geometry = await sliders.evaluateAll((elements) => elements.map((element) => {
    const input = element as HTMLInputElement;
    const label = input.closest("label");
    const inputRect = input.getBoundingClientRect();
    const labelRect = label?.getBoundingClientRect();
    return {
      inputHeight: inputRect.height,
      labelHeight: labelRect?.height ?? 0,
      labelContainsInput: Boolean(label && label.contains(input))
    };
  }));
  expect(geometry.length).toBeGreaterThan(1);
  expect(geometry.every((item) => item.inputHeight >= 28 && item.labelHeight >= 44 && item.labelContainsInput)).toBe(true);
  await page.locator(".edit-advanced-controls > summary").focus();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    const reachedSlider = await page.evaluate(() => document.activeElement instanceof HTMLInputElement && document.activeElement.type === "range");
    if (reachedSlider) break;
  }
  const focused = await page.evaluate(() => ({
    active: document.activeElement instanceof HTMLInputElement && document.activeElement.type === "range",
    shadow: document.activeElement ? getComputedStyle(document.activeElement).boxShadow : "none"
  }));
  expect(focused.active).toBe(true);
  expect(focused.shadow).not.toBe("none");
});

test("production surfaces keep structural labels localized", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Dựng phim", exact: true }).click();
  await expect(page.locator(".edit-nle")).toHaveAttribute("aria-label", "Dòng thời gian dựng nhiều lớp");
  await expect(page.locator(".master-export-panel")).toHaveAttribute("aria-label", "Xuất bản dựng chính");
  await page.getByRole("button", { name: "Mở quản lý ứng dụng" }).click();
  await expect(page.locator(".project-library-list")).toHaveAttribute("aria-label", "Thư viện dự án");
  await expect(page.locator(".app-manager-tabs")).toHaveAttribute("aria-label", "Các mục quản lý ứng dụng");
  await page.getByRole("button", { name: "Đóng quản lý ứng dụng" }).click();
  await page.getByRole("button", { name: "Kịch bản", exact: true }).click();
  const sceneList = page.locator(".scene-list");
  if (await sceneList.count()) await expect(sceneList).toHaveAttribute("aria-label", "Dòng thời gian cảnh và shot");
  else await expect(page.locator(".scene-list-empty")).toBeVisible();
  await expect(page.locator(".story-intake-workspace")).not.toContainText(/\bsoon\b/i);
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await expect(page.locator(".production-graph-view")).toHaveAttribute("aria-label", "Sơ đồ luồng sản xuất");
  await expect(page.locator(".spatial-production-canvas")).toHaveAttribute("aria-label", "Mặt phẳng sơ đồ sản xuất");
  const assetLabels = await page.locator(".flow-section-label:visible").allTextContents();
  expect(assetLabels.join(" ")).not.toMatch(/\b(?:Characters|Main|Supporting|Locations|Props|Visual style)\b/);
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await expect(page.locator(".storyboard-canvas")).toHaveAttribute("aria-label", "Khung storyboard của shot");
  await expect(page.locator(".storyboard-stepper")).toHaveAttribute("aria-label", "Các bước storyboard");
});

test("overview recent activity names the production stage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const rows = page.locator(".recent-list > button");
  if (await rows.count()) {
    for (const row of await rows.all()) {
      await expect(row.locator("strong")).not.toHaveText(/^(Text|Image|Video|Audio)$/);
      await expect(row.locator("small")).toContainText(/Kịch bản|Phân cảnh|Shot|Nhận diện|Khung hình|Video|Âm thanh|Hệ thống/);
    }
  }
});

test("activity view keeps current work separate from history", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  await expect(page.locator(".activity-summary")).toBeVisible();
  await expect(page.locator(".activity-log .panel-head")).toContainText("Theo dõi tác vụ");
  await expect(page.locator(".activity-summary")).toContainText(/đang chạy|cần xử lý hiện tại/);
  await page.screenshot({ path: "docs/ui-audit/evidence/runtime-activity-current-vs-history-2026-08-27.png", fullPage: true });
});

test("activity history is retained behind an explicit disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  const history = page.locator(".job-history");
  if (await history.count()) {
    await expect(history).not.toHaveAttribute("open", "");
    await expect(history.locator(".job-history-label")).toContainText("Lịch sử trước đó");
    await history.locator("summary").click();
    await expect(history).toHaveAttribute("open", "");
    await expect(history.locator(".job-history-rows .job-row").first()).toBeVisible();
  }
});

test("every visible help icon renders its explanation on focus", async ({ page }) => {
  test.setTimeout(30000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const views = ["Overview|Tổng quan", "Flow map|Sơ đồ luồng", "Story|Kịch bản", "Characters & Style|Nhân vật & Phong cách", "Storyboard", "Edit|Dựng phim", "Source|Thư viện nguồn", "Activity|Thông báo"];
  for (const view of views) {
    await page.getByRole("button", { name: new RegExp(`^(${view})$`), exact: true }).click();
    for (const help of await page.locator(".studio-body .rail-help:visible").all()) {
      await help.hover();
      await page.waitForTimeout(180);
      const state = await help.evaluate((node) => ({
        title: node.getAttribute("title"),
        opacity: getComputedStyle(node, "::after").opacity,
        content: getComputedStyle(node, "::after").content
      }));
      expect(state.title).toMatch(/\S+/);
      expect(state.opacity).toBe("1");
      expect(state.content).toMatch(/\S+/);
    }
  }
});

test("navigation highlight follows the active production view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const views = ["Tổng quan", "Sơ đồ luồng", "Kịch bản", "Nhân vật & Phong cách", "Storyboard", "Dựng phim", "Thư viện nguồn", "Thông báo"];
  for (const view of views) {
    const button = page.getByRole("button", { name: view, exact: true });
    await button.click();
    await page.waitForTimeout(80);
    await expect(button).toHaveClass(/active/);
    await expect(page.locator("nav[aria-label='Các khu vực sản xuất'] button.active")).toHaveCount(1);
  }
});

test("idle views do not show stale running toast or running rail state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const views = ["Tổng quan", "Sơ đồ luồng", "Kịch bản", "Nhân vật & Phong cách", "Storyboard", "Dựng phim", "Thư viện nguồn", "Thông báo"];
  for (const view of views) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await page.waitForTimeout(80);
    await expect(page.locator(".production-activity-toast")).toHaveCount(0);
    const automation = page.locator(".automation-disclosure summary strong");
    await expect(automation).not.toHaveText("Đang chạy");
    await expect(automation).toHaveText(/Sẵn sàng|Chưa kết nối|Cần xử lý/);
    await expect(page.locator(".automation-disclosure")).not.toHaveAttribute("open", "");
    await expect(page.locator(".automation-disclosure .spin")).toHaveCount(0);
  }
  await page.screenshot({ path: "docs/ui-audit/evidence/runtime-idle-state-no-stale-toast-2026-08-27.png", fullPage: true });
});
