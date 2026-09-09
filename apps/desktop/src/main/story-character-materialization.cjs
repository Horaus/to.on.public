function isProductionCharacter(character, index) {
  const role = String(character.role || "").toLowerCase();
  const productionRole = /main|support|lead|character|presenter|voice|narrator|nhân vật|phụ|chính|giọng/i.test(role);
  const contextRole = /context|background|crowd|setting|bối cảnh|lớp|đám đông/i.test(role);
  return Boolean(character.audibleOnly || character.required || index === 0 || productionRole) && !contextRole;
}

function findCharacterByName(characters, projectId, name) {
  const normalizedName = String(name || "").trim().toLowerCase();
  return characters.find((character) =>
    character.projectId === projectId && String(character.name || "").trim().toLowerCase() === normalizedName
  );
}

const { authoredCharacterField } = require("./character-field.cjs");

function storyCharacterPatch(storyCharacter, timestamp) {
  const name = String(storyCharacter.name || "Character").trim() || "Character";
  return {
    name,
    role: String(storyCharacter.role || "character"),
    visualDescription: authoredCharacterField(storyCharacter, "visualBrief"),
    // Only copy authored visual/performance facts. Never manufacture outfit,
    // continuity, or voice text just to fill a UI field.
    outfit: authoredCharacterField(storyCharacter, "outfit"),
    // Story function is narrative responsibility, not a personality fact.
    // Keep the editor empty unless the author explicitly supplied personality.
    personality: authoredCharacterField(storyCharacter, "personality"),
    consistencyNotes: authoredCharacterField(storyCharacter, "consistencyNotes") || authoredCharacterField(storyCharacter, "continuityNotes"),
    updatedAt: timestamp
  };
}

function screenplaySpeakerNames(resolvedScenes) {
  return Array.from(new Set(resolvedScenes.flatMap((scene) =>
    (Array.isArray(scene.shots) ? scene.shots : [])
      .filter((shot) => String(shot.speechType || "") !== "silent" && String(shot.speaker || "").trim())
      .map((shot) => String(shot.speaker).trim())
  )));
}

function createVoiceOnlyCharacter({ projectId, speakerName, makeId }) {
  return {
    id: makeId("character"),
    projectId,
    name: speakerName,
    role: /^narrator$/i.test(speakerName) ? "narrator" : "voice_only",
    visualDescription: "",
    outfit: "",
    face: "",
    referenceAssetIds: [],
    personality: "",
    consistencyNotes: "",
    negativeTraits: "Do not switch speaker identity, delivery style, or provider voice between shots."
  };
}

function materializeStoryCharacters({ project, resolvedScenes, characters, makeId, timestamp }) {
  const storyCharacters = (project.storyDocument?.characters || []).filter(isProductionCharacter);
  for (const storyCharacter of storyCharacters) {
    const patch = storyCharacterPatch(storyCharacter, timestamp);
    const existing = findCharacterByName(characters, project.id, patch.name);
    if (existing) {
      Object.assign(existing, patch);
      continue;
    }
    characters.push({
      id: makeId("character"),
      projectId: project.id,
      ...patch,
      face: "",
      referenceAssetIds: [],
      negativeTraits: "Do not borrow identity from another project."
    });
  }

  for (const speakerName of screenplaySpeakerNames(resolvedScenes)) {
    if (findCharacterByName(characters, project.id, speakerName)) continue;
    characters.push(createVoiceOnlyCharacter({ projectId: project.id, speakerName, makeId }));
  }
}

module.exports = { materializeStoryCharacters };
