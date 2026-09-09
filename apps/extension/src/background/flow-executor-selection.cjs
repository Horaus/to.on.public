const FLOW_EXECUTOR_CUSTOM_TOOL = "custom-tool-v1";
const FLOW_EXECUTOR_UI_DIRECT = "flow-ui-direct-v2";

function flowExecutorFromSettings(settings) {
  // Native Flow v2 is the supported default. The custom app remains an
  // explicit opt-in while its published runtime is pending/locked.
  return settings?.flowExecutor === FLOW_EXECUTOR_CUSTOM_TOOL
    ? FLOW_EXECUTOR_CUSTOM_TOOL
    : FLOW_EXECUTOR_UI_DIRECT;
}

function shouldUseFlowCustomTool(job) {
  return flowExecutorFromSettings(job?.settings) === FLOW_EXECUTOR_CUSTOM_TOOL;
}

module.exports = {
  FLOW_EXECUTOR_CUSTOM_TOOL,
  FLOW_EXECUTOR_UI_DIRECT,
  flowExecutorFromSettings,
  shouldUseFlowCustomTool
};
