import type { Character, CharacterIdentityContract, StoryCharacter, VisualReference } from "@studio/types";

function clean(value: string | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text && !/^(?:to be designed|to be defined)$/i.test(text) ? text : "";
}

export function visualStyleInstruction(style: string) {
  return ({
    realistic: "Realistic live-action photographic rendering with natural anatomy, believable fabric, skin, and lighting.",
    "3d_cartoon": "Polished 3D animated character rendering with consistent proportions, clean forms, and controlled studio lighting.",
    anime: "Anime-inspired character rendering with stable facial features, readable outfit shapes, and controlled line detail.",
    stop_motion: "Handmade stop-motion miniature rendering with tactile materials, subtle imperfections, and a readable silhouette.",
    flat_illustration: "Flat editorial illustration with simple shapes, restrained texture, and a consistent palette."
  } as Record<string, string>)[style] || clean(style) || "Realistic live-action photographic rendering with natural anatomy and readable neutral lighting.";
}

export function buildCharacterIdentityContract(args: {
  name: string;
  role: string;
  storyCharacter?: StoryCharacter;
  character: Character;
  appearance?: string;
  visualStyle: string;
  sourceReference?: VisualReference;
}): CharacterIdentityContract {
  const locked = args.sourceReference?.identityContract;
  if (locked) return locked;
  return {
    schemaVersion: "1.0",
    name: clean(args.name) || "Active character",
    role: clean(args.role) || "Character",
    storyFunction: clean(args.storyCharacter?.storyFunction),
    appearance: clean(args.appearance) || clean(args.storyCharacter?.visualBrief) || clean(args.character.visualDescription),
    outfit: clean(args.character.outfit),
    personality: clean(args.character.personality),
    visualStyle: visualStyleInstruction(args.visualStyle),
    continuity: clean(args.character.consistencyNotes)
  };
}

export function formatCharacterIdentityContract(contract: CharacterIdentityContract) {
  const scalar = (value: string) => JSON.stringify(String(value || "").replace(/\s+/g, " ").trim());
  return [
    "The YAML contract below is the single source of truth. Each value belongs only to its named field; narrative fields must not alter visible design fields.",
    "```yaml",
    "character_identity:",
    `  schema_version: ${scalar(contract.schemaVersion)}`,
    `  name: ${scalar(contract.name)}`,
    `  story_role: ${scalar(contract.role)}`,
    `  story_function: ${scalar(contract.storyFunction)}`,
    `  visible_appearance: ${scalar(contract.appearance)}`,
    `  locked_outfit: ${scalar(contract.outfit)}`,
    `  personality_performance: ${scalar(contract.personality)}`,
    `  rendering_style: ${scalar(contract.visualStyle)}`,
    `  continuity: ${scalar(contract.continuity)}`,
    "```"
  ].join("\n");
}
