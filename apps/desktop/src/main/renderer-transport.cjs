function compactProject(project, activeProjectId) {
  if (project.id === activeProjectId) return project;
  const intake = project.intake;
  return { id: project.id, name: project.name, description: project.description, sourceDraft: "", styleBibleId: project.styleBibleId, intake: intake ? { sourceType: intake.sourceType, productionFormat: intake.productionFormat, targetDurationSec: intake.targetDurationSec, outputLanguage: intake.outputLanguage, platform: intake.platform, platforms: intake.platforms } : undefined, createdAt: project.createdAt, updatedAt: project.updatedAt };
}

function projectSummary(source, projectId) {
  const scenes = (source.scenes || []).filter((scene) => scene.projectId === projectId);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const shots = (source.shots || []).filter((shot) => sceneIds.has(shot.sceneId));
  const assets = (source.assets || []).filter((asset) => asset.projectId === projectId && !asset.metadata?.hiddenFromStoryboard);
  const references = (source.visualReferences || []).filter((reference) => reference.projectId === projectId);
  const jobs = (source.jobs || []).filter((job) => job.projectId === projectId);
  const latestByTarget = new Map();
  for (const job of jobs) {
    const target = `${job.jobType}:${job.shotId || job.id}`;
    const current = latestByTarget.get(target);
    if (!current || new Date(job.updatedAt || job.createdAt).getTime() > new Date(current.updatedAt || current.createdAt).getTime()) latestByTarget.set(target, job);
  }
  const currentActionJobs = [...latestByTarget.values()].filter((job) => job.status?.startsWith("failed") || ["waiting_login", "waiting_manual_action", "awaiting_user"].includes(job.status));
  const activeStatuses = new Set(["queued", "pending", "opening_provider", "submitting", "generating", "downloading", "awaiting_provider"]);
  return { projectId, sceneCount: scenes.length, shotCount: shots.length, assetCount: assets.length, sourceCount: assets.length + references.length, jobCount: jobs.length, approvedShots: shots.filter((shot) => shot.status === "approved").length, actionNeededJobs: currentActionJobs.length, activeJobs: jobs.filter((job) => activeStatuses.has(job.status)).length };
}

function snapshot(source) {
  if (!source?.activeProjectId) return source;
  const activeProjectId = source.activeProjectId;
  const sceneIds = new Set((source.scenes || []).filter((item) => item.projectId === activeProjectId).map((item) => item.id));
  return { ...source, projectSummaries: (source.projects || []).map((project) => projectSummary(source, project.id)), projects: (source.projects || []).map((project) => compactProject(project, activeProjectId)), characters: (source.characters || []).filter((item) => item.projectId === activeProjectId), styleBibles: (source.styleBibles || []).filter((item) => item.projectId === activeProjectId), scenes: (source.scenes || []).filter((item) => item.projectId === activeProjectId), shots: (source.shots || []).filter((item) => sceneIds.has(item.sceneId)), assets: (source.assets || []).filter((item) => item.projectId === activeProjectId), jobs: (source.jobs || []).filter((item) => item.projectId === activeProjectId), visualReferences: (source.visualReferences || []).filter((item) => item.projectId === activeProjectId) };
}

function liveContents(deps) {
  const window = deps.getWindow();
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  return contents && !contents.isDestroyed() ? contents : undefined;
}

function flush(deps, transportState) {
  if (!transportState.pendingState) return false;
  const payload = transportState.pendingState;
  transportState.pendingState = undefined; transportState.timer = undefined;
  const contents = liveContents(deps);
  if (!contents) return false;
  try { contents.send("studio:state", snapshot(payload)); }
  catch (error) { deps.logEvent("renderer_state_send_failed", { error: error?.message || String(error) }); return false; }
  return true;
}

function send(deps, transportState, channel, payload) {
  const contents = liveContents(deps);
  if (!contents) return false;
  if (channel === "studio:state") {
    transportState.pendingState = payload;
    if (!transportState.timer) transportState.timer = setTimeout(() => flush(deps, transportState), deps.debounceMs);
    return true;
  }
  contents.send(channel, payload);
  return true;
}

function createRendererTransport(deps) {
  const normalized = { debounceMs: 80, ...deps };
  const transportState = { pendingState: undefined, timer: undefined };
  return { snapshot, flush: () => flush(normalized, transportState), send: (channel, payload) => send(normalized, transportState, channel, payload) };
}

module.exports = { createRendererTransport };
