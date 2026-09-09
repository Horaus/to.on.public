const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = 3778;
const TTL = 90_000;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const id = (p) => `${p}_${crypto.randomUUID()}`;

function validateV2Manifest(message) {
  if (Number(message.schemaVersion || 1) !== 2) return { ok: true };
  const required = ['jobId', 'projectId', 'shotId', 'prompt', 'aspectRatio', 'durationSeconds', 'idempotencyKey'];
  const missing = required.filter((field) => message[field] === undefined || message[field] === null || String(message[field]).trim() === '');
  if (missing.length) return { ok: false, error: 'invalid_manifest', fields: missing };
  if (!['9:16', '16:9'].includes(String(message.aspectRatio))) return { ok: false, error: 'invalid_manifest', fields: ['aspectRatio'] };
  if (![4, 6, 8].includes(Number(message.durationSeconds))) return { ok: false, error: 'invalid_manifest', fields: ['durationSeconds'] };
  if (!['frames', 'components'].includes(String(message.sourceMode || 'frames'))) return { ok: false, error: 'invalid_manifest', fields: ['sourceMode'] };
  if (message.quality !== undefined && !['fast', 'quality'].includes(String(message.quality))) return { ok: false, error: 'invalid_manifest', fields: ['quality'] };
  if (message.audioPolicy !== undefined && !['separate_audio_pass', 'native_audio'].includes(String(message.audioPolicy))) return { ok: false, error: 'invalid_manifest', fields: ['audioPolicy'] };
  if (message.audioPolicy === 'native_audio' && message.generateAudio === false) return { ok: false, error: 'invalid_audio_policy', fields: ['generateAudio', 'audioPolicy'] };
  if (message.generateAudio !== undefined && typeof message.generateAudio !== 'boolean') return { ok: false, error: 'invalid_manifest', fields: ['generateAudio'] };
  if (message.outputLanguage !== undefined && !String(message.outputLanguage).trim()) return { ok: false, error: 'invalid_manifest', fields: ['outputLanguage'] };
  if (message.outputResolution !== undefined && !['720p', '1080p'].includes(String(message.outputResolution))) return { ok: false, error: 'invalid_manifest', fields: ['outputResolution'] };
  if (message.flowVideoMode !== undefined && !['frames', 'components'].includes(String(message.flowVideoMode))) return { ok: false, error: 'invalid_manifest', fields: ['flowVideoMode'] };
  if (message.resultType !== undefined && String(message.resultType) !== 'video') return { ok: false, error: 'invalid_manifest', fields: ['resultType'] };
  if (message.mode !== undefined && String(message.mode) !== 'video') return { ok: false, error: 'invalid_manifest', fields: ['mode'] };
  if (String(message.sourceMode || 'frames') === 'components' && message.componentIds !== undefined && (!Array.isArray(message.componentIds) || !message.componentIds.length || message.componentIds.some((value) => !String(value || '').trim()))) return { ok: false, error: 'invalid_component_identity', fields: ['componentIds'] };
  if (message.voiceLock !== undefined) {
    if (!message.voiceLock || typeof message.voiceLock !== 'object' || !String(message.voiceLock.characterId || '').trim() || !String(message.voiceLock.voiceSignature || '').trim()) return { ok: false, error: 'invalid_voice_lock', fields: ['voiceLock.characterId', 'voiceLock.voiceSignature'] };
    if (message.voiceLock.voiceId !== undefined && !String(message.voiceLock.voiceId).trim()) return { ok: false, error: 'invalid_voice_lock', fields: ['voiceLock.voiceId'] };
  }
  if (String(message.sourceMode || 'frames') === 'frames') {
    if (!String(message.imageMediaId || '').trim()) return { ok: false, error: 'invalid_media_identity', fields: ['imageMediaId'] };
    if (!String(message.imageMediaId).startsWith('fe_id_')) return { ok: false, error: 'invalid_media_identity', fields: ['imageMediaId'] };
  }
  return { ok: true };
}

function validateV2Result(message, manifest = undefined) {
  if (Number(message.schemaVersion || 1) !== 2) return { ok: true };
  const status = String(message.status || "").toLowerCase();
  if (!["done", "approved", "review_required"].includes(status)) return { ok: true };
  const providerJobId = String(message.providerJobId || message.providerMetadata?.providerJobId || "").trim();
  const flowMediaId = String(message.flowMediaId || message.providerMediaId || message.providerMetadata?.flowMediaId || "").trim();
  const missing = [];
  if (!/^flow_/.test(providerJobId)) missing.push("providerJobId");
  if (!/^fe_id_/.test(flowMediaId)) missing.push("flowMediaId");
  if (message.resultType !== undefined && String(message.resultType) !== "video") missing.push("resultType");
  if (message.mimeType !== undefined && String(message.mimeType).toLowerCase() !== "video/mp4") missing.push("mimeType");
  const providerMetadata = message.providerMetadata && typeof message.providerMetadata === "object" ? message.providerMetadata : {};
  if (manifest?.voiceLock && message.voiceLockVerified !== true && providerMetadata.voiceLockVerified !== true) missing.push("voiceLockVerified");
  if (manifest?.voiceLock) {
    const returnedVoice = message.voiceLock && typeof message.voiceLock === "object" ? message.voiceLock : providerMetadata.voiceLock;
    if (!returnedVoice || String(returnedVoice.characterId || "") !== String(manifest.voiceLock.characterId) || String(returnedVoice.voiceSignature || "") !== String(manifest.voiceLock.voiceSignature)) missing.push("voiceLock");
    if (manifest.voiceLock.voiceId !== undefined && String(returnedVoice?.voiceId || "") !== String(manifest.voiceLock.voiceId)) missing.push("voiceLock.voiceId");
  }
  // A v2 terminal result is an auditable handoff, not merely a video-shaped
  // blob. Every render contract field requested by the desktop must therefore
  // be echoed by the extension/provider result. Missing fields are failures;
  // accepting them would make a result impossible to bind to the requested
  // mode or shot settings.
  for (const field of ["aspectRatio", "sourceMode", "quality", "audioPolicy", "outputLanguage", "outputResolution"]) {
    if (manifest?.[field] !== undefined) {
      if (message[field] === undefined || message[field] === null || String(message[field]).trim() === "") missing.push(field);
      else if (String(message[field]) !== String(manifest[field])) missing.push(field);
    }
  }
  if (manifest?.durationSeconds !== undefined) {
    if (message.durationSeconds === undefined || message.durationSeconds === null || Number.isNaN(Number(message.durationSeconds))) missing.push("durationSeconds");
    else if (Number(message.durationSeconds) !== Number(manifest.durationSeconds)) missing.push("durationSeconds");
  }
  return missing.length ? { ok: false, error: "incomplete_provider_result", fields: missing } : { ok: true };
}

function createBridge(options = {}) {
  const port = Number(options.port ?? process.env.FLOW_BRIDGE_V2_PORT ?? DEFAULT_PORT);
  const token = String(options.token ?? process.env.FLOW_BRIDGE_V2_TOKEN ?? '');
  const peers = new Map();
  const leases = new Map();
  const completed = new Map();
  const idempotencyClaims = new Map();
  const now = () => Date.now();
  const cleanup = () => {
    const timestamp = now();
    for (const [peerId, peer] of peers) if (timestamp - peer.lastSeen >= TTL) { try { peer.socket.terminate(); } catch {} peers.delete(peerId); }
    for (const [jobId, lease] of leases) if (timestamp - lease.createdAt >= TTL) leases.delete(jobId);
    for (const [jobId, finishedAt] of completed) if (timestamp - finishedAt >= TTL) completed.delete(jobId);
    for (const [key, claim] of idempotencyClaims) if (timestamp - claim.createdAt >= TTL) idempotencyClaims.delete(key);
  };
  const send = (socket, message) => { if (socket.readyState !== 1) return false; socket.send(JSON.stringify(message)); return true; };
  const publicStatus = () => { cleanup(); return { ok: true, service: 'flow-bridge-v2', peers: [...peers.values()].map(({ id, role, flowTabs, lastSeen }) => ({ id, role, flowTabs, ageMs: Math.max(0, now() - lastSeen) })), leases: [...leases.values()].map(({ jobId, leaseId, extensionId }) => ({ jobId, leaseId, extensionId })) }; };
  const capabilities = () => ({ ok: true, service: 'flow-bridge-v2', schemaVersion: 2, protocol: 'flow-bridge-v2', providers: ['google-flow'], tasks: ['image_to_video'], sourceModes: ['frames', 'components'], qualities: ['fast', 'quality'], audioPolicies: ['separate_audio_pass', 'native_audio'], outputResolutions: ['720p', '1080p'], terminalStatuses: ['done', 'approved', 'review_required'] });
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(publicStatus())); return; }
    if (req.url === '/capabilities') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(capabilities())); return; }
    res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });
  const wss = new WebSocketServer({ server });
  const peerFor = (role) => [...peers.values()].find((p) => p.role === role && now() - p.lastSeen < TTL);
  const fail = (socket, error, extra = {}) => send(socket, { type: 'BRIDGE_ERROR', error, ...extra });

  wss.on('connection', (socket) => {
    const peer = { socket, id: '', role: '', flowTabs: 0, lastSeen: now() };
    socket.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return fail(socket, 'invalid_json'); }
      if (Buffer.byteLength(JSON.stringify(m)) > MAX_MESSAGE_BYTES) return fail(socket, 'message_too_large');
      if (token && String(m.token || '') !== token) return fail(socket, 'unauthorized');
      peer.lastSeen = now();
      if (m.type === 'HELLO') {
        peer.id = String(m.clientId || id('peer')); peer.role = String(m.role || ''); peer.flowTabs = Number(m.flowTabs || m.providerVisibility?.googleFlowProjectTabs || 0);
        if (!['desktop', 'extension', 'flow'].includes(peer.role)) return fail(socket, 'invalid_role');
        peers.set(peer.id, peer);
        return send(socket, { type: 'HELLO_ACK', clientId: peer.id, sessionId: id('session'), protocol: 'flow-bridge-v2', heartbeatMs: 15000 });
      }
      if (!peer.id) return fail(socket, 'hello_required');
      if (m.type === 'PING') return send(socket, { type: 'PONG', clientId: peer.id });
      if (m.type === 'FLOW_STATE') { peer.flowTabs = Number(m.projectTabs ?? m.flowTabs ?? peer.flowTabs); return send(socket, { type: 'FLOW_STATE_ACK', flowTabs: peer.flowTabs }); }
      if (m.type === 'RUN_JOB' && peer.role === 'desktop') {
        const manifest = validateV2Manifest(m);
        if (!manifest.ok) return fail(socket, manifest.error, { jobId: m.jobId || '', fields: manifest.fields });
        const ext = peerFor('extension'); if (!ext) return fail(socket, 'extension_not_ready', { jobId: m.jobId || '' });
        const jobId = String(m.jobId || '');
        if (!jobId) return fail(socket, 'job_id_required');
        const idempotencyKey = String(m.idempotencyKey || '');
        if (completed.has(jobId) || leases.has(jobId) || idempotencyClaims.has(idempotencyKey)) return fail(socket, 'duplicate_job', { jobId: m.jobId, idempotencyKey });
        const lease = { jobId: String(m.jobId || ''), leaseId: id('lease'), extensionId: ext.id, desktopId: peer.id, createdAt: now(), idempotencyKey, manifest: { aspectRatio: m.aspectRatio, durationSeconds: m.durationSeconds, sourceMode: m.sourceMode, quality: m.quality, audioPolicy: m.audioPolicy, outputLanguage: m.outputLanguage, outputResolution: m.outputResolution, voiceLock: m.voiceLock } };
        leases.set(lease.jobId, lease);
        idempotencyClaims.set(idempotencyKey, { jobId: lease.jobId, createdAt: now() });
        if (!send(ext.socket, { ...m, type: 'RUN_JOB', leaseId: lease.leaseId })) { leases.delete(lease.jobId); idempotencyClaims.delete(idempotencyKey); return fail(socket, 'extension_unavailable', { jobId: lease.jobId }); }
        return send(socket, { type: 'JOB_ACCEPTED', jobId: lease.jobId, leaseId: lease.leaseId, extensionId: ext.id });
      }
      if (['JOB_ACK', 'JOB_STATUS', 'JOB_RESULT'].includes(m.type)) {
        const lease = leases.get(String(m.jobId || '')); if (!lease || lease.extensionId !== peer.id) return fail(socket, 'stale_or_missing_lease', { jobId: m.jobId || '' });
        if (m.type === 'JOB_RESULT') {
          const result = validateV2Result(m, lease.manifest);
          if (!result.ok) return fail(socket, result.error, { jobId: m.jobId || '', fields: result.fields });
        }
        const desktop = peers.get(lease.desktopId); if (desktop) send(desktop.socket, { ...m, leaseId: lease.leaseId });
        if (m.type === 'JOB_RESULT') { leases.delete(lease.jobId); completed.set(lease.jobId, now()); }
      }
    });
    const drop = () => { if (peer.id) peers.delete(peer.id); for (const [job, l] of leases) if (l.extensionId === peer.id || l.desktopId === peer.id) leases.delete(job); };
    socket.on('close', drop); socket.on('error', drop);
  });
  return { server, start: () => new Promise((r) => server.listen(port, '127.0.0.1', r)), stop: () => new Promise((r) => { for (const p of peers.values()) p.socket.terminate(); wss.close(); server.close(r); }), status: publicStatus, capabilities, port };
}

if (require.main === module) { const b = createBridge(); b.start().then(() => console.log(`Flow Bridge v2 listening on ws://127.0.0.1:${b.port}`)); }
module.exports = { createBridge, validateV2Manifest, validateV2Result };
