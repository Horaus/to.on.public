const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

test("ChatGPT MV3 snapshot keeps the command but drops binary reference bytes", async () => {
  const values = {};
  global.chrome = {
    storage: {
      session: {
        async set(next) { Object.assign(values, next); },
        async get(key) { return { [key]: values[key] }; },
        async remove(key) { delete values[key]; }
      }
    }
  };
  const source = path.resolve(__dirname, "../background/session-store.ts");
  const { createChatGptSessionStore } = await import(`${pathToFileURL(source).href}?test=${Date.now()}`);
  const activeJobs = new Map();
  const store = createChatGptSessionStore(activeJobs);
  const job = {
    jobId: "shot-1",
    provider: "chatgpt",
    task: "text_to_image",
    prompt: "typed YAML identity contract",
    references: [{ assetId: "ref-1", filePath: "/tmp/ref.png", base64: "large-binary-payload", mimeType: "image/png" }],
    settings: { newConversation: false, sessionKey: "character-1", referenceTransport: "conversation_context" },
    download: { auto: false, filenameTemplate: "shot-1" }
  };

  await store.persist(job);
  const restored = await store.restore(job.jobId);

  assert.equal(restored.prompt, job.prompt);
  assert.deepEqual(restored.settings, job.settings);
  assert.equal(restored.references[0].filePath, "/tmp/ref.png");
  assert.equal("base64" in restored.references[0], false);
});
