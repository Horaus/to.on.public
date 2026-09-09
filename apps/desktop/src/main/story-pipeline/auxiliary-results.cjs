function validateQuickVisualAnalysisText(text) {
    const normalizedText = text.trim();
    const lowerText = normalizedText.toLowerCase();
    const missingImage = ["missing_image_attachment", "i don't see an attached image", "i do not see an attached image", "don't see the attached image", "do not see the attached image", "there is no attached image", "without the image", "missing image", "please re-upload", "cannot assess", "can't reliably identify", "không thấy ảnh", "không có ảnh", "thiếu ảnh"].some((value) => lowerText.includes(value));
    if (missingImage) throw new Error("ChatGPT did not receive the attached image. Reload the extension and retry so the image is attached before analysis.");
    const looksLikeStatusOnly = normalizedText.length < 140 || /^(thought for|thinking|đã suy nghĩ|đang suy nghĩ|suy nghĩ|risks?\s*:)/i.test(normalizedText);
    const requiredSections = [["subjects:", "subject:", "chủ thể:", "nhân vật:"], ["style:", "phong cách:"], ["character direction:", "định hướng nhân vật:"], ["background direction:", "định hướng bối cảnh:", "bối cảnh:"]];
    const hasRequiredSections = requiredSections.every((group) => group.some((value) => lowerText.includes(value)));
    const fallbackOnly = ["local fallback", "provider visual analysis was unavailable", "general note from user text only", "without the uploaded image", "without the image"].some((value) => lowerText.includes(value));
    if (looksLikeStatusOnly || fallbackOnly || !hasRequiredSections) throw new Error("Quick visual analysis response was not a usable visual analysis.");
    return normalizedText;
}

function createAuxiliaryResultHandlers({ getState, extractJson, now }) {
  function applyQuickVisualAnalysis(job, message) {
    const text = message.output?.text || message.assets?.[0]?.metadata?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("Quick visual analysis response did not include text.");
    const normalizedText = validateQuickVisualAnalysisText(text);
    const project = getState().projects.find((item) => item.id === job.projectId);
    if (!project) throw new Error("Project was not found for quick visual analysis response.");
    project.intake ||= {};
    project.intake.quickVisualInput ||= { sourceDescription: "", transformationRequest: "", updatedAt: now() };
    Object.assign(project.intake.quickVisualInput, { analysisText: normalizedText, analyzedAt: now(), analysisJobId: job.id, updatedAt: now() });
    project.updatedAt = now();
  }

  function applyTranslation(job, message) {
    const text = message.output?.text || message.assets?.[0]?.metadata?.text;
    if (typeof text !== "string") throw new Error("Translation response did not include text.");
    const result = extractJson(text);
    const state = getState();
    const project = state.projects.find((item) => item.id === job.projectId);
    if (!project) throw new Error("Project was not found for translation response.");
    const targetLanguage = String(result.language || job.input?.bridgeMessage?.settings?.targetLanguage || project.intake?.outputLanguage || "Vietnamese");
    translateStoryDocument(project, result, now);
    translateScenes(state, project, result.scenes);
    translateShots(state, result.shots);
    project.intake ||= {};
    project.intake.contentLanguage = targetLanguage;
    project.updatedAt = now();
  }

  return { applyQuickVisualAnalysis, applyTranslation };
}

function translateStoryDocument(project, result, now) {
  if (!project.storyDocument || !result.storyDocument) return;
  project.storyDocument = { ...project.storyDocument, logline: String(result.storyDocument.logline || project.storyDocument.logline), story: String(result.storyDocument.story || project.storyDocument.story), sceneBreakdown: String(result.storyDocument.sceneBreakdown || project.storyDocument.sceneBreakdown), screenplay: result.storyDocument.screenplay ? String(result.storyDocument.screenplay) : project.storyDocument.screenplay, characters: Array.isArray(result.storyDocument.characters) ? result.storyDocument.characters : project.storyDocument.characters, manuallyEdited: true, generatedAt: now() };
  project.description = project.storyDocument.logline;
}

function translateScenes(state, project, scenes) {
  for (const incoming of Array.isArray(scenes) ? scenes : []) {
    const scene = state.scenes.find((item) => item.id === incoming.id && item.projectId === project.id);
    if (!scene) continue;
    for (const key of ["title", "summary", "location", "timeOfDay", "emotionalTone", "objective", "conflict", "dramaticTurn", "entryState", "exitState"]) scene[key] = String(incoming[key] || scene[key] || "");
  }
}

function translateShots(state, shots) {
  for (const incoming of Array.isArray(shots) ? shots : []) {
    const shot = state.shots.find((item) => item.id === incoming.id);
    if (!shot) continue;
    for (const key of ["description", "camera", "motion", "dialogue", "speaker", "dialoguePurpose", "storyBeat", "transitionIn", "transitionOut", "screenDirection"]) shot[key] = String(incoming[key] || shot[key] || "");
    if (["dialogue", "inner_monologue", "narration", "silent"].includes(String(incoming.speechType))) shot.speechType = String(incoming.speechType);
    shot.prompt = "";
  }
}

module.exports = { createAuxiliaryResultHandlers };
