import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const appOnly = process.argv.includes("--app-only");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.STUDIO_DEV_PORT || "5273", 10);
const electronCdpPort = Number.parseInt(process.env.STUDIO_ELECTRON_CDP_PORT || "9333", 10);
const devServerUrl = `http://${host}:${port}`;
let viteProcess;
let electronProcess;
let stopping = false;

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForVite() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await isPortOpen()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become available at http://${host}:${port}`);
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  electronProcess?.kill("SIGTERM");
  viteProcess?.kill("SIGTERM");
  process.exit(exitCode);
}

async function main() {
  const viteAlreadyRunning = await isPortOpen();
  // App-only is still expected to be self-healing: if the renderer server
  // disappeared, starting the desktop app must recreate it instead of leaving
  // Electron pointed at a dead port.
  if (!viteAlreadyRunning) {
    viteProcess = spawn("pnpm", ["run", "dev:web"], {
      cwd: process.cwd(),
      env: { ...process.env, STUDIO_DEV_PORT: String(port) },
      stdio: "inherit"
    });
    viteProcess.once("exit", (code) => {
      if (!stopping && code !== 0) stop(code ?? 1);
    });
  } else if (viteAlreadyRunning) {
    console.log(`Using the existing Vite server at ${devServerUrl}`);
  }

  await waitForVite();

  const electronEnv = { ...process.env, STUDIO_DEV_PORT: String(port), STUDIO_DEV_SERVER_URL: devServerUrl };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  const extraElectronArgs = (process.env.STUDIO_ELECTRON_ARGS || "")
    .split(" ")
    .map((arg) => arg.trim())
    .filter(Boolean);
  const hasRemoteDebuggingPort = extraElectronArgs.some((arg) => arg === "--remote-debugging-port" || arg.startsWith("--remote-debugging-port="));
  const electronArgs = hasRemoteDebuggingPort
    ? [".", ...extraElectronArgs]
    : [".", `--remote-debugging-port=${electronCdpPort}`, ...extraElectronArgs];
  electronProcess = spawn(electronPath, electronArgs, {
    cwd: process.cwd(),
    env: electronEnv,
    stdio: "inherit"
  });
  electronProcess.once("exit", (code) => stop(code ?? 0));
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

main().catch((error) => {
  console.error(error);
  stop(1);
});
