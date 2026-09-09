const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const supportPromise = import(pathToFileURL(path.resolve(__dirname, "../core/production-ui-support.ts")));

test("finite input numbers keep unfinished edits out of durable UI state", async () => {
  const { finiteInputNumber } = await supportPromise;
  assert.equal(finiteInputNumber("", 30, { min: 1 }), 30);
  assert.equal(finiteInputNumber("not-a-number", 30, { min: 1 }), 30);
  assert.equal(finiteInputNumber("0", 30, { min: 1 }), 1);
  assert.equal(finiteInputNumber("101", 30, { min: 1, max: 100 }), 100);
  assert.equal(finiteInputNumber("12.5", 30, { min: 1 }), 12.5);
});
