const { WebSocketServer } = require("ws");
const { validateEnvelope, verifyAuthenticator } = require("../../../../../packages/protocol/src/connection-v2.cjs");

function createExtensionBridgeServer(deps) {
  const {
    port = 3767,
    sockets,
    extensionConnections,
    publishBridgeStatus,
    deliverUnacknowledgedChatGptJobs,
    dispatchPendingJobs,
    recoverRecentFailedFlowJobs,
    dropBridgeSocket,
    releaseJobTarget,
    isJobTargetCurrent,
    shouldRetainJobTarget,
    acknowledgeJobDispatch,
    dispatchDesktopNativeClick,
    evaluateFlowCustomTool,
    shouldIgnoreDirectFlowMessage,
    updateJobStatus,
    finishJob,
    desktopInstanceId,
    pairingSecret,
    pairingSessions,
    nowMs = Date.now
  } = deps;
  const inboundSequences = new WeakMap();
  const bridgeMessageDeps = createBridgeMessageDeps({ ...deps, inboundSequences, nowMs });
  const wss = new WebSocketServer({ port });
  wss.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`Extension bridge port ${port} is already in use. The desktop app will continue without owning the bridge.`);
      return;
    }
    console.error("Extension bridge error:", error);
  });
  wss.on("connection", (socket) => {
    sockets.add(socket);
    const pairing = pairingSessions?.begin(socket);
    extensionConnections.set(socket, pairing ? { pairing } : {});
    if (pairing && socket.readyState === 1) {
      try { socket.send(JSON.stringify({ type: "BRIDGE_PAIRING_CHALLENGE", ...pairing })); } catch { /* closed socket */ }
    }
    publishBridgeStatus();
    socket.on("message", (raw) => handleBridgeMessage(socket, raw, bridgeMessageDeps));
    socket.on("close", () => { pairingSessions?.remove(socket); dropBridgeSocket(socket); });
    socket.on("error", () => { pairingSessions?.remove(socket); dropBridgeSocket(socket); });
  });
  return { wss, approvePairing: (extensionInstanceId, code) => approvePairing(extensionInstanceId, code, { sockets, extensionConnections, pairingSessions, pairingSecret }) };
}

function createBridgeMessageDeps(deps) {
  return {
    sockets: deps.sockets,
    extensionConnections: deps.extensionConnections,
    publishBridgeStatus: deps.publishBridgeStatus,
    deliverUnacknowledgedChatGptJobs: deps.deliverUnacknowledgedChatGptJobs,
    dispatchPendingJobs: deps.dispatchPendingJobs,
    recoverRecentFailedFlowJobs: deps.recoverRecentFailedFlowJobs,
    dropBridgeSocket: deps.dropBridgeSocket,
    releaseJobTarget: deps.releaseJobTarget,
    isJobTargetCurrent: deps.isJobTargetCurrent,
    shouldRetainJobTarget: deps.shouldRetainJobTarget,
    acknowledgeJobDispatch: deps.acknowledgeJobDispatch,
    dispatchDesktopNativeClick: deps.dispatchDesktopNativeClick,
    evaluateFlowCustomTool: deps.evaluateFlowCustomTool,
    shouldIgnoreDirectFlowMessage: deps.shouldIgnoreDirectFlowMessage,
    updateJobStatus: deps.updateJobStatus,
    finishJob: deps.finishJob,
    desktopInstanceId: deps.desktopInstanceId,
    pairingSecret: deps.pairingSecret,
    pairingSessions: deps.pairingSessions,
    inboundSequences: deps.inboundSequences,
    nowMs: deps.nowMs
  };
}

function replyNativeRequest(socket, type, requestId, promise) {
  void promise
    .then((value) => socket.send(JSON.stringify({ type, requestId, ok: true, ...(value === undefined ? {} : { value }) })))
    .catch((error) => socket.send(JSON.stringify({
      type,
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })));
}

function handleBridgeMessage(socket, raw, deps) {
  let message;
  try {
    message = JSON.parse(String(raw));
  } catch {
    sendProtocolNack(socket, undefined, "invalid_json");
    return;
  }
  try {
    if (handlePairingMessage(socket, message, deps)) return;
    const validation = validateInboundMessage(socket, message, deps);
    if (!validation.ok) {
      sendProtocolNack(socket, message, validation.code);
      return;
    }
    if (message.type === "EXTENSION_HELLO") handleHello(socket, message, deps);
    if (message.type === "PONG") handlePong(socket, message, deps);
    if (message.type === "EXTENSION_STATUS") handleStatus(socket, message, deps);
    if (message.type === "JOB_ACK") deps.acknowledgeJobDispatch(message);
    handleNativeBridgeMessage(socket, message, deps);
    if (deps.shouldIgnoreDirectFlowMessage(socket, message)) return;
    handleJobBridgeMessage(message, deps);
  } catch (error) {
    console.error(error);
  }
}

function sendProtocolNack(socket, message, code) {
  if (!socket || socket.readyState !== 1 || typeof socket.send !== "function") return;
  try {
    socket.send(JSON.stringify({
      type: "BRIDGE_NACK",
      protocolVersion: "2",
      messageId: typeof message?.messageId === "string" ? message.messageId : undefined,
      code: String(code || "invalid_envelope"),
      retryable: false
    }));
  } catch { /* a closed socket cannot receive diagnostics */ }
}

function validateInboundMessage(socket, message, deps) {
  if (message?.protocolVersion !== "2") return { ok: true };
  const lastSequence = Number(deps.inboundSequences?.get(socket) || 0);
  const validation = validateEnvelope(message, {
    nowMs: deps.nowMs?.() || Date.now(),
    lastSequence,
    ...(deps.desktopInstanceId ? { expectedDestination: { desktopInstanceId: deps.desktopInstanceId } } : {})
  });
  if (!validation.ok) return validation;

  const connection = deps.extensionConnections?.get(socket) || {};
  const sourceIdentity = String(message.source?.extensionInstanceId || "");
  const knownIdentities = [connection.extensionInstanceId, connection.extensionId].map((value) => String(value || "")).filter(Boolean);
  if (!sourceIdentity || !knownIdentities.includes(sourceIdentity)) return { ok: false, code: "wrong_source_extension" };
  const routeSession = String(message.route?.sessionId || "");
  if (!routeSession || routeSession !== String(connection.sessionId || "")) return { ok: false, code: "wrong_session" };

  if (deps.pairingSecret && !verifyAuthenticator(deps.pairingSecret, message)) return { ok: false, code: "invalid_authenticator" };
  if (deps.pairingSessions) {
    const pairing = deps.pairingSessions.inspect(socket);
    if (pairing?.state !== "confirmed") return { ok: false, code: "pairing_not_confirmed" };
  }
  if (deps.isJobTargetCurrent && !deps.isJobTargetCurrent(socket, message)) return { ok: false, code: "stale_job_lease" };
  deps.inboundSequences?.set(socket, Number(message.sequence));
  return { ok: true };
}

function handleNativeBridgeMessage(socket, message, deps) {
  if (message.type === "NATIVE_CLICK_REQUEST") {
    replyNativeRequest(socket, "NATIVE_CLICK_RESULT", message.requestId, deps.dispatchDesktopNativeClick(
      String(message.tabUrl || ""), Number(message.x), Number(message.y),
      String(message.expectedText || ""), message.confirmIfUnchanged === true
    ));
    return true;
  }
  if (message.type === "NATIVE_FLOW_TOOL_EVALUATE_REQUEST") {
    replyNativeRequest(socket, "NATIVE_FLOW_TOOL_EVALUATE_RESULT", message.requestId,
      deps.evaluateFlowCustomTool(String(message.expression || "")));
    return true;
  }
  return false;
}

function handleJobBridgeMessage(message, deps) {
  if (message.type === "JOB_STATUS") deps.updateJobStatus(message);
  if (message.type === "JOB_RESULT") {
    try { deps.finishJob(message); }
    finally { if (!deps.shouldRetainJobTarget?.(message)) deps.releaseJobTarget?.(message); }
  }
}

function dropDuplicateExtensionSockets(socket, extensionId, extensionInstanceId, sessionId, deps) {
  for (const candidate of Array.from(deps.sockets)) {
    if (candidate === socket) continue;
    const prior = deps.extensionConnections.get(candidate) || {};
    // A package id is shared by every browser profile. Only replace a
    // previous worker when it belongs to the same installation; otherwise a
    // reconnect from a Chrome CDP client can evict the profile that owns the
    // actual Flow runtime. Keep legacy clients (without an installation id)
    // last-session-wins for backwards compatibility.
    const sameInstallation = extensionInstanceId && prior.extensionInstanceId
      ? prior.extensionInstanceId === extensionInstanceId
      : !extensionInstanceId || !prior.extensionInstanceId;
    if (extensionId && prior.extensionId === extensionId && sameInstallation && prior.sessionId !== sessionId) {
      deps.dropBridgeSocket(candidate);
      try { candidate.terminate(); } catch {}
    }
  }
}

function extensionHelloRecord(message, extensionId, sessionId, deps) {
  return {
    extensionId, extensionInstanceId: String(message.extensionInstanceId || ""), sessionId, lastSeenAt: deps.nowMs(), version: String(message.version || ""),
    providers: message.providers || [], capabilities: message.capabilities || {}, providerVisibility: message.providerVisibility || {}, discovery: message.discovery || {}
  };
}

function handleHello(socket, message, deps) {
  const extensionId = String(message.extensionId || "");
  const extensionInstanceId = String(message.extensionInstanceId || "");
  const sessionId = String(message.sessionId || "");
  dropDuplicateExtensionSockets(socket, extensionId, extensionInstanceId, sessionId, deps);
  const record = extensionHelloRecord(message, extensionId, sessionId, deps);
  const pairing = deps.pairingSessions?.updateIdentity(socket, { extensionId, extensionInstanceId: message.extensionInstanceId, sessionId });
  if (pairing) record.pairing = pairing;
  deps.extensionConnections.set(socket, record);
  deps.publishBridgeStatus();
  deps.deliverUnacknowledgedChatGptJobs(socket);
  deps.dispatchPendingJobs();
}

function handlePong(socket, message, deps) {
  const current = deps.extensionConnections.get(socket) || {};
  deps.extensionConnections.set(socket, {
    ...current,
    sessionId: String(message.sessionId || current.sessionId || ""),
    lastSeenAt: deps.nowMs(),
    version: String(message.extensionVersion || current.version || ""),
    providerVisibility: message.providerVisibility || current.providerVisibility || {},
    capabilities: message.capabilities || current.capabilities || {},
    discovery: message.discovery || current.discovery || {}
  });
  deps.publishBridgeStatus();
  deps.dispatchPendingJobs();
  deps.recoverRecentFailedFlowJobs();
}

function handleStatus(socket, message, deps) {
  const current = deps.extensionConnections.get(socket) || {};
  deps.extensionConnections.set(socket, {
    ...current,
    version: String(message.version || current.version || ""),
    providerVisibility: message.providerVisibility || current.providerVisibility || {},
    capabilities: message.capabilities || current.capabilities || {},
    discovery: message.discovery || current.discovery || {}
  });
  deps.publishBridgeStatus();
  // Topology status is also emitted when a Flow tab opens/closes or a
  // service worker refreshes. A job can be queued during that transition;
  // flush it once the connection has advertised its current capabilities so
  // it does not remain pending until a later heartbeat/HELLO.
  deps.dispatchPendingJobs?.();
}

function handlePairingMessage(socket, message, deps) {
  if (message?.type !== "BRIDGE_PAIRING_CONFIRM" && message?.type !== "BRIDGE_PAIRING_RESUME") return false;
  const result = message.type === "BRIDGE_PAIRING_RESUME"
    ? deps.pairingSessions?.resume(socket, { extensionId: message.extensionId, extensionInstanceId: message.extensionInstanceId, sessionId: message.sessionId }, message.proof)
    : deps.pairingSessions?.confirm(socket, message.proof);
  const pairing = deps.pairingSessions?.inspect(socket);
  const current = deps.extensionConnections.get(socket) || {};
  if (pairing) deps.extensionConnections.set(socket, {
    ...current,
    ...(message.extensionId ? { extensionId: String(message.extensionId) } : {}),
    ...(message.extensionInstanceId ? { extensionInstanceId: String(message.extensionInstanceId) } : {}),
    ...(message.sessionId ? { sessionId: String(message.sessionId) } : {}),
    pairing
  });
  if (socket.readyState === 1) {
    try { socket.send(JSON.stringify({ type: result?.ok ? "BRIDGE_PAIRING_CONFIRMED" : "BRIDGE_PAIRING_REJECTED", pairingId: pairing?.pairingId, code: result?.ok ? undefined : result?.code })); } catch { /* closed socket */ }
  }
  deps.publishBridgeStatus?.();
  // A job can be queued while the extension is still completing its pairing
  // challenge. The HELLO/PONG dispatch happens before confirmation and is
  // intentionally rejected by the v2 capability gate; flush the queue once
  // the same socket is confirmed so the job is delivered exactly once.
  if (result?.ok) deps.dispatchPendingJobs?.();
  return true;
}

function approvePairing(extensionInstanceId, code, deps) {
  const requestedIdentity = String(extensionInstanceId || "");
  // Older 0.1.x workers may announce the extension before installation
  // identity hydration completes. Keep approval bound to the one live socket,
  // but allow the stable extension ID as a compatibility fallback when the
  // instance ID is empty; once present, the installation ID remains exact.
  const socket = Array.from(deps.sockets || []).find((candidate) => {
    const connection = deps.extensionConnections.get(candidate) || {};
    const instanceId = String(connection.extensionInstanceId || "");
    const extensionId = String(connection.extensionId || "");
    return requestedIdentity
      ? instanceId === requestedIdentity || (!instanceId && extensionId === requestedIdentity)
      : !instanceId && Boolean(extensionId);
  });
  if (!socket) return { ok: false, code: "pairing_extension_not_found" };
  const approved = deps.pairingSessions?.approve(socket, code);
  if (!approved?.ok) return approved || { ok: false, code: "pairing_unavailable" };
  const delivered = deps.pairingSessions.deliverSecret(socket);
  if (!delivered.ok) return delivered;
  if (socket.readyState === 1) {
    try { socket.send(JSON.stringify({ type: "BRIDGE_PAIRING_APPROVED", pairingId: delivered.pairingId, secret: delivered.secret })); } catch { /* closed socket */ }
  }
  const pairing = deps.pairingSessions.inspect(socket);
  const current = deps.extensionConnections.get(socket) || {};
  deps.extensionConnections.set(socket, { ...current, pairing });
  deps.publishBridgeStatus?.();
  return { ok: true, pairing };
}

module.exports = { createExtensionBridgeServer, createBridgeMessageDeps, handleBridgeMessage, validateInboundMessage, approvePairing };
