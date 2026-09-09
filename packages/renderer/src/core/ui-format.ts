const labels: Record<string, string> = {
  video: "Video", image: "Ảnh", audio: "Âm thanh", text: "Văn bản",
  screenplay: "Kịch bản", story: "Câu chuyện", keyframe: "Khung hình",
  idea: "Ý tưởng", novel: "Tiểu thuyết / văn xuôi", "short film": "Phim ngắn",
  "short video": "Video ngắn", "video series": "Series video",
  foundation: "Câu chuyện hoàn chỉnh", architecture: "Phân tách cảnh",
  shots: "Phân rã shot", compile: "Chuẩn bị công cụ", review: "Rà soát",
  "ai scene package": "Gói cảnh AI", "local draft template": "Bản nháp tại chỗ",
  "opening provider": "Mở công cụ", submitting: "Gửi yêu cầu", generating: "Đang tạo",
  downloading: "Đang tải kết quả", "awaiting provider": "Chờ công cụ phản hồi",
  recoverable: "Có thể tiếp tục", "awaiting user": "Chờ xử lý", "waiting login": "Cần đăng nhập",
  "waiting manual action": "Cần thao tác", "failed retryable": "Lỗi có thể thử lại",
  "failed manual": "Lỗi cần xử lý", "review required": "Cần xem lại", cancelled: "Đã hủy",
  "text to image": "Tạo ảnh", "image to video": "Tạo video", "text to video": "Tạo video",
  realistic: "Người đóng chân thực", anime: "Hoạt hình Nhật", "3d cartoon": "Hoạt hình 3D",
  "stop motion": "Hoạt hình stop-motion", "flat illustration": "Minh hoạ phẳng",
  main: "Nhân vật chính", "main character": "Nhân vật chính", supporting: "Nhân vật phụ",
  "supporting character": "Nhân vật phụ", voice_only: "Chỉ có giọng nói", "voice only": "Chỉ có giọng nói",
  character: "Nhân vật", prop: "Đạo cụ", location: "Bối cảnh", visual_style: "Phong cách hình ảnh",
  "story foundation": "Phát triển câu chuyện", "screenplay scene": "Viết kịch bản scene",
  "shot breakdown": "Phân rã shot", "quick visual analysis": "Phân tích tham chiếu",
  "production graph revision": "Chỉnh tài liệu sản xuất", "connection test": "Kiểm tra kết nối"
};
export function formatLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim().toLowerCase();
  return labels[normalized] || value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
/** Keep persisted provider-facing values stable while showing known defaults in the UI language. */
export function audienceLabel(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "general audience" || normalized === "general") return "Khán giả phổ thông";
  return value || "";
}
export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Đã duyệt", done: "Hoàn thành", completed: "Hoàn thành",
    running: "Đang chạy", queued: "Đang chờ", pending: "Đang chờ",
    waiting_manual_action: "Cần xử lý", waiting_login: "Cần đăng nhập",
    opening_provider: "Mở công cụ", submitting: "Gửi yêu cầu", generating: "Đang tạo",
    downloading: "Đang tải kết quả", awaiting_provider: "Chờ công cụ phản hồi",
    recoverable: "Có thể tiếp tục", awaiting_user: "Chờ xử lý",
    failed_retryable: "Lỗi · Có thể thử lại", failed_manual: "Lỗi cần xử lý",
    cancelled: "Đã hủy", review_required: "Cần xem lại"
  };
  return labels[status] || labels[status.replaceAll("_", " ")] || status.replaceAll("_", " ");
}

/** Convert common provider diagnostics into concise localized UI copy. */
export function userFacingJobMessage(message?: string) {
  if (!message) return "";
  const value = message.trim();
  const timeout = value.match(/Provider job timed out after (\d+) attempts?/i);
  if (timeout) return `Công cụ không phản hồi sau ${timeout[1]} lần thử.`;
  if (/No exact Flow library match found|account\/credit profile dialog|account.*picker|visual reference could not be attached completely/i.test(value)) return "Flow đang mở đúng workspace nhưng chưa gắn được keyframe vào composer. Đóng hộp thoại tài khoản/picker nếu đang chồng lên nhau, giữ một keyframe rồi thử lại một lần.";
  if (/No recoverable Google Flow video was found in the current project tab/i.test(value)) return "Không tìm thấy video Flow có thể khôi phục trong tab dự án hiện tại.";
  if (/Timed out waiting for continuity reference \d+/i.test(value)) return "Flow workspace chưa trả ảnh tham chiếu về Studio Shot Bridge. Giữ đúng 1 tab project Flow và 1 tab runtime, mở Tệp tải lên để kiểm tra ảnh, rồi làm mới trạng thái trước khi thử lại.";
  if (/Timed out waiting for storyboard media|sandbox target was not found|primeFlowSdkMedia\([^)]*\)\.then is not a function|Application error: a client-side exception/i.test(value)) return "Flow đang ở bản chỉnh sửa hoặc runtime bị lỗi. Hãy mở project Flow → Công cụ → Studio Shot Bridge bản runtime, rồi làm mới trạng thái trước khi thử lại.";
  if (/Flow composer add button was not visible/i.test(value)) return "Studio Shot Bridge runtime không có control composer cần thiết. Bấm Xong, mở lại tool từ Công cụ → Studio Shot Bridge bản runtime, rồi làm mới trạng thái trước khi thử lại.";
  if (/Flow (?:component picker did not open|library upload menu did not open)/i.test(value)) return "Flow không mở được bộ chọn media. Hãy giữ một project Flow và một tab runtime đang đăng nhập, mở lại tool từ Công cụ, rồi làm mới trạng thái trước khi thử lại.";
  if (/blank DRAFT with no storyboard or references|không nhận được storyboard\/reference từ Flow picker/i.test(value)) return "Flow picker chưa trả storyboard/reference cho Studio Shot Bridge. Hãy giữ một project Flow và một tab runtime đang đăng nhập, mở lại tool từ Công cụ, rồi làm mới trạng thái trước khi thử lại.";
  if (/Could not find or control the Google Flow prompt editor|Native text insertion did not update the visible Slate editor/i.test(value)) return "Flow không nhận được nội dung shot trong ô nhập. Hãy mở lại workspace Flow, đóng hộp thoại đang chồng lên và kiểm tra đúng project trước khi thử lại một shot.";
  if (/Flow reloaded after submit, but strict recovery could not tie a completed video to this job/i.test(value)) return "Flow đã tải lại nhưng chưa xác nhận được video hoàn tất cho tác vụ này.";
  if (/ChatGPT returned an image candidate.*asset handoff|extension did not complete asset handoff before the watchdog deadline/i.test(value)) return "Công cụ hình ảnh đã trả kết quả nhưng chưa bàn giao được tệp cho ứng dụng. Hãy tải lại tab công cụ rồi thử lại một lần.";
  if (/Cancelled by the user from the desktop app/i.test(value)) return "Đã hủy theo yêu cầu.";
  if (/Browser extension did not acknowledge the provider job/i.test(value)) return "Tiện ích trình duyệt chưa xác nhận được tác vụ với công cụ.";
  if (/Desktop bridge is unavailable/i.test(value)) return "Ứng dụng desktop chưa kết nối bridge. Hãy mở lại ứng dụng desktop rồi thử lại.";
  if (/Reference job was previously marked complete without an imported image asset/i.test(value)) return "Tác vụ ảnh tham chiếu trước đó đã kết thúc nhưng chưa nhập được ảnh. Hãy tải lại tab công cụ rồi thử lại một lần.";
  if (/SCREENPLAY_RUNTIME_OVERFLOW/i.test(value)) return "Kịch bản scene cần nhiều shot tối thiểu hơn thời lượng dự án cho phép. Hãy rút gọn cue độc lập hoặc tăng thời lượng dự án rồi chạy lại bước kịch bản; không retry nguyên trạng.";
  if (/SCREENPLAY_DEPENDENCY_CONFLICT|cue .* appears before or at its required trigger/i.test(value)) return "Kịch bản scene có một nhịp hành động đứng trước điều kiện bắt buộc; hãy thử lại bước viết kịch bản.";
  return value;
}
export function frameOrientation(aspectRatio: string) {
  if (aspectRatio === "16:9") return "horizontal";
  if (aspectRatio === "1:1") return "square";
  return "vertical";
}
