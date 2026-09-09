const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "docs/architecture-system-map.json");
const map = JSON.parse(fs.readFileSync(file, "utf8"));

if (map.version < 2 || map.sourceOfTruth !== "docs/architecture-system-map.json") {
  throw new Error("architecture map must declare a versioned source of truth");
}
if (map.maintenance?.validateWith !== "pnpm architecture:map") {
  throw new Error("architecture map maintenance command is missing");
}

const required = new Set(map.maintenance.requiredFields ?? []);
for (const boundary of map.boundaries ?? []) {
  for (const field of required) {
    if (!(field in boundary)) throw new Error(`${boundary.id ?? "unknown"}: missing ${field}`);
  }
  for (const entrypoint of boundary.entrypoints ?? []) {
    if (!entrypoint.startsWith("@") && !fs.existsSync(path.join(root, entrypoint))) {
      throw new Error(`${boundary.id}: missing entrypoint ${entrypoint}`);
    }
  }
}

console.log(`architecture map valid: ${map.boundaries.length} boundaries, version ${map.version}`);
