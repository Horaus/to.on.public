const test = require("node:test");
const assert = require("node:assert/strict");
const { createReferencePromotion } = require("../main/media/reference-promotion.cjs");

test("failed replacement keeps the existing locked reference", () => {
  const oldReference = {
    id: "ref-old", projectId: "project-1", characterSlot: "mai",
    referenceUse: "primary_identity", role: "main_character", filePath: "/old.png"
  };
  const state = { visualReferences: [oldReference] };
  const fs = {
    existsSync: () => true,
    mkdirSync: () => undefined,
    writeFileSync: () => undefined,
    copyFileSync: () => undefined,
    unlinkSync: () => { throw new Error("must not delete old reference when replacement fails"); }
  };
  const promote = createReferencePromotion({
    getState: () => state,
    fs,
    path: { join: (...parts) => parts.join("/") , extname: () => "" },
    dataRoot: "/data",
    localPathFromStudioMediaUrl: () => "/old.png",
    nativeImage: {},
    toStudioMediaUrl: (value) => value,
    id: () => "ref-new",
    now: () => "2026-08-27T00:00:00.000Z"
  });
  const result = promote({
    id: "job-new", projectId: "project-1",
    input: { bridgeMessage: { settings: { directReferenceUse: "primary_identity", characterSlot: "mai", referenceRole: "main_character" } } }
  }, { metadata: { mimeType: "image/png" } }, { id: "asset-new", type: "image", filePath: "data:image/png," });
  assert.equal(result, false);
  assert.deepEqual(state.visualReferences, [oldReference]);
});
