import type { ProviderAdapter, ProviderId } from "./types";
import registry from "./registry.cjs";

export const providerAdapters = registry.providerAdapters as ProviderAdapter[];
export const normalizeProvider = registry.normalizeProvider as (provider: string) => ProviderId | string;
export const providerAdapter = registry.providerAdapter as (provider: string) => ProviderAdapter | undefined;
export const isSavedChatGptConversationUrl = registry.isSavedChatGptConversationUrl as (value: unknown) => value is string;
