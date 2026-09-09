-- Studio SQLite Schema v2
-- Strategy: hybrid columns — simple fields as SQL columns, complex/nested as `meta TEXT` JSON blob.
-- All CREATE TABLE use IF NOT EXISTS.
-- ALTER TABLE migrations are executed separately in openSqliteDb() (JS side) because
-- SQLite does NOT support "ALTER TABLE ... ADD COLUMN IF NOT EXISTS".
-- Never DROP TABLE — always additive.

-- ─────────────────────────────────────────────────────────────────
-- schema_migrations: track applied DB migrations
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────
-- projects
-- meta: intake, storyDocument, productionGraph* (JSON blobs)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  source_draft   TEXT,
  style_bible_id TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  meta           TEXT NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────
-- characters
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS characters (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  name                TEXT NOT NULL,
  role                TEXT NOT NULL,
  visual_description  TEXT NOT NULL,
  outfit              TEXT NOT NULL,
  face                TEXT NOT NULL,
  reference_asset_ids TEXT NOT NULL DEFAULT '[]',
  negative_traits     TEXT,
  consistency_notes   TEXT,
  personality         TEXT,
  backstory           TEXT,
  voice_profile       TEXT
);

-- ─────────────────────────────────────────────────────────────────
-- style_bibles
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS style_bibles (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  visual_style   TEXT NOT NULL,
  color_palette  TEXT NOT NULL,
  texture        TEXT NOT NULL,
  lighting       TEXT NOT NULL,
  motion_rules   TEXT NOT NULL,
  negative_style TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- scenes
-- meta: requiredProps[], referenceRequirementIds[], assetDelta{}, continuityOverride{}
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenes (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  title               TEXT NOT NULL,
  summary             TEXT NOT NULL,
  location            TEXT NOT NULL,
  time_of_day         TEXT NOT NULL,
  emotional_tone      TEXT NOT NULL,
  sort_order          INTEGER NOT NULL,
  setting_description TEXT,
  flow_text           TEXT,
  wardrobe_state      TEXT,
  meta                TEXT NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────
-- shots
-- meta: actionBeats[], referenceRequirementIds[]
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shots (
  id           TEXT PRIMARY KEY,
  scene_id     TEXT NOT NULL,
  sort_order   INTEGER NOT NULL,
  description  TEXT NOT NULL,
  camera       TEXT NOT NULL,
  motion       TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  prompt       TEXT NOT NULL,
  provider_id  TEXT,
  status       TEXT NOT NULL,
  asset_ids    TEXT NOT NULL DEFAULT '[]',
  dialogue     TEXT,
  flow_text    TEXT,
  meta         TEXT NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────
-- assets
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  scene_id        TEXT,
  shot_id         TEXT,
  type            TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  source_provider TEXT NOT NULL,
  source_job_id   TEXT,
  prompt          TEXT,
  metadata        TEXT,
  created_at      TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- automation_jobs
-- meta: watchdog flags, retry counts, runtime fields
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_jobs (
  id                           TEXT PRIMARY KEY,
  project_id                   TEXT NOT NULL,
  shot_id                      TEXT,
  provider_id                  TEXT NOT NULL,
  job_type                     TEXT NOT NULL,
  input                        TEXT NOT NULL,
  status                       TEXT NOT NULL,
  result_asset_ids             TEXT NOT NULL DEFAULT '[]',
  error                        TEXT,
  status_message               TEXT,
  progress                     REAL,
  output_text                  TEXT,
  provider_conversation_url    TEXT,
  provider_workspace_url       TEXT,
  provider_reference_asset_ids TEXT,
  created_at                   TEXT NOT NULL,
  updated_at                   TEXT NOT NULL,
  meta                         TEXT NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────
-- visual_references (new — was missing from v1 schema)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visual_references (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL,
  name                      TEXT NOT NULL,
  role                      TEXT NOT NULL,
  reference_use             TEXT,
  character_slot            TEXT,
  file_path                 TEXT NOT NULL,
  source_description        TEXT NOT NULL,
  transformation_request    TEXT NOT NULL,
  source_asset_id           TEXT,
  source_provider           TEXT,
  source_aspect_ratio       TEXT,
  provider_conversation_url TEXT,
  created_at                TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_characters_project   ON characters (project_id);
CREATE INDEX IF NOT EXISTS idx_style_bibles_project ON style_bibles (project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project       ON scenes (project_id);
CREATE INDEX IF NOT EXISTS idx_shots_scene          ON shots (scene_id);
CREATE INDEX IF NOT EXISTS idx_assets_project       ON assets (project_id);
CREATE INDEX IF NOT EXISTS idx_assets_shot          ON assets (shot_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project         ON automation_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_shot            ON automation_jobs (shot_id);
CREATE INDEX IF NOT EXISTS idx_visual_refs_project  ON visual_references (project_id);

-- ─────────────────────────────────────────────────────────────────
-- Record migrations (initial version seeds)
-- ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES
  (1, 'initial_schema'),
  (2, 'add_missing_columns_and_visual_references');
