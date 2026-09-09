const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  PINNED_FFMPEG_VERSION,
  discoverFFmpeg,
  normalizeProbeResult,
  parseVersion,
  probeMedia,
  buildFfmpegConcatArgs
} = require("../main/ffmpeg-edit-engine.cjs");

test("parses the pinned FFmpeg release line", () => {
  assert.deepEqual(parseVersion("ffmpeg version 6.1.1 Copyright (c)", "ffmpeg"), {
    version: "6.1.1",
    major: 6,
    raw: "ffmpeg version 6.1.1 Copyright (c)"
  });
  assert.equal(PINNED_FFMPEG_VERSION, "6.1.1");
});

test("discovers a paired supported toolchain without a shell", () => {
  const bin = path.resolve("/opt/studio/ffmpeg");
  const calls = [];
  const result = discoverFFmpeg({
    pathValue: bin,
    existsSync: () => true,
    execFileSync: (filePath, args) => {
      calls.push([filePath, args]);
      return `${path.basename(filePath)} version 6.1.1 studio`;
    }
  });
  assert.equal(result.available, true);
  assert.equal(result.ffmpeg.version, "6.1.1");
  assert.equal(result.ffprobe.version, "6.1.1");
  assert.deepEqual(calls.map((call) => call[1]), [["-version"], ["-version"]]);
});

test("rejects a toolchain that differs from the pinned release", () => {
  const result = discoverFFmpeg({
    pathValue: "/opt/studio/ffmpeg",
    existsSync: () => true,
    execFileSync: (filePath) => `${path.basename(filePath)} version 6.1.2 studio`
  });
  assert.equal(result.available, false);
  assert.match(result.reason, /ffmpeg 6\.1\.1/);
});

test("normalizes video, audio, frame rate and rotation from ffprobe JSON", () => {
  const result = normalizeProbeResult({
    format: { duration: "1.500000", format_name: "mov,mp4", size: "12345" },
    streams: [
      { index: 0, codec_type: "video", codec_name: "h264", width: 160, height: 90, avg_frame_rate: "30000/1001", tags: { rotate: "-90" } },
      { index: 1, codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 }
    ]
  }, "/tmp/source.mp4");
  assert.equal(result.durationSeconds, 1.5);
  assert.equal(result.streams[0].frameRate, 30000 / 1001);
  assert.equal(result.streams[0].rotation, 270);
  assert.equal(result.streams[1].sampleRate, 48000);
});

test("probes with an argument array and never interpolates the source path", () => {
  let invocation;
  const toolchain = { available: true, ffprobe: { path: "/opt/studio/ffprobe" } };
  const result = probeMedia("/tmp/a source;safe.mp4", toolchain, {
    existsSync: () => true,
    execFileSync: (filePath, args) => {
      invocation = { filePath, args };
      return JSON.stringify({ format: { duration: "2" }, streams: [] });
    }
  });
  assert.equal(result.durationSeconds, 2);
  assert.equal(invocation.filePath, "/opt/studio/ffprobe");
  assert.equal(invocation.args.at(-1), "/tmp/a source;safe.mp4");
});

test("builds a deterministic trim, normalize and concat graph without shell interpolation", () => {
  const args = buildFfmpegConcatArgs([
    { id: "clip_a", filePath: "/tmp/a source.mp4", sourceInSec: 1, sourceOutSec: 3 },
    { id: "clip_b", filePath: "/tmp/b;source.mp4", sourceInSec: 0, sourceOutSec: 2.5 }
  ], { width: 1080, height: 1920, frameRate: 30, outputPath: "/tmp/out file.mp4" });
  assert.equal(args[0], "-hide_banner");
  assert.deepEqual(args.slice(2, 10), ["-ss", "1", "-to", "3", "-i", "/tmp/a source.mp4", "-f", "lavfi"]);
  assert.match(args[args.indexOf("-filter_complex") + 1], /concat=n=2:v=1:a=1\[outv\]\[basea\]/);
  const outputArgs = args.slice(args.indexOf("-map"));
  assert.deepEqual(outputArgs, ["-map", "[outv]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", "-progress", "pipe:2", "-nostats", "-movflags", "+faststart", "/tmp/out file.mp4"]);
  assert.equal(args.includes("/tmp/b;source.mp4"), true);
});

test("adds delayed audio timeline clips and a silent bed when no audio is authored", () => {
  const withAudio = buildFfmpegConcatArgs([{ id: "video", filePath: "/tmp/v.mp4", sourceInSec: 0, sourceOutSec: 2 }], {
    width: 320, height: 180, durationSec: 2, audioClips: [{ id: "voice", filePath: "/tmp/v.m4a", sourceInSec: 0.2, sourceOutSec: 1.2, timelineStartSec: 0.5, gain: 0.8 }]
  });
  const graph = withAudio[withAudio.indexOf("-filter_complex") + 1];
  assert.match(graph, /atrim=start=0\.2:end=1\.2/);
  assert.match(graph, /adelay=500\|500/);
  assert.match(graph, /amix=inputs=2/);
  const silent = buildFfmpegConcatArgs([{ id: "video", filePath: "/tmp/v.mp4", sourceInSec: 0, sourceOutSec: 2 }], { durationSec: 2 });
  assert.equal(silent.includes("anullsrc=r=48000:cl=stereo"), true);
});
