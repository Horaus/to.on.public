import type { Character, Project, StoryCharacter } from "@studio/types";

type StoryDocument = NonNullable<Project["storyDocument"]>;

export function inferStoryCharacters(document: StoryDocument | undefined, fallbackCharacter: Character): StoryCharacter[] {
  if (document?.characters?.length) return document.characters;
  const storyText = `${document?.logline ?? ""}\n${document?.story ?? ""}`;
  const inferred: StoryCharacter[] = [];
  if (/dược sĩ|pharmacist/i.test(storyText)) inferred.push({
    name: "Dược sĩ tư vấn",
    role: "Main presenter",
    storyFunction: "Giải thích thông tin sức khỏe, giữ giọng trung lập và đáng tin.",
    visualBrief: "Áo blouse trắng, hiệu thuốc sáng, thái độ bình tĩnh.",
    required: true
  });
  if (/phụ huynh|cha mẹ|parent|mother|father|mẹ/i.test(storyText)) inferred.push({
    name: "Phụ huynh",
    role: "Supporting character",
    storyFunction: "Đại diện nỗi lo của người xem và phản ứng với lời khuyên.",
    visualBrief: "Người lớn cầm điện thoại/checklist, biểu cảm quan tâm.",
    required: false
  });
  if (/trẻ|con|adolescent|teen|đứa trẻ/i.test(storyText)) inferred.push({
    name: "Trẻ vị thành niên",
    role: "Context character",
    storyFunction: "Tạo ngữ cảnh tăng trưởng nhưng không bị dùng làm bằng chứng trước-sau.",
    visualBrief: "Xuất hiện gián tiếp hoặc trong bối cảnh gia đình lành mạnh.",
    required: false
  });
  if (inferred.length) return inferred;
  return [{
    name: fallbackCharacter.name || "Main character",
    role: fallbackCharacter.role || "Main character",
    storyFunction: "",
    visualBrief: fallbackCharacter.visualDescription || "",
    required: true
  }];
}

export function isVisualProductionCharacter(item: StoryCharacter) {
  if (item.audibleOnly) return false;
  const text = `${item.name || ""} ${item.role || ""} ${item.storyFunction || ""} ${item.visualBrief || ""}`.toLowerCase();
  return Boolean(item.required || /main|support|lead|character|presenter|nhân vật|phụ|chính|object|prop|card|item|artifact|đồ vật|đạo cụ|vật phẩm|thẻ/i.test(text)) &&
    !/context|background|crowd|setting|bối cảnh|lớp|đám đông/i.test(`${item.role || ""}`.toLowerCase());
}

export function isObjectLikeStorySubject(name = "", role = "", visualBrief = "") {
  const roleText = role.toLowerCase();
  const nameText = name.toLowerCase();
  const visualText = visualBrief.toLowerCase();
  if (/main|lead|character|nhân vật|chính|người|human|person|animal|mascot|cat|dog|rabbit|mèo|chó|thỏ/i.test(`${roleText} ${nameText} ${visualText}`)) {
    return false;
  }
  return /object|prop|card|item|artifact|book|token|đồ vật|đạo cụ|vật phẩm|thẻ|lá bài|quyển|sách|chìa khóa|bùa|huy hiệu/i
    .test(`${nameText} ${roleText}`);
}

export function compactSentence(value = "") {
  return value.replace(/\s+/g, " ").trim().replace(/\.+$/, ".");
}

export function sameMeaning(a = "", b = "") {
  const left = compactSentence(a).toLowerCase();
  const right = compactSentence(b).toLowerCase();
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

export function mergeDistinct(...values: Array<string | undefined>) {
  return values
    .map(compactSentence)
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((candidate) => sameMeaning(candidate, value)) === index)
    .join("\n");
}
