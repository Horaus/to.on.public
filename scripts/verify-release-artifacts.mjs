import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "release-assets");
const releases = [
  { version: "0.1.1", app: "Browser Native Studio v0.1.1-0.1.1.dmg", zip: "Browser Native Studio v0.1.1-0.1.1-mac.zip", extension: "browser-native-studio-extension-v0.1.1.zip" },
  { version: "0.2.1", app: "Browser Native Studio v0.2.1-0.2.1.dmg", zip: "Browser Native Studio v0.2.1-0.2.1-mac.zip", extension: "browser-native-studio-extension-v0.2.1.zip" }
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function extensionManifest(zip) {
  return JSON.parse(execFileSync("unzip", ["-p", zip, "apps/extension/dist/manifest.json"], { encoding: "utf8" }));
}

function verifyExtensionPayload(zip, version) {
  const entries = new Set(execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean));
  const required = [
    "apps/extension/dist/manifest.json",
    "apps/extension/dist/background.js",
    "apps/extension/dist/popup.html",
    "apps/extension/dist/content/chatgpt.js",
    "apps/extension/dist/content/flow-slate-bridge.js",
    "apps/extension/dist/content/google-flow.js",
    "apps/extension/dist/content/grok.js",
    "apps/extension/dist/content/elevenlabs-flows.js"
  ];
  const missing = required.filter((entry) => !entries.has(entry));
  if (missing.length) throw new Error(`${version}: extension ZIP is incomplete; missing ${missing.join(", ")}`);
}

const result = releases.map((release) => {
  const dir = path.join(root, `v${release.version}`, "uploads");
  const files = [release.app, release.zip, release.extension].map((name) => path.join(dir, name));
  if (files.some((file) => !existsSync(file))) throw new Error(`${release.version}: missing artifact`);
  verifyExtensionPayload(files[2], release.version);
  const manifest = extensionManifest(files[2]);
  if (manifest.version !== release.version) throw new Error(`${release.version}: extension manifest is ${manifest.version}`);
  return {
    version: release.version,
    extensionVersion: manifest.version,
    files: files.map((file) => ({ name: path.basename(file), bytes: readFileSync(file).byteLength, sha256: sha256(file) }))
  };
});

console.log(JSON.stringify({ ok: true, root, releases: result }, null, 2));
