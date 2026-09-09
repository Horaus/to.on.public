function isVisualCharacter(character, index = 0) {
  const role = String(character?.role || "").toLowerCase();
  return Boolean(character?.audibleOnly || character?.required || index === 0 || /main|support|lead|character|presenter|voice|narrator|nhân vật|phụ|chính|giọng/i.test(role)) &&
    !/context|background|crowd|setting|bối cảnh|lớp|đám đông/i.test(role);
}

const { authoredCharacterField } = require("./character-field.cjs");

function characterPatchForStory({ project, storyCharacter, existingCharacter, characterIndex, catalog, autoCastMacosVoice, upgradeAutoCastMacosProfile, now }) {
  const nextName = String(storyCharacter.name || "Character").trim() || "Character";
  return {
    name: nextName, role: String(storyCharacter.role || "character"),
    visualDescription: authoredCharacterField(storyCharacter, "visualBrief"), outfit: authoredCharacterField(storyCharacter, "outfit"),
    personality: authoredCharacterField(storyCharacter, "personality"),
    consistencyNotes: authoredCharacterField(storyCharacter, "consistencyNotes") || authoredCharacterField(storyCharacter, "continuityNotes"),
    voiceProfile: existingCharacter?.voiceProfile?.locked ? upgradeAutoCastMacosProfile({ profile: existingCharacter.voiceProfile, character: storyCharacter, characterIndex }) : autoCastMacosVoice({ outputLanguage: String(project.intake?.outputLanguage || "Vietnamese"), character: storyCharacter, characterIndex, catalog, timestamp: now() })
  };
}

function createCharacterMaterializer({ getState, execFileSync, parseMacosVoiceCatalog, autoCastMacosVoice, upgradeAutoCastMacosProfile, now, id }) {
  let macosVoiceCatalog;
  const voices = () => {
    if (macosVoiceCatalog) return macosVoiceCatalog;
    try { macosVoiceCatalog = parseMacosVoiceCatalog(execFileSync("/usr/bin/say", ["-v", "?"], { encoding: "utf8", timeout: 5_000 })); }
    catch { macosVoiceCatalog = []; }
    return macosVoiceCatalog;
  };
  return (project) => {
    const state = getState();
    const storyCharacters = Array.isArray(project.storyDocument?.characters) ? project.storyDocument.characters : [];
    let changed = 0;
    storyCharacters.filter(isVisualCharacter).forEach((storyCharacter, characterIndex) => {
      const nextName = String(storyCharacter.name || "Character").trim() || "Character";
      const existingCharacter = state.characters.find((item) => item.projectId === project.id && String(item.name || "").trim().toLowerCase() === nextName.toLowerCase());
      const patch = characterPatchForStory({ project, storyCharacter, existingCharacter, characterIndex, catalog: voices(), autoCastMacosVoice, upgradeAutoCastMacosProfile, now });
      if (existingCharacter) {
        if (Object.entries(patch).some(([key, value]) => existingCharacter[key] !== value)) { Object.assign(existingCharacter, patch, { updatedAt: now() }); changed++; }
      } else {
        state.characters.push({ id: id("character"), projectId: project.id, ...patch, face: "", referenceAssetIds: [], negativeTraits: "Do not borrow identity from another project.", updatedAt: now() });
        changed++;
      }
    });
    return changed;
  };
}

function readShotBreakdownState(state, project) {
  const scenes = state.scenes.filter((scene) => scene.projectId === project.id);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const shots = state.shots.filter((shot) => sceneIds.has(shot.sceneId)).sort((left, right) => left.order - right.order);
  const packets = state.jobs.filter((job) => job.projectId === project.id && job.status === "approved" && job.input?.bridgeMessage?.task === "shot_breakdown");
  const expectedShotCount = Math.max(0, ...packets.map((job) => Number(job.input?.bridgeMessage?.settings?.projectShotCount || 0)));
  return { scenes, shots, packets, expectedShotCount };
}

function shotBreakdownDurations(packets) {
  const result = new Map();
  for (const packet of packets) {
    const start = Number(packet.input?.bridgeMessage?.settings?.shotOrderStart || 0);
    (packet.input?.bridgeMessage?.settings?.shotDurationsSec || []).forEach((duration, index) => result.set(start + index, Number(duration)));
  }
  return result;
}

function shotBreakdownShapeIsReady({ scenes, shots, expectedShotCount }) {
  return !scenes.some((scene) => !shots.some((shot) => shot.sceneId === scene.id)) && expectedShotCount > 0 && shots.length === expectedShotCount && !shots.some((shot, index) => shot.order !== index + 1);
}

function createShotBreakdownReconciler({ getState, validateSequenceContracts, logEvent, now }) {
  return (project) => {
    if (!project?.storyDocument?.screenplayApprovedAt || project.storyDocument.shotBreakdownApprovedAt) return false;
    const snapshot = readShotBreakdownState(getState(), project);
    if (!shotBreakdownShapeIsReady(snapshot)) return false;
    const approved = shotBreakdownDurations(snapshot.packets);
    if (snapshot.shots.some((shot) => approved.get(shot.order) !== Number(shot.durationSec))) return false;
    project.storyDocument.sequenceQA = validateSequenceContracts({ scenes: snapshot.scenes, screenplayScenes: project.storyDocument.screenplayScenes || [], shots: snapshot.shots, narrativeContract: project.storyDocument.narrativeContract });
    if (project.storyDocument.sequenceQA.status === "BLOCKED") return false;
    project.storyDocument.shotBreakdownApprovedAt = now(); project.updatedAt = now();
    logEvent("shot_breakdown_reconciled", { projectId: project.id, shotCount: snapshot.shots.length, providerRuntimeSec: snapshot.shots.reduce((sum, shot) => sum + Number(shot.durationSec || 0), 0), targetRuntimeSec: Number(project.intake?.targetDurationSec || 0) });
    return true;
  };
}

const { isSavedChatGptConversationUrl } = require("../../../../packages/domain/src/conversation-url.cjs");

module.exports = { createCharacterMaterializer, createShotBreakdownReconciler, isSavedChatGptConversationUrl };
