import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Keep browser tests isolated from the interactive Electron/Vite session on 5273.
// Reusing that server makes test fixtures depend on whichever project the app has open.
const studioDevPort = Number.parseInt(process.env.STUDIO_E2E_PORT || "5274", 10);
const studioDevUrl = `http://127.0.0.1:${studioDevPort}`;
const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (fs.existsSync(systemChromePath) ? systemChromePath : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  // Keep the isolated Vite webServer and browser state single-flight. Running
  // multiple suites concurrently leaves nested pnpm/Vite processes behind and
  // can look like an application hang even after every assertion passed.
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL: studioDevUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    // Start Vite as the tracked child process. Going through pnpm leaves a
    // nested server behind on macOS after Playwright finishes, which blocks
    // the next run on the strict test port and looks like an app hang.
    command: `STUDIO_DEV_PORT=${studioDevPort} exec node_modules/.bin/vite --config apps/desktop/vite.config.ts --host 127.0.0.1`,
    url: studioDevUrl,
    reuseExistingServer: false,
    timeout: 20_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 920 },
        launchOptions: browserExecutable ? { executablePath: browserExecutable } : undefined
      }
    }
  ]
});
