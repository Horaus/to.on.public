const VIDEO_EDITORIAL_CHECK_KEYS = [
  "dominantActionFulfilled",
  "noForbiddenInvention",
  "identityWardrobeStable",
  "propStateCorrect",
  "geographyCorrect",
  "durationValid",
  "speechDeliveryCorrect",
  "handoffFramesMatch"
];

const GENERATED_OUTPUT_ISSUE_ROUTES = {
  random_artifact: "retry",
  transient_render_failure: "retry",
  adapter_mapping: "recompile",
  prompt_contract: "recompile",
  overloaded_shot: "split",
  repeated_morphing: "split",
  provider_limitation: "change_provider"
};

function planGeneratedOutputReview(input = {}) {
  const evidence = normalizeEditorialEvidence(input.evidence);
  if (!evidence.length) return { status: "REVIEW_REQUIRED", route: "human_review", evidence, reason: "No timestamped evidence was supplied; generated output cannot be auto-accepted." };
  const highConfidence = evidence.filter((item) => item.confidence >= 0.8);
  if (!highConfidence.length) return { status: "REVIEW_REQUIRED", route: "human_review", evidence, reason: "Evidence confidence is below the automatic routing threshold." };
  const route = routeEditorialFindings(highConfidence);
  return { status: "REVISE", route, evidence, reason: `Routed from ${highConfidence.length} high-confidence timestamped finding(s).` };
}

function normalizeEditorialEvidence(rawEvidence) {
  if (!Array.isArray(rawEvidence)) return [];
  return rawEvidence.filter((item) => Number.isFinite(Number(item?.startSec)) && Number.isFinite(Number(item?.endSec)) && Number(item.endSec) >= Number(item.startSec) && String(item?.issueType || "").trim()).map((item) => ({
    startSec: Number(item.startSec), endSec: Number(item.endSec), issueType: String(item.issueType), detectionMethod: String(item.detectionMethod || "human"), confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)), observed: String(item.observed || ""), expected: String(item.expected || "")
  }));
}

function routeEditorialFindings(evidence) {
  const routes = evidence.map((item) => GENERATED_OUTPUT_ISSUE_ROUTES[item.issueType] || "human_review");
  return ["human_review", "change_provider", "split", "recompile", "retry"].find((candidate) => routes.includes(candidate)) || "human_review";
}

function normalizeVideoEditorialReview(input = {}, context = {}) {
  const status = normalizedReviewStatus(input.status);
  const checks = normalizedReviewChecks(input.checks);
  validateReviewStatus(status, checks, input.reason, context);
  return {
    status,
    checks,
    reviewer: String(input.reviewer || "User review").trim() || "User review",
    reason: String(input.reason || "").trim(),
    evidence: Array.isArray(input.evidence) ? input.evidence.map(String).filter(Boolean) : [],
    promptVersion: String(input.promptVersion || context.promptVersion || "unknown"),
    reviewedAt: context.reviewedAt || new Date().toISOString()
  };
}

function normalizedReviewStatus(value) {
  return ["review_required", "accepted", "rejected"].includes(String(value)) ? String(value) : "review_required";
}

function normalizedReviewChecks(checks) {
  return Object.fromEntries(VIDEO_EDITORIAL_CHECK_KEYS.map((key) => [key, checks?.[key] === true]));
}

function validateReviewStatus(status, checks, reason, context) {
  if (status === "accepted" && (!VIDEO_EDITORIAL_CHECK_KEYS.every((key) => checks[key]) || !context.frames?.first?.filePath || !context.frames?.last?.filePath)) throw new Error("Video acceptance requires every editorial check plus captured first and last frames.");
  if (status === "rejected" && !String(reason || "").trim()) throw new Error("Rejected video requires a reason.");
}

function applyVideoEditorialReview({ asset, shot, review }) {
  const previousReview = asset.metadata?.editorialReview;
  asset.metadata = {
    ...(asset.metadata || {}),
    editorialReview: review,
    editorialReviewHistory: previousReview
      ? [...(Array.isArray(asset.metadata?.editorialReviewHistory) ? asset.metadata.editorialReviewHistory : []), previousReview]
      : (asset.metadata?.editorialReviewHistory || [])
  };
  if (shot && (!shot.currentVideoAssetId || shot.currentVideoAssetId === asset.id)) {
    shot.status = review.status === "accepted" ? "approved" : "review";
  }
}

function acceptedReviewedClip(clip, shot, asset) {
  const duration = Number(asset.durationSeconds);
  const sourceInSec = Math.max(0, Math.min(Number(clip.sourceInSec) || 0, Number.isFinite(duration) ? Math.max(0, duration - 0.1) : Infinity));
  const authoredActiveDuration = Number(shot.timingContract?.estimatedActiveDurationSec);
  const editorialEnd = Number.isFinite(authoredActiveDuration) && authoredActiveDuration > 0 ? sourceInSec + authoredActiveDuration : Infinity;
  const desiredOut = Number(clip.sourceOutSec) > sourceInSec ? Number(clip.sourceOutSec) : sourceInSec + (Number(clip.timelineDurationSec) || Number(shot.durationSec) || duration || 0);
  const sourceOutSec = Math.min(Number.isFinite(duration) ? duration : Infinity, desiredOut, editorialEnd);
  const timelineDurationSec = Math.max(0.1, Math.min(Number(clip.timelineDurationSec) || sourceOutSec - sourceInSec, sourceOutSec - sourceInSec));
  return { ...clip, sourceAssetId: asset.id, sourceInSec, sourceOutSec, timelineDurationSec };
}

function reconcileReviewedClip(clip, shot, asset, review) {
  if (clip.shotId !== shot.id) return clip;
  if (review.status === "accepted") return acceptedReviewedClip(clip, shot, asset);
  if (clip.sourceAssetId !== asset.id) return clip;
  const next = { ...clip };
  delete next.sourceAssetId;
  return next;
}

function reconcileReviewedVideoWithSequence({ project, shot, asset, review, timestamp = new Date().toISOString() }) {
  const sequence = project?.editSequence;
  if (!sequence?.clips?.length || !shot?.id || !asset?.id) return false;
  const clips = sequence.clips.map((clip) => reconcileReviewedClip(clip, shot, asset, review));
  const changed = clips.some((clip, index) => JSON.stringify(clip) !== JSON.stringify(sequence.clips[index]));
  if (!changed) return false;
  project.editSequence = { ...sequence, clips, revision: (Number(sequence.revision) || 0) + 1, updatedAt: timestamp };
  return true;
}

module.exports = { VIDEO_EDITORIAL_CHECK_KEYS, GENERATED_OUTPUT_ISSUE_ROUTES, planGeneratedOutputReview, normalizeVideoEditorialReview, applyVideoEditorialReview, reconcileReviewedVideoWithSequence };
