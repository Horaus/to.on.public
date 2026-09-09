const fs = require("node:fs");
const path = require("node:path");

function createSqliteProjection({ sqlitePath, schemaPath, applyMigrations, getState, warn = console.warn }) {
  let database = null;

  function open() {
    if (database) return database;
    try {
      const sqlite = require("node:sqlite");
      const next = new sqlite.DatabaseSync(sqlitePath);
      next.exec(fs.readFileSync(schemaPath, "utf8"));
      applyMigrations(next);
      database = next;
      return database;
    } catch (error) {
      warn("[studio] SQLite unavailable or schema error:", error?.message || error);
      return null;
    }
  }

  function sync() {
    const state = getState();
    if (!state) return;
    let db = null;
    let transactionOpen = false;
    try {
      db = open();
      if (!db) return;
      db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      replaceProjection(db, state);
      db.exec("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen && db) {
        try { db.exec("ROLLBACK"); } catch { /* preserve the original sync error */ }
      }
      warn("[studio] syncStateToSqlite failed:", error?.message || error);
    }
  }

  return { open, sync };
}

function json(value) {
  return value == null ? null : JSON.stringify(value);
}

function replaceProjection(db, state) {
  clearProjection(db);
  for (const stage of projectionStages(state)) {
    writeProjectionStage(db, stage);
  }
}

const PROJECTION_TABLES = ["visual_references", "automation_jobs", "assets", "shots", "scenes", "style_bibles", "characters", "projects"];

function clearProjection(db) {
  for (const table of PROJECTION_TABLES) {
    db.exec(`DELETE FROM ${table}`);
  }
}

function projectionStages(state) {
  return [
    ["projects", projectRows, state.projects || []],
    ["characters", characterRows, state.characters || []],
    ["styles", styleRows, state.styleBibles || []],
    ["scenes", sceneRows, state.scenes || []],
    ["shots", shotRows, state.shots || []],
    ["assets", assetRows, state.assets || []],
    ["jobs", jobRows, state.jobs || []],
    ["references", referenceRows, state.visualReferences || []]
  ];
}

function writeProjectionStage(db, [label, write, rows]) {
  try {
    write(db, rows);
  } catch (error) {
    throw new Error(`${label} projection failed: ${error?.message || error}`, { cause: error });
  }
}

function projectRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO projects (id, name, description, source_draft, style_bible_id, created_at, updated_at, meta) VALUES (?,?,?,?,?,?,?,?)`);
  for (const row of rows) statement.run(row.id, row.name, row.description ?? null, row.sourceDraft ?? null, row.styleBibleId ?? null, row.createdAt, row.updatedAt, json({ intake: row.intake, storyDocument: row.storyDocument, productionGraphNotes: row.productionGraphNotes, productionGraphRevisions: row.productionGraphRevisions, productionGraphLayout: row.productionGraphLayout, productionGraphViewport: row.productionGraphViewport, productionGraphFocusDocumentId: row.productionGraphFocusDocumentId, productionGraphNodeSettings: row.productionGraphNodeSettings, productionGraphCustomNodes: row.productionGraphCustomNodes }));
}

function characterRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO characters (id, project_id, name, role, visual_description, outfit, face, reference_asset_ids, negative_traits, consistency_notes, personality, backstory, voice_profile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of rows) statement.run(row.id, row.projectId, row.name, row.role, row.visualDescription, row.outfit, row.face, json(row.referenceAssetIds), row.negativeTraits ?? null, row.consistencyNotes ?? null, row.personality ?? null, row.backstory ?? null, row.voiceProfile ? json(row.voiceProfile) : null);
}

function styleRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO style_bibles (id, project_id, visual_style, color_palette, texture, lighting, motion_rules, negative_style) VALUES (?,?,?,?,?,?,?,?)`);
  for (const row of rows) statement.run(row.id, row.projectId, row.visualStyle, row.colorPalette, row.texture, row.lighting, row.motionRules, row.negativeStyle);
}

function sceneRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO scenes (id, project_id, title, summary, location, time_of_day, emotional_tone, sort_order, setting_description, flow_text, wardrobe_state, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of rows) statement.run(row.id, row.projectId, row.title, row.summary, row.location, row.timeOfDay, row.emotionalTone, row.order, row.settingDescription ?? null, row.flowText ?? null, row.wardrobeState ?? null, json({ requiredProps: row.requiredProps, referenceRequirementIds: row.referenceRequirementIds, assetDelta: row.assetDelta, continuityOverride: row.continuityOverride, objective: row.objective, conflict: row.conflict, dramaticTurn: row.dramaticTurn, entryState: row.entryState, exitState: row.exitState }));
}

function shotRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO shots (id, scene_id, sort_order, description, camera, motion, duration_sec, prompt, provider_id, status, asset_ids, dialogue, flow_text, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of rows) statement.run(row.id, row.sceneId, row.order, row.description, row.camera, row.motion, row.durationSec, row.prompt, row.providerId ?? null, row.status, json(row.assetIds), row.dialogue ?? null, row.flowText ?? null, json({ actionBeats: row.actionBeats, referenceRequirementIds: row.referenceRequirementIds, speakerCharacterId: row.speakerCharacterId, speechType: row.speechType, speaker: row.speaker, dialoguePurpose: row.dialoguePurpose, storyBeat: row.storyBeat, transitionIn: row.transitionIn, transitionOut: row.transitionOut, screenDirection: row.screenDirection }));
}

function assetRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO assets (id, project_id, scene_id, shot_id, type, file_path, source_provider, source_job_id, prompt, metadata, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of rows) statement.run(row.id, row.projectId, row.sceneId ?? null, row.shotId ?? null, row.type, row.filePath ?? "", row.sourceProvider ?? "unknown", row.sourceJobId ?? null, row.prompt ?? null, json(row.metadata), row.createdAt);
}

function jobRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO automation_jobs (id, project_id, shot_id, provider_id, job_type, input, status, result_asset_ids, error, status_message, progress, output_text, provider_conversation_url, provider_workspace_url, provider_reference_asset_ids, created_at, updated_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of rows) {
    // Legacy/corrupt entries can survive in the JSON state after an
    // interrupted migration. node:sqlite rejects undefined bind values and
    // would abort projection for every otherwise healthy job; omit only the
    // malformed row so valid jobs remain queryable.
    if (!row || typeof row.id !== "string" || typeof row.projectId !== "string" || typeof row.providerId !== "string" || typeof row.jobType !== "string" || typeof row.status !== "string" || typeof row.createdAt !== "string" || typeof row.updatedAt !== "string") continue;
    statement.run(row.id, row.projectId, row.shotId ?? null, row.providerId, row.jobType, json(row.input), row.status, json(row.resultAssetIds), row.error ?? null, row.statusMessage ?? null, row.progress ?? null, row.outputText ?? null, row.providerConversationUrl ?? null, row.providerWorkspaceUrl ?? null, json(row.providerReferenceAssetIds), row.createdAt, row.updatedAt, "{}");
  }
}

function referenceRows(db, rows) {
  const statement = db.prepare(`INSERT OR REPLACE INTO visual_references (id, project_id, name, role, reference_use, character_slot, file_path, source_description, transformation_request, source_asset_id, source_job_id, source_provider, visual_style, source_aspect_ratio, provider_conversation_url, identity_contract, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of rows) statement.run(row.id, row.projectId, row.name ?? "", row.role ?? "visual_style", row.referenceUse ?? null, row.characterSlot ?? null, row.filePath ?? "", row.sourceDescription ?? "", row.transformationRequest ?? "", row.sourceAssetId ?? null, row.sourceJobId ?? null, row.sourceProvider ?? null, row.visualStyle ?? null, row.sourceAspectRatio ?? null, row.providerConversationUrl ?? null, row.identityContract ? json(row.identityContract) : null, row.createdAt ?? new Date(0).toISOString());
}

module.exports = { createSqliteProjection, replaceProjection };
