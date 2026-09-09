const { createMediaServer } = require("./media-server.cjs");
const { createMediaPersistence } = require("./media-persistence.cjs");
const { createFlowOwnership } = require("./flow-ownership.cjs");
const { createLegacyNormalization } = require("./legacy-normalization.cjs");
const { createFlowBlockers } = require("./flow-blockers.cjs");
const { createFlowRecovery } = require("./flow-recovery.cjs");

function createMediaAssetService(dependencies) {
  const service = {};
  Object.assign(service, createMediaServer({ ...dependencies, ...service }));
  Object.assign(service, createMediaPersistence({ ...dependencies, ...service }));
  Object.assign(service, createFlowOwnership({ ...dependencies, ...service }));
  Object.assign(service, createLegacyNormalization({ ...dependencies, ...service }));
  Object.assign(service, createFlowBlockers({ ...dependencies, ...service }));
  Object.assign(service, createFlowRecovery({ ...dependencies, ...service }));
  return service;
}

module.exports = { createMediaAssetService };
