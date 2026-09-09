const assert = require("node:assert/strict");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const modulePromise = import(pathToFileURL(path.resolve(__dirname, "../core/ui-format.ts")));

test("provider lifecycle statuses stay localized in user-facing surfaces", async () => {
  const { statusLabel, formatLabel } = await modulePromise;
  const statuses = {
    opening_provider: "Mở công cụ",
    submitting: "Gửi yêu cầu",
    generating: "Đang tạo",
    downloading: "Đang tải kết quả",
    awaiting_provider: "Chờ công cụ phản hồi",
    failed_retryable: "Lỗi · Có thể thử lại"
  };
  for (const [status, expected] of Object.entries(statuses)) assert.equal(statusLabel(status), expected, status);
  assert.equal(formatLabel("image_to_video"), "Tạo video");
  assert.equal(formatLabel("quick_visual_analysis"), "Phân tích tham chiếu");
});

test("common provider diagnostics are localized without hiding unknown diagnostics", async () => {
  const { userFacingJobMessage } = await modulePromise;
  assert.equal(userFacingJobMessage("Provider job timed out after 3 attempts."), "Công cụ không phản hồi sau 3 lần thử.");
  assert.equal(userFacingJobMessage("Flow visual reference could not be attached completely; account/credit profile dialog blocked the picker."), "Flow đang mở đúng workspace nhưng chưa gắn được keyframe vào composer. Đóng hộp thoại tài khoản/picker nếu đang chồng lên nhau, giữ một keyframe rồi thử lại một lần.");
  assert.equal(userFacingJobMessage("No recoverable Google Flow video was found in the current project tab."), "Không tìm thấy video Flow có thể khôi phục trong tab dự án hiện tại.");
  assert.equal(userFacingJobMessage("Failed to open provider tab: Timed out waiting for continuity reference 1."), "Flow workspace chưa trả ảnh tham chiếu về Studio Shot Bridge. Giữ đúng 1 tab project Flow và 1 tab runtime, mở Tệp tải lên để kiểm tra ảnh, rồi làm mới trạng thái trước khi thử lại.");
  assert.equal(userFacingJobMessage("Failed to open provider tab: Timed out waiting for storyboard media."), "Flow đang ở bản chỉnh sửa hoặc runtime bị lỗi. Hãy mở project Flow → Công cụ → Studio Shot Bridge bản runtime, rồi làm mới trạng thái trước khi thử lại.");
  assert.equal(userFacingJobMessage("Studio Shot Bridge không nhận được storyboard/reference từ Flow picker. Hãy giữ một project Flow và một tab runtime đang đăng nhập, mở lại PDL Studio Shot Bridge từ Công cụ, rồi làm mới trạng thái trước khi thử lại."), "Flow picker chưa trả storyboard/reference cho Studio Shot Bridge. Hãy giữ một project Flow và một tab runtime đang đăng nhập, mở lại tool từ Công cụ, rồi làm mới trạng thái trước khi thử lại.");
  assert.equal(userFacingJobMessage("Flow composer add button was not visible; refusing toolbar upload path."), "Studio Shot Bridge runtime không có control composer cần thiết. Bấm Xong, mở lại tool từ Công cụ → Studio Shot Bridge bản runtime, rồi làm mới trạng thái trước khi thử lại.");
  assert.equal(userFacingJobMessage("Flow composer add button was not visible; runtime tool shell is incomplete."), "Studio Shot Bridge runtime không có control composer cần thiết. Bấm Xong, mở lại tool từ Công cụ → Studio Shot Bridge bản runtime, rồi làm mới trạng thái trước khi thử lại.");
  assert.equal(userFacingJobMessage("Could not find or control the Google Flow prompt editor. Native text insertion did not update the visible Slate editor; unsafe DOM fallbacks were skipped."), "Flow không nhận được nội dung shot trong ô nhập. Hãy mở lại workspace Flow, đóng hộp thoại đang chồng lên và kiểm tra đúng project trước khi thử lại một shot.");
  assert.equal(userFacingJobMessage("ChatGPT returned an image candidate, but the extension did not complete asset handoff before the watchdog deadline."), "Công cụ hình ảnh đã trả kết quả nhưng chưa bàn giao được tệp cho ứng dụng. Hãy tải lại tab công cụ rồi thử lại một lần.");
  assert.equal(userFacingJobMessage("Desktop bridge is unavailable."), "Ứng dụng desktop chưa kết nối bridge. Hãy mở lại ứng dụng desktop rồi thử lại.");
  assert.equal(userFacingJobMessage("Reference job was previously marked complete without an imported image asset."), "Tác vụ ảnh tham chiếu trước đó đã kết thúc nhưng chưa nhập được ảnh. Hãy tải lại tab công cụ rồi thử lại một lần.");
  assert.equal(userFacingJobMessage("Cannot import scene screenplay: SCREENPLAY_DEPENDENCY_CONFLICT: cue act_1_02 appears before or at its required trigger."), "Kịch bản scene có một nhịp hành động đứng trước điều kiện bắt buộc; hãy thử lại bước viết kịch bản.");
  assert.equal(userFacingJobMessage("Cannot import scene screenplay: SCREENPLAY_RUNTIME_OVERFLOW: locked cues require at least 8 atomic shots, but the 30s provider budget supports at most 7."), "Kịch bản scene cần nhiều shot tối thiểu hơn thời lượng dự án cho phép. Hãy rút gọn cue độc lập hoặc tăng thời lượng dự án rồi chạy lại bước kịch bản; không retry nguyên trạng.");
  assert.equal(userFacingJobMessage("developer-only diagnostic"), "developer-only diagnostic");
});
