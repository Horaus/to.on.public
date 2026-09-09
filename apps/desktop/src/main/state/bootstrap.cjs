let runtime;
const { normalizeCharacterContracts } = require("./character-contract-normalizer.cjs");

function createStateBootstrap(deps) {
  runtime = deps;
  return ensureDataFiles;
}

function ensureDirectories() {
  const { fs, path, statePath, dataRoot, sqlitePath, openSqliteDb } = runtime;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "projects"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "logs"), { recursive: true });
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  openSqliteDb();
}

function restoreActiveProject(state) {
  const { fs, activeProjectPath, saveActiveProject } = runtime;
  state.activeProjectId ||= state.projects[0]?.id;
  if (!fs.existsSync(activeProjectPath)) return saveActiveProject();
  try {
    const active = JSON.parse(fs.readFileSync(activeProjectPath, "utf8"));
    if (state.projects.some((project) => project.id === active.activeProjectId)) state.activeProjectId = active.activeProjectId;
  } catch {
    saveActiveProject();
  }
}

function normalizeStoredAssets(state) {
  const { fs, path, dataRoot, localPathFromStudioMediaUrl, persistDataUrlAsset, normalizeStoredMediaUrl, hydrateVideoMediaTruth, migrateImageAssetOutOfVideoFolder, ensureImagePreview, hideUnavailableVideoAsset, isOwnedFlowVideoAsset } = runtime;
  const quarantinedIds = new Set();
  for (const asset of state.assets || []) {
    persistDataUrlAsset(asset);
    asset.filePath = normalizeStoredMediaUrl(asset.filePath);
    // `metadata.startFrameAssetId` identifies an upstream continuity source,
    // not the generated storyboard file. Never replace a keyframe with that
    // reference image. If an older build already made that mistake, repair it
    // only when this project has exactly one non-preview image in its images
    // directory; ambiguous projects retain their existing path for safety.
    const sourceReferenceId = String(asset.metadata?.startFrameAssetId || "").trim();
    const currentPath = String(asset.filePath || "");
    // Media-server URLs encode the absolute path as one `%2F`-escaped URL
    // segment. Inspect the decoded local path here; checking the URL string
    // directly misses `/references/` and leaves a generated keyframe pointing
    // at its upstream reference image after restart.
    const decodedCurrentPath = String(localPathFromStudioMediaUrl?.(currentPath) || currentPath);
    if (sourceReferenceId && asset.projectId && /[\\/]references[\\/]/i.test(decodedCurrentPath)) {
      const imageDir = path.join(dataRoot, "projects", asset.projectId, "images");
      const imageCandidates = fs.existsSync(imageDir)
        ? fs.readdirSync(imageDir).filter((name) => /\.(?:png|jpe?g|webp)$/i.test(name)).map((name) => path.join(imageDir, name))
        : [];
      const previewAt = Date.parse(String(asset.metadata?.previewGeneratedAt || ""));
      const timestampMatches = Number.isFinite(previewAt)
        ? imageCandidates.filter((candidate) => {
          try {
            return Math.abs(fs.statSync(candidate).mtimeMs - previewAt) <= 15_000;
          } catch {
            // A preview can disappear between directory enumeration and stat
            // during cleanup. Startup normalization must remain fail-safe.
            return false;
          }
        })
        : [];
      if (timestampMatches.length === 1) asset.filePath = timestampMatches[0];
      else if (imageCandidates.length === 1) asset.filePath = imageCandidates[0];
    }
    hydrateVideoMediaTruth(asset);
    migrateImageAssetOutOfVideoFolder(asset);
    ensureImagePreview(asset);
    hideUnavailableVideoAsset(asset);
    if (asset.metadata?.posterUrl || asset.metadata?.posterFilePath) asset.metadata.posterUrl = normalizeStoredMediaUrl(asset.metadata.posterUrl || asset.metadata.posterFilePath);
    if (!isOwnedFlowVideoAsset(asset)) {
      asset.metadata = { ...(asset.metadata || {}), legacyUnownedFlowVideo: true, hiddenFromStoryboard: true };
      quarantinedIds.add(asset.id);
    }
  }
  return quarantinedIds;
}

function normalizeStoredReferences(state) {
  normalizeReferencePaths(state);
  reopenOrphanedReferenceJobs(state);
  reconcileTextRetryLineage(state);
}

function normalizeReferencePaths(state) {
  const { fs, localPathFromStudioMediaUrl } = runtime;
  for (const reference of state.visualReferences || []) {
    const localPath = localPathFromStudioMediaUrl(reference.filePath);
    if (localPath && fs.existsSync(localPath)) {
      reference.filePath = localPath;
      reference.previewDataUrl = runtime.toStudioMediaUrl(localPath);
    }
  }
}

function reopenOrphanedReferenceJobs(state) {
  // Legacy direct-reference jobs could be marked approved from a pre-existing
  // slot even though this attempt imported no image. Keep the history, but
  // reopen the job so the UI cannot show a false completed/spinning state.
  for (const job of state.jobs || []) {
    if (!isOrphanedReferenceJob(state, job)) continue;
    reopenReferenceJob(job);
  }
}

function isOrphanedReferenceJob(state, job) {
  if (job.jobType !== "image" || job.status !== "approved" || (job.resultAssetIds || []).length > 0) return false;
  const settings = job.input?.bridgeMessage?.settings || {};
  return !(state.visualReferences || []).some((reference) =>
    reference.sourceJobId === job.id && reference.projectId === job.projectId &&
    reference.characterSlot === String(settings.characterSlot || "")
  );
}

function reopenReferenceJob(job) {
  job.status = "failed_retryable";
  job.error = "Reference job was previously marked complete without an imported image asset.";
  job.statusMessage = job.error;
  job.progress = undefined;
  job.updatedAt = runtime.now();
}

function reconcileTextRetryLineage(state) {
  // Reconcile text retry lineage on restart. Older builds only superseded
  // media retries, leaving a successful screenplay retry paired with a
  // failed source that kept YOLO blocked forever.
  for (const completed of state.jobs || []) {
    const sourceId = completed.input?.retryOfJobId;
    if (!sourceId || !["approved", "done", "review_required"].includes(completed.status) || !String(completed.outputText || "").trim()) continue;
    const source = (state.jobs || []).find((item) => item.id === sourceId && item.projectId === completed.projectId && item.status === "failed_retryable");
    if (!source) continue;
    source.status = "cancelled";
    source.error = undefined;
    source.statusMessage = "Superseded by a successful retry result.";
    source.progress = undefined;
    source.supersededByJobId = completed.id;
    source.updatedAt = runtime.now();
  }
}

function quarantineLegacyResults(state, quarantinedIds) {
  if (!quarantinedIds.size) return;
  for (const shot of state.shots || []) shot.assetIds = (shot.assetIds || []).filter((assetId) => !quarantinedIds.has(assetId));
  for (const job of state.jobs || []) {
    const prior = job.resultAssetIds || [];
    const current = prior.filter((assetId) => !quarantinedIds.has(assetId));
    if (current.length === prior.length) continue;
    job.resultAssetIds = current;
    if (job.providerId === "google-flow-web" && job.jobType === "video" && job.status === "review_required") {
      job.status = "failed_retryable";
      job.error = "Google Flow result was quarantined because it was recovered from older visible project media instead of a fresh current job tile.";
      job.statusMessage = job.error;
      job.progress = undefined;
      job.updatedAt = runtime.now();
    }
  }
}

function failInterruptedExports(state) {
  for (const job of state.jobs || []) {
    if (job.jobType !== "export" || !["pending", "submitting", "generating", "downloading"].includes(job.status)) continue;
    job.status = "failed_retryable";
    job.error = "The app restarted before the local export process completed. Source media is intact; start a new export from the saved sequence revision.";
    job.statusMessage = job.error;
    job.progress = undefined;
    job.updatedAt = runtime.now();
  }
}

function runMediaNormalizers() {
  const names = ["quarantineDuplicateRecoveredFlowVideos", "normalizePersistedReviewJobs", "normalizeSuccessfulRetryJobs", "normalizePassedPreflightJobs", "normalizeLegacyStateVariantPrompts", "normalizeShotSpeechDelivery", "resolveDuplicateFlowVideoBlockers", "normalizeShotLinkedVideoAssets", "recoverDownloadedFlowVideoFiles", "repairRecoverableFlowVideoAssets", "quarantineUnverifiedFlowVideoAssets", "normalizeVideoJobsForCompletedShots", "annotateVideoDurationMismatches"];
  names.forEach((name) => runtime[name]());
}

function normalizeProjectIntake(project) {
  project.intake ||= { sourceType: "idea", productionFormat: "short_film", targetDurationSec: 90, episodeCount: 1, audience: "General audience", platform: "YouTube" };
  const intake = project.intake;
  intake.durationValue ||= intake.targetDurationSec >= 3600 ? intake.targetDurationSec / 3600 : intake.targetDurationSec >= 60 ? intake.targetDurationSec / 60 : intake.targetDurationSec;
  intake.durationUnit ||= intake.targetDurationSec >= 3600 ? "hours" : intake.targetDurationSec >= 60 ? "minutes" : "seconds";
  intake.outputLanguage ||= "Vietnamese";
  intake.contentLanguage ||= intake.outputLanguage;
  const supported = ["YouTube", "YouTube Shorts", "TikTok", "Reels"];
  intake.platforms = (intake.platforms || [intake.platform || "YouTube"]).filter((platform) => supported.includes(platform));
  if (!intake.platforms.length) intake.platforms = ["YouTube"];
  intake.platform = intake.platforms[0];
  intake.aiRouting ||= { textProvider: "chatgpt-web", imageProvider: "chatgpt-web", videoProvider: "google-flow-web" };
  runtime.sanitizeProjectRouting(project);
}

function normalizeStoryDocument(project, state) {
  project.sourceDraft ??= project.description || "";
  const document = project.storyDocument;
  if (document && !document.sceneBreakdown) document.sceneBreakdown = document.screenplay || state.scenes.filter((scene) => scene.projectId === project.id).map((scene) => `${scene.order}. ${scene.title}\n${scene.summary}`).join("\n\n");
  if (!document) return;
  document.comments ||= [];
  if (document.sceneBreakdown) document.sceneBreakdown = document.sceneBreakdown.replace(/\s+(?=(?:\d+\.|HOOK\b|CONTEXT\b|CORE VALUE\b|SAFETY\b|PAYOFF\b))/gi, "\n").replace(/(\d+)\.\s*\n\s*/g, "$1. ").replace(/Safety and\s*\n\s*payoff/gi, "Safety and payoff").trim();
}

function normalizeProject(project, state) {
  normalizeStoryDocument(project, state);
  runtime.upsertProjectCharactersFromStory(project);
  normalizeProjectIntake(project);
  if (project.intake.targetDurationSec <= 60) {
    const hook = state.scenes.filter((scene) => scene.projectId === project.id).sort((a, b) => a.order - b.order)[0];
    if (hook && !/^hook\b/i.test(hook.title)) hook.title = `HOOK · ${hook.title}`;
  }
  runtime.reconcileCompletedShotBreakdown(project);
}

function migrateLegacyHealthProject(state) {
  const healthJob = state.jobs.find((job) => job.input?.bridgeMessage?.task === "story_development" && String(job.input?.prompt || "").includes("Uống thực phẩm bổ sung có giúp trẻ cao nhanh không?"));
  if (!healthJob || state.projects.some((project) => project.name === "TikTok Health - Supplements")) return;
  const sourceDraft = String(healthJob.input.prompt).split("\nSOURCE MATERIAL:\n").at(-1)?.trim() || "";
  const sourceProject = state.projects.find((project) => project.id === healthJob.projectId) || state.projects[0];
  const projectId = runtime.id("project"); const styleBibleId = runtime.id("style"); const sceneId = runtime.id("scene"); const createdAt = runtime.now();
  state.projects.unshift({ id: projectId, name: "TikTok Health - Supplements", description: "", sourceDraft, styleBibleId, intake: { ...(sourceProject.intake || {}), sourceType: "idea", productionFormat: "short_video", targetDurationSec: 30, durationValue: 30, durationUnit: "seconds", episodeCount: 1, audience: "Parents of adolescents", platform: "TikTok", platforms: ["TikTok"], outputLanguage: sourceProject.intake?.outputLanguage || "Vietnamese", contentLanguage: sourceProject.intake?.contentLanguage || sourceProject.intake?.outputLanguage || "Vietnamese" }, createdAt, updatedAt: createdAt });
  state.styleBibles.push({ id: styleBibleId, projectId, visualStyle: "", colorPalette: "", texture: "", lighting: "", motionRules: "", negativeStyle: "" });
  state.characters.push({ id: runtime.id("character"), projectId, name: "Female pharmacist", role: "Main presenter", visualDescription: "A female pharmacist presenting evidence-based supplement guidance in a bright pharmacy.", outfit: "Professional pharmacist coat", face: "", referenceAssetIds: [] });
  state.scenes.push({ id: sceneId, projectId, title: "Awaiting AI scene package", summary: "The saved health brief is ready for generation.", location: "Bright pharmacy", timeOfDay: "Day", emotionalTone: "Clear and trustworthy", order: 1 });
  state.shots.push({ id: runtime.id("shot"), sceneId, order: 1, description: "Female pharmacist prepares to address the supplement question.", camera: "Medium vertical shot", motion: "Natural presenter movement", durationSec: 3, prompt: "", providerId: "chatgpt-web", status: "draft", assetIds: [] });
  state.activeProjectId = projectId;
}

function failInterruptedBrowserJobs(state, dependencies = runtime) {
  for (const job of state.jobs) {
    if (!["pending", "opening_provider", "submitting", "generating", "downloading"].includes(job.status)) continue;
    const flowVideo = job.providerId === "google-flow-web" && job.jobType === "video";
    const hadSubmitIntent = Boolean(job.submitIntentAt);
    job.status = "failed_retryable";
    job.error = flowVideo ? `The previous desktop session ended before this Google Flow video job returned. Reload extension v${dependencies.expectedExtensionVersion}; the app will try strict recovery before any new submit.` : `The previous desktop session ended before this browser job returned. Reload extension v${dependencies.expectedExtensionVersion} and retry.`;
    job.statusMessage = job.error; job.progress = undefined; job.watchdogFailed = !flowVideo;
    job.submissionState = hadSubmitIntent ? "reconciliation_required" : "interrupted";
    if (hadSubmitIntent) job.reconciliationRequiredAt = dependencies.now();
    if (flowVideo) { job.needsStrictFlowRecovery = true; job.flowRecoveryAttemptedAt = undefined; }
    job.updatedAt = dependencies.now();
  }
}

function loadExistingState() {
  const { fs, statePath, stateStore, migrateState, setState, providerCatalog } = runtime;
  const state = stateStore.replace(migrateState(JSON.parse(fs.readFileSync(statePath, "utf8"))), { reason: "load" });
  setState(state); state.visualReferences ||= []; state.providers = providerCatalog;
  restoreActiveProject(state);
  const quarantinedIds = normalizeStoredAssets(state);
  normalizeStoredReferences(state);
  quarantineLegacyResults(state, quarantinedIds);
  failInterruptedExports(state);
  runMediaNormalizers();
  const embeddedMediaSanitized = runtime.sanitizeEmbeddedStateMedia();
  state.projects.forEach((project) => normalizeProject(project, state));
  normalizeCharacterContracts(state);
  migrateLegacyHealthProject(state);
  failInterruptedBrowserJobs(state);
  runtime.saveState();
  if (embeddedMediaSanitized) runtime.saveState();
}

function ensureDataFiles() {
  ensureDirectories();
  if (runtime.fs.existsSync(runtime.statePath)) loadExistingState();
  else runtime.saveState();
}

module.exports = { createStateBootstrap, failInterruptedBrowserJobs };
