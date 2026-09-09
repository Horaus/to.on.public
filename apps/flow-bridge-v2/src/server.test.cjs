const test = require('node:test'); const assert = require('node:assert/strict'); const WS = require('ws'); const { createBridge } = require('./server.cjs');
const open = (s) => new Promise((r) => s.once('open', r));
const next = (s) => new Promise((r) => s.once('message', (x) => r(JSON.parse(String(x)))));
test('pairs desktop and extension and routes one job', async () => { const b=createBridge({port:0}); await b.start(); const p=b.server.address().port; const d=new WS(`ws://127.0.0.1:${p}`), e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]); const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e'})); assert.equal((await da).type,'HELLO_ACK'); assert.equal((await ea).type,'HELLO_ACK'); const accepted=next(d), delivered=next(e); d.send(JSON.stringify({type:'RUN_JOB',jobId:'j1',provider:'google-flow'})); assert.equal((await accepted).type,'JOB_ACCEPTED'); assert.equal((await delivered).leaseId.startsWith('lease_'),true); await b.stop(); });
test('health status exposes no payload', async () => { const b=createBridge({port:0}); await b.start(); const p=b.server.address().port; const body=await new Promise((r)=>require('http').get(`http://127.0.0.1:${p}/status`,res=>{let x='';res.on('data',c=>x+=c);res.on('end',()=>r(JSON.parse(x)));})); assert.equal(body.ok,true); assert.equal('payload' in body,false); await b.stop(); });
test('capabilities exposes the v2 contract without payload data', async () => { const b=createBridge({port:0}); await b.start(); const p=b.server.address().port; const body=await new Promise((r)=>require('http').get(`http://127.0.0.1:${p}/capabilities`,res=>{let x='';res.on('data',c=>x+=c);res.on('end',()=>r(JSON.parse(x)));})); assert.equal(body.schemaVersion,2); assert.deepEqual(body.sourceModes,['frames','components']); assert.deepEqual(body.audioPolicies,['separate_audio_pass','native_audio']); assert.equal('payload' in body,false); await b.stop(); });

test('v2 manifest validation rejects missing and malformed identity fields', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d2'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e2'})); await da; await ea;
  const error=next(d); d.send(JSON.stringify({type:'RUN_JOB',schemaVersion:2,jobId:'j2',projectId:'p2',shotId:'s2',prompt:'x',aspectRatio:'9:16',durationSeconds:6,sourceMode:'frames',imageMediaId:'not-fe-id',idempotencyKey:'k2'}));
  const message=await error; assert.equal(message.type,'BRIDGE_ERROR'); assert.equal(message.error,'invalid_media_identity'); assert.deepEqual(message.fields,['imageMediaId']); await b.stop();
});

test('v2 frames manifest requires an explicit provider image identity', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d2-missing'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e2-missing'})); await da; await ea;
  const error=next(d); d.send(JSON.stringify({type:'RUN_JOB',schemaVersion:2,jobId:'j2-missing',projectId:'p2',shotId:'s2',prompt:'x',aspectRatio:'9:16',durationSeconds:4,sourceMode:'frames',idempotencyKey:'k2-missing'}));
  const message=await error; assert.equal(message.error,'invalid_media_identity'); assert.deepEqual(message.fields,['imageMediaId']); await b.stop();
});

test('v1 run jobs remain compatible while v2 fields are optional', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d3'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e3'})); await da; await ea;
  const accepted=next(d); const delivered=next(e); d.send(JSON.stringify({type:'RUN_JOB',jobId:'legacy-v1',provider:'google-flow'})); assert.equal((await accepted).type,'JOB_ACCEPTED'); assert.equal((await delivered).jobId,'legacy-v1'); await b.stop();
});

test('v2 validates audio policy and voice lock as explicit audit data', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d4'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e4'})); await da; await ea;
  const error=next(d); d.send(JSON.stringify({type:'RUN_JOB',schemaVersion:2,jobId:'j4',projectId:'p4',shotId:'s4',prompt:'x',aspectRatio:'9:16',durationSeconds:6,sourceMode:'frames',imageMediaId:'fe_id_media4',quality:'fast',audioPolicy:'native_audio',voiceLock:{characterId:'c4'},idempotencyKey:'k4'}));
  const message=await error; assert.equal(message.type,'BRIDGE_ERROR'); assert.equal(message.error,'invalid_voice_lock'); assert.deepEqual(message.fields,['voiceLock.characterId','voiceLock.voiceSignature']); await b.stop();
});

test('v2 rejects contradictory native audio and malformed component identities', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d5'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e5'})); await da; await ea;
  const error=next(d); d.send(JSON.stringify({type:'RUN_JOB',schemaVersion:2,jobId:'j5',projectId:'p5',shotId:'s5',prompt:'x',aspectRatio:'16:9',durationSeconds:4,sourceMode:'frames',imageMediaId:'fe_id_media5',audioPolicy:'native_audio',generateAudio:false,idempotencyKey:'k5'}));
  assert.equal((await error).error,'invalid_audio_policy');
  const error2=next(d); d.send(JSON.stringify({type:'RUN_JOB',schemaVersion:2,jobId:'j6',projectId:'p5',shotId:'s5',prompt:'x',aspectRatio:'16:9',durationSeconds:4,sourceMode:'components',componentIds:[''],idempotencyKey:'k6'}));
  assert.equal((await error2).error,'invalid_component_identity'); await b.stop();
});

test('v2 refuses a replay after a completed lease', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d6'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e6'})); await da; await ea;
  const accepted=next(d), delivered=next(e); d.send(JSON.stringify({type:'RUN_JOB',jobId:'j7',provider:'google-flow'})); const a=await accepted; const incoming=await delivered;
  e.send(JSON.stringify({type:'JOB_RESULT',schemaVersion:2,jobId:'j7',status:'done',providerJobId:'flow_j7',flowMediaId:'fe_id_j7',resultType:'video',mimeType:'video/mp4'})); await new Promise((resolve)=>setTimeout(resolve,10));
  const replay=next(d); d.send(JSON.stringify({type:'RUN_JOB',jobId:'j7',provider:'google-flow'})); assert.equal((await replay).error,'duplicate_job'); assert.ok(a.leaseId); assert.equal(incoming.leaseId,a.leaseId); await b.stop();
});

test('v2 refuses a different job that reuses an active idempotency key', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`), e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d-idem'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e-idem'})); await da; await ea;
  const accepted=next(d), delivered=next(e); const base={type:'RUN_JOB',schemaVersion:2,projectId:'p-idem',shotId:'s-idem',prompt:'x',aspectRatio:'9:16',durationSeconds:4,sourceMode:'frames',imageMediaId:'fe_id_media_idem',idempotencyKey:'same-key'};
  d.send(JSON.stringify({...base,jobId:'j-idem-1'})); assert.equal((await accepted).type,'JOB_ACCEPTED'); await delivered;
  const error=next(d); d.send(JSON.stringify({...base,jobId:'j-idem-2'})); const message=await error; assert.equal(message.error,'duplicate_job'); assert.equal(message.idempotencyKey,'same-key'); await b.stop();
});

test('v2 refuses a terminal result without provider identity and keeps the lease open', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d8'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e8'})); await da; await ea;
  const accepted=next(d), delivered=next(e); d.send(JSON.stringify({type:'RUN_JOB',schemaVersion:2,jobId:'j8',projectId:'p8',shotId:'s8',prompt:'x',aspectRatio:'9:16',durationSeconds:4,sourceMode:'frames',imageMediaId:'fe_id_media8',idempotencyKey:'k8'})); const a=await accepted; await delivered;
  const error=next(e); e.send(JSON.stringify({type:'JOB_RESULT',schemaVersion:2,jobId:'j8',status:'done'})); assert.equal((await error).error,'incomplete_provider_result');
  const status=next(d); e.send(JSON.stringify({type:'JOB_STATUS',schemaVersion:2,jobId:'j8',status:'generating'})); assert.equal((await status).status,'generating'); assert.ok(a.leaseId); await b.stop();
});

test('v2 binds terminal metadata to the requested voice lock and render settings', async () => {
  const b=createBridge({port:0}); await b.start(); const p=b.server.address().port;
  const d=new WS(`ws://127.0.0.1:${p}`); const e=new WS(`ws://127.0.0.1:${p}`); await Promise.all([open(d),open(e)]);
  const da=next(d), ea=next(e); d.send(JSON.stringify({type:'HELLO',role:'desktop',clientId:'d9'})); e.send(JSON.stringify({type:'HELLO',role:'extension',clientId:'e9'})); await da; await ea;
  const accepted=next(d), delivered=next(e); d.send(JSON.stringify({type:'RUN_JOB',schemaVersion:2,jobId:'j9',projectId:'p9',shotId:'s9',prompt:'x',aspectRatio:'9:16',durationSeconds:4,sourceMode:'frames',imageMediaId:'fe_id_media9',quality:'quality',voiceLock:{characterId:'c9',voiceId:'v9',voiceSignature:'sig9'},idempotencyKey:'k9'})); const a=await accepted; await delivered;
  const error=next(e); e.send(JSON.stringify({type:'JOB_RESULT',schemaVersion:2,jobId:'j9',status:'review_required',providerJobId:'flow_j9',flowMediaId:'fe_id_j9',resultType:'video',mimeType:'video/mp4',voiceLockVerified:false})); assert.deepEqual((await error).fields,['voiceLockVerified','voiceLock','voiceLock.voiceId','aspectRatio','sourceMode','quality','durationSeconds']);
  const ok=next(d); e.send(JSON.stringify({type:'JOB_RESULT',schemaVersion:2,jobId:'j9',status:'review_required',providerJobId:'flow_j9',flowMediaId:'fe_id_j9',resultType:'video',mimeType:'video/mp4',voiceLockVerified:true,voiceLock:{characterId:'c9',voiceId:'v9',voiceSignature:'sig9'},aspectRatio:'9:16',sourceMode:'frames',quality:'quality',durationSeconds:4})); assert.equal((await ok).status,'review_required'); assert.ok(a.leaseId); await b.stop();
});

test('v2 rejects a terminal result that omits requested render metadata', async () => {
  const b = createBridge({ port: 0 }); await b.start(); const p = b.server.address().port;
  const d = new WS(`ws://127.0.0.1:${p}`), e = new WS(`ws://127.0.0.1:${p}`);
  await Promise.all([open(d), open(e)]); const da = next(d), ea = next(e);
  d.send(JSON.stringify({ type: 'HELLO', role: 'desktop', clientId: 'd-metadata' }));
  e.send(JSON.stringify({ type: 'HELLO', role: 'extension', clientId: 'e-metadata' }));
  await da; await ea;
  const accepted = next(d), delivered = next(e);
  d.send(JSON.stringify({ type: 'RUN_JOB', schemaVersion: 2, jobId: 'j-metadata', projectId: 'p', shotId: 's', prompt: 'x', aspectRatio: '9:16', durationSeconds: 4, sourceMode: 'frames', imageMediaId: 'fe_id_media_metadata', quality: 'fast', audioPolicy: 'separate_audio_pass', idempotencyKey: 'k-metadata' }));
  await accepted; await delivered;
  const error = next(e);
  e.send(JSON.stringify({ type: 'JOB_RESULT', schemaVersion: 2, jobId: 'j-metadata', status: 'review_required', providerJobId: 'flow_j-metadata', flowMediaId: 'fe_id_metadata', resultType: 'video', mimeType: 'video/mp4' }));
  const message = await error;
  assert.equal(message.error, 'incomplete_provider_result');
  assert.deepEqual(message.fields, ['aspectRatio', 'sourceMode', 'quality', 'audioPolicy', 'durationSeconds']);
  await b.stop();
});

test('v2 routes a three-shot serial run one-to-one without cross-shot delivery', async () => {
  const b = createBridge({ port: 0 }); await b.start(); const p = b.server.address().port;
  const d = new WS(`ws://127.0.0.1:${p}`), e = new WS(`ws://127.0.0.1:${p}`);
  await Promise.all([open(d), open(e)]); const da = next(d), ea = next(e);
  d.send(JSON.stringify({ type: 'HELLO', role: 'desktop', clientId: 'd-serial' }));
  e.send(JSON.stringify({ type: 'HELLO', role: 'extension', clientId: 'e-serial' })); await da; await ea;
  const delivered = [];
  for (let index = 1; index <= 3; index += 1) {
    const jobId = `serial-${index}`; const accepted = next(d); const incoming = next(e);
    d.send(JSON.stringify({ type: 'RUN_JOB', schemaVersion: 2, jobId, projectId: 'p-serial', shotId: `shot-${index}`, prompt: `shot ${index}`, aspectRatio: '9:16', durationSeconds: 4, sourceMode: 'frames', imageMediaId: `fe_id_input_${index}`, quality: 'fast', audioPolicy: 'separate_audio_pass', idempotencyKey: `key-${index}` }));
    const lease = await accepted; const envelope = await incoming;
    assert.equal(lease.type, 'JOB_ACCEPTED'); assert.equal(envelope.jobId, jobId); delivered.push(envelope.leaseId);
    const result = next(d);
    e.send(JSON.stringify({ type: 'JOB_RESULT', schemaVersion: 2, jobId, status: 'review_required', providerJobId: `flow_${jobId}`, flowMediaId: `fe_id_output_${index}`, resultType: 'video', mimeType: 'video/mp4', aspectRatio: '9:16', sourceMode: 'frames', quality: 'fast', audioPolicy: 'separate_audio_pass', durationSeconds: 4 }));
    assert.equal((await result).jobId, jobId);
  }
  assert.equal(new Set(delivered).size, 3); await b.stop();
});
