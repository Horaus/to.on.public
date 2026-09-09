import { spawnSync } from "node:child_process";

const vite = process.platform === "win32" ? "vite.cmd" : "vite";
const entries = ["chatgpt", "flow-slate-bridge", "google-flow", "grok", "elevenlabs-flows"];

function run(args, env = process.env) {
  const result = spawnSync(vite, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Build the ESM service worker first. The content scripts are separate
// classic-script bundles because Chrome does not treat manifest content
// scripts as modules, and dynamic recovery injection must work after reload.
run(["build", "--config", "vite.config.ts"]);
for (const entry of entries) run(["build", "--config", "vite.content.config.ts"], { ...process.env, EXTENSION_CONTENT_ENTRY: entry });
