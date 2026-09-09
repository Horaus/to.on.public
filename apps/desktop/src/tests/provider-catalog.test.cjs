const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeProjectRouting } = require("../main/providers/catalog.cjs");

test("sanitizeProjectRouting repairs scalar/character-spread routing state", () => {
  const project = { intake: { aiRouting: "balanced" } };
  sanitizeProjectRouting(project);
  assert.deepEqual(project.intake.aiRouting, {
    textProvider: "chatgpt-web",
    imageProvider: "chatgpt-web",
    videoProvider: "google-flow-web"
  });
});

test("sanitizeProjectRouting keeps only executable provider lanes", () => {
  const project = { intake: { aiRouting: { textProvider: "gemini-web", imageProvider: "gemini-web", videoProvider: "invalid", extra: "stale" } } };
  sanitizeProjectRouting(project);
  assert.deepEqual(project.intake.aiRouting, {
    textProvider: "gemini-web",
    imageProvider: "chatgpt-web",
    videoProvider: "google-flow-web"
  });
});

test("sanitizeProjectRouting preserves an explicit Flow source mode", () => {
  const project = { intake: { flowVideoMode: "components", aiRouting: {} } };
  sanitizeProjectRouting(project);
  assert.equal(project.intake.flowVideoMode, "components");
});
