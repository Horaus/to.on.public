const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCharacterContracts } = require("../main/state/character-contract-normalizer.cjs");

test("character contract normalizer removes generated defaults but preserves authored details", () => {
  const state = {
    projects: [{ id: "p1", storyDocument: { characters: [{ name: "Mai", storyFunction: "Điều tra sự cố" }] } }],
    characters: [
      { projectId: "p1", name: "Mai", visualDescription: "No locked visual description", outfit: "Không có đặc điểm ngoại hình được nguồn khóa.", personality: "Điều tra sự cố", consistencyNotes: "Generated from the imported story package. Needs references." },
      { projectId: "p1", name: "An", visualDescription: "Nam, tóc ngắn, áo khoác xanh", outfit: "Áo khoác xanh", personality: "Điềm tĩnh", consistencyNotes: "Giữ nguyên khuôn mặt" }
    ]
  };

  normalizeCharacterContracts(state);

  assert.deepEqual(state.characters[0], { projectId: "p1", name: "Mai", visualDescription: "", outfit: "", personality: "", consistencyNotes: "" });
  assert.equal(state.characters[1].visualDescription, "Nam, tóc ngắn, áo khoác xanh");
  assert.equal(state.characters[1].personality, "Điềm tĩnh");
});
