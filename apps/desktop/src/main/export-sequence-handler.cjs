function buildShotWindows(sequence) {
  const shotWindows = new Map();
  let cursor = 0;
  for (const clip of sequence.clips) {
    const duration = Number(clip.timelineDurationSec || 0);
    shotWindows.set(clip.shotId, { startSec: cursor, endSec: cursor + duration });
    cursor += duration;
  }
  return shotWindows;
}

function mutateRuntimeState(deps, mutator, metadata = {}) {
  if (typeof deps.mutateState === "function") return deps.mutateState(mutator, metadata);
  const state = deps.getState();
  mutator(state);
  return state;
}

function audioGainForKind(kind, audioMix) {
  if (kind === "dialogue") return audioMix.dialogueGain;
  if (["internal_voice", "narration", "recording"].includes(kind)) return audioMix.voiceoverGain;
  return kind === "ambience" ? audioMix.ambienceGain : audioMix.musicGain;
}

function buildAudioClips(sequence, state, deps, editDurationSec, shotWindows) {
  return (sequence.audioClips || []).map((clip) => buildAudioClip(clip, sequence.audioMix || {}, state, deps, editDurationSec, shotWindows));
}

function buildAudioClip(clip, audioMix, state, deps, editDurationSec, shotWindows) {
  const { localPathFromStudioMediaUrl, fs } = deps;
  const asset = state.assets.find((item) => item.id === clip.sourceAssetId && item.type === "audio");
  const filePath = localPathFromStudioMediaUrl(asset?.filePath);
  if (!asset || !filePath || !fs.existsSync(filePath)) throw new Error(`Missing source audio for timeline clip ${clip.id}.`);
  if (clip.timelineStartSec < 0 || clip.timelineStartSec + clip.timelineDurationSec > editDurationSec + 0.05) throw new Error(`Audio clip ${clip.id} falls outside the edit runtime.`);
  const isVoice = ["dialogue", "internal_voice", "narration", "recording"].includes(clip.kind);
  const window = shotWindows.get(clip.shotId);
  return {
    id: clip.id, filePath, timelineStartSec: clip.timelineStartSec, sourceInSec: clip.sourceInSec, sourceOutSec: clip.sourceOutSec,
    gain: Math.max(0, Math.min(1, Number(clip.gain || 0) * audioGainForKind(clip.kind, audioMix))),
    fadeInSec: clip.fadeInSec || 0, fadeOutSec: clip.fadeOutSec || 0,
    sourceDuckGain: isVoice ? 0 : undefined,
    sourceDuckStartSec: isVoice ? (window?.startSec ?? clip.timelineStartSec) : undefined,
    sourceDuckEndSec: isVoice ? (window?.endSec ?? clip.timelineStartSec + clip.timelineDurationSec) : undefined
  };
}

function prepareExportRequest(payload, state, deps) {
  const { prepareMasterExportClips, localPathFromStudioMediaUrl, fs } = deps;
  const projectId = String(payload?.projectId || "");
  const project = state.projects.find((item) => item.id === projectId);
  const sequence = project?.editSequence;
  if (!project || !sequence?.clips?.length) throw new Error("A persisted edit sequence is required before export.");
  const draft = payload?.draft === true;
  if (!draft && project.storyDocument?.sequenceQA?.status === "BLOCKED") throw new Error("QA đang chặn bản cuối. Hãy sửa các shot được đánh dấu trước khi xuất bản.");
  const width = Math.max(320, Math.min(3840, Number(payload?.width) || 1920));
  const height = Math.max(180, Math.min(2160, Number(payload?.height) || 1080));
  const frameRate = [24, 25, 30, 60].includes(Number(payload?.frameRate)) ? Number(payload.frameRate) : 30;
  const clips = prepareMasterExportClips({ sequence, assets: state.assets, shots: state.shots, draft, localPathFromAsset: (asset) => localPathFromStudioMediaUrl(asset.filePath), fileExists: fs.existsSync });
  const audioMix = sequence.audioMix || { sourceGain: 0.65, dialogueGain: 1, voiceoverGain: 1, ambienceGain: 0.7, musicGain: 0.45 };
  const editDurationSec = sequence.clips.reduce((total, clip) => total + Number(clip.timelineDurationSec || 0), 0);
  const ffmpeg = typeof deps.getFFmpegToolchain === "function" ? deps.getFFmpegToolchain() : undefined;
  const useFfmpeg = Boolean(ffmpeg?.available && !draft);
  const clipsWithAudio = useFfmpeg && typeof deps.probeMedia === "function"
    ? clips.map((clip) => {
      try { return { ...clip, hasAudio: deps.probeMedia(clip.filePath, ffmpeg).streams.some((stream) => stream.type === "audio") }; }
      catch { return { ...clip, hasAudio: false }; }
    })
    : clips;
  return { projectId, project, sequence, draft, width, height, frameRate, clips: clipsWithAudio, audioMix, editDurationSec, useFfmpeg };
}

function writeExportManifest(request, deps) {
  const { crypto, dataRoot, path, fs, now, buildAudioClips } = deps;
  const { projectId, sequence, draft, width, height, frameRate, clips, audioMix, editDurationSec } = request;
  const shotWindows = buildShotWindows(sequence);
  const audioClips = buildAudioClips(sequence, deps.getState(), deps, editDurationSec, shotWindows);
  const jobId = `export_${crypto.randomUUID().slice(0, 8)}`;
  const exportDir = path.join(dataRoot, "projects", projectId, "exports");
  const manifestDir = path.join(exportDir, "manifests");
  fs.mkdirSync(manifestDir, { recursive: true });
  const suffix = draft ? "draft" : "final";
  const outputPath = path.join(exportDir, `${projectId}-r${sequence.revision}-${suffix}-${Date.now()}.mp4`);
  const manifestPath = path.join(manifestDir, `${jobId}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({ outputPath, clips, audioClips, sourceAudioGain: audioMix.sourceGain, width, height, frameRate, draftWatermark: draft }, null, 2));
  return { jobId, manifestPath, outputPath, audioClips };
}

function createExportJob(request, manifest, deps) {
  const { now } = deps;
  const timestamp = now();
  const { projectId, sequence, draft, width, height, frameRate, clips, audioMix } = request;
  return {
    id: manifest.jobId, projectId, providerId: request.useFfmpeg ? "local-ffmpeg" : "local-avfoundation", jobType: "export",
    input: { sequenceId: sequence.id, sequenceRevision: sequence.revision, draft, width, height, frameRate, manifestPath: manifest.manifestPath, sourceAssetIds: clips.map((clip) => clip.assetId), audioAssetIds: (sequence.audioClips || []).map((clip) => clip.sourceAssetId), audioMix },
    status: "generating", statusMessage: draft ? "Rendering watermarked draft master." : "Rendering final master.", progress: 0, resultAssetIds: [], createdAt: timestamp, updatedAt: timestamp
  };
}

function registerExportFailure(job, message, state, deps) {
  state = mutateRuntimeState(deps, (draft) => {
    const current = draft.jobs.find((item) => item.id === job.id) || job;
    current.status = "failed_manual";
    current.error = message.slice(0, 1000);
    current.statusMessage = "Master export failed; source media remains unchanged.";
    current.updatedAt = deps.now();
  }, { reason: "export-failed", jobId: job.id });
  deps.saveState();
  deps.sendToRenderer("studio:state", state);
}

function registerExportAsset(request, manifest, job, result, state, deps) {
  const { crypto, fs, toStudioMediaUrl, now, logEvent } = deps;
  const checksumSha256 = crypto.createHash("sha256").update(fs.readFileSync(manifest.outputPath)).digest("hex");
  const assetId = `master_${crypto.randomUUID().slice(0, 8)}`;
  const asset = {
    id: assetId, projectId: request.projectId, type: "video", filePath: toStudioMediaUrl(manifest.outputPath), sourceProvider: "local-avfoundation", sourceJobId: job.id,
    width: Number(result.width) || request.width, height: Number(result.height) || request.height, durationSeconds: Number(result.durationSeconds),
    metadata: { masterExport: true, draft: request.draft, sequenceId: request.sequence.id, sequenceRevision: request.sequence.revision, outputPath: manifest.outputPath, checksumSha256, codec: result.codec, audioCodec: result.audioCodec, audioSampleRate: result.audioSampleRate, audioChannels: result.audioChannels, frameRate: Number(result.frameRate) || request.frameRate, sourceAssetIds: request.clips.map((clip) => clip.assetId), audioAssetIds: (request.sequence.audioClips || []).map((clip) => clip.sourceAssetId), audioMix: request.audioMix, durationSource: "measured_composition" },
    createdAt: now()
  };
  mutateRuntimeState(deps, (draft) => {
    draft.assets.push(asset);
    const current = draft.jobs.find((item) => item.id === job.id) || job;
    current.resultAssetIds = [assetId];
    current.status = request.draft ? "review_required" : "approved";
    current.progress = 1;
    current.statusMessage = request.draft ? "Watermarked draft master exported for review." : "Final master exported.";
    current.updatedAt = now();
  }, { reason: "export-asset-registered", jobId: job.id, assetId });
  logEvent("master_export_completed", { jobId: job.id, projectId: request.projectId, assetId, sequenceId: request.sequence.id, sequenceRevision: request.sequence.revision, draft: request.draft, durationSeconds: asset.durationSeconds, checksumSha256 });
}

function attachExportProcess(request, manifest, job, state, deps) {
  const { path, __dirname, spawn, exportProcesses, fs, now, saveState, sendToRenderer } = deps;
  const scriptPath = path.resolve(__dirname, "../../../../scripts/export-sequence.swift");
  const child = spawn("/usr/bin/swift", [scriptPath, manifest.manifestPath], { cwd: path.resolve(__dirname, "../../../.."), stdio: ["ignore", "pipe", "pipe"] });
  exportProcesses.set(job.id, child);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
    const latest = Number([...stdout.matchAll(/PROGRESS\s+([0-9.]+)/g)].at(-1)?.[1]);
    if (Number.isFinite(latest)) {
      state = mutateRuntimeState(deps, (draft) => {
        const current = draft.jobs.find((item) => item.id === job.id) || job;
        current.progress = Math.max(current.progress || 0, Math.min(0.99, latest));
        current.updatedAt = now();
      }, { reason: "export-progress", jobId: job.id });
      sendToRenderer("studio:state", state);
    }
  });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("close", (code) => {
    exportProcesses.delete(job.id);
    if (job.status === "cancelled") {
      state = mutateRuntimeState(deps, (draft) => {
        const current = draft.jobs.find((item) => item.id === job.id) || job;
        current.updatedAt = now();
      }, { reason: "export-cancelled", jobId: job.id });
      saveState(); sendToRenderer("studio:state", state); return;
    }
    const resultLine = stdout.split("\n").find((line) => line.startsWith("RESULT "));
    if (code !== 0 || !resultLine || !fs.existsSync(manifest.outputPath)) return registerExportFailure(job, stderr.trim().split("\n").at(-1) || `Exporter exited with code ${code}`, state, deps);
    try { registerExportAsset(request, manifest, job, JSON.parse(resultLine.slice("RESULT ".length)), state, deps); }
    catch (error) {
      state = mutateRuntimeState(deps, (draft) => {
        const current = draft.jobs.find((item) => item.id === job.id) || job;
        current.status = "failed_manual";
        current.error = error instanceof Error ? error.message : String(error);
        current.statusMessage = "Master file rendered but metadata registration failed.";
        current.updatedAt = now();
      }, { reason: "export-registration-failed", jobId: job.id });
    }
    saveState();
    sendToRenderer("studio:state", state);
  });
}

function attachFfmpegProcess(request, manifest, job, state, deps) {
  const toolchain = deps.getFFmpegToolchain?.();
  if (!toolchain?.available || !toolchain.ffmpeg?.path) return attachExportProcess(request, manifest, job, state, deps);
  const args = deps.buildFfmpegConcatArgs(request.clips, { width: request.width, height: request.height, frameRate: request.frameRate, durationSec: request.editDurationSec, audioClips: manifest.audioClips, outputPath: manifest.outputPath });
  const { spawn, fs, now, saveState, sendToRenderer } = deps;
  const child = spawn(toolchain.ffmpeg.path, args, { cwd: deps.path.dirname(manifest.outputPath), stdio: ["ignore", "pipe", "pipe"] });
  deps.exportProcesses.set(job.id, child);
  let stderr = "";
  let progressBuffer = "";
  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    stderr += text;
    progressBuffer += text;
    const lines = progressBuffer.split(/\r?\n/);
    progressBuffer = lines.pop() || "";
    const outTimeMs = Number(lines.findLast((line) => line.startsWith("out_time_ms="))?.split("=")[1]);
    if (!Number.isFinite(outTimeMs) || request.editDurationSec <= 0) return;
    const progress = Math.max(0, Math.min(0.99, outTimeMs / 1_000_000 / request.editDurationSec));
    deps.mutateState((draft) => {
      const current = draft.jobs.find((item) => item.id === job.id) || job;
      current.progress = Math.max(Number(current.progress || 0), progress);
      current.statusMessage = `Đang dựng FFmpeg · ${Math.round(progress * 100)}%`;
      current.updatedAt = now();
    }, { reason: "ffmpeg-export-progress", jobId: job.id });
    sendToRenderer("studio:state", deps.getState());
  });
  child.on("close", (code) => {
    deps.exportProcesses.delete(job.id);
    if (job.status === "cancelled") { saveState(); sendToRenderer("studio:state", state); return; }
    if (code !== 0 || !fs.existsSync(manifest.outputPath)) return registerExportFailure(job, stderr.trim().split("\n").at(-1) || `FFmpeg exited with code ${code}`, state, deps);
    try { registerExportAsset(request, manifest, job, { durationSeconds: request.editDurationSec, width: request.width, height: request.height, frameRate: request.frameRate, codec: "h264", audioCodec: "aac", audioSampleRate: 48000, audioChannels: 2 }, state, deps); }
    catch (error) { registerExportFailure(job, error instanceof Error ? error.message : String(error), state, deps); return; }
    saveState(); sendToRenderer("studio:state", state);
  });
}

function createExportSequenceHandler(deps) {
  const runtime = { ...deps, buildAudioClips };
  return (_, payload) => {
    const state = runtime.getState();
    const request = prepareExportRequest(payload, state, runtime);
    const manifest = writeExportManifest(request, runtime);
    const job = createExportJob(request, manifest, runtime);
    mutateRuntimeState(runtime, (draft) => draft.jobs.push(job), { reason: "export-job-created", jobId: job.id, projectId: job.projectId });
    runtime.saveState();
    runtime.sendToRenderer("studio:state", state);
    if (request.useFfmpeg) attachFfmpegProcess(request, manifest, job, state, runtime);
    else attachExportProcess(request, manifest, job, state, runtime);
    return state;
  };
}

module.exports = { createExportSequenceHandler, prepareExportRequest };
