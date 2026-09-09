const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// ffmpeg-static currently ships the reproducible 6.1.1 macOS binary. Keep
// the exact encoder pin while allowing ffprobe's independently versioned
// static package (its CLI output is compatible across the supported majors).
const PINNED_FFMPEG_VERSION = "6.1.1";
const SUPPORTED_FFMPEG_MAJOR = 6;

function executableName(name, platform = process.platform) {
  return platform === "win32" ? `${name}.exe` : name;
}

function pathCandidates(name, options = {}) {
  const platform = options.platform || process.platform;
  const candidates = [];
  const configured = name === "ffmpeg" ? options.ffmpegPath : options.ffprobePath;
  if (configured) candidates.push(configured);
  if (options.resourcesPath) {
    candidates.push(path.join(options.resourcesPath, "ffmpeg", platform, executableName(name, platform)));
  }
  // Prefer the reproducible open-source static binaries when installed. This
  // keeps desktop builds independent from a user's system PATH while still
  // allowing an explicit configured path to win.
  try {
    if (name === "ffmpeg") candidates.push(require("ffmpeg-static"));
    if (name === "ffprobe") candidates.push(require("ffprobe-static").path);
  } catch { /* optional dependency; continue with packaged/PATH candidates */ }
  for (const directory of String(options.pathValue || "").split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, executableName(name, platform)));
  }
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function parseVersion(output, binaryName) {
  const match = String(output).match(new RegExp(`${binaryName} version\\s+(?:n)?(\\d+)\\.(\\d+)(?:\\.(\\d+))?`, "i"));
  if (!match) throw new Error(`Cannot parse ${binaryName} version.`);
  return {
    version: `${match[1]}.${match[2]}.${match[3] || "0"}`,
    major: Number(match[1]),
    raw: String(output).split(/\r?\n/, 1)[0]
  };
}

function inspectBinary(filePath, binaryName, options = {}) {
  const run = options.execFileSync || execFileSync;
  const output = run(filePath, ["-version"], {
    encoding: "utf8",
    timeout: 5_000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const parsed = parseVersion(output, binaryName);
  return { name: binaryName, path: filePath, ...parsed };
}

function discoverFFmpeg(options = {}) {
  const exists = options.existsSync || fs.existsSync;
  const common = {
    platform: options.platform,
    resourcesPath: options.resourcesPath,
    pathValue: options.pathValue ?? process.env.PATH,
    ffmpegPath: options.ffmpegPath ?? process.env.STUDIO_FFMPEG_PATH,
    ffprobePath: options.ffprobePath ?? process.env.STUDIO_FFPROBE_PATH
  };
  const ffmpegPath = pathCandidates("ffmpeg", common).find(exists);
  const ffprobePath = pathCandidates("ffprobe", common).find(exists);
  if (!ffmpegPath || !ffprobePath) {
    return {
      available: false,
      pinnedVersion: PINNED_FFMPEG_VERSION,
      reason: "FFmpeg and ffprobe were not found. Install the pinned desktop binary package or configure STUDIO_FFMPEG_PATH and STUDIO_FFPROBE_PATH."
    };
  }
  try {
    const ffmpeg = inspectBinary(ffmpegPath, "ffmpeg", options);
    const ffprobe = inspectBinary(ffprobePath, "ffprobe", options);
    if (ffmpeg.version !== PINNED_FFMPEG_VERSION || ffprobe.major < 4) {
      return {
        available: false,
        pinnedVersion: PINNED_FFMPEG_VERSION,
        ffmpeg,
        ffprobe,
        reason: `Unsupported FFmpeg toolchain. Expected ffmpeg ${PINNED_FFMPEG_VERSION} with a compatible ffprobe release.`
      };
    }
    return { available: true, pinnedVersion: PINNED_FFMPEG_VERSION, ffmpeg, ffprobe };
  } catch (error) {
    return {
      available: false,
      pinnedVersion: PINNED_FFMPEG_VERSION,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function fractionToNumber(value) {
  if (!value || value === "0/0") return undefined;
  const [numerator, denominator = "1"] = String(value).split("/").map(Number);
  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function rotationForStream(stream) {
  const sideDataRotation = stream.side_data_list?.find((item) => Number.isFinite(Number(item.rotation)))?.rotation;
  const value = Number(sideDataRotation ?? stream.tags?.rotate ?? 0);
  return Number.isFinite(value) ? ((value % 360) + 360) % 360 : 0;
}

function normalizeProbeResult(payload, filePath) {
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const duration = Number(payload?.format?.duration);
  return {
    filePath,
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : undefined,
    formatName: payload?.format?.format_name,
    sizeBytes: Number.isFinite(Number(payload?.format?.size)) ? Number(payload.format.size) : undefined,
    streams: streams.map((stream) => ({
      index: Number(stream.index),
      type: stream.codec_type,
      codec: stream.codec_name,
      width: Number.isFinite(Number(stream.width)) ? Number(stream.width) : undefined,
      height: Number.isFinite(Number(stream.height)) ? Number(stream.height) : undefined,
      frameRate: fractionToNumber(stream.avg_frame_rate) ?? fractionToNumber(stream.r_frame_rate),
      sampleRate: Number.isFinite(Number(stream.sample_rate)) ? Number(stream.sample_rate) : undefined,
      channels: Number.isFinite(Number(stream.channels)) ? Number(stream.channels) : undefined,
      rotation: rotationForStream(stream)
    }))
  };
}

function probeMedia(filePath, toolchain, options = {}) {
  if (!toolchain?.available || !toolchain.ffprobe?.path) throw new Error(toolchain?.reason || "FFprobe is unavailable.");
  const exists = options.existsSync || fs.existsSync;
  if (!exists(filePath)) throw new Error(`Media source does not exist: ${filePath}`);
  const run = options.execFileSync || execFileSync;
  const output = run(toolchain.ffprobe.path, [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-of", "json",
    filePath
  ], {
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return normalizeProbeResult(JSON.parse(output), filePath);
}

/**
 * Build a shell-free FFmpeg filter graph for the basic editor's video lane.
 * Every clip is trimmed in source time, normalized to one canvas/fps contract,
 * then concatenated in the persisted timeline order. Callers must pass the
 * returned argv to spawn/execFile; never interpolate it into a shell string.
 */
function buildFfmpegConcatArgs(clips, options = {}) {
  const list = Array.isArray(clips) ? clips : [];
  if (!list.length) throw new Error("FFmpeg export requires at least one clip.");
  const width = Math.max(320, Math.min(3840, Number(options.width) || 1920));
  const height = Math.max(180, Math.min(2160, Number(options.height) || 1080));
  const frameRate = [24, 25, 30, 60].includes(Number(options.frameRate)) ? Number(options.frameRate) : 30;
  const args = ["-hide_banner", "-y"];
  const filters = [];
  list.forEach((clip, index) => {
    const start = Number(clip.sourceInSec);
    const end = Number(clip.sourceOutSec);
    if (!clip.filePath || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Invalid FFmpeg source range for ${clip.id || `clip_${index}`}.`);
    }
    const videoInputIndex = index * 2;
    const silentInputIndex = videoInputIndex + 1;
    const duration = Math.max(0.1, end - start);
    args.push("-ss", String(Math.max(0, start)), "-to", String(end), "-i", String(clip.filePath));
    args.push("-f", "lavfi", "-t", String(duration), "-i", "anullsrc=r=48000:cl=stereo");
    filters.push(`[${videoInputIndex}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${frameRate},setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`);
    if (clip.hasAudio) {
      filters.push(`[${videoInputIndex}:a:0]atrim=duration=${duration},asetpts=PTS-STARTPTS[va${index}]`);
    } else {
      filters.push(`[${silentInputIndex}:a:0]atrim=duration=${duration},asetpts=PTS-STARTPTS[va${index}]`);
    }
  });
  filters.push(`${list.map((_, index) => `[v${index}][va${index}]`).join("")}concat=n=${list.length}:v=1:a=1[outv][basea]`);
  const audioClips = Array.isArray(options.audioClips) ? options.audioClips : [];
  const audioLabels = [];
  audioClips.forEach((clip, index) => {
    if (!clip.filePath || !Number.isFinite(Number(clip.sourceInSec)) || !Number.isFinite(Number(clip.sourceOutSec))) throw new Error(`Invalid FFmpeg audio range for ${clip.id || `audio_${index}`}.`);
    const inputIndex = list.length * 2 + index;
    args.push("-i", String(clip.filePath));
    const delay = Math.max(0, Math.round(Number(clip.timelineStartSec || 0) * 1000));
    const gain = Math.max(0, Math.min(1, Number(clip.gain ?? 1)));
    const label = `aud${index}`;
    filters.push(`[${inputIndex}:a:0]atrim=start=${Math.max(0, Number(clip.sourceInSec))}:end=${Math.max(0, Number(clip.sourceOutSec))},asetpts=PTS-STARTPTS,volume=${gain},adelay=${delay}|${delay}[${label}]`);
    audioLabels.push(`[${label}]`);
  });
  if (audioLabels.length) filters.push(`[basea]${audioLabels.join("")}amix=inputs=${audioLabels.length + 1}:duration=longest:dropout_transition=0,aresample=48000[aout]`);
  else filters.push(`[basea]aresample=48000[aout]`);
  args.push("-filter_complex", filters.join(";"), "-map", "[outv]", "-map", "[aout]", "-c:v", "libx264", "-preset", String(options.preset || "medium"), "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", "-progress", "pipe:2", "-nostats", "-movflags", "+faststart", String(options.outputPath || "output.mp4"));
  return args;
}

module.exports = {
  PINNED_FFMPEG_VERSION,
  SUPPORTED_FFMPEG_MAJOR,
  discoverFFmpeg,
  normalizeProbeResult,
  parseVersion,
  pathCandidates,
  probeMedia,
  buildFfmpegConcatArgs
};
