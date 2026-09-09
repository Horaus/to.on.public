function authoredCharacterField(storyCharacter, key) {
  const value = String(storyCharacter?.[key] || "").trim();
  const normalized = value.replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim().toLowerCase();
  if (isGeneratedPlaceholder(value, normalized)) return "";
  if (key === "personality" && isGeneratedPersonality(storyCharacter, normalized)) return "";
  return value;
}

function isGeneratedPlaceholder(value, normalized) {
  return !value || ["needs visual definition", "needs visual definition from character & style", "generated from", "không có đặc điểm ngoại hình được nguồn khóa"].includes(normalized)
    || normalized.startsWith("generated from the imported story package")
    || normalized.startsWith("generated from the story package")
    || normalized.startsWith("generated from imported story package")
    || normalized.startsWith("tạo từ gói kịch bản")
    || normalized.startsWith("sinh từ gói câu chuyện")
    || normalized.startsWith("this recurring character needs locked visual references");
}

function isGeneratedPersonality(storyCharacter, normalized) {
  const storyFunction = String(storyCharacter?.storyFunction || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").toLowerCase();
  return normalized === storyFunction || ["phát hiện sự cố, truy trách nhiệm và ép nhóm hành động", "dẫn xung đột và thực hiện lựa chọn chấm dứt tranh chấp"].includes(normalized);
}

module.exports = { authoredCharacterField };
