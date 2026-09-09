const RUNTIME_KEY_PREFIX = "studio.pipeline-runtime.v1.";

function runtimeKey(projectId) {
  return `${RUNTIME_KEY_PREFIX}${projectId}`;
}

function readPipelineRuntime(storage, projectId) {
  if (!storage || !projectId) return { run: null, storyboardQueue: null };
  try {
    const value = JSON.parse(storage.getItem(runtimeKey(projectId)) || "null");
    if (!value || value.projectId !== projectId) return { run: null, storyboardQueue: null };
    return { run: value.run || null, storyboardQueue: value.storyboardQueue || null };
  } catch {
    return { run: null, storyboardQueue: null };
  }
}

function writePipelineRuntime(storage, projectId, runtime) {
  if (!storage || !projectId) return;
  const empty = !runtime.run && !runtime.storyboardQueue;
  if (empty) storage.removeItem(runtimeKey(projectId));
  else storage.setItem(runtimeKey(projectId), JSON.stringify({ projectId, ...runtime, updatedAt: new Date().toISOString() }));
}

module.exports = { readPipelineRuntime, runtimeKey, writePipelineRuntime };
