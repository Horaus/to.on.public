export const FLOW_EXECUTOR_CUSTOM_TOOL: "custom-tool-v1";
export const FLOW_EXECUTOR_UI_DIRECT: "flow-ui-direct-v2";
export function flowExecutorFromSettings(settings?: Record<string, unknown>): "custom-tool-v1" | "flow-ui-direct-v2";
export function shouldUseFlowCustomTool(job?: { settings?: Record<string, unknown> }): boolean;
