function planProviderAdmission(job, activeJobs, hasAdapter) {
  const duplicate = activeJobs.find((candidate) => candidate.jobId === job.jobId);
  if (duplicate) return { action: "duplicate", activeJobId: duplicate.jobId };
  if (!hasAdapter) return { action: "reject_unknown" };
  if (job.provider === "chatgpt") {
    // ChatGPT has one browser conversation lane. This restriction is
    // provider-local: Flow must remain admissible so keyframe generation and
    // video generation can overlap without opening a second ChatGPT tab.
    const conflicting = activeJobs.find((candidate) => candidate.provider === "chatgpt" && candidate.jobId !== job.jobId);
    if (conflicting) return { action: "reject_serial", activeJobId: conflicting.jobId };
  }
  return { action: "accept" };
}

module.exports = { planProviderAdmission };
