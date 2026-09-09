import WebSocket from "ws";
import { execFileSync } from "node:child_process";

const configuredPort = Number(process.env.STUDIO_ELECTRON_CDP_PORT || 9333);
const settleMs = Number(process.env.STUDIO_WINDOW_MODE_SETTLE_MS || 500);

function candidatePorts() {
  const ports = [configuredPort];
  if (process.env.STUDIO_ELECTRON_CDP_PORT) return ports;
  try {
    const rows = execFileSync("ps", ["-axo", "command="], { encoding: "utf8" });
    for (const match of rows.matchAll(/(?:electron|Electron)[^\n]*--remote-debugging-port=(\d+)/g)) {
      if (!/Antigravity IDE/i.test(match[0])) ports.push(Number(match[1]));
    }
  } catch {
    // Keep the configured default when process inspection is unavailable.
  }
  return [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0))];
}

async function getPageTarget() {
  let lastError;
  for (const port of candidatePorts()) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!response.ok) throw new Error(`Electron CDP returned HTTP ${response.status}.`);
      const targets = await response.json();
      const target = targets.find((candidate) => candidate.type === "page" && /^http:\/\/127\.0\.0\.1:/i.test(candidate.url));
      if (target?.webSocketDebuggerUrl) return { target, port };
      lastError = new Error(`No desktop renderer is exposed through CDP ${port}.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No Electron CDP endpoint was found.");
}

async function main() {
  const { target, port } = await getPageTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let nextId = 0;
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error("Timed out evaluating desktop window mode.")), 10_000);
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw));
      if (message.id !== id) return;
      socket.off("message", onMessage);
      clearTimeout(timer);
      if (message.error || message.result?.exceptionDetails) {
        reject(new Error(message.error?.message || message.result.exceptionDetails.text));
        return;
      }
      resolve(message.result?.result?.value);
    };
    socket.on("message", onMessage);
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });

  const result = JSON.parse(await evaluate(`(async()=>{
    const initial = await window.studioBridge.getWindowMode();
    const state = await window.studioBridge.getState();
    const modes = [];
    try {
      for (const requested of ["compact", "maximized"]) {
        const set = await window.studioBridge.setWindowMode(requested);
        await new Promise((resolve) => setTimeout(resolve, ${settleMs}));
        const mode = await window.studioBridge.getWindowMode();
        modes.push({ requested, set, mode, viewport: { innerWidth, innerHeight, outerWidth, outerHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth });
      }
    } finally {
      await window.studioBridge.setWindowMode(initial.mode);
      await new Promise((resolve) => setTimeout(resolve, ${settleMs}));
    }
    return JSON.stringify({ initial, activeProjectId: state.activeProjectId, videoAssets: state.assets.filter((asset) => asset.projectId === state.activeProjectId && asset.type === "video").length, modes });
  })()`));
  socket.close();

  const failures = [];
  for (const sample of result.modes) {
    if (sample.mode.mode !== sample.requested) failures.push(`${sample.requested}: mode reported ${sample.mode.mode}`);
    if (sample.viewport.innerWidth !== sample.mode.bounds.width || sample.viewport.innerHeight !== sample.mode.bounds.height) failures.push(`${sample.requested}: viewport ${sample.viewport.innerWidth}x${sample.viewport.innerHeight} != bounds ${sample.mode.bounds.width}x${sample.mode.bounds.height}`);
    if (sample.viewport.scrollWidth > sample.viewport.clientWidth) failures.push(`${sample.requested}: horizontal overflow ${sample.viewport.scrollWidth} > ${sample.viewport.clientWidth}`);
  }
  const passed = result.modes.length === 2 && result.videoAssets > 0 && failures.length === 0;
  console.log(JSON.stringify({ passed, cdpPort: port, ...result, failures }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
