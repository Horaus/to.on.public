import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(".");
const sourceManifestPath = path.join(root, "apps/extension/manifest.json");
const distRoot = path.join(root, "apps/extension/dist");
const distManifestPath = path.join(distRoot, "manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function checkFile(filePath, label) {
  if (!fs.existsSync(filePath)) return `${label} missing: ${path.relative(root, filePath)}`;
  if (fs.statSync(filePath).size === 0) return `${label} empty: ${path.relative(root, filePath)}`;
  return "";
}

if (!fs.existsSync(sourceManifestPath)) throw new Error(`Source manifest is missing: ${sourceManifestPath}`);
if (!fs.existsSync(distManifestPath)) throw new Error(`Built extension manifest is missing: ${distManifestPath}; run pnpm build:extension first.`);

const source = readJson(sourceManifestPath);
const built = readJson(distManifestPath);
const failures = [];
if (built.manifest_version !== 3) failures.push(`manifest_version must be 3 (got ${built.manifest_version})`);
for (const field of ["name", "version", "action", "background", "content_scripts"]) {
  if (JSON.stringify(source[field]) !== JSON.stringify(built[field])) failures.push(`manifest field differs from source: ${field}`);
}

const required = [
  ["background.js", "background service worker"],
  ["popup.html", "popup HTML"],
  ["popup.js", "popup script"]
];
for (const [file, label] of required) {
  const failure = checkFile(path.join(distRoot, file), label);
  if (failure) failures.push(failure);
}
for (const script of built.content_scripts || []) {
  for (const file of script.js || []) {
    const failure = checkFile(path.join(distRoot, file), "content script");
    if (failure) failures.push(failure);
  }
}

const scripts = ["background.js", "popup.js", ...(built.content_scripts || []).flatMap((entry) => entry.js || [])]
  .map((file) => path.join(distRoot, file));
for (const filePath of scripts) {
  const result = spawnSync(process.execPath, ["--check", filePath], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`syntax check failed: ${path.relative(root, filePath)}${result.stderr ? ` (${result.stderr.trim()})` : ""}`);
}

const report = {
  checkedAt: new Date().toISOString(),
  sourceVersion: source.version,
  builtVersion: built.version,
  manifestVersion: built.manifest_version,
  filesChecked: scripts.map((filePath) => path.relative(root, filePath)),
  failures,
  passed: failures.length === 0
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
