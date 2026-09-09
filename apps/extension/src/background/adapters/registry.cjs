function normalizeProvider(provider) {
  if (provider === "flow" || provider === "google-flow-web") return "google-flow";
  if (provider === "grok-web") return "grok";
  if (provider === "chatgpt-web") return "chatgpt";
  if (provider === "elevenlabs-flows-web" || provider === "elevenlabs-flow") return "elevenlabs-flows";
  return provider;
}

const { createProviderDescriptor } = require("./base.cjs");
const { isSavedChatGptConversationUrl } = require("../../../../../packages/domain/src/conversation-url.cjs");
const chatgpt = require("./chatgpt.cjs");
const googleFlow = require("./google-flow.cjs");
const elevenLabsFlows = require("./elevenlabs-flows.cjs");
const grok = require("./grok.cjs");
const freepik = require("./freepik.cjs");

const providerAdapters = [
  chatgpt, googleFlow, elevenLabsFlows, grok, freepik
].map((descriptor) => createProviderDescriptor(descriptor, normalizeProvider));

function providerAdapter(provider) {
  const normalized = normalizeProvider(provider);
  return providerAdapters.find((candidate) => candidate.provider === normalized);
}

module.exports = { isSavedChatGptConversationUrl, normalizeProvider, providerAdapter, providerAdapters };
