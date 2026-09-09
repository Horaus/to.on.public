const test = require("node:test");
const assert = require("node:assert/strict");
const { formatSceneBreakdown, storyWordRange } = require("../main/story-artifacts.cjs");

test("scene breakdown is a readable dramatic handoff rather than a title list", () => {
  const text = formatSceneBreakdown([{
    title: "Chiếc radio bật lại",
    summary: "Linh sửa được radio nhưng nghe một lời nhắn không thể có.",
    objective: "Xác định người đang phát tín hiệu.",
    conflict: "Tần số biến mất sau mỗi câu.",
    dramaticTurn: "Người nói gọi đúng tên Linh.",
    entryState: "Linh chỉ muốn bán chiếc radio.",
    exitState: "Linh quyết định giữ lại và trả lời."
  }]);
  assert.match(text, /^SC01 · Chiếc radio bật lại/m);
  assert.match(text, /Mục tiêu:/);
  assert.match(text, /Trở lực:/);
  assert.match(text, /Bước ngoặt:/);
  assert.match(text, /Chuyển trạng thái:.*→/);
});

test("complete story length scales with runtime but remains a story synopsis", () => {
  assert.deepEqual(storyWordRange(60), { minimum: 90, target: 120, maximum: 156 });
  assert.deepEqual(storyWordRange(600), { minimum: 315, target: 420, maximum: 546 });
});
