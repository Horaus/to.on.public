import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const defaultSettingsDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "browser-native-ai-video-studio",
  "studio-data",
  "settings"
);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const statePath = option("--state", path.join(defaultSettingsDir, "studio-state.json"));
const databasePath = option("--db", path.join(defaultSettingsDir, "studio.sqlite"));
const jsonOutput = process.argv.includes("--json");

const mappings = [
  ["projects", "projects"],
  ["characters", "characters"],
  ["styleBibles", "style_bibles"],
  ["scenes", "scenes"],
  ["shots", "shots"],
  ["assets", "assets"],
  ["jobs", "automation_jobs"],
  ["visualReferences", "visual_references"]
];

function sortedIds(rows) {
  return rows.map((row) => String(row.id)).sort();
}

function duplicateIds(rows) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

// The projection deliberately omits legacy/corrupt jobs that cannot satisfy
// the durable job contract. Compare SQLite with that same projectable view so
// a known quarantined row is reported explicitly instead of looking like a
// persistence loss (or, worse, making the whole verification unusable).
function isProjectableJob(row) {
  return Boolean(row && typeof row.id === "string" && typeof row.projectId === "string" &&
    typeof row.providerId === "string" && typeof row.jobType === "string" &&
    typeof row.status === "string" && typeof row.createdAt === "string" &&
    typeof row.updatedAt === "string");
}

if (!fs.existsSync(statePath)) throw new Error(`State JSON does not exist: ${statePath}`);
if (!fs.existsSync(databasePath)) throw new Error(`SQLite database does not exist: ${databasePath}`);

const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const db = new DatabaseSync(databasePath, { readOnly: true });

try {
  const integrity = String(db.prepare("PRAGMA integrity_check").get()?.integrity_check || "unknown");
  const entities = mappings.map(([stateKey, table]) => {
    const allJsonRows = Array.isArray(state[stateKey]) ? state[stateKey] : [];
    const jsonRows = stateKey === "jobs" ? allJsonRows.filter(isProjectableJob) : allJsonRows;
    const jsonIds = sortedIds(jsonRows);
    const sqliteIds = sortedIds(db.prepare(`SELECT id FROM ${table}`).all());
    const missingInSqlite = difference(jsonIds, sqliteIds);
    const staleInSqlite = difference(sqliteIds, jsonIds);
    const duplicateJsonIds = duplicateIds(jsonRows);
    return {
      stateKey,
      table,
      skippedJsonRows: allJsonRows.length - jsonRows.length,
      jsonCount: jsonIds.length,
      uniqueJsonCount: new Set(jsonIds).size,
      sqliteCount: sqliteIds.length,
      missingInSqlite,
      staleInSqlite,
      duplicateJsonIds,
      matches: missingInSqlite.length === 0 && staleInSqlite.length === 0 && duplicateJsonIds.length === 0
    };
  });

  const orphanChecks = [
    ["characters_without_project", "SELECT COUNT(*) AS count FROM characters c LEFT JOIN projects p ON p.id = c.project_id WHERE p.id IS NULL"],
    ["scenes_without_project", "SELECT COUNT(*) AS count FROM scenes s LEFT JOIN projects p ON p.id = s.project_id WHERE p.id IS NULL"],
    ["shots_without_scene", "SELECT COUNT(*) AS count FROM shots sh LEFT JOIN scenes s ON s.id = sh.scene_id WHERE s.id IS NULL"],
    ["assets_without_project", "SELECT COUNT(*) AS count FROM assets a LEFT JOIN projects p ON p.id = a.project_id WHERE p.id IS NULL"],
    ["jobs_without_project", "SELECT COUNT(*) AS count FROM automation_jobs j LEFT JOIN projects p ON p.id = j.project_id WHERE p.id IS NULL"],
    ["references_without_project", "SELECT COUNT(*) AS count FROM visual_references r LEFT JOIN projects p ON p.id = r.project_id WHERE p.id IS NULL"]
  ].map(([name, sql]) => ({ name, count: Number(db.prepare(sql).get()?.count || 0) }));

  const activeProjectExists = !state.activeProjectId || (state.projects || []).some((project) => project.id === state.activeProjectId);
  const assetsById = new Map((state.assets || []).map((asset) => [asset.id, asset]));
  // Media truth is a runtime check for the project currently open in the app.
  // Historical projects may legitimately contain provider outputs with a
  // different measured duration; including them makes a fresh-project check
  // report stale findings and obscures the current run.
  const scopedAssets = state.activeProjectId
    ? (state.assets || []).filter((asset) => asset.projectId === state.activeProjectId)
    : (state.assets || []);
  const scopedShots = state.activeProjectId
    ? (state.shots || []).filter((shot) => shot.projectId === state.activeProjectId)
    : (state.shots || []);
  const flowJobs = (state.jobs || []).filter((job) => job.providerId === "google-flow-web");
  const flowChecks = {
    failedWithResults: flowJobs.filter((job) => /^failed/.test(job.status) && (job.resultAssetIds || []).length > 0).map((job) => job.id),
    reviewWithoutResults: flowJobs.filter((job) => job.status === "review_required" && (job.resultAssetIds || []).length === 0).map((job) => job.id),
    missingResultAssets: flowJobs.flatMap((job) => (job.resultAssetIds || [])
      .filter((assetId) => !assetsById.has(assetId))
      .map((assetId) => `${job.id}:${assetId}`)),
    visibleEphemeralVideos: (state.assets || []).filter((asset) =>
      asset.sourceProvider === "google-flow" &&
      asset.type === "video" &&
      !asset.metadata?.hiddenFromStoryboard &&
      /^(?:blob:|https?:\/\/(?!127\.0\.0\.1:3768\/))/i.test(asset.filePath || "")
    ).map((asset) => asset.id),
    multiResultJobs: flowJobs.filter((job) => (job.resultAssetIds || []).length > 1).map((job) => job.id),
    shotResultStatusMismatches: (state.shots || []).flatMap((shot) => {
      const asset = assetsById.get(shot.currentVideoAssetId);
      if (!asset || asset.type !== "video" || asset.metadata?.hiddenFromStoryboard || ["review", "approved"].includes(shot.status)) return [];
      return [`${shot.id}:${shot.status}:${asset.id}`];
    })
  };
  const durationChecks = {
    missingVideoDurations: scopedAssets.filter((asset) =>
      asset.type === "video" &&
      !asset.metadata?.hiddenFromStoryboard &&
      !(Number(asset.durationSeconds ?? asset.metadata?.durationSeconds ?? asset.metadata?.duration) > 0)
    ).map((asset) => asset.id),
    plannedSourceMismatches: scopedShots.flatMap((shot) => {
      const currentAsset = assetsById.get(shot.currentVideoAssetId) || scopedAssets
        .filter((asset) => asset.shotId === shot.id && asset.type === "video" && !asset.metadata?.hiddenFromStoryboard)
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))[0];
      const sourceDuration = Number(currentAsset?.durationSeconds ?? currentAsset?.metadata?.durationSeconds ?? currentAsset?.metadata?.duration);
      const plannedDuration = Number(shot.durationSec);
      if (!currentAsset || !(sourceDuration > 0) || !(plannedDuration > 0) || Math.abs(sourceDuration - plannedDuration) <= 0.25) return [];
      return [{ shotId: shot.id, assetId: currentAsset.id, plannedDuration, sourceDuration, delta: sourceDuration - plannedDuration }];
    })
  };
  const flowStateOk = flowChecks.failedWithResults.length === 0
    && flowChecks.reviewWithoutResults.length === 0
    && flowChecks.missingResultAssets.length === 0
    && flowChecks.visibleEphemeralVideos.length === 0
    && flowChecks.shotResultStatusMismatches.length === 0;
  const mediaTruthOk = durationChecks.missingVideoDurations.length === 0 && durationChecks.plannedSourceMismatches.length === 0;
  const ok = integrity === "ok"
    && activeProjectExists
    && entities.every((entity) => entity.matches)
    && orphanChecks.every((check) => check.count === 0)
    && flowStateOk;
  const report = {
    ok,
    checkedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    migrationPending: Number(state.schemaVersion || 1) < 3,
    integrity,
    activeProjectId: state.activeProjectId,
    activeProjectExists,
    entities,
    orphanChecks,
    flowStateOk,
    flowChecks,
    mediaTruthOk,
    durationChecks,
    durationScope: state.activeProjectId || "all-projects"
  };

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Persistence projection: ${ok ? "OK" : "DISCREPANCY"}`);
    console.log(`Integrity: ${integrity}; schemaVersion: ${state.schemaVersion}; active project: ${activeProjectExists ? "valid" : "missing"}`);
    if (report.migrationPending) console.log("Migration pending: restart the app to apply schema v3 plan-id repair.");
    for (const entity of entities) {
      console.log(`${entity.stateKey}: JSON ${entity.jsonCount} / SQLite ${entity.sqliteCount} - ${entity.matches ? "match" : "mismatch"}`);
      if (entity.skippedJsonRows) console.log(`  skipped malformed JSON rows: ${entity.skippedJsonRows} (not projectable)`);
      if (entity.duplicateJsonIds.length) console.log(`  duplicate JSON ids: ${entity.duplicateJsonIds.slice(0, 10).join(", ")}`);
      if (entity.missingInSqlite.length) console.log(`  missing in SQLite: ${entity.missingInSqlite.slice(0, 10).join(", ")}`);
      if (entity.staleInSqlite.length) console.log(`  stale in SQLite: ${entity.staleInSqlite.slice(0, 10).join(", ")}`);
    }
    for (const check of orphanChecks) console.log(`${check.name}: ${check.count}`);
    console.log(`Flow state: ${flowStateOk ? "valid" : "invalid"}; multi-result jobs: ${flowChecks.multiResultJobs.length}`);
    if (!flowStateOk) console.log(`Flow discrepancies: ${JSON.stringify(flowChecks)}`);
    console.log(`Media duration truth (${state.activeProjectId || "all projects"}): ${mediaTruthOk ? "valid" : "attention required"}; missing durations: ${durationChecks.missingVideoDurations.length}; plan/source mismatches: ${durationChecks.plannedSourceMismatches.length}`);
  }

  if (!ok) process.exitCode = 1;
} finally {
  db.close();
}
