const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadPromptBuilder() {
  const sourcePath = path.resolve(__dirname, "../../../workflow/src/video-generation.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  const module = { exports };
  vm.runInNewContext(compiled, { exports, module, require, console });
  return module.exports.buildVideoGenerationPrompt;
}

test("video runtime prompt preserves long authored fields", () => {
  const buildVideoGenerationPrompt = loadPromptBuilder();
  const motion = "Mai, Nam và Linh cùng thao tác với bản sao lưu để thay thế bản thu lỗi và đưa nội dung đã khôi phục vào trạng thái sẵn sàng phát; tay cả ba phối hợp nhanh quanh khu làm việc trong khi bàn mixer và các neo cố định giữ nguyên vị trí.";
  const voiceDirection = "Trực diện, ngắn, thúc ép khi thời gian cạn; tiếng Việt tự nhiên; không khóa giọng vùng miền; giữ nhịp rõ ràng và không thêm lời.";
  const prompt = buildVideoGenerationPrompt({
    shot: {
      durationSec: 4,
      description: "Cảnh trong phòng phát thanh.",
      motion,
      dominantAction: motion,
      camera: "medium_close (trung cận), eye_level (ngang mắt), lock (khóa khung), target: bàn mixer và cả ba",
      dialogue: "Dùng bản sao lưu. Cùng làm.",
      speaker: "Mai",
      speechDelivery: "onscreen_lipsync",
      audioContract: { voiceDirection },
      continuityContract: {
        incomingState: "Giải pháp đã có nhưng Mai và Nam chưa biến lựa chọn thành hành động chung.",
        outgoingState: "Cả ba tập trung vào cùng một quy trình xử lý, bản sao lưu được dùng để khôi phục nội dung."
      },
      actionBeats: []
    }
  });

  assert.match(prompt, /các neo cố định giữ nguyên vị trí\./);
  assert.match(prompt, /không thêm lời\./);
  assert.doesNotMatch(prompt, /các ne\.\.\.|không có\.\.\.\./);
});
