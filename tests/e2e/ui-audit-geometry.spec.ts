import { expect, test } from "@playwright/test";

const productionViews = [
  "Tổng quan",
  "Sơ đồ luồng",
  "Kịch bản",
  "Nhân vật & Phong cách",
  "Storyboard",
  "Dựng phim",
  "Thư viện nguồn",
  "Thông báo"
] as const;

test("compact and maximized viewport checklist keeps every production view reachable", async ({ page }) => {
  const viewports = [
    { width: 1200, height: 920, label: "compact target" },
    { width: 1180, height: 760, label: "compact minimum" },
    { width: 1440, height: 900, label: "maximized baseline" },
    { width: 1680, height: 1050, label: "maximized wide" },
    { width: 1920, height: 1080, label: "maximized extra wide" }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    for (const view of productionViews) {
      const navigationButton = page.getByRole("button", { name: view, exact: true });
      await navigationButton.click();
      await expect(navigationButton).toHaveClass(/active/);
      const geometry = await page.evaluate(() => {
        const visible = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          });
        const content = visible(".content-scroll")[0]?.getBoundingClientRect();
        const rail = visible(".production-guide")[0]?.getBoundingClientRect();
        const primary = visible(".view button.primary, .view [data-primary-action='true']")[0]?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
          content: content && { left: content.left, right: content.right, bottom: content.bottom },
          rail: rail && { left: rail.left, right: rail.right, bottom: rail.bottom },
          primary: primary && { left: primary.left, right: primary.right, bottom: primary.bottom }
        };
      });
      expect(geometry.document.scrollWidth, `${viewport.label}/${view} horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
      if (geometry.content) {
        expect(geometry.content.left, `${viewport.label}/${view} content left`).toBeGreaterThanOrEqual(-1);
        expect(geometry.content.right, `${viewport.label}/${view} content right`).toBeLessThanOrEqual(viewport.width + 1);
      }
      if (geometry.rail) {
        expect(geometry.rail.left, `${viewport.label}/${view} rail left`).toBeGreaterThanOrEqual(-1);
        expect(geometry.rail.right, `${viewport.label}/${view} rail right`).toBeLessThanOrEqual(viewport.width + 1);
      }
      if (geometry.primary) {
        expect(geometry.primary.left, `${viewport.label}/${view} primary action left`).toBeGreaterThanOrEqual(-1);
        expect(geometry.primary.right, `${viewport.label}/${view} primary action right`).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  }
});

test("flow canvas and management overlay stay within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await page.screenshot({ path: "docs/ui-audit/evidence/flow-map-layout-v13-2026-08-28.png", fullPage: true });

  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".spatial-production-canvas");
    const rail = document.querySelector<HTMLElement>(".production-guide");
    const body = document.querySelector<HTMLElement>(".studio-body");
    const rect = (node: HTMLElement | null) => node && ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width });
    return { canvas: rect(canvas), rail: rect(rail), body: rect(body), viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });

  expect(geometry.canvas).not.toBeNull();
  expect(geometry.rail).not.toBeNull();
  expect(geometry.body).not.toBeNull();
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.canvas!.left).toBeGreaterThanOrEqual(0);
  expect(geometry.canvas!.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.rail!.right).toBeLessThanOrEqual(geometry.viewport + 1);

  await page.getByRole("button", { name: "Mở quản lý ứng dụng" }).click();
  const dialog = page.getByRole("dialog", { name: "Quản lý ứng dụng" });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(1440);
});

test("flow stage navigation never covers a visible production node", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await page.waitForTimeout(180);
  const overlap = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".production-canvas-stage-nav")?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll<HTMLElement>(".spatial-production-canvas .react-flow__node")]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!nav) return true;
    return nodes.some((rect) => rect.left < nav.right && rect.right > nav.left && rect.top < nav.bottom && rect.bottom > nav.top);
  });
  expect(overlap).toBe(false);
  await page.screenshot({ path: "docs/ui-audit/evidence/flow-map-safe-top-inset-2026-08-27.png", fullPage: true });
});

test("flow stage navigation uses the full safe canvas rail without clipping labels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".spatial-production-canvas")?.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>(".production-canvas-stage-nav");
    if (!canvas || !nav) return null;
    const navRect = nav.getBoundingClientRect();
    const buttons = [...nav.querySelectorAll("button")].map((button) => ({ text: button.textContent?.trim(), right: button.getBoundingClientRect().right }));
    return { canvas, nav: navRect, buttons, scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth };
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.nav.left).toBeGreaterThanOrEqual(geometry!.canvas.left + 20);
  expect(geometry!.nav.right).toBeLessThanOrEqual(geometry!.canvas.right - 20);
  expect(geometry!.buttons.length).toBeGreaterThan(5);
  expect(geometry!.buttons.at(-1)!.text).toMatch(/Tạo video|Xem toàn bộ/);
  expect(geometry!.buttons.at(-1)!.right).toBeLessThanOrEqual(geometry!.nav.right + 1);
  // A narrow canvas may need a short horizontal scroll for the final stage;
  // it must remain a bounded control strip rather than collapsing labels.
  expect(geometry!.scrollWidth).toBeLessThanOrEqual(geometry!.clientWidth + 96);
});

test("automation disclosure keeps status, help and chevron in separate controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const summary = page.locator(".automation-disclosure > summary");
  const layout = await summary.evaluate((node) => {
    const style = getComputedStyle(node);
    const items = [...node.children].map((child) => {
      const rect = child.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    const help = node.parentElement?.querySelector<HTMLElement>(".automation-help")?.getBoundingClientRect();
    return { columns: style.gridTemplateColumns, items, right: node.getBoundingClientRect().right, help: help && { left: help.left, right: help.right, top: help.top, bottom: help.bottom } };
  });
  expect(layout.items).toHaveLength(3);
  expect(layout.columns.split(" ")).toHaveLength(4);
  for (let index = 1; index < layout.items.length; index += 1) {
    expect(layout.items[index].left).toBeGreaterThanOrEqual(layout.items[index - 1].right);
  }
  expect(layout.items.at(-1)!.right).toBeLessThanOrEqual(layout.right + 1);
  expect(layout.help).not.toBeUndefined();
  expect(layout.help!.right).toBeLessThanOrEqual(layout.right + 1);
  expect(layout.help!.left).toBeGreaterThanOrEqual(layout.items[2].right);
});

test("flow graph is clipped to the canvas column and never paints into the rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await page.waitForTimeout(180);
  const geometry = await page.evaluate(() => {
    const canvasElement = document.querySelector<HTMLElement>(".spatial-production-canvas");
    const canvas = canvasElement?.getBoundingClientRect();
    const rail = document.querySelector<HTMLElement>(".production-guide")?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll<HTMLElement>(".spatial-production-canvas .react-flow__node")]
      .map((node) => ({ id: node.getAttribute("data-id"), rect: node.getBoundingClientRect() }))
      .filter((item) => item.rect.width > 0 && item.rect.height > 0)
      .map((item) => ({ id: item.id, left: item.rect.left, right: item.rect.right, top: item.rect.top, bottom: item.rect.bottom }));
    const overflow = canvasElement ? getComputedStyle(canvasElement).overflow : "";
    return { canvas: canvas && { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom }, rail: rail && { left: rail.left }, overflow, nodes };
  });
  expect(geometry.canvas).not.toBeNull();
  expect(geometry.overflow).toBe("hidden");
  expect(geometry.canvas!.right).toBeLessThanOrEqual((geometry.rail?.left ?? 1440) + 1);
  // Nodes may be offscreen in a wide graph; only their painted viewport is
  // required to stay within the canvas/rail boundary.
  expect(geometry.nodes.length).toBeGreaterThan(0);
  const partiallyPainted = geometry.nodes.filter((node) =>
    node.left < geometry.canvas!.right && node.right > geometry.canvas!.right && node.left < geometry.canvas!.right - 8
  );
  expect(partiallyPainted, "nodes must not be cut by the canvas edge").toEqual([]);
  await page.screenshot({ path: "docs/ui-audit/evidence/runtime-flow-canvas-clip-2026-08-27.png", fullPage: true });
});

test("flow map keeps a readable control rail without crowding the canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".spatial-production-canvas")?.getBoundingClientRect();
    const rail = document.querySelector<HTMLElement>(".production-guide")?.getBoundingClientRect();
    return canvas && rail ? { canvasRight: canvas.right, railLeft: rail.left, railWidth: rail.width } : null;
  });
  expect(layout).not.toBeNull();
  expect(layout!.railWidth).toBeGreaterThanOrEqual(300);
  expect(layout!.canvasRight).toBeLessThanOrEqual(layout!.railLeft + 1);
});

test("current activity toast stays clear of the fixed automation rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Story|Kịch bản)$/i }).click();
  const createDraft = page.getByRole("button", { name: /Create draft locally|Tạo bản nháp tại chỗ/i });
  if (await createDraft.count()) await createDraft.click();
  await page.getByRole("button", { name: /^(Activity|Thông báo)$/, exact: true }).click();
  const queue = page.getByRole("button", { name: /Queue video|Tạo video/i });
  if (await queue.count() && await queue.isEnabled()) await queue.click();
  const toast = page.locator(".production-activity-toast");
  if (await toast.count()) {
    const geometry = await page.evaluate(() => {
      const toast = document.querySelector<HTMLElement>(".production-activity-toast")?.getBoundingClientRect();
      const rail = document.querySelector<HTMLElement>(".production-guide")?.getBoundingClientRect();
      return toast && rail ? { toastRight: toast.right, railLeft: rail.left } : null;
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.toastRight).toBeLessThanOrEqual(geometry!.railLeft - 8);
  }
});

test("flow map bottom controls do not cover visible production nodes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  await page.waitForTimeout(180);
  const overlap = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>(".production-canvas-tool-dock")?.getBoundingClientRect();
    const palette = document.querySelector<HTMLElement>(".production-node-palette")?.getBoundingClientRect();
    const viewport = document.querySelector<HTMLElement>(".spatial-production-canvas > .react-flow")?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll<HTMLElement>(".spatial-production-canvas .react-flow__node")]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const clipped = (rect: DOMRect) => {
      if (!viewport) return rect;
      const left = Math.max(rect.left, viewport.left);
      const top = Math.max(rect.top, viewport.top);
      const right = Math.min(rect.right, viewport.right);
      const bottom = Math.min(rect.bottom, viewport.bottom);
      return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    };
    const paintedNodes = nodes.map(clipped).filter((rect) => rect.width > 0 && rect.height > 0);
    return { dock: dock ? paintedNodes.some((rect) => intersects(dock, rect)) : true, palette: palette ? paintedNodes.some((rect) => intersects(palette, rect)) : true, viewport: viewport && { top: viewport.top, bottom: viewport.bottom }, paletteRect: palette && { top: palette.top, bottom: palette.bottom }, painted: paintedNodes.map((rect) => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })) };
  });
  expect(overlap.dock).toBe(false);
  expect(overlap.palette).toBe(false);
  // The compact dock owns selection, pan, zoom-in, zoom-out and fit-to-view.
  // Keep this count explicit so a future control cannot silently reintroduce
  // duplicate floating chrome over the graph.
  await expect(page.locator(".production-canvas-tool-dock button")).toHaveCount(5);
  await expect(page.locator(".production-canvas-stage-nav")).toContainText("Xem toàn bộ");
});

test("empty media nodes do not present synthetic provider metadata", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Flow map|Sơ đồ luồng)$/, exact: true }).click();
  const emptyMedia = page.locator(".flow-media-document:has(.flow-empty-media)").first();
  if (await emptyMedia.count()) {
    await expect(emptyMedia).toBeVisible();
    const text = await emptyMedia.innerText();
    expect(text).toContain("Chưa tạo");
    expect(text).not.toMatch(/720p|1080p|source|nguồn/i);
  }
});

test("rapid navigation settles without a stuck loading overlay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  for (const label of ["Flow map|Sơ đồ luồng", "Story|Kịch bản", "Characters & Style|Nhân vật & Phong cách", "Storyboard", "Edit|Dựng phim", "Source|Thư viện nguồn", "Activity|Thông báo", "Overview|Tổng quan"]) {
    await page.getByRole("button", { name: new RegExp(`^(${label})$`), exact: true }).click();
  }
  await page.waitForTimeout(250);
  await expect(page.locator(".studio-body")).toBeVisible();
  await expect(page.locator(".settings-overlay")).toHaveCount(0);
  await expect(page.locator(".production-guide")).toBeVisible();
  await expect(page.locator(".content-scroll > .view")).toHaveCount(1);
  const state = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    busyOverlay: Boolean(document.querySelector(".studio-body .loading-overlay"))
  }));
  expect(state.scrollWidth).toBeLessThanOrEqual(state.viewport + 1);
  expect(state.busyOverlay).toBe(false);
});

test("production rail and content keep separate layout columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const views = ["Overview|Tổng quan", "Flow map|Sơ đồ luồng", "Story|Kịch bản", "Characters & Style|Nhân vật & Phong cách", "Storyboard", "Edit|Dựng phim", "Source|Thư viện nguồn", "Activity|Thông báo"];
  for (const view of views) {
    await page.getByRole("button", { name: new RegExp(`^(${view})$`), exact: true }).click();
    const overlap = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(".content-scroll")?.getBoundingClientRect();
      const rail = document.querySelector<HTMLElement>(".production-guide")?.getBoundingClientRect();
      if (!content || !rail) return true;
      return content.right > rail.left + 1 || content.left >= rail.right;
    });
    expect(overlap, `${view} content and rail overlap`).toBe(false);
  }
  await page.screenshot({ path: "docs/ui-audit/evidence/runtime-layout-columns-2026-08-27.png", fullPage: true });
});

test("narrow desktop and mobile layouts avoid horizontal overflow", async ({ page }) => {
  for (const width of [900, 720]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      columns: [".sidebar", ".production-guide", ".content-scroll"].map((selector) => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node || getComputedStyle(node).display === "none") return null;
        const rect = node.getBoundingClientRect();
        return { selector, left: rect.left, right: rect.right, width: rect.width };
      })
    }));
    expect(geometry.scrollWidth, `${width}px layout overflow`).toBeLessThanOrEqual(width + 1);
    for (const column of geometry.columns.filter(Boolean)) {
      expect(column!.left, `${width}px ${column!.selector} left edge`).toBeGreaterThanOrEqual(-1);
      expect(column!.right, `${width}px ${column!.selector} right edge`).toBeLessThanOrEqual(width + 1);
    }
  }
  await page.screenshot({ path: "docs/ui-audit/evidence/runtime-narrow-layout-2026-08-27.png", fullPage: true });
});

test("right rail content stays inside its column on every view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const views = ["Overview|Tổng quan", "Flow map|Sơ đồ luồng", "Story|Kịch bản", "Characters & Style|Nhân vật & Phong cách", "Storyboard", "Edit|Dựng phim", "Source|Thư viện nguồn", "Activity|Thông báo"];
  for (const view of views) {
    await page.getByRole("button", { name: new RegExp(`^(${view})$`), exact: true }).click();
    await page.waitForTimeout(60);
    const geometry = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(".production-guide")?.getBoundingClientRect();
      const content = [...document.querySelectorAll<HTMLElement>(".production-guide .right-rail-main, .production-guide .right-rail-footer")]
        .map((node) => ({ rect: node.getBoundingClientRect(), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
      return { rail: rail && { left: rail.left, right: rail.right }, content: content.map(({ rect, scrollWidth, clientWidth }) => ({ left: rect.left, right: rect.right, scrollWidth, clientWidth })) };
    });
    expect(geometry.rail, `${view} rail`).not.toBeNull();
    for (const item of geometry.content) {
      expect(item.left, `${view} rail child left`).toBeGreaterThanOrEqual(geometry.rail!.left - 1);
      expect(item.right, `${view} rail child right`).toBeLessThanOrEqual(geometry.rail!.right + 1);
      expect(item.scrollWidth, `${view} rail child horizontal overflow`).toBeLessThanOrEqual(item.clientWidth + 1);
    }
  }
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await page.screenshot({ path: "docs/ui-audit/evidence/runtime-right-rail-geometry-2026-08-27.png", fullPage: true });
});

test("sidebar module labels remain readable at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const labels = await page.locator("nav[aria-label='Các khu vực sản xuất'] button span").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent?.trim(), client: node.clientWidth, scroll: node.scrollWidth })));
  expect(labels.length).toBeGreaterThan(5);
  for (const label of labels) expect(label.scroll, label.text).toBeLessThanOrEqual(label.client + 1);
});
