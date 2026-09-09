export type FlowBridgeResponse = { source: "studio-flow-bridge-result"; requestId: string; ok: boolean; error?: string; tier?: string; method?: string };
export type FlowBridgeAction = "clear" | "insert" | "submit" | "refreshSession";
export function bridgeCall(action: FlowBridgeAction, payload: Record<string, unknown> = {}, timeoutMs = 2500): Promise<FlowBridgeResponse> {
  const requestId = `flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => { window.removeEventListener("message", onMessage); resolve({ source: "studio-flow-bridge-result", requestId, ok: false, error: "Flow main-world bridge did not respond." }); }, timeoutMs);
    function onMessage(event: MessageEvent<FlowBridgeResponse>): void {
      if (event.source !== window || event.data?.source !== "studio-flow-bridge-result" || event.data.requestId !== requestId) return;
      window.clearTimeout(timeout); window.removeEventListener("message", onMessage); resolve(event.data);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "studio-flow-bridge", requestId, action, ...payload }, "*");
  });
}
