const { registerRunJobHandler, registerRecoverJobHandler, registerCancelProjectJobsHandler } = require("./job-handler-actions.cjs");

function registerJobHandlers(runtime) {
  registerRunJobHandler(runtime);
  registerRecoverJobHandler(runtime);
  registerCancelProjectJobsHandler(runtime);
}

module.exports = { registerJobHandlers };
