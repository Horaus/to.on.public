function loadSkillRegistry({ skillsDir, fs, path, isPathInside, warn = console.warn }) {
  if (!fs.existsSync(skillsDir)) return [];
  const readSkillFile = (name) => {
    const skillPath = path.join(skillsDir, name);
    if (!isPathInside(skillPath, skillsDir) || !fs.existsSync(skillPath)) return "";
    return fs.readFileSync(skillPath, "utf8");
  };
  const manifestResult = loadManifestRegistry({ skillsDir, fs, path, readSkillFile, warn });
  if (manifestResult.length) return manifestResult;
  return fs.readdirSync(skillsDir).filter((name) => name.endsWith(".md")).sort().map((name) => ({
    id: name.replace(/\.md$/, ""), name: name.replace(/\.md$/, ""), version: "0.1.0",
    locale: "en", category: "prompt", entitlement: "free", pipelineStages: [],
    providerCompatibility: [], files: [name], content: readSkillFile(name)
  }));
}

function loadManifestRegistry({ skillsDir, fs, path, readSkillFile, warn }) {
  const manifestPath = path.join(skillsDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return (Array.isArray(manifest?.packs) ? manifest.packs : [])
      .filter((pack) => pack && typeof pack.id === "string" && Array.isArray(pack.files))
      .map((pack) => ({
        id: pack.id, name: typeof pack.name === "string" ? pack.name : pack.id,
        version: typeof pack.version === "string" ? pack.version : "0.1.0",
        locale: typeof pack.locale === "string" ? pack.locale : "en",
        category: typeof pack.category === "string" ? pack.category : "prompt",
        entitlement: typeof pack.entitlement === "string" ? pack.entitlement : "free",
        pipelineStages: Array.isArray(pack.pipelineStages) ? pack.pipelineStages : [],
        providerCompatibility: Array.isArray(pack.providerCompatibility) ? pack.providerCompatibility : [],
        files: pack.files, description: typeof pack.description === "string" ? pack.description : undefined,
        content: pack.files.map(readSkillFile).filter(Boolean).join("\n\n---\n\n")
      }))
      .filter((pack) => pack.content.trim());
  } catch (error) {
    warn("[studio] Failed to load skill manifest; falling back to Markdown scan.", error);
    return [];
  }
}

module.exports = { loadSkillRegistry };
