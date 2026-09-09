const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studioBridge", {
  getState: () => ipcRenderer.invoke("studio:get-state"),
  getBridgeStatus: () => ipcRenderer.invoke("studio:get-bridge-status"),
  approveBridgePairing: (payload) => ipcRenderer.invoke("studio:approve-bridge-pairing", payload),
  getWindowMode: () => ipcRenderer.invoke("window:get-mode"),
  setWindowMode: (mode) => ipcRenderer.invoke("window:set-mode", mode),
  getSkills: () => ipcRenderer.invoke("studio:get-skills"),
  probeMedia: (assetId) => ipcRenderer.invoke("edit:probe-media", { assetId }),
  runJob: (payload) => ipcRenderer.invoke("studio:run-job", payload),
  applyPlan: (payload) => ipcRenderer.invoke("studio:apply-plan", payload),
  updateShot: (patch) => ipcRenderer.invoke("studio:update-shot", patch),
  updateScene: (patch) => ipcRenderer.invoke("studio:update-scene", patch),
  updateCharacter: (patch) => ipcRenderer.invoke("studio:update-character", patch),
  updateProject: (projectId, patch) => ipcRenderer.invoke("studio:update-project", projectId, patch),
  updateStyleBible: (styleBibleId, patch) => ipcRenderer.invoke("studio:update-style-bible", styleBibleId, patch),
  createProject: (payload) => ipcRenderer.invoke("studio:create-project", payload),
  selectProject: (projectId) => ipcRenderer.invoke("studio:select-project", projectId),
  addReference: (payload) => ipcRenderer.invoke("studio:add-reference", payload),
  promoteReferenceToShot: (payload) => ipcRenderer.invoke("studio:promote-reference-to-shot", payload),
  removeReference: (referenceId) => ipcRenderer.invoke("studio:remove-reference", referenceId),
  removeAsset: (assetId) => ipcRenderer.invoke("studio:remove-asset", assetId),
  approveAsset: (assetId) => ipcRenderer.invoke("studio:approve-asset", assetId),
  recoverJob: (jobId) => ipcRenderer.invoke("studio:recover-job", jobId),
  cancelProjectJobs: (projectId) => ipcRenderer.invoke("studio:cancel-project-jobs", projectId),
  openAsset: (assetId) => ipcRenderer.invoke("studio:open-asset", assetId),
  openExternal: (url) => ipcRenderer.invoke("studio:open-external", url),
  saveAsset: (payload) => ipcRenderer.invoke("studio:save-asset", payload),
  importVerifiedFlowVideo: (payload) => ipcRenderer.invoke("studio:import-verified-flow-video", payload),
  saveVideoPoster: (payload) => ipcRenderer.invoke("studio:save-video-poster", payload),
  saveVideoReviewFrame: (payload) => ipcRenderer.invoke("studio:save-video-review-frame", payload),
  updateVideoReview: (payload) => ipcRenderer.invoke("studio:update-video-review", payload),
  exportSequence: (payload) => ipcRenderer.invoke("studio:export-sequence", payload),
  cancelExport: (jobId) => ipcRenderer.invoke("studio:cancel-export", jobId),
  generateVoiceClip: (payload) => ipcRenderer.invoke("studio:generate-voice-clip", payload),
  generateSoundBed: (payload) => ipcRenderer.invoke("studio:generate-sound-bed", payload),
  onState: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on("studio:state", listener);
    return () => ipcRenderer.removeListener("studio:state", listener);
  },
  onBridge: (callback) => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on("studio:bridge", listener);
    return () => ipcRenderer.removeListener("studio:bridge", listener);
  }
});
