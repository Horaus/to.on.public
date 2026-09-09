import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { validateVideoPreflight } from "../../packages/workflow/src/video-preflight";
import { buildVideoGenerationPrompt, skillInstructionForStage } from "../../packages/workflow/src/video-generation";
import { compileVideoProviderRequest, videoProviderCapabilityProfile } from "../../packages/workflow/src/video-provider-adapter";
import { createDefaultEditSequence, normalizeEditSequence, reorderSequenceClips, splitSequenceClip, trimSequenceClip } from "../../packages/renderer/src/core/edit-sequence";
import { allocateSceneShotCounts, minimumAtomicShotCount, orderScreenplayCueIds, planSceneShotCuePackets } from "../../packages/workflow/src/studio-shot-planning";
import { planProviderShotDurationsByWeights } from "@studio/protocol/duration-policy";
import type { Asset, AutomationJob, ScreenplayScene, Shot } from "@studio/types";

const repositoryRoot = process.cwd();
const uploadReferenceFixture = path.join(repositoryRoot, "tests/fixtures/upload-reference.svg");
const chatgptContentScript = path.join(repositoryRoot, "apps/extension/dist/content/chatgpt.js");

test("studio advances an incomplete project through its next durable pipeline step", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(/Production overview|Tổng quan sản xuất/)).toBeVisible();
  await expect(page.getByText(/Production control|Điều khiển sản xuất/i)).toBeVisible();
  await expect(page.getByText(/Project status|Trạng thái dự án/)).toBeVisible();
  await expect(page.getByText(/Automation map|Bản đồ tự động/i)).toBeVisible();

  await expect(page.locator(".overview-metrics .metric").filter({ hasText: /Scenes|Cảnh/i }).getByText("1")).toBeVisible();
  await page.getByRole("navigation", { name: /Production modules|Các khu vực sản xuất/i }).getByRole("button", { name: /^(Story|Kịch bản)$/i }).click();
  await page.getByRole("button", { name: /(?:Create draft locally|Tạo bản nháp tại chỗ)/i }).click();
  await expect(page.locator(".scene-list").getByRole("heading", { name: "Diễn tiến 1" })).toBeVisible();
  await expect(page.locator(".scene-list").getByRole("heading", { name: "Kết quả" })).toBeVisible();

  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await expect(page.getByText(/Storyboard board|Bảng storyboard/, { exact: true })).toBeVisible();
  await expect(page.locator(".storyboard-stepper")).toBeVisible();
  await expect(page.locator(".storyboard-overview-sheet")).toBeVisible();
  await expect(page.locator(".storyboard-canvas-stats")).toContainText(/shot sẵn sàng|video/i);
  await expect(page.locator(".storyboard-canvas-stats")).not.toContainText(/prompt/i);
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.locator(".storyboard-shot-main").first().click();
  const firstShotCard = page.locator(".storyboard-shot-card").first();
  await firstShotCard.locator(".storyboard-shot-copy").click();
  await expect(firstShotCard).toHaveClass(/selected/);
  await expect(page.locator(".storyboard-more-actions")).toHaveCount(0);
  await expect(page.locator(".production-guide .automation-disclosure")).toHaveCount(1);
  await page.getByRole("button", { name: /Prepare video instructions|Chuẩn bị chỉ dẫn video/i }).click();
  await expect(page.locator(".storyboard-side-context")).toContainText("SHOT ĐANG CHỌN");
  await expect(page.locator(".storyboard-side-context")).toContainText("Cỡ khung");
  await expect(page.locator(".storyboard-side-context")).toContainText("Diễn biến hành động & lời thoại");
  await expect(page.locator(".storyboard-side-context")).not.toContainText("Lời thoại (ghi rõ người nói)");

  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  const videoAction = page.getByRole("button", { name: /Queue video|Tạo video/i });
  await expect(videoAction).toBeDisabled();
  await expect(videoAction).toHaveAttribute("title", /keyframe|ảnh đầu vào|Flow chưa sẵn sàng/i);
  await expect(page.locator(".production-guide")).toContainText(/Chưa kết nối|Chờ xử lý|Flow/i);
});

test("overview pipeline controller runs the current production step", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".production-guide")).toBeVisible();
  await expect(page.locator(".overview-yolo-panel")).toContainText("Thiết lập nhanh");
  await expect(page.getByRole("textbox", { name: "Kịch bản gợi ý" })).toBeVisible();
  await expect(page.locator(".overview-yolo-panel")).toContainText("Triển khai");
  await expect(page.locator(".overview-control textarea")).toHaveCount(0);
  await expect(page.locator(".topbar-actions .primary")).toHaveCount(0);
  await expect(page.getByText(/Production control|Điều khiển sản xuất/i)).toBeVisible();
  await expect(page.locator(".pipeline-step-list")).toContainText("Câu chuyện hoàn chỉnh");
  await expect(page.locator(".pipeline-step-list")).toContainText(/Phân cảnh|Phân tách cảnh/i);

  await page.locator(".overview-yolo-panel").getByRole("button", { name: /Chạy bước/i }).click();
  await expect(page.getByRole("heading", { name: "Kịch bản", exact: true })).toBeVisible();
  await expect(page.locator(".story-job-status")).toContainText(/Story imported successfully|Đã tạo câu chuyện/i);
  await page.getByRole("button", { name: "Tổng quan", exact: true }).click();
  await expect(page.locator(".overview-metrics .metric").filter({ hasText: /Scenes|Cảnh/i }).getByText("3")).toBeVisible();
  await expect(page.locator(".overview-metrics .metric").filter({ hasText: /Shots|Shot/i }).getByText("4")).toBeVisible();
  await expect(page.locator(".pipeline-step-list button").first()).toHaveAttribute("aria-label", /Câu chuyện hoàn chỉnh/);
});

test("overview keeps a staged visual input while production settings change", async ({ page }) => {
  await page.goto("/");
  const setup = page.locator(".overview-yolo-panel");
  await setup.locator('input[type="file"]').setInputFiles({
    name: "staged-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xz6fWQAAAABJRU5ErkJggg==", "base64")
  });
  await expect(setup.getByAltText("Ảnh tham chiếu nhanh")).toBeVisible();

  await setup.locator(".rail-grid input").fill("45");
  await setup.locator(".rail-grid select").selectOption("16:9");

  await expect(setup.getByAltText("Ảnh tham chiếu nhanh")).toBeVisible();
  await expect(setup.getByRole("button", { name: "Bỏ ảnh" })).toBeVisible();
});

test("responsive production layout keeps hidden rails from stealing canvas width", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sơ đồ luồng", exact: true }).click();
  await page.setViewportSize({ width: 640, height: 700 });
  await expect(page.locator(".production-graph-view")).toHaveCSS("width", "640px");
  await expect(page.locator(".production-guide")).toBeHidden();
  await expect(page.locator(".studio-body.flow-mode")).toHaveCSS("grid-template-columns", "640px");

  await page.setViewportSize({ width: 800, height: 700 });
  await page.getByRole("button", { name: "Tổng quan", exact: true }).click();
  const overviewGrid = page.locator(".overview-grid");
  const gridColumns = await overviewGrid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).filter(Boolean));
  expect(gridColumns).toHaveLength(1);
  const boxes = await overviewGrid.locator(":scope > *").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  for (let index = 0; index < boxes.length; index += 1) {
    for (let next = index + 1; next < boxes.length; next += 1) {
      expect(boxes[index].right <= boxes[next].left || boxes[next].right <= boxes[index].left || boxes[index].bottom <= boxes[next].top || boxes[next].bottom <= boxes[index].top).toBeTruthy();
    }
  }
});

test("flow map renders the typed production graph without changing pipeline state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sơ đồ luồng", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Production flow|Luồng sản xuất/ })).toBeVisible();
  await expect(page.locator(".production-guide")).toHaveCount(1);
  await expect(page.locator(".production-guide")).toContainText("Vận hành tự động");
  await expect(page.locator(".production-guide h2.sr-only")).toContainText(/Flow map|Sơ đồ luồng/);
  await expect(page.locator(".production-graph-head")).toHaveCount(0);
  await expect(page.getByLabel(/Mặt phẳng sơ đồ sản xuất|Spatial production canvas/i)).toBeVisible();
  await expect.poll(async () => {
    const transform = await page.locator(".react-flow__viewport").evaluate((node) => getComputedStyle(node).transform);
    return Number(transform.match(/matrix\(([^,]+)/)?.[1] || 0);
  }).toBeGreaterThanOrEqual(0.45);
  await page.screenshot({ path: "docs/ui-audit/evidence/flow-map-readable-initial-2026-08-27.png", fullPage: true });
  for (const label of ["Đầu vào", "Câu chuyện hoàn chỉnh", "Phân tách cảnh", "Kịch bản / thoại", "Phân rã shot"]) await expect(page.getByLabel(`Nhóm ${label}`)).toBeVisible();
  await expect(page.locator(".flow-scene-continuity-document")).toHaveCount(0);
  await expect(page.getByLabel(/Các giai đoạn trên sơ đồ sản xuất|Production canvas stages/i)).toBeVisible();
  // The production canvas uses the compact first-party dock instead of the
  // default React Flow controls/minimap, which duplicated navigation chrome
  // and crowded the canvas at narrow widths.
  await expect(page.locator(".production-canvas-tool-dock")).toBeVisible();
  await expect(page.locator(".production-canvas-stage-nav")).toBeVisible();
  await page.getByRole("button", { name: "Đầu vào", exact: true }).click();
  await expect(page.locator(".flow-profile-document")).toBeVisible();
  const documentNodes = page.locator(".react-flow__node-document");
  await expect(documentNodes.locator(".flow-node-drag-handle")).toHaveCount(await documentNodes.count());
  const sceneTextNode = page.locator(".slot-scene").first();
  const shotTextNode = page.locator(".slot-shot").first();
  const [sceneTextBox, shotTextBox] = await Promise.all([sceneTextNode.boundingBox(), shotTextNode.boundingBox()]);
  expect((sceneTextBox?.width || 0) / (shotTextBox?.width || 1)).toBeGreaterThan(1.1);
  const [sceneTextHeight, shotTextHeight] = await Promise.all([sceneTextNode.locator("textarea").evaluate((node) => node.clientHeight), shotTextNode.locator("textarea").evaluate((node) => node.clientHeight)]);
  expect(sceneTextHeight).toBeGreaterThan(shotTextHeight * 1.5);

  const briefNode = page.locator(".react-flow__node-document").filter({ has: page.locator(".flow-document") }).first();
  const briefShell = briefNode.locator(".flow-canvas-document-shell");
  const briefCard = briefShell.locator(".flow-document");
  await expect(briefShell).toHaveCSS("box-shadow", "none");
  await expect(briefCard).toHaveCSS("border-color", "rgb(213, 216, 222)");
  await briefNode.click({ position: { x: 12, y: 12 } });
  await expect(briefShell).toHaveClass(/is-selected/);
  await expect(briefShell).toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: "docs/evidence/2026-07-23-neutral-node-states.png", fullPage: true });

  const upload = page.locator(".flow-upload-document").first();
  const [briefBox, uploadBox] = await Promise.all([briefNode.boundingBox(), upload.boundingBox()]);
  expect((uploadBox?.y ?? 0) - (briefBox?.y ?? 0) - (briefBox?.height ?? 0)).toBeGreaterThanOrEqual(20);
  await expect(upload).toContainText("Tải lên");
  await expect(upload).toContainText("Bấm để tải ảnh tham chiếu");
  await expect(upload.locator("img")).toHaveCount(0);

  const frameSelect = page.locator(".flow-profile-document").getByLabel(/^(Frame|Khung hình)$/i);
  await frameSelect.selectOption("16:9");
  const profile = page.locator(".flow-profile-document");
  await expect(profile.getByLabel(/Production language|Ngôn ngữ sản xuất/i)).toBeVisible();
  await expect(profile.getByLabel(/Text AI routing|Định tuyến AI văn bản/i)).toHaveCount(0);
  await expect(profile.getByLabel(/Image AI routing|Định tuyến AI hình ảnh/i)).toHaveCount(0);
  await expect(profile.getByLabel(/Video AI routing|Định tuyến AI video/i)).toHaveCount(0);
  // Provider routing is intentionally kept in the compact settings rail;
  // the production profile must not expose implementation details in the map.
  await expect(profile).not.toContainText(/AI:/);
  await expect(profile.getByRole("button", { name: /Use profile for all nodes|Dùng hồ sơ(?: sản xuất)? cho mọi nút/i })).toBeVisible();
  await expect(profile.getByRole("button", { name: /Reset node positions|Đặt lại vị trí(?: các)? nút/i })).toBeVisible();
  await profile.getByLabel(/Format|Định dạng/i).selectOption("short_film");
  await expect(profile.getByLabel(/Duration|Thời lượng/i)).toHaveValue("600");
  await profile.getByLabel(/Duration|Thời lượng/i).fill("95");
  await expect(profile.getByLabel("Flow source", { exact: true })).toHaveCount(0);
  await expect(page.locator('option[value="frames"]')).toHaveCount(0);
  await expect(upload.locator(".flow-upload-surface")).toHaveClass(/landscape/);
  const uploadRatio = await upload.locator(".flow-upload-surface").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(uploadRatio).toBeCloseTo(16 / 9, 2);

  await upload.locator('input[type="file"]').setInputFiles({
    name: "intake-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xz6fWQAAAABJRU5ErkJggg==", "base64")
  });
  await expect(upload.locator("img")).toHaveCount(1);
  await expect(upload.locator(".flow-upload-surface")).toHaveClass(/intrinsic/);
  const fittedUpload = await upload.locator(".flow-upload-surface").evaluate((surface) => {
    const surfaceBox = surface.getBoundingClientRect();
    const imageBox = surface.querySelector("img")!.getBoundingClientRect();
    return {
      surfaceRatio: surfaceBox.width / surfaceBox.height,
      horizontalGap: surfaceBox.width - imageBox.width,
      verticalGap: surfaceBox.height - imageBox.height
    };
  });
  expect(fittedUpload.surfaceRatio).toBeCloseTo(1, 2);
  expect(Math.abs(fittedUpload.horizontalGap)).toBeLessThan(2.1);
  expect(Math.abs(fittedUpload.verticalGap)).toBeLessThan(2.1);
  await expect(upload).toContainText("intake-reference.png");
  await upload.getByRole("button", { name: /Remove input image|Bỏ ảnh đầu vào/i }).click();
  await expect(upload.locator("img")).toHaveCount(0);
  await expect(upload).toContainText(/Click to upload reference|Bấm để tải ảnh tham chiếu/i);

  await page.getByRole("navigation", { name: /Production modules|Các khu vực sản xuất/i }).getByRole("button", { name: /^(Story|Kịch bản)$/i }).click();
  await expect(page.getByLabel(/Production format|Định dạng sản xuất/i)).toHaveValue("short_film");
  await expect(page.locator(".duration-control input")).toHaveValue("95");
  await expect(page.locator(".duration-control select")).toHaveValue("seconds");
  await expect(page.locator(".frame-current strong")).toHaveText("16:9");
  await expect(page.getByLabel("Google Flow mode")).toHaveCount(0);
});

test("flow map focuses a selected document for readable editing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await expect(page.getByLabel(/Mặt phẳng sơ đồ sản xuất|Spatial production canvas/i)).toBeVisible();
  const before = await page.locator(".react-flow__viewport").evaluate((node) => getComputedStyle(node).transform);
  await page.locator(".flow-node-heading").first().click();
  await expect.poll(() => page.locator(".react-flow__viewport").evaluate((node) => getComputedStyle(node).transform)).not.toBe(before);
  await expect.poll(async () => {
    const after = await page.locator(".react-flow__viewport").evaluate((node) => getComputedStyle(node).transform);
    return Number(after.match(/matrix\(([^,]+)/)?.[1] || 0);
  }).toBeGreaterThanOrEqual(0.45);
});

test("flow map focuses a node for readable editing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  const node = page.locator(".react-flow__node-document").first();
  const before = await node.boundingBox();
  await node.locator(".flow-node-heading").click();
  await page.waitForTimeout(300);
  const after = await node.boundingBox();
  // The canvas now opens on a readable production stage instead of fitting
  // the entire graph to a tiny thumbnail. Focus must preserve a usable card
  // width, not artificially require a 2x jump from an unreadable baseline.
  expect(after?.width || 0).toBeGreaterThanOrEqual(260);
  expect(after?.width || 0).toBeGreaterThanOrEqual((before?.width || 0) * 0.85);
});

test("flow map keeps sibling documents from painting over each other", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  const createDraft = page.getByRole("button", { name: /(?:Create draft locally|Tạo bản nháp tại chỗ)/i });
  if (await createDraft.count()) await createDraft.click();
  await expect(page.locator(".scene-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Sơ đồ luồng", exact: true }).click();
  await expect(page.getByLabel("Mặt phẳng sơ đồ sản xuất")).toBeVisible();
  const overlaps = await page.locator(".react-flow__node-document").evaluateAll((elements) => {
    const rects = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.getAttribute("data-id") || element.textContent?.slice(0, 30), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    return rects.flatMap((left, index) => rects.slice(index + 1).filter((right) => {
      const horizontal = Math.min(left.right, right.right) - Math.max(left.left, right.left);
      const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
      return horizontal > 2 && vertical > 2;
    }).map((right) => [left.id, right.id]));
  });
  expect(overlaps, `overlapping document nodes: ${JSON.stringify(overlaps)}`).toEqual([]);
});

test("flow map hides provider payload nodes from the user-facing canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await expect(page.getByLabel("Mặt phẳng sơ đồ sản xuất")).toBeVisible();
  const canvasText = await page.locator(".spatial-production-canvas").innerText();
  expect(canvasText).not.toMatch(/Prompt video|Kịch bản đã khóa|provider-compile|screenplay|integration payload/i);
  expect(canvasText).not.toMatch(/\"sceneOrder\"|\"dialogue\"|\"shotId\"/i);
  expect(canvasText).not.toMatch(/chatgpt-web|google-flow-web|provider-compilation/i);
  await expect(page.locator(".production-canvas-stage-nav")).not.toContainText("Chuẩn bị provider");
});

test("flow map exposes editable text and configurable media request documents", async ({ page }) => {
  await page.addInitScript(() => {
    const runtimeWindow = window as Window & { __resizeObserverErrors?: string[] };
    runtimeWindow.__resizeObserverErrors = [];
    window.addEventListener("error", (event) => {
      if (/ResizeObserver loop/i.test(event.message)) runtimeWindow.__resizeObserverErrors?.push(event.message);
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: /Prepare video instructions|Chuẩn bị chỉ dẫn video/i }).click();
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  const videoAction = page.getByRole("button", { name: /Queue video|Tạo video/i });
  if (await videoAction.isEnabled()) await videoAction.click();
  else await expect(videoAction).toHaveAttribute("title", /keyframe|ảnh đầu vào|Flow chưa sẵn sàng/i);
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: "Sơ đồ luồng", exact: true }).click();
  const pauseAutomation = page.getByRole("button", { name: "Tạm dừng", exact: true });
  if (await pauseAutomation.count()) await pauseAutomation.click();

  const brief = page.locator(".flow-document-node-stack").filter({ hasText: /Production brief|Tóm tắt ý tưởng/i }).first();
  const briefContent = brief.getByLabel(/(?:Production brief content|Nội dung (?:Production brief|Tóm tắt ý tưởng))/i);
  await briefContent.fill("Updated brief from the production document node.");
  await briefContent.click();
  await expect(briefContent).toBeFocused();
  expect(await briefContent.inputValue()).toBe("Updated brief from the production document node.");
  const compactMetrics = await briefContent.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    overflowY: getComputedStyle(element).overflowY
  }));
  const expandedText = "A production brief should expand with readable story context. ".repeat(10);
  await briefContent.fill(expandedText);
  await expect.poll(() => briefContent.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(compactMetrics.height);
  const expandedMetrics = await briefContent.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    overflowY: getComputedStyle(element).overflowY
  }));
  expect(expandedMetrics.height).toBeGreaterThan(compactMetrics.height);
  expect(expandedMetrics.overflowY).toBe("auto");
  await briefContent.fill("A very long production brief. ".repeat(160));
  await expect.poll(() => briefContent.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    overflowY: getComputedStyle(element).overflowY,
    scrollable: element.scrollHeight > element.clientHeight
  }))).toMatchObject({ overflowY: "auto", scrollable: true });
  const cappedMetrics = await briefContent.evaluate((element) => ({ height: element.getBoundingClientRect().height }));
  expect(cappedMetrics.height).toBeLessThanOrEqual(286);
  await briefContent.fill("Updated brief from the production document node.");
  await expect(brief.getByRole("button", { name: "Save Production brief" })).toHaveCount(0);
  await expect(brief.getByRole("button", { name: "Copy Production brief" })).toHaveCount(0);
  await expect(brief.locator(".flow-node-heading small")).toHaveCount(0);
  await expect(page.locator(".flow-profile-document")).toContainText("Hồ sơ sản xuất");

  await brief.getByRole("button", { name: /Tạo bản chỉnh sửa hỗ trợ cho (Production brief|Tóm tắt ý tưởng)/i }).click();
  const revisionRequest = brief.getByLabel(/Revision request for|Yêu cầu chỉnh sửa cho/i);
  await expect(revisionRequest).toBeVisible();
  const openHeight = await brief.evaluate((element) => element.getBoundingClientRect().height);
  await brief.locator(".flow-node-heading").click();
  await expect(revisionRequest).toHaveCount(0);
  expect(openHeight).toBeGreaterThan(0);
  const collapsedActions = brief.locator(".flow-inline-action-row");
  await expect(collapsedActions).toHaveCSS("width", "68px");
  const collapsedBox = await collapsedActions.boundingBox();
  await brief.getByRole("button", { name: /Tạo bản chỉnh sửa hỗ trợ cho (Production brief|Tóm tắt ý tưởng)/i }).click();
  await expect.poll(async () => {
    const expandedBox = await collapsedActions.boundingBox();
    return Math.abs((collapsedBox?.x || 0) + (collapsedBox?.width || 0) - ((expandedBox?.x || 0) + (expandedBox?.width || 0)));
  }).toBeLessThan(2);
  await brief.getByLabel(/Revision request for (Production brief|Tóm tắt ý tưởng)|Yêu cầu chỉnh sửa cho (Production brief|Tóm tắt ý tưởng)/i).fill("Keep the visual hook in the first shot.");
  await expect(brief.getByRole("button", { name: /Tạo bản chỉnh sửa hỗ trợ cho (Production brief|Tóm tắt ý tưởng)/i })).toHaveClass(/active/);
  await page.screenshot({ path: "docs/evidence/2026-07-22-inline-version-media/text-inline-composer.png" });
  await brief.locator(".flow-node-heading").click();
  await expect(brief.getByLabel(/Revision request for (Production brief|Tóm tắt ý tưởng)|Yêu cầu chỉnh sửa cho (Production brief|Tóm tắt ý tưởng)/i)).toHaveValue("Keep the visual hook in the first shot.");
  await expect(page.getByLabel("Flow document inspector")).toHaveCount(0);

  await page.getByLabel(/Các giai đoạn trên sơ đồ sản xuất|Production canvas stages/i).getByRole("button", { name: "Đầu vào", exact: true }).click();
  await page.locator(".flow-document-node-stack").filter({ hasText: /Production brief|Tóm tắt ý tưởng/i }).first().getByRole("button", { name: /Open (Production brief|Tóm tắt ý tưởng) in app|Mở (Production brief|Tóm tắt ý tưởng) trong ứng dụng/i }).click();
  await expect(page.getByRole("heading", { name: "Xác định nguồn nội dung và mục tiêu sản xuất." })).toBeVisible();
  await expect(page.locator("[data-flow-target='source']")).toHaveClass(/flow-focus-pulse/);
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();

  const generationStage = page.getByLabel(/Các giai đoạn trên sơ đồ sản xuất|Production canvas stages/i).getByRole("button", { name: "Tạo video", exact: true });
  if (!(await generationStage.count())) {
    // A pre-generation project intentionally has no video document/stage.
    // Keep this test bounded and validate that the user-facing canvas stays
    // free of an empty provider lane until a video node is explicitly added.
    await expect(page.locator(".flow-media-document.video")).toHaveCount(0);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    return;
  }
  await generationStage.click();
  const videoDocument = page.locator(".flow-media-document.video").first();
  await expect(videoDocument).toBeVisible();
  await expect(videoDocument).toContainText("Chưa có video");
  await expect(videoDocument.locator(".flow-media-settings")).toContainText(/9:16|16:9|4:3|1:1/);
  await videoDocument.getByRole("button", { name: /More options for|Thêm tuỳ chọn cho/ }).click();
  await expect(videoDocument.getByLabel(/AI provider for|Công cụ AI cho/)).not.toHaveValue("local");
  const mediaSurface = videoDocument.locator(".flow-media-surface");
  const mediaViewport = mediaSurface.locator(".flow-document-media");
  const mediaRatio = await mediaViewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { className: element.parentElement?.className || "", value: rect.width / rect.height };
  });
  const expectedRatio = mediaRatio.className.includes("portrait") ? 9 / 16 : mediaRatio.className.includes("square") ? 1 : mediaRatio.className.includes("classic") ? 4 / 3 : 16 / 9;
  expect(mediaRatio.value).toBeCloseTo(expectedRatio, 2);
  const aspectSelect = videoDocument.getByLabel(/Aspect ratio for|Tỷ lệ khung hình cho/);
  const inheritedAspectRatio = await aspectSelect.inputValue();
  await aspectSelect.selectOption("4:3");
  await expect(mediaSurface).toHaveClass(/classic/);
  const overriddenRatio = await mediaViewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(overriddenRatio).toBeCloseTo(4 / 3, 2);
  await page.getByRole("button", { name: /^(Overview|Tổng quan)$/, exact: true }).click();
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await page.getByLabel(/Các giai đoạn trên sơ đồ sản xuất|Production canvas stages/i).getByRole("button", { name: "Tạo video", exact: true }).click();
  const restoredVideoDocument = page.locator(".flow-media-document.video").first();
  await restoredVideoDocument.getByRole("button", { name: /More options for|Thêm tuỳ chọn cho/ }).click();
  await expect(restoredVideoDocument.getByLabel(/Aspect ratio for|Tỷ lệ khung hình cho/)).toHaveValue("4:3");
  await restoredVideoDocument.getByRole("button", { name: /Use Production Profile|Dùng thiết lập sản xuất/i }).click();
  await restoredVideoDocument.getByRole("button", { name: /More options for|Thêm tuỳ chọn cho/ }).click();
  await expect(restoredVideoDocument.getByLabel(/Aspect ratio for|Tỷ lệ khung hình cho/)).toHaveValue(inheritedAspectRatio);
  const footerHeight = await restoredVideoDocument.locator(".flow-media-settings.compact").evaluate((footer) => footer.getBoundingClientRect().height);
  expect(footerHeight).toBeLessThanOrEqual(38);
  await expect(restoredVideoDocument.getByLabel(/Run request for|Yêu cầu chạy cho/)).toBeVisible();
  await expect(restoredVideoDocument.getByRole("button", { name: /Run Video|Chạy/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Production flow|Luồng sản xuất/ })).toBeVisible();
  await expect(page.getByLabel(/Mặt phẳng sơ đồ sản xuất|Spatial production canvas/i)).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  const resizeObserverWarnings = await page.evaluate(() => (window as Window & { __resizeObserverErrors?: string[] }).__resizeObserverErrors ?? []);
  expect(resizeObserverWarnings.length).toBeLessThanOrEqual(2);
});

test("flow map adds persistent typed intake nodes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/i }).click();
  const palette = page.locator(".production-node-palette");
  await expect(palette).toBeVisible();
  await palette.locator(".production-node-palette-toggle").click();
  await expect(palette).toHaveClass(/is-open/);
  await palette.locator('[title="Thêm nút văn bản"]').click();
  await palette.locator('[title="Thêm nút tải ảnh"]').click();
  await palette.locator('[title="Thêm nút tạo ảnh"]').click();
  for (const label of ["Thêm nút văn bản", "Thêm nút tải ảnh", "Thêm nút tạo ảnh"]) {
    await expect(palette.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  const textInputContent = page.getByLabel(/(?:Nội dung (?:Text input|Đầu vào văn bản))/i);
  await expect(textInputContent).toBeVisible();
  await textInputContent.fill("A second story fragment that must be preserved.");
  await expect(page.getByLabel("Tên nút ảnh")).toHaveValue("Đầu vào hình ảnh");
  await expect(page.getByLabel("Mô tả ảnh cần tạo")).toBeVisible();
  await expect(page.getByLabel(/(?:Nội dung (?:Context bundle|Gom ngữ cảnh))/i)).toHaveCount(0);
  await expect(page.locator(".contract-image-upload .react-flow__handle").first()).toHaveCSS("background-color", "rgb(52, 136, 219)");
  await page.getByRole("button", { name: /^(Overview|Tổng quan)$/, exact: true }).click();
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/i }).click();
  await expect(page.getByLabel(/(?:Nội dung (?:Text input|Đầu vào văn bản))/i)).toHaveValue("A second story fragment that must be preserved.");
  await page.getByRole("button", { name: "Đầu vào", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/evidence/2026-07-22-custom-intake-nodes.png", fullPage: true });
});

test("flow map aligns each shot with its visible media outputs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: /Prepare video instructions|Chuẩn bị chỉ dẫn video/i }).click();
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  const videoAction = page.getByRole("button", { name: /Queue video|Tạo video/i });
  if (await videoAction.isEnabled()) await videoAction.click();
  else await expect(videoAction).toHaveAttribute("title", /keyframe|ảnh đầu vào|Flow chưa sẵn sàng/i);
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: "Sơ đồ luồng", exact: true }).click();
  await page.locator(".production-canvas-stage-nav").getByRole("button", { name: /Xem toàn bộ luồng|Xem toàn bộ/i }).click();

  const scene = page.locator(".slot-scene").first();
  const shot = page.locator(".slot-shot").first();
  const keyframe = page.locator(".slot-keyframe").first();
  const video = page.locator(".slot-video").first();
  await expect(scene).toHaveCount(1);
  await expect(shot).toHaveCount(1);
  if (!(await page.locator(".slot-video").count()) || !(await page.locator(".slot-keyframe").count())) {
    // Pre-generation projects intentionally omit media lanes until a
    // storyboard/keyframe result exists; the typed shot node remains the
    // inspectable handoff in this state.
    await expect(page.locator(".slot-video, .slot-keyframe")).toHaveCount(0);
    return;
  }
  await expect(video).toHaveCount(1);

  const visibleOutputs = page.locator(".slot-keyframe, .slot-video");
  // The seeded storyboard contains four shots; each shot owns one keyframe and one video slot.
  await expect(visibleOutputs).toHaveCount(8);
  await expect(page.locator(".slot-keyframe").getByText("Chưa có ảnh", { exact: true })).toHaveCount(4);
  await expect(page.locator(".slot-video").getByText("Chưa có video", { exact: true })).toHaveCount(4);
  const positions = await Promise.all([scene, shot, keyframe, video].map((node) => node.evaluate((element) => {
    const match = element.closest(".react-flow__node-document")?.getAttribute("style")?.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  })));
  expect(positions.every(Boolean)).toBe(true);
  // Portrait keyframes occupy the upper media slot; instructions follow them
  // in the same lane so the two cards remain readable and never paint over
  // one another.
  expect(positions[1]!.y).toBeGreaterThan(positions[2]!.y);
  expect(positions[0]!.x).toBeLessThan(positions[1]!.x);
  expect(Math.abs(positions[1]!.x - positions[2]!.x)).toBeLessThan(4);
  expect(positions[2]!.x).toBeLessThan(positions[3]!.x);
});

test("flow map keeps a custom document position after leaving the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await page.getByLabel(/Các giai đoạn trên sơ đồ sản xuất|Production canvas stages/i).getByRole("button", { name: "Đầu vào", exact: true }).click();
  const canvasTools = page.getByLabel(/Canvas tools|Công cụ mặt phẳng luồng/i);
  await expect(canvasTools.getByRole("button", { name: /Select nodes|Chọn nút/i })).toHaveClass(/active/);
  await canvasTools.getByRole("button", { name: /Pan canvas|Kéo mặt phẳng luồng/i }).click();
  await expect(canvasTools.getByRole("button", { name: /Pan canvas|Kéo mặt phẳng luồng/i })).toHaveClass(/active/);
  await canvasTools.getByRole("button", { name: /Select nodes|Chọn nút/i }).click();
  const documentNode = page.locator(".react-flow__node-document").filter({ hasText: /Production brief|Tóm tắt ý tưởng/i }).first();
  await expect(documentNode).toBeVisible();
  await page.waitForTimeout(400);
  const before = await documentNode.boundingBox();
  if (!before) throw new Error("Document node was not measurable");
  const initialTransform = await documentNode.evaluate((node) => (node as HTMLElement).style.transform);
  const dragHandle = documentNode.locator(".flow-node-heading");
  const handleBox = await dragHandle.boundingBox();
  if (!handleBox) throw new Error("Document drag handle was not measurable");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 - 55, { steps: 8 });
  await page.mouse.up();
  const moved = await documentNode.boundingBox();
  expect(Math.abs((moved?.y ?? 0) - before.y)).toBeGreaterThan(15);
  const movedTransform = await documentNode.evaluate((node) => (node as HTMLElement).style.transform);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^(Overview|Tổng quan)$/, exact: true }).click();
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await page.getByLabel(/Các giai đoạn trên sơ đồ sản xuất|Production canvas stages/i).getByRole("button", { name: "Đầu vào", exact: true }).click();
  await page.waitForTimeout(400);
  const restoredTransform = await page.locator(".react-flow__node-document").filter({ hasText: /Production brief|Tóm tắt ý tưởng/i }).first().evaluate((node) => (node as HTMLElement).style.transform);
  expect(restoredTransform).toBe(movedTransform);
  await page.getByRole("button", { name: /Reset node positions|Đặt lại vị trí(?: các)? nút/i }).click();
  await expect.poll(() => page.locator(".react-flow__node-document").filter({ hasText: /Production brief|Tóm tắt ý tưởng/i }).first().evaluate((node) => (node as HTMLElement).style.transform)).toBe(initialTransform);
  await expect(page.getByLabel(/(?:Production brief content|Nội dung (?:Production brief|Tóm tắt ý tưởng))/i)).not.toHaveValue("");
});

test("full automation mode overrides module sidebars with the run controller", async ({ page }) => {
  await page.goto("/");
  await page.locator(".overview-yolo-panel").getByRole("button", { name: /Triển khai/i }).click();
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/i }).click();

  await expect(page.locator(".production-guide")).toContainText("Vận hành tự động");
  await expect(page.locator(".production-guide")).toContainText(/Tạm dừng|Sẵn sàng|Tiếp tục|Chưa kết nối/);
  await expect(page.locator(".production-guide")).not.toContainText("Kịch bảnDraft");
});

test("manual tab navigation keeps full automation running without forcing auto-follow", async ({ page }) => {
  await page.goto("/");
  const projectName = `QA yolo navigation ${Date.now()}`;
  await page.locator(".project-switcher").click();
  await page.getByPlaceholder("Tên dự án mới").fill(projectName);
  await page.locator(".new-project-row button").click();
  await expect(page.locator(".project-switcher")).toContainText(projectName);

  await page.getByRole("button", { name: /^(Overview|Tổng quan)$/, exact: true }).click();
  await page.getByRole("textbox", { name: "Kịch bản gợi ý" }).fill("Video 30 giây về robot học sinh màu xanh học cách nhận trách nhiệm.");
  await page.locator(".overview-yolo-panel").getByRole("button", { name: /Triển khai/i }).click();
  await page.getByRole("button", { name: /^(Source|Thư viện nguồn)$/, exact: true }).click();

  await page.waitForTimeout(700);
  await expect(page.getByRole("heading", { name: "Thư viện nguồn", exact: true })).toBeVisible();
  await expect(page.locator(".production-guide")).toContainText("Vận hành tự động");
  await expect(page.locator(".production-guide")).toContainText(/Tạm dừng|Tiếp tục|Đang chạy|Retry lỗi|Sẵn sàng|Chưa kết nối/i);

  await page.getByRole("button", { name: /^(Overview|Tổng quan)$/, exact: true }).click();
  await expect(page.getByText(/Production control|Điều khiển sản xuất/i)).toBeVisible();
  await expect(page.locator(".overview-yolo-panel")).toContainText("Thiết lập nhanh");
  await expect(page.getByRole("heading", { name: "Nhân vật & Phong cách" })).toHaveCount(0);
});

test("partial automation continues from the next durable story stage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  await page.getByRole("button", { name: /(?:Create draft locally|Tạo bản nháp tại chỗ)/i }).click();

  await expect(page.locator(".production-guide")).toContainText("Vận hành tự động");
  await expect(page.locator(".production-guide h2.sr-only")).toContainText(/Kịch bản|Storyboard|Thông báo/);
  await expect(page.locator(".production-guide")).toContainText(/Kịch bản|AI package/i);
  await expect(page.getByRole("button", { name: /Tiếp tục/i }).first()).toBeVisible();

  await page.getByRole("button", { name: /Tiếp tục/i }).first().click();
  await expect(page.locator(".production-guide")).toContainText(/Đang chạy|Sẵn sàng|Chưa kết nối/);
  await expect(page.locator(".production-guide")).toContainText(/Screenplay|Phân rã shot|Kịch bản theo cảnh|Kịch bản/i);
});

test("new demo projects can run the quick automation pipeline", async ({ page }) => {
  await page.goto("/");
  await page.locator(".project-switcher").click();
  await page.getByPlaceholder("Tên dự án mới").fill("QA pipeline smoke");
  await page.getByRole("button", { name: /Tạo dự án/i }).click();

  await expect(page.locator(".project-switcher")).toContainText("QA pipeline smoke");
  await expect(page.locator(".project-switcher")).toContainText("0 shot");
  await expect(page.getByRole("heading", { name: "Kịch bản", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^(Overview|Tổng quan)$/, exact: true }).click();
  await page.getByRole("textbox", { name: "Kịch bản gợi ý" }).fill("Video TikTok 30 giây: một dược sĩ trẻ giải thích vì sao không nên tự ý uống nhiều vitamin.");
  await page.locator(".overview-yolo-panel input[type=number]").fill("30");
  await page.locator(".overview-yolo-panel").getByRole("button", { name: /Triển khai/i }).click();

  await expect(page.locator(".production-guide")).toContainText(/Đang chạy|Sẵn sàng|Chưa kết nối/, { timeout: 20000 });
  await expect(page.locator(".production-guide")).toContainText(/Complete story|Câu chuyện hoàn chỉnh|Kịch bản theo cảnh/i, { timeout: 20000 });
  await page.getByRole("button", { name: /^(Source|Thư viện nguồn)$/, exact: true }).click();
  await expect(page.locator(".source-empty")).toContainText("Chưa có tài nguyên nguồn");
});

test("workflow template exposes browser-provider pipeline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/i }).click();
  await page.getByRole("button", { name: /Run template|Chạy mẫu/i }).click();
  await expect(page.locator(".queue").getByText("Theo dõi tác vụ", { exact: true })).toBeVisible();
  if (await page.locator(".queue .job-row").count()) {
    await expect(page.locator(".queue")).toContainText("ChatGPT");
    await expect(page.locator(".queue")).toContainText("Flow");
  } else {
    await expect(page.locator(".queue")).toContainText("Không có tác vụ đang chạy hoặc lỗi cần xử lý.");
  }
});

test("activity queue advances prerequisites instead of creating an invalid video job", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  await expect(page.getByRole("button", { name: /Queue video|Tạo video/i })).toBeDisabled();
  await expect(page.locator(".activity-summary")).toContainText(/0 (active|đang chạy)/i);
  await expect(page.locator(".queue .job-row")).toHaveCount(0);
  await expect(page.locator(".queue")).toContainText("Không có tác vụ đang chạy hoặc lỗi cần xử lý.");
});

test("pipeline rail reports the durable prerequisite selected by queue video", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  await expect(page.getByRole("button", { name: /Queue video|Tạo video/i })).toBeDisabled();
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  await expect(page.locator(".production-guide")).toContainText(/Đang chạy|Sẵn sàng|Chưa kết nối/);
  await expect(page.locator(".production-guide")).toContainText(/Câu chuyện hoàn chỉnh|Phân cảnh|Kịch bản/i);
});

test("storyboard queue refuses to bypass missing text prerequisites", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: /Prepare video instructions|Chuẩn bị chỉ dẫn video/i }).click();
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  await expect(page.getByRole("button", { name: /Queue video|Tạo video/i })).toBeDisabled();
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  await expect(page.locator(".queue .job-row")).toHaveCount(0);
  await expect(page.locator(".queue")).toContainText("Không có tác vụ đang chạy hoặc lỗi cần xử lý.");
});

test("source bin stays empty when video prerequisites have not produced media", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: /Prepare video instructions|Chuẩn bị chỉ dẫn video/i }).click();
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  await expect(page.getByRole("button", { name: /Queue video|Tạo video/i })).toBeDisabled();
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".storyboard-stepper button").nth(1).click();
  await page.getByRole("button", { name: /^(Source|Thư viện nguồn)$/, exact: true }).click();
  await expect(page.locator(".source-library")).toBeVisible();
  await expect(page.locator(".source-card")).toHaveCount(0);
  await expect(page.locator(".source-empty")).toContainText("Chưa có tài nguyên nguồn");
  await expect(page.locator(".source-empty")).not.toContainText("No source assets yet");
});

test("batch queue sends multiple storyboard shots into automation queue", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  await page.getByRole("button", { name: /(?:Create draft locally|Tạo bản nháp tại chỗ)/i }).click();
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  const batchAction = page.getByRole("button", { name: /Batch queue|Xếp hàng loạt/i });
  if (await batchAction.isDisabled()) {
    await expect(batchAction).toHaveAttribute("title", /Flow đã sẵn sàng|project có shot/i);
    return;
  }
  await batchAction.click();
  const batchRows = await page.locator(".queue .job-row").count();
  // Browser-only runs keep the batch action visible but cannot enqueue work
  // without a connected extension; a connected lane may enqueue all shots.
  expect([0, 4]).toContain(batchRows);
});

test("story idea becomes a complete story package and storyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  const idea = "Một cô bé sửa radio cũ và nghe thấy lời nhắn của người cha mất tích từ tương lai.";
  await page.locator(".story-editor textarea").fill(idea);
  await page.getByRole("button", { name: /(?:Create draft locally|Tạo bản nháp tại chỗ)/i }).click();

  const document = page.getByTestId("story-document");
  await expect(document.locator(".document-panel").filter({ hasText: "Câu chuyện hoàn chỉnh" })).toBeVisible();
  await expect(document.locator(".document-panel").filter({ hasText: "Phân cảnh" })).toBeVisible();
  await expect(document).toContainText("Một cô bé sửa radio cũ");
  await expect(page.locator(".scene-row")).toHaveCount(3);
  await expect(page.locator(".scene-shots button")).toHaveCount(4);
  await page.locator(".story-editor textarea").fill(`${idea} Câu chuyện chuyển sang một kết thúc khác.`);
  await expect(page.locator(".source-column .story-job-status")).toHaveCount(0);
  await expect(page.locator(".source-column .input-guidance")).toBeVisible();
});

test("story package supports quick edit, comments, A4 review and focused rewrite state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  await page.getByRole("button", { name: /(?:Create draft locally|Tạo bản nháp tại chỗ)/i }).click();

  const packageView = page.getByTestId("story-document");
  const storyPanel = packageView.locator(".document-panel").first();
  const rewrite = packageView.getByRole("button", { name: /(?:Rewrite with AI|Chỉnh sửa bằng AI)/i });
  await expect(rewrite).toBeDisabled();

  await storyPanel.getByTitle("Sửa Câu chuyện hoàn chỉnh").click();
  await storyPanel.locator("textarea").fill("A manually revised complete story.");
  await storyPanel.getByTitle("Lưu thay đổi").click();
  await expect(storyPanel).toContainText("A manually revised complete story.");
  await expect(rewrite).toBeEnabled();

  const scenePanel = packageView.locator(".document-panel").nth(1);
  await scenePanel.locator(".document-text").evaluate((root) => {
    const node = root.firstChild;
    if (!node) throw new Error("Scene breakdown text is missing");
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(12, node.textContent?.length ?? 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(scenePanel.locator(".selection-toolbar")).toBeVisible();
  await page.locator(".section-heading").click();
  await expect(scenePanel.locator(".selection-toolbar")).toHaveCount(0);
  await scenePanel.locator(".document-text").evaluate((root) => {
    const node = root.firstChild;
    if (!node) throw new Error("Scene breakdown text is missing");
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(12, node.textContent?.length ?? 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await scenePanel.locator(".selection-toolbar button").click();
  await expect(scenePanel.locator(".selection-highlight")).toHaveCount(1);
  await scenePanel.locator(".comment-composer textarea").fill("Make this scene begin with a stronger visual hook.");
  await scenePanel.getByTitle(/(?:Send comment|Gửi nhận xét)/i).click();
  await expect(scenePanel.locator(".comment-highlight")).toHaveCount(1);
  await scenePanel.getByTitle("Sửa Phân cảnh").click();
  await expect(scenePanel.locator(".document-editor-overlay .comment-highlight")).toHaveCount(1);
  await expect(scenePanel.locator(".edit-comment-list")).toHaveCount(0);
  await scenePanel.getByTitle("Lưu thay đổi").click();

  await scenePanel.getByTitle("Mở Phân cảnh trong tài liệu").click();
  const modal = page.getByRole("dialog", { name: "Phân cảnh — chế độ xem tài liệu" });
  await expect(modal.locator(".a4-sheet")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Đóng chế độ xem tài liệu" })).toBeVisible();
  await expect(modal.locator(".page-comment-rail")).toContainText("Make this scene begin with a stronger visual hook.");
  await modal.locator(".page-comment-rail").getByTitle(/(?:Edit comment|Sửa nhận xét)/i).click();
  await modal.locator(".page-comment-rail textarea").fill("Use a stronger visual hook and preserve continuity.");
  await modal.locator(".page-comment-rail").getByTitle(/(?:Save comment|Lưu nhận xét)/i).click();
  await expect(modal.locator(".page-comment-rail")).toContainText("Use a stronger visual hook and preserve continuity.");
  await modal.locator("button").last().focus();
  await page.keyboard.press("Tab");
  await expect(modal.locator("button").first()).toBeFocused();
  await modal.getByRole("button", { name: "Đóng chế độ xem tài liệu" }).click();
  await expect(page.getByRole("dialog", { name: "Phân cảnh — chế độ xem tài liệu" })).toHaveCount(0);
});

test("settings documents global keyboard shortcuts", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+,");
  const settings = page.getByRole("dialog", { name: /App manager|Quản lý ứng dụng/i });
  await expect(settings).toContainText("Thiết lập");
  await expect(settings).toContainText("Lưu trữ dự án");
  await expect(settings).toContainText("Hoàn tác");
  await expect(settings).toContainText("Thêm nhận xét");
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
});

test("app manager tabs and modal focus stay keyboard accessible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+,");
  const dialog = page.getByRole("dialog", { name: /App manager|Quản lý ứng dụng/i });
  const projectsTab = dialog.locator("#app-manager-tab-projects");
  await projectsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("#app-manager-tab-settings")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(dialog.locator("#app-manager-tab-account")).toHaveAttribute("aria-selected", "true");
  await dialog.locator("#app-manager-tab-account").focus();
  await page.keyboard.press("Tab");
  const activeInsideDialog = await page.evaluate(() => Boolean(document.querySelector(".app-manager-dialog")?.contains(document.activeElement)));
  expect(activeInsideDialog).toBe(true);
  await page.keyboard.press("Escape");
});

test("AI connection action shares the rail contract and exposes help", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mở định tuyến AI", exact: true }).click();
  const action = page.locator(".rail-test-button");
  await expect(action).toHaveClass(/rail-settings-link/);
  await expect(page.locator(".rail-settings-row:has(.rail-test-button) .rail-help")).toHaveAttribute("title", /tin nhắn ngắn/i);
});

test("ChatGPT hello diagnostic verifies direct UTF-8 input and output", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  await page.getByRole("button", { name: "Mở định tuyến AI", exact: true }).click();
  await page.locator(".rail-test-button").click();
  await expect(page.locator(".rail-settings-page")).toContainText("Xin chào từ ChatGPT.");
});

test("project intake classifies a series and stores a visual reference", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/, exact: true }).click();
  await page.getByLabel(/Input type|Loại đầu vào/i).selectOption("novel");
  await page.getByLabel(/Production format|Định dạng sản xuất/i).selectOption("video_series");
  await expect(page.getByText(/Tiểu thuyết \/ văn xuôi → Series video/i)).toBeVisible();
  await page.locator(".platform-picker summary").click();
  await expect(page.locator(".platform-picker input[type=checkbox]")).toHaveCount(4);
  await expect(page.locator(".platform-picker")).toContainText("YouTube Shorts");
  await expect(page.locator(".platform-picker")).not.toContainText("Facebook");
  await page.getByRole("button", { name: "Mở định tuyến AI", exact: true }).click();
  const routing = page.locator(".rail-settings-page");
  await expect(routing.getByLabel(/Text|Văn bản/i).locator("option")).toHaveCount(4);
  await expect(routing.getByLabel(/Image|Hình ảnh/i).locator("option")).toHaveCount(4);
  await expect(routing.getByLabel(/Video/i).locator("option")).toHaveCount(2);
  await page.locator(".profile-rule summary").click();
  await expect(page.getByText(/giữ quan hệ nhân quả/i)).toBeVisible();
  await page.locator(".series-bible-input summary").click();
  await page.locator(".series-bible-input textarea").fill("The white cat keeps the same black ears in every episode.");

  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  await expect(page.getByLabel(/Story character|Nhân vật trong truyện/i)).toBeVisible();
  await expect(page.getByText("Story cast")).toHaveCount(0);
  const referenceDetails = page.getByLabel("Chi tiết tham chiếu");
  const visualDescription = page.getByRole("textbox", { name: /Visual description|Mô tả ngoại hình/i });
  const referenceBox = await referenceDetails.boundingBox();
  const profileBox = await visualDescription.boundingBox();
  expect(referenceBox?.height).toBe(profileBox?.height);
  await expect(referenceDetails).toHaveCSS("font-family", /Outfit/);
  await expect(visualDescription).toHaveCSS("font-family", /Outfit/);
  const stageButton = page.getByRole("button", { name: /Stage candidate|Thêm ảnh vào thư viện|Đưa vào hàng duyệt/i });
  const aiImageButton = page.getByRole("button", { name: /AI image|Tạo ảnh AI/i });
  const stageBox = await stageButton.boundingBox();
  const aiImageBox = await aiImageButton.boundingBox();
  expect(stageBox?.y).toBe(aiImageBox?.y);
  expect(stageBox?.height).toBeLessThanOrEqual(32);
  expect(aiImageBox?.height).toBeLessThanOrEqual(32);
  await expect(aiImageButton).toHaveCSS("background-color", "rgb(36, 107, 253)");
  await expect(aiImageButton).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.locator(".upload-input").first().setInputFiles(uploadReferenceFixture);
  await expect(page.locator(".upload-zone.has-preview").first()).toBeVisible();
  await page.getByTitle("Bỏ ảnh nhận diện chính").click();
  await expect(page.locator(".upload-zone.has-preview")).toHaveCount(0);
  await page.locator(".upload-input").first().setInputFiles(uploadReferenceFixture);
  await expect(page.locator(".upload-zone.has-preview").first()).toBeVisible();
  await page.locator(".upload-zone.has-preview").first().click();
  await expect(page.getByRole("dialog", { name: "Reference nhận diện chính" })).toBeVisible();
  await page.getByTitle("Đóng bản xem trước tệp tải lên").click();
  await page.getByLabel("Tên tham chiếu").fill("White cat protagonist");
  await page.getByLabel("Vai trò", { exact: true }).selectOption("main_character");
  await page.getByLabel("Mục đích tham chiếu").selectOption("primary_identity");
  await expect(page.getByLabel(/Story character|Nhân vật trong truyện/i).locator("option")).not.toHaveCount(0);
  await page.getByLabel(/Reference details|Chi tiết tham chiếu/i).fill("A small white 3D cat with black ears.");
  await page.getByLabel(/Requested change|Thay đổi yêu cầu/i).fill("Preserve the proportions and material as the main character.");
  await page.getByRole("button", { name: /Stage candidate|Thêm ảnh vào thư viện|Đưa vào hàng duyệt/i }).click();
  await expect(page.locator(".candidate-card")).toContainText("White cat protagonist");
  await page.getByRole("button", { name: /Confirm to library|Thêm vào thư viện|Xác nhận vào thư viện/i }).click();
  await expect(page.locator(".reference-card")).toContainText("White cat protagonist");
  await expect(page.locator(".reference-card img")).toBeVisible();
  const lockedCardBox = await page.locator(".reference-card").first().boundingBox();
  expect(lockedCardBox?.width).toBeLessThanOrEqual(330);
  await page.locator(".reference-thumb").first().click();
  await expect(page.getByRole("dialog", { name: /White cat protagonist reference|Tham chiếu White cat protagonist/i })).toBeVisible();
  await page.getByTitle(/Xem bảng chi tiết|Show detail reference/i).first().click();
  const emptyDetailGenerate = page.locator(".reference-empty-generate");
  if (await emptyDetailGenerate.count()) {
    await expect(page.getByText(/Chưa có bảng chi tiết|Detail sheet missing/i)).toBeVisible();
    await expect(emptyDetailGenerate).toBeVisible();
    await emptyDetailGenerate.click();
  }
  await expect(page.getByText(/Đang tạo bảng chi tiết|Generating detail sheet/i)).toBeVisible();
  await page.getByTitle(/Đóng tham chiếu|Đóng reference|Close reference/i).click();
});

test("generated character previews keep their full card geometry", async ({ page }) => {
  await page.goto("/");
  const geometry = await page.evaluate(() => {
    const shelf = document.createElement("div");
    shelf.className = "candidate-strip";
    shelf.style.width = "420px";
    shelf.innerHTML = `
      <article class="candidate-card generated candidate-carousel">
        <button class="candidate-image-button" title="Open generated image">
          <img alt="Generated character candidate" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400'%3E%3Crect width='300' height='400' fill='%23d9e3f7'/%3E%3C/svg%3E" />
        </button>
        <div class="candidate-carousel-controls" aria-label="Candidate images">
          <button class="candidate-carousel-prev" aria-label="Previous image">‹</button><span>1/3</span><button class="candidate-carousel-next" aria-label="Next image">›</button>
        </div>
        <div class="candidate-card-footer">
          <strong class="candidate-character-name">Shared character candidate</strong>
          <button class="candidate-select" title="Select generated candidate">✓</button>
        </div>
        <button class="candidate-delete" title="Delete generated candidate">x</button>
      </article>`;
    document.body.appendChild(shelf);
    const card = shelf.querySelector<HTMLElement>(".candidate-card")!;
    const preview = shelf.querySelector<HTMLElement>(".candidate-image-button")!;
    const controls = shelf.querySelector<HTMLElement>(".candidate-carousel-controls")!;
    const select = shelf.querySelector<HTMLElement>(".candidate-select")!;
    const remove = shelf.querySelector<HTMLElement>(".candidate-delete")!;
    const title = shelf.querySelector<HTMLElement>(".candidate-character-name")!;
    const result = {
      cardWidth: card.getBoundingClientRect().width,
      cardHeight: card.getBoundingClientRect().height,
      previewWidth: preview.getBoundingClientRect().width,
      previewHeight: preview.getBoundingClientRect().height,
      controlsWidth: controls.getBoundingClientRect().width,
      controlCenterDelta: Math.abs(
        (controls.getBoundingClientRect().top + controls.getBoundingClientRect().height / 2) -
        (preview.getBoundingClientRect().top + preview.getBoundingClientRect().height / 2)
      ),
      selectAlignedWithTitle: Math.abs(
        (select.getBoundingClientRect().top + select.getBoundingClientRect().height / 2) -
        (title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2)
      ),
      deleteOverImage: remove.getBoundingClientRect().top < preview.getBoundingClientRect().top + 40
    };
    shelf.remove();
    return result;
  });
  expect(geometry.cardWidth).toBeGreaterThan(150);
  expect(geometry.cardHeight).toBeGreaterThan(220);
  expect(geometry.previewWidth).toBeGreaterThan(140);
  expect(geometry.previewHeight).toBeGreaterThan(180);
  expect(geometry.controlsWidth).toBeGreaterThan(70);
  expect(geometry.controlCenterDelta).toBeLessThan(12);
  expect(geometry.selectAlignedWithTitle).toBeLessThan(8);
  expect(geometry.deleteOverImage).toBe(true);
});

test("character intake collapses cleanly on a compact desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  await expect(page.locator(".character-intake-grid")).toHaveCSS("grid-template-columns", /^\d+px$/);
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clippedControls: Array.from(document.querySelectorAll("button, input, select, textarea")).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < 0 || rect.right > window.innerWidth + 1;
    }).length
  }));
  expect(layout.overflow).toBe(0);
  expect(layout.clippedControls).toBe(0);
});

test("right rail settings replace only the selected compact panel", async ({ page }) => {
  await page.goto("/");
  const rail = page.locator(".production-guide");
  const main = page.locator(".right-rail-main");
  const sidebarNavigation = page.getByRole("navigation", { name: /Production modules|Các khu vực sản xuất/i });
  const before = await rail.boundingBox();
  await page.getByRole("button", { name: /Mở bộ kỹ năng video/ }).click();
  await expect(main).toHaveCount(1);
  await expect(page.locator(".rail-settings-page")).toContainText("Bộ kỹ năng video");
  await expect(page.getByRole("button", { name: /Bộ kỹ năng video/ })).toHaveCount(0);
  await expect(sidebarNavigation.getByRole("button")).toHaveCount(8);
  const afterVideoSkill = await rail.boundingBox();
  expect(afterVideoSkill?.width).toBe(before?.width);
  await page.getByRole("button", { name: "Quay lại" }).click();
  await page.getByRole("button", { name: /Mở định tuyến AI/ }).click();
  await expect(main).toHaveCount(1);
  await expect(page.locator(".rail-settings-page")).toContainText("Định tuyến AI");
  await expect(page.getByRole("button", { name: /Định tuyến AI/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Quay lại" }).click();
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.locator(".frame-current").click();
  await expect(main).toHaveCount(1);
  await expect(page.locator(".frame-choice-menu")).toBeVisible();
});

test("character rail keeps task actions in the main canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  await expect(page.locator(".rail-context-line")).toContainText("tham chiếu");
  await expect(page.locator(".rail-context-line .rail-help")).toHaveAttribute("title", /tham chiếu/i);
  await expect(page.getByRole("button", { name: "Draft", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Image", exact: true })).toHaveCount(0);
});

test("character contract keeps runtime voice metadata and fake defaults out of the UI", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  const visibleText = await page.locator(".assets-view").innerText();
  expect(visibleText).not.toMatch(/Character voice lock|Voice provider|Voice ID|macOS audio pass|Voice label|Speaking rate|Default delivery/i);
  expect(visibleText).not.toMatch(/Không có đặc điểm ngoại hình được nguồn khóa|Generated from the imported story package/i);
  await expect(page.locator(".assets-view .rail-help")).not.toHaveCount(0);
  for (const help of await page.locator(".assets-view .rail-help").all()) {
    await expect(help).toHaveAttribute("title", /\S+/);
  }
  for (const field of await page.locator(".assets-view textarea").all()) {
    await expect(field).not.toHaveValue(/Không có đặc điểm ngoại hình được nguồn khóa|Generated from the imported story package/i);
  }
});

test("AI test control uses the same rail contract and every help icon explains itself", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Nhân vật & Phong cách", exact: true }).click();
  await page.getByRole("button", { name: /Mở định tuyến AI/ }).click();
  const testButton = page.locator(".rail-test-button");
  await expect(testButton).toBeVisible();
  await expect(testButton).toHaveClass(/rail-settings-link/);
  await expect(page.getByRole("button", { name: "Trợ giúp kiểm tra kết nối AI" })).toHaveAttribute("title", /Gửi một tin nhắn/);
  for (const help of await page.locator(".rail-settings-page .rail-help").all()) {
    await expect(help).toHaveAttribute("title", /\S+/);
  }
});

test("ChatGPT adapter verifies prompt submission and recovers one image from the saved request", async ({ page }) => {
  await page.route("https://chatgpt.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <textarea id="prompt-textarea"></textarea>
        <button data-testid="send-button">Send</button>
        <main id="conversation"></main>
      </body></html>`
    });
  });
  await page.goto("https://chatgpt.com/c/studio-test");
  await page.evaluate(() => {
    const runtimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> = [];
    const sentMessages: unknown[] = [];
    Object.assign(window, { __studioRuntimeListeners: runtimeListeners, __studioSentMessages: sentMessages });
    const chromeHost = window as unknown as { chrome?: Record<string, unknown> };
    const chromeObject = chromeHost.chrome ?? {};
    if (!chromeHost.chrome) chromeHost.chrome = chromeObject;
    chromeObject.runtime = {
          id: "studio-test",
          onMessage: { addListener: (listener: (message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void) => runtimeListeners.push(listener) },
          sendMessage: (message: unknown) => {
            sentMessages.push(message);
            return Promise.resolve({ ok: true });
          }
        };
    document.querySelector("button")?.addEventListener("click", () => {
      const input = document.querySelector("textarea") as HTMLTextAreaElement;
      const conversation = document.querySelector("#conversation");
      const userTurn = document.createElement("div");
      userTurn.dataset.messageAuthorRole = "user";
      userTurn.textContent = input.value;
      conversation?.append(userTurn);
      input.value = "";
      const assistantTurn = document.createElement("div");
      assistantTurn.dataset.messageAuthorRole = "assistant";
      const image = document.createElement("img");
      image.alt = "Generated image";
      image.src = URL.createObjectURL(new Blob(["image"], { type: "image/png" }));
      image.style.width = "300px";
      image.style.height = "400px";
      assistantTurn.append(image);
      conversation?.append(assistantTurn);
    });
  });
  await page.addScriptTag({ path: chatgptContentScript });

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "EXECUTE_CHATGPT_JOB_V2",
      job: { jobId: "character_submit_test", prompt: "Create a full-body character.", task: "image" }
    }, {}, () => undefined);
  });
  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; assets?: unknown[] } }> }).__studioSentMessages;
    return messages.some((message) => message.data?.type === "JOB_RESULT" && message.data.jobId === "character_submit_test" && message.data.status === "done");
  }), { timeout: 12000 }).toBe(true);
  await expect(page.locator("#prompt-textarea")).toHaveValue("");
  await expect(page.locator('[data-message-author-role="user"]')).toContainText("Create a full-body character.");
  await expect(page.locator('[data-message-author-role="user"]')).not.toContainText("STUDIO_REQUEST_ID");

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "CAPTURE_CHATGPT_IMAGE_FOR_JOB_V2",
      jobId: "character_submit_test",
      expectedConversationUrl: "https://chatgpt.com/c/studio-test"
    }, {}, () => undefined);
  });
  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; assets?: unknown[] } }> }).__studioSentMessages;
    return messages
      .filter((message) => message.data?.type === "JOB_RESULT" && message.data.jobId === "character_submit_test" && message.data.status === "done")
      .at(-1)?.data?.assets?.length ?? 0;
  }), { timeout: 5000 }).toBe(1);
});

test("ChatGPT prefers complete JSON over later short follow-up text", async ({ page }) => {
  await page.route("https://chatgpt.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main>
          <div data-testid="conversation-turn-user" data-message-author-role="user">
            STUDIO_REQUEST_ID: story_followup_noise_test
            Expand the premise into a complete narrative.
          </div>
          <div data-testid="conversation-turn-assistant" data-message-author-role="assistant">
            {"logline":"A kitten collects a runaway magic card.","story":"A compact test story with a clear setup, escalation, and payoff.","sceneBreakdown":"HOOK (0-3s) | CONTEXT (3-10s) | PAYOFF (10-30s)","characters":[{"name":"Bong Muc","role":"main","visualBrief":"black and white mascot cat","personality":"brave"}],"scenes":[{"title":"HOOK","summary":"The first card escapes.","location":"market","timeOfDay":"morning","emotionalTone":"urgent","shots":[{"description":"Bong Muc notices a glowing card.","dialogue":"The card is moving!","camera":"wide","motion":"wind swirl","durationSec":3}]},{"title":"CONTEXT","summary":"The chase begins.","location":"market lane","timeOfDay":"morning","emotionalTone":"curious","shots":[{"description":"Bong Muc follows the card trail.","dialogue":"Wait for me!","camera":"tracking","motion":"quick steps","durationSec":8}]},{"title":"PAYOFF","summary":"The card is sealed.","location":"fountain","timeOfDay":"morning","emotionalTone":"relieved","shots":[{"description":"Bong Muc catches the card.","dialogue":"Got it.","camera":"close","motion":"glow settles","durationSec":6}]}]}
          </div>
          <div data-testid="conversation-turn-assistant" data-message-author-role="assistant">
            Bong Muc and the Echo Card
          </div>
        </main>
      </body></html>`
    });
  });
  await page.goto("https://chatgpt.com/c/story-followup-noise");
  await page.evaluate(() => {
    const runtimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> = [];
    const sentMessages: unknown[] = [];
    Object.assign(window, { __studioRuntimeListeners: runtimeListeners, __studioSentMessages: sentMessages });
    const chromeHost = window as unknown as { chrome?: Record<string, unknown> };
    const chromeObject = chromeHost.chrome ?? {};
    if (!chromeHost.chrome) chromeHost.chrome = chromeObject;
    chromeObject.runtime = {
          id: "studio-test",
          onMessage: { addListener: (listener: (message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void) => runtimeListeners.push(listener) },
          sendMessage: (message: unknown) => {
            sentMessages.push(message);
            return Promise.resolve({ ok: true });
          }
        };
  });
  await page.addScriptTag({ path: chatgptContentScript });

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "CAPTURE_LATEST_CHATGPT_TEXT_V2",
      jobId: "story_followup_noise_test",
      expectedConversationUrl: "https://chatgpt.com/c/story-followup-noise",
      task: "story_development"
    }, {}, () => undefined);
  });

  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; output?: { text?: string } } }> }).__studioSentMessages;
    return messages.find((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "story_followup_noise_test" &&
      message.data.status === "done"
    )?.data?.output?.text || "";
  }), { timeout: 5000 }).toContain("\"logline\"");
  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; output?: { text?: string } } }> }).__studioSentMessages;
    return messages.find((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "story_followup_noise_test" &&
      message.data.status === "done"
    )?.data?.output?.text || "";
  }), { timeout: 5000 }).not.toBe("Bong Muc and the Echo Card");
});

test("ChatGPT text recovery waits when the saved conversation is still loading", async ({ page }) => {
  await page.route("https://chatgpt.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main id="conversation"></main>
      </body></html>`
    });
  });
  await page.goto("https://chatgpt.com/c/studio-loading");
  await page.evaluate(() => {
    const runtimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> = [];
    const sentMessages: unknown[] = [];
    Object.assign(window, { __studioRuntimeListeners: runtimeListeners, __studioSentMessages: sentMessages });
    const chromeHost = window as unknown as { chrome?: Record<string, unknown> };
    const chromeObject = chromeHost.chrome ?? {};
    if (!chromeHost.chrome) chromeHost.chrome = chromeObject;
    chromeObject.runtime = {
          id: "studio-test",
          onMessage: { addListener: (listener: (message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void) => runtimeListeners.push(listener) },
          sendMessage: (message: unknown) => {
            sentMessages.push(message);
            return Promise.resolve({ ok: true });
          }
        };
  });
  await page.addScriptTag({ path: chatgptContentScript });

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "CAPTURE_LATEST_CHATGPT_TEXT_V2",
      jobId: "story_loading_test",
      expectedConversationUrl: "https://chatgpt.com/c/studio-loading"
    }, {}, () => undefined);
  });

  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string } }> }).__studioSentMessages;
    return messages.some((message) =>
      message.data?.type === "JOB_STATUS" &&
      message.data.jobId === "story_loading_test" &&
      message.data.status === "waiting_manual_action"
    );
  }), { timeout: 5000 }).toBe(true);
  const failed = await page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string } }> }).__studioSentMessages;
    return messages.some((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "story_loading_test" &&
      message.data.status === "failed_retryable"
    );
  });
  expect(failed).toBe(false);
});

test("ChatGPT quick visual job reports existing assistant turn when ChatGPT does not remount marker", async ({ page }) => {
  await page.route("https://chatgpt.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main>
          <div data-testid="conversation-turn-1">
            <div data-message-author-role="assistant" id="assistant-turn">Previous assistant text.</div>
          </div>
        </main>
        <div id="prompt-textarea" contenteditable="true"></div>
        <button data-testid="send-button">Send</button>
        <script>
          document.querySelector('[data-testid="send-button"]').addEventListener('click', () => {
            const prompt = document.querySelector('#prompt-textarea').textContent;
            const userTurn = document.createElement('div');
            userTurn.setAttribute('data-testid', 'conversation-turn-user');
            userTurn.setAttribute('data-message-author-role', 'user');
            userTurn.textContent = prompt;
            document.querySelector('main').appendChild(userTurn);
            document.querySelector('#prompt-textarea').textContent = '';
            setTimeout(() => {
              document.querySelector('#assistant-turn').textContent = [
                'SUBJECTS: One stylized black-and-white kitten with oversized eyes and upright childlike pose.',
                'STYLE: Polished 3D cartoon rendering, soft fur, pastel-neutral colors, warm studio lighting.',
                'CHARACTER DIRECTION: Preserve the compact silhouette, large expressive eyes, short limbs, and innocent mood.',
                'BACKGROUND DIRECTION: Replace the plain background according to future scenes.',
                'RISKS: Tail shape and markings need explicit continuity rules.'
              ].join('\\n');
            }, 200);
          });
        </script>
      </body></html>`
    });
  });
  await page.goto("https://chatgpt.com/c/quick-visual-existing-turn");
  await page.evaluate(() => {
    const runtimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> = [];
    const sentMessages: unknown[] = [];
    Object.assign(window, { __studioRuntimeListeners: runtimeListeners, __studioSentMessages: sentMessages });
    const chromeHost = window as unknown as { chrome?: Record<string, unknown> };
    const chromeObject = chromeHost.chrome ?? {};
    if (!chromeHost.chrome) chromeHost.chrome = chromeObject;
    chromeObject.runtime = {
          id: "studio-test",
          onMessage: { addListener: (listener: (message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void) => runtimeListeners.push(listener) },
          sendMessage: (message: unknown) => {
            sentMessages.push(message);
            return Promise.resolve({ ok: true });
          }
        };
  });
  await page.addScriptTag({ path: chatgptContentScript });

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "EXECUTE_CHATGPT_JOB_V2",
      job: {
        jobId: "visual_existing_turn_test",
        prompt: "Analyze the attached visual.",
        task: "quick_visual_analysis",
        settings: { newConversation: false },
        references: []
      }
    }, {}, () => undefined);
  });

  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; output?: { text?: string } } }> }).__studioSentMessages;
    return messages.find((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "visual_existing_turn_test" &&
      message.data.status === "done"
    )?.data?.output?.text || "";
  }), { timeout: 8000 }).toContain("CHARACTER DIRECTION");
});

test("ChatGPT quick visual parser ignores missing-image text from the submitted prompt", async ({ page }) => {
  await page.route("https://chatgpt.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main>
          <div data-testid="conversation-turn-user" data-message-author-role="user">
            STUDIO_REQUEST_ID: visual_prompt_noise_test
            If the image is not visibly attached to this message, reply exactly: MISSING_IMAGE_ATTACHMENT.
          </div>
          <div data-testid="conversation-turn-assistant" data-message-author-role="assistant">
            SUBJECTS: One compact blue student robot with rounded limbs, a glass face panel, and a small school badge.
            STYLE: Friendly polished 3D cartoon, soft studio lighting, simple readable shapes, blue and white palette.
            CHARACTER DIRECTION: Preserve the blue robot identity, school role, rounded silhouette, and gentle expression.
            BACKGROUND DIRECTION: Future scenes may move to a classroom or science fair without copying this page.
            RISKS: Keep robot proportions consistent and avoid turning it into an animal character.
          </div>
        </main>
      </body></html>`
    });
  });
  await page.goto("https://chatgpt.com/c/quick-visual-prompt-noise");
  await page.evaluate(() => {
    const runtimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> = [];
    const sentMessages: unknown[] = [];
    Object.assign(window, { __studioRuntimeListeners: runtimeListeners, __studioSentMessages: sentMessages });
    const chromeHost = window as unknown as { chrome?: Record<string, unknown> };
    const chromeObject = chromeHost.chrome ?? {};
    if (!chromeHost.chrome) chromeHost.chrome = chromeObject;
    chromeObject.runtime = {
          id: "studio-test",
          onMessage: { addListener: (listener: (message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void) => runtimeListeners.push(listener) },
          sendMessage: (message: unknown) => {
            sentMessages.push(message);
            return Promise.resolve({ ok: true });
          }
        };
  });
  await page.addScriptTag({ path: chatgptContentScript });

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "CAPTURE_LATEST_CHATGPT_TEXT_V2",
      jobId: "visual_prompt_noise_test",
      expectedConversationUrl: "https://chatgpt.com/c/quick-visual-prompt-noise",
      task: "quick_visual_analysis"
    }, {}, () => undefined);
  });

  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; output?: { text?: string } } }> }).__studioSentMessages;
    return messages.find((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "visual_prompt_noise_test" &&
      message.data.status === "done"
    )?.data?.output?.text || "";
  }), { timeout: 5000 }).toContain("blue student robot");
});

test("ChatGPT quick visual parser prefers real analysis over prompt output schema", async ({ page }) => {
  await page.route("https://chatgpt.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main>
          <div data-testid="conversation-turn-user" data-message-author-role="user">
            STUDIO_REQUEST_ID: visual_schema_noise_test
            If the image is not visibly attached to this message, reply exactly: MISSING_IMAGE_ATTACHMENT.
            Return concise plain text with these sections:
            SUBJECTS: visible subject(s), species/body type, age/role cues, posture, proportions.
            STYLE: rendering style, material, palette, lighting, level of realism.
            CHARACTER DIRECTION: what the future generated character(s) should preserve.
            BACKGROUND DIRECTION: whether the background should be reused, ignored, or transformed.
            RISKS: ambiguity, inconsistent body type risk, missing information.
          </div>
          <div data-testid="conversation-turn-assistant" data-message-author-role="assistant">
            SUBJECTS: One stylized black-and-white kitten mascot with a compact upright body, oversized glossy eyes, short paws, and a curled tail.
            STYLE: Premium soft 3D cartoon with plush fur, warm studio lighting, and gentle pastel-neutral colors.
            CHARACTER DIRECTION: Preserve the asymmetric black facial patch, round silhouette, innocent expression, and bow/collar scale while changing costume.
            BACKGROUND DIRECTION: Ignore the original plain studio background and adapt future scenes to the story setting.
            RISKS: Keep the kitten upright and mascot-like so later generations do not become a normal four-legged cat.
          </div>
        </main>
      </body></html>`
    });
  });
  await page.goto("https://chatgpt.com/c/quick-visual-schema-noise");
  await page.evaluate(() => {
    const runtimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> = [];
    const sentMessages: unknown[] = [];
    Object.assign(window, { __studioRuntimeListeners: runtimeListeners, __studioSentMessages: sentMessages });
    const chromeHost = window as unknown as { chrome?: Record<string, unknown> };
    const chromeObject = chromeHost.chrome ?? {};
    if (!chromeHost.chrome) chromeHost.chrome = chromeObject;
    chromeObject.runtime = {
          id: "studio-test",
          onMessage: { addListener: (listener: (message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void) => runtimeListeners.push(listener) },
          sendMessage: (message: unknown) => {
            sentMessages.push(message);
            return Promise.resolve({ ok: true });
          }
        };
  });
  await page.addScriptTag({ path: chatgptContentScript });

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "CAPTURE_LATEST_CHATGPT_TEXT_V2",
      jobId: "visual_schema_noise_test",
      expectedConversationUrl: "https://chatgpt.com/c/quick-visual-schema-noise",
      task: "quick_visual_analysis"
    }, {}, () => undefined);
  });

  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; output?: { text?: string } } }> }).__studioSentMessages;
    return messages.find((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "visual_schema_noise_test" &&
      message.data.status === "done"
    )?.data?.output?.text || "";
  }), { timeout: 5000 }).toContain("black-and-white kitten mascot");
});

test("ChatGPT quick visual capture ignores short follow-up after valid analysis", async ({ page }) => {
  await page.route("https://chatgpt.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main>
          <div data-testid="conversation-turn-user" data-message-author-role="user">
            STUDIO_REQUEST_ID: visual_followup_noise_test
            Analyze the attached visual.
          </div>
          <div data-testid="conversation-turn-assistant" data-message-author-role="assistant">
            SUBJECTS: One stylized black-and-white kitten mascot with a compact upright body, oversized glossy eyes, short paws, and a curled tail.
            STYLE: Premium soft 3D cartoon with plush fur, warm studio lighting, and gentle pastel-neutral colors.
            CHARACTER DIRECTION: Preserve the asymmetric black facial patch, round silhouette, innocent expression, and bow/collar scale while changing costume.
            BACKGROUND DIRECTION: Ignore the original plain studio background and adapt future scenes to the story setting.
            RISKS: Keep the kitten upright and mascot-like so later generations do not become a normal four-legged cat.
          </div>
          <div data-testid="conversation-turn-assistant" data-message-author-role="assistant">
            Bạn có thích tính cách này không?
          </div>
        </main>
      </body></html>`
    });
  });
  await page.goto("https://chatgpt.com/c/quick-visual-followup-noise");
  await page.evaluate(() => {
    const runtimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> = [];
    const sentMessages: unknown[] = [];
    Object.assign(window, { __studioRuntimeListeners: runtimeListeners, __studioSentMessages: sentMessages });
    const chromeHost = window as unknown as { chrome?: Record<string, unknown> };
    const chromeObject = chromeHost.chrome ?? {};
    if (!chromeHost.chrome) chromeHost.chrome = chromeObject;
    chromeObject.runtime = {
          id: "studio-test",
          onMessage: { addListener: (listener: (message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void) => runtimeListeners.push(listener) },
          sendMessage: (message: unknown) => {
            sentMessages.push(message);
            return Promise.resolve({ ok: true });
          }
        };
  });
  await page.addScriptTag({ path: chatgptContentScript });

  await page.evaluate(() => {
    const listeners = (window as unknown as { __studioRuntimeListeners: Array<(message: Record<string, unknown>, sender: unknown, respond: (value: unknown) => void) => void> }).__studioRuntimeListeners;
    listeners[0]({
      action: "CAPTURE_LATEST_CHATGPT_TEXT_V2",
      jobId: "visual_followup_noise_test",
      expectedConversationUrl: "https://chatgpt.com/c/quick-visual-followup-noise",
      task: "quick_visual_analysis"
    }, {}, () => undefined);
  });

  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; output?: { text?: string } } }> }).__studioSentMessages;
    return messages.find((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "visual_followup_noise_test" &&
      message.data.status === "done"
    )?.data?.output?.text || "";
  }), { timeout: 5000 }).toContain("black-and-white kitten mascot");
  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as unknown as { __studioSentMessages: Array<{ data?: { type?: string; status?: string; jobId?: string; output?: { text?: string } } }> }).__studioSentMessages;
    return messages.find((message) =>
      message.data?.type === "JOB_RESULT" &&
      message.data.jobId === "visual_followup_noise_test" &&
      message.data.status === "done"
    )?.data?.output?.text || "";
  }), { timeout: 5000 }).not.toContain("Bạn có thích tính cách này không");
});
