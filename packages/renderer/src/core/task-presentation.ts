import type { AutomationJob } from "@studio/types";
import { isActiveJob, jobNeedsUserAction } from "@studio/renderer-core/job-status";

export type ProductionTaskStage = "story" | "scene" | "shot" | "identity" | "storyboard" | "video" | "audio" | "export" | "system";
export type ProductionTaskTone = "queued" | "running" | "review" | "success" | "warning" | "error" | "cancelled";

const TASKS: Record<string, { stage: ProductionTaskStage; label: string }> = {
  story_foundation: { stage: "story", label: "Phát triển câu chuyện" },
  screenplay_scene: { stage: "scene", label: "Viết kịch bản scene" },
  shot_breakdown: { stage: "shot", label: "Phân rã shot" },
  quick_visual_analysis: { stage: "identity", label: "Phân tích tham chiếu" },
  text_to_image: { stage: "storyboard", label: "Tạo hình ảnh" },
  image_to_video: { stage: "video", label: "Tạo video shot" },
  text_to_video: { stage: "video", label: "Tạo video shot" },
  production_graph_revision: { stage: "system", label: "Chỉnh tài liệu sản xuất" },
  connection_test: { stage: "system", label: "Kiểm tra kết nối" }
};

function taskName(job: AutomationJob) {
  const input = job.input as { bridgeMessage?: { task?: string; settings?: Record<string, unknown> } } | undefined;
  return String(input?.bridgeMessage?.task || "");
}

export function productionTaskPresentation(job: AutomationJob) {
  const task = taskName(job);
  const configured = TASKS[task];
  const settings = (job.input as any)?.bridgeMessage?.settings || {};
  let stage = configured?.stage || (job.jobType === "video" ? "video" : job.jobType === "image" ? "storyboard" : job.jobType === "audio" ? "audio" : "system");
  let label = configured?.label || (job.jobType === "video" ? "Tạo video" : job.jobType === "image" ? "Tạo hình ảnh" : job.jobType === "text" ? "Xử lý nội dung" : "Tác vụ hệ thống");
  if (task === "text_to_image" && settings.directReferenceUse === "primary_identity") { stage = "identity"; label = "Tạo ảnh nhân vật"; }
  if (task === "text_to_image" && settings.directReferenceUse === "supporting_detail") { stage = "identity"; label = "Tạo bảng chi tiết nhân vật"; }
  if (task === "text_to_image" && job.shotId) { stage = "storyboard"; label = "Tạo keyframe shot"; }
  const tone: ProductionTaskTone = job.status === "cancelled" ? "cancelled"
    : job.status.startsWith("failed") ? "error"
    : jobNeedsUserAction(job) ? "warning"
    : isActiveJob(job) ? "running"
    : job.status === "review_required" ? "review"
    : ["done", "approved"].includes(job.status) ? "success" : "queued";
  return { stage, label, tone, task };
}

export function taskStatusLabel(tone: ProductionTaskTone) {
  return ({ queued: "Đang chờ", running: "Đang chạy", review: "Cần kiểm tra", success: "Hoàn thành", warning: "Cần xử lý", error: "Lỗi", cancelled: "Đã hủy" } as const)[tone];
}

export function taskStageLabel(stage: ProductionTaskStage) {
  return ({ story: "Kịch bản", scene: "Phân cảnh", shot: "Shot", identity: "Nhận diện", storyboard: "Khung hình", video: "Video", audio: "Âm thanh", export: "Xuất bản", system: "Hệ thống" } as const)[stage];
}
