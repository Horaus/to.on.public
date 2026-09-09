const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("extension popup exposes boundary-specific Flow readiness and a bounded refresh action", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../../popup.html"), "utf8");
  const script = fs.readFileSync(path.resolve(__dirname, "../../popup.js"), "utf8");
  assert.match(html, /Kiểm tra từng chặng kết nối/);
  assert.match(html, /Quét lại kết nối/);
  assert.match(script, /Chưa mở project Flow/);
  assert.match(script, /Nhiều tab Flow/);
  assert.match(script, /Workspace Flow sẵn sàng/);
  assert.match(script, /Tiết kiệm năng lượng/);
  assert.match(script, /Đã thấy ứng viên/);
  assert.match(script, /Chờ desktop phê duyệt/);
  assert.match(script, /Không hiển thị secret/);
  assert.match(script, /không tự gửi job/);
  assert.doesNotMatch(script, /setInterval|setTimeout\([^)]*refresh/);
});
