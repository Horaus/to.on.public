const test = require("node:test");
const assert = require("node:assert/strict");
const { balancedJsonObjectCandidates } = require("../main/structured-json.cjs");

test("balanced JSON extraction ignores provider junk after a complete object", () => {
  const text = `Provider preface\n{"creativeIntent":{"motif":{"element":"máy ghi âm"}},"story":"Linh nói: \\\"Dừng lại.\\\""}]()]()]()_]()`;
  const candidates = balancedJsonObjectCandidates(text);
  assert.equal(candidates.length, 1);
  assert.deepEqual(JSON.parse(candidates[0]), { creativeIntent: { motif: { element: "máy ghi âm" } }, story: 'Linh nói: "Dừng lại."' });
});

test("balanced JSON extraction respects braces and escapes inside strings", () => {
  const text = `noise {"line":"Giữ { dấu ngoặc } và \\\"quote\\\"","items":[{"id":1}]} trailing } junk`;
  assert.deepEqual(JSON.parse(balancedJsonObjectCandidates(text)[0]), { line: 'Giữ { dấu ngoặc } và "quote"', items: [{ id: 1 }] });
});

test("structured importer can prefer the largest complete payload over a provider prelude", () => {
  const text = `status {"ok":true}\n{"visualRequirements":[{"role":"main_character"}],"scenes":[{"id":"scene_1"}]}`;
  const candidates = balancedJsonObjectCandidates(text).sort((left, right) => right.length - left.length);
  assert.equal(JSON.parse(candidates[0]).visualRequirements[0].role, "main_character");
});

test("truncated top-level JSON never degrades into a valid nested object", () => {
  const text = `{"visualRequirements":[{"role":"main_character"}],"scenes":[{"id":"scene_1"},{"id":"scene_2"}`;
  assert.deepEqual(balancedJsonObjectCandidates(text), []);
});
