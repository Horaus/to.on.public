import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import { derivePairingConfirmation } from "../packages/protocol/src/connection-v2.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = path.join(root, "apps/extension/dist");
const bridgePort = Number(process.env.STUDIO_EXTENSION_SMOKE_PORT || 3767);
const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pairingSecret = "a".repeat(64);
const timeoutMs = 20_000;

function playwrightChromePath() {
  const cacheRoot = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  let versions = [];
  try { versions = fs.readdirSync(cacheRoot).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse(); } catch { return undefined; }
  for (const version of versions) {
    const candidate = path.join(cacheRoot, version, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

const browserExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH || playwrightChromePath() || (fs.existsSync(systemChromePath) ? systemChromePath : undefined);

function waitFor(predicate, label, limit = timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started >= limit) return reject(new Error(`Timed out waiting for ${label}.`));
      setTimeout(tick, 50);
    };
    tick();
  });
}

function pairingChallenge(index) {
  return {
    pairingId: `packaged-pair-${index}`,
    nonce: `packaged-nonce-${index}`,
    code: "PACK1234",
    expiresAt: Date.now() + 60_000
  };
}

const connections = [];
let firstConfirmed = false;
let resumed = false;
let runJobMessages = 0;
let jobAckMessages = 0;
const acknowledgedJobIds = new Set();
let firstConnection;
let resumedConnection;
let serverError;
const wss = new WebSocketServer({ port: bridgePort });
wss.on("error", (error) => { serverError = error; });
wss.on("connection", (socket) => {
  const challenge = pairingChallenge(connections.length + 1);
  const connection = { socket, challenge, extensionInstanceId: "", sessionId: "" };
  connections.push(connection);
  if (!firstConnection) firstConnection = connection;
  else resumedConnection = connection;
  socket.send(JSON.stringify({ type: "BRIDGE_PAIRING_CHALLENGE", ...challenge }));
  socket.on("message", (raw) => {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (message.type === "EXTENSION_HELLO") {
      connection.extensionInstanceId = String(message.extensionInstanceId || "");
      connection.sessionId = String(message.sessionId || "");
      if (connections.length === 1) {
        setTimeout(() => socket.send(JSON.stringify({ type: "BRIDGE_PAIRING_APPROVED", pairingId: challenge.pairingId, secret: pairingSecret })), 25);
      }
      return;
    }
    if (message.type === "BRIDGE_PAIRING_CONFIRM" || message.type === "BRIDGE_PAIRING_RESUME") {
      const expected = derivePairingConfirmation(pairingSecret, {
        pairingId: challenge.pairingId,
        nonce: challenge.nonce,
        extensionInstanceId: connection.extensionInstanceId,
        sessionId: connection.sessionId
      });
      if (message.pairingId !== challenge.pairingId || message.proof !== expected) return;
      if (message.type === "BRIDGE_PAIRING_CONFIRM") firstConfirmed = true;
      if (message.type === "BRIDGE_PAIRING_RESUME") resumed = true;
      socket.send(JSON.stringify({ type: "BRIDGE_PAIRING_CONFIRMED", pairingId: challenge.pairingId }));
      return;
    }
    if (message.type === "RUN_JOB") runJobMessages += 1;
    if (message.type === "JOB_ACK") {
      jobAckMessages += 1;
      acknowledgedJobIds.add(String(message.jobId || ""));
    }
  });
});

let context;
try {
  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) throw new Error("Extension dist is missing; run pnpm build:extension first.");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-extension-pairing-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: browserExecutable,
    ignoreDefaultArgs: ["--disable-extensions", "--disable-component-extensions-with-background-pages"],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker", { timeout: timeoutMs });
  const extensionId = new URL(serviceWorker.url()).host;
  await waitFor(() => connections.length >= 1, "initial extension bridge connection");
  await waitFor(() => firstConfirmed, "initial pairing confirmation");
  if (connections.length !== 1) throw new Error(`Expected one initial connection, got ${connections.length}.`);

  // Send one provider-free fixture job, then terminate the worker immediately
  // after its ACK. The unknown provider is intentional: this exercises the
  // desktop→extension job lifecycle without opening a real provider tab or
  // spending generation credits.
  firstConnection.socket.send(JSON.stringify({
    type: "RUN_JOB", provider: "packaged-fixture", task: "connection_test", jobId: "packaged-restart-job",
    prompt: "", references: [], settings: {}, download: { auto: false, filenameTemplate: "fixture" }
  }));
  await waitFor(() => acknowledgedJobIds.has("packaged-restart-job"), "fixture job ACK before worker restart");
  if (jobAckMessages !== 1) throw new Error(`Expected exactly one fixture job ACK before restart, got ${jobAckMessages}.`);

  const browser = context.browser();
  if (!browser) throw new Error("Packaged Chromium browser handle is unavailable.");
  const browserCdp = await browser.newBrowserCDPSession();
  const targets = await browserCdp.send("Target.getTargets");
  const target = targets.targetInfos.find((candidate) => candidate.type === "service_worker" && candidate.url.startsWith(`chrome-extension://${extensionId}/`));
  if (!target) throw new Error("Packaged extension service-worker target was not exposed.");
  await browserCdp.send("Target.closeTarget", { targetId: target.targetId });
  // Playwright can retain the old ServiceWorker wrapper after Target.closeTarget;
  // the authoritative restart signal is a second bridge connection and a valid
  // resume proof, not the wrapper disappearing from context.serviceWorkers().
  await new Promise((resolve) => setTimeout(resolve, 300));

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await waitFor(() => connections.length >= 2, "extension reconnect after worker restart");
  await waitFor(() => resumed, "stored-secret pairing resume");
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (jobAckMessages !== 1) throw new Error(`Fixture job was acknowledged more than once after worker restart: ${jobAckMessages}.`);
  if (runJobMessages !== 0) throw new Error(`Unexpected RUN_JOB messages during pairing smoke: ${runJobMessages}.`);
  console.log(JSON.stringify({
    passed: true,
    extensionId,
    connections: connections.length,
    firstPairing: "confirmed",
    resumedPairing: "confirmed",
    secretRedelivered: false,
    runJobMessages,
    jobAckMessages,
    restartNoDuplicate: jobAckMessages === 1,
    serverError: serverError ? String(serverError.message || serverError) : undefined
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error), connections: connections.length, firstConfirmed, resumed, runJobMessages }, null, 2));
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => undefined);
  await new Promise((resolve) => wss.close(() => resolve()));
}
