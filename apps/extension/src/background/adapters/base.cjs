function hostnameMatches(urlValue, predicate) {
  if (!urlValue) return false;
  try { return predicate(new URL(urlValue)); } catch { return false; }
}

function createProviderDescriptor(config, normalizeProvider) {
  return { ...config, canHandle: (job) => normalizeProvider(job.provider) === config.provider };
}

module.exports = { createProviderDescriptor, hostnameMatches };
