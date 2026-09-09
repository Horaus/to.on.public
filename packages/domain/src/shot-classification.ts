const TRANSFORMATION_PATTERNS: Array<[string, RegExp]> = [
  ["open_close", /\b(?:open|close|unfold|fold)\b|(?:^|\s)(?:mở|đóng|bung|xếp)(?:\s|$)/giu],
  ["lift_weight", /\b(?:lift|raise|lower)\b|(?:^|\s)(?:nhấc|nâng|hạ)(?:\s|$)/giu],
  ["extract_rescue", /\b(?:extract|free|rescue|pull\s+.+\s+out)\b|(?:kéo|rút).{0,35}(?:ra|khỏi)|(?:^|\s)cứu(?:\s|$)/giu],
  ["detach_remove", /\b(?:detach|remove|release|unscrew)\b|(?:^|\s)(?:tháo|nhả|gỡ)(?:\s|$)/giu],
  ["attach_install", /\b(?:attach|install|insert|fasten)\b|(?:^|\s)(?:lắp|gắn|cài)(?:\s|$)|khóa.{0,24}(?:vào|trục)|(?:^|\s)đặt.{0,35}(?:vào|trong)(?:\s|$)/giu],
  ["break_damage", /\b(?:break|damage|tear|shatter|tears|breaks|shatters)\b|(?:bị|làm|khiến|bắt đầu|dần).{0,15}(?:gãy|vỡ|rách|hỏng)|(?:gãy|vỡ|rách)\s+(?:ra|dần|toạc)|(?:gãy|vỡ|rách).{0,20}\sdo\s|màu.{0,20}loang/giu],
  ["transfer", /\b(?:transfer|move)\b|(?:^|\s)(?:chuyển|di chuyển)(?:\s|$)/giu]
];

const INDEPENDENT_ACTION_OPERATION_PATTERNS: Array<[string, RegExp]> = [
  ["cancel_command", /\b(?:cancel|abort|revoke)\b|(?:^|[;,]\s*|\s)(?:hủy|huỷ|rút)\s+(?:lệnh|quyết định)(?=[\s,.;]|$)/iu],
  ["release_object", /\b(?:release|let go of)\b|(?:^|[;,]\s*|\s)(?:buông|nhả)\s+(?:chìa|khóa|khoá|tay|vật)(?=[\s,.;]|$)/iu],
  ["activate_control", /\b(?:press|push|activate)\b|(?:^|[;,]\s*|\s)(?:nhấn|ấn|bấm)\s+(?:nút|phím|công tắc)(?=[\s,.;]|$)/iu],
  ["call_contact", /\b(?:call|phone|contact)\b|(?:^|[;,]\s*|\s)(?:gọi|liên lạc)\s+(?:kỹ thuật|điện thoại|cho|với|đến|người)(?=[\s,.;]|$)/iu]
];

function normalizeTransformationText(...values: unknown[]) {
  return values.map((value) => String(value || "")).join(" ")
    .replace(/(?:ánh mắt|tầm mắt|gaze|eyes?).{0,45}?(?:chuyển|di chuyển|move|shift)(?:.{0,35})?(?=[;,.]|$)/giu, " ")
    .replace(/(?:^|\s)mở\s+(?:bàn\s+)?tay(?=[\s,.;]|$)/giu, " ")
    .replace(/(?:bàn\s+tay|lòng\s+bàn\s+tay).{0,24}?(?:đang\s+)?mở(?:\s+sẵn)?/giu, " ")
    .replace(/(?:cảnh báo|tín hiệu|tiếng|âm thanh|chuông|lệnh).{0,28}(?:đóng|mở)\s+(?:cửa|cổng|khóa)(?:.{0,35})?(?=[;,.]|$)/giu, " ")
    .replace(/(?:^|\s)rút\s+(?:bàn\s+)?tay[^;,.]*/giu, " ")
    .replace(/(?:đặt|giữ)\s+(?:đầu\s+)?ngón\s+tay.{0,35}?(?:vào|trên|đúng)\s+(?:dấu|mốc|dòng|vị\s+trí)[^;,.]*/giu, " ")
    .replace(/(?:nền|hậu\s+cảnh|phông\s+nền|background).{0,45}?(?:chuyển\s+động|di\s+chuyển|move)(?:.{0,24})?(?=[;,.]|$)/giu, " ");
}

function classifyTransformations(...values: unknown[]) {
  const text = normalizeTransformationText(...values);
  const kinds = TRANSFORMATION_PATTERNS.filter(([, pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  }).map(([kind]) => kind);
  const ownershipNormalized = kinds.includes("detach_remove") ? kinds.filter((kind) => kind !== "extract_rescue") : kinds;
  if (ownershipNormalized.includes("attach_install")) return ownershipNormalized.filter((kind) => kind !== "lift_weight" && kind !== "transfer");
  if (ownershipNormalized.includes("transfer")) return ownershipNormalized.filter((kind) => kind !== "lift_weight");
  return ownershipNormalized;
}

type ShotTransformationInput = { motion?: unknown; actionBeats?: Array<{ action?: unknown }> };

export function classifyVisibleTransformations(shot: ShotTransformationInput): string[] {
  return classifyTransformations(shot?.motion, ...(Array.isArray(shot?.actionBeats) ? shot.actionBeats.map((beat) => beat?.action) : []));
}

export function classifyImportedShotTransformations(motion?: string, dominantAction?: string): string[] {
  return classifyTransformations(motion, dominantAction);
}

export function classifyIndependentActionOperations(...values: unknown[]): string[] {
  const text = values.map((value) => String(value || "")).join(" ");
  return INDEPENDENT_ACTION_OPERATION_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}
