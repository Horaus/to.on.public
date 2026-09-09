function normalizeCharacterContracts(state) {
  const fakeVisual = /^(?:không có đặc điểm ngoại hình được nguồn khóa|no (?:locked )?visual (?:description|definition)|needs visual definition(?: from character & style)?)\.?$/iu;
  const importedContinuity = /^(?:generated from|tạo từ|sinh từ) (?:the )?(?:imported|story|kịch bản|câu chuyện) (?:story )?package\b|^this recurring character needs locked visual references\b/iu;
  const fakePersonality = /^(?:phát hiện sự cố, truy trách nhiệm và ép nhóm hành động|dẫn xung đột và thực hiện lựa chọn chấm dứt tranh chấp)\.?$/iu;
  for (const character of state.characters || []) {
    normalizeCharacterFields(character, fakeVisual, importedContinuity);
    const storyCharacter = findStoryCharacter(state, character);
    if (shouldClearPersonality(character, storyCharacter, fakePersonality)) character.personality = "";
  }
}

function normalizeCharacterFields(character, fakeVisual, importedContinuity) {
  if (fakeVisual.test(String(character.visualDescription || ""))) character.visualDescription = "";
  if (fakeVisual.test(String(character.outfit || ""))) character.outfit = "";
  if (importedContinuity.test(String(character.consistencyNotes || ""))) character.consistencyNotes = "";
}

function findStoryCharacter(state, character) {
  const name = String(character.name || "").trim().toLowerCase();
  return (state.projects || []).find((project) => project.id === character.projectId)?.storyDocument?.characters?.find((item) =>
    String(item.name || "").trim().toLowerCase() === name
  );
}

function shouldClearPersonality(character, storyCharacter, fakePersonality) {
  const personality = String(character.personality || "").trim();
  const normalized = personality.replace(/[.!?]+$/g, "").toLowerCase();
  const storyFunction = String(storyCharacter?.storyFunction || "").trim().replace(/[.!?]+$/g, "").toLowerCase();
  return fakePersonality.test(personality) || Boolean(storyFunction && normalized === storyFunction);
}

module.exports = { normalizeCharacterContracts };
