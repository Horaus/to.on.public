const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const layoutPromise = import(pathToFileURL(path.resolve(__dirname, "../studio-canvas-layout.ts")));

test("flow layout repairs overlapping saved document coordinates without moving unrelated columns", async () => {
  const { repairDocumentOverlaps } = await layoutPromise;
  const nodes = [
    { id: "group:shots", type: "groupFrame", style: { width: 430, height: 500 }, position: { x: 0, y: 0 } },
    { id: "document:shot", type: "document", parentId: "group:shots", position: { x: 24, y: 100 }, style: { width: 342 }, data: { document: { kind: "text", slot: "shot" } } },
    { id: "document:keyframe", type: "document", parentId: "group:shots", position: { x: 24, y: 120 }, style: { width: 342 }, data: { document: { kind: "image", slot: "keyframe", aspectRatio: "9:16" } } },
    { id: "document:other-column", type: "document", parentId: "group:shots", position: { x: 390, y: 120 }, style: { width: 342 }, data: { document: { kind: "text", slot: "shot" } } }
  ];
  repairDocumentOverlaps(nodes);
  assert.ok(nodes[2].position.y > nodes[1].position.y + 320);
  assert.equal(nodes[3].position.x, 390);
  assert.ok(nodes[0].style.height >= nodes[2].position.y + 760);
});
