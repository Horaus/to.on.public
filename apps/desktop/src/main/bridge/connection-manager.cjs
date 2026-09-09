const { validateEnvelope } = require("../../../../../packages/protocol/src/connection-v2.cjs");
const { createJobTargetLeases } = require("./job-target-lease.cjs");
const { capabilityIssues } = require("../../../../../packages/protocol/src/capabilities.cjs");

function createBridgeConnectionManager(deps) {
  const runtime = { ...deps, nowMs: deps.nowMs || Date.now };
  const state = {
    runtime,
    targetCursors: new Map(),
    outboundSequences: new WeakMap(),
    jobLeases: createJobTargetLeases({ nowMs: runtime.nowMs, randomId: runtime.randomId || (() => `lease-${Date.now()}-${Math.random().toString(36).slice(2)}`) })
  };
  return {
    broadcast: (message) => broadcast(state, message),
    drop: (socket) => drop(state, socket),
    safeSend: (socket, message) => safeSend(state, socket, message),
    providerFor,
    canHandle: (socket, provider) => canHandle(state, socket, provider),
    isDirectFlow: (socket) => isDirectFlow(state, socket),
    canonicalFlow: (open) => canonicalFlow(state, open),
    ignoreDirectFlowMessage: (socket, message) => ignoreDirectFlowMessage(state, socket, message),
    send: (message) => send(state, message),
    releaseJobTarget: (messageOrJobKey) => releaseJobTarget(state, messageOrJobKey),
    inspectJobTarget: (messageOrJobKey) => state.jobLeases.inspect(typeof messageOrJobKey === "string" && messageOrJobKey.startsWith("job:") ? messageOrJobKey : messageJobKey(messageOrJobKey) || messageOrJobKey),
    isJobTargetCurrent: (socket, message) => isJobTargetCurrent(state, socket, message),
    status: () => status(state),
    publishStatus: () => publishStatus(state),
    heartbeat: () => heartbeat(state)
  };
}

function drop(state, socket) {
  const { runtime, jobLeases } = state;
  const connection = runtime.connections.get(socket) || {};
  const endpoint = `${connection.extensionId || ""}\u0000${connection.sessionId || ""}`;
  jobLeases.releaseByEndpoint(endpoint);
  runtime.sockets.delete(socket);
  runtime.connections.delete(socket);
  publishStatus(state);
}

function messageJobKey(message) {
  const jobId = message?.job?.jobId || message?.jobId;
  if (!jobId) return "";
  return `job:${String(jobId)}`;
}

function releaseJobTarget(state, messageOrJobKey) {
  const key = typeof messageOrJobKey === "string" ? messageOrJobKey : messageJobKey(messageOrJobKey);
  return key ? state.jobLeases.release(key) || false : false;
}

function isJobTargetCurrent(state, socket, message) {
  if (message?.protocolVersion !== "2") return true;
  const type = String(message.messageType || message.type || "");
  if (!["JOB_ACK", "JOB_STATUS", "PROVIDER_ACCEPTED", "JOB_RESULT"].includes(type)) return true;
  const jobKey = messageJobKey(message);
  const lease = jobKey ? state.jobLeases.inspect(jobKey) : undefined;
  if (!lease) return false;
  return state.jobLeases.matches(jobKey, connectionSortKey(state, socket), message.route?.leaseId, message.route?.fencingToken);
}

function safeSend(state, socket, message) {
  // `ws` instances do not reliably expose the static OPEN constant as an
  // instance property in every Electron/Node runtime. Compare the protocol
  // state directly so live extension sockets are not discarded from status
  // and dispatch selection.
  if (!socket || socket.readyState !== 1) { drop(state, socket); return false; }
  try { socket.send(JSON.stringify(message)); return true; }
  catch { drop(state, socket); return false; }
}

function providerFor(message) {
  if (!message || typeof message !== "object") return "";
  const provider = String(message.provider || message.route?.provider || "");
  return { flow: "google-flow", "google-flow-web": "google-flow", "chatgpt-web": "chatgpt", "grok-web": "grok", "elevenlabs-flows-web": "elevenlabs-flows" }[provider] || provider;
}

function providerVisible(connection, provider) {
  const visibility = connection.providerVisibility || {};
  if (provider === "google-flow") return Number(visibility.googleFlowProjectTabs || 0) > 0;
  if (provider === "elevenlabs-flows") return Number(visibility.elevenLabsFlowsTabs || 0) > 0;
  return true;
}

function flowProjectPathFromValue(value) {
  try { return new URL(String(value || "")).pathname.match(/\/tools\/flow\/project\/[^/]+/i)?.[0].toLowerCase() || ""; }
  catch { return ""; }
}

function flowConnectionProjectPath(state, socket) {
  const connection = state.runtime.connections.get(socket) || {};
  const urls = connection.providerVisibility?.googleFlowUrls || [];
  return urls.map(flowProjectPathFromValue).find(Boolean) || "";
}

function flowConnectionPreference(state, socket) {
  const connection = state.runtime.connections.get(socket) || {};
  const visibility = connection.providerVisibility || {};
  const urls = visibility.googleFlowUrls || [];
  const hasBase = urls.some((value) => /\/tools\/flow\/project\/[^/]+\/?$/i.test(String(value)));
  const hasRuntime = urls.some((value) => /\/tools\/flow\/project\/[^/]+\/tool(?:-version)?\//i.test(String(value)));
  // Prefer the least cluttered complete session when two restarted workers
  // advertise the same Flow project. A stale worker often retains a large
  // catalog/tab set while the reloaded canonical worker has exactly base +
  // runtime. This preference is only applied after project-path matching.
  return [hasBase && hasRuntime ? 1 : 0, -Number(visibility.googleFlowTabs || 0), Number(connection.lastSeenAt || 0)];
}

function preferredFlowProjectTarget(state, sockets, message) {
  const requested = flowProjectPathFromValue(message?.settings?.flowProjectUrl || message?.settings?.providerWorkspaceUrl || message?.providerWorkspaceUrl);
  if (!requested) return sockets;
  const matching = sockets.filter((socket) => flowConnectionProjectPath(state, socket) === requested);
  if (!matching.length) return sockets;
  matching.sort((left, right) => {
    const a = flowConnectionPreference(state, left), b = flowConnectionPreference(state, right);
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return b[i] - a[i];
    return connectionSortKey(state, left).localeCompare(connectionSortKey(state, right));
  });
  return [matching[0]];
}

function canHandle(state, socket, provider) {
  const { runtime } = state;
  const connection = runtime.connections.get(socket) || {};
  if (String(connection.extensionId || "").endsWith(":content-direct")) return provider === "google-flow";
  if (!connection.extensionId || !Array.isArray(connection.providers) || !connection.providers.includes(provider)) return false;
  if (!Number(connection.lastSeenAt) || runtime.nowMs() - Number(connection.lastSeenAt) > 75_000) return false;
  return providerVisible(connection, provider) && capabilityIssues(connection.capabilities, { provider }).ok;
}

function messageCapabilityRequirement(message) {
  const settings = message?.settings || message?.body?.settings || {};
  return {
    protocolVersion: message?.protocolVersion === "2" ? 2 : 1,
    provider: providerFor(message),
    executor: String(settings.flowExecutor || settings.executor || message?.executor || ""),
    task: String(message?.task || message?.body?.task || "")
  };
}

function capabilityAllows(state, socket, message) {
  const connection = state.runtime.connections.get(socket) || {};
  if (message?.protocolVersion === "2" && connection.pairing && connection.pairing.state !== "confirmed") return false;
  let messageBytes = 0;
  try { messageBytes = Buffer.byteLength(JSON.stringify(message)); } catch { return false; }
  return capabilityIssues(connection.capabilities, messageCapabilityRequirement(message), messageBytes).ok;
}

function connectionExtensionMatches(connection, destination) {
  const extensionIdentity = String(destination.extensionInstanceId || "");
  return Boolean(extensionIdentity && [String(connection.extensionId || ""), String(connection.extensionInstanceId || "")].includes(extensionIdentity));
}

function destinationSessionMatches(connection, message) {
  const sessionId = String(message.route?.sessionId || "");
  return !sessionId || String(connection.sessionId || "") === sessionId;
}

function destinationMatchesConnection(state, socket, message) {
  if (message?.protocolVersion !== "2") return true;
  const connection = state.runtime.connections.get(socket) || {};
  const destination = message.destination || {};
  return connectionExtensionMatches(connection, destination) && destinationSessionMatches(connection, message);
}

function isDirectFlow(state, socket) {
  return String(state.runtime.connections.get(socket)?.extensionId || "").endsWith(":content-direct");
}

function openSockets(state) {
  return Array.from(state.runtime.sockets).filter((socket) => socket.readyState === 1);
}

function canonicalFlow(state, open = openSockets(state)) {
  return canonicalizeConnections(state, open.filter((socket) => !isDirectFlow(state, socket) && canHandle(state, socket, "google-flow")));
}

function ignoreDirectFlowMessage(state, socket, message) {
  return isDirectFlow(state, socket) && ["JOB_STATUS", "JOB_RESULT"].includes(String(message?.type || "")) && canonicalFlow(state).length > 0;
}

function broadcast(state, message) {
  if (messageJobKey(message)) return send(state, message);
  let sent = 0;
  for (const socket of state.runtime.sockets) if (safeSend(state, socket, message)) sent += 1;
  return sent;
}

function connectionSortKey(state, socket) {
  const connection = state.runtime.connections.get(socket) || {};
  // Package ids are shared by every browser profile. Use the stable
  // installation identity for leases whenever the extension provides it;
  // otherwise retain the legacy package-id/session fallback.
  return `${connection.extensionInstanceId || connection.extensionId || ""}\u0000${connection.sessionId || ""}`;
}

function leasedSocketForJob(state, jobKey, open, targeted) {
  const { jobLeases } = state;
  const lease = jobLeases.inspect(jobKey);
  if (!lease) return { socket: undefined, blocked: false, lease: undefined };
  if (!jobLeases.active(jobKey)) return { socket: undefined, blocked: true, lease };
  const leased = open.find((socket) => connectionSortKey(state, socket) === lease.endpoint);
  if (!leased) {
    const endpointStillOpen = open.some((socket) => connectionSortKey(state, socket) === lease.endpoint);
    if (endpointStillOpen || targeted.length > 0) return { socket: undefined, blocked: true, lease };
    jobLeases.release(jobKey);
    return { socket: undefined, blocked: false, lease: undefined };
  }
  if (!targeted.includes(leased)) return { socket: undefined, blocked: true, lease };
  return { socket: leased, blocked: false, lease };
}

function leaseRouteMatches(state, message, lease, endpoint) {
  if (message?.protocolVersion !== "2" || !lease) return true;
  return state.jobLeases.matches(messageJobKey(message), endpoint, message.route?.leaseId, message.route?.fencingToken);
}

function send(state, message) {
  const { runtime, targetCursors, outboundSequences, jobLeases } = state;
  if (message?.protocolVersion === "2") {
    const validation = validateEnvelope(message, { nowMs: runtime.nowMs() });
    if (!validation.ok) return 0;
  }
  const open = openSockets(state);
  const provider = providerFor(message);
  const targeted = provider ? open.filter((socket) => canHandle(state, socket, provider) && destinationMatchesConnection(state, socket, message)) : open.filter((socket) => destinationMatchesConnection(state, socket, message));
  const capable = targeted.filter((socket) => capabilityAllows(state, socket, message));
  const preferred = provider === "google-flow" ? canonicalFlow(state, capable) : [];
  const selected = provider === "google-flow"
    ? preferredFlowProjectTarget(state, preferred.length ? preferred : capable, message)
    : (preferred.length ? preferred : capable);
  if (!selected.length) return 0;
  // A job envelope is point-to-point. Sending it to every capable extension
  // creates duplicate submits and makes tab ownership impossible to audit.
  const ordered = [...selected].sort((left, right) => connectionSortKey(state, left).localeCompare(connectionSortKey(state, right)));
  const cursorKey = provider || "__unscoped__";
  const cursor = Number(targetCursors.get(cursorKey) || 0);
  const jobKey = messageJobKey(message);
  const leased = jobKey ? leasedSocketForJob(state, jobKey, open, capable) : { socket: undefined, blocked: false, lease: undefined };
  if (leased.blocked) return 0;
  const selectedSocket = leased.socket || ordered[cursor % ordered.length];
  const hasLease = Boolean(leased.socket);
  if (jobKey && !leaseRouteMatches(state, message, leased.lease, connectionSortKey(state, selectedSocket))) return 0;
  if (message?.protocolVersion === "2") {
    const lastSequence = Number(outboundSequences.get(selectedSocket) || 0);
    const validation = validateEnvelope(message, { nowMs: runtime.nowMs(), lastSequence });
    if (!validation.ok) return 0;
    if (!hasLease && jobKey) {
      const acquired = jobLeases.acquire(jobKey, connectionSortKey(state, selectedSocket));
      if (!acquired.ok) return 0;
    }
    if (!safeSend(state, selectedSocket, message)) { if (!hasLease && jobKey) jobLeases.release(jobKey); return 0; }
    outboundSequences.set(selectedSocket, Number(message.sequence));
    if (!hasLease) targetCursors.set(cursorKey, cursor + 1);
    return 1;
  }
  if (!hasLease && jobKey) {
    const acquired = jobLeases.acquire(jobKey, connectionSortKey(state, selectedSocket));
    if (!acquired.ok) return 0;
  }
  if (!safeSend(state, selectedSocket, message)) { if (!hasLease && jobKey) jobLeases.release(jobKey); return 0; }
  if (!hasLease) targetCursors.set(cursorKey, cursor + 1);
  return 1;
}

function activeConnections(state) {
  const { runtime } = state;
  const active = openSockets(state).filter((socket) => {
    if (isDirectFlow(state, socket)) return false;
    const lastSeenAt = Number(runtime.connections.get(socket)?.lastSeenAt || 0);
    return lastSeenAt > 0 && runtime.nowMs() - lastSeenAt <= 75_000;
  });
  return canonicalizeConnections(state, active).map((socket) => runtime.connections.get(socket) || {});
}

function connectionIdentity(state, socket) {
  const connection = state.runtime.connections.get(socket) || {};
  // `extensionId` identifies the package, not the browser installation. Two
  // profiles may legitimately run the same extension at once, so collapsing
  // by package id can discard the profile that owns the Flow runtime.
  return String(connection.extensionInstanceId || connection.extensionId || "");
}

function connectionQuality(state, socket) {
  const connection = state.runtime.connections.get(socket) || {};
  const visibility = connection.providerVisibility || {};
  return [
    connection.pairing?.state === "confirmed" ? 2 : 0,
    Number(visibility.googleFlowProjectTabs || 0) > 0 ? 1 : 0,
    Number(connection.lastSeenAt || 0)
  ];
}

function canonicalizeConnections(state, sockets) {
  const selected = new Map();
  for (const socket of sockets) {
    const key = connectionIdentity(state, socket) || `socket:${selected.size}`;
    const prior = selected.get(key);
    if (!prior || isHigherConnectionQuality(connectionQuality(state, socket), connectionQuality(state, prior))) {
      selected.set(key, socket);
    }
  }
  return [...selected.values()];
}

function isHigherConnectionQuality(candidate, prior) {
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] === prior[index]) continue;
    return candidate[index] > prior[index];
  }
  return false;
}

function status(state) {
  const { runtime } = state;
  const openSocketCount = openSockets(state).length;
  const connections = activeConnections(state);
  const versions = connections.map((item) => item.version).filter(Boolean);
  return { connectedExtensions: connections.length, openSocketCount, expectedVersion: runtime.expectedVersion, versions, connections: connections.map((item) => ({ extensionId: item.extensionId || "", ...(item.extensionInstanceId ? { extensionInstanceId: item.extensionInstanceId } : {}), version: item.version || "", providerVisibility: item.providerVisibility || {}, ...(item.pairing ? { pairing: item.pairing } : {}), ...(item.discovery && Object.keys(item.discovery).length ? { discovery: item.discovery } : {}), ...(item.capabilities && Object.keys(item.capabilities).length ? { capabilities: item.capabilities } : {}) })), updateRequired: versions.some((version) => version !== runtime.expectedVersion), identifying: connections.length > versions.length };
}

function publishStatus(state) {
  state.runtime.sendToRenderer("studio:bridge", status(state));
}

function heartbeat(state) {
  const { runtime } = state;
  const nonce = runtime.randomId();
  for (const socket of Array.from(runtime.sockets)) {
    const connection = runtime.connections.get(socket) || {};
    const stale = connection.extensionId && !String(connection.extensionId).endsWith(":content-direct") && Number(connection.lastSeenAt) > 0 && runtime.nowMs() - Number(connection.lastSeenAt) > 75_000;
    if (socket.readyState !== socket.OPEN || stale) { drop(state, socket); if (stale) try { socket.terminate(); } catch {} continue; }
    safeSend(state, socket, { type: "PING", nonce });
  }
  publishStatus(state);
}

module.exports = { createBridgeConnectionManager };
