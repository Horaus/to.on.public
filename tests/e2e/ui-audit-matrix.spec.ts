import { expect, test } from "@playwright/test";

const viewButtons = [
  /^(Overview|Tổng quan)$/,
  /^(Flow map|Sơ đồ luồng)$/,
  /^(Story|Kịch bản)$/,
  /^(Characters & Style|Nhân vật & Phong cách)$/,
  /^Storyboard$/,
  /^(Edit|Dựng phim)$/,
  /^(Source|Thư viện nguồn)$/,
  /^(Activity|Thông báo)$/
];

const viewports = [
  { name: "compact", width: 1200, height: 920 },
  { name: "compact-floor", width: 1180, height: 760 },
  { name: "max", width: 1440, height: 900 },
  { name: "max-wide", width: 1920, height: 1080 }
];

test("core views stay inside the supported four-viewport matrix", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.locator(".studio-body")).toBeVisible();

    for (const buttonName of viewButtons) {
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await page.waitForTimeout(40);
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const node = document.querySelector<HTMLElement>(selector);
          if (!node || getComputedStyle(node).display === "none") return null;
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
          content: rect(".content-scroll"),
          rail: rect(".production-guide"),
          body: rect(".studio-body")
        };
      });

      expect(geometry.document.scrollWidth, `${viewport.name} ${buttonName} horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
      for (const [name, box] of Object.entries(geometry).filter(([key]) => ["content", "rail", "body"].includes(key))) {
        if (!box) continue;
        expect(box.left, `${viewport.name} ${buttonName} ${name} left edge`).toBeGreaterThanOrEqual(-1);
        expect(box.right, `${viewport.name} ${buttonName} ${name} right edge`).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  }
});
