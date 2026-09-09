const crypto = require("node:crypto");
const { createPairingChallenge, derivePairingConfirmation } = require("../../../../../packages/protocol/src/connection-v2.cjs");

const PAIRING_STATES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  SECRET_SENT: "secret_sent",
  CONFIRMED: "confirmed",
  EXPIRED: "expired",
  REJECTED: "rejected"
});
const MAX_APPROVAL_ATTEMPTS = 3;

function publicSession(session) {
  if (!session) return undefined;
  return {
    pairingId: session.pairingId,
    extensionId: session.extensionId,
    extensionInstanceId: session.extensionInstanceId,
    sessionId: session.sessionId,
    code: session.code,
    nonce: session.challenge.nonce,
    state: session.state,
    issuedAt: session.challenge.issuedAt,
    expiresAt: session.challenge.expiresAt,
    approvedAt: session.approvedAt,
    confirmedAt: session.confirmedAt,
    resumedAt: session.resumedAt
  };
}

function codeForNonce(nonce) {
  return crypto.createHash("sha256").update(String(nonce)).digest("hex").slice(0, 8).toUpperCase();
}

function confirmationProof(secret, session) {
  return derivePairingConfirmation(secret, {
    pairingId: session.pairingId,
    nonce: session.challenge?.nonce || session.nonce,
    extensionInstanceId: session.extensionInstanceId,
    sessionId: session.sessionId
  });
}

function proofMatches(expected, actual, requireSecret = true) {
  if (requireSecret && !expected) return false;
  if (!/^[a-f0-9]{64}$/i.test(actual) || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function beginSession(context, socket, identity = {}) {
  const challenge = createPairingChallenge({ nowMs: context.nowMs, ttlMs: context.ttlMs, randomBytes: context.randomBytes });
  const session = {
    socket,
    pairingId: String(context.randomId()),
    challenge,
    code: codeForNonce(challenge.nonce),
    extensionId: String(identity.extensionId || ""),
    extensionInstanceId: String(identity.extensionInstanceId || ""),
    sessionId: String(identity.sessionId || ""),
    state: PAIRING_STATES.PENDING,
    approvalAttempts: 0
  };
  context.sessions.set(socket, session);
  return publicSession(session);
}

function updateSessionIdentity(context, socket, identity = {}) {
  const session = context.sessions.get(socket);
  if (!session) return undefined;
  session.extensionId = String(identity.extensionId || session.extensionId || "");
  session.extensionInstanceId = String(identity.extensionInstanceId || session.extensionInstanceId || "");
  session.sessionId = String(identity.sessionId || session.sessionId || "");
  return publicSession(session);
}

function expireSession(context, socket) {
  const session = context.sessions.get(socket);
  if (!session || session.state === PAIRING_STATES.CONFIRMED || session.state === PAIRING_STATES.REJECTED) return false;
  if (Number(context.nowMs()) <= Number(session.challenge.expiresAt)) return false;
  session.state = PAIRING_STATES.EXPIRED;
  return true;
}

function approveSession(context, socket, code) {
  expireSession(context, socket);
  const session = context.sessions.get(socket);
  if (!session || session.state !== PAIRING_STATES.PENDING) return { ok: false, code: "pairing_not_pending" };
  if (String(code || "").toUpperCase() === session.code) {
    session.state = PAIRING_STATES.APPROVED;
    session.approvedAt = Number(context.nowMs());
    return { ok: true, session: publicSession(session) };
  }
  session.approvalAttempts += 1;
  if (session.approvalAttempts >= MAX_APPROVAL_ATTEMPTS) session.state = PAIRING_STATES.REJECTED;
  return { ok: false, code: session.state === PAIRING_STATES.REJECTED ? "pairing_attempts_exhausted" : "pairing_code_mismatch" };
}

function rejectSession(context, socket) {
  const session = context.sessions.get(socket);
  if (!session || session.state === PAIRING_STATES.CONFIRMED) return false;
  session.state = PAIRING_STATES.REJECTED;
  return true;
}

function deliverPairingSecret(context, socket) {
  expireSession(context, socket);
  const session = context.sessions.get(socket);
  if (!session || session.state !== PAIRING_STATES.APPROVED || !context.secret) return { ok: false, code: "pairing_not_approved" };
  session.state = PAIRING_STATES.SECRET_SENT;
  return { ok: true, pairingId: session.pairingId, secret: context.secret };
}

function confirmSession(context, socket, proof) {
  expireSession(context, socket);
  const session = context.sessions.get(socket);
  if (!session || session.state !== PAIRING_STATES.SECRET_SENT) return { ok: false, code: "pairing_secret_not_sent" };
  if (!proofMatches(confirmationProof(context.secret, session), String(proof || ""), false)) return { ok: false, code: "pairing_confirmation_invalid" };
  session.state = PAIRING_STATES.CONFIRMED;
  session.confirmedAt = Number(context.nowMs());
  return { ok: true, session: publicSession(session) };
}

function resumeSession(context, socket, identity = {}, proof) {
  expireSession(context, socket);
  const session = context.sessions.get(socket);
  if (!session || session.state !== PAIRING_STATES.PENDING) return { ok: false, code: "pairing_not_pending" };
  updateSessionIdentity(context, socket, identity);
  if (!context.secret || !proofMatches(confirmationProof(context.secret, session), String(proof || ""))) return { ok: false, code: "pairing_resume_invalid" };
  session.state = PAIRING_STATES.CONFIRMED;
  session.confirmedAt = Number(context.nowMs());
  session.resumedAt = session.confirmedAt;
  return { ok: true, session: publicSession(session) };
}

function inspectSession(context, socket) {
  expireSession(context, socket);
  return publicSession(context.sessions.get(socket));
}

function createPairingSessions({ secret, nowMs = Date.now, ttlMs = 60_000, randomBytes = crypto.randomBytes, randomId = () => crypto.randomUUID() } = {}) {
  const context = { secret, nowMs, ttlMs, randomBytes, randomId, sessions: new Map() };
  return {
    begin: (socket, identity) => beginSession(context, socket, identity),
    updateIdentity: (socket, identity) => updateSessionIdentity(context, socket, identity),
    approve: (socket, code) => approveSession(context, socket, code),
    reject: (socket) => rejectSession(context, socket),
    deliverSecret: (socket) => deliverPairingSecret(context, socket),
    confirm: (socket, proof) => confirmSession(context, socket, proof),
    resume: (socket, identity, proof) => resumeSession(context, socket, identity, proof),
    inspect: (socket) => inspectSession(context, socket),
    remove: (socket) => context.sessions.delete(socket),
    confirmationProof: (secretValue, session) => confirmationProof(secretValue, session),
    states: PAIRING_STATES
  };
}

module.exports = { MAX_APPROVAL_ATTEMPTS, PAIRING_STATES, codeForNonce, confirmationProof, createPairingSessions };
