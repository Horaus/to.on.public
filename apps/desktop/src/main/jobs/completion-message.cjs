function completedAssetJobMessage(job) {
  if (job.jobType === "video") return "Video downloaded and ready for review.";
  const task = job.input?.bridgeMessage?.task;
  const settings = job.input?.bridgeMessage?.settings || {};
  if (job.jobType === "image" && task === "text_to_image" && settings.storyboardMode) {
    return "Keyframe image downloaded and ready for review.";
  }
  if (job.jobType === "image") return "Generated image downloaded and ready for review.";
  return "Provider result downloaded and ready for review.";
}

module.exports = { completedAssetJobMessage };
