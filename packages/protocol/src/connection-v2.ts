export type ConnectionEnvelopeV2 = {
  protocolVersion: "2";
  messageType: string;
  messageId: string;
  correlationId?: string;
  sequence: number;
  issuedAt: string;
  expiresAt: string;
  source: Record<string, string | number>;
  destination: Record<string, string | number>;
  route: { sessionId: string; connectionId: string; leaseId?: string; fencingToken?: number; provider?: string; providerProjectId?: string; executorId?: string };
  job?: { projectId: string; jobId: string; idempotencyKey: string };
  bodySchema?: string;
  body?: unknown;
  integrity: { algorithm: string; nonce: string; authenticator: string };
};

export type ProviderCommandDestinationV2 = {
  extensionInstanceId: string;
  connectorInstanceId: string;
  tabId: number;
  frameId: number;
};
