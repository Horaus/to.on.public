function createFlowRelayRequest({ sessionId, correlationId, idempotencyKey, manifest }) {
  const base = {
    source: "rtk-ai-video-studio",
    protocolVersion: 2,
    type: "STUDIO_SHOT_REQUEST",
    sessionId: String(sessionId || ""),
    correlationId: String(correlationId || ""),
    idempotencyKey: String(idempotencyKey || "")
  };
  return { ...base, manifest, payload: { ...base, manifest } };
}

function normalizeFlowRelayMessage(message) {
  const root = message && typeof message === "object" ? message : {};
  const nested = root.payload && typeof root.payload === "object" ? root.payload : {};
  const value = (key) => root[key] !== undefined ? root[key] : nested[key];
  return {
    source: String(value("source") || ""),
    protocolVersion: Number(value("protocolVersion") || 0),
    type: String(value("type") || ""),
    sessionId: String(value("sessionId") || ""),
    correlationId: String(value("correlationId") || ""),
    idempotencyKey: String(value("idempotencyKey") || ""),
    manifest: value("manifest")
  };
}

module.exports = { createFlowRelayRequest, normalizeFlowRelayMessage };
