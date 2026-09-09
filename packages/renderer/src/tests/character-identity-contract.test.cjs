const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const contractPromise = import(pathToFileURL(path.resolve(__dirname, "../../../workflow/src/character-identity-contract.ts")));
const supportPromise = import(pathToFileURL(path.resolve(__dirname, "../../../workflow/src/support-core.ts")));
const fs = require("node:fs");

function character(overrides = {}) {
  return {
    id: "character_1", projectId: "project_1", name: "Chị Cả", role: "main",
    visualDescription: "Vietnamese woman in her thirties with an oval face", outfit: "Ivory blouse and black trousers",
    face: "", referenceAssetIds: [], personality: "Restrained, decisive", consistencyNotes: "Keep face, outfit and proportions unchanged.",
    ...overrides
  };
}

test("character contract keeps story, appearance, outfit and performance in separate fields", async () => {
  const { buildCharacterIdentityContract, formatCharacterIdentityContract } = await contractPromise;
  const contract = buildCharacterIdentityContract({
    name: "Chị Cả", role: "main", character: character(), visualStyle: "realistic",
    appearance: "Vietnamese woman in her thirties with an oval face",
    storyCharacter: { name: "Chị Cả", role: "main", storyFunction: "Ends the inheritance dispute", visualBrief: "Vietnamese woman in her thirties", required: true }
  });
  assert.equal(contract.storyFunction, "Ends the inheritance dispute");
  assert.equal(contract.appearance, "Vietnamese woman in her thirties with an oval face");
  assert.equal(contract.outfit, "Ivory blouse and black trousers");
  assert.equal(contract.personality, "Restrained, decisive");
  const yaml = formatCharacterIdentityContract(contract);
  assert.match(yaml, /```yaml/);
  assert.match(yaml, /story_function: "Ends the inheritance dispute"/);
  assert.match(yaml, /locked_outfit: "Ivory blouse and black trousers"/);
  assert.doesNotMatch(yaml, /locked_outfit: "Ends the inheritance dispute"/);
});

test("detail generation inherits the approved identity contract", async () => {
  const { buildCharacterIdentityContract } = await contractPromise;
  const locked = buildCharacterIdentityContract({ name: "Mai", role: "main", character: character({ name: "Mai" }), appearance: "Short hair", visualStyle: "realistic" });
  const inherited = buildCharacterIdentityContract({
    name: "Mai", role: "main", character: character({ name: "Mai", outfit: "conflicting costume" }),
    appearance: "conflicting appearance", visualStyle: "3d_cartoon",
    sourceReference: { id: "ref_1", projectId: "project_1", name: "Mai", role: "main_character", filePath: "/ref.png", sourceDescription: "", transformationRequest: "", identityContract: locked, createdAt: new Date().toISOString() }
  });
  assert.deepEqual(inherited, locked);
});

test("same ChatGPT conversation does not upload the approved image again", async () => {
  const { referencesMissingFromConversation } = await supportPromise;
  const conversationUrl = "https://chatgpt.com/c/conversation-1";
  const reference = { id: "ref_1", projectId: "project_1", name: "Mai", role: "main_character", filePath: "/ref.png", sourceDescription: "", transformationRequest: "", providerConversationUrl: conversationUrl, createdAt: new Date().toISOString() };
  assert.deepEqual(referencesMissingFromConversation([{ assetId: reference.id, filePath: reference.filePath }], conversationUrl, [], [], [reference]), []);
  assert.equal(referencesMissingFromConversation([{ assetId: reference.id, filePath: reference.filePath }], "https://chatgpt.com/c/other", [], [], [reference]).length, 1);
});

test("structured ChatGPT streaming cannot complete on a balanced nested object", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../extension-providers/src/chatgpt/structured-recovery.ts"), "utf8");
  assert.match(source, /Object\.hasOwn\(structuredTaskValidators, task\)\) return false/);
});

test("foundation prompt source keeps the bounded YAML task contract and JSON schema", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../workflow/src/story-foundation-prompts.ts"), "utf8");
  assert.match(source, /TASK_CONTRACT_YAML:/);
  assert.match(source, /format: minified_json/);
  assert.match(source, /6,000 UTF-8 bytes/);
  assert.match(source, /exactly 3 beats for projects up to 90 seconds/);
  assert.match(source, /sourceAnalysis/);
});
