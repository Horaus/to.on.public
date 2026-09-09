
function mutateRuntimeState(runtime, mutator, metadata) {
  if (typeof runtime.mutateState === "function") return runtime.mutateState(mutator, metadata);
  mutator(runtime.state);
  return runtime.state;
}

function getRuntimeState(runtime) {
  return typeof runtime.getState === "function" ? runtime.getState() : runtime.state;
}

function registerVoiceClipHandler(runtime) {
  const { ipcMain } = runtime;
  ipcMain.handle("studio:generate-voice-clip", (_, payload) => handleVoiceClip(runtime, payload));
}

function buildVoiceRenderContext(runtime, payload) {
  const { crypto, path, dataRoot, fs, now, validateVoiceRender } = runtime;
  const target = resolveVoiceTarget(runtime, payload);
  const { projectId, shotId, characterId, preview, project, shot, character, profile, sequencePosition } = target;
  const text = String(payload?.text || (preview ? `Xin chào, tôi là ${character.name}.` : shot.dialogue) || "").trim();
  const delivery = preview ? (profile.defaultDelivery || "offscreen_voiceover") : (shot.speechDelivery || "onscreen_lipsync");
  const validation = validateVoiceRender({ text, voiceProfile: profile, delivery, speechType: preview ? "narration" : shot.speechType, availableDurationSec: sequencePosition.availableDurationSec, recordingSource: preview ? undefined : shot.recordingSource });
  const jobId = `audio_${crypto.randomUUID().slice(0, 8)}`;
  const audioDir = path.join(dataRoot, "projects", projectId, "audio", "voices");
  fs.mkdirSync(audioDir, { recursive: true });
  const baseName = `${preview ? "preview" : shotId}-${jobId}`;
  const timestamp = now();
  const job = createVoiceJob({ projectId, shotId, characterId, preview, project, shot, profile, delivery, sequencePosition, validation, jobId, timestamp, text });
  mutateRuntimeState(runtime, (state) => state.jobs.push(job), { reason: "voice-job-created", jobId });
  runtime.saveState(); runtime.sendToRenderer("studio:state", getRuntimeState(runtime));
  return { ...target, delivery, validation, jobId, audioDir, baseName, aiffPath: path.join(audioDir, `${baseName}.aiff`), outputPath: path.join(audioDir, `${baseName}.m4a`), job };
}

function resolveVoiceTarget(runtime, payload) {
  const { locateSpeechOnSequence } = runtime;
  const state = getRuntimeState(runtime);
  const projectId = String(payload?.projectId || "");
  const shotId = String(payload?.shotId || "");
  const characterId = String(payload?.characterId || "");
  const preview = payload?.preview === true;
  const project = state.projects.find((item) => item.id === projectId);
  const shot = state.shots.find((item) => item.id === shotId);
  const character = state.characters.find((item) => item.id === characterId && item.projectId === projectId);
  if (!project || !character || (!preview && !shot)) throw new Error("Voice render target is incomplete.");
  const profile = character.voiceProfile;
  if (profile?.provider !== "macos") throw new Error("This build renders local speech only for a locked macOS voice. ElevenLabs remains an external/import provider until its audio node contract is available.");
  const sequencePosition = preview ? { timelineStartSec: 0, availableDurationSec: 15 } : locateSpeechOnSequence(project.editSequence, shot);
  if (!sequencePosition) throw new Error("The selected shot is not present in the persisted edit sequence.");
  return { projectId, shotId, characterId, preview, project, shot, character, profile, sequencePosition };
}

function createVoiceJob({ projectId, shotId, characterId, preview, project, shot, profile, delivery, sequencePosition, validation, jobId, timestamp, text }) {
  const job = {
    id: jobId, projectId, shotId: preview ? undefined : shotId, providerId: "local-macos-speech", jobType: "audio",
    input: { characterId, text, delivery, speechType: preview ? "narration" : shot.speechType, voiceId: profile.voiceId, voiceName: profile.voiceName, speakingRateWpm: profile.speakingRateWpm || 150, pitchBase: profile.pitchBase || 0, voiceSignature: profile.voiceSignature, estimatedDurationSec: validation.estimatedDurationSec, wordCount: validation.wordCount, preview, sequenceId: project.editSequence?.id, sequenceRevision: project.editSequence?.revision },
    status: "generating", statusMessage: `Rendering ${preview ? "voice preview" : validation.kind} with locked voice ${profile.voiceName}.`, progress: 0.15,
    resultAssetIds: [], createdAt: timestamp, updatedAt: timestamp
  };
  return job;
}

function failVoiceJob(runtime, context, message) {
  const { now, saveState, sendToRenderer } = runtime;
  mutateRuntimeState(runtime, (state) => {
    const job = state.jobs.find((item) => item.id === context.job.id);
    if (!job) return;
    job.status = "failed_manual";
    job.error = message;
    job.statusMessage = message;
    job.updatedAt = now();
  }, { reason: "voice-job-failed", jobId: context.job.id });
  saveState();
  sendToRenderer("studio:state", getRuntimeState(runtime));
}

function handleVoiceClip(runtime, payload) {
  const context = buildVoiceRenderContext(runtime, payload);
  const { spawn, speechTextForMacos, profile } = runtime;
  const sayProcess = spawn("/usr/bin/say", ["-v", profile.voiceId, "-r", String(Math.max(80, Math.min(240, profile.speakingRateWpm || 150))), "-o", context.aiffPath, speechTextForMacos(context.job.input.text, profile.pitchBase)], { stdio: ["ignore", "ignore", "pipe"] });
  let sayError = "";
  sayProcess.stderr.on("data", (chunk) => { sayError += String(chunk); });
  sayProcess.on("close", (sayCode) => {
    if (sayCode !== 0 || !runtime.fs.existsSync(context.aiffPath)) return failVoiceJob(runtime, context, sayError.trim() || `macOS speech exited with code ${sayCode}`);
    normalizeVoiceRender(runtime, context);
  });
  return getRuntimeState(runtime);
}

function normalizeVoiceRender(runtime, context) {
  const { job } = context;
  const { fs, path, execFileSync, __dirname, speechTextForMacos, spawn } = runtime;
  mutateRuntimeState(runtime, (state) => {
    const current = state.jobs.find((item) => item.id === job.id);
    if (current) { current.progress = 0.65; current.statusMessage = "Normalizing voice audio to AAC 48kHz stereo."; current.updatedAt = runtime.now(); }
  }, { reason: "voice-job-normalizing", jobId: job.id });
  runtime.sendToRenderer("studio:state", getRuntimeState(runtime));
  let normalizeSourcePath = context.aiffPath;
  const processedPath = path.join(context.audioDir, `${context.baseName}-processed.caf`);
  if (!context.preview && ["recording", "internal_voice"].includes(context.delivery)) {
    try {
      execFileSync("/usr/bin/swift", [path.resolve(__dirname, "../../../../scripts/process-voice.swift"), context.aiffPath, processedPath, context.delivery], { cwd: path.resolve(__dirname, "../../../.."), timeout: 30_000, stdio: ["ignore", "ignore", "pipe"] });
      normalizeSourcePath = processedPath;
    } catch (error) {
      return failVoiceJob(runtime, context, `Voice delivery processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const convert = spawn("/usr/bin/afconvert", [normalizeSourcePath, context.outputPath, "-f", "m4af", "-d", "aac@48000", "-c", "2"], { stdio: ["ignore", "ignore", "pipe"] });
  let convertError = "";
  convert.stderr.on("data", (chunk) => { convertError += String(chunk); });
  convert.on("close", (convertCode) => finalizeVoiceRender(runtime, context, normalizeSourcePath, convertCode, convertError));
}

function cleanupVoiceInputs(fs, context, normalizeSourcePath) {
  try { fs.unlinkSync(context.aiffPath); } catch { /* normalized output is authoritative */ }
  try { if (normalizeSourcePath !== context.aiffPath) fs.unlinkSync(normalizeSourcePath); } catch { /* normalized output is authoritative */ }
}

function finalizeVoiceRender(runtime, context, normalizeSourcePath, convertCode, convertError) {
  const { fs, probeLocalAudioDurationSeconds, crypto, toStudioMediaUrl, now, state, logEvent, saveState, sendToRenderer } = runtime;
  cleanupVoiceInputs(fs, context, normalizeSourcePath);
  const durationSeconds = probeLocalAudioDurationSeconds(context.outputPath);
  if (convertCode !== 0 || !durationSeconds) return failVoiceJob(runtime, context, convertError.trim() || `Audio normalization exited with code ${convertCode}`);
  if (!context.preview && durationSeconds > context.sequencePosition.availableDurationSec + 0.1) return failVoiceJob(runtime, context, `Rendered speech is ${durationSeconds.toFixed(2)}s but the shot edit allows ${context.sequencePosition.availableDurationSec.toFixed(2)}s.`);
  const assetId = `audio_asset_${crypto.randomUUID().slice(0, 8)}`;
  const { projectId, shotId, preview, characterId, profile, delivery, job, text, outputPath } = { projectId: context.projectId, shotId: context.shotId, preview: context.preview, characterId: context.characterId, profile: context.profile, delivery: context.delivery, job: context.job, text: context.job.input.text, outputPath: context.outputPath };
  const asset = { id: assetId, projectId, shotId: preview ? undefined : shotId, type: "audio", filePath: toStudioMediaUrl(outputPath), sourceProvider: "local-macos-speech", sourceJobId: context.jobId, durationSeconds, metadata: { outputPath, mimeType: "audio/mp4", codec: "aac", sampleRate: 48000, channels: 2, characterId, voiceId: profile.voiceId, voiceName: profile.voiceName, modelId: profile.modelId || "macos-say", language: profile.language, pitchBase: profile.pitchBase || 0, voiceSignature: profile.voiceSignature, delivery, text, preview, durationSource: "measured_file" }, createdAt: now() };
  mutateRuntimeState(runtime, (draft) => {
    draft.assets.push(asset);
    const currentJob = draft.jobs.find((item) => item.id === context.job.id);
    if (currentJob) { currentJob.resultAssetIds = [assetId]; currentJob.status = "review_required"; currentJob.progress = 1; currentJob.statusMessage = preview ? "Voice preview ready." : "Voice clip attached to the persisted audio timeline."; currentJob.updatedAt = now(); }
    attachVoiceClip(runtime, context, assetId, durationSeconds, draft);
  }, { reason: "voice-audio-rendered", jobId: context.jobId, assetId });
  logEvent("voice_audio_rendered", { jobId: context.jobId, projectId, shotId: preview ? undefined : shotId, characterId, assetId, voiceId: profile.voiceId, delivery, durationSeconds, preview });
  saveState(); sendToRenderer("studio:state", state);
}

function attachVoiceClip(runtime, context, assetId, durationSeconds, draft = getRuntimeState(runtime)) {
  const { project, shot, preview, shotId, characterId, profile, validation, job } = context;
  if (preview) {
    const character = draft.characters.find((item) => item.id === characterId);
    if (character) character.voiceProfile = { ...profile, previewAssetId: assetId, previewEvidence: context.outputPath };
    return;
  }
  const audioClip = { id: `audio_clip_${runtime.crypto.randomUUID().slice(0, 8)}`, sourceAssetId: assetId, shotId, characterId, kind: validation.kind, timelineStartSec: context.sequencePosition.timelineStartSec, sourceInSec: 0, sourceOutSec: durationSeconds, timelineDurationSec: durationSeconds, gain: 1, fadeInSec: 0.03, fadeOutSec: 0.08, text: job.input.text, delivery: context.delivery, sourceLabel: shot.recordingSource, voiceSnapshot: { provider: profile.provider, voiceId: profile.voiceId, voiceName: profile.voiceName, modelId: profile.modelId, language: profile.language, pitchBase: profile.pitchBase || 0, voiceSignature: profile.voiceSignature }, createdAt: runtime.now(), updatedAt: runtime.now() };
  const currentProject = draft.projects.find((item) => item.id === project.id);
  if (currentProject) currentProject.editSequence = { ...currentProject.editSequence, audioClips: [...(currentProject.editSequence.audioClips || []).filter((item) => !(item.shotId === shotId && ["dialogue", "internal_voice", "narration", "recording"].includes(item.kind))), audioClip], audioMix: currentProject.editSequence.audioMix || { sourceGain: 0.65, dialogueGain: 1, voiceoverGain: 1, ambienceGain: 0.7, musicGain: 0.45 }, revision: currentProject.editSequence.revision + 1, updatedAt: runtime.now() };
}

function registerSoundBedHandler(runtime) {
  const { ipcMain } = runtime;
  ipcMain.handle("studio:generate-sound-bed", (_, payload) => handleSoundBed(runtime, payload));
}

function handleSoundBed(runtime, payload) {
  const { crypto, path, dataRoot, now, fs, execFileSync, probeLocalAudioDurationSeconds, toStudioMediaUrl, logEvent, __dirname } = runtime;
  const state = getRuntimeState(runtime);
  const target = resolveSoundBedTarget(runtime, payload);
  const { projectId, project, kind, timelineStartSec, durationSeconds } = target;
  const jobId = `audio_${crypto.randomUUID().slice(0, 8)}`;
  const assetId = `audio_asset_${crypto.randomUUID().slice(0, 8)}`;
  const audioDir = path.join(dataRoot, "projects", projectId, "audio", "sound-beds");
  fs.mkdirSync(audioDir, { recursive: true });
  const cafPath = path.join(audioDir, `${kind}-${jobId}.caf`);
  const outputPath = path.join(audioDir, `${kind}-${jobId}.m4a`);
  execFileSync("/usr/bin/swift", [path.resolve(__dirname, "../../../../scripts/generate-sound-bed.swift"), cafPath, kind, String(durationSeconds)], { cwd: path.resolve(__dirname, "../../../.."), timeout: 30_000, stdio: ["ignore", "ignore", "pipe"] });
  execFileSync("/usr/bin/afconvert", [cafPath, outputPath, "-f", "m4af", "-d", "aac@48000", "-c", "2"], { timeout: 30_000, stdio: ["ignore", "ignore", "pipe"] });
  try { fs.unlinkSync(cafPath); } catch { /* AAC output is authoritative */ }
  const measuredDuration = probeLocalAudioDurationSeconds(outputPath);
  if (!measuredDuration) throw new Error("Generated sound bed has no measurable duration.");
  persistSoundBed(runtime, target, { jobId, assetId, outputPath, measuredDuration, now: now(), toStudioMediaUrl, logEvent, state });
  return state;
}

function resolveSoundBedTarget(runtime, payload) {
  const state = getRuntimeState(runtime);
  const projectId = String(payload?.projectId || "");
  const project = state.projects.find((item) => item.id === projectId);
  const kind = ["rain", "machine", "horn"].includes(String(payload?.kind)) ? String(payload.kind) : "";
  const timelineStartSec = Math.max(0, Number(payload?.timelineStartSec || 0));
  const durationSeconds = Math.max(0.2, Number(payload?.durationSec || 0));
  const sequenceDuration = Math.max(0, ...(project?.editSequence?.clips || []).map((clip) => Number(clip.timelineDurationSec) + (project.editSequence.clips || []).filter((item) => item.order < clip.order).reduce((sum, item) => sum + Number(item.timelineDurationSec || 0), 0)));
  if (!project?.editSequence || !kind || !Number.isFinite(durationSeconds) || timelineStartSec + durationSeconds > sequenceDuration + 0.1) {
    throw new Error("Sound-bed target is outside the persisted edit sequence.");
  }
  return { projectId, project, kind, timelineStartSec, durationSeconds, shotId: payload?.shotId ? String(payload.shotId) : undefined, gain: Math.max(0, Number(payload?.gain ?? 1)), label: String(payload?.label || ({ rain: "Rain ambience", machine: "Lighthouse activation", horn: "Offscreen boat horn" }[kind])) };
}

function persistSoundBed(runtime, target, result) {
  const { saveState, sendToRenderer } = runtime;
  const state = getRuntimeState(runtime);
  const { projectId, project, kind, timelineStartSec, shotId, gain, label } = target;
  const { jobId, assetId, outputPath, measuredDuration, now, toStudioMediaUrl, logEvent } = result;
  const audioClip = { id: `audio_clip_${runtime.crypto.randomUUID().slice(0, 8)}`, sourceAssetId: assetId, shotId, kind: kind === "rain" ? "ambience" : "sound_effect", timelineStartSec, sourceInSec: 0, sourceOutSec: measuredDuration, timelineDurationSec: measuredDuration, gain, fadeInSec: kind === "rain" ? 0.3 : 0.02, fadeOutSec: kind === "rain" ? 0.5 : 0.12, text: label, delivery: "non_speech", createdAt: now, updatedAt: now };
  mutateRuntimeState(runtime, (draft) => {
    draft.assets.push({ id: assetId, projectId, shotId, type: "audio", filePath: toStudioMediaUrl(outputPath), sourceProvider: "local-sound-bed", sourceJobId: jobId, durationSeconds: measuredDuration, metadata: { outputPath, mimeType: "audio/mp4", codec: "aac", sampleRate: 48000, channels: 2, kind, label, durationSource: "measured_file" }, createdAt: now });
    draft.jobs.push({ id: jobId, projectId, shotId, providerId: "local-sound-bed", jobType: "audio", input: { kind, timelineStartSec, durationSec: measuredDuration, label }, status: "review_required", statusMessage: `${label} attached to the persisted audio timeline.`, progress: 1, resultAssetIds: [assetId], createdAt: now, updatedAt: now });
    const currentProject = draft.projects.find((item) => item.id === projectId);
    if (currentProject) currentProject.editSequence = { ...currentProject.editSequence, audioClips: [...(currentProject.editSequence.audioClips || []).filter((item) => !(item.kind === audioClip.kind && item.text === label)), audioClip], audioMix: currentProject.editSequence.audioMix || { sourceGain: 0, dialogueGain: 1, voiceoverGain: 1, ambienceGain: 0.7, musicGain: 0.45 }, revision: currentProject.editSequence.revision + 1, updatedAt: now };
  }, { reason: "sound-bed-generated", jobId, assetId });
  logEvent("sound_bed_generated", { jobId, projectId, assetId, kind, timelineStartSec, durationSeconds: measuredDuration });
  saveState(); sendToRenderer("studio:state", state);
}

module.exports = { registerVoiceClipHandler, registerSoundBedHandler };
