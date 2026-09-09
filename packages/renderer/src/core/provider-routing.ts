export const routingProviderIds = {
  text: ["chatgpt-web", "gemini-web", "grok-web", "deepseek-web"],
  image: ["chatgpt-web", "grok-web", "google-flow-web", "elevenlabs-flows-web"],
  video: ["grok-web", "google-flow-web"]
} as const;

export function safeRoutingValue(kind: keyof typeof routingProviderIds, value: string | undefined) {
  return routingProviderIds[kind].includes(value as never) ? value! : routingProviderIds[kind][0];
}
