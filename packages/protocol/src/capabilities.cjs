const DEFAULT_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

function strings(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].sort() : [];
}

function numbers(value) {
  return Array.isArray(value) ? [...new Set(value.map(Number).filter((item) => Number.isSafeInteger(item) && item > 0))].sort((a, b) => a - b) : [];
}

function normalizeCapabilityManifest(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const maxMessageBytes = Number(input.maxMessageBytes);
  return {
    manifestVersion: String(input.manifestVersion || "1"),
    protocolVersions: numbers(input.protocolVersions),
    providers: strings(input.providers),
    executors: strings(input.executors),
    tasks: strings(input.tasks),
    maxMessageBytes: Number.isFinite(maxMessageBytes) && maxMessageBytes >= 1024 ? Math.floor(maxMessageBytes) : DEFAULT_MAX_MESSAGE_BYTES,
    binaryTransfer: String(input.binaryTransfer || "none")
  };
}

function capabilityIssues(manifestValue, requirement = {}, messageBytes = 0) {
  const manifest = normalizeCapabilityManifest(manifestValue);
  const issues = [];
  const protocolVersion = Number(requirement.protocolVersion || 1);
  const provider = String(requirement.provider || "");
  const executor = String(requirement.executor || "");
  const task = String(requirement.task || "");
  if (manifest.protocolVersions.length && !manifest.protocolVersions.includes(protocolVersion)) issues.push("protocol_version_unsupported");
  if (provider && manifest.providers.length && !manifest.providers.includes(provider)) issues.push("provider_unsupported");
  if (executor && manifest.executors.length && !manifest.executors.includes(executor)) issues.push("executor_unsupported");
  if (task && manifest.tasks.length && !manifest.tasks.includes(task)) issues.push("task_unsupported");
  if (Number(messageBytes) > manifest.maxMessageBytes) issues.push("message_too_large");
  if (requirement.binaryTransfer && String(requirement.binaryTransfer) !== manifest.binaryTransfer) issues.push("binary_transfer_unsupported");
  return { ok: issues.length === 0, issues, manifest };
}

module.exports = { DEFAULT_MAX_MESSAGE_BYTES, normalizeCapabilityManifest, capabilityIssues };
