const CURRENT_SCHEMA_VERSION = 3;

function renameUnreferencedDuplicateScenes(raw) {
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const shots = Array.isArray(raw.shots) ? raw.shots : [];
  const counts = new Map();
  for (const scene of scenes) {
    const id = String(scene.id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const usedSceneIds = new Set(shots.map((shot) => String(shot.sceneId || "")));
  const occupied = new Set(scenes.map((scene) => String(scene.id)));
  for (const [sceneIndex, scene] of scenes.entries()) {
    const oldId = String(scene.id);
    if ((counts.get(oldId) || 0) < 2 || usedSceneIds.has(oldId)) continue;
    scene.id = nextLegacySceneId(scene, sceneIndex, occupied);
    occupied.add(scene.id);
  }
}

function nextLegacySceneId(scene, sceneIndex, occupied) {
  const projectId = String(scene.projectId || "legacy");
  const base = `scene_plan_${projectId}_${scene.order || 1}`;
  let candidate = base;
  let suffix = sceneIndex + 1;
  while (occupied.has(candidate)) candidate = `${base}_${suffix++}`;
  return candidate;
}

const jsonMigrations = [
  {
    version: 2,
    apply(raw) {
      raw.visualReferences ??= [];
      raw.jobs ??= [];
      raw.assets ??= [];
      raw.characters ??= [];
      raw.styleBibles ??= [];
      raw.scenes ??= [];
      raw.shots ??= [];
      for (const project of raw.projects || []) {
        project.productionGraphCustomNodes ??= [];
        project.productionGraphRevisions ??= {};
        project.productionGraphLayout ??= {};
        project.productionGraphViewport ??= { x: 34, y: 30, zoom: 0.78 };
        project.productionGraphNodeSettings ??= {};
      }
      for (const scene of raw.scenes || []) {
        scene.continuityOverride ??= null;
        scene.assetDelta ??= null;
      }
      for (const shot of raw.shots || []) shot.referenceRequirementIds ??= [];
    }
  },
  {
    version: 3,
    apply(raw) {
      // Older local plans used scene_plan_1/2/... globally. When more than one
      // project existed, SQLite projection could overwrite one project's
      // scene with another's. Rename only unreferenced duplicate plan scenes;
      // referenced legacy ids are preserved for a later explicit repair rather
      // than guessing which project owns a shot.
      renameUnreferencedDuplicateScenes(raw);
    }
  }
];

const sqliteMigrations = [
  [1, "projects-source-draft", "ALTER TABLE projects ADD COLUMN source_draft TEXT"],
  [2, "projects-meta", "ALTER TABLE projects ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'"],
  [3, "characters-personality", "ALTER TABLE characters ADD COLUMN personality TEXT"],
  [4, "characters-backstory", "ALTER TABLE characters ADD COLUMN backstory TEXT"],
  [5, "characters-voice-profile", "ALTER TABLE characters ADD COLUMN voice_profile TEXT"],
  [6, "scenes-setting-description", "ALTER TABLE scenes ADD COLUMN setting_description TEXT"],
  [7, "scenes-flow-text", "ALTER TABLE scenes ADD COLUMN flow_text TEXT"],
  [8, "scenes-wardrobe-state", "ALTER TABLE scenes ADD COLUMN wardrobe_state TEXT"],
  [9, "scenes-meta", "ALTER TABLE scenes ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'"],
  [10, "shots-dialogue", "ALTER TABLE shots ADD COLUMN dialogue TEXT"],
  [11, "shots-flow-text", "ALTER TABLE shots ADD COLUMN flow_text TEXT"],
  [12, "shots-meta", "ALTER TABLE shots ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'"],
  [13, "assets-scene-id", "ALTER TABLE assets ADD COLUMN scene_id TEXT"],
  [14, "assets-shot-id", "ALTER TABLE assets ADD COLUMN shot_id TEXT"],
  [15, "jobs-status-message", "ALTER TABLE automation_jobs ADD COLUMN status_message TEXT"],
  [16, "jobs-progress", "ALTER TABLE automation_jobs ADD COLUMN progress REAL"],
  [17, "jobs-output-text", "ALTER TABLE automation_jobs ADD COLUMN output_text TEXT"],
  [18, "jobs-conversation-url", "ALTER TABLE automation_jobs ADD COLUMN provider_conversation_url TEXT"],
  [19, "jobs-workspace-url", "ALTER TABLE automation_jobs ADD COLUMN provider_workspace_url TEXT"],
  [20, "jobs-reference-assets", "ALTER TABLE automation_jobs ADD COLUMN provider_reference_asset_ids TEXT"],
  [21, "jobs-meta", "ALTER TABLE automation_jobs ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'" ],
  [22, "references-identity-contract", "ALTER TABLE visual_references ADD COLUMN identity_contract TEXT"],
  [23, "references-source-job", "ALTER TABLE visual_references ADD COLUMN source_job_id TEXT"],
  [24, "references-visual-style", "ALTER TABLE visual_references ADD COLUMN visual_style TEXT"]
];

function migrateState(raw) {
  const initialVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
  for (const migration of jsonMigrations) if (initialVersion < migration.version) migration.apply(raw);
  raw.schemaVersion = CURRENT_SCHEMA_VERSION;
  return raw;
}

function applySqliteMigration(db, [version, name, statement], appliedAt) {
  db.exec("BEGIN IMMEDIATE");
  try {
    try { db.exec(statement); } catch (error) {
      if (!String(error?.message || error).includes("duplicate column name")) throw error;
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(version, name, appliedAt);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve the migration error */ }
    throw error;
  }
}

function applySqliteMigrations(db, appliedAt = new Date().toISOString()) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version)));
  for (const [version, name, statement] of sqliteMigrations) {
    if (applied.has(version)) continue;
    applySqliteMigration(db, [version, name, statement], appliedAt);
  }
}

module.exports = { CURRENT_SCHEMA_VERSION, applySqliteMigrations, migrateState, sqliteMigrations };
