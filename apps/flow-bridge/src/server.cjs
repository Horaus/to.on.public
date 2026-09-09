const http = require("node:http");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");

const DEFAULT_PORT = 3777;
const HEARTBEAT_MS = 15_000;
const SESSION_TTL_MS = 90_000;

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function jsonSend(socket, message) {
  if (!socket || socket.readyState !== 1) return false;
  try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
}

function normalizeProviders(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function createHealthServer(clients, leases) {
  return http.createServer((req, res) => {
    if (req.url === "/healthz") {
      const now = Date.now();
      const activeClients = [...clients.values()].filter((client) => now - client.lastSeenAt < SESSION_TTL_MS);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "flow-bridge", clients: activeClients.length, leases: leases.size }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });
}

function forwardJobEvent(message, client, socket, clients, leases) {
  const jobId = String(message.jobId || message.job?.jobId || "");
  const lease = leases.get(jobId);
  if (!lease || lease.clientId !== client.clientId) return jsonSend(socket, { type: "BRIDGE_ERROR", jobId, error: "stale_or_missing_lease" });
  const desktop = [...clients.values()].find((candidate) => candidate.role === "desktop");
  if (desktop) jsonSend(desktop.socket, { ...message, leaseId: lease.leaseId });
  if (message.type === "JOB_RESULT") { client.inFlight = Math.max(0, client.inFlight - 1); leases.delete(jobId); }
  return true;
}

function forwardNativeEvent(message, client, socket, clients, nativeRequests) {
  const isRequest = ["NATIVE_CLICK_REQUEST", "NATIVE_FLOW_TOOL_EVALUATE_REQUEST"].includes(message.type) && client.role === "extension";
  const isResult = ["NATIVE_CLICK_RESULT", "NATIVE_FLOW_TOOL_EVALUATE_RESULT"].includes(message.type) && client.role === "desktop";
  if (!isRequest && !isResult) return false;
  if (isRequest) {
    const desktop = [...clients.values()].find((candidate) => candidate.role === "desktop");
    const requestId = String(message.requestId || "");
    if (!desktop || !requestId) return jsonSend(socket, { type: "BRIDGE_ERROR", requestId, error: "desktop_unavailable" });
    nativeRequests.set(requestId, { clientId: client.clientId, desktopId: desktop.clientId, createdAt: Date.now() });
    if (!jsonSend(desktop.socket, message)) nativeRequests.delete(requestId);
    return true;
  }
  const requestId = String(message.requestId || "");
  const request = nativeRequests.get(requestId);
  if (!request || request.desktopId !== client.clientId) return jsonSend(socket, { type: "BRIDGE_ERROR", requestId, error: "stale_or_missing_native_request" });
  const extension = clients.get(request.clientId);
  nativeRequests.delete(requestId);
  if (extension) jsonSend(extension.socket, message);
  return true;
}

function attachConnectionHandlers({ wss, clients, leases, nativeRequests, authorized, releaseClient, routeJob }) {
  wss.on("connection", (socket) => {
    const client = { socket, clientId: "", role: "unknown", providers: [], inFlight: 0, connectedAt: Date.now(), lastSeenAt: Date.now() };
    socket.on("message", (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return jsonSend(socket, { type: "BRIDGE_ERROR", error: "invalid_json" }); }
      if (!authorized(message)) return jsonSend(socket, { type: "BRIDGE_ERROR", error: "unauthorized" });
      client.lastSeenAt = Date.now();
      if (message.type === "HELLO" || message.type === "EXTENSION_HELLO") {
        client.clientId = String(message.clientId || message.extensionInstanceId || message.extensionId || id("client"));
        client.role = message.type === "EXTENSION_HELLO" ? "extension" : String(message.role || "unknown");
        client.providers = normalizeProviders(message.providers);
        clients.set(client.clientId, client);
        if (message.type === "EXTENSION_HELLO") {
          jsonSend(socket, { type: "BRIDGE_PAIRING_CHALLENGE", pairingId: id("pairing"), extensionId: client.clientId, state: "confirmed", expiresAt: Date.now() + SESSION_TTL_MS });
          return jsonSend(socket, { type: "EXTENSION_STATUS", extensionId: client.clientId, extensionInstanceId: client.clientId, version: String(message.version || ""), providerVisibility: message.providerVisibility || {}, capabilities: message.capabilities || {} });
        }
        return jsonSend(socket, { type: "HELLO_ACK", clientId: client.clientId, sessionId: id("session"), heartbeatMs: HEARTBEAT_MS });
      }
      if (!client.clientId) return jsonSend(socket, { type: "BRIDGE_ERROR", error: "hello_required" });
      if (message.type === "PING") return jsonSend(socket, { type: "PONG", clientId: client.clientId });
      if (message.type === "RUN_JOB" && client.role === "desktop") return routeJob(message, client);
      if (["JOB_STATUS", "JOB_RESULT"].includes(message.type)) return forwardJobEvent(message, client, socket, clients, leases);
      if (message.type === "JOB_ACK") {
        const jobId = String(message.jobId || "");
        const lease = leases.get(jobId);
        if (!lease || lease.clientId !== client.clientId) return jsonSend(socket, { type: "BRIDGE_ERROR", jobId, error: "stale_or_missing_lease" });
        const desktop = [...clients.values()].find((candidate) => candidate.role === "desktop");
        if (desktop) jsonSend(desktop.socket, { ...message, leaseId: lease.leaseId });
      }
      forwardNativeEvent(message, client, socket, clients, nativeRequests);
    });
    socket.on("close", () => { if (client.clientId) releaseClient(client.clientId); });
    socket.on("error", () => { if (client.clientId) releaseClient(client.clientId); });
  });
}

function createFlowBridge(options = {}) {
  const configuredPort = options.port ?? process.env.FLOW_BRIDGE_PORT ?? DEFAULT_PORT;
  const port = Number(configuredPort);
  const token = String(options.token || process.env.FLOW_BRIDGE_TOKEN || "");
  const clients = new Map();
  const leases = new Map();
  const nativeRequests = new Map();
  const server = createHealthServer(clients, leases);
  const wss = new WebSocketServer({ server });

  function authorized(message) {
    return !token || String(message.token || "") === token;
  }

  function releaseClient(clientId) {
    clients.delete(clientId);
    for (const [jobId, lease] of leases) if (lease.clientId === clientId) leases.delete(jobId);
    for (const [requestId, request] of nativeRequests) if (request.clientId === clientId) nativeRequests.delete(requestId);
  }

  function chooseClient(provider, jobId) {
    const existing = leases.get(jobId);
    if (existing && clients.has(existing.clientId)) return clients.get(existing.clientId);
    const candidates = [...clients.values()]
      .filter((client) => client.role === "extension" && client.providers.includes(provider))
      .filter((client) => Date.now() - client.lastSeenAt < SESSION_TTL_MS)
      .sort((a, b) => a.inFlight - b.inFlight || a.connectedAt - b.connectedAt);
    return candidates[0];
  }

  function routeJob(message, source) {
    const job = message.job || message;
    const jobId = String(job.jobId || "");
    const provider = String(job.provider || "google-flow");
    if (!jobId) return jsonSend(source.socket, { type: "JOB_REJECTED", jobId: "", error: "job_id_required" });
    const client = chooseClient(provider, jobId);
    if (!client) return jsonSend(source.socket, { type: "JOB_REJECTED", jobId, error: "no_capable_extension" });
    const lease = leases.get(jobId) || { leaseId: id("lease"), jobId, clientId: client.clientId, createdAt: Date.now() };
    leases.set(jobId, lease);
    client.inFlight += 1;
    // The production extension consumes RUN_JOB fields at the top level;
    // retain the nested form only as an input convenience for desktop callers.
    const delivered = jsonSend(client.socket, { type: "RUN_JOB", ...job, leaseId: lease.leaseId });
    if (!delivered) {
      client.inFlight = Math.max(0, client.inFlight - 1);
      leases.delete(jobId);
      return jsonSend(source.socket, { type: "JOB_REJECTED", jobId, error: "extension_unavailable" });
    }
    jsonSend(source.socket, { type: "JOB_ACCEPTED", jobId, leaseId: lease.leaseId, clientId: client.clientId });
    return true;
  }

  attachConnectionHandlers({ wss, clients, leases, nativeRequests, authorized, releaseClient, routeJob });

  let heartbeat;
  return {
    server,
    wss,
    clients,
    leases,
    start: () => new Promise((resolve) => server.listen(port, "127.0.0.1", resolve)),
    stop: () => new Promise((resolve) => {
      clearInterval(heartbeat);
      for (const client of clients.values()) {
        try { client.socket.terminate(); } catch {}
      }
      for (const socket of wss.clients) {
        try { socket.terminate(); } catch {}
      }
      clients.clear();
      leases.clear();
      try { wss.close(); } catch {}
      server.close(resolve);
    }),
    startHeartbeat: () => { heartbeat = setInterval(() => { for (const client of clients.values()) jsonSend(client.socket, { type: "PING", at: Date.now() }); }, HEARTBEAT_MS); heartbeat.unref?.(); },
    port
  };
}

if (require.main === module) {
  const bridge = createFlowBridge();
  bridge.start().then(() => { bridge.startHeartbeat(); console.log(`Flow Bridge listening on ws://127.0.0.1:${bridge.port}`); });
}

module.exports = { createFlowBridge };
