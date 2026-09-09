const { balancedJsonObjectCandidates } = require("../structured-json.cjs");

function parseJsonCandidate(candidate) {
  if (!candidate) throw new Error("ChatGPT response did not contain JSON.");
  try { return JSON.parse(candidate); } catch { return JSON.parse(repairLooseJsonQuotes(candidate)); }
}

function extractJson(text, preferred) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = (fenced ? [fenced, ...balancedJsonObjectCandidates(text)] : balancedJsonObjectCandidates(text)).sort((left, right) => right.length - left.length);
  let lastError;
  let firstParsed;
  for (const candidate of candidates) {
    try {
      const parsed = parseJsonCandidate(candidate);
      firstParsed ??= parsed;
      if (!preferred || preferred(parsed)) return parsed;
    } catch (error) { lastError = error; }
  }
  if (firstParsed) return firstParsed;
  if (lastError) throw lastError;
  throw new Error("ChatGPT response did not contain a complete JSON object.");
}

function extractBalancedJsonObjectFrom(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && inString) { escaped = true; continue; }
    if (char === "\"") inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return "";
}

function isUsableStoryPayload(value) {
  if (!value || typeof value !== "object" || typeof value.logline !== "string" || typeof value.story !== "string") return false;
  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  return scenes.length >= 1 && scenes.every((scene) => Array.isArray(scene?.shots) && scene.shots.length >= 1) && !storyPayloadIsSchemaEcho(value);
}

function storyPayloadIsSchemaEcho(value) {
  const placeholders = new Set(["one concise sentence", "primary subject name or stable label", "short scene title", "one visually observable action"]);
  const characters = Array.isArray(value.characters) ? value.characters : [];
  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  const requirements = Array.isArray(value.visualRequirements) ? value.visualRequirements : [];
  const placeholder = (text) => placeholders.has(String(text || "").trim().toLowerCase());
  return placeholder(value.logline) || characters.some((character) => placeholder(character?.name)) || scenes.some((scene) => placeholder(scene?.title) || (Array.isArray(scene?.shots) && scene.shots.some((shot) => placeholder(shot?.description)))) || requirements.some((requirement) => String(requirement?.role || "").includes(","));
}

function extractLatestStoryJson(text) {
  const fencedBlocks = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1]).reverse();
  for (const block of fencedBlocks) {
    try { const parsed = parseJsonCandidate(block); if (isUsableStoryPayload(parsed)) return parsed; } catch {}
  }
  const starts = [];
  for (let index = 0; index < text.length; index += 1) if (text[index] === "{") starts.push(index);
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const candidate = extractBalancedJsonObjectFrom(text, starts[index]);
    if (!candidate) continue;
    try { const parsed = parseJsonCandidate(candidate); if (isUsableStoryPayload(parsed)) return parsed; } catch {}
  }
  throw new Error("Story response is missing a real logline, story, or a scene containing at least one shot.");
}

function repairLooseJsonQuotes(input) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (!inString) { output += char; if (char === "\"") inString = true; continue; }
    if (escaped) { output += char; escaped = false; continue; }
    if (char === "\\") { output += char; escaped = true; continue; }
    if (char === "\"") {
      const next = input.slice(index + 1).match(/\S/)?.[0] || "";
      if ([":", ",", "}", "]"].includes(next)) { output += char; inString = false; } else output += "\\\"";
      continue;
    }
    output += char;
  }
  return output;
}

module.exports = { parseJsonCandidate, extractJson, extractLatestStoryJson, isUsableStoryPayload, repairLooseJsonQuotes };
