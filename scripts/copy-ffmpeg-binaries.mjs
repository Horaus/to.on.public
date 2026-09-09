import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const platform = process.platform;
const destination = path.join(root, "dist", "ffmpeg", platform);
const sources = {
  ffmpeg: require("ffmpeg-static"),
  ffprobe: require("ffprobe-static").path
};

fs.mkdirSync(destination, { recursive: true });
for (const [name, source] of Object.entries(sources)) {
  if (!source || !fs.existsSync(source)) throw new Error(`Bundled ${name} binary is missing: ${source || "unknown"}`);
  const target = path.join(destination, name);
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o755);
}
console.log(`Copied FFmpeg binaries to ${destination}`);
