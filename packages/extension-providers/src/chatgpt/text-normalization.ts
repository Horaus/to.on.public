export function extractBalancedJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && inString) { escaped = true; continue; }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return "";
}

export function normalizeAssistantText(text: string): string {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).filter((line) => {
    const lower = line.toLowerCase();
    return ![/^thought for\b/, /^thinking\b/, /^đã suy nghĩ\b/, /^đang suy nghĩ\b/, /^suy nghĩ\b/, /^xem thêm$/, /^read aloud$/, /^copy$/, /^good response$/, /^bad response$/, /^chỉnh sửa$/, /^share$/, /^chia sẻ$/].some((pattern) => pattern.test(lower));
  }).join("\n").trim();
}

export function hasDegenerateStructuredTail(text: string): boolean {
  return /(?:_?\]\(\)){4,}$/.test(text.slice(-240).replace(/\s+/g, ""));
}
