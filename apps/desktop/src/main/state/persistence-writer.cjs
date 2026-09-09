const fs = require("node:fs");
const path = require("node:path");

function createPersistenceWriter({ statePath, activeProjectPath, schemaVersion, getState, touchState, syncProjection, logEvent, debounceMs = 120 }) {
  let timer;
  let pending = false;

  function writeJsonAtomic(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(value));
    fs.renameSync(tempPath, filePath);
  }

  function flush() {
    const state = getState();
    if (!pending || !state) return false;
    pending = false;
    timer = undefined;
    state.schemaVersion = schemaVersion;
    writeJsonAtomic(statePath, state);
    syncProjection();
    logEvent("state_saved", {
      projects: state.projects?.length ?? 0,
      shots: state.shots?.length ?? 0,
      jobs: state.jobs?.length ?? 0,
      activeProjectId: state.activeProjectId
    });
    return true;
  }

  function request() {
    touchState({ reason: "persist-request" });
    pending = true;
    if (!timer) timer = setTimeout(flush, debounceMs);
  }

  function saveActiveProject() {
    writeJsonAtomic(activeProjectPath, { activeProjectId: getState().activeProjectId });
  }

  function backup(label) {
    try {
      const backupDir = path.dirname(statePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const backupPath = path.join(backupDir, `studio-state.backup.${label}.${timestamp}.json`);
      if (fs.existsSync(statePath)) {
        fs.copyFileSync(statePath, backupPath);
        logEvent("state_backup", { label, backupPath });
      }
      const backups = fs.readdirSync(backupDir)
        .filter((name) => name.startsWith(`studio-state.backup.${label}.`) && name.endsWith(".json"))
        .sort();
      for (const old of backups.slice(0, -5)) {
        try { fs.unlinkSync(path.join(backupDir, old)); } catch { /* ignore stale backup cleanup */ }
      }
    } catch (error) {
      console.warn("[studio] saveStateBackup failed:", error);
    }
  }

  return { request, flush, saveActiveProject, backup, writeJsonAtomic };
}

module.exports = { createPersistenceWriter };
