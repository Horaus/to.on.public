const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../background/adapters/registry.cjs");

test("provider aliases resolve to one adapter contract", () => {
  assert.equal(registry.providerAdapter("chatgpt-web").provider, "chatgpt");
  assert.equal(registry.providerAdapter("google-flow-web").provider, "google-flow");
  assert.equal(registry.providerAdapters.filter((adapter) => adapter.canHandle({ provider: "flow" })).length, 1);
});

test("provider tab ownership is isolated by adapter", () => {
  assert.equal(registry.providerAdapter("chatgpt").matchesTab("https://chatgpt.com/c/abc"), true);
  assert.equal(registry.providerAdapter("chatgpt").matchesTab("https://labs.google/fx/vi/tools/flow/project/a"), false);
  assert.equal(registry.providerAdapter("google-flow").matchesTab("https://labs.google/fx/vi/tools/flow/project/a"), true);
});

test("transient ChatGPT WEB ids cannot become durable recovery URLs", () => {
  assert.equal(registry.isSavedChatGptConversationUrl("https://chatgpt.com/c/abc-123"), true);
  assert.equal(registry.isSavedChatGptConversationUrl("https://chatgpt.com/c/WEB:temporary"), false);
  assert.equal(registry.isSavedChatGptConversationUrl("https://example.com/c/abc"), false);
});
