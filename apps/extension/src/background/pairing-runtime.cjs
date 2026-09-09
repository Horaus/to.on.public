async function derivePairingConfirmation(secret, fields) {
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const input = [fields.pairingId, fields.nonce, fields.extensionInstanceId, fields.sessionId].map((value) => String(value || "")).join("\u0000");
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, "0")).join("");
}

function pairingMatches(context, message) {
  return Boolean(context.pairing && String(message.pairingId || "") === context.pairing.pairingId);
}

function updatePairingState(context, state) {
  if (context.pairing) context.pairing = { ...context.pairing, state };
}

function beginPairing(context, message) {
  context.challenge = {
    pairingId: String(message.pairingId || ""),
    nonce: String(message.nonce || ""),
    extensionInstanceId: context.options.extensionInstanceId(),
    sessionId: context.options.extensionSessionId
  };
  context.pairing = {
    pairingId: context.challenge.pairingId,
    code: String(message.code || ""),
    state: "pending",
    expiresAt: Number(message.expiresAt || 0) || undefined
  };
  void resumePairing(context, context.challenge);
}

function acceptPairingApproval(context, message) {
  if (pairingMatches(context, message)) updatePairingState(context, "secret_sent");
  void confirmPairing(context, message);
}

function resolvePairing(context, message) {
  if (!pairingMatches(context, message)) return;
  updatePairingState(context, message.type === "BRIDGE_PAIRING_CONFIRMED" ? "confirmed" : "rejected");
}

async function resumePairing(context, challenge) {
  const storage = chrome.storage?.local;
  if (!challenge.pairingId || !storage?.get) return;
  try {
    const stored = await storage.get(context.options.pairingSecretStorageKey);
    const secret = String(stored?.[context.options.pairingSecretStorageKey] || "");
    if (!/^[a-f0-9]{64}$/i.test(secret) || context.challenge?.pairingId !== challenge.pairingId) return;
    const proof = await derivePairingConfirmation(secret, challenge);
    updatePairingState(context, "secret_sent");
    context.options.send({ type: "BRIDGE_PAIRING_RESUME", pairingId: challenge.pairingId, extensionId: context.options.extensionId, extensionInstanceId: challenge.extensionInstanceId, sessionId: challenge.sessionId, proof });
  } catch (error) {
    context.options.onError(error instanceof Error ? error.message : String(error));
  }
}

async function confirmPairing(context, message) {
  const secret = String(message.secret || "");
  const challenge = context.challenge;
  const storage = chrome.storage?.local;
  if (!challenge || !secret || String(message.pairingId || "") !== challenge.pairingId || !storage?.set) {
    context.options.onError("Bridge pairing approval is missing a valid challenge or secure extension storage.");
    if (pairingMatches(context, message)) updatePairingState(context, "rejected");
    return;
  }
  try {
    await storage.set({ [context.options.pairingSecretStorageKey]: secret });
    const proof = await derivePairingConfirmation(secret, challenge);
    context.options.send({ type: "BRIDGE_PAIRING_CONFIRM", pairingId: challenge.pairingId, proof });
  } catch (error) {
    context.options.onError(error instanceof Error ? error.message : String(error));
    if (pairingMatches(context, message)) updatePairingState(context, "rejected");
  }
}

function handlePairingMessage(context, message) {
  if (message.type === "BRIDGE_PAIRING_CHALLENGE") { beginPairing(context, message); return true; }
  if (message.type === "BRIDGE_PAIRING_APPROVED") { acceptPairingApproval(context, message); return true; }
  if (message.type === "BRIDGE_PAIRING_CONFIRMED" || message.type === "BRIDGE_PAIRING_REJECTED") { resolvePairing(context, message); return true; }
  return false;
}

function createPairingRuntime(options) {
  const context = { options, challenge: undefined, pairing: undefined };
  return {
    handleMessage: (message) => handlePairingMessage(context, message),
    status: () => context.pairing ? { ...context.pairing } : undefined
  };
}

module.exports = { createPairingRuntime };
